import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Modal, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Project } from '@/types';

const STATUS_LABELS: Record<Project['status'], string> = {
  development: 'Development',
  pre_production: 'Pre-Production',
  production: 'Production',
  post_production: 'Post-Production',
  completed: 'Completed',
};

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New project form state
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Fetch projects for current user ──────────────────────────
  async function fetchProjects() {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error.message);
    } else {
      setProjects(data as Project[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
  }, [user]);

  // ── Create new project ────────────────────────────────────────
  async function handleCreateProject() {
    if (!newTitle.trim()) {
      Alert.alert('Project name required', 'Please enter a name for your production.');
      return;
    }
    if (!user) return;

    setCreating(true);

    // Insert project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: newTitle.trim(),
        description: newDescription.trim() || null,
        owner_id: user.id,
      })
      .select()
      .single();

    if (projectError || !project) {
      console.error('Error creating project:', projectError?.message);
      Alert.alert('Error', 'Could not create project. Please try again.');
      setCreating(false);
      return;
    }

    // Auto-add creator as owner in project_members
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: user.id,
        role: 'owner',
      });

    if (memberError) {
      console.error('Error adding project member:', memberError.message);
    }

    // Reset form and close modal
    setNewTitle('');
    setNewGenre('');
    setNewDescription('');
    setModalVisible(false);
    setCreating(false);

    // Refresh list
    fetchProjects();
  }

  async function deleteProjectRecords(projectId: string) {
    if (!user) throw new Error('You must be signed in to delete a production.');

    const { data: sceneRows, error: scenesFetchError } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (scenesFetchError) throw scenesFetchError;

    const sceneIds = (sceneRows ?? []).map((scene) => scene.id);

    if (sceneIds.length > 0) {
      const sceneScopedDeletes = [
        supabase.from('scene_assets').delete().in('scene_id', sceneIds),
        supabase.from('annotations').delete().in('scene_id', sceneIds),
        supabase.from('comments').delete().in('scene_id', sceneIds),
        supabase.from('scene_snapshots').delete().in('scene_id', sceneIds),
      ];

      for (const deleteCall of sceneScopedDeletes) {
        const { error } = await deleteCall;
        if (error) throw error;
      }
    }

    const projectScopedDeletes = [
      supabase.from('inventory').delete().eq('project_id', projectId),
      supabase.from('assets').delete().eq('project_id', projectId),
      supabase.from('project_locations').delete().eq('project_id', projectId),
      supabase.from('scenes').delete().eq('project_id', projectId),
      supabase.from('project_members').delete().eq('project_id', projectId),
    ];

    for (const deleteCall of projectScopedDeletes) {
      const { error } = await deleteCall;
      if (error) throw error;
    }

    const { data: deletedProject, error: projectDeleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('owner_id', user.id)
      .select('id')
      .maybeSingle();

    if (projectDeleteError) throw projectDeleteError;
    if (!deletedProject) throw new Error('Could not delete this production. It may have already been removed or you may not have permission.');
  }

  function confirmDeleteProject(project: Project) {
    Alert.alert(
      'Delete production?',
      `Delete "${project.name}" and all related scenes, assets, and room scans? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingId(project.id);
              await deleteProjectRecords(project.id);
              setProjects((prev) => prev.filter((item) => item.id !== project.id));
            } catch (error: any) {
              console.error('Error deleting project:', error?.message ?? error);
              Alert.alert('Error', error?.message || 'Could not delete this production.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Project list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={fetchProjects}
          refreshing={loading}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/project/[id]', params: { id: item.id } })}
              disabled={deletingId === item.id}
            >
              <View style={styles.cardThumbnail}>
                <Ionicons name="film" size={32} color={Colors.primary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.description && (
                  <Text style={styles.cardGenre} numberOfLines={1}>{item.description}</Text>
                )}
                <Text style={styles.cardStatus}>Active</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDeleteProject(item)}
                disabled={deletingId === item.id}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                {deletingId === item.id ? (
                  <ActivityIndicator size="small" color="#ff6b6b" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
                )}
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No projects yet.{'\n'}Tap + to create your first production.</Text>
            </View>
          }
        />
      )}

      {/* New Project Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Production</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Production name *"
              placeholderTextColor={Colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Genre (optional)"
              placeholderTextColor={Colors.textMuted}
              value={newGenre}
              onChangeText={setNewGenre}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.textMuted}
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreateProject}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.createButtonText}>Create Production</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: Typography.fontSize2xl, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  addButton: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  cardThumbnail: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  cardGenre: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginTop: 2 },
  cardStatus: { fontSize: Typography.fontSizeXs, color: Colors.primary, marginTop: 4 },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
  },
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
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
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  createButtonDisabled: { opacity: 0.6 },
  createButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
});