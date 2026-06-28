import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

interface CodePreview {
  codeId: string;
  projectId: string;
  projectName: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', editor: 'Editor', viewer: 'Viewer',
  set_decorator: 'Set Decorator', art_director: 'Art Director',
  prop_master: 'Props', producer: 'Producer',
};

export default function TeamsScreen() {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<CodePreview | null>(null);

  const handleLookup = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) { Alert.alert('Enter a valid code'); return; }
    setLooking(true);
    setPreview(null);
    try {
      // Find the code
      const { data: codeData, error: codeError } = await supabase
        .from('project_join_codes')
        .select('id, project_id, role, is_active, expires_at, use_count, max_uses')
        .eq('code', trimmed)
        .single();

      if (codeError || !codeData) { Alert.alert('Code not found', 'Check the code and try again.'); return; }
      if (!codeData.is_active) { Alert.alert('Code expired', 'This join code has been revoked.'); return; }
      if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
        Alert.alert('Code expired', 'This join code has expired.'); return;
      }
      if (codeData.max_uses && codeData.use_count >= codeData.max_uses) {
        Alert.alert('Code used up', 'This join code has reached its maximum uses.'); return;
      }

      // Check already a member
      const { data: existing } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', codeData.project_id)
        .eq('user_id', user?.id)
        .single();
      if (existing) { Alert.alert('Already a member', "You're already on this production's team."); return; }

      // Fetch project name
      const { data: projectData } = await supabase
        .from('projects')
        .select('name')
        .eq('id', codeData.project_id)
        .single();

      setPreview({
        codeId: codeData.id,
        projectId: codeData.project_id,
        projectName: projectData?.name ?? 'Unknown Production',
        role: codeData.role,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLooking(false);
    }
  };

  const handleJoin = async () => {
    if (!preview || !user) return;
    setJoining(true);
    try {
      // Add to project_members
      const { error: memberError } = await supabase.from('project_members').insert({
        project_id: preview.projectId,
        user_id: user.id,
        role: preview.role,
        invited_by: null,
      });
      if (memberError) throw memberError;

      // Increment use_count on the code
      await supabase
        .from('project_join_codes')
        .update({ use_count: (await supabase
          .from('project_join_codes')
          .select('use_count')
          .eq('id', preview.codeId)
          .single()
          .then(r => (r.data?.use_count ?? 0) + 1)) })
        .eq('id', preview.codeId);

      setCode('');
      setPreview(null);
      Alert.alert('Joined!', `You've joined "${preview.projectName}" as ${ROLE_LABELS[preview.role] ?? preview.role}. Open the Scene Editor to see it.`);
    } catch (err: any) {
      Alert.alert('Error joining', err.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          {/* Icon + heading */}
          <View style={styles.iconWrap}>
            <Ionicons name="people-outline" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.heading}>Join a Production</Text>
          <Text style={styles.sub}>
            Enter a team code from your production owner to join their project.
          </Text>

          {/* Code input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={v => { setCode(v.toUpperCase()); setPreview(null); }}
              placeholder="Enter team code"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
            />
            <TouchableOpacity
              style={[styles.lookupBtn, (looking || code.trim().length < 6) && { opacity: 0.5 }]}
              onPress={handleLookup}
              disabled={looking || code.trim().length < 6}
            >
              {looking
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={styles.lookupBtnText}>Look Up</Text>}
            </TouchableOpacity>
          </View>

          {/* Preview card */}
          {preview && (
            <View style={styles.previewCard}>
              <View style={styles.previewRow}>
                <Ionicons name="film-outline" size={24} color={Colors.primary} />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.previewProjectName}>{preview.projectName}</Text>
                  <Text style={styles.previewRole}>
                    You'll join as: <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeightBold }}>
                      {ROLE_LABELS[preview.role] ?? preview.role}
                    </Text>
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.joinBtn, joining && { opacity: 0.6 }]}
                onPress={handleJoin}
                disabled={joining}
              >
                {joining
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.joinBtnText}>Join Production</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setPreview(null)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Info */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.infoText}>
              Ask your production owner to generate a team code from the project's Team section.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.lg },
  heading: {
    color: Colors.textPrimary, fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold, textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  sub: {
    color: Colors.textMuted, fontSize: Typography.fontSizeSm,
    textAlign: 'center', lineHeight: 20, marginBottom: Spacing.xl,
  },
  inputRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  codeInput: {
    flex: 1, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md, color: Colors.textPrimary,
    fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4,
    letterSpacing: 2, textAlign: 'center',
  },
  lookupBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, justifyContent: 'center',
  },
  lookupBtnText: { color: '#000', fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  previewCard: {
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.card,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  previewProjectName: {
    color: Colors.textPrimary, fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightBold, marginBottom: 4,
  },
  previewRole: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm },
  joinBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4, alignItems: 'center', marginBottom: Spacing.sm,
  },
  joinBtnText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  divider: { height: 1, backgroundColor: Colors.surfaceBorder, marginVertical: Spacing.xl },
  infoRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  infoText: { flex: 1, color: Colors.textMuted, fontSize: Typography.fontSizeSm, lineHeight: 20 },
});
