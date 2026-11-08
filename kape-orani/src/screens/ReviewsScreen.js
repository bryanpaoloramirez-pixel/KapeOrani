import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { fetchReviews } from '../services/api';
import { COLORS } from '../constants/config';

export default function ReviewsScreen() {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetchReviews();
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (_) {
      setData([]);
    }
  };

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, []);

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
          ListEmptyComponent={<Text style={styles.empty}>Walang approved reviews pa.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{item.reviewer_name}</Text>
                <Text style={styles.rating}>{'⭐'.repeat(Math.min(5, Number(item.rating) || 0))}</Text>
              </View>
              <Text style={styles.cafe}>{item.cafe_name}</Text>
              <Text style={styles.comment}>{item.comment}</Text>
              {!!item.created_at && <Text style={styles.date}>{item.created_at}</Text>}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: '700', color: COLORS.text, fontSize: 15 },
  rating: { fontSize: 12 },
  cafe: { color: COLORS.sage, fontSize: 12, marginTop: 4, fontWeight: '600' },
  comment: { color: COLORS.charcoal, marginTop: 8, lineHeight: 20 },
  date: { color: COLORS.muted, fontSize: 11, marginTop: 8 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
