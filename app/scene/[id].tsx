import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, ScrollView,
  PanResponder, Animated, Alert, Modal, FlatList,
  SafeAreaView, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  scaleAnim: Animated.Value;
  rotationAnim: Animated.Value;
  flipXAnim: Animated.Value;
  scaleRef: { value: number };
  rotationRef: { value: number };
  flipXRef: { value: boolean };
  panResponder: any;
}

const DraggableAsset = React.memo(function DraggableAsset({
  placed,
  isSelected,
  onRemove,
  onFlip,
}: {
  placed: PlacedAsset;
  isSelected: boolean;
  onRemove: () => void;
  onFlip: () => void;
}) {
  return (
    <Animated.View
      style={[
        styles.placedAsset,
        {
          transform: [
            ...placed.pan.getTranslateTransform(),
            { scale: placed.scaleAnim },
            { scaleX: placed.flipXAnim },
            {
              rotate: placed.rotationAnim.interpolate({
                inputRange: [-720, 720],
                outputRange: ['-720deg', '720deg'],
              }),
            },
          ],
        },
      ]}
    >
      <Image
        source={{ uri: placed.asset.image_url }}
        style={styles.placedAssetImage}
        resizeMode="contain"
      />

      {isSelected && <View style={styles.selectionBorder} />}

      <View
        style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        {...placed.panResponder.panHandlers}
      />

      {isSelected && (
        <>
          <TouchableOpacity
            style={styles.flipBtn}
            onPress={onFlip}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="swap-horizontal" size={22} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.removeBtn}
            onPress={onRemove}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Ionicons name="close-circle" size={28} color="#ff3b30" />
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
});

export default function SceneCanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [placedAssets, setPlacedAssets] = useState<PlacedAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetModalVisible, setAssetModalVisible] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(true);
  const [saving, setSaving] = useState(false);

  const canvasLayoutRef = useRef({ width: 0, height: 0, x: 0, y: 0 });
  const bottomSafePadding = Math.max(insets.bottom + Spacing.sm, Spacing.xl);
  const trayHeight = 112 + bottomSafePadding;
  const collapsedControlBottom = 24 + bottomSafePadding;
  const expandedControlBottom = trayHeight + Spacing.md;

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
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, category, image_url')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assets:', error.message);
      return;
    }

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
        const selectRef = { current: () => {} };
        const placed = buildPlacedAsset(
          row.assets,
          x,
          y,
          row.scale ?? 1,
          row.rotation ?? 0,
          row.flip_x ?? false,
          selectRef,
          row.id
        );
        selectRef.current = () => setSelectedId(prev => prev === placed.id ? null : placed.id);
        return placed;
      });
      setPlacedAssets(loaded);
    }
  }

  function buildPlacedAsset(
    asset: Asset,
    startX?: number,
    startY?: number,
    startScale = 1,
    startRotation = 0,
    startFlipX = false,
    onSelectRef?: { current: () => void },
    stableId?: string,
  ): PlacedAsset {
    const layout = canvasLayoutRef.current;
    const pan = new Animated.ValueXY({
      x: startX ?? layout.width / 2 - 50,
      y: startY ?? layout.height / 2 - 50,
    });
    const scaleAnim = new Animated.Value(startScale);
    const rotationAnim = new Animated.Value(startRotation);
    const flipXAnim = new Animated.Value(startFlipX ? -1 : 1);
    const scaleRef = { value: startScale };
    const rotationRef = { value: startRotation };
    const flipXRef = { value: startFlipX };

    let prevDist = 0;
    let prevAngle = 0;
    let prevX = 0;
    let prevY = 0;
    let isTwoFinger = false;

    function dist(t: any[]) {
      const dx = t[0].pageX - t[1].pageX;
      const dy = t[0].pageY - t[1].pageY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function angle(t: any[]) {
      return Math.atan2(t[1].pageY - t[0].pageY, t[1].pageX - t[0].pageX) * (180 / Math.PI);
    }

    function midpoint(t: any[]) {
      return {
        x: (t[0].pageX + t[1].pageX) / 2,
        y: (t[0].pageY + t[1].pageY) / 2,
      };
    }

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          isTwoFinger = true;
          prevDist = dist(touches as any);
          prevAngle = angle(touches as any);
          const mid = midpoint(touches as any);
          prevX = mid.x;
          prevY = mid.y;
        } else {
          isTwoFinger = false;
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
        }
      },

      onPanResponderMove: (e, gestureState) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          if (!isTwoFinger) {
            isTwoFinger = true;
            pan.flattenOffset();
            prevDist = dist(touches as any);
            prevAngle = angle(touches as any);
            const mid = midpoint(touches as any);
            prevX = mid.x;
            prevY = mid.y;
            return;
          }

          const currDist = dist(touches as any);
          const currAngle = angle(touches as any);
          const mid = midpoint(touches as any);

          if (prevDist > 0) {
            scaleRef.value = Math.max(0.2, Math.min(5, scaleRef.value * (currDist / prevDist)));
            scaleAnim.setValue(scaleRef.value);
          }

          const angleDelta = currAngle - prevAngle;
          rotationRef.value += angleDelta;
          rotationAnim.setValue(rotationRef.value);

          const dx = mid.x - prevX;
          const dy = mid.y - prevY;
          pan.setValue({
            x: (pan.x as any)._value + dx,
            y: (pan.y as any)._value + dy,
          });

          prevDist = currDist;
          prevAngle = currAngle;
          prevX = mid.x;
          prevY = mid.y;
        } else if (!isTwoFinger) {
          pan.x.setValue(gestureState.dx);
          pan.y.setValue(gestureState.dy);
        }
      },

      onPanResponderRelease: (_e, gestureState) => {
        if (!isTwoFinger) {
          pan.flattenOffset();
          if (Math.abs(gestureState.dx) < 8 && Math.abs(gestureState.dy) < 8) {
            onSelectRef?.current?.();
          }
        }
        isTwoFinger = false;
        prevDist = 0;
      },
    });

    return {
      id: stableId ?? `${asset.id}-${Date.now()}`,
      asset,
      pan,
      scaleAnim,
      rotationAnim,
      flipXAnim,
      scaleRef,
      rotationRef,
      flipXRef,
      panResponder,
    };
  }

  function handleAddAssetToCanvas(asset: Asset) {
    const selectRef = { current: () => {} };
    const placed = buildPlacedAsset(asset, undefined, undefined, 1, 0, false, selectRef);
    selectRef.current = () => setSelectedId(prev => prev === placed.id ? null : placed.id);
    setPlacedAssets(prev => [...prev, placed]);
    setSelectedId(placed.id);
    setAssetModalVisible(false);
  }

  function handleFlip(placedId: string) {
    setPlacedAssets(prev => prev.map(placed => {
      if (placed.id !== placedId) return placed;

      const nextValue = !placed.flipXRef.value;
      placed.flipXRef.value = nextValue;

      Animated.spring(placed.flipXAnim, {
        toValue: nextValue ? -1 : 1,
        useNativeDriver: true,
        friction: 7,
        tension: 80,
      }).start();

      return placed;
    }));
  }

  function handleRemove(placedId: string) {
    Alert.alert('Remove asset?', 'Remove this item from the canvas?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setPlacedAssets(prev => prev.filter(p => p.id !== placedId));
          setSelectedId(null);
        },
      },
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
        scale: p.scaleRef.value,
        rotation: p.rotationRef.value,
        flip_x: p.flipXRef.value,
        opacity: 1,
        z_index: index,
      }));

      await supabase.from('scene_assets').delete().eq('scene_id', scene.id);

      if (toInsert.length > 0) {
        const { error } = await supabase.from('scene_assets').insert(toInsert);
        if (error) throw error;
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View
        style={styles.canvas}
        onLayout={(e) => {
          const { width, height, x, y } = e.nativeEvent.layout;
          canvasLayoutRef.current = { width, height, x, y };
          fetchPlacedAssets();
        }}
      >
        {scene?.canvas_photo_url ? (
          <Image
            source={{ uri: scene.canvas_photo_url, headers: { 'Cache-Control': 'no-cache' } }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.emptyCanvas}>
            <Ionicons name="easel-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.canvasHint}>No photo yet.{'\n'}Use the Scanner tab.</Text>
          </View>
        )}

        {placedAssets.map((placed) => (
          <DraggableAsset
            key={placed.id}
            placed={placed}
            isSelected={selectedId === placed.id}
            onRemove={() => handleRemove(placed.id)}
            onFlip={() => handleFlip(placed.id)}
          />
        ))}

        <SafeAreaView style={styles.headerOverlay} pointerEvents="box-none">
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={styles.titlePill}>
              <Text style={styles.titleText} numberOfLines={1}>
                {scene?.name ?? 'Scene Canvas'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.savePill, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.savePillText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <TouchableOpacity
          style={[styles.fab, { bottom: trayExpanded ? expandedControlBottom : collapsedControlBottom }]}
          onPress={() => setAssetModalVisible(true)}
        >
          <Ionicons name="add" size={28} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.trayToggle, { bottom: trayExpanded ? expandedControlBottom : collapsedControlBottom }]}
          onPress={() => setTrayExpanded(prev => !prev)}
        >
          <Ionicons
            name={trayExpanded ? 'chevron-down' : 'chevron-up'}
            size={18}
            color="#fff"
          />
          <Text style={styles.trayToggleText}>
            {trayExpanded ? 'Hide' : 'Assets'}
          </Text>
        </TouchableOpacity>
      </View>

      {trayExpanded && (
        <View style={[styles.trayOverlay, { paddingBottom: bottomSafePadding }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.trayRow}>
              {assets.slice(0, 10).map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={styles.trayItem}
                  onPress={() => handleAddAssetToCanvas(asset)}
                >
                  <Image source={{ uri: asset.image_url }} style={styles.trayItemImage} resizeMode="cover" />
                  <Text style={styles.trayItemText} numberOfLines={1}>
                    {asset.name}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.trayAddMore} onPress={() => setAssetModalVisible(true)}>
                <Ionicons name="add-circle-outline" size={28} color={Colors.primary} />
                <Text style={styles.trayItemText}>More</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      <Modal visible={assetModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: bottomSafePadding }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Asset</Text>
              <TouchableOpacity onPress={() => setAssetModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {assets.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  No assets in library yet.{'\n'}Add some in the Library tab first.
                </Text>
              </View>
            ) : (
              <FlatList
                data={assets}
                keyExtractor={(item) => item.id}
                numColumns={3}
                contentContainerStyle={{ paddingBottom: Spacing.md }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.modalAssetItem} onPress={() => handleAddAssetToCanvas(item)}>
                    <Image source={{ uri: item.image_url }} style={styles.modalAssetImage} resizeMode="cover" />
                    <Text style={styles.modalAssetName} numberOfLines={1}>
                      {item.name}
                    </Text>
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
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  canvas: { flex: 1, backgroundColor: '#111' },
  emptyCanvas: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  canvasHint: { fontSize: Typography.fontSizeSm, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },

  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    alignItems: 'center',
  },
  titleText: {
    color: '#fff',
    fontSize: Typography.fontSizeSm,
    fontWeight: Typography.fontWeightSemibold,
  },
  savePill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePillText: { color: '#000', fontWeight: Typography.fontWeightBold, fontSize: Typography.fontSizeSm },

  fab: {
    position: 'absolute',
    right: Spacing.md,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  trayToggle: {
    position: 'absolute',
    left: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    zIndex: 10,
  },
  trayToggleText: { color: '#fff', fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },

  placedAsset: { position: 'absolute', width: 100, height: 100 },
  placedAssetImage: { width: 100, height: 100 },
  selectionBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 4,
  },
  flipBtn: {
    position: 'absolute',
    top: -14,
    left: -14,
    width: 28,
    height: 28,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: -14,
    right: -14,
    backgroundColor: '#fff',
    borderRadius: 14,
    zIndex: 2,
  },

  trayOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    zIndex: 20,
  },
  trayRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.md,
  },
  trayItem: { alignItems: 'center', width: 64 },
  trayItemImage: { width: 56, height: 56, borderRadius: Radius.md },
  trayItemText: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  trayAddMore: { alignItems: 'center', width: 64 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  modalAssetItem: { flex: 1 / 3, margin: 4, alignItems: 'center' },
  modalAssetImage: { width: '100%', aspectRatio: 1, borderRadius: Radius.md },
  modalAssetName: { fontSize: 10, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, textAlign: 'center', lineHeight: 22 },
});
