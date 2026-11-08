import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, Animated, PanResponder, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { chatThreads, chatDeleteThread } from '../services/api';

const AVATAR_COLORS = ['#4A5D4E', '#D8A268', '#6E8573', '#B5784A', '#5B7C99', '#8A6F9E', '#C0615B'];
const SWIPE_THRESHOLD = -80;
const DELETE_WIDTH = 88;

function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Messenger-style timestamp: time today, weekday this week, else "Oct 20"
function formatTime(raw) {
  if (!raw) return '';
  const d = new Date(String(raw).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(raw);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SwipeableRow({ item, styles, COLORS, onPress, onDelete }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => {
          const next = Math.min(0, Math.max(-DELETE_WIDTH, open.current ? g.dx - DELETE_WIDTH : g.dx));
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const shouldOpen = open.current
            ? g.dx > 40
              ? false
              : true
            : g.dx < SWIPE_THRESHOLD || g.vx < -0.6;
          open.current = shouldOpen;
          Animated.spring(translateX, {
            toValue: shouldOpen ? -DELETE_WIDTH : 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
        onPanResponderTerminate: () => {
          open.current = false;
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
      }),
    [translateX]
  );

  const unread = Number(item.unread) > 0;
  const name = item.cafe_name || 'Cafe';

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.deleteUnder}>
        <TouchableOpacity
          style={styles.deleteBtn}
          activeOpacity={0.85}
          onPress={() => onDelete(item)}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.rowAnim, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={() => {
            if (open.current) {
              open.current = false;
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                bounciness: 0,
                speed: 20,
              }).start();
              return;
            }
            onPress(item);
          }}
        >
          <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
            <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.mid}>
            <Text style={[styles.name, unread && styles.bold]} numberOfLines={1}>{name}</Text>
            <View style={styles.previewRow}>
              <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                {item.last_message || ''}
              </Text>
              <Text style={[styles.time, unread && styles.previewUnread]}>
                {'  ·  '}{formatTime(item.last_at)}
              </Text>
            </View>
          </View>
          {unread && <View style={styles.dot} />}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function ChatListScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const res = await chatThreads();
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (_) {
      setData([]);
    }
  };

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((t) => String(t.cafe_name || '').toLowerCase().includes(s));
  }, [data, q]);

  const handleDelete = (item) => {
    const name = item.cafe_name || 'conversation';
    Alert.alert(
      'Delete conversation',
      `Burahin ang chat kay ${name}? Hindi na ito mababawi.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatDeleteThread(item.cafe_id);
              setData((prev) => prev.filter((t) => String(t.cafe_id) !== String(item.cafe_id)));
            } catch (_) {
              Alert.alert('Error', 'Hindi ma-delete ang conversation. Subukan ulit.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <SwipeableRow
      item={item}
      styles={styles}
      COLORS={COLORS}
      onPress={(t) => navigation.navigate('ChatThread', { cafeId: t.cafe_id, cafeName: t.cafe_name })}
      onDelete={handleDelete}
    />
  );

  return (
    <View style={styles.root}>
      {loading ? (
        <ActivityIndicator color={COLORS.sage} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.cafe_id)}
          contentContainerStyle={{ paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            />
          }
          ListHeaderComponent={
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={COLORS.muted} />
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Search"
                placeholderTextColor={COLORS.muted}
                returnKeyType="search"
              />
              {!!q && (
                <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {q ? 'Walang nahanap na chat.' : 'Walang chat threads. Buksan ang cafe at mag-send ng message.'}
            </Text>
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.white },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, marginBottom: 8,
    paddingHorizontal: 14, height: 42, borderRadius: 21,
    backgroundColor: COLORS.surface,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text, paddingVertical: 0 },
  swipeWrap: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  deleteUnder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
    backgroundColor: '#E53935',
  },
  deleteBtn: {
    width: DELETE_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  deleteBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  rowAnim: {
    backgroundColor: COLORS.white,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: COLORS.white,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  mid: { flex: 1, marginLeft: 12 },
  name: { fontSize: 16, color: COLORS.text, fontWeight: '500' },
  bold: { fontWeight: '800' },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  preview: { flexShrink: 1, fontSize: 14, color: COLORS.muted },
  previewUnread: { color: COLORS.text, fontWeight: '700' },
  time: { fontSize: 13, color: COLORS.muted },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.sage, marginLeft: 8,
  },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
});
