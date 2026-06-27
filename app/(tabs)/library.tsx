import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert, Image, ScrollView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

const CATEGORIES = ['Furniture', 'Props', 'Lighting', 'Textiles', 'Vehicles', 'Artwork', 'Appliances', 'Other'];
const REMOVE_BG_API_KEY = process.env.EXPO_PUBLIC_REMOVE_BG_API_KEY!;
const CSV_HEADERS = ['name', 'category', 'source', 'storage_location', 'width_cm', 'height_cm', 'depth_cm', 'image_url'];

interface Project {
  id: string;
  name: string;
}

interface ProjectLocation {
  id: string;
  project_id: string;
  name: string;
}

interface Asset {
  id: string;
  project_id: string | null;
  name: string;
  category: string;
  image_url: string;
  source: string | null;
  is_available: boolean;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  storage_location: string | null;
}

interface CsvRow {
  name: string;
  category: string;
  source: string;
  storage_location: string;
  width_cm: string;
  height_cm: string;
  depth_cm: string;
  image_url: string;
  _error?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: any = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    if (!row.name) row._error = 'Missing name';
    return row as CsvRow;
  }).filter((r) => r.name || r._error);
}

function escapeCsvValue(val: string | null | undefined): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function removeBackground(imageUri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' as any });
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': REMOVE_BG_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_file_b64: base64, size: 'auto' }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error?.errors?.[0]?.title ?? 'Background removal failed');
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export default function LibraryScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationPickerFor, setLocationPickerFor] = useState<'add' | 'edit'>('add');
  const [existingLocations, setExistingLocations] = useState<ProjectLocation[]>([]);

  // Import state
  const [importPreviewVisible, setImportPreviewVisible] = useState(false);
  const [importRows, setImportRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  // Add form state
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Props');
  const [newSource, setNewSource] = useState('');
  const [newStorageLocation, setNewStorageLocation] = useState('');
  const [newWidth, setNewWidth] = useState('');
  const [newHeight, setNewHeight] = useState('');
  const [newDepth, setNewDepth] = useState('');
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [removeBg, setRemoveBg] = useState(true);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('Props');
  const [editSource, setEditSource] = useState('');
  const [editStorageLocation, setEditStorageLocation] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editDepth, setEditDepth] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const selectedProjectName = projects.find((p) => p.id === selectedProject)?.name ?? 'Select Production';

  useEffect(() => { fetchProjects(); }, [user]);
  useEffect(() => {
    if (selectedProject) {
      fetchAssets();
      fetchProjectLocations(selectedProject);
    } else {
      setAssets([]);
      setLoading(false);
      setExistingLocations([]);
    }
  }, [selectedProject, selectedCategory]);

  async function fetchProjects() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching projects:', error.message); setLoading(false); return; }
    const rows = (data ?? []) as Project[];
    setProjects(rows);
    setSelectedProject((current) => current ?? rows[0]?.id ?? null);
    if (rows.length === 0) setLoading(false);
  }

  function locationKey(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function normalizeLocation(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  function mergeLocations(saved: ProjectLocation[], fallback: ProjectLocation[]) {
    const unique = new Map<string, ProjectLocation>();
    [...saved, ...fallback].forEach((location) => {
      const key = locationKey(location.name);
      if (!unique.has(key)) unique.set(key, location);
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function deriveLocationsFromAssets(items: Asset[], projectId: string) {
    const unique = new Map<string, ProjectLocation>();
    items.forEach((asset) => {
      const rawLocation = asset.storage_location?.trim();
      if (!rawLocation) return;
      const key = locationKey(rawLocation);
      if (!unique.has(key)) {
        unique.set(key, { id: `asset-${asset.id}-${key}`, project_id: projectId, name: rawLocation });
      }
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function fetchAssets() {
    if (!selectedProject) return;
    setLoading(true);
    let query = supabase.from('assets').select('*').eq('project_id', selectedProject).order('created_at', { ascending: false });
    if (selectedCategory) query = query.eq('category', selectedCategory.toLowerCase());
    const { data, error } = await query;
    if (error) { console.error('Error fetching assets:', error.message); setAssets([]); }
    else {
      const rows = (data ?? []) as Asset[];
      setAssets(rows);
      setExistingLocations((prev) => mergeLocations(prev, deriveLocationsFromAssets(rows, selectedProject)));
    }
    setLoading(false);
  }

  async function fetchProjectLocations(projectId: string) {
    const { data, error } = await supabase.from('project_locations').select('id, project_id, name').eq('project_id', projectId).order('name', { ascending: true });
    if (error) { console.warn('Project locations unavailable:', error.message); return; }
    setExistingLocations((data ?? []) as ProjectLocation[]);
  }

  async function ensureProjectLocation(name: string) {
    if (!selectedProject || !user) return;
    const normalizedName = normalizeLocation(name);
    if (!normalizedName) return;
    const alreadyExists = existingLocations.some((l) => locationKey(l.name) === locationKey(normalizedName));
    if (alreadyExists) return;
    const { data, error } = await supabase.from('project_locations').insert({ project_id: selectedProject, name: normalizedName, created_by: user.id }).select('id, project_id, name').single();
    if (error) { console.warn('Could not save project location:', error.message); return; }
    if (data) setExistingLocations((prev) => mergeLocations([data as ProjectLocation], prev));
  }

  function resetForm() {
    setNewName(''); setNewCategory('Props'); setNewSource(''); setNewStorageLocation('');
    setNewWidth(''); setNewHeight(''); setNewDepth(''); setNewImageUri(null); setUploadStatus('');
  }

  function openEditModalForAsset(asset: Asset) {
    setEditingAssetId(asset.id);
    setEditName(asset.name);
    setEditCategory(CATEGORIES.find((c) => c.toLowerCase() === asset.category.toLowerCase()) ?? 'Props');
    setEditSource(asset.source ?? '');
    setEditStorageLocation(asset.storage_location ?? '');
    setEditWidth(asset.width_cm != null ? String(asset.width_cm) : '');
    setEditHeight(asset.height_cm != null ? String(asset.height_cm) : '');
    setEditDepth(asset.depth_cm != null ? String(asset.depth_cm) : '');
    setDetailAsset(null);
    setEditModalVisible(true);
  }

  async function handleSaveEdit() {
    if (!editingAssetId) return;
    const normalizedLocation = normalizeLocation(editStorageLocation);
    setEditSaving(true);
    try {
      const { error } = await supabase.from('assets').update({
        name: editName.trim(), category: editCategory.toLowerCase(),
        source: editSource.trim() || null, storage_location: normalizedLocation || null,
        width_cm: editWidth ? parseFloat(editWidth) : null,
        height_cm: editHeight ? parseFloat(editHeight) : null,
        depth_cm: editDepth ? parseFloat(editDepth) : null,
      }).eq('id', editingAssetId);
      if (error) throw error;
      if (normalizedLocation) await ensureProjectLocation(normalizedLocation);
      setEditModalVisible(false);
      fetchAssets();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteAsset() {
    if (!editingAssetId) return;
    Alert.alert('Delete Asset', 'Remove this asset from the library? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('assets').delete().eq('id', editingAssetId);
        if (error) { Alert.alert('Error', error.message); return; }
        setEditModalVisible(false);
        fetchAssets();
      }},
    ]);
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) setNewImageUri(result.assets[0].uri);
  }

  async function handleTakePhoto() {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) setNewImageUri(result.assets[0].uri);
  }

  function handleSelectLocation(location: string) {
    if (locationPickerFor === 'edit') setEditStorageLocation(location);
    else setNewStorageLocation(location);
    setLocationPickerVisible(false);
  }

  function handleClearLocation() {
    if (locationPickerFor === 'edit') setEditStorageLocation('');
    else setNewStorageLocation('');
    setLocationPickerVisible(false);
  }

  function openLocationPicker(forContext: 'add' | 'edit') {
    setLocationPickerFor(forContext);
    setLocationPickerVisible(true);
  }

  // ── CSV IMPORT ──────────────────────────────────────────────────────────────

  async function handlePickCsv() {
    if (!selectedProject) { Alert.alert('Select a production first.'); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'] });
      if (result.canceled) return;
      const file = result.assets[0];
      const text = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const rows = parseCsv(text);
      if (rows.length === 0) { Alert.alert('No valid rows found in CSV.'); return; }
      setImportRows(rows);
      setImportPreviewVisible(true);
    } catch (e: any) {
      Alert.alert('Error reading file', e.message);
    }
  }

  async function handleConfirmImport() {
    if (!selectedProject || !user) return;
    setImporting(true);
    const validRows = importRows.filter((r) => !r._error);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setImportProgress(`Importing ${i + 1} of ${validRows.length}: ${row.name}`);

      try {
        let finalImageUrl: string | null = null;

        if (row.image_url?.startsWith('http')) {
          try {
            setImportProgress(`Fetching image for ${row.name}...`);
            const response = await fetch(row.image_url);
            if (response.ok) {
              const blob = await response.arrayBuffer();
              const bytes = new Uint8Array(blob);
              const ext = row.image_url.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
              const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
              const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';
              const filename = `assets/${user.id}/${selectedProject}/${Date.now()}-${i}.${safeExt}`;
              const { error: uploadError } = await supabase.storage.from('assets').upload(filename, bytes, { contentType });
              if (!uploadError) {
                const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filename);
                finalImageUrl = urlData.publicUrl;
              }
            }
          } catch {
            // image fetch failed — import row without image
          }
        }

        const normalizedLocation = normalizeLocation(row.storage_location ?? '');
        const category = CATEGORIES.find((c) => c.toLowerCase() === (row.category ?? '').toLowerCase()) ?? 'props';

        const { error } = await supabase.from('assets').insert({
          project_id: selectedProject,
          name: row.name.trim(),
          category: category.toLowerCase(),
          image_url: finalImageUrl,
          source: row.source?.trim() || null,
          storage_location: normalizedLocation || null,
          width_cm: row.width_cm ? parseFloat(row.width_cm) : null,
          height_cm: row.height_cm ? parseFloat(row.height_cm) : null,
          depth_cm: row.depth_cm ? parseFloat(row.depth_cm) : null,
          uploaded_by: user.id,
          is_available: true,
        });

        if (error) throw error;
        if (normalizedLocation) await ensureProjectLocation(normalizedLocation);
        success++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setImportPreviewVisible(false);
    setImportRows([]);
    setImportProgress('');
    fetchAssets();
    Alert.alert('Import Complete', `${success} assets imported${failed > 0 ? `, ${failed} failed` : ''}.`);
  }

  // ── CSV EXPORT ──────────────────────────────────────────────────────────────

  async function handleExport() {
    if (!assets.length) { Alert.alert('No assets to export.'); return; }
    const lines = [CSV_HEADERS.join(',')];
    assets.forEach((a) => {
      lines.push([
        escapeCsvValue(a.name),
        escapeCsvValue(a.category),
        escapeCsvValue(a.source),
        escapeCsvValue(a.storage_location),
        escapeCsvValue(a.width_cm != null ? String(a.width_cm) : ''),
        escapeCsvValue(a.height_cm != null ? String(a.height_cm) : ''),
        escapeCsvValue(a.depth_cm != null ? String(a.depth_cm) : ''),
        escapeCsvValue(a.image_url),
      ].join(','));
    });
    const csv = lines.join('\n');
    const filename = FileSystem.cacheDirectory + `greenlight_${selectedProjectName.replace(/\s+/g, '_')}_assets.csv`;
    await FileSystem.writeAsStringAsync(filename, csv, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filename, { mimeType: 'text/csv', dialogTitle: 'Export Assets CSV' });
    } else {
      Alert.alert('Saved', `CSV saved to cache: ${filename}`);
    }
  }

  async function handleAddAsset() {
    if (!selectedProject) { Alert.alert('Production required', 'Please select a production first.'); return; }
    if (!newName.trim()) { Alert.alert('Required', 'Please enter a name for this asset.'); return; }
    if (!newImageUri) { Alert.alert('Required', 'Please add a photo of this asset.'); return; }
    if (!user) return;

    const normalizedLocation = normalizeLocation(newStorageLocation);
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
        const base64 = await FileSystem.readAsStringAsync(newImageUri, { encoding: 'base64' as any });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        uploadData = bytes;
        contentType = 'image/jpeg';
        fileExtension = 'jpg';
      }

      setUploadStatus('Saving to library...');
      const filename = `assets/${user.id}/${selectedProject}/${Date.now()}.${fileExtension}`;
      const { error: uploadError } = await supabase.storage.from('assets').upload(filename, uploadData, { contentType });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filename);
      const { error: assetError } = await supabase.from('assets').insert({
        project_id: selectedProject, name: newName.trim(), category: newCategory.toLowerCase(),
        image_url: urlData.publicUrl, source: newSource.trim() || null,
        storage_location: normalizedLocation || null,
        width_cm: newWidth ? parseFloat(newWidth) : null,
        height_cm: newHeight ? parseFloat(newHeight) : null,
        depth_cm: newDepth ? parseFloat(newDepth) : null,
        uploaded_by: user.id, is_available: true,
      });
      if (assetError) throw assetError;
      if (normalizedLocation) await ensureProjectLocation(normalizedLocation);
      resetForm();
      setModalVisible(false);
      fetchAssets();
      fetchProjectLocations(selectedProject);
    } catch (e: any) {
      console.error('Asset upload error:', e);
      Alert.alert('Error', e.message || 'Could not add asset.');
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  }

  function formatDimensions(asset: Asset) {
    const parts = [];
    if (asset.width_cm) parts.push(`W${asset.width_cm}`);
    if (asset.height_cm) parts.push(`H${asset.height_cm}`);
    if (asset.depth_cm) parts.push(`D${asset.depth_cm}`);
    return parts.length > 0 ? parts.join(' × ') + ' cm' : null;
  }

  if (projects.length === 0 && !loading) {
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Create a production first{`\n`}to add project-specific assets.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleExport}>
            <Ionicons name="download-outline" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handlePickCsv}>
            <Ionicons name="push-outline" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => { resetForm(); setModalVisible(true); }}>
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.selectorCard}>
        <Text style={styles.selectorLabel}>Production</Text>
        <TouchableOpacity style={styles.selectorButton} onPress={() => setProjectPickerVisible(true)}>
          <Text style={styles.selectorText} numberOfLines={1}>{selectedProjectName}</Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.heroAddButton} onPress={() => { resetForm(); setModalVisible(true); }}>
        <Ionicons name="camera-outline" size={22} color="#000" />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroAddTitle}>Tap to photograph asset</Text>
          <Text style={styles.heroAddSub}>Add a prop, furniture piece, or set dressing item.</Text>
        </View>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity style={[styles.filterChip, !selectedCategory && styles.filterChipActive]} onPress={() => setSelectedCategory(null)}>
          <Text style={[styles.filterChipText, !selectedCategory && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity key={cat} style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]} onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}>
            <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={Colors.primary} /></View>
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
            <TouchableOpacity style={styles.card} onPress={() => setDetailAsset(item)}>
              <View style={styles.cardImageContainer}>
                <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="contain" />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cardCategory}>{item.category}</Text>
                {formatDimensions(item) && <Text style={styles.cardDimensions}>{formatDimensions(item)}</Text>}
                {item.storage_location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                    <Text style={styles.cardLocation} numberOfLines={1}>{item.storage_location}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No assets yet.{`\n`}Tap + to add one or use the import button to load a CSV.</Text>
            </View>
          }
        />
      )}

      {/* Asset Detail Modal */}
      <Modal visible={!!detailAsset} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{detailAsset?.name}</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
                <TouchableOpacity style={styles.editBtn} onPress={() => detailAsset && openEditModalForAsset(detailAsset)}>
                  <Ionicons name="pencil-outline" size={16} color="#000" />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDetailAsset(null)}>
                  <Ionicons name="close" size={24} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            {detailAsset && (
              <>
                <Image source={{ uri: detailAsset.image_url }} style={styles.detailImage} resizeMode="contain" />
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Production</Text><Text style={styles.detailValue}>{selectedProjectName}</Text></View>
                <View style={styles.detailRow}><Text style={styles.detailLabel}>Category</Text><Text style={styles.detailValue}>{detailAsset.category}</Text></View>
                {detailAsset.source && <View style={styles.detailRow}><Text style={styles.detailLabel}>Source</Text><Text style={styles.detailValue}>{detailAsset.source}</Text></View>}
                {detailAsset.storage_location && <View style={styles.detailRow}><Text style={styles.detailLabel}>Storage Location</Text><Text style={styles.detailValue}>{detailAsset.storage_location}</Text></View>}
                {formatDimensions(detailAsset) && <View style={styles.detailRow}><Text style={styles.detailLabel}>Dimensions</Text><Text style={styles.detailValue}>{formatDimensions(detailAsset)}</Text></View>}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* CSV Import Preview Modal */}
      <Modal visible={importPreviewVisible} animationType="slide" transparent onRequestClose={() => !importing && setImportPreviewVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheetTall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import Preview</Text>
              {!importing && (
                <TouchableOpacity onPress={() => setImportPreviewVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {importing ? (
              <View style={styles.importingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.importingText}>{importProgress}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.importSummary}>
                  {importRows.filter((r) => !r._error).length} valid rows · {importRows.filter((r) => r._error).length} skipped
                </Text>
                <FlatList
                  data={importRows}
                  keyExtractor={(_, i) => String(i)}
                  style={{ flex: 1 }}
                  renderItem={({ item }) => (
                    <View style={[styles.importRow, item._error && styles.importRowError]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.importRowName}>{item.name || '(no name)'}</Text>
                        <Text style={styles.importRowMeta}>
                          {[item.category, item.source, item.storage_location].filter(Boolean).join(' · ')}
                        </Text>
                        {item.image_url ? (
                          <Text style={styles.importRowImage} numberOfLines={1}>🖼 {item.image_url}</Text>
                        ) : (
                          <Text style={styles.importRowNoImage}>No image URL</Text>
                        )}
                        {item._error && <Text style={styles.importRowErrorText}>{item._error}</Text>}
                      </View>
                      <Ionicons
                        name={item._error ? 'close-circle' : 'checkmark-circle'}
                        size={20}
                        color={item._error ? Colors.error : Colors.primary}
                      />
                    </View>
                  )}
                />
                <TouchableOpacity style={styles.createButton} onPress={handleConfirmImport}>
                  <Text style={styles.createButtonText}>Import {importRows.filter((r) => !r._error).length} Assets</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Asset Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheetTall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Asset</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
              <TextInput style={styles.input} placeholder="Asset name *" placeholderTextColor={Colors.textMuted} value={editName} onChangeText={setEditName} />
              <TextInput style={styles.input} placeholder="Source (e.g. IKEA, Prop house)" placeholderTextColor={Colors.textMuted} value={editSource} onChangeText={setEditSource} />
              <Text style={styles.label}>Storage Location</Text>
              <View style={styles.locationPanel}>
                <View style={styles.locationHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationPanelTitle}>{editStorageLocation ? editStorageLocation : 'No location selected'}</Text>
                  </View>
                  <TouchableOpacity style={styles.locationBrowseButton} onPress={() => openLocationPicker('edit')}>
                    <Text style={styles.locationBrowseText}>Browse</Text>
                    <Ionicons name="chevron-down" size={16} color="#000" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.noLocationButton, !editStorageLocation && styles.noLocationButtonActive]} onPress={() => setEditStorageLocation('')}>
                  <Ionicons name="close" size={14} color={!editStorageLocation ? '#000' : Colors.textMuted} />
                  <Text style={[styles.noLocationText, !editStorageLocation && styles.noLocationTextActive]}>No Location</Text>
                </TouchableOpacity>
                <TextInput style={[styles.input, styles.locationTextInput]} placeholder="Or type custom location" placeholderTextColor={Colors.textMuted} value={editStorageLocation} onChangeText={setEditStorageLocation} autoCapitalize="words" />
              </View>
              <Text style={styles.label}>Dimensions (cm)</Text>
              <View style={styles.dimensionsRow}>
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Width" placeholderTextColor={Colors.textMuted} value={editWidth} onChangeText={setEditWidth} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Height" placeholderTextColor={Colors.textMuted} value={editHeight} onChangeText={setEditHeight} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Depth" placeholderTextColor={Colors.textMuted} value={editDepth} onChangeText={setEditDepth} keyboardType="decimal-pad" />
              </View>
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity key={cat} style={[styles.filterChip, editCategory === cat && styles.filterChipActive]} onPress={() => setEditCategory(cat)}>
                      <Text style={[styles.filterChipText, editCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={[styles.createButton, editSaving && { opacity: 0.6 }]} onPress={handleSaveEdit} disabled={editSaving}>
                {editSaving ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.createButtonText}>Save Changes</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAsset}>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.deleteButtonText}>Delete Asset</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Asset Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheetTall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Asset</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScrollContent}>
              <Text style={styles.label}>Production</Text>
              <TouchableOpacity style={styles.assetPicker} onPress={() => setProjectPickerVisible(true)}>
                <Text style={styles.assetPickerSelected}>{selectedProjectName}</Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoPicker} onPress={handleTakePhoto}>
                {newImageUri ? <Image source={{ uri: newImageUri }} style={styles.photoPreview} resizeMode="cover" /> : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                    <Text style={styles.photoPlaceholderText}>Tap to photograph asset</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.galleryLink} onPress={handlePickImage}>
                <Text style={styles.galleryLinkText}>Or choose from gallery</Text>
              </TouchableOpacity>
              <TextInput style={styles.input} placeholder="Asset name *" placeholderTextColor={Colors.textMuted} value={newName} onChangeText={setNewName} />
              <TextInput style={styles.input} placeholder="Source (e.g. IKEA, Prop house)" placeholderTextColor={Colors.textMuted} value={newSource} onChangeText={setNewSource} />
              <Text style={styles.label}>Storage Location</Text>
              <View style={styles.locationPanel}>
                <View style={styles.locationHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationPanelTitle}>{newStorageLocation ? newStorageLocation : 'No location selected'}</Text>
                    <Text style={styles.locationPanelHint}>Locations are saved for {selectedProjectName} only.</Text>
                  </View>
                  <TouchableOpacity style={styles.locationBrowseButton} onPress={() => openLocationPicker('add')}>
                    <Text style={styles.locationBrowseText}>Browse</Text>
                    <Ionicons name="chevron-down" size={16} color="#000" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.noLocationButton, !newStorageLocation && styles.noLocationButtonActive]} onPress={handleClearLocation}>
                  <Ionicons name="close" size={14} color={!newStorageLocation ? '#000' : Colors.textMuted} />
                  <Text style={[styles.noLocationText, !newStorageLocation && styles.noLocationTextActive]}>No Location</Text>
                </TouchableOpacity>
                <TextInput style={[styles.input, styles.locationTextInput]} placeholder="Or type custom location, e.g. Warehouse A / Shelf B3" placeholderTextColor={Colors.textMuted} value={newStorageLocation} onChangeText={setNewStorageLocation} autoCapitalize="words" />
              </View>
              <Text style={styles.label}>Dimensions (cm)</Text>
              <View style={styles.dimensionsRow}>
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Width" placeholderTextColor={Colors.textMuted} value={newWidth} onChangeText={setNewWidth} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Height" placeholderTextColor={Colors.textMuted} value={newHeight} onChangeText={setNewHeight} keyboardType="decimal-pad" />
                <TextInput style={[styles.input, styles.dimensionInput]} placeholder="Depth" placeholderTextColor={Colors.textMuted} value={newDepth} onChangeText={setNewDepth} keyboardType="decimal-pad" />
              </View>
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
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity key={cat} style={[styles.filterChip, newCategory === cat && styles.filterChipActive]} onPress={() => setNewCategory(cat)}>
                      <Text style={[styles.filterChipText, newCategory === cat && styles.filterChipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TouchableOpacity style={[styles.createButton, uploading && { opacity: 0.6 }]} onPress={handleAddAsset} disabled={uploading}>
                {uploading
                  ? <View style={styles.uploadingRow}><ActivityIndicator color="#000" size="small" /><Text style={styles.uploadingText}>{uploadStatus || 'Processing...'}</Text></View>
                  : <Text style={styles.createButtonText}>{removeBg ? '✨ Add with Background Removed' : 'Add to Library'}</Text>
                }
              </TouchableOpacity>
              {removeBg && <Text style={styles.bgTip}>💡 Tip: Photograph props against a plain wall or floor for best results.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Location Picker Modal */}
      <Modal visible={locationPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Storage Location</Text>
              <TouchableOpacity onPress={() => setLocationPickerVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.locationActionRow} onPress={handleClearLocation}>
              <View style={styles.locationIconWrap}><Ionicons name="close" size={18} color={Colors.textMuted} /></View>
              <View style={styles.assetRowBody}><Text style={styles.assetRowName}>No location</Text><Text style={styles.assetRowCategory}>Leave this asset unassigned</Text></View>
            </TouchableOpacity>
            <View style={styles.locationActionRow}>
              <View style={styles.locationIconWrap}><Ionicons name="create-outline" size={18} color={Colors.primary} /></View>
              <View style={styles.assetRowBody}>
                <Text style={styles.assetRowName}>Custom / New Location</Text>
                <TextInput style={styles.inlineLocationInput} placeholder="Type new location" placeholderTextColor={Colors.textMuted} value={locationPickerFor === 'edit' ? editStorageLocation : newStorageLocation} onChangeText={(v) => locationPickerFor === 'edit' ? setEditStorageLocation(v) : setNewStorageLocation(v)} autoCapitalize="words" />
              </View>
            </View>
            {existingLocations.length > 0 ? (
              <FlatList
                data={existingLocations}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const currentVal = locationPickerFor === 'edit' ? editStorageLocation : newStorageLocation;
                  return (
                    <TouchableOpacity style={[styles.assetRow, locationKey(currentVal) === locationKey(item.name) && styles.assetRowSelected]} onPress={() => handleSelectLocation(item.name)}>
                      <View style={styles.assetRowBody}><Text style={styles.assetRowName}>{item.name}</Text><Text style={styles.assetRowCategory}>Saved location</Text></View>
                      {locationKey(currentVal) === locationKey(item.name) && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <View style={styles.locationEmpty}>
                <Ionicons name="location-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No saved locations yet.</Text>
              </View>
            )}
            <TouchableOpacity style={styles.createButton} onPress={() => {
              const val = locationPickerFor === 'edit' ? editStorageLocation : newStorageLocation;
              if (locationPickerFor === 'edit') setEditStorageLocation(normalizeLocation(val));
              else setNewStorageLocation(normalizeLocation(val));
              setLocationPickerVisible(false);
            }}>
              <Text style={styles.createButtonText}>Use Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Project Picker Modal */}
      <Modal visible={projectPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Production</Text>
              <TouchableOpacity onPress={() => setProjectPickerVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={projects}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.assetRow, selectedProject === item.id && styles.assetRowSelected]} onPress={() => { setSelectedProject(item.id); setProjectPickerVisible(false); }}>
                  <View style={styles.assetRowBody}><Text style={styles.assetRowName}>{item.name}</Text><Text style={styles.assetRowCategory}>Production asset library</Text></View>
                  {selectedProject === item.id && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.md },
  title: { fontSize: Typography.fontSize2xl, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerIconBtn: { width: 36, height: 36, borderRadius: Radius.full, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  addButton: { backgroundColor: Colors.primary, width: 36, height: 36, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  selectorCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.lg, padding: Spacing.sm, ...Shadows.card },
  selectorLabel: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  selectorButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectorText: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, flex: 1, marginRight: Spacing.sm },
  heroAddButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.md, ...Shadows.card },
  heroAddTitle: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  heroAddSub: { color: '#000', fontSize: Typography.fontSizeXs, marginTop: 2, opacity: 0.75 },
  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: Spacing.md, gap: Spacing.xs, paddingBottom: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, lineHeight: 16 },
  filterChipTextActive: { color: '#000', fontWeight: Typography.fontWeightSemibold },
  grid: { padding: Spacing.md, paddingBottom: Spacing.xl },
  gridRow: { gap: Spacing.sm, marginBottom: Spacing.sm },
  card: { flex: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.surfaceBorder, ...Shadows.card },
  cardImageContainer: { width: '100%', height: 140, backgroundColor: Colors.surface },
  cardImage: { width: '100%', height: '100%' },
  cardBody: { padding: Spacing.sm },
  cardName: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  cardCategory: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2, textTransform: 'capitalize' },
  cardDimensions: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  cardLocation: { color: Colors.textMuted, fontSize: 10, flex: 1 },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center', lineHeight: 22 },
  detailImage: { width: '100%', height: 200, borderRadius: Radius.lg, marginBottom: Spacing.md, backgroundColor: Colors.surface },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder },
  detailLabel: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  detailValue: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, flexShrink: 1, textAlign: 'right' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  editBtnText: { color: '#000', fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingVertical: Spacing.sm },
  deleteButtonText: { color: Colors.error, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  importingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  importingText: { color: Colors.textSecondary, fontSize: Typography.fontSizeSm, textAlign: 'center' },
  importSummary: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, marginBottom: Spacing.xs, backgroundColor: Colors.surface },
  importRowError: { opacity: 0.5 },
  importRowName: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  importRowMeta: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2 },
  importRowImage: { color: Colors.primary, fontSize: 10, marginTop: 2 },
  importRowNoImage: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },
  importRowErrorText: { color: Colors.error, fontSize: 10, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalScrollContent: { paddingBottom: Spacing.xxl },
  modalSheet: { backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl, maxHeight: '90%' },
  modalSheetTall: { backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl, maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  photoPicker: { height: 160, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: Spacing.xs, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  photoPlaceholderText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm },
  galleryLink: { alignItems: 'center', marginBottom: Spacing.md },
  galleryLinkText: { color: Colors.primary, fontSize: Typography.fontSizeXs },
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.md, color: Colors.textPrimary, fontSize: Typography.fontSizeMd, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md },
  assetPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md },
  assetPickerSelected: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd, flex: 1, marginRight: Spacing.sm },
  locationPanel: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  locationHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  locationPanelTitle: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold },
  locationPanelHint: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, marginTop: 2 },
  locationBrowseButton: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  locationBrowseText: { color: '#000', fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold },
  noLocationButton: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.surfaceBorder, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 7, marginBottom: Spacing.sm },
  noLocationButtonActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  noLocationText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },
  noLocationTextActive: { color: '#000' },
  locationTextInput: { marginBottom: 0 },
  dimensionsRow: { flexDirection: 'row', gap: Spacing.sm },
  dimensionInput: { flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  toggleLabel: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  toggleSub: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: Colors.surfaceBorder, padding: 2, justifyContent: 'center' },
  toggleActive: { backgroundColor: Colors.primary },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  toggleThumbActive: { alignSelf: 'flex-end' },
  createButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm + 4, alignItems: 'center', marginTop: Spacing.sm, minHeight: 48, justifyContent: 'center' },
  createButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadingText: { color: '#000', fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold },
  bgTip: { color: Colors.textMuted, fontSize: Typography.fontSizeXs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 18 },
  assetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs, backgroundColor: Colors.surface },
  assetRowSelected: { borderWidth: 1, borderColor: Colors.primary },
  assetRowBody: { flex: 1 },
  assetRowName: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  assetRowCategory: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, textTransform: 'capitalize', marginTop: 2 },
  locationActionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.sm, backgroundColor: Colors.surface },
  locationIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated },
  inlineLocationInput: { color: Colors.textPrimary, fontSize: Typography.fontSizeSm, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder, paddingVertical: 6, marginTop: 4 },
  locationEmpty: { alignItems: 'center', padding: Spacing.xl },
});
