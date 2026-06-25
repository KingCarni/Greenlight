import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import type { Project } from '@/types';

// Placeholder data — replace with Supabase query
const MOCK_PROJECTS: Project[] = [
  {
    id: '1',
    owner_id: 'me',
    title: 'The Last Reel',
    description: 'A noir thriller set in 1950s Hollywood.',
    thumbnail_url: null,
    genre: 'Thriller',
    status: 'pre_production',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    owner_id: 'me',
    title: 'Sundance Road',
    description: 'A coming-of-age road movie.',
    thumbnail_url: null,
    genre: 'Drama',
    status: 'development',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const STATUS_LABELS: Record<Project['status'], string> = {
  development: 'Development',
  pre_production: 'Pre-Production',
  production: 'Production',
  post_production: 'Post-Production',
  completed: 'Completed',
};

export default function ProjectsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Projects</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={MOCK_PROJECTS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/project/[id]', params: { id: item.id } })}
          >
            <View style={styles.cardThumbnail}>
              <Ionicons name="film" size={32} color={Colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.genre && <Text style={styles.cardGenre}>{item.genre}</Text>}
              <Text style={styles.cardStatus}>{STATUS_LABELS[item.status]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No projects yet. Tap + to create one.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  empty: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center' },
});
