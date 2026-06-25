import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image, ScrollView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

const CATEGORIES = ['Furniture', 'Props', 'Lighting', 'Textiles', 'Vehicles', 'Artwork', 'Appliances', 'Other'];
const REMOVE_BG_API_KEY = process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY!;

interface Asset {
  id: string;
  name: string;
  category: string;
  image_url: string;
  source: string | null;
  is_available: boolean;
}

async function removeBackground(imageUri: string): Promise<Uint8Array> {
  // Read file as base64
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: 'base64' as any,
  });

  // Send as base64 to Remove.bg
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': REMOVE_BG_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_file_b64: base64,
      size: 'auto',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.errors?.[0]?.title ?? 'Background removal failed');
  }

  // Get response as array buffer
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export default function LibraryScreen() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // New asset form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Props');
  const [newSource, setNewSource] = useState('');
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [removeBg, setRemoveBg] = useState(true);

  async function fetchAssets() {
    setLoading(true);
    let query = supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false });

    if (selectedCategory) {
      query = query.eq('category', selectedCategory.toLowerCase());
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching assets:', error.message);
    else setAssets(data as Asset[]);
    setLoading(false);
  }

  useEffect(() => { fetchAssets(); }, [selectedCategory]);

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setNewImageUri(result.assets[0].uri);
    }
  }

  async function handleTakePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setNewImageUri(result.assets[0].uri);
    }
  }

  async function handleAddAsset() {
    if (!newName.trim()) {
      Alert.alert('Required', 'Please enter a name for this asset.');
      return;
    }
    if (!newImageUri) {
      Alert.alert('Required', 'Please add a photo of this asset.');
      return;
    }
    if (!user) return;

    console.log('API Key:', REMOVE_BG_API_KEY ? 'loaded' : 'MISSING');

    setUploading(true);
    try {
      let uploadData: Uint8Array | ArrayBuffer;
      let contentType: string;
      let fileExtension: string;

      if (removeBg) {
        setUploadStatus('Removing background...');
        uploadData = await removeBackground(newImageUri);
        contentType = 'image/png';
        fileExtension = 'png';
      } else {
        setUploadStatus('Uploading photo...');
        const base64 = await FileSystem.readAsStringAsync(newImageUri, {
          encoding: 'base64' as any,
        });
        // Convert base64 to Uint8Array
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        uploadData = bytes;
        contentType = 'image/jpeg';
        fileExtension = 'jpg';
      }

      // Upload to Supabase Storage
      setUploadStatus('Saving to library...');
      const filename = `assets/${user.id}/${Date.now()}.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filename, uploadData, { contentType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(filename);

      // Create asset record
      const { error: assetError } = await supabase
        .from('assets')
        .insert({
          name: newName.trim(),
          category: newCategory.toLowerCase(),
          image_url: urlData.publicUrl,
          source: newSource.trim() || null,
          uploaded_by: user.id,
          is_available: true,
        });

      if (assetError) throw assetError;

      setNewName('');
      setNewCategory('Props');
      setNewSource('');
      setNewImageUri(null);
      setUploadStatus('');
      setModalVisible(false);
      fetchAssets();

    } catch (e: any) {
      console.error('Asset upload error:', e);
      Alert.alert('Error', e.message || 'Could not add asset.');
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.filterChip, !selectedCategory && styles.filterChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.filterChipText, !selectedCategory && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
          >
            <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Asset grid */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          onRefresh={fetchAssets}
          refreshing={loading}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardImageContainer}>
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.cardImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardCategory}>{item.category}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No assets yet.{'\n'}Tap + to photograph a prop.</Text>
            </View>
          }
        />
      )}

      {/* Add Asset Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Asset</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setNewImageUri(null); setUploadStatus(''); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.photoPicker} onPress={handleTakePhoto}>
              {newImageUri ? (
                <Image source={{ uri: newImageUri }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                  <Text style={styles.photoPlaceholderText}>Tap to photograph asset</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.galleryLink} onPress={handlePickImage}>
              <Text style={styles.galleryLinkText}>Or choose from gallery</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Asset name *"
              placeholderTextColor={Colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />

            <TextInput
              style={styles.input}
              placeholder="Source (e.g. IKEA, Prop house)"
              placeholderTextColor={Colors.textMuted}
              value={newSource}
              onChangeText={setNewSource}
            />

            {/* Background removal toggle */}
            <TouchableOpacity style={styles.toggleRow} onPress={() => setRemoveBg(!removeBg)}>
              <View style={styles.toggleInfo}>
                <Ionicons name="cut-outline" size={18} color={Colors.primary} />
                <View>
                  <Text style={styles.toggleLabel}>Remove Background</Text>
                  <Text style={styles.toggleSub}>Creates transparent PNG for canvas overlay</Text>
                </View>
              </View>
              <View style={[styles.toggle, removeBg && styles.toggleActive]}>
                <View style={[styles.toggleThumb, removeBg && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            {/* Category selector */}
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, newCategory === cat && styles.filterChipActive]}
                    onPress={() => setNewCategory(cat)}
                  >
                    <Text style={[styles.filterChipText, newCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.createButton, uploading && { opacity: 0.6 }]}
              onPress={handleAddAsset}
              disabled={uploading}
            >
              {uploading ? (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator color="#000" size="small" />
                  <Text style={styles.uploadingText}>{uploadStatus || 'Processing...'}</Text>
                </View>
              ) : (
                <Text style={styles.createButtonText}>
                  {removeBg ? '✨ Add with Background Removed' : 'Add to Library'}
                </Text>
              )}
            </TouchableOpacity>

            {removeBg && (
              <Text style={styles.bgTip}>
                💡 Tip: Photograph props against a plain wall or floor for best results.
              </Text>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    width: 36, height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: Spacing.md, gap: Spacing.xs, paddingBottom: Spacing.xs },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs },
  filterChipTextActive: { color: '#000', fontWeight: Typography.fontWeightSemibold },
  grid: { padding: Spacing.md, paddingBottom: Spacing.xl },
  gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
  card: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.card,
  },
  cardImageContainer: { width: '100%', height: 140, backgroundColor: Colors.surface },
  cardImage: { width: '100%', height: '100%' },
  cardBody: { padding: Spacing.sm },
  cardName: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  cardCategory: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2, textTransform: 'capitalize' },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  photoPicker: {
    height: 160,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  photoPlaceholderText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  galleryLink: { alignItems: 'center', marginBottom: Spacing.md },
  galleryLinkText: { color: Colors.primary, fontSize: Typography.fontSizeXs },
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: Typography.fontSizeMd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    marginBottom: Spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  toggleLabel: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  toggleSub: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.surfaceBorder, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: Colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbActive: { alignSelf: 'flex-end' },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: 'center',
    marginTop: Spacing.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  createButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadingText: { color: '#000', fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  bgTip: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
});
