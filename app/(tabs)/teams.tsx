import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  FlatList, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

type TeamsTab = 'join' | 'chat' | 'notifications';

interface CodePreview {
  codeId: string;
  projectId: string;
  projectName: string;
  role: string;
}

interface TeamProject {
  id: string;
  name: string;
  role: string;
}

interface TeamMessage {
  id: string;
  project_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string | null }[] | { full_name: string | null } | null;
}

interface AppNotification {
  id: string;
  user_id: string;
  project_id: string | null;
  type: string;
  title: string;
  body: string | null;
  source_table: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', editor: 'Editor', viewer: 'Viewer',
  set_decorator: 'Set Decorator', art_director: 'Art Director',
  prop_master: 'Props', producer: 'Producer',
};

const NOTIFICATION_LABELS: Record<string, string> = {
  team_message: 'Team Chat',
  marketplace_message: 'Marketplace',
  marketplace_reservation: 'Marketplace',
  system: 'System',
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const profileName = (message: TeamMessage) => {
  const profile = Array.isArray(message.profiles) ? message.profiles[0] : message.profiles;
  return profile?.full_name ?? 'Team Member';
};

export default function TeamsScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TeamsTab>('join');

  // Join production state
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<CodePreview | null>(null);

  // Team chat state
  const [teamProjects, setTeamProjects] = useState<TeamProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatListRef = useRef<FlatList<TeamMessage>>(null);

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsRefreshing, setNotificationsRefreshing] = useState(false);
  const [updatingNotificationId, setUpdatingNotificationId] = useState<string | null>(null);

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const selectedProject = teamProjects.find((project) => project.id === selectedProjectId) ?? null;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setNotificationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_notifications')
        .select('id, user_id, project_id, type, title, body, source_table, source_id, read_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications((data ?? []) as AppNotification[]);
    } catch (err: any) {
      Alert.alert('Error loading notifications', err.message ?? 'Could not load notifications.');
    } finally {
      setNotificationsLoading(false);
      setNotificationsRefreshing(false);
    }
  }, [user]);

  const fetchTeamProjects = useCallback(async () => {
    if (!user) return;
    setProjectsLoading(true);
    try {
      const projectMap = new Map<string, TeamProject>();

      const { data: ownedProjects, error: ownedError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });
      if (ownedError) throw ownedError;

      (ownedProjects ?? []).forEach((project: any) => {
        projectMap.set(project.id, { id: project.id, name: project.name, role: 'owner' });
      });

      const { data: memberRows, error: memberError } = await supabase
        .from('project_members')
        .select('project_id, role, projects(id, name)')
        .eq('user_id', user.id);
      if (memberError) throw memberError;

      (memberRows ?? []).forEach((row: any) => {
        const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
        if (!project?.id) return;
        projectMap.set(project.id, {
          id: project.id,
          name: project.name ?? 'Production',
          role: row.role ?? projectMap.get(project.id)?.role ?? 'viewer',
        });
      });

      const rows = Array.from(projectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setTeamProjects(rows);
      setSelectedProjectId((current) => {
        if (current && rows.some((project) => project.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (err: any) {
      Alert.alert('Error loading teams', err.message ?? 'Could not load your productions.');
    } finally {
      setProjectsLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const fetchTeamMessages = useCallback(async (projectId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('team_messages')
        .select('id, project_id, sender_id, content, created_at, profiles!team_messages_sender_id_fkey(full_name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages((data ?? []) as TeamMessage[]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error loading chat', err.message ?? 'Could not load team chat.');
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (activeTab === 'chat') fetchTeamProjects();
    if (activeTab === 'notifications') fetchNotifications();
  }, [activeTab, fetchTeamProjects, fetchNotifications]);

  useEffect(() => {
    if (activeTab === 'chat' && selectedProjectId) fetchTeamMessages(selectedProjectId);
    if (!selectedProjectId) setMessages([]);
  }, [activeTab, selectedProjectId, fetchTeamMessages]);

  const handleRefreshChat = async () => {
    setRefreshing(true);
    await fetchTeamProjects();
    if (selectedProjectId) await fetchTeamMessages(selectedProjectId);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleRefreshNotifications = async () => {
    setNotificationsRefreshing(true);
    await fetchNotifications();
  };

  const markNotificationRead = async (notification: AppNotification) => {
    if (notification.read_at) return;
    setUpdatingNotificationId(notification.id);
    try {
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from('app_notifications')
        .update({ read_at: readAt })
        .eq('id', notification.id);
      if (error) throw error;
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not mark notification read.');
    } finally {
      setUpdatingNotificationId(null);
    }
  };

  const markAllNotificationsRead = async () => {
    if (!user || unreadCount === 0) return;
    setNotificationsRefreshing(true);
    try {
      const readAt = new Date().toISOString();
      const { error } = await supabase
        .from('app_notifications')
        .update({ read_at: readAt })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not mark notifications read.');
    } finally {
      setNotificationsRefreshing(false);
    }
  };

  const openNotification = async (notification: AppNotification) => {
    await markNotificationRead(notification);
    if (notification.type === 'team_message' && notification.project_id) {
      setSelectedProjectId(notification.project_id);
      setActiveTab('chat');
    }
  };

  const handleLookup = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) { Alert.alert('Enter a valid code'); return; }
    setLooking(true);
    setPreview(null);
    try {
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

      const { data: existing } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', codeData.project_id)
        .eq('user_id', user?.id)
        .single();
      if (existing) { Alert.alert('Already a member', "You're already on this production's team."); return; }

      const { data: projectData } = await supabase
        .from('projects')
        .select('name')
        .eq('id', codeData.project_id)
        .single();

      setPreview({
        codeId: codeData.id,
        projectId: codeData.project_id,
        projectName: projectData?.name ?? 'Production',
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
      const { error: memberError } = await supabase.from('project_members').insert({
        project_id: preview.projectId,
        user_id: user.id,
        role: preview.role,
        invited_by: null,
      });
      if (memberError) throw memberError;

      const { data: joinedProject } = await supabase
        .from('projects')
        .select('name')
        .eq('id', preview.projectId)
        .single();
      const joinedProjectName = joinedProject?.name ?? preview.projectName ?? 'Production';

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
      setActiveTab('chat');
      await fetchTeamProjects();
      setSelectedProjectId(preview.projectId);
      Alert.alert('Joined!', `You've joined "${joinedProjectName}" as ${ROLE_LABELS[preview.role] ?? preview.role}. Team Chat is ready.`);
    } catch (err: any) {
      Alert.alert('Error joining', err.message);
    } finally {
      setJoining(false);
    }
  };

  const sendTeamMessage = async () => {
    if (!newMessage.trim() || !selectedProjectId || !user) return;
    setSendingMessage(true);
    try {
      const { error } = await supabase.from('team_messages').insert({
        project_id: selectedProjectId,
        sender_id: user.id,
        content: newMessage.trim(),
      });
      if (error) throw error;
      setNewMessage('');
      await fetchTeamMessages(selectedProjectId);
    } catch (err: any) {
      Alert.alert('Error sending message', err.message ?? 'Could not send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const renderJoinProduction = () => (
    <View style={styles.joinPane}>
      <View style={styles.iconWrap}>
        <Ionicons name="people-outline" size={48} color={Colors.primary} />
      </View>
      <Text style={styles.heading}>Join a Production</Text>
      <Text style={styles.sub}>
        Enter a team code from your production owner to join their project.
      </Text>

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

      <View style={styles.divider} />

      <View style={styles.infoRow}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
        <Text style={styles.infoText}>
          Ask your production owner to generate a team code from the project's Team section.
        </Text>
      </View>
    </View>
  );

  const renderTeamChat = () => (
    <View style={styles.chatPane}>
      <Text style={styles.sectionTitle}>Team Chat</Text>
      <Text style={styles.sectionSub}>Coordinate with everyone on a production.</Text>

      {projectsLoading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.mutedText}>Loading productions...</Text>
        </View>
      ) : teamProjects.length === 0 ? (
        <View style={styles.centerBlock}>
          <Ionicons name="chatbubbles-outline" size={44} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No team productions yet</Text>
          <Text style={styles.emptyText}>Join a production or create one in Scene Editor to start a team chat.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectRail} contentContainerStyle={styles.projectRailContent}>
            {teamProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.projectChip, selectedProjectId === project.id && styles.projectChipActive]}
                onPress={() => setSelectedProjectId(project.id)}
              >
                <Text style={[styles.projectChipText, selectedProjectId === project.id && styles.projectChipTextActive]} numberOfLines={1}>{project.name}</Text>
                <Text style={[styles.projectChipRole, selectedProjectId === project.id && styles.projectChipRoleActive]}>{ROLE_LABELS[project.role] ?? project.role}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.chatCard}>
            <View style={styles.chatHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.chatProjectName}>{selectedProject?.name ?? 'Select Production'}</Text>
                <Text style={styles.chatProjectMeta}>{selectedProject ? ROLE_LABELS[selectedProject.role] ?? selectedProject.role : ''}</Text>
              </View>
              <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshChat} disabled={refreshing}>
                {refreshing ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="refresh" size={18} color={Colors.primary} />}
              </TouchableOpacity>
            </View>

            {messagesLoading ? (
              <View style={styles.messagesCenter}>
                <ActivityIndicator color={Colors.primary} />
              </View>
            ) : (
              <FlatList
                ref={chatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                style={styles.messageList}
                contentContainerStyle={messages.length === 0 ? styles.messageListEmpty : styles.messageListContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefreshChat} tintColor={Colors.primary} />}
                renderItem={({ item }) => {
                  const isMine = item.sender_id === user?.id;
                  return (
                    <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}>
                      {!isMine && <Text style={styles.messageSender}>{profileName(item)}</Text>}
                      <Text style={styles.messageText}>{item.content}</Text>
                      <Text style={styles.messageTime}>{formatTime(item.created_at)}</Text>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <Ionicons name="chatbubble-ellipses-outline" size={36} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>No messages yet. Start the production chat.</Text>
                  </View>
                }
              />
            )}

            <View style={styles.composerRow}>
              <TextInput
                style={styles.messageInput}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Message your team..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!newMessage.trim() || sendingMessage || !selectedProjectId) && { opacity: 0.5 }]}
                onPress={sendTeamMessage}
                disabled={!newMessage.trim() || sendingMessage || !selectedProjectId}
              >
                {sendingMessage ? <ActivityIndicator color="#000" size="small" /> : <Ionicons name="send" size={18} color="#000" />}
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const renderNotifications = () => (
    <View style={styles.notificationsPane}>
      <View style={styles.notificationsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <Text style={styles.sectionSub}>{unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'No unread updates'}</Text>
        </View>
        <TouchableOpacity style={[styles.markAllBtn, unreadCount === 0 && { opacity: 0.45 }]} onPress={markAllNotificationsRead} disabled={unreadCount === 0 || notificationsRefreshing}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {notificationsLoading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.mutedText}>Loading notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={notificationsRefreshing} onRefresh={handleRefreshNotifications} tintColor={Colors.primary} />}
          contentContainerStyle={notifications.length === 0 ? styles.notificationListEmpty : styles.notificationList}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            return (
              <TouchableOpacity style={[styles.notificationCard, unread && styles.notificationCardUnread]} onPress={() => openNotification(item)}>
                <View style={styles.notificationIconWrap}>
                  <Ionicons name={item.type === 'team_message' ? 'chatbubble-ellipses-outline' : 'notifications-outline'} size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.notificationTitleRow}>
                    <Text style={styles.notificationType}>{NOTIFICATION_LABELS[item.type] ?? 'Notification'}</Text>
                    {unread && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                  {item.body ? <Text style={styles.notificationBody} numberOfLines={2}>{item.body}</Text> : null}
                  <Text style={styles.notificationTime}>{formatDateTime(item.created_at)}</Text>
                </View>
                {updatingNotificationId === item.id && <ActivityIndicator color={Colors.primary} size="small" />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Ionicons name="notifications-off-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>Team Chat and Marketplace updates will appear here.</Text>
            </View>
          }
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.segmentWrap}>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'join' && styles.segmentBtnActive]} onPress={() => setActiveTab('join')}>
            <Text style={[styles.segmentText, activeTab === 'join' && styles.segmentTextActive]}>Join</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'chat' && styles.segmentBtnActive]} onPress={() => setActiveTab('chat')}>
            <Text style={[styles.segmentText, activeTab === 'chat' && styles.segmentTextActive]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentBtn, activeTab === 'notifications' && styles.segmentBtnActive]} onPress={() => setActiveTab('notifications')}>
            <View style={styles.segmentWithBadge}>
              <Text style={[styles.segmentText, activeTab === 'notifications' && styles.segmentTextActive]}>Updates</Text>
              {unreadCount > 0 && (
                <View style={[styles.segmentBadge, activeTab === 'notifications' && styles.segmentBadgeActive]}>
                  <Text style={[styles.segmentBadgeText, activeTab === 'notifications' && styles.segmentBadgeTextActive]}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
        {activeTab === 'join' ? renderJoinProduction() : activeTab === 'chat' ? renderTeamChat() : renderNotifications()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  segmentBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.full, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: Colors.primary },
  segmentText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },
  segmentTextActive: { color: '#000' },
  segmentWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, backgroundColor: Colors.primary },
  segmentBadgeActive: { backgroundColor: '#000' },
  segmentBadgeText: { color: '#000', fontSize: 10, fontWeight: Typography.fontWeightBold },
  segmentBadgeTextActive: { color: Colors.primary },
  joinPane: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  chatPane: { flex: 1, padding: Spacing.md, paddingTop: Spacing.lg },
  notificationsPane: { flex: 1, padding: Spacing.md, paddingTop: Spacing.lg },
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
  sectionTitle: { color: Colors.textPrimary, fontSize: Typography.fontSizeXl, fontWeight: Typography.fontWeightBold },
  sectionSub: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: 4, marginBottom: Spacing.md },
  centerBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  mutedText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  emptyTitle: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold, marginTop: Spacing.sm },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  projectRail: { maxHeight: 64, marginBottom: Spacing.sm },
  projectRailContent: { gap: Spacing.sm, paddingRight: Spacing.md },
  projectChip: {
    minWidth: 140,
    maxWidth: 220,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  projectChipActive: { backgroundColor: Colors.primaryMuted, borderColor: Colors.primary },
  projectChipText: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  projectChipTextActive: { color: Colors.primary },
  projectChipRole: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2 },
  projectChipRoleActive: { color: Colors.textSecondary },
  chatCard: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
    ...Shadows.card,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  chatProjectName: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  chatProjectMeta: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2 },
  refreshBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.surface },
  messagesCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { flex: 1 },
  messageListContent: { padding: Spacing.md, gap: Spacing.sm },
  messageListEmpty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyMessages: { alignItems: 'center', gap: Spacing.sm },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  messageBubbleMine: { alignSelf: 'flex-end', backgroundColor: Colors.primaryMuted, borderColor: Colors.primaryDim },
  messageBubbleTheirs: { alignSelf: 'flex-start', backgroundColor: Colors.surface },
  messageSender: { color: Colors.primary, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold, marginBottom: 2 },
  messageText: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, lineHeight: 20 },
  messageTime: { color: Colors.textMuted, fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  messageInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.lg,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSizeSm,
  },
  sendBtn: { width: 42, height: 42, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  notificationsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md, gap: Spacing.md },
  markAllBtn: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  markAllText: { color: Colors.primary, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold },
  notificationList: { gap: Spacing.sm, paddingBottom: Spacing.xl },
  notificationListEmpty: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  notificationCard: { flexDirection: 'row', gap: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.lg, padding: Spacing.md, ...Shadows.card },
  notificationCardUnread: { borderColor: Colors.primaryDim, backgroundColor: Colors.primaryMuted },
  notificationIconWrap: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: 2 },
  notificationType: { color: Colors.primary, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  notificationTitle: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, lineHeight: 19 },
  notificationBody: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm, marginTop: 4, lineHeight: 19 },
  notificationTime: { color: Colors.textMuted, fontSize: 10, marginTop: 6 },
});