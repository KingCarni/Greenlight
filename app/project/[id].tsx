import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import type { Scene } from '@/types';

// Placeholder scenes — replace with Supabase query on project id
const MOCK_SCENES: Scene[] = [
  { id: 's1', project_id: '1', title: 'INT. DETECTIVE OFFICE - NIGHT', scene_number: 1, description: 'Marlowe sits alone.', location: 'Office', time_of_day: 'night', interior_exterior: 'interior', canvas_data: null, created_at: '', updated_at: '' },
  { id: 's2', project_id: '1', title: 'EXT. RAINY STREET - NIGHT', scene_number: 2, description: 'A mysterious figure approaches.', location: 'Downtown', time_of_day: 'night', interior_exterior: 'exterior', canvas_data: null, created_at: '', updated_at: '' },
];

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Project {id}</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Scenes</Text>

      <FlatList
        data={MOCK_SCENES}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/scene/[id]', params: { id: item.id } })}
          >
            <View style={styles.sceneNumber}>
              <Text style={styles.sceneNumberText}>{item.scene_number}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.description && <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No scenes yet. Tap + to add one.</Text>
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  title: { flex: 1, fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  addButton: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
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
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  sceneNumberText: { color: Colors.primary, fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  cardDesc: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center' },
});
