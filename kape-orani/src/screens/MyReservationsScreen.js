import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, AppState } from 'react-native';
import { myReservations } from '../services/api';
import { COLORS } from '../constants/config';

export default function MyReservationsScreen() {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await myReservations();
      if (res.success === false) throw new Error(res.message);
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.message);
      setData([]);
    }
  };

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, []);

  // Auto-sync: kapag dinelete/binago ng owner sa web, mawawala/mag-u-update dito
  // - every 8 seconds habang nakabukas ang screen
  // - pag bumalik ang app mula background
  useEffect(() => {
    const timer = setInterval(() => { load(); }, 8000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => { clearInterval(timer); sub && sub.remove && sub.remove(); };
  }, []);

  const statusColor = (s) => {
    const x = String(s || '').toLowerCase();
    if (x === 'confirmed') return COLORS.success;
    if (x === 'declined') return COLORS.danger;
    return COLORS.sand;
  };

  return (
    <View style={styles.root}>
      {loading ? (
        <ActivityIndicator color={COLORS.sage} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListEmptyComponent={<Text style={styles.empty}>{error || 'Wala pang naka reserve, hindi pa binubuksan ang reservation'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.cafe_name || `Cafe #${item.cafe_id}`}</Text>
              <Text style={styles.meta}>{item.reservation_date} · {String(item.reservation_time).slice(0, 5)}</Text>
              <Text style={styles.meta}>{item.guest_count} guest(s) · {item.customer_phone}</Text>
              {!!item.note && <Text style={styles.note}>{item.note}</Text>}
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '22' }]}>
                <Text style={{ color: statusColor(item.status), fontWeight: '700', fontSize: 12 }}>
                  {(item.status || 'pending').toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  card: { backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.darker },
  name: { fontWeight: '700', fontSize: 16, color: COLORS.text },
  meta: { color: COLORS.muted, marginTop: 4, fontSize: 13 },
  note: { color: COLORS.charcoal, marginTop: 8, fontSize: 13 },
  badge: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
