import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';

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
  const [modalVisible, setModalVisible] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
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
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching scanner projects:', error.message);
      return;
    }

    const rows = (data ?? []) as ProjectOption[];
    setProjects(rows);
    setSelectedProject((current) => {
      if (current && rows.some((project) => project.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }

  // Fetch user's projects for scene assignment.
  // Also refresh on tab focus so deleted productions do not remain selected.
  useEffect(() => {
    fetchProjects();
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchProjects();
    }, [user])
  );

  // Take photo with camera
  async function handleCapture() {
    if (!cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setCapturedUri(photo.uri);
        setModalVisible(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not capture photo.');
    } finally {
      setCapturing(false);
    }
  }

  // Pick from gallery
  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
      setModalVisible(true);
    }
  }

  // Upload photo and create scene
  async function handleCreateScene() {
    if (!capturedUri || !sceneName.trim() || !selectedProject || !user) {
      Alert.alert('Required', 'Please enter a scene name.');
      return;
    }
    setUploading(true);
    try {
      // Upload photo to Supabase Storage
      const filename = `${user.id}/${Date.now()}.jpg`;
      const response = await fetch(capturedUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('scene-photos')
        .upload(filename, arrayBuffer, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('scene-photos')
        .getPublicUrl(filename);

      // Create scene record
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: selectedProject,
          name: sceneName.trim(),
          canvas_photo_url: urlData.publicUrl,
          created_by: user.id,
          status: 'planning',
        })
        .select()
        .single();

      if (sceneError) throw sceneError;

      setModalVisible(false);
      setSceneName('');
      setCapturedUri(null);

      // Navigate to the scene canvas
      router.push({ pathname: '/scene/[id]', params: { id: scene.id } });

    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create scene.');
    } finally {
      setUploading(false);
    }
  }

  // No projects yet
  if (projects.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Create a project first{'\n'}before scanning a room.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.push('/(tabs)/projects')}>
          <Text style={styles.buttonText}>Go to Projects</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Camera permission not granted
  if (!permission?.granted) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Camera access is needed{'\n'}to scan rooms.</Text>
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
      {/* Camera View */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Header overlay */}
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Room Scanner</Text>
          <Text style={styles.overlayHint}>Point at the space you want to dress</Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
            <Ionicons name="images-outline" size={26} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
            disabled={capturing}
          >
            {capturing
              ? <ActivityIndicator color="#000" />
              : <View style={styles.captureInner} />
            }
          </TouchableOpacity>

          <View style={{ width: 52 }} />
        </View>
      </CameraView>

      {/* Scene Name Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Name this Scene</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setCapturedUri(null); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Scene Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. INT. KITCHEN - DAY"
              placeholderTextColor={Colors.textMuted}
              value={sceneName}
              onChangeText={setSceneName}
              autoFocus
            />

            {projects.length > 1 && (
              <>
                <Text style={styles.label}>Production</Text>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projectOption, selectedProject === p.id && styles.projectOptionSelected]}
                    onPress={() => setSelectedProject(p.id)}
                  >
                    <Text style={[styles.projectOptionText, selectedProject === p.id && styles.projectOptionTextSelected]}>
                      {p.name}
                    </Text>
                    {selectedProject === p.id && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                ))}
              </>
            )}

            <TouchableOpacity
              style={[styles.button, uploading && { opacity: 0.6 }]}
              onPress={handleCreateScene}
              disabled={uploading}
            >
              {uploading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.buttonText}>Create Scene Canvas</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  centered: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.xl, lineHeight: 22 },
  overlay: { padding: Spacing.xl, paddingTop: Spacing.xxl + Spacing.xl, alignItems: 'center' },
  overlayTitle: { color: '#fff', fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold },
  overlayHint: { color: 'rgba(255,255,255,0.7)', fontSize: Typography.fontSizeXs, marginTop: 4 },
  controls: {
    position: 'absolute',
    bottom: Spacing.xxl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.xl,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  galleryButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  secondaryButton: { marginTop: Spacing.md, padding: Spacing.sm },
  secondaryButtonText: { color: Colors.primary, fontSize: Typography.fontSizeSm },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: Typography.fontSizeMd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    marginBottom: Spacing.md,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  projectOptionSelected: { borderWidth: 1, borderColor: Colors.primary },
  projectOptionText: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm },
  projectOptionTextSelected: { color: Colors.primary, fontWeight: Typography.fontWeightSemibold },
});