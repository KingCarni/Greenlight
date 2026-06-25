import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, ScrollView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';

interface Scene {
  id: string;
  name: string;
  canvas_photo_url: string | null;
  status: string;
  project_id: string;
}

export default function SceneCanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScene() {
      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching scene:', error.message);
      } else {
        setScene(data as Scene);
      }
      setLoading(false);
    }
    if (id) fetchScene();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {scene?.name ?? 'Scene Canvas'}
        </Text>
        <TouchableOpacity style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Canvas area — shows photo if available */}
      <View style={styles.canvas}>
        {scene?.canvas_photo_url ? (
          <Image
          source={{ 
            uri: scene.canvas_photo_url,
            headers: { 'Cache-Control': 'no-cache' }
          }}
          style={styles.canvasImage}
          resizeMode="cover"
          onError={(e) => console.log('Image error:', e.nativeEvent.error)}
          onLoad={() => console.log('Image loaded!')}
/>
        ) : (
          <View style={styles.emptyCanvas}>
            <Ionicons name="easel-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.canvasLabel}>{scene?.name ?? 'Scene'}</Text>
            <Text style={styles.canvasHint}>No photo yet. Use the Scanner tab to capture a room.</Text>
          </View>
        )}
      </View>

      {/* Bottom asset tray */}
      <View style={styles.tray}>
        <Text style={styles.trayLabel}>Assets</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.trayRow}>
            {(['furniture', 'props', 'lighting', 'textiles', 'vehicles', 'other'] as const).map((type) => (
              <TouchableOpacity key={type} style={styles.trayItem}>
                <Ionicons name="add-circle-outline" size={28} color={Colors.primary} />
                <Text style={styles.trayItemText}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
  },
  backBtn: { padding: Spacing.xs },
  title: {
    flex: 1,
    fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginHorizontal: Spacing.sm,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
  },
  saveBtnText: { color: '#000', fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },

  // Canvas
  canvas: {
    flex: 1,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  canvasImage: {
    width: '100%',
    height: '100%',
  },
  emptyCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
  },
  canvasLabel: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
  },
  canvasHint: {
    fontSize: Typography.fontSizeSm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Asset tray
  tray: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    padding: Spacing.md,
  },
  trayLabel: {
    fontSize: Typography.fontSizeXs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  trayRow: { flexDirection: 'row', gap: Spacing.md },
  trayItem: { alignItems: 'center', gap: 4 },
  trayItemText: { fontSize: Typography.fontSizeXs, color: Colors.textSecondary },
});
