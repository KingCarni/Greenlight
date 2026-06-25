import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, Typography, Radius, Shadows } from '@/constants/theme';

const STATUSES = ['in_warehouse', 'on_set', 'in_transit', 'retired'] as const;
type Status = typeof STATUSES[number];

const STATUS_LABELS: Record<Status, string> = {
  in_warehouse: 'In Warehouse',
  on_set: 'On Set',
  in_transit: 'In Transit',
  retired: 'Retired',
};

const STATUS_COLORS: Record<Status, string> = {
  in_warehouse: '#4CAF50',
  on_set: Colors.primary,
  in_transit: '#FF9800',
  retired: Colors.textMuted,
};

const STATUS_ICONS: Record<Status, string> = {
  in_warehouse: 'cube-outline',
  on_set: 'film-outline',
  in_transit: 'car-outline',
  retired: 'archive-outline',
};

interface Project {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  asset_id: string;
  project_id: string;
  warehouse_location: string | null;
  quantity: number;
  status: Status;
  checked_out_by: string | null;
  notes: string | null;
  assets: {
    name: string;
    category: string;
    image_url: string;
  };
}

export default function InventoryScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);

  // Form state
  const [formLocation, setFormLocation] = useState('');
  const [formQuantity, setFormQuantity] = useState('1');
  const [formStatus, setFormStatus] = useState<Status>('in_warehouse');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Assets available to add to inventory
  const [assets, setAssets] = useState<{ id: string; name: string; category: string }[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetPickerVisible, setAssetPickerVisible] = useState(false);

  useEffect(() => { fetchProjects(); }, []);

  useFocusEffect(useCallback(() => {
    if (selectedProject) fetchInventory();
  }, [selectedProject, statusFilter]));

  async function fetchProjects() {
    if (!user) return;
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (data && data.length > 0) {
      setProjects(data as Project[]);
      setSelectedProject(data[0].id);
    }
  }

  async function fetchInventory() {
    if (!selectedProject) return;
    setLoading(true);

    let query = supabase
      .from('inventory')
      .select('*, assets(name, category, image_url)')
      .eq('project_id', selectedProject)
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching inventory:', error.message);
    else setInventory(data as InventoryItem[]);
    setLoading(false);
  }

  useEffect(() => {
    if (selectedProject) fetchInventory();
  }, [selectedProject, statusFilter]);

  async function fetchAssets() {
    const { data } = await supabase
      .from('assets')
      .select('id, name, category')
      .order('name', { ascending: true });
    if (data) setAssets(data);
  }

  function openAddModal() {
    setEditItem(null);
    setFormLocation('');
    setFormQuantity('1');
    setFormStatus('in_warehouse');
    setFormNotes('');
    setSelectedAssetId(null);
    fetchAssets();
    setModalVisible(true);
  }

  function openEditModal(item: InventoryItem) {
    setEditItem(item);
    setFormLocation(item.warehouse_location ?? '');
    setFormQuantity(String(item.quantity));
    setFormStatus(item.status);
    setFormNotes(item.notes ?? '');
    setSelectedAssetId(item.asset_id);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!selectedProject || !user) return;
    if (!editItem && !selectedAssetId) {
      Alert.alert('Required', 'Please select an asset.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: selectedProject,
        asset_id: editItem ? editItem.asset_id : selectedAssetId!,
        warehouse_location: formLocation.trim() || null,
        quantity: parseInt(formQuantity) || 1,
        status: formStatus,
        notes: formNotes.trim() || null,
        checked_out_by: formStatus === 'on_set' ? user.id : null,
      };

      if (editItem) {
        const { error } = await supabase
          .from('inventory')
          .update(payload)
          .eq('id', editItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert(payload);
        if (error) throw error;
      }

      setModalVisible(false);
      fetchInventory();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save inventory item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InventoryItem) {
    Alert.alert('Remove from inventory?', `Remove ${item.assets.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.from('inventory').delete().eq('id', item.id);
          fetchInventory();
        }
      },
    ]);
  }

  async function handleQuickStatus(item: InventoryItem, status: Status) {
    await supabase.from('inventory').update({ status }).eq('id', item.id);
    fetchInventory();
  }

  if (projects.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyText}>Create a project first{'\n'}to track inventory.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Project selector */}
      {projects.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.filterChip, selectedProject === p.id && styles.filterChipActive]}
              onPress={() => setSelectedProject(p.id)}
            >
              <Text style={[styles.filterChipText, selectedProject === p.id && styles.filterChipTextActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.filterChip, !statusFilter && styles.filterChipActive]}
          onPress={() => setStatusFilter(null)}
        >
          <Text style={[styles.filterChipText, !statusFilter && styles.filterChipTextActive]}>All</Text>
        </TouchableOpacity>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(statusFilter === s ? null : s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Inventory list */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={inventory}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={fetchInventory}
          refreshing={loading}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => openEditModal(item)}>
              <View style={styles.cardLeft}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] }]} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardName}>{item.assets.name}</Text>
                  <Text style={styles.cardCategory}>{item.assets.category}</Text>
                  {item.warehouse_location && (
                    <View style={styles.locationRow}>
                      <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                      <Text style={styles.cardLocation}>{item.warehouse_location}</Text>
                    </View>
                  )}
                  <View style={styles.cardMeta}>
                    <Text style={[styles.cardStatus, { color: STATUS_COLORS[item.status] }]}>
                      {STATUS_LABELS[item.status]}
                    </Text>
                    <Text style={styles.cardQty}>Qty: {item.quantity}</Text>
                  </View>
                </View>
              </View>

              {/* Quick status buttons */}
              <View style={styles.quickActions}>
                {item.status !== 'on_set' && (
                  <TouchableOpacity
                    style={styles.quickBtn}
                    onPress={() => handleQuickStatus(item, 'on_set')}
                  >
                    <Ionicons name="film-outline" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                )}
                {item.status !== 'in_warehouse' && (
                  <TouchableOpacity
                    style={styles.quickBtn}
                    onPress={() => handleQuickStatus(item, 'in_warehouse')}
                  >
                    <Ionicons name="cube-outline" size={18} color="#4CAF50" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.quickBtn}
                  onPress={() => handleDelete(item)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.error ?? '#ff3b30'} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No inventory yet.{'\n'}Tap + to add items from your asset library.</Text>
            </View>
          }
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editItem ? 'Edit Item' : 'Add to Inventory'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Asset picker (add mode only) */}
            {!editItem && (
              <>
                <Text style={styles.label}>Asset *</Text>
                <TouchableOpacity
                  style={styles.assetPicker}
                  onPress={() => { fetchAssets(); setAssetPickerVisible(true); }}
                >
                  <Text style={selectedAssetId ? styles.assetPickerSelected : styles.assetPickerPlaceholder}>
                    {selectedAssetId
                      ? assets.find(a => a.id === selectedAssetId)?.name ?? 'Select asset'
                      : 'Select asset from library'
                    }
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </>
            )}

            {editItem && (
              <View style={styles.editAssetLabel}>
                <Ionicons name="cube-outline" size={18} color={Colors.primary} />
                <Text style={styles.editAssetName}>{editItem.assets.name}</Text>
              </View>
            )}

            <Text style={styles.label}>Warehouse Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Shelf B3, Unit 12, Truck 2"
              placeholderTextColor={Colors.textMuted}
              value={formLocation}
              onChangeText={setFormLocation}
            />

            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor={Colors.textMuted}
              value={formQuantity}
              onChangeText={setFormQuantity}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                {STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusChip, formStatus === s && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] }]}
                    onPress={() => setFormStatus(s)}
                  >
                    <Text style={[styles.statusChipText, formStatus === s && { color: '#000' }]}>
                      {STATUS_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
              placeholder="Any notes about this item..."
              placeholderTextColor={Colors.textMuted}
              value={formNotes}
              onChangeText={setFormNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.saveButtonText}>{editItem ? 'Save Changes' : 'Add to Inventory'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Asset picker modal */}
      <Modal visible={assetPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Asset</Text>
              <TouchableOpacity onPress={() => setAssetPickerVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={assets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.assetRow, selectedAssetId === item.id && styles.assetRowSelected]}
                  onPress={() => { setSelectedAssetId(item.id); setAssetPickerVisible(false); }}
                >
                  <View style={styles.assetRowBody}>
                    <Text style={styles.assetRowName}>{item.name}</Text>
                    <Text style={styles.assetRowCategory}>{item.category}</Text>
                  </View>
                  {selectedAssetId === item.id && (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  )}
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
  },
  title: { fontSize: Typography.fontSize2xl, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  addButton: {
    backgroundColor: Colors.primary, width: 36, height: 36,
    borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center',
  },
  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: Spacing.md, gap: Spacing.xs, paddingBottom: Spacing.xs },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs },
  filterChipTextActive: { color: '#000', fontWeight: Typography.fontWeightSemibold },
  list: { padding: Spacing.md, paddingBottom: Spacing.xl },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.surfaceBorder,
    padding: Spacing.md, marginBottom: Spacing.sm,
    ...Shadows.card,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  cardBody: { flex: 1 },
  cardName: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  cardCategory: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginTop: 1, textTransform: 'capitalize' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  cardLocation: { fontSize: Typography.fontSizeXs, color: Colors.textMuted },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  cardStatus: { fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightSemibold },
  cardQty: { fontSize: Typography.fontSizeXs, color: Colors.textMuted },
  quickActions: { flexDirection: 'column', gap: Spacing.xs, alignItems: 'center' },
  quickBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  empty: { alignItems: 'center', marginTop: Spacing.xxl, paddingHorizontal: Spacing.xl },
  emptyText: { color: Colors.textMuted, fontSize: Typography.fontSizeSm, marginTop: Spacing.md, textAlign: 'center', lineHeight: 22 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: Spacing.xxl, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  modalTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },
  label: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md, color: Colors.textPrimary, fontSize: Typography.fontSizeMd,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md,
  },
  assetPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, marginBottom: Spacing.md,
  },
  assetPickerPlaceholder: { color: Colors.textMuted, fontSize: Typography.fontSizeMd },
  assetPickerSelected: { color: Colors.textPrimary, fontSize: Typography.fontSizeMd },
  editAssetLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  editAssetName: { fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  statusChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.surfaceBorder,
  },
  statusChipText: { color: Colors.textMuted, fontSize: Typography.fontSizeXs },
  saveButton: {
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.sm + 4,
    alignItems: 'center', marginTop: Spacing.sm, minHeight: 48, justifyContent: 'center',
  },
  saveButtonText: { color: '#000', fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightBold },
  assetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xs, backgroundColor: Colors.surface,
  },
  assetRowSelected: { borderWidth: 1, borderColor: Colors.primary },
  assetRowBody: { flex: 1 },
  assetRowName: { fontSize: Typography.fontSizeSm, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  assetRowCategory: { fontSize: Typography.fontSizeXs, color: Colors.textMuted, textTransform: 'capitalize' },
});
