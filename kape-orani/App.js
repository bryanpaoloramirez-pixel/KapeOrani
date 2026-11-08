/**
 * KapeOrani — Expo Snack friendly
 * Walang @react-navigation (ayos ng native-stack error)
 */
import './src/utils/webAlert';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  View,
  StyleSheet,
  StatusBar,
  Text,
  TouchableOpacity,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchSiteStatus, chatThreads } from './src/services/api';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { NotificationProvider, useNotifications } from './src/context/NotificationContext';
import BottomTabBar, { TABS } from './src/components/BottomTabBar';
import NotificationsScreen from './src/screens/NotificationsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ForgotScreen from './src/screens/ForgotScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import CafeDetailScreen from './src/screens/CafeDetailScreen';
import ReviewsScreen from './src/screens/ReviewsScreen';
import MyReviewsScreen from './src/screens/MyReviewsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MyReservationsScreen from './src/screens/MyReservationsScreen';
import ChatListScreen from './src/screens/ChatListScreen';
import ChatThreadScreen from './src/screens/ChatThreadScreen';
import { COLORS as FALLBACK } from './src/constants/config';
import LoadingScreen from './src/components/LoadingScreen';
import ByethostBridge from './src/utils/byethostBridge';

function useNav(stack, setStack) {
  return {
    navigate: (name, params = {}) => setStack((s) => [...s, { name, params }]),
    goBack: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    replace: (name, params = {}) => setStack([{ name, params }]),
  };
}

function Header({ title, onBack }) {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createHeaderStyles(COLORS), [COLORS]);
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 70 }} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 70 }} />
    </View>
  );
}

function AuthFlow() {
  // Unang lalabas: Welcome (logo + Login/Register buttons)
  const [stack, setStack] = useState([{ name: 'Welcome', params: {} }]);
  const nav = useNav(stack, setStack);
  const current = stack[stack.length - 1];
  const screenProps = { navigation: nav, route: { params: current.params } };

  if (current.name === 'Welcome') return <WelcomeScreen {...screenProps} />;

  if (current.name === 'Register') {
    // "May account na? Mag-login" -> laging sa Login ang punta, kahit galing Welcome
    const regNav = {
      ...nav,
      goBack: () =>
        setStack((s) => {
          const prev = s[s.length - 2];
          return prev && prev.name === 'Login'
            ? s.slice(0, -1)
            : [...s.slice(0, -1), { name: 'Login', params: {} }];
        }),
    };
    return <RegisterScreen navigation={regNav} route={screenProps.route} />;
  }
  if (current.name === 'Forgot') return <ForgotScreen {...screenProps} />;
  return <LoginScreen {...screenProps} />;
}

function AppFlow() {
  const [stack, setStack] = useState([{ name: 'Home', params: {} }]);
  const nav = useNav(stack, setStack);
  const current = stack[stack.length - 1];
  const screenProps = { navigation: nav, route: { params: current.params } };

  const titles = {
    Map: 'Cafe Map',
    CafeDetail: 'Cafe Details',
    Reviews: 'Reviews',
    Profile: 'Profile',
    MyReservations: 'My Reservations',
    ChatList: 'Messages',
    ChatThread: current.params?.cafeName || 'Chat',
    Notifications: 'Notifications',
    EditProfile: 'Edit Profile',
  };

  let body;
  switch (current.name) {
    case 'Map':
      body = <MapScreen {...screenProps} />;
      break;
    case 'CafeDetail':
      body = <CafeDetailScreen {...screenProps} />;
      break;
    case 'Reviews':
      // Bottom tab = My Reviews; deep link with cafe still uses public ReviewsScreen
      body = current.params?.cafeId
        ? <ReviewsScreen {...screenProps} />
        : <MyReviewsScreen {...screenProps} />;
      break;
    case 'Profile':
      body = <ProfileScreen {...screenProps} />;
      break;
    case 'MyReservations':
      body = <MyReservationsScreen {...screenProps} />;
      break;
    case 'ChatList':
      body = <ChatListScreen {...screenProps} />;
      break;
    case 'ChatThread':
      body = <ChatThreadScreen {...screenProps} />;
      break;
    case 'Notifications':
      body = <NotificationsScreen {...screenProps} />;
      break;
    case 'EditProfile':
      body = <EditProfileScreen {...screenProps} />;
      break;
    default:
      body = <HomeScreen {...screenProps} />;
  }

  const showHeader = current.name !== 'Home';
  const isTab = TABS.some((t) => t.name === current.name);
  const canGoBack = stack.length > 1;
  const { colors: THEME, isDark } = useTheme();
  const { items } = useNotifications();
  // Notif-based chat items (fallback)
  const notifChatUnread = items.filter((i) => i.type === 'chat' && !i.read).length;

  // Live badge: total unread messages from coffee shop owners (chat_threads)
  const [chatBadge, setChatBadge] = useState(0);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await chatThreads();
        if (!alive) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        // Prefer API total unread; else sum per-thread unread from owners
        let total = Number(res?.unread);
        if (!Number.isFinite(total) || total < 0) {
          total = rows.reduce((sum, t) => sum + (Number(t.unread) || 0), 0);
        }
        setChatBadge(total > 0 ? total : 0);
      } catch (_) {
        // keep last known badge
      }
    };
    pull();
    const timer = setInterval(pull, 12000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [current.name]); // refresh when navigating (e.g. after opening a chat)

  const chatUnread = chatBadge > 0 ? chatBadge : notifChatUnread;

  return (
    <View style={{ flex: 1, backgroundColor: THEME.surface }}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={THEME.card}
      />
      {showHeader && (
        <Header
          title={titles[current.name] || ''}
          onBack={canGoBack ? nav.goBack : undefined}
        />
      )}
      <View style={{ flex: 1, paddingBottom: isTab ? 96 : 0 }}>{body}</View>
      {isTab && (
        <BottomTabBar
          active={current.name}
          badges={{ ChatList: chatUnread }}
          onPress={(name) => {
            if (name !== current.name || canGoBack) nav.replace(name);
          }}
        />
      )}
    </View>
  );
}



