import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Image, ScrollView, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { fetchCafes, fetchPromos, fetchReviews } from '../services/api';
import { useNotifications } from '../context/NotificationContext';

/** Parse hours string like "9:00 AM - 10:00 PM" or "09:00-22:00" and return if currently open. */
function isCafeOpenNow(hoursStr) {
  if (!hoursStr || typeof hoursStr !== 'string') return null;
  const raw = hoursStr.trim();
  if (!raw) return null;
  const parts = raw.split(/\s*[-–—to]+\s*/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  function toMinutes(t) {
    t = t.replace(/\./g, ':').trim();
    let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    let min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  const openM = toMinutes(parts[0]);
  const closeM = toMinutes(parts[1]);
  if (openM == null || closeM == null) return null;

  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();

  if (closeM <= openM) {
    return nowM >= openM || nowM < closeM;
  }
  return nowM >= openM && nowM < closeM;
}


/** True if cafe is marked featured on web (is_featured / featured / is_top). */
function isFeaturedCafe(c) {
  if (!c || typeof c !== 'object') return false;
  const v = c.is_featured ?? c.featured ?? c.is_top ?? c.isFeatured;
  if (v === true || v === 1 || v === '1') return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'true') return true;
  return false;
}

/** Horizontal cafe card — image left, content right */
function CafeCard({ item, onPress, reviewers = [] }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const photo = item.image || item.photo || item.photo_url || null;
  const openStatus = isCafeOpenNow(item.hours || item.operating_hours || '');
  const hours = item.hours || item.operating_hours || '';
  const locLabel = [item.barangay, item.address].filter(Boolean).join(', ') || 'Orani, Bataan';
  const ratingVal = item.rating > 0 ? Number(item.rating).toFixed(1) : null;
  const amenitySource = [
    ...(Array.isArray(item.amenities) ? item.amenities : []),
    ...(Array.isArray(item.highlights) ? item.highlights : []),
    ...(Array.isArray(item.specialties) ? item.specialties : []),
    ...(Array.isArray(item.categories) ? item.categories : []),
  ];
  const seenAmenity = {};
  const specs = [];
  for (const s of amenitySource) {
    const t = String(s || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seenAmenity[k]) continue;
    seenAmenity[k] = true;
    specs.push(t);
    if (specs.length >= 3) break;
  }
  const isFeatured = isFeaturedCafe(item);

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.88}>
      <View style={styles.cardImgWrap}>
        {photo && /^https?:\/\//i.test(String(photo)) ? (
          <Image
            source={{ uri: String(photo) }}
            style={styles.cardImg}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImg, styles.ph]}>
            <Text style={{ fontSize: 28 }}>☕</Text>
          </View>
        )}
        {openStatus !== null && (
          <View style={[styles.statusBadge, openStatus ? styles.statusOpen : styles.statusClosed]}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{openStatus ? 'Open' : 'Closed'}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.name || 'Cafe'}</Text>
          {isFeatured ? <Text style={styles.featBadge}>★</Text> : null}
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>{locLabel}</Text>

        <View style={styles.metaRow}>
          {ratingVal && (
            <View style={styles.starChip}>
              <Text style={styles.starIcon}>★</Text>
              <Text style={styles.starNum}>{ratingVal}</Text>
            </View>
          )}
          {item.distance_km != null && (
            <Text style={styles.distance}>{Number(item.distance_km).toFixed(1)} km</Text>
          )}
          {hours ? (
            <Text style={styles.hoursText} numberOfLines={1}>🕐 {hours}</Text>
          ) : null}
        </View>

        {specs.length > 0 && (
          <View style={styles.amenityChips}>
            {specs.map((s, i) => (
              <View key={i} style={styles.amenityChip}>
                <Text style={styles.amenityChipText} numberOfLines={1}>{s}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function getCafeReviewers(item, reviewsByCafe, reviewsByName) {
  const byId = reviewsByCafe[String(item.id)] || reviewsByCafe[item.id] || [];
  if (byId.length) return byId;
  const name = (item.name || '').trim().toLowerCase();
  if (name && reviewsByName[name]) return reviewsByName[name];
  return [];
}

const FILTER_ALL = 'all';
const FILTER_OPEN = 'open';
const FILTER_FEATURED = 'featured';

export default function HomeScreen({ navigation }) {
  const { colors: COLORS, isDark } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const { unread, refresh: refreshNotifs } = useNotifications();
  const [cafes, setCafes] = useState([]);
  const [promos, setPromos] = useState([]);
  const [reviewsByCafe, setReviewsByCafe] = useState({});
  const [reviewsByName, setReviewsByName] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(FILTER_ALL);
  const [barangayFilter, setBarangayFilter] = useState('');

  // Unique barangays from loaded cafes (for filter chips connected to web API)
  // FIX: remember every barangay ever seen so chips don't vanish after a location filter is applied
  const [knownBarangays, setKnownBarangays] = useState([]);
  useEffect(() => {
    const found = cafes.map((c) => (c.barangay || '').trim()).filter(Boolean);
    if (!found.length) return;
    setKnownBarangays((prev) => {
      const merged = new Set(prev);
      found.forEach((b) => merged.add(b));
      return merged.size === prev.length ? prev : Array.from(merged);
    });
  }, [cafes]);

  const barangays = useMemo(() => {
    const set = new Set(knownBarangays);
    if (barangayFilter) set.add(barangayFilter);
    cafes.forEach((c) => {
      const b = (c.barangay || '').trim();
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [cafes, knownBarangays, barangayFilter]);

  // Top Featured from web is_featured / featured flag
  const featuredCafes = useMemo(
    () => cafes.filter((c) => isFeaturedCafe(c)),
    [cafes]
  );

  // Client-side filter (Open / Featured) on top of web results
  // Featured filter: only cafes marked featured on owner/admin dashboard
  const displayCafes = useMemo(() => {
    let list = cafes;
    if (filter === FILTER_OPEN) {
      list = list.filter((c) => isCafeOpenNow(c.hours || c.operating_hours || '') === true);
    } else if (filter === FILTER_FEATURED) {
      list = list.filter((c) => isFeaturedCafe(c));
    }
    return list;
  }, [cafes, filter]);

  const loadReviews = async () => {
    try {
      const res = await fetchReviews();
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const map = {};
      const byName = {};
      list.forEach((r) => {
        const idKey = r.cafe_id != null ? String(r.cafe_id) : null;
        if (idKey) {
          if (!map[idKey]) map[idKey] = [];
          map[idKey].push(r);
        }
        const n = (r.cafe_name || '').trim().toLowerCase();
        if (n) {
          if (!byName[n]) byName[n] = [];
          byName[n].push(r);
        }
      });
      setReviewsByCafe(map);
      setReviewsByName(byName);
    } catch (_) {
      setReviewsByCafe({});
      setReviewsByName({});
    }
  };

  const CAFE_CACHE_KEY = '@kapeorani_cafes_cache';

  const load = useCallback(async (opts = {}) => {
    setError('');
    try {
      const res = await fetchCafes({
        q: opts.q ?? query,
        limit: 100,
        lat: opts.lat,
        lng: opts.lng,
        barangay: opts.barangay !== undefined ? opts.barangay : barangayFilter,
      });
      if (res.success === false) {
        setError(res.message || 'Hindi makuha ang listahan.');
        setCafes([]);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      setCafes(list);
      // Cache only full unfiltered list for instant next open on Expo Go
      if (!opts.q && !opts.barangay && !opts.lat && !barangayFilter && !query) {
        try { await AsyncStorage.setItem(CAFE_CACHE_KEY, JSON.stringify(list)); } catch (_) {}
      }
    } catch (e) {
      setError(e.message || 'Network error');
      setCafes([]);
    }
  }, [query, barangayFilter]);

  const loadPromos = async () => {
    try {
      const res = await fetchPromos();
      if (res.success && Array.isArray(res.data)) setPromos(res.data);
    } catch (_) {}
  };

  useEffect(() => {
    (async () => {
      // Instant show from cache on Expo Go (LAN is slower than localhost web)
      try {
        const cached = await AsyncStorage.getItem(CAFE_CACHE_KEY);
        if (cached) {
          const list = JSON.parse(cached);
          if (Array.isArray(list) && list.length) {
            setCafes(list);
            setLoading(false);
          }
        }
      } catch (_) {}

      // Fetch cafes first so list appears ASAP, then secondary data in background
      setLoading(true);
      await load();
      setLoading(false);

      // Non-blocking: promos, reviews, notifications
      loadPromos();
      loadReviews();
      try { refreshNotifs?.(); } catch (_) {}
    })();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadPromos(), loadReviews()]);
    try { await refreshNotifs?.(); } catch (_) {}
    setRefreshing(false);
  };

  const onSearch = async () => {
    setLoading(true);
    await load({ q: query, barangay: barangayFilter });
    setLoading(false);
  };

  const applyBarangay = async (b) => {
    const next = barangayFilter === b ? '' : b;
    setBarangayFilter(next);
    setLoading(true);
    await load({ q: query, barangay: next });
    setLoading(false);
  };

  const nearMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission', 'Kailangan ang location permission.');
        return;
      }
      setLoading(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await load({ lat: loc.coords.latitude, lng: loc.coords.longitude, q: query, barangay: barangayFilter });
    } catch (e) {
      Alert.alert('Location', e.message || 'Hindi makuha ang GPS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, styles.hdrCol]}>
        <View style={styles.hdrTopRow}>
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/kapeorani-logo-white.png')}
              style={{ width: 200, height: 100, marginTop: -9, marginBottom: -25, marginLeft: -6 }}
              resizeMode="contain"
            />
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Notifications')}
            style={styles.iconBtn}
            activeOpacity={0.75}
          >
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unread > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.hdrSearchWrap}>
          <TextInput
            style={[styles.search, styles.hdrSearch]}
            value={query}
            onChangeText={setQuery}
            placeholder="Hanapin ang kapehan..."
            placeholderTextColor={COLORS.muted}
            onSubmitEditing={onSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.hdrSearchBtn} onPress={onSearch} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="search" size={18} color={COLORS.sage} />
          </TouchableOpacity>
        </View>

        {/* Search filters connected to web API (q + barangay) + client Open/Featured */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.filterScroll, styles.hdrFilterScroll]}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[styles.filterChip, styles.hdrChip, filter === FILTER_ALL && !barangayFilter && styles.filterChipOn, filter === FILTER_ALL && !barangayFilter && styles.hdrChipOn]}
            onPress={() => {
              setFilter(FILTER_ALL);
              if (barangayFilter) {
                setBarangayFilter('');
                setLoading(true);
                load({ q: query, barangay: '' }).finally(() => setLoading(false));
              }
            }}
          >
            <Text style={[styles.filterText, styles.hdrText, filter === FILTER_ALL && !barangayFilter && styles.filterTextOn, filter === FILTER_ALL && !barangayFilter && styles.hdrTextOn]}>Lahat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, styles.hdrChip, filter === FILTER_OPEN && styles.filterChipOn, filter === FILTER_OPEN && styles.hdrChipOn]}
            onPress={() => setFilter(filter === FILTER_OPEN ? FILTER_ALL : FILTER_OPEN)}
          >
            <Text style={[styles.filterText, styles.hdrText, filter === FILTER_OPEN && styles.filterTextOn, filter === FILTER_OPEN && styles.hdrTextOn]}>Open now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, styles.hdrChip, filter === FILTER_FEATURED && styles.filterChipOn, filter === FILTER_FEATURED && styles.hdrChipOn]}
            onPress={() => setFilter(filter === FILTER_FEATURED ? FILTER_ALL : FILTER_FEATURED)}
          >
            <Text style={[styles.filterText, styles.hdrText, filter === FILTER_FEATURED && styles.filterTextOn, filter === FILTER_FEATURED && styles.hdrTextOn]}>
              ★ Featured{featuredCafes.length > 0 ? ` (${featuredCafes.length})` : ''}
            </Text>
          </TouchableOpacity>
          {barangays.map((b) => (
            <TouchableOpacity
              key={b}
              style={[styles.filterChip, styles.hdrChip, barangayFilter === b && styles.filterChipOn, barangayFilter === b && styles.hdrChipOn]}
              onPress={() => applyBarangay(b)}
            >
              <Text style={[styles.filterText, styles.hdrText, barangayFilter === b && styles.filterTextOn, barangayFilter === b && styles.hdrTextOn]} numberOfLines={1}>
                📍 {b}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.nearBtn} onPress={nearMe}>
          <Text style={styles.nearBtnText}>📍 Near Me</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.nearBtn} onPress={() => navigation.navigate('MyReservations')}>
          <Text style={styles.nearBtnText}>📅 Reserves</Text>
        </TouchableOpacity>
      </View>

      {/* Top Featured — slightly smaller so more list is visible */}
      {featuredCafes.length > 0 && filter !== FILTER_OPEN && filter !== FILTER_FEATURED && (
        <View style={styles.featuredSection}>
          <View style={styles.featuredHeader}>
            <Text style={styles.featuredTitle}>★ Top Featured</Text>
            <Text style={styles.featuredSub}>{featuredCafes.length} kapehan</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {featuredCafes.map((c) => {
              const photo = c.image || c.photo || c.photo_url || null;
              return (
                <TouchableOpacity
                  key={String(c.id ?? c.name)}
                  style={styles.featuredCard}
                  onPress={() => navigation.navigate('CafeDetail', { cafe: c })}
                  activeOpacity={0.88}
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.featuredImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.featuredImg, styles.ph]}>
                      <Text style={{ fontSize: 22 }}>☕</Text>
                    </View>
                  )}
                  <View style={styles.featuredBody}>
                    <Text style={styles.featuredName} numberOfLines={1}>{c.name || 'Cafe'}</Text>
                    <Text style={styles.featuredMeta} numberOfLines={1}>
                      {c.barangay || c.address || 'Orani, Bataan'}
                    </Text>
                    {c.rating > 0 && (
                      <Text style={styles.featuredRating}>★ {Number(c.rating).toFixed(1)}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {promos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.promoScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        >
          {promos.slice(0, 8).map((p) => (
            <View key={p.id || p.title} style={styles.promoCard}>
              <Text style={styles.promoTitle} numberOfLines={1}>{p.title}</Text>
              <Text style={styles.promoSub} numberOfLines={2}>
                {p.cafe_name || p.description || 'Promo'}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorHint}>Check API_BASE_URL + internet + mobile_api.php</Text>
        </View>
      ) : null}

      {loading && !refreshing && cafes.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.sage} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={displayCafes}
          keyExtractor={(item, i) => String(item.id ?? item.name ?? i)}
          renderItem={({ item }) => (
            <CafeCard
              item={item}
              reviewers={getCafeReviewers(item, reviewsByCafe, reviewsByName)}
              onPress={(c) => navigation.navigate('CafeDetail', { cafe: c })}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sage} />
          }
          ListEmptyComponent={!error ? (
            <Text style={styles.empty}>
              {filter === FILTER_FEATURED
                ? 'Walang featured coffee shop sa ngayon.'
                : filter === FILTER_OPEN
                  ? 'Walang bukas na kapehan sa oras na ito.'
                  : 'Walang nahanap na kapehan.'}
            </Text>
          ) : null}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={9}
          removeClippedSubviews={false}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    backgroundColor: COLORS.header,
    paddingTop: Platform.OS === 'ios' ? 52 : 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.header,
  },
  logoWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLeaf: { fontSize: 18 },
  logoText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  logoAccent: { color: COLORS.sand },
  logoSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.0,
    marginTop: 1,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.danger,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 12, gap: 8 },
  search: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 48,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.darker,
    color: COLORS.text,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  searchBtn: {
    backgroundColor: COLORS.sage,
    borderRadius: 12,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // --- header layout: logo + search + bell on top, filters below ---
  hdrCol: { flexDirection: 'column', alignItems: 'stretch' },
  hdrTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hdrSearchWrap: { marginTop: 10, justifyContent: 'center', minHeight: 48 },
  hdrSearch: {
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    paddingLeft: 14,
    paddingRight: 44,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 48,
    height: 48,
    borderRadius: 12,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  hdrSearchBtn: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  hdrFilterScroll: { marginHorizontal: -16, marginTop: 10 },
  hdrChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)', paddingVertical: 6 },
  hdrChipOn: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  hdrText: { color: '#FFFFFF' },
  hdrTextOn: { color: COLORS.sage },
  filterScroll: { maxHeight: 44, marginTop: 10 },
  filterRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.darker,
  },
  filterChipOn: {
    backgroundColor: COLORS.sage,
    borderColor: COLORS.sage,
  },
  filterText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  filterTextOn: { color: '#fff' },
  actions: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 10, gap: 8 },
  nearBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.darker,
  },
  nearBtnText: { color: COLORS.sage, fontWeight: '700', fontSize: 13 },
  featuredSection: { marginTop: 12 },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  featuredTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  featuredSub: { fontSize: 11, color: COLORS.sageLight, fontWeight: '600' },
  featuredCard: {
    width: 130,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.darker,
  },
  featuredImg: { width: '100%', height: 72 },
  featuredBody: { padding: 8 },
  featuredName: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  featuredMeta: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  featuredRating: { fontSize: 10, color: COLORS.sand, fontWeight: '700', marginTop: 3 },
  featBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.sand,
  },
  promoScroll: { maxHeight: 72, marginTop: 10 },
  promoCard: {
    width: 180,
    backgroundColor: COLORS.sandSoft,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.sand,
  },
  promoTitle: { fontWeight: '700', color: COLORS.text, fontSize: 12 },
  promoSub: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  list: { padding: 16, paddingBottom: 40 },

  /* Horizontal card — fixed sizes for Expo Go (height % breaks on native) */
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.darker,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    height: 112,
  },
  cardImgWrap: {
    width: 112,
    height: 112,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.sageSoft,
  },
  cardImg: { width: 112, height: 112 },
  ph: { backgroundColor: COLORS.sageSoft, alignItems: 'center', justifyContent: 'center' },
  statusBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusOpen: { backgroundColor: 'rgba(39, 174, 96, 0.95)' },
  statusClosed: { backgroundColor: 'rgba(192, 57, 43, 0.95)' },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    minWidth: 0,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  cardMeta: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  starChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.sandSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  starIcon: { color: COLORS.sand, fontSize: 11 },
  starNum: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  distance: { fontSize: 11, color: COLORS.sage, fontWeight: '700' },
  hoursText: { fontSize: 11, color: COLORS.muted, fontWeight: '500', flexShrink: 1 },
  amenityChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  amenityChip: {
    backgroundColor: COLORS.sageSoft,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  amenityChipText: { fontSize: 10, color: COLORS.sage, fontWeight: '600', maxWidth: 90 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40, fontSize: 15 },
  errorBox: {
    margin: 16,
    padding: 14,
    backgroundColor: COLORS.sandSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },
  errorHint: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
});
