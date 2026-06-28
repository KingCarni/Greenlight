import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Image, ScrollView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';

const REPLICATE_TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;
// Depth Anything V2 on Replicate
const REPLICATE_MODEL = 'https://api.replicate.com/v1/models/depth-anything/depth-anything-v2/predictions';

interface ProjectOption {
  id: string;
  name: string;
}

export default function ScannerScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzingDepth, setAnalyzingDepth] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [depthMapUri, setDepthMapUri] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState('');
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  async function fetchProjects() {
    if (!user) {
      setProjects([]);
      setSelectedProject(null);
      return;
    }
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching scanner projects:', error.message);
      return;
    }
    const rows = (data ?? []) as ProjectOption[];
    setProjects(rows);
    setSelectedProject((current) => {
      if (current && rows.some((p) => p.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }

  useEffect(() => { fetchProjects(); }, [user]);
  useFocusEffect(useCallback(() => { fetchProjects(); }, [user]));

  async function handleCapture() {
    if (!cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setDepthMapUri(null);
        setModalVisible(true);
      }
    } catch {
      Alert.alert('Error', 'Could not capture photo.');
    } finally {
      setCapturing(false);
    }
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setDepthMapUri(null);
      setModalVisible(true);
    }
  }

  async function handleAnalyseDepth() {
    if (!capturedUri) return;
    setAnalyzingDepth(true);
    try {
      // Step 1: Upload resized image to Supabase temp storage so Replicate can fetch it via URL
      const resized = await ImageManipulator.manipulateAsync(
        capturedUri,
        [{ resize: { width: 640 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const imageResponse = await fetch(resized.uri);
      const imageBlob = await imageResponse.blob();
      const arrayBuffer = await new Response(imageBlob).arrayBuffer();

      const tempFilename = `depth-temp/${user!.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('scene-photos')
        .upload(tempFilename, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('scene-photos')
        .getPublicUrl(tempFilename);

      const imageUrl = urlData.publicUrl;
      console.log('Sending to Replicate:', imageUrl);

      // Step 2: Start Replicate prediction
      const startResponse = await fetch(REPLICATE_MODEL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            image: imageUrl,
            model_size: 'Small',
          },
        }),
      });

      if (!startResponse.ok) {
        const text = await startResponse.text();
        throw new Error(`Replicate error: ${startResponse.status} — ${text}`);
      }

      const prediction = await startResponse.json();
      console.log('Prediction status:', prediction.status);

      // With Prefer: wait, Replicate returns the completed result immediately (up to 60s)
      // If it times out, we need to poll
      let result = prediction;
      if (result.status !== 'succeeded') {
        // Poll until done
        const pollUrl = result.urls?.get;
        if (!pollUrl) throw new Error('No poll URL returned.');

        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const pollResponse = await fetch(pollUrl, {
            headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` },
          });
          result = await pollResponse.json();
          console.log('Poll status:', result.status);
          if (result.status === 'succeeded' || result.status === 'failed') break;
        }
      }

      if (result.status !== 'succeeded') {
        throw new Error(`Depth estimation failed: ${result.error || result.status}`);
      }

      // Output is a URL to the depth map image
      const depthUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      if (!depthUrl) throw new Error('No depth map in response.');

      console.log('Depth map URL:', depthUrl);
      setDepthMapUri(depthUrl);

    } catch (e: any) {
      console.log('DEPTH ERROR:', e.message);
      Alert.alert('Depth Analysis Failed', e.message || 'Could not generate depth map.');
    } finally {
      setAnalyzingDepth(false);
    }
  }

  async function handleCreateScene() {
    if (!capturedUri || !sceneName.trim() || !selectedProject || !user) {
      Alert.alert('Required', 'Please enter a scene name.');
      return;
    }
    setUploading(true);
    try {
      const filename = `${user.id}/${Date.now()}.jpg`;
      const response = await fetch(capturedUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('scene-photos')
        .upload(filename, arrayBuffer, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('scene-photos')
        .getPublicUrl(filename);

      let depthMapStorageUrl: string | null = null;
      if (depthMapUri) {
        const depthFilename = `${user.id}/${Date.now()}_depth.png`;
        const depthResponse = await fetch(depthMapUri);
        const depthBlob = await depthResponse.blob();
        const depthBuffer = await new Response(depthBlob).arrayBuffer();

        const { error: depthUploadError } = await supabase.storage
          .from('scene-photos')
          .upload(depthFilename, depthBuffer, { contentType: 'image/png' });

        if (!depthUploadError) {
          const { data: depthUrlData } = supabase.storage
            .from('scene-photos')
            .getPublicUrl(depthFilename);
          depthMapStorageUrl = depthUrlData.publicUrl;
        }
      }

      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: selectedProject,
          name: sceneName.trim(),
          canvas_photo_url: urlData.publicUrl,
          depth_map_url: depthMapStorageUrl,
          created_by: user.id,
          status: 'planning',
        })
        .select()
        .single();

      if (sceneError) throw sceneError;

      setModalVisible(false);
      setSceneName('');
      setCapturedUri(null);
      setDepthMapUri(null);

      router.push({ pathname: '/scene/[id]', params: { id: scene.id } });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create scene.');
    } finally {
      setUploading(false);
    }
  }

  if (projects.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Create or join a project first{`\n`}before scanning a room.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/projects')}>
          <Text style={styles.buttonText}>Go to Projects</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Camera access is needed{`\n`}to scan rooms.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickImage}>
          <Text style={styles.secondaryButtonText}>Upload from Gallery Instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Text style={styles.title}>Room Scanner</Text>
          </View>
          <View style={styles.bottomControls}>
            <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
              <Ionicons name="images-outline" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
              onPress={handleCapture}
              disabled={capturing}
            >
              {capturing ? <ActivityIndicator color="#000" /> : <View style={styles.captureInner} />}
            </TouchableOpacity>
            <View style={styles.galleryButton} />
          </View>
        </View>
      </CameraView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Save Room Scan</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {capturedUri && (
                <Image source={{ uri: capturedUri }} style={styles.previewImage} resizeMode="cover" />
              )}

              <TouchableOpacity
                style={[styles.depthButton, analyzingDepth && styles.depthButtonDisabled]}
                onPress={handleAnalyseDepth}
                disabled={analyzingDepth}
              >
                {analyzingDepth ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Ionicons name="scan-outline" size={18} color={Colors.primary} />
                )}
                <Text style={styles.depthButtonText}>
                  {analyzingDepth ? 'Analysing Depth...' : depthMapUri ? 'Re-analyse Depth' : 'Analyse Depth'}
                </Text>
              </TouchableOpacity>

              {depthMapUri && (
                <View style={styles.depthPreview}>
                  <Text style={styles.depthLabel}>Depth Map</Text>
                  <Image source={{ uri: depthMapUri }} style={styles.previewImage} resizeMode="cover" />
                </View>
              )}

              <Text style={styles.label}>Scene / Room Name</Text>
              <TextInput
                style={styles.input}
                value={sceneName}
                onChangeText={setSceneName}
                placeholder="e.g. Living Room - Before"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Production</Text>
              <View style={styles.projectList}>
                {projects.map((project) => (
                  <TouchableOpacity
                    key={project.id}
                    style={[styles.projectChip, selectedProject === project.id && styles.projectChipActive]}
                    onPress={() => setSelectedProject(project.id)}
                  >
                    <Text style={[styles.projectChipText, selectedProject === project.id && styles.projectChipTextActive]}>
                      {project.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveButton, uploading && styles.saveButtonDisabled]}
                onPress={handleCreateScene}
                disabled={uploading}
              >
                {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveButtonText}>Save & Open Scene</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: { paddingTop: 60, paddingHorizontal: Spacing.lg },
  title: { color: '#fff', fontSize: Typography.fontSize2xl, fontWeight: Typography.fontWeightBold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  bottomControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 40, paddingHorizontal: Spacing.xl },
  captureButton: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: Colors.primary },
  captureButtonDisabled: { opacity: 0.6 },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: Colors.primary },
  galleryButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeMd, textAlign: 'center', lineHeight: 24, marginTop: Spacing.md, marginBottom: Spacing.lg },
  button: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 4 },
  buttonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  secondaryButton: { marginTop: Spacing.md, padding: Spacing.md },
  secondaryButtonText: { color: Colors.primary, fontSize: Typography.fontSizeSm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  modalTitle: { color: Colors.textPrimary, fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold },
  previewImage: { width: '100%', height: 180, borderRadius: Radius.md, marginBottom: Spacing.md },
  depthButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, marginBottom: Spacing.md },
  depthButtonDisabled: { opacity: 0.6 },
  depthButtonText: { color: Colors.primary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  depthPreview: { marginBottom: Spacing.md },
  depthLabel: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.xs },
  label: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.xs, marginTop: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.md, color: Colors.textPrimary, fontSize: Typography.fontSizeMd, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md },
  projectList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  projectChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  projectChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  projectChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  projectChipTextActive: { color: '#000', fontWeight: Typography.fontWeightSemibold },
  saveButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm + 4, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
});
