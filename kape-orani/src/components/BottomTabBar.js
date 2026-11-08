import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

// Map is center + floating raised; Reviews added for submitted reviews
export const TABS = [
  { name: 'Home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'Reviews', label: 'Reviews', icon: 'star-outline', iconActive: 'star' },
  { name: 'Map', label: 'Map', icon: 'map-outline', iconActive: 'map', center: true },
  { name: 'ChatList', label: 'Chats', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  { name: 'Profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

/**
 * Floating pill Navbar — Map elevated in the center.
 */
export default function BottomTabBar({ active, onPress, badges = {} }) {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.pillBar}>
        {TABS.map((t) => {
          const on = t.name === active;
          const badge = badges[t.name] || 0;
          const isCenter = !!t.center;

          if (isCenter) {
            return (
              <TouchableOpacity
                key={t.name}
                style={styles.centerTab}
                onPress={() => onPress(t.name)}
                activeOpacity={0.85}
              >
                <View style={[styles.centerBtn, on && styles.centerBtnOn]}>
                  <Ionicons name={on ? t.iconActive : t.icon} size={26} color="#fff" />
                </View>
                <Text style={[styles.label, styles.centerLabel, on && styles.labelOn]} numberOfLines={1}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          }

          const iconColor = on ? COLORS.sage : COLORS.muted;
          return (
            <TouchableOpacity
              key={t.name}
              style={styles.tab}
              onPress={() => onPress(t.name)}
              activeOpacity={0.75}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Ionicons name={on ? t.iconActive : t.icon} size={22} color={iconColor} />
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (COLORS) =>
  StyleSheet.create({
    wrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
      paddingHorizontal: 16,
    },
    pillBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: COLORS.card,
      borderRadius: 36,
      paddingVertical: 8,
      paddingHorizontal: 8,
      minHeight: 64,
      width: '100%',
      maxWidth: 400,
      elevation: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      borderWidth: 1,
      borderColor: COLORS.darker,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    iconWrap: {
      width: 40,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapOn: {
      backgroundColor: COLORS.sageSoft,
    },
    label: {
      fontSize: 10,
      color: COLORS.muted,
      marginTop: 2,
      fontWeight: '600',
    },
    labelOn: {
      color: COLORS.sage,
      fontWeight: '800',
    },
    centerTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: -28,
      paddingBottom: 2,
    },
    centerBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: COLORS.sage,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      borderWidth: 3,
      borderColor: COLORS.card,
    },
    centerBtnOn: {
      backgroundColor: COLORS.sand || '#D8A268',
    },
    centerLabel: {
      marginTop: 4,
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: 0,
      backgroundColor: COLORS.danger,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '800',
    },
  });
