import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';
import type { Asset, AssetType } from '@/types';

const TYPE_ICONS: Record<AssetType, keyof typeof Ionicons.glyphMap> = {
  character: 'person-outline',
  prop: 'cube-outline',
  set: 'home-outline',
  vehicle: 'car-outline',
  wardrobe: 'shirt-outline',
  other: 'ellipsis-horizontal-outline',
};

// Placeholder data
const MOCK_ASSETS: Asset[] = [
  { id: '1', project_id: '1', name: 'Detective Marlowe', type: 'character', description: null, image_url: null, metadata: null, created_at: '', updated_at: '' },
  { id: '2', project_id: '1', name: 'Vintage Fedora', type: 'wardrobe', description: null, image_url: null, metadata: null, created_at: '', updated_at: '' },
  { id: '3', project_id: '1', name: '1952 Cadillac', type: 'vehicle', description: null, image_url: null, metadata: null, created_at: '', updated_at: '' },
];

export default function AssetLibraryScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Asset Library</Text>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={MOCK_ASSETS}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name={TYPE_ICONS[item.type]} size={28} color={Colors.primary} />
            </View>
            <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.cardType}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No assets yet.</Text>
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
  row: { gap: Spacing.sm, marginBottom: Spacing.sm },
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  cardName: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary, textAlign: 'center' },
  cardType: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', marginTop: Spacing.xxl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md },
});
