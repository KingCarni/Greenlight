import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

interface Scene {
  id: string;
  name: string;
  status: string;
  canvas_photo_url: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  planning: Colors.textMuted,
  approved: '#4CAF50',
  in_progress: '#FF9800',
  complete: Colors.primary,
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // New scene form
  const [sceneName, setSceneName] = useState('');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
  fetchProject();
}, [id]);

useFocusEffect(
  useCallback(() => {
    fetchScenes();
  }, [id])
);

  async function fetchProject() {
    const { data } = await supabase
      .from('projects')
      .select('id, name, description')
      .eq('id', id)
      .single();
    if (data) setProject(data as Project);
  }

  async function fetchScenes() {
    setLoading(true);
    const { data, error } = await supabase
      .from('scenes')
      .select('id, name, status, canvas_photo_url, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching scenes:', error.message);
    else setScenes(data as Scene[]);
    setLoading(false);
  }

  async function handleTakePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
    }
  }

  async function handlePickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
    }
  }

  async function handleCreateScene() {
    if (!sceneName.trim()) {
      Alert.alert('Required', 'Please enter a scene name.');
      return;
    }
    if (!user) return;

    setCreating(true);
    try {
      let canvas_photo_url = null;

      // Upload photo if captured
      if (capturedUri) {
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

        canvas_photo_url = urlData.publicUrl;
      }

      // Create scene
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: id,
          name: sceneName.trim(),
          canvas_photo_url,
          created_by: user.id,
          status: 'planning',
        })
        .select()
        .single();

      if (sceneError) throw sceneError;

      // Reset and close
      setSceneName('');
      setCapturedUri(null);
      setModalVisible(false);

      // Navigate to scene canvas
      router.push({ pathname: '/scene/[id]', params: { id: scene.id } });

    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create scene.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {project?.name ?? 'Project'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Scenes</Text>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={scenes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={fetchScenes}
          refreshing={loading}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/scene/[id]', params: { id: item.id } })}
            >
              <View style={styles.sceneNumber}>
                <Text style={styles.sceneNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={[styles.cardStatus, { color: STATUS_COLORS[item.status] ?? Colors.textMuted }]}>
                  {item.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Text>
              </View>
              {item.canvas_photo_url && (
                <Ionicons name="image-outline" size={16} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
              )}
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No scenes yet.{'\n'}Tap + to add your first scene.</Text>
            </View>
          }
        />
      )}

      {/* New Scene Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Scene</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setCapturedUri(null); setSceneName(''); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Scene name (e.g. INT. KITCHEN - DAY) *"
              placeholderTextColor={Colors.textMuted}
              value={sceneName}
              onChangeText={setSceneName}
              autoFocus
            />

            {/* Photo options */}
            <Text style={styles.label}>Room Photo (optional)</Text>
            <View style={styles.photoButtons}>
              <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                <Ionicons name="camera-outline" size={22} color={Colors.primary} />
                <Text style={styles.photoButtonText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={handlePickPhoto}>
                <Ionicons name="images-outline" size={22} color={Colors.primary} />
                <Text style={styles.photoButtonText}>Gallery</Text>
              </TouchableOpacity>
            </View>

            {capturedUri && (
              <View style={styles.photoConfirm}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.photoConfirmText}>Photo selected</Text>
                <TouchableOpacity onPress={() => setCapturedUri(null)}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.createButton, creating && { opacity: 0.6 }]}
              onPress={handleCreateScene}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.createButtonText}>Create Scene</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  title: { flex: 1, fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  addButton: {
    backgroundColor: Colors.primary,
    width: 36, height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: Typography.fontSizeXs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  sceneNumber: {
    width: 36, height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  sceneNumberText: { color: Colors.primary, fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  cardStatus: { fontSize: Typography.fontSizeXs, marginTop: 2, textTransform: 'capitalize' },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center', lineHeight: 22 },

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
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  photoButtons: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  photoButtonText: { color: Colors.primary, fontSize: Typography.fontSizeSm },
  photoConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  photoConfirmText: { flex: 1, color: '#4CAF50', fontSize: Typography.fontSizeSm },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  createButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
});
