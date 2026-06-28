import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
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

interface ProjectMember {
  user_id: string;
  role: string;
  profiles: { full_name: string | null; }[] | null;
}

interface JoinCode {
  id: string;
  code: string;
  role: string;
  is_active: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  planning: Colors.textMuted,
  approved: '#4CAF50',
  in_progress: '#FF9800',
  complete: Colors.primary,
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
  set_decorator: 'Set Decorator',
  art_director: 'Art Director',
  prop_master: 'Props',
  producer: 'Producer',
};

const CODE_ROLES = ['viewer', 'editor', 'set_decorator', 'art_director', 'prop_master', 'producer'];

// Generate a random 8-char uppercase code
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);

  // Team
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [joinCodes, setJoinCodes] = useState<JoinCode[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [teamExpanded, setTeamExpanded] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [newCodeRole, setNewCodeRole] = useState('viewer');
  const [generatingCode, setGeneratingCode] = useState(false);

  // New scene form
  const [sceneName, setSceneName] = useState('');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchProject(); }, [id]);

  useFocusEffect(
    useCallback(() => { fetchScenes(); }, [id])
  );

  useEffect(() => {
    if (id) { fetchMembers(); fetchJoinCodes(); }
  }, [id]);

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

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('project_members')
      .select('user_id, role, profiles!project_members_user_id_fkey(full_name)')
      .eq('project_id', id);
    if (error) { console.error(error.message); return; }
    setMembers((data || []) as ProjectMember[]);
    const me = (data || []).find((m: any) => m.user_id === user?.id);
    setIsOwner(me?.role === 'owner');
  }

  async function fetchJoinCodes() {
    const { data, error } = await supabase
      .from('project_join_codes')
      .select('*')
      .eq('project_id', id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (!error) setJoinCodes((data || []) as JoinCode[]);
  }

  async function handleGenerateCode() {
    if (!user) return;
    setGeneratingCode(true);
    try {
      const code = generateCode();
      const { error } = await supabase.from('project_join_codes').insert({
        project_id: id,
        code,
        role: newCodeRole,
        created_by: user.id,
        is_active: true,
      });
      if (error) throw error;
      setShowCodeModal(false);
      fetchJoinCodes();
      // Copy to clipboard immediately
      await Clipboard.setStringAsync(code);
      Alert.alert('Code generated!', `Code "${code}" copied to clipboard. Share it with your team.`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function revokeCode(codeId: string) {
    Alert.alert('Revoke code?', 'This code will no longer work for joining.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('project_join_codes')
            .update({ is_active: false })
            .eq('id', codeId);
          if (error) Alert.alert('Error', error.message);
          else fetchJoinCodes();
        },
      },
    ]);
  }

  async function copyCode(code: string) {
    await Clipboard.setStringAsync(code);
    Alert.alert('Copied!', `Code "${code}" copied to clipboard.`);
  }

  // ─── Scene handlers (unchanged) ────────────────────────────────────────────

  async function handleTakePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) setCapturedUri(result.assets[0].uri);
  }

  async function handlePickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) setCapturedUri(result.assets[0].uri);
  }

  async function handleCreateScene() {
    if (!sceneName.trim()) { Alert.alert('Required', 'Please enter a scene name.'); return; }
    if (!user) return;
    setCreating(true);
    try {
      let canvas_photo_url = null;
      if (capturedUri) {
        const filename = `${user.id}/${Date.now()}.jpg`;
        const response = await fetch(capturedUri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from('scene-photos').upload(filename, arrayBuffer, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('scene-photos').getPublicUrl(filename);
        canvas_photo_url = urlData.publicUrl;
      }
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .insert({ project_id: id, name: sceneName.trim(), canvas_photo_url, created_by: user.id, status: 'planning' })
        .select().single();
      if (sceneError) throw sceneError;
      setSceneName(''); setCapturedUri(null); setModalVisible(false);
      router.push({ pathname: '/scene/[id]', params: { id: scene.id } });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create scene.');
    } finally {
      setCreating(false);
    }
  }

  async function deleteSceneRecords(sceneId: string) {
    const cleanupSteps = [
      supabase.from('scene_assets').delete().eq('scene_id', sceneId),
      supabase.from('annotations').delete().eq('scene_id', sceneId),
      supabase.from('comments').delete().eq('scene_id', sceneId),
      supabase.from('scene_snapshots').delete().eq('scene_id', sceneId),
    ];
    for (const step of cleanupSteps) {
      const { error } = await step;
      if (error) throw error;
    }
    const { error } = await supabase.from('scenes').delete().eq('id', sceneId).eq('project_id', id);
    if (error) throw error;
  }

  function confirmDeleteScene(scene: Scene) {
    Alert.alert('Delete scene?', `Delete "${scene.name}" and its placed assets? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            setDeletingSceneId(scene.id);
            await deleteSceneRecords(scene.id);
            setScenes(prev => prev.filter(item => item.id !== scene.id));
          } catch (error: any) {
            Alert.alert('Error', error?.message || 'Could not delete this scene.');
          } finally {
            setDeletingSceneId(null);
          }
        },
      },
    ]);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{project?.name ?? 'Project'}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── Scenes ── */}
        <Text style={styles.sectionLabel}>Scenes</Text>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : scenes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No scenes yet.{'\n'}Tap + to add your first scene.</Text>
          </View>
        ) : (
          scenes.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { marginHorizontal: Spacing.md, marginBottom: Spacing.sm }]}
              onPress={() => router.push({ pathname: '/scene/[id]', params: { id: item.id } })}
              disabled={deletingSceneId === item.id}
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
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => confirmDeleteScene(item)}
                disabled={deletingSceneId === item.id}
                hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              >
                {deletingSceneId === item.id
                  ? <ActivityIndicator size="small" color="#ff6b6b" />
                  : <Ionicons name="trash-outline" size={18} color="#ff6b6b" />}
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ))
        )}

        {/* ── Team ── */}
        <TouchableOpacity
          style={styles.teamHeader}
          onPress={() => setTeamExpanded(e => !e)}
        >
          <Text style={styles.sectionLabel}>Team</Text>
          <Ionicons
            name={teamExpanded ? 'chevron-up' : 'chevron-down'}
            size={16} color={Colors.textMuted}
          />
        </TouchableOpacity>

        {teamExpanded && (
          <View style={styles.teamSection}>
            {/* Members */}
            {members.length > 0 && (
              <View style={styles.memberList}>
                {members.map(m => {
                  const memberName = m.profiles?.[0]?.full_name ?? 'Unknown';
                  return (
                    <View key={m.user_id} style={styles.memberRow}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {(memberName === 'Unknown' ? '?' : memberName)[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.memberName}>
                        {memberName}
                        {m.user_id === user?.id ? ' (you)' : ''}
                      </Text>
                      <View style={styles.roleBadge}>
                        <Text style={styles.roleBadgeText}>{ROLE_LABELS[m.role] ?? m.role}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Active join codes — owner only */}
            {isOwner && (
              <>
                <View style={styles.codeHeader}>
                  <Text style={styles.codeHeaderLabel}>Join Codes</Text>
                  <TouchableOpacity style={styles.generateBtn} onPress={() => setShowCodeModal(true)}>
                    <Ionicons name="add" size={14} color="#000" />
                    <Text style={styles.generateBtnText}>Generate</Text>
                  </TouchableOpacity>
                </View>

                {joinCodes.length === 0 ? (
                  <Text style={styles.noCodesText}>No active codes. Generate one to invite team members.</Text>
                ) : (
                  joinCodes.map(jc => (
                    <View key={jc.id} style={styles.codeRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.codeText}>{jc.code}</Text>
                        <Text style={styles.codeMeta}>
                          {ROLE_LABELS[jc.role] ?? jc.role}
                          {jc.use_count > 0 ? `  ·  Used ${jc.use_count}x` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.codeActionBtn} onPress={() => copyCode(jc.code)}>
                        <Ionicons name="copy-outline" size={16} color={Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.codeActionBtn} onPress={() => revokeCode(jc.id)}>
                        <Ionicons name="close-circle-outline" size={16} color="#ff6b6b" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── New Scene Modal ── */}
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
                : <Text style={styles.createButtonText}>Create Scene</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Generate Code Modal ── */}
      <Modal visible={showCodeModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate Join Code</Text>
              <TouchableOpacity onPress={() => setShowCodeModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Role for this code</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {CODE_ROLES.map(r => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleChip, newCodeRole === r && styles.roleChipActive]}
                    onPress={() => setNewCodeRole(r)}
                  >
                    <Text style={[styles.roleChipText, newCodeRole === r && styles.roleChipTextActive]}>
                      {ROLE_LABELS[r] ?? r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.codeNote}>
              Anyone with this code can join this production as {ROLE_LABELS[newCodeRole] ?? newCodeRole}.
              The code is copied to your clipboard after generation.
            </Text>

            <TouchableOpacity
              style={[styles.createButton, generatingCode && { opacity: 0.6 }]}
              onPress={handleGenerateCode}
              disabled={generatingCode}
            >
              {generatingCode
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.createButtonText}>Generate & Copy Code</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  title: { flex: 1, fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  addButton: {
    backgroundColor: Colors.primary, width: 36, height: 36,
    borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: Typography.fontSizeXs, color: Colors.textMuted,
    paddingHorizontal: Spacing.md, marginBottom: Spacing.sm,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.surfaceBorder, padding: Spacing.md,
    ...Shadows.card,
  },
  sceneNumber: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.primaryMuted, alignItems: 'center',
    justifyContent: 'center', marginRight: Spacing.md,
  },
  sceneNumberText: { color: Colors.primary, fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  cardStatus: { fontSize: Typography.fontSizeXs, marginTop: 2, textTransform: 'capitalize' },
  deleteButton: { width: 36, height: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center', lineHeight: 22 },

  // Team section
  teamHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, marginTop: Spacing.xl, marginBottom: Spacing.sm,
  },
  teamSection: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg, borderWidth: 1,
    borderColor: Colors.surfaceBorder, padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  memberList: { marginBottom: Spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.xs, gap: Spacing.sm },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.primaryMuted, alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { color: Colors.primary, fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  memberName: { flex: 1, color: Colors.textPrimary, fontSize: Typography.fontSizeSm },
  roleBadge: {
    backgroundColor: Colors.surface, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  roleBadgeText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },

  // Join codes
  codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  codeHeaderLabel: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textTransform: 'uppercase', letterSpacing: 1 },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
  },
  generateBtnText: { color: '#000', fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold },
  noCodesText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginBottom: Spacing.sm },
  codeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  codeText: { color: Colors.textPrimary, fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeMd, letterSpacing: 2 },
  codeMeta: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2 },
  codeActionBtn: { padding: Spacing.sm },

  // Generate code modal
  codeNote: {
    color: Colors.textMuted, fontSize: Typography.fontSizeSm,
    lineHeight: 20, marginBottom: Spacing.lg,
  },
  roleChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  roleChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  roleChipTextActive: { color: '#000' },

  // Modal (unchanged)
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.xl, paddingBottom: Spacing.xxl,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md, color: Colors.textPrimary,
    fontSize: Typography.fontSizeMd, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md,
  },
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  photoButtons: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  photoButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.surfaceBorder, borderRadius: Radius.md, paddingVertical: Spacing.md,
  },
  photoButtonText: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm },
  photoConfirm: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  photoConfirmText: { flex: 1, color: Colors.textSecondary, fontSize: Typography.fontSizeSm },
  createButton: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4, alignItems: 'center', marginTop: Spacing.sm,
  },
  createButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
});