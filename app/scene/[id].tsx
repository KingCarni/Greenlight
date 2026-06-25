import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';

export default function SceneCanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Scene Canvas</Text>
        <TouchableOpacity style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Canvas area — placeholder for drag-and-drop implementation */}
      <View style={styles.canvas}>
        <Ionicons name="easel-outline" size={64} color={Colors.textMuted} />
        <Text style={styles.canvasLabel}>Scene {id}</Text>
        <Text style={styles.canvasHint}>Drag assets here to build your scene layout.</Text>
      </View>

      {/* Bottom asset tray */}
      <View style={styles.tray}>
        <Text style={styles.trayLabel}>Assets</Text>
        <View style={styles.trayRow}>
          {(['character', 'prop', 'vehicle', 'wardrobe'] as const).map((type) => (
            <TouchableOpacity key={type} style={styles.trayItem}>
              <Ionicons name="add-circle-outline" size={28} color={Colors.primary} />
              <Text style={styles.trayItemText}>{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
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
  },
  backBtn: { padding: Spacing.xs },
  title: { flex: 1, fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary, textAlign: 'center' },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
  },
  saveBtnText: { color: '#000', fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  canvas: {
    flex: 1,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderStyle: 'dashed',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  canvasLabel: { fontSize: Typography.fontSizeXl, fontWeight: Typography.fontWeightSemibold, color: Colors.textSecondary },
  canvasHint: { fontSize: Typography.fontSizeSm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xl },
  tray: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  trayLabel: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm },
  trayRow: { flexDirection: 'row', gap: Spacing.md },
  trayItem: { alignItems: 'center', gap: 4 },
  trayItemText: { fontSize: Typography.fontSizeXs, color: Colors.textSecondary },
});
