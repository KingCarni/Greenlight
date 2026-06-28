import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ScrollView, TextInput, Alert, Image, ActivityIndicator,
  RefreshControl, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type ListingStatus = 'active' | 'reserved' | 'rented' | 'sold' | 'inactive';
type ListingType = 'sale' | 'rent' | 'both';
type SellerType = 'prop_shop' | 'warehouse' | 'independent';
type Condition = 'new' | 'excellent' | 'good' | 'fair' | 'poor';
type MainTab = 'my_listings' | 'browse' | 'messages';

interface MarketplaceListing {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  condition: Condition | null;
  listing_type: ListingType;
  sale_price: number | null;
  rental_price_per_day: number | null;
  min_rental_days: number | null;
  city: string | null;
  region: string | null;
  country: string;
  seller_type: SellerType | null;
  status: ListingStatus;
  image_urls: string[] | null;
  dimensions: any | null;
  created_at: string;
  updated_at: string;
}

interface Reservation {
  id: string;
  listing_id: string;
  requester_id: string;
  seller_id: string;
  requested_start_date: string | null;
  requested_end_date: string | null;
  rental_days: number | null;
  agreed_price: number | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes: string | null;
  created_at: string;
  marketplace_listings: MarketplaceListing;
}

interface Message {
  id: string;
  reservation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  category: string;
  tags: string;
  condition: Condition;
  listing_type: ListingType;
  sale_price: string;
  rental_price_per_day: string;
  min_rental_days: string;
  city: string;
  region: string;
  seller_type: SellerType;
  imageUri: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  title: '', description: '', category: '', tags: '',
  condition: 'good', listing_type: 'rent',
  sale_price: '', rental_price_per_day: '', min_rental_days: '1',
  city: '', region: '', seller_type: 'independent', imageUri: null,
};

