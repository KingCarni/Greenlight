import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, ScrollView,
  PanResponder, Animated, Alert, Modal, FlatList
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

interface Asset {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

interface PlacedAsset {
  id: string;
  asset: Asset;
  pan: Animated.ValueXY;
  scale: Animated.Value;
  panResponder: any;
}

export default function SceneCanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [placedAssets, setPlacedAssets] = useState<PlacedAsset[]>([]);
  const [assetModalVisible, setAssetModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<View>(null);
  const [canvasLayout, setCanvasLayout] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const canvasLayoutRef = useRef({ width: 0, height: 0, x: 0, y: 0 });

  useEffect(() => {
    fetchScene();
    fetchAssets();
  }, [id]);

  async function fetchScene() {
    const { data, error } = await supabase
      .from('scenes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) console.error('Error fetching scene:', error.message);
    else setScene(data as Scene);
    setLoading(false);
  }

  async function fetchAssets() {
    const { data } = await supabase
      .from('assets')
      .select('id, name, category, image_url')
      .order('created_at', { ascending: false });
    if (data) setAssets(data as Asset[]);
  }

  async function fetchPlacedAssets() {
    const layout = canvasLayoutRef.current;
    if (!layout.width || !layout.height) return;

    const { data, error } = await supabase
      .from('scene_assets')
      .select('*, assets(*)')
      .eq('scene_id', id)
      .order('z_index', { ascending: true });

    if (error) {
      console.error('Error fetching placed assets:', error.message);
      return;
    }

    if (data && data.length > 0) {
      const loaded = data.map((row: any) => {
        const x = (row.pos_x / 100) * layout.width;
        const y = (row.pos_y / 100) * layout.height;
        return createPlacedAsset(row.assets, x, y);
      });
      setPlacedAssets(loaded);
    }
  }

  function createPlacedAsset(asset: Asset, startX?: number, startY?: number): PlacedAsset {
    const layout = canvasLayoutRef.current;
    const pan = new Animated.ValueXY({
      x: startX ?? layout.width / 2 - 50,
      y: startY ?? layout.height / 2 - 50,
    });
    const scale = new Animated.Value(1);

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    });

    return {
      id: `${asset.id}-${Date.now()}`,
      asset,
      pan,
      scale,
      panResponder,
    };
  }

  function handleAddAssetToCanvas(asset: Asset) {
    const placed = createPlacedAsset(asset);
    setPlacedAssets(prev => [...prev, placed]);
    setAssetModalVisible(false);
  }

  function handleRemovePlacedAsset(placedId: string) {
    Alert.alert('Remove asset?', 'Remove this item from the canvas?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setPlacedAssets(prev => prev.filter(p => p.id !== placedId));
      }},
    ]);
  }

  async function handleSave() {
    if (!scene) return;
    setSaving(true);
    try {
      const layout = canvasLayoutRef.current;
      const toInsert = placedAssets.map((p, index) => ({
        scene_id: scene.id,
        asset_id: p.asset.id,
        pos_x: ((p.pan.x as any)._value / layout.width) * 100,
        pos_y: ((p.pan.y as any)._value / layout.height) * 100,
        scale: (p.scale as any)._value,
        rotation: 0,
        opacity: 1,
        z_index: index,
      }));

      await supabase.from('scene_assets').delete().eq('scene_id', scene.id);

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('scene_assets')
          .insert(toInsert);
        if (insertError) throw insertError;
      }

      Alert.alert('Saved!', 'Scene layout saved successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save scene.');
    } finally {
      setSaving(false);
    }
  }

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
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <View
        ref={canvasRef}
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height, x, y } = e.nativeEvent.layout;
          const layout = { width, height, x, y };
          setCanvasLayout(layout);
          canvasLayoutRef.current = layout;
          fetchPlacedAssets();
        }}
      >
        {/* Background photo */}
        {scene?.canvas_photo_url ? (
          <Image
            source={{ uri: scene.canvas_photo_url, headers: { 'Cache-Control': 'no-cache' } }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.emptyCanvas}>
            <Ionicons name="easel-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.canvasHint}>No photo yet. Use the Scanner tab.</Text>
          </View>
        )}

        {/* Placed assets — draggable */}
        {placedAssets.map((placed) => (
          <Animated.View
            key={placed.id}
            style={[
              styles.placedAsset,
              { transform: [...placed.pan.getTranslateTransform()] }
            ]}
            {...placed.panResponder.panHandlers}
          >
            <Image
              source={{ uri: placed.asset.image_url }}
              style={styles.placedAssetImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => handleRemovePlacedAsset(placed.id)}
            >
              <Ionicons name="close-circle" size={20} color="red" />
            </TouchableOpacity>
          </Animated.View>
        ))}

        {/* Add asset button overlay */}
        <TouchableOpacity
          style={styles.addAssetOverlay}
          onPress={() => setAssetModalVisible(true)}
        >
          <Ionicons name="add-circle" size={48} color={Colors.primary} />
          <Text style={styles.addAssetText}>Add Asset</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom asset tray */}
      <View style={styles.tray}>
        <Text style={styles.trayLabel}>Quick Add</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.trayRow}>
            {assets.slice(0, 8).map((asset) => (
              <TouchableOpacity
                key={asset.id}
                style={styles.trayItem}
                onPress={() => handleAddAssetToCanvas(asset)}
              >
                <Image
                  source={{ uri: asset.image_url }}
                  style={styles.trayItemImage}
                  resizeMode="cover"
                />
                <Text style={styles.trayItemText} numberOfLines={1}>{asset.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.trayAddMore}
              onPress={() => setAssetModalVisible(true)}
            >
              <Ionicons name="add-circle-outline" size={28} color={Colors.primary} />
              <Text style={styles.trayItemText}>More</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {/* Asset picker modal */}
      <Modal visible={assetModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Asset</Text>
              <TouchableOpacity onPress={() => setAssetModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {assets.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No assets in library yet.{'\n'}Add some in the Library tab first.</Text>
              </View>
            ) : (
              <FlatList
                data={assets}
                keyExtractor={(item) => item.id}
                numColumns={3}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalAssetItem}
                    onPress={() => handleAddAssetToCanvas(item)}
                  >
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.modalAssetImage}
                      resizeMode="cover"
                    />
                    <Text style={styles.modalAssetName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
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
    minWidth: 52,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },
  canvas: {
    flex: 1,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
  },
  emptyCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  canvasHint: { fontSize: Typography.fontSizeSm, color: Colors.textMuted, textAlign: 'center' },
  addAssetOverlay: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  addAssetText: { color: Colors.primary, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },
  placedAsset: {
    position: 'absolute',
    width: 100,
    height: 100,
  },
  placedAssetImage: {
    width: 100,
    height: 100,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  tray: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  trayLabel: {
    fontSize: Typography.fontSizeXs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  trayRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  trayItem: { alignItems: 'center', width: 64 },
  trayItemImage: { width: 56, height: 56, borderRadius: Radius.md },
  trayItemText: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  trayAddMore: { alignItems: 'center', width: 64 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  modalAssetItem: { flex: 1/3, margin: 4, alignItems: 'center' },
  modalAssetImage: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  modalAssetName: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, textAlign: 'center', lineHeight: 22 },
});
