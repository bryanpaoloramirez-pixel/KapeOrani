import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Platform, ActivityIndicator, ScrollView, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

export default function ProfileScreen({ navigation }) {
  const { colors: COLORS, isDark, toggle } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { user, logout } = useAuth();
  const { unread, enabled, setEnabled } = useNotifications();
  const [busy, setBusy] = useState(false);

  const doLogout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      console.warn('Logout error:', e);
      try {
        await logout();
      } catch (_) {}
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    // Alert.alert is unreliable on React Native Web (browser)
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm('Logout? Sigurado ka?') : true;
      if (ok) doLogout();
      return;
    }
    Alert.alert('Logout', 'Sigurado ka?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: () => doLogout() },
    ]);
  };

  const initial = (user?.fullname || user?.username || '?').trim().charAt(0).toUpperCase();

  const Row = ({ icon, label, onPress, right, danger }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={22} color={danger ? COLORS.danger : COLORS.sage} />
      </View>
      <Text style={[styles.rowText, danger && { color: COLORS.danger }]}>{label}</Text>
      {right !== undefined ? right : onPress ? <Text style={styles.chev}>›</Text> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name}>{user?.fullname || 'User'}</Text>
        <Text style={styles.meta}>@{user?.username}</Text>
        {!!user?.phone && <Text style={styles.meta}>{user.phone}</Text>}
        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="create-outline" size={16} color="#1C1A17" />
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.group}>
        {Row({ icon: 'calendar-outline', label: 'My Reservations', onPress: () => navigation.navigate('MyReservations') })}
        {Row({
          icon: 'notifications-outline',
          label: 'Notifications',
          onPress: () => navigation.navigate('Notifications'),
          right: (
            <View style={styles.rightWrap}>
              {unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
              <Text style={styles.chev}>›</Text>
            </View>
          ),
        })}
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.group}>
        {Row({
          icon: isDark ? 'moon-outline' : 'sunny-outline',
          label: isDark ? 'Dark Mode' : 'Light Mode',
          right: (
            <Switch
              value={isDark}
              onValueChange={toggle}
              trackColor={{ false: COLORS.darker, true: COLORS.sage }}
              thumbColor="#fff"
            />
          ),
        })}
        {Row({
          icon: 'notifications-off-outline',
          label: 'Mag-notify sa akin',
          right: (
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: COLORS.darker, true: COLORS.sage }}
              thumbColor="#fff"
            />
          ),
        })}
      </View>

      <TouchableOpacity style={styles.logout} onPress={onLogout} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={COLORS.danger} />
        ) : (
          <Text style={styles.logoutText}>Logout</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (COLORS) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.surface },
    card: {
      backgroundColor: COLORS.espresso,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
      marginBottom: 8,
    },
    avatar: {
      width: 78, height: 78, borderRadius: 39, backgroundColor: COLORS.sage,
      alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      borderWidth: 3, borderColor: COLORS.sand,
    },
    avatarText: { color: '#fff', fontSize: 34, fontWeight: '800' },
    name: { color: COLORS.cream, fontSize: 21, fontWeight: '800' },
    meta: { color: COLORS.sageLight, marginTop: 3 },
    editBtn: {
      marginTop: 14, backgroundColor: COLORS.sand, borderRadius: 20,
      paddingHorizontal: 18, paddingVertical: 8,
      flexDirection: 'row', alignItems: 'center', gap: 6,
    },
    editBtnText: { color: '#1C1A17', fontWeight: '800', fontSize: 13 },
    sectionTitle: {
      color: COLORS.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase',
      marginTop: 18, marginBottom: 8, marginLeft: 4, letterSpacing: 0.6,
    },
    group: {
      backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.darker,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.darker,
    },
    rowIcon: { width: 32, alignItems: 'flex-start', justifyContent: 'center' },
    rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
    chev: { color: COLORS.muted, fontSize: 22, marginLeft: 8 },
    rightWrap: { flexDirection: 'row', alignItems: 'center' },
    badge: {
      backgroundColor: COLORS.danger, minWidth: 20, height: 20, borderRadius: 10,
      paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    logout: {
      marginTop: 22, borderRadius: 14, borderWidth: 1, borderColor: COLORS.danger,
      paddingVertical: 14, alignItems: 'center',
    },
    logoutText: { color: COLORS.danger, fontWeight: '800', fontSize: 15 },
  });