const CATEGORIES = [
  'Furniture', 'Lighting', 'Decor', 'Textiles', 'Art', 'Electronics',
  'Kitchen', 'Outdoor', 'Vintage', 'Industrial', 'Period', 'Other',
];
const CONDITIONS: Condition[] = ['new', 'excellent', 'good', 'fair', 'poor'];
const LISTING_TYPES: { value: ListingType; label: string }[] = [
  { value: 'rent', label: 'Rent Only' },
  { value: 'sale', label: 'Sale Only' },
  { value: 'both', label: 'Sale & Rent' },
];
const SELLER_TYPES: { value: SellerType; label: string }[] = [
  { value: 'independent', label: 'Independent' },
  { value: 'prop_shop', label: 'Prop Shop' },
  { value: 'warehouse', label: 'Warehouse' },
];
const STATUS_COLORS: Record<ListingStatus, string> = {
  active: '#22c55e', reserved: '#f59e0b',
  rented: '#3b82f6', sold: '#6b7280', inactive: '#444',
};
const RES_STATUS_COLORS = {
  pending: '#f59e0b', confirmed: '#22c55e',
  cancelled: '#6b7280', completed: '#3b82f6',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const calcRentalDays = (start: Date | null, end: Date | null): number => {
  if (!start || !end) return 0;
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
};

const fmtDate = (d: Date | null): string => {
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtDateShort = (iso: string | null): string => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarketplaceScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [activeTab, setActiveTab] = useState<MainTab>('my_listings');

  // My Listings
  const [myListings, setMyListings] = useState<MarketplaceListing[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myRefreshing, setMyRefreshing] = useState(false);

  // Browse
  const [browseListings, setBrowseListings] = useState<MarketplaceListing[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseRefreshing, setBrowseRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState<ListingType | ''>('');

  // Messages
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesRefreshing, setMessagesRefreshing] = useState(false);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [showThreadModal, setShowThreadModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Create/Edit
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Detail
  const [detailListing, setDetailListing] = useState<MarketplaceListing | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Reserve
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [reserveNotes, setReserveNotes] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [submittingReserve, setSubmittingReserve] = useState(false);

  // ─── Fetch My Listings ──────────────────────────────────────────────────────

  const fetchMyListings = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMyListings(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setMyLoading(false);
      setMyRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { fetchMyListings(); }, [fetchMyListings]);

  // ─── Fetch Browse ───────────────────────────────────────────────────────────

  const fetchBrowseListings = useCallback(async () => {
    setBrowseLoading(true);
    try {
      let query = supabase
        .from('marketplace_listings')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (filterCategory) query = query.eq('category', filterCategory);
      if (filterType) query = query.in('listing_type', [filterType, 'both']);
      const { data, error } = await query;
      if (error) throw error;
      let results = data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        results = results.filter((l: MarketplaceListing) =>
          l.title.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q) ||
          l.tags?.some((t: string) => t.toLowerCase().includes(q))
        );
      }
      setBrowseListings(results);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setBrowseLoading(false);
      setBrowseRefreshing(false);
    }
  }, [filterCategory, filterType, searchQuery]);

  useEffect(() => {
    if (activeTab === 'browse') fetchBrowseListings();
  }, [activeTab, fetchBrowseListings]);

  // ─── Fetch Reservations ─────────────────────────────────────────────────────

  const fetchReservations = useCallback(async () => {
    if (!userId) return;
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_reservations')
        .select('*, marketplace_listings(*)')
        .or(`requester_id.eq.${userId},seller_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReservations(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setMessagesLoading(false);
      setMessagesRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (activeTab === 'messages') fetchReservations();
  }, [activeTab, fetchReservations]);

  // ─── Fetch Thread ───────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (reservationId: string) => {
    setThreadLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketplace_messages')
        .select('*')
        .eq('reservation_id', reservationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const openThread = (reservation: Reservation) => {
    setActiveReservation(reservation);
    setShowThreadModal(true);
    fetchMessages(reservation.id);
  };

  // ─── Send Message ───────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeReservation || !userId) return;
    setSendingMessage(true);
    try {
      const { error } = await supabase.from('marketplace_messages').insert({
        reservation_id: activeReservation.id,
        sender_id: userId,
        content: newMessage.trim(),
      });
      if (error) throw error;
      setNewMessage('');
      await fetchMessages(activeReservation.id);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // ─── Update Reservation Status ──────────────────────────────────────────────

  const updateReservationStatus = async (
    reservation: Reservation,
    status: 'confirmed' | 'cancelled' | 'completed'
  ) => {
    const labels = { confirmed: 'Confirm', cancelled: 'Decline', completed: 'Mark Complete' };
    Alert.alert(`${labels[status]}?`, 'This will update the reservation status.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: labels[status],
        style: status === 'cancelled' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('marketplace_reservations')
              .update({ status })
              .eq('id', reservation.id);
            if (error) throw error;

            // Write revenue log on completion
            if (status === 'completed' && reservation.agreed_price) {
              await supabase.from('marketplace_revenue_log').insert({
                listing_id: reservation.listing_id,
                reservation_id: reservation.id,
                seller_id: reservation.seller_id,
                amount: reservation.agreed_price,
                rental_days: reservation.rental_days,
                platform_fee_pct: 5.00,
                completed_at: new Date().toISOString(),
              });
            }

            // Relist on cancellation
            if (status === 'cancelled') {
              await supabase.from('marketplace_listings')
                .update({ status: 'active', updated_at: new Date().toISOString() })
                .eq('id', reservation.listing_id);
            }

            fetchReservations();
            setShowThreadModal(false);
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ─── Image ──────────────────────────────────────────────────────────────────

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setForm(f => ({ ...f, imageUri: result.assets[0].uri }));
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    setUploadingImage(true);
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const filename = `${userId}/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error } = await supabase.storage
        .from('marketplace')
        .upload(filename, arrayBuffer, { contentType: `image/${ext}` });
      if (error) throw error;
      const { data } = supabase.storage.from('marketplace').getPublicUrl(filename);
      return data.publicUrl;
    } catch (err: any) {
      Alert.alert('Image upload failed', err.message);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  // ─── Create / Edit ──────────────────────────────────────────────────────────

  const openCreate = () => { setEditingListing(null); setForm(EMPTY_FORM); setShowCreateModal(true); };

  const openEdit = (listing: MarketplaceListing) => {
    setEditingListing(listing);
    setForm({
      title: listing.title, description: listing.description ?? '',
      category: listing.category ?? '', tags: (listing.tags ?? []).join(', '),
      condition: listing.condition ?? 'good', listing_type: listing.listing_type,
      sale_price: listing.sale_price?.toString() ?? '',
      rental_price_per_day: listing.rental_price_per_day?.toString() ?? '',
      min_rental_days: listing.min_rental_days?.toString() ?? '1',
      city: listing.city ?? '', region: listing.region ?? '',
      seller_type: listing.seller_type ?? 'independent',
      imageUri: listing.image_urls?.[0] ?? null,
    });
    setShowCreateModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { Alert.alert('Title required'); return; }
    if (!form.city.trim()) { Alert.alert('City required'); return; }
    setSaving(true);
    try {
      let imageUrls: string[] = editingListing?.image_urls ?? [];
      if (form.imageUri && !form.imageUri.startsWith('http')) {
        const url = await uploadImage(form.imageUri);
        if (url) imageUrls = [url];
      } else if (form.imageUri) {
        imageUrls = [form.imageUri];
      }
      const payload = {
        title: form.title.trim(), description: form.description.trim() || null,
        category: form.category || null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : null,
        condition: form.condition, listing_type: form.listing_type,
        sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
        rental_price_per_day: form.rental_price_per_day ? parseFloat(form.rental_price_per_day) : null,
        min_rental_days: form.min_rental_days ? parseInt(form.min_rental_days) : 1,
        city: form.city.trim(), region: form.region.trim() || null,
        seller_type: form.seller_type,
        image_urls: imageUrls.length > 0 ? imageUrls : null,
        updated_at: new Date().toISOString(),
      };
      if (editingListing) {
        const { error } = await supabase.from('marketplace_listings').update(payload)
          .eq('id', editingListing.id).eq('seller_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marketplace_listings')
          .insert({ ...payload, seller_id: userId, status: 'active' });
        if (error) throw error;
      }
      setShowCreateModal(false);
      fetchMyListings();
    } catch (err: any) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Status ─────────────────────────────────────────────────────────────────

  const updateStatus = async (listing: MarketplaceListing, status: ListingStatus) => {
    const label = status === 'active' ? 'Relist' : status.charAt(0).toUpperCase() + status.slice(1);
    Alert.alert(`${label}?`, `"${listing.title}"`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          const { error } = await supabase.from('marketplace_listings')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', listing.id).eq('seller_id', userId);
          if (error) Alert.alert('Error', error.message);
          else fetchMyListings();
        },
      },
    ]);
  };

  const confirmDelete = (listing: MarketplaceListing) => {
    Alert.alert('Delete Listing', `Permanently delete "${listing.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('marketplace_listings').delete()
            .eq('id', listing.id).eq('seller_id', userId);
          if (error) Alert.alert('Error', error.message);
          else fetchMyListings();
        },
      },
    ]);
  };

  // ─── Reserve ────────────────────────────────────────────────────────────────

  const openReserve = (listing: MarketplaceListing) => {
    setDetailListing(listing);
    setStartDate(null); setEndDate(null); setReserveNotes('');
    setShowStartPicker(false); setShowEndPicker(false);
    setShowReserveModal(true);
  };

  const handleReserve = async () => {
    if (!detailListing || !userId) return;
    const isRent = detailListing.listing_type === 'rent' || detailListing.listing_type === 'both';
    if (isRent && (!startDate || !endDate)) { Alert.alert('Please select start and end dates'); return; }
    if (isRent && startDate && endDate && endDate <= startDate) { Alert.alert('End date must be after start date'); return; }
    setSubmittingReserve(true);
    try {
      const rentalDays = isRent ? calcRentalDays(startDate, endDate) : null;
      const agreedPrice = isRent && detailListing.rental_price_per_day && rentalDays
        ? detailListing.rental_price_per_day * rentalDays
        : detailListing.sale_price ?? null;

      const { error: resError } = await supabase.from('marketplace_reservations').insert({
        listing_id: detailListing.id,
        requester_id: userId,
        seller_id: detailListing.seller_id,
        requested_start_date: startDate ? startDate.toISOString().split('T')[0] : null,
        requested_end_date: endDate ? endDate.toISOString().split('T')[0] : null,
        rental_days: rentalDays,
        agreed_price: agreedPrice,
        notes: reserveNotes.trim() || null,
        status: 'pending',
      });
      if (resError) throw resError;

      const { error: statusError } = await supabase.from('marketplace_listings')
        .update({ status: 'reserved', updated_at: new Date().toISOString() })
        .eq('id', detailListing.id);
      if (statusError) throw statusError;

      setShowReserveModal(false);
      setShowDetailModal(false);
      fetchMyListings();
      fetchBrowseListings();
      Alert.alert('Request sent!', 'Check the Messages tab to follow up with the seller.');
    } catch (err: any) {
      Alert.alert('Reserve failed', err.message);
    } finally {
      setSubmittingReserve(false);
    }
  };

  // ─── Option chip helper ──────────────────────────────────────────────────────

  function OptionRow<T extends string>({
    label, value, options, onChange,
  }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
    return (
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.optionRow}>
            {options.map(o => (
              <TouchableOpacity key={o.value}
                style={[styles.optionChip, value === o.value && styles.optionChipActive]}
                onPress={() => onChange(o.value)}>
                <Text style={[styles.optionChipText, value === o.value && styles.optionChipTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ─── My Listing Card ─────────────────────────────────────────────────────────

  const renderMyListing = ({ item }: { item: MarketplaceListing }) => (
    <View style={styles.card}>
      {item.image_urls?.[0]
        ? <Image source={{ uri: item.image_urls[0] }} style={styles.cardImage} />
        : <View style={styles.cardImagePlaceholder}><Text style={styles.placeholderText}>No Photo</Text></View>}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
            <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        {item.category && <Text style={styles.cardMeta}>{item.category}</Text>}
        <View style={styles.priceRow}>
          {item.rental_price_per_day != null && <Text style={styles.price}>${item.rental_price_per_day}/day</Text>}
          {item.sale_price != null && <Text style={styles.price}>{item.rental_price_per_day != null ? '  ' : ''}${item.sale_price} sale</Text>}
        </View>
        {item.city && <Text style={styles.cardMeta}>📍 {item.city}{item.region ? `, ${item.region}` : ''}</Text>}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          {item.status === 'active' && (
            <>
              <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'rented')}>
                <Text style={styles.actionBtnText}>Rented</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'sold')}>
                <Text style={styles.actionBtnText}>Sold</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item, 'inactive')}>
                <Text style={styles.actionBtnText}>Deactivate</Text>
              </TouchableOpacity>
            </>
          )}
          {item.status !== 'active' && (
            <TouchableOpacity style={[styles.actionBtn, styles.relistBtn]} onPress={() => updateStatus(item, 'active')}>
              <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>Relist</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item)}>
            <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ─── Browse Card ──────────────────────────────────────────────────────────────

  const renderBrowseCard = ({ item }: { item: MarketplaceListing }) => (
    <TouchableOpacity style={styles.card}
      onPress={() => { setDetailListing(item); setShowDetailModal(true); }} activeOpacity={0.85}>
      {item.image_urls?.[0]
        ? <Image source={{ uri: item.image_urls[0] }} style={styles.cardImage} />
        : <View style={styles.cardImagePlaceholder}><Text style={styles.placeholderText}>No Photo</Text></View>}
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{item.listing_type.toUpperCase()}</Text></View>
        </View>
        {item.category && <Text style={styles.cardMeta}>{item.category}</Text>}
        <View style={styles.priceRow}>
          {item.rental_price_per_day != null && <Text style={styles.price}>${item.rental_price_per_day}/day</Text>}
          {item.sale_price != null && <Text style={styles.price}>{item.rental_price_per_day != null ? '  ' : ''}${item.sale_price} sale</Text>}
        </View>
        {item.city && <Text style={styles.cardMeta}>📍 {item.city}{item.region ? `, ${item.region}` : ''}</Text>}
        {item.seller_type && <Text style={styles.cardMeta}>🏪 {item.seller_type.replace('_', ' ')}</Text>}
      </View>
    </TouchableOpacity>
  );

  // ─── Reservation Row ──────────────────────────────────────────────────────────

  const renderReservationRow = ({ item }: { item: Reservation }) => {
    const isSeller = item.seller_id === userId;
    const listing = item.marketplace_listings;
    return (
      <TouchableOpacity style={styles.threadRow} onPress={() => openThread(item)}>
        {listing?.image_urls?.[0]
          ? <Image source={{ uri: listing.image_urls[0] }} style={styles.threadThumb} />
          : <View style={[styles.threadThumb, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#444', fontSize: 10 }}>No img</Text>
            </View>}
        <View style={styles.threadInfo}>
          <Text style={styles.threadTitle} numberOfLines={1}>{listing?.title ?? 'Listing'}</Text>
          <Text style={styles.threadMeta}>{isSeller ? '📥 Incoming request' : '📤 Your request'}</Text>
          {item.requested_start_date && (
            <Text style={styles.threadMeta}>
              {fmtDateShort(item.requested_start_date)} → {fmtDateShort(item.requested_end_date)}
            </Text>
          )}
          {item.agreed_price != null && (
            <Text style={styles.threadMeta}>Est. ${item.agreed_price.toFixed(2)}</Text>
          )}
        </View>
        <View style={[styles.resBadge, { backgroundColor: RES_STATUS_COLORS[item.status] }]}>
          <Text style={styles.resBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Detail Modal ─────────────────────────────────────────────────────────────

  const renderDetailModal = () => {
    if (!detailListing) return null;
    const isOwner = detailListing.seller_id === userId;
    const isRent = detailListing.listing_type === 'rent' || detailListing.listing_type === 'both';
    const isSale = detailListing.listing_type === 'sale' || detailListing.listing_type === 'both';
    return (
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{detailListing.title}</Text>
            <View style={{ width: 48 }} />
          </View>
          <ScrollView style={styles.modalScroll}>
            {detailListing.image_urls?.[0]
              ? <Image source={{ uri: detailListing.image_urls[0] }} style={styles.detailImage} />
              : <View style={styles.detailImagePlaceholder}><Text style={styles.placeholderText}>No Photo</Text></View>}
            <View style={styles.detailBody}>
              <View style={styles.badgeRow}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[detailListing.status] }]}>
                  <Text style={styles.statusText}>{detailListing.status.toUpperCase()}</Text>
                </View>
                <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{detailListing.listing_type.toUpperCase()}</Text></View>
                {detailListing.condition && (
                  <View style={styles.condBadge}><Text style={styles.condBadgeText}>{detailListing.condition}</Text></View>
                )}
              </View>
              <Text style={styles.detailTitle}>{detailListing.title}</Text>
              {detailListing.description && <Text style={styles.detailDesc}>{detailListing.description}</Text>}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionLabel}>PRICING</Text>
                {isRent && detailListing.rental_price_per_day != null && (
                  <Text style={styles.detailPrice}>
                    ${detailListing.rental_price_per_day}/day
                    {detailListing.min_rental_days && detailListing.min_rental_days > 1
                      ? `  ·  ${detailListing.min_rental_days} day minimum` : ''}
                  </Text>
                )}
                {isSale && detailListing.sale_price != null && (
                  <Text style={styles.detailPrice}>${detailListing.sale_price} — for sale</Text>
                )}
              </View>
              {(detailListing.city || detailListing.region) && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionLabel}>LOCATION</Text>
                  <Text style={styles.detailValue}>
                    📍 {[detailListing.city, detailListing.region, detailListing.country].filter(Boolean).join(', ')}
                  </Text>
                </View>
              )}
              {detailListing.seller_type && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionLabel}>SELLER</Text>
                  <Text style={styles.detailValue}>🏪 {detailListing.seller_type.replace('_', ' ')}</Text>
                </View>
              )}
              {(detailListing.category || (detailListing.tags && detailListing.tags.length > 0)) && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionLabel}>CATEGORY & TAGS</Text>
                  {detailListing.category && <Text style={styles.detailValue}>{detailListing.category}</Text>}
                  {detailListing.tags && detailListing.tags.length > 0 && (
                    <View style={styles.tagRow}>
                      {detailListing.tags.map(tag => (
                        <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
                      ))}
                    </View>
                  )}
                </View>
              )}
              {!isOwner && detailListing.status === 'active' && (
                <TouchableOpacity style={styles.reserveBtn} onPress={() => openReserve(detailListing)}>
                  <Text style={styles.reserveBtnText}>
                    {isSale && !isRent ? 'Request to Purchase' : 'Reserve This Item'}
                  </Text>
                </TouchableOpacity>
              )}
              {!isOwner && detailListing.status !== 'active' && (
                <View style={styles.unavailableBanner}>
                  <Text style={styles.unavailableText}>
                    This item is currently {detailListing.status} and not available.
                  </Text>
                </View>
              )}
              <View style={{ height: 40 }} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Reserve Modal ────────────────────────────────────────────────────────────

  const renderReserveModal = () => {
    if (!detailListing) return null;
    const isRent = detailListing.listing_type === 'rent' || detailListing.listing_type === 'both';
    const rentalDays = calcRentalDays(startDate, endDate);
    const estimatedTotal = isRent && detailListing.rental_price_per_day && rentalDays > 0
      ? (detailListing.rental_price_per_day * rentalDays).toFixed(2) : null;

    return (
      <Modal visible={showReserveModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowReserveModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {isRent && detailListing.listing_type !== 'sale' ? 'Reserve Item' : 'Request Item'}
            </Text>
            <TouchableOpacity onPress={handleReserve} disabled={submittingReserve}>
              <Text style={[styles.saveText, submittingReserve && { opacity: 0.4 }]}>
                {submittingReserve ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.reserveSummary}>
              <Text style={styles.reserveSummaryTitle}>{detailListing.title}</Text>
              {detailListing.city && (
                <Text style={styles.reserveSummaryMeta}>
                  📍 {detailListing.city}{detailListing.region ? `, ${detailListing.region}` : ''}
                </Text>
              )}
              {isRent && detailListing.rental_price_per_day != null && (
                <Text style={styles.reserveSummaryMeta}>${detailListing.rental_price_per_day}/day</Text>
              )}
              {detailListing.sale_price != null && (
                <Text style={styles.reserveSummaryMeta}>${detailListing.sale_price} sale price</Text>
              )}
            </View>

            {isRent && (
              <>
                {/* Start date */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Start Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtn}
                    onPress={() => { setShowStartPicker(true); setShowEndPicker(false); }}>
                    <Text style={[styles.datePickerBtnText, !startDate && { color: '#555' }]}>
                      {startDate ? fmtDate(startDate) : 'Select start date'}
                    </Text>
                    <Text style={styles.datePickerIcon}>📅</Text>
                  </TouchableOpacity>
                  {showStartPicker && (
                    <DateTimePicker
                      value={startDate ?? new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={new Date()}
                      themeVariant="dark"
                      onChange={(_, date) => {
                        setShowStartPicker(Platform.OS === 'ios');
                        if (date) {
                          setStartDate(date);
                          if (endDate && endDate <= date) setEndDate(null);
                        }
                      }}
                    />
                  )}
                </View>

                {/* End date */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>End Date *</Text>
                  <TouchableOpacity style={styles.datePickerBtn}
                    onPress={() => { setShowEndPicker(true); setShowStartPicker(false); }}>
                    <Text style={[styles.datePickerBtnText, !endDate && { color: '#555' }]}>
                      {endDate ? fmtDate(endDate) : 'Select end date'}
                    </Text>
                    <Text style={styles.datePickerIcon}>📅</Text>
                  </TouchableOpacity>
                  {showEndPicker && (
                    <DateTimePicker
                      value={endDate ?? (startDate ? new Date(startDate.getTime() + 86400000) : new Date())}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      minimumDate={startDate ? new Date(startDate.getTime() + 86400000) : new Date()}
                      themeVariant="dark"
                      onChange={(_, date) => {
                        setShowEndPicker(Platform.OS === 'ios');
                        if (date) setEndDate(date);
                      }}
                    />
                  )}
                </View>

                {rentalDays > 0 && (
                  <View style={styles.rentalCalc}>
                    <Text style={styles.rentalCalcText}>
                      {rentalDays} day{rentalDays !== 1 ? 's' : ''}
                      {estimatedTotal ? `  ·  Est. $${estimatedTotal}` : ''}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{isRent ? 'Notes / Intended Use' : 'Message to Seller'}</Text>
              <TextInput style={[styles.input, styles.inputMulti]} value={reserveNotes}
                onChangeText={setReserveNotes}
                placeholder={isRent
                  ? 'Production name, pickup preference, any questions...'
                  : "Tell the seller why you're interested, your production, any questions..."}
                placeholderTextColor="#555" multiline numberOfLines={4} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.reserveDisclaimer}>
                No payment is collected through Greenlight. The seller will respond to confirm details.
              </Text>
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Thread Modal ─────────────────────────────────────────────────────────────

  const renderThreadModal = () => {
    if (!activeReservation) return null;
    const isSeller = activeReservation.seller_id === userId;
    const listing = activeReservation.marketplace_listings;
    return (
      <Modal visible={showThreadModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowThreadModal(false)}>
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>{listing?.title ?? 'Reservation'}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Summary */}
          <View style={styles.threadSummary}>
            <View style={{ flex: 1 }}>
              <Text style={styles.threadSummaryRole}>{isSeller ? '📥 Incoming request' : '📤 Your request'}</Text>
              {activeReservation.requested_start_date && (
                <Text style={styles.threadSummaryMeta}>
                  {fmtDateShort(activeReservation.requested_start_date)} → {fmtDateShort(activeReservation.requested_end_date)}
                  {activeReservation.rental_days ? `  ·  ${activeReservation.rental_days} days` : ''}
                </Text>
              )}
              {activeReservation.agreed_price != null && (
                <Text style={styles.threadSummaryMeta}>Est. ${activeReservation.agreed_price.toFixed(2)}</Text>
              )}
              {activeReservation.notes && (
                <Text style={styles.threadSummaryMeta} numberOfLines={2}>"{activeReservation.notes}"</Text>
              )}
            </View>
            <View style={[styles.resBadge, { backgroundColor: RES_STATUS_COLORS[activeReservation.status] }]}>
              <Text style={styles.resBadgeText}>{activeReservation.status.toUpperCase()}</Text>
            </View>
          </View>

          {/* Seller actions */}
          {isSeller && activeReservation.status === 'pending' && (
            <View style={styles.threadActions}>
              <TouchableOpacity style={[styles.threadActionBtn, { borderColor: '#22c55e' }]}
                onPress={() => updateReservationStatus(activeReservation, 'confirmed')}>
                <Text style={[styles.threadActionText, { color: '#22c55e' }]}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.threadActionBtn, { borderColor: '#ef4444' }]}
                onPress={() => updateReservationStatus(activeReservation, 'cancelled')}>
                <Text style={[styles.threadActionText, { color: '#ef4444' }]}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
          {isSeller && activeReservation.status === 'confirmed' && (
            <View style={styles.threadActions}>
              <TouchableOpacity style={[styles.threadActionBtn, { borderColor: '#3b82f6' }]}
                onPress={() => updateReservationStatus(activeReservation, 'completed')}>
                <Text style={[styles.threadActionText, { color: '#3b82f6' }]}>Mark Complete</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Messages */}
          {threadLoading
            ? <ActivityIndicator style={{ marginTop: 20 }} color="#22c55e" />
            : (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.messagesList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                ListEmptyComponent={
                  <View style={styles.emptyMessages}>
                    <Text style={styles.emptyMessagesText}>No messages yet. Say hello!</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isMe = item.sender_id === userId;
                  return (
                    <View style={[styles.messageBubbleWrap, isMe && styles.messageBubbleWrapMe]}>
                      <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleThem]}>
                        <Text style={[styles.messageBubbleText, isMe && { color: '#000' }]}>{item.content}</Text>
                      </View>
                      <Text style={styles.messageTime}>{fmtTime(item.created_at)}</Text>
                    </View>
                  );
                }}
              />
            )
          }

          {/* Input */}
          {activeReservation.status !== 'cancelled' && activeReservation.status !== 'completed' && (
            <View style={styles.messageInputRow}>
              <TextInput
                style={styles.messageInput}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type a message..."
                placeholderTextColor="#555"
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!newMessage.trim() || sendingMessage) && { opacity: 0.4 }]}
                onPress={sendMessage}
                disabled={!newMessage.trim() || sendingMessage}
              >
                <Text style={styles.sendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  // ─── Create/Edit Modal ────────────────────────────────────────────────────────

  const renderCreateModal = () => (
    <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editingListing ? 'Edit Listing' : 'New Listing'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving || uploadingImage}>
            <Text style={[styles.saveText, (saving || uploadingImage) && { opacity: 0.4 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Photo</Text>
            <TouchableOpacity style={styles.photoPicker} onPress={pickImage}>
              {form.imageUri
                ? <Image source={{ uri: form.imageUri }} style={styles.photoPreview} />
                : <Text style={styles.photoPickerText}>Tap to add photo</Text>}
            </TouchableOpacity>
            {uploadingImage && <ActivityIndicator style={{ marginTop: 8 }} color="#22c55e" />}
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Title *</Text>
            <TextInput style={styles.input} value={form.title}
              onChangeText={v => setForm(f => ({ ...f, title: v }))}
              placeholder="e.g. Mid-century Lounge Chair" placeholderTextColor="#555" />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))}
              placeholder="Details, era, style notes..." placeholderTextColor="#555" multiline numberOfLines={3} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.optionRow}>
                {CATEGORIES.map(c => (
                  <TouchableOpacity key={c}
                    style={[styles.optionChip, form.category === c && styles.optionChipActive]}
                    onPress={() => setForm(f => ({ ...f, category: c }))}>
                    <Text style={[styles.optionChipText, form.category === c && styles.optionChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tags (comma separated)</Text>
            <TextInput style={styles.input} value={form.tags}
              onChangeText={v => setForm(f => ({ ...f, tags: v }))}
              placeholder="e.g. vintage, 1960s, walnut" placeholderTextColor="#555" />
          </View>
          <OptionRow label="Condition" value={form.condition}
            options={CONDITIONS.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            onChange={v => setForm(f => ({ ...f, condition: v }))} />
          <OptionRow label="Listing Type" value={form.listing_type} options={LISTING_TYPES}
            onChange={v => setForm(f => ({ ...f, listing_type: v }))} />
          {(form.listing_type === 'rent' || form.listing_type === 'both') && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Rental Price / Day ($)</Text>
              <TextInput style={styles.input} value={form.rental_price_per_day}
                onChangeText={v => setForm(f => ({ ...f, rental_price_per_day: v }))}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#555" />
              <Text style={[styles.label, { marginTop: 12 }]}>Min Rental Days</Text>
              <TextInput style={styles.input} value={form.min_rental_days}
                onChangeText={v => setForm(f => ({ ...f, min_rental_days: v }))}
                keyboardType="number-pad" placeholder="1" placeholderTextColor="#555" />
            </View>
          )}
          {(form.listing_type === 'sale' || form.listing_type === 'both') && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Sale Price ($)</Text>
              <TextInput style={styles.input} value={form.sale_price}
                onChangeText={v => setForm(f => ({ ...f, sale_price: v }))}
                keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor="#555" />
            </View>
          )}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>City *</Text>
            <TextInput style={styles.input} value={form.city}
              onChangeText={v => setForm(f => ({ ...f, city: v }))}
              placeholder="e.g. Vancouver" placeholderTextColor="#555" />
            <Text style={[styles.label, { marginTop: 12 }]}>Province / Region</Text>
            <TextInput style={styles.input} value={form.region}
              onChangeText={v => setForm(f => ({ ...f, region: v }))}
              placeholder="e.g. BC" placeholderTextColor="#555" />
          </View>
          <OptionRow label="Seller Type" value={form.seller_type} options={SELLER_TYPES}
            onChange={v => setForm(f => ({ ...f, seller_type: v }))} />
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Marketplace</Text>
        <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
          <Text style={styles.createBtnText}>+ List Item</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {([
          { key: 'my_listings', label: 'My Listings' },
          { key: 'browse', label: 'Browse' },
          { key: 'messages', label: 'Messages' },
        ] as { key: MainTab; label: string }[]).map(t => (
          <TouchableOpacity key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}>
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* MY LISTINGS */}
      {activeTab === 'my_listings' && (
        myLoading ? <ActivityIndicator style={{ marginTop: 40 }} color="#22c55e" /> :
        myListings.length === 0
          ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No listings yet</Text>
              <Text style={styles.emptySub}>Tap "+ List Item" to post your first prop or set piece.</Text>
            </View>
          : <FlatList data={myListings} keyExtractor={i => i.id} renderItem={renderMyListing}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={myRefreshing}
                onRefresh={() => { setMyRefreshing(true); fetchMyListings(); }} tintColor="#22c55e" />} />
      )}

      {/* BROWSE */}
      {activeTab === 'browse' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery}
              placeholder="Search listings..." placeholderTextColor="#555"
              returnKeyType="search" onSubmitEditing={fetchBrowseListings} />
            <TouchableOpacity style={styles.searchBtn} onPress={fetchBrowseListings}>
              <Text style={styles.searchBtnText}>Go</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterRow}>
              {(['', 'rent', 'sale'] as const).map(t => (
                <TouchableOpacity key={t || 'all'}
                  style={[styles.filterChip, filterType === t && styles.filterChipActive]}
                  onPress={() => setFilterType(t as ListingType | '')}>
                  <Text style={[styles.filterChipText, filterType === t && styles.filterChipTextActive]}>
                    {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={styles.filterDivider} />
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c}
                  style={[styles.filterChip, filterCategory === c && styles.filterChipActive]}
                  onPress={() => setFilterCategory(filterCategory === c ? '' : c)}>
                  <Text style={[styles.filterChipText, filterCategory === c && styles.filterChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {browseLoading ? <ActivityIndicator style={{ marginTop: 40 }} color="#22c55e" /> :
            browseListings.length === 0
              ? <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No listings found</Text>
                  <Text style={styles.emptySub}>Try adjusting your search or filters.</Text>
                </View>
              : <FlatList data={browseListings} keyExtractor={i => i.id} renderItem={renderBrowseCard}
                  contentContainerStyle={styles.list}
                  refreshControl={<RefreshControl refreshing={browseRefreshing}
                    onRefresh={() => { setBrowseRefreshing(true); fetchBrowseListings(); }} tintColor="#22c55e" />} />
          }
        </View>
      )}

      {/* MESSAGES */}
      {activeTab === 'messages' && (
        messagesLoading ? <ActivityIndicator style={{ marginTop: 40 }} color="#22c55e" /> :
        reservations.length === 0
          ? <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>Reservation conversations will appear here.</Text>
            </View>
          : <FlatList data={reservations} keyExtractor={i => i.id} renderItem={renderReservationRow}
              contentContainerStyle={{ paddingVertical: 8 }}
              refreshControl={<RefreshControl refreshing={messagesRefreshing}
                onRefresh={() => { setMessagesRefreshing(true); fetchReservations(); }} tintColor="#22c55e" />} />
      )}

      {renderCreateModal()}
      {renderDetailModal()}
      {renderReserveModal()}
      {renderThreadModal()}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  createBtn: { backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#22c55e' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#22c55e' },
  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#111', color: '#fff', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  searchBtn: { backgroundColor: '#22c55e', paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center' },
  searchBtnText: { color: '#000', fontWeight: '700' },
  filterScroll: { maxHeight: 48 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a' },
  filterChipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  filterChipText: { color: '#888', fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#000' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#2a2a2a', marginHorizontal: 4 },
  list: { padding: 12, gap: 12 },
  card: { backgroundColor: '#111', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#1e1e1e' },
  cardImage: { width: '100%', height: 160, resizeMode: 'cover' },
  cardImagePlaceholder: { width: '100%', height: 100, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#444', fontSize: 13 },
  cardBody: { padding: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { color: '#000', fontSize: 11, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#1e3a5f' },
  typeBadgeText: { color: '#60a5fa', fontSize: 11, fontWeight: '700' },
  condBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#1a1a1a' },
  condBadgeText: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  cardMeta: { color: '#888', fontSize: 13, marginTop: 2 },
  priceRow: { flexDirection: 'row', marginTop: 6 },
  price: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1e1e1e', borderRadius: 6, borderWidth: 1, borderColor: '#2e2e2e' },
  actionBtnText: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  relistBtn: { borderColor: '#14532d' },
  deleteBtn: { borderColor: '#3f1a1a' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
  threadRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  threadThumb: { width: 52, height: 52, borderRadius: 8 },
  threadInfo: { flex: 1 },
  threadTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  threadMeta: { color: '#666', fontSize: 12, marginTop: 1 },
  resBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  resBadgeText: { color: '#000', fontSize: 10, fontWeight: '700' },
  threadSummary: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1a1a1a', gap: 12 },
  threadSummaryRole: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  threadSummaryMeta: { color: '#666', fontSize: 12, marginTop: 2 },
  threadActions: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  threadActionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  threadActionText: { fontSize: 14, fontWeight: '700' },
  messagesList: { padding: 12, gap: 8, flexGrow: 1 },
  emptyMessages: { alignItems: 'center', marginTop: 40 },
  emptyMessagesText: { color: '#444', fontSize: 14 },
  messageBubbleWrap: { alignItems: 'flex-start', marginBottom: 8 },
  messageBubbleWrapMe: { alignItems: 'flex-end' },
  messageBubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  messageBubbleMe: { backgroundColor: '#22c55e', borderBottomRightRadius: 4 },
  messageBubbleThem: { backgroundColor: '#1e1e1e', borderBottomLeftRadius: 4 },
  messageBubbleText: { color: '#fff', fontSize: 15 },
  messageTime: { color: '#444', fontSize: 10, marginTop: 3 },
  messageInputRow: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  messageInput: { flex: 1, backgroundColor: '#111', color: '#fff', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { backgroundColor: '#22c55e', paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  sendBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },
  modalContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  cancelText: { color: '#888', fontSize: 16 },
  saveText: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  modalScroll: { flex: 1, paddingHorizontal: 16 },
  detailImage: { width: '100%', height: 240, resizeMode: 'cover' },
  detailImagePlaceholder: { height: 160, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  detailBody: { paddingTop: 16 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  detailTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  detailDesc: { color: '#aaa', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  detailSection: { marginBottom: 16 },
  detailSectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  detailPrice: { color: '#22c55e', fontSize: 18, fontWeight: '700' },
  detailValue: { color: '#ccc', fontSize: 15 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: '#888', fontSize: 12 },
  reserveBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  reserveBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  unavailableBanner: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, marginTop: 8, marginBottom: 16 },
  unavailableText: { color: '#666', fontSize: 14, textAlign: 'center' },
  reserveSummary: { backgroundColor: '#111', borderRadius: 12, padding: 14, marginTop: 16, marginBottom: 8, borderWidth: 1, borderColor: '#1e1e1e' },
  reserveSummaryTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  reserveSummaryMeta: { color: '#888', fontSize: 13, marginTop: 2 },
  datePickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
  datePickerBtnText: { color: '#fff', fontSize: 15 },
  datePickerIcon: { fontSize: 18 },
  rentalCalc: { backgroundColor: '#0f2a1a', borderRadius: 8, padding: 12, marginTop: 8 },
  rentalCalcText: { color: '#22c55e', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  reserveDisclaimer: { color: '#444', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  fieldGroup: { marginTop: 20 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#111', color: '#fff', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMulti: { height: 90, textAlignVertical: 'top' },
  photoPicker: { backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, height: 160, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPickerText: { color: '#555', fontSize: 14 },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a' },
  optionChipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  optionChipText: { color: '#888', fontSize: 13, fontWeight: '600' },
  optionChipTextActive: { color: '#000' },
});
