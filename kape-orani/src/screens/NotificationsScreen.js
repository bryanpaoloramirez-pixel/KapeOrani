import React, { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

function NotifIcon({ type, status, color }) {
  const size = 22;
  if (type === 'chat') return <Ionicons name="mail-outline" size={size} color={color} />;
  if (type === 'reservation') {
    if (status === 'confirmed') return <Ionicons name="checkmark-circle" size={size} color={color} />;
    return <Ionicons name="close-circle" size={size} color={color} />;
  }
  if (type === 'promo') return <Ionicons name="gift-outline" size={size} color={color} />;
  return <Ionicons name="notifications-outline" size={size} color={color} />;
}

export default function NotificationsScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { items, unread, enabled, refreshing, refresh, markRead, markAllRead } = useNotifications();

  const open = (n) => {
    markRead(n.id);
    if (n.type === 'chat') {
      navigation.navigate('ChatThread', { cafeId: n.data.cafeId, cafeName: n.data.cafeName });
    } else if (n.type === 'reservation') {
      navigation.navigate('MyReservations');
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topRow}>
        <Text style={styles.count}>
          {enabled ? (unread > 0 ? `${unread} bago` : 'Wala nang bago') : 'Naka-off ang notifications'}
        </Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.link}>Basahin lahat</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.sage} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-outline" size={36} color={COLORS.muted} />
            <Text style={styles.empty}>
              {enabled
                ? 'Wala pang notification.\nMakikita dito ang mga mensahe, reservation updates, at promo.'
                : 'I-on ang notifications sa Profile > Settings.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const iconColor =
            item.type === 'reservation' && item.status === 'declined'
              ? COLORS.danger
              : item.type === 'reservation' && item.status === 'confirmed'
                ? COLORS.success
                : COLORS.sage;
          return (
            <TouchableOpacity
              style={[styles.card, !item.read && styles.cardUnread]}
              onPress={() => open(item)}
              activeOpacity={0.8}
            >
              <View style={styles.iconWrap}>
                <NotifIcon type={item.type} status={item.status} color={iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!item.body && (
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                )}
                {!!item.time && <Text style={styles.time}>{item.time}</Text>}
              </View>
              {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const createStyles = (COLORS) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.surface },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
    },
    count: { color: COLORS.muted, fontWeight: '600', fontSize: 13 },
    link: { color: COLORS.sage, fontWeight: '800', fontSize: 13 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: COLORS.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: COLORS.darker,
    },
    cardUnread: { borderColor: COLORS.sage, backgroundColor: COLORS.sageSoft },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.sageSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
    body: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
    time: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.sand },
    emptyWrap: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
    empty: { textAlign: 'center', color: COLORS.muted, marginTop: 14, fontSize: 14, lineHeight: 20 },
  });
