import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { myReviews } from '../services/api';

/**
 * My submitted reviews (tab from bottom navbar).
 */
export default function MyReviewsScreen() {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const res = await myReviews();
      if (res.success === false) throw new Error(res.message || 'Hindi ma-load');
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e.message || 'Hindi ma-load ang reviews.');
      setData([]);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, []);

  return (
    <View style={styles.root}>
      {loading ? (
        <ActivityIndicator color={COLORS.sage} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error || 'Wala ka pang naisubmit na review.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.cafe} numberOfLines={1}>
                  {item.cafe_name || `Cafe #${item.cafe_id}`}
                </Text>
                <Text style={styles.rating}>
                  {'⭐'.repeat(Math.min(5, Number(item.rating) || 0))}
                </Text>
              </View>
              <Text style={styles.comment}>{item.comment}</Text>
              <View style={styles.metaRow}>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        String(item.status || '').toLowerCase() === 'approved'
                          ? COLORS.success + '22'
                          : COLORS.sand + '33',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color:
                        String(item.status || '').toLowerCase() === 'approved'
                          ? COLORS.success
                          : COLORS.sand,
                      fontWeight: '700',
                      fontSize: 11,
                    }}
                  >
                    {(item.status || 'pending').toUpperCase()}
                  </Text>
                </View>
                {!!item.created_at && (
                  <Text style={styles.date}>{String(item.created_at).slice(0, 16)}</Text>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (COLORS) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.surface },
    card: {
      backgroundColor: COLORS.white || COLORS.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: COLORS.darker,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    cafe: { fontWeight: '700', color: COLORS.text, fontSize: 15, flex: 1 },
    rating: { fontSize: 12 },
    comment: { color: COLORS.charcoal, marginTop: 8, lineHeight: 20 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    date: { color: COLORS.muted, fontSize: 11 },
    empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40, paddingHorizontal: 24 },
  });
