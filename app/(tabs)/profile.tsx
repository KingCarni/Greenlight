import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user?.id;
  const email = session?.user?.email ?? '';

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ROLES = [
    'set_decorator', 'art_director', 'prop_master',
    'director', 'producer', 'crew', 'admin',
  ];

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      setFullName(data?.full_name ?? '');
      setRole(data?.role ?? '');
    } catch (err: any) {
      Alert.alert('Error loading profile', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fullName.trim(),
          role,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const initials = fullName
    ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : email[0]?.toUpperCase() ?? '?';

  const roleLabel = (r: string) =>
    r.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 60 }} color="#22c55e" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        {!editing ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.editBtn}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={[styles.editBtn, styles.saveBtn, saving && { opacity: 0.4 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {fullName ? <Text style={styles.displayName}>{fullName}</Text> : null}
          <Text style={styles.emailText}>{email}</Text>
        </View>

        {/* Profile fields */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT INFO</Text>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor="#555"
              />
            ) : (
              <Text style={styles.fieldValue}>{fullName || '—'}</Text>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Email</Text>
            <Text style={styles.fieldValue}>{email}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Role</Text>
            {editing ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={styles.chipRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, role === r && styles.chipActive]}
                      onPress={() => setRole(r)}
                    >
                      <Text style={[styles.chipText, role === r && styles.chipTextActive]}>
                        {roleLabel(r)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.fieldValue}>{role ? roleLabel(role) : '—'}</Text>
            )}
          </View>
        </View>

        {/* Coming soon sections */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TEAMS</Text>
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonText}>Team management coming soon</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonText}>Notifications, preferences coming soon</Text>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  editBtn: { color: '#888', fontSize: 16 },
  saveBtn: { color: '#22c55e', fontWeight: '700' },

  scroll: { padding: 20 },

  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#000', fontSize: 28, fontWeight: '700' },
  displayName: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  emailText: { color: '#666', fontSize: 14 },

  section: {
    backgroundColor: '#111', borderRadius: 14,
    borderWidth: 1, borderColor: '#1e1e1e',
    paddingHorizontal: 16, paddingVertical: 8,
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#444', fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    paddingVertical: 10,
  },
  field: { paddingVertical: 12 },
  fieldLabel: { color: '#666', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  fieldValue: { color: '#fff', fontSize: 15 },
  divider: { height: 1, backgroundColor: '#1a1a1a' },

  input: {
    backgroundColor: '#1a1a1a', color: '#fff',
    borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, marginTop: 4,
  },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
  },
  chipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#000' },

  comingSoon: { paddingVertical: 14, alignItems: 'center' },
  comingSoonText: { color: '#333', fontSize: 13 },

  signOutBtn: {
    backgroundColor: '#1a0a0a', borderWidth: 1, borderColor: '#3f1a1a',
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
});