function MaintenanceScreen({ onRetry, checking }) {
  const { colors: COLORS } = useTheme();
  return (
    <View style={[maintStyles.root, { backgroundColor: COLORS.espresso || '#1C1A17' }]}>
      <StatusBar barStyle="light-content" />
      <View style={maintStyles.iconWrap}>
        <Ionicons name="lock-closed" size={40} color="#D8A268" />
      </View>
      <Text style={maintStyles.brand}>
        Kape<Text style={{ color: '#D8A268' }}>Orani</Text>
      </Text>
      <View style={maintStyles.card}>
        <Text style={maintStyles.badge}>MAINTENANCE MODE</Text>
        <Text style={maintStyles.msg}>
          Naka-lock muna ang app at website para sa updates. Bumalik agad kami — salamat sa inyong pasensya.
        </Text>
        <Text style={maintStyles.sub}>Orani, Bataan · Coffee Directory</Text>
      </View>
      <TouchableOpacity
        style={maintStyles.btn}
        onPress={onRetry}
        disabled={checking}
        activeOpacity={0.85}
      >
        {checking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={maintStyles.btnText}>Subukan ulit</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Root() {
  const { isLoggedIn, loading } = useAuth();
  const { colors: COLORS } = useTheme();
  const [maintenance, setMaintenance] = useState(null); // null = checking, true/false
  const [checkingMaint, setCheckingMaint] = useState(false);
  const [splashDone, setSplashDone] = useState(false); // keep loading screen visible at least ~1.8s
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

  const checkMaintenance = useCallback(async () => {
    setCheckingMaint(true);
    try {
      const res = await fetchSiteStatus();
      const on = !!(res && (res.maintenance_mode === true || res.maintenance_mode === 1));
      setMaintenance(on);
    } catch (_) {
      // Kung hindi ma-reach ang API, huwag i-lock ang app (network issue ≠ maintenance)
      setMaintenance(false);
    } finally {
      setCheckingMaint(false);
    }
  }, []);

  useEffect(() => {
    checkMaintenance();
    const id = setInterval(checkMaintenance, 30000); // sync with web every 30s
    return () => clearInterval(id);
  }, [checkMaintenance]);

  if (!splashDone) {
    return <LoadingScreen />;
  }

  if (loading || maintenance === null) {
    return <LoadingScreen />;
  }

  if (maintenance) {
    return <MaintenanceScreen onRetry={checkMaintenance} checking={checkingMaint} />;
  }

  return isLoggedIn ? <AppFlow /> : <AuthFlow />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <View style={bootStyles.root}>
            <Root />
            {/* Hidden WebView na tumatawid sa anti-bot check ng Byethost */}
            <ByethostBridge />
          </View>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const createHeaderStyles = (COLORS) =>
  StyleSheet.create({
    header: {
      backgroundColor: COLORS.card,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: COLORS.darker,
    },
    backBtn: { width: 70 },
    backText: { color: COLORS.sage, fontWeight: '700', fontSize: 16 },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      color: COLORS.text,
      fontWeight: '700',
      fontSize: 16,
    },
  });

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: FALLBACK.surface,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: {
    marginTop: 12,
    fontWeight: '700',
    fontSize: 18,
  },
});
