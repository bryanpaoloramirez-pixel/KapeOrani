import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, Linking,
  Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { createReservation, submitReview, submitClaim, chatSend, fetchReservationSettings, fetchReviews } from '../services/api';
import { COLORS } from '../constants/config';

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** Generate next 14 days as YYYY-MM-DD */
function nextDays(count = 14) {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
  }
  return out;
}

const WEEKDAYS = ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
const MONTHS_FIL = [
  'Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo',
  'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre',
];

/** Build calendar cells for a month that contains the available YYYY-MM-DD list */
function buildCalendarCells(availableDates) {
  if (!availableDates.length) return { monthLabel: '', cells: [] };
  const first = availableDates[0];
  const [y, m] = first.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const startPad = monthStart.getDay(); // 0=Sun
  const totalDays = monthEnd.getDate();
  const availableSet = new Set(availableDates);
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push({ type: 'empty' });
  for (let day = 1; day <= totalDays; day++) {
    const ymd = `${y}-${pad2(m)}-${pad2(day)}`;
    cells.push({
      type: 'day',
      day,
      ymd,
      available: availableSet.has(ymd),
      isToday: ymd === todayYMD(),
    });
  }
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push({ type: 'empty' });
  return {
    monthLabel: `${MONTHS_FIL[m - 1]} ${y}`,
    cells,
  };
}

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00',
];

export default function CafeDetailScreen({ route, navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const { cafe } = route.params || {};
  const { user } = useAuth();
  const [tab, setTab] = useState('info'); // info | menu | reserve | review | claim | chat
  const [busy, setBusy] = useState(false);
  const [reserve, setReserve] = useState({ date: todayYMD(), time: '10:00', guests: '2', phone: user?.phone || '', note: '' });
  const [review, setReview] = useState({ comment: '', rating: '5' });
  const [claim, setClaim] = useState({ name: user?.fullname || '', contact: user?.phone || '', message: '' });
  const [chatMsg, setChatMsg] = useState('');
  const [resSettings, setResSettings] = useState(null); // null = loading, false = not configured, object = ok
  const [resLoading, setResLoading] = useState(false);
  const [cafeReviews, setCafeReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const availableDates = useMemo(() => nextDays(14), []);
  const availableTimes = useMemo(() => {
    const now = new Date();
    const isToday = reserve.date === todayYMD();
    return TIME_SLOTS.filter((t) => {
      if (!isToday) return true;
      const [hh, mm] = t.split(':').map(Number);
      const slot = new Date();
      slot.setHours(hh, mm, 0, 0);
      return slot.getTime() > now.getTime() + 30 * 60 * 1000; // at least 30 min ahead
    });
  }, [reserve.date]);

  useEffect(() => {
    if (tab !== 'reserve' || !cafe?.id) return;
    let cancelled = false;
    (async () => {
      setResLoading(true);
      try {
        const res = await fetchReservationSettings(cafe.id);
        if (cancelled) return;
        if (res && res.configured) {
          setResSettings(res);
        } else {
          setResSettings(false);
        }
      } catch {
        if (!cancelled) setResSettings(false);
      } finally {
        if (!cancelled) setResLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, cafe?.id]);

  // Load approved reviews for this cafe when review tab is opened
  useEffect(() => {
    if (tab !== 'review' || !cafe?.id) return;
    let cancelled = false;
    (async () => {
      setReviewsLoading(true);
      try {
        const res = await fetchReviews();
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setCafeReviews(list.filter((r) => String(r.cafe_id) === String(cafe.id)));
      } catch {
        if (!cancelled) setCafeReviews([]);
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, cafe?.id]);

  // Keep selected time valid when date changes
  useEffect(() => {
    if (availableTimes.length && !availableTimes.includes(reserve.time)) {
      setReserve((r) => ({ ...r, time: availableTimes[0] }));
    }
  }, [availableTimes, reserve.time]);

  if (!cafe) {
    return <View style={styles.center}><Text>Walang cafe data.</Text></View>;
  }

  const photo = cafe.image || cafe.photo || cafe.photo_url || null;
  const lat = cafe.lat ?? cafe.latitude;
  const lng = cafe.lng ?? cafe.longitude;
  const menu = Array.isArray(cafe.menu) ? cafe.menu : [];

  const openUrl = (url) => { if (url) Linking.openURL(url); };

  const doReserve = async () => {
    if (!reserve.date || !reserve.time || !reserve.guests || !reserve.phone) {
      Alert.alert('Kailangan', 'Date, time, guests, at phone required.'); return;
    }
    if (!/^09\d{9}$/.test(reserve.phone)) { Alert.alert('Phone', 'Format: 09XXXXXXXXX'); return; }
    // Client-side future check
    const slot = new Date(`${reserve.date}T${reserve.time.length === 5 ? reserve.time + ':00' : reserve.time}`);
    if (isNaN(slot.getTime()) || slot.getTime() <= Date.now()) {
      Alert.alert('Petsa / Oras', 'Dapat future date at time lang ang pwedeng i-reserve.');
      return;
    }
    setBusy(true);
    try {
      const res = await createReservation({
        cafe_id: cafe.id,
        date: reserve.date,
        time: reserve.time,
        guest_count: parseInt(reserve.guests, 10) || 1,
        customer_name: user?.fullname || user?.username || 'Guest',
        customer_phone: reserve.phone,
        note: reserve.note,
      });
      if (res.success === false) throw new Error(res.message);
      Alert.alert('Success', res.message || 'Naipadala ang reservation!');
      setTab('info');
    } catch (e) { Alert.alert('Reservation', e.message); }
    finally { setBusy(false); }
  };

  const doReview = async () => {
    if (!review.comment.trim()) { Alert.alert('Kailangan', 'Maglagay ng komento.'); return; }
    setBusy(true);
    try {
      const res = await submitReview({
        cafe_id: cafe.id,
        reviewer_name: user?.fullname || user?.username || 'Guest',
        comment: review.comment.trim(),
        rating: parseInt(review.rating, 10) || 5,
        user_id: user?.id,
        location: cafe.barangay || 'Orani',
      });
      if (res.success === false) throw new Error(res.message);
      Alert.alert('Success', res.message || 'Naipadala (pending approval).');
      setTab('info');
    } catch (e) { Alert.alert('Review', e.message); }
    finally { setBusy(false); }
  };

  const doClaim = async () => {
    if (!claim.name.trim() || !claim.contact.trim()) {
      Alert.alert('Kailangan', 'Name at contact required.'); return;
    }
    setBusy(true);
    try {
      const res = await submitClaim({
        cafe_id: cafe.id,
        claimant_name: claim.name.trim(),
        contact: claim.contact.trim(),
        message: claim.message.trim(),
      });
      if (res.success === false) throw new Error(res.message);
      Alert.alert('Success', res.message || 'Naipadala ang claim.');
      setTab('info');
    } catch (e) { Alert.alert('Claim', e.message); }
    finally { setBusy(false); }
  };

  const doChat = async () => {
    if (!chatMsg.trim()) return;
    setBusy(true);
    try {
      const res = await chatSend(cafe.id, chatMsg.trim());
      if (res.success === false) throw new Error(res.message);
      setChatMsg('');
      navigation.navigate('ChatThread', { cafeId: cafe.id, cafeName: cafe.name });
    } catch (e) { Alert.alert('Chat', e.message); }
    finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 48 }}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.hero} resizeMode="cover" />
      ) : (
        <View style={[styles.hero, styles.ph]}><Text style={{ fontSize: 56 }}>☕</Text></View>
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{cafe.name}</Text>
        <Text style={styles.meta}>{[cafe.barangay, cafe.address].filter(Boolean).join(' · ') || 'Orani, Bataan'}</Text>
        {!!cafe.hours && <Text style={styles.line}>🕒 {cafe.hours}</Text>}
        {!!cafe.contact && <Text style={styles.line}>📞 {cafe.contact}</Text>}
        {cafe.rating > 0 && <Text style={styles.line}>⭐ {Number(cafe.rating).toFixed(1)}</Text>}
        {!!cafe.description && <Text style={styles.desc}>{cafe.description}</Text>}
        {!!((cafe.amenities && cafe.amenities.length) || (cafe.specialties && cafe.specialties.length) || (cafe.highlights && cafe.highlights.length)) && (
          <Text style={styles.line}>
            ✨ {([
              ...(Array.isArray(cafe.amenities) ? cafe.amenities : []),
              ...(Array.isArray(cafe.highlights) ? cafe.highlights : []),
              ...(Array.isArray(cafe.specialties) ? cafe.specialties : []),
            ].filter((v, i, a) => v && a.findIndex((x) => String(x).toLowerCase() === String(v).toLowerCase()) === i)).join(' · ')}
          </Text>
        )}
        {!!(cafe.is_featured || cafe.featured) && (
          <Text style={[styles.line, { color: COLORS.sand, fontWeight: '800' }]}>★ Top Featured</Text>
        )}

        <View style={styles.mapRow}>
          <TouchableOpacity
            style={[styles.mapBtn, { backgroundColor: '#1E6FFF' }]}
            onPress={() => {
              if (lat == null || lng == null || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
                Alert.alert('Map', 'Walang coordinates ang cafe na ito, hindi ma-open sa map.');
                return;
              }
              navigation.navigate('Map', { cafe });
            }}
          >
            <Text style={styles.mapBtnText}>🧭 Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapBtn, { backgroundColor: COLORS.sage }]}
            onPress={() => navigation.navigate('ChatThread', { cafeId: cafe.id, cafeName: cafe.name })}
          >
            <Text style={styles.mapBtnText}>💬 Chat</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
          {[
            ['info', 'Info'],
            ['menu', `Menu (${menu.length})`],
            ['reserve', 'Reserve'],
            ['review', 'Review'],
          ].map(([k, label]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tab === 'menu' && (
          <View style={styles.box}>
            {menu.length === 0 ? (
              <Text style={styles.muted}>Walang menu items.</Text>
            ) : menu.map((m) => (
              <View key={m.id || m.item_name} style={styles.menuRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{m.item_name}</Text>
                  <Text style={styles.muted}>{m.category}{m.description ? ` · ${m.description}` : ''}</Text>
                </View>
                <Text style={styles.price}>₱{Number(m.price || 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'reserve' && (
          <View style={styles.box}>
            {resLoading ? (
              <ActivityIndicator color={COLORS.sage} style={{ marginVertical: 20 }} />
            ) : resSettings === false ? (
              <View style={styles.emptyReserve}>
                <Text style={styles.emptyReserveIcon}>📅</Text>
                <Text style={styles.emptyReserveText}>
                  Wala pang naka reserve, hindi pa binubuksan ang reservation
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.hint}>
                  Pwedeng i-reserve ang mga petsa mula ngayon hanggang 14 araw. Past date/time ay hindi pwede.
                </Text>
                <Text style={styles.label}>Petsa</Text>
                {(() => {
                  const cal = buildCalendarCells(availableDates);
                  return (
                    <View style={styles.calendarBox}>
                      <Text style={styles.calendarMonth}>{cal.monthLabel}</Text>
                      <View style={styles.calendarWeekRow}>
                        {WEEKDAYS.map((w) => (
                          <Text key={w} style={styles.calendarWeekday}>{w}</Text>
                        ))}
                      </View>
                      <View style={styles.calendarGrid}>
                        {cal.cells.map((cell, idx) => {
                          if (cell.type === 'empty') {
                            return <View key={`e-${idx}`} style={styles.calendarCell} />;
                          }
                          const selected = reserve.date === cell.ymd;
                          const disabled = !cell.available;
                          return (
                            <TouchableOpacity
                              key={cell.ymd}
                              style={[
                                styles.calendarCell,
                                cell.isToday && styles.calendarToday,
                                selected && styles.calendarSelected,
                                disabled && styles.calendarDisabled,
                              ]}
                              disabled={disabled}
                              onPress={() => setReserve((r) => ({ ...r, date: cell.ymd }))}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.calendarDayText,
                                  selected && styles.calendarDayTextOn,
                                  disabled && styles.calendarDayTextDisabled,
                                  cell.isToday && !selected && styles.calendarTodayText,
                                ]}
                              >
                                {cell.day}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={styles.calendarSelectedLabel}>
                        Napili: {reserve.date === todayYMD() ? 'Ngayon' : reserve.date}
                      </Text>
                    </View>
                  );
                })()}
                <Text style={styles.label}>Oras</Text>
                {availableTimes.length === 0 ? (
                  <Text style={styles.muted}>Walang available na oras para sa petsang ito. Pumili ng ibang araw.</Text>
                ) : (
                  <View style={styles.timeGrid}>
                    {availableTimes.map((t) => {
                      const selected = reserve.time === t;
                      const [hh] = t.split(':').map(Number);
                      const period = hh < 12 ? 'AM' : 'PM';
                      const displayH = hh % 12 || 12;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.timeChip, selected && styles.timeChipOn]}
                          onPress={() => setReserve((r) => ({ ...r, time: t }))}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.timeChipMain, selected && styles.timeChipMainOn]}>
                            {displayH}:{t.slice(3)}
                          </Text>
                          <Text style={[styles.timeChipPeriod, selected && styles.timeChipPeriodOn]}>
                            {period}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                <Text style={styles.label}>Guests</Text>
                <TextInput style={styles.input} value={reserve.guests} onChangeText={(v) => setReserve((r) => ({ ...r, guests: v }))} keyboardType="number-pad" placeholderTextColor="#9A9A8C" />
                <Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} value={reserve.phone} onChangeText={(v) => setReserve((r) => ({ ...r, phone: v }))} keyboardType="phone-pad" maxLength={11} placeholderTextColor="#9A9A8C" />
                <Text style={styles.label}>Note</Text>
                <TextInput style={[styles.input, { height: 70 }]} value={reserve.note} onChangeText={(v) => setReserve((r) => ({ ...r, note: v }))} multiline placeholderTextColor="#9A9A8C" />
                <TouchableOpacity
                  style={[styles.primary, (busy || availableTimes.length === 0) && { opacity: 0.6 }]}
                  onPress={doReserve}
                  disabled={busy || availableTimes.length === 0}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>I-submit</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {tab === 'review' && (
          <View style={styles.box}>
            <Text style={styles.label}>Mga Reviews</Text>
            {reviewsLoading ? (
              <ActivityIndicator color={COLORS.sage} style={{ marginVertical: 12 }} />
            ) : cafeReviews.length === 0 ? (
              <Text style={styles.muted}>Wala pang approved review para sa kapehang ito.</Text>
            ) : (
              cafeReviews.map((r, i) => (
                <View key={r.id || i} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <Text style={styles.reviewItemName}>{r.reviewer_name || 'Guest'}</Text>
                    <Text style={styles.reviewItemStars}>{'★'.repeat(Math.min(5, Number(r.rating) || 0))}</Text>
                  </View>
                  <Text style={styles.reviewItemComment}>{r.comment}</Text>
                  {!!r.created_at && <Text style={styles.reviewItemDate}>{r.created_at}</Text>}
                </View>
              ))
            )}

            <Text style={[styles.label, { marginTop: 16 }]}>Maglagay ng Review</Text>
            <Text style={styles.label}>Rating (1–5)</Text>
            <TextInput style={styles.input} value={review.rating} onChangeText={(v) => setReview((r) => ({ ...r, rating: v }))} keyboardType="number-pad" maxLength={1} placeholderTextColor="#9A9A8C" />
            <Text style={styles.label}>Komento</Text>
            <TextInput style={[styles.input, { height: 90 }]} value={review.comment} onChangeText={(v) => setReview((r) => ({ ...r, comment: v }))} multiline placeholderTextColor="#9A9A8C" placeholder="Ibahagi ang experience mo..." />
            <TouchableOpacity style={styles.primary} onPress={doReview} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>I-submit ang Review</Text>}
            </TouchableOpacity>
          </View>
        )}


        {tab === 'info' && (
          <View style={styles.box}>
            <Text style={styles.muted}>Piliin ang tab sa itaas para sa menu, reservation, o review.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '100%', height: 220 },
  ph: { backgroundColor: COLORS.sageSoft, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  meta: { color: COLORS.muted, marginTop: 4, fontSize: 14 },
  line: { color: COLORS.sage, marginTop: 8, fontSize: 14 },
  desc: { marginTop: 12, color: COLORS.charcoal, lineHeight: 22, fontSize: 15 },
  mapRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  mapBtn: { flex: 1, backgroundColor: COLORS.sage, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  mapBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chatCta: {
    marginTop: 10,
    backgroundColor: COLORS.sand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.sand,
  },
  chatCtaText: { color: COLORS.espresso, fontWeight: '800', fontSize: 14 },
  chatCtaSecondary: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  chatCtaSecondaryText: { color: COLORS.sage, fontWeight: '700', fontSize: 14 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.darker, marginRight: 8 },
  tabOn: { backgroundColor: COLORS.sage },
  tabText: { color: COLORS.muted, fontWeight: '600', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  box: { marginTop: 16, backgroundColor: COLORS.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.darker },
  muted: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  reviewItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.darker,
  },
  reviewItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewItemName: { fontWeight: '700', color: COLORS.text, fontSize: 14, flex: 1, marginRight: 8 },
  reviewItemStars: { fontSize: 12, color: COLORS.sand },
  reviewItemComment: { color: COLORS.charcoal, marginTop: 6, lineHeight: 20, fontSize: 13 },
  reviewItemDate: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.sage, marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.darker, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: COLORS.text },
  primary: { backgroundColor: COLORS.sage, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontWeight: '700' },
  menuRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.darker },
  menuName: { fontWeight: '700', color: COLORS.text },
  price: { fontWeight: '700', color: COLORS.sage, marginLeft: 8 },
  hint: { color: COLORS.muted, fontSize: 12, lineHeight: 17, marginBottom: 4 },
  chipRow: { flexGrow: 0, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.darker,
    marginRight: 8,
    marginBottom: 6,
  },
  chipOn: { backgroundColor: COLORS.sage, borderColor: COLORS.sage },
  chipText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  /* Calendar design (matches KapeOrani sage palette) */
  calendarBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.darker,
    padding: 12,
    marginBottom: 8,
  },
  calendarMonth: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.sageLight,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginBottom: 2,
  },
  calendarToday: {
    borderWidth: 1.5,
    borderColor: COLORS.sage,
  },
  calendarSelected: {
    backgroundColor: COLORS.sage,
  },
  calendarDisabled: {
    opacity: 0.35,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  calendarDayTextOn: {
    color: '#fff',
    fontWeight: '800',
  },
  calendarDayTextDisabled: {
    color: COLORS.muted,
  },
  calendarTodayText: {
    color: COLORS.sage,
    fontWeight: '800',
  },
  calendarSelectedLabel: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.sage,
  },
  /* Time slots UI */
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  timeChip: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.darker,
    alignItems: 'center',
  },
  timeChipOn: {
    backgroundColor: COLORS.sage,
    borderColor: COLORS.sage,
  },
  timeChipMain: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  timeChipMainOn: {
    color: '#fff',
  },
  timeChipPeriod: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.muted,
    marginTop: 2,
  },
  timeChipPeriodOn: {
    color: 'rgba(255,255,255,0.85)',
  },
  emptyReserve: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12 },
  emptyReserveIcon: { fontSize: 40, marginBottom: 10 },
  emptyReserveTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyReserveText: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 19 },
});
