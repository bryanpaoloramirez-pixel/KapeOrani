// In-app notifications (walang kailangang bagong backend):
// - bagong mensahe galing sa cafe (unread chat)
// - reservation na na-confirm / na-decline
// - mga aktibong promo
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { chatThreads, fetchPromos, myReservations } from '../services/api';

const READ_KEY = '@kapeorani_notif_read';
const ENABLED_KEY = '@kapeorani_notif_enabled';
const POLL_MS = 15000;

// Local asset (Expo Go / dev build). Fallback URI for Expo Snack if local require fails.
const LOCAL_SOUND = require('../../assets/notification.mp3');
// Public short notification beep as last-resort fallback (same style SMS-like ping)
const FALLBACK_SOUND_URI = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

const NotificationContext = createContext({
  items: [],
  unread: 0,
  enabled: true,
  refreshing: false,
  refresh: async () => {},
  markRead: () => {},
  markAllRead: () => {},
  setEnabled: () => {},
});

export function NotificationProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const [items, setItems] = useState([]);
  const [readIds, setReadIds] = useState([]);
  const [enabled, setEnabledState] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialPollDoneRef = useRef(false);
  const lastChatSignalRef = useRef(null); // null = not yet polled
  const soundRef = useRef(null);
  const audioReadyRef = useRef(false);

  const ensureAudio = useCallback(async () => {
    if (audioReadyRef.current) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      audioReadyRef.current = true;
    } catch (e) {
      console.warn('[Notif] setAudioMode failed', e?.message);
    }
  }, []);

  const loadSound = useCallback(async () => {
    if (soundRef.current) return soundRef.current;
    await ensureAudio();
    // Try local asset first (Expo Go / standalone)
    try {
      const asset = Asset.fromModule(LOCAL_SOUND);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (uri) {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, volume: 1.0 }
        );
        soundRef.current = sound;
        return sound;
      }
    } catch (e) {
      console.warn('[Notif] local sound load failed, trying fallback', e?.message);
    }
    // Fallback remote (helps Expo Snack when asset isn't bundled)
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: FALLBACK_SOUND_URI },
        { shouldPlay: false, volume: 1.0 }
      );
      soundRef.current = sound;
      return sound;
    } catch (e2) {
      console.warn('[Notif] fallback sound load failed', e2?.message);
      return null;
    }
  }, [ensureAudio]);

  const playNotifSound = useCallback(async () => {
    try {
      const sound = await loadSound();
      if (!sound) return;
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      }
    } catch (e) {
      console.warn('[Notif] sound play failed', e?.message);
      // Reset so next play retries load
      try {
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }
      } catch (_) {}
      soundRef.current = null;
    }
  }, [loadSound]);

  useEffect(() => {
    (async () => {
      try {
        const r = await AsyncStorage.getItem(READ_KEY);
        if (r) setReadIds(JSON.parse(r));
        const e = await AsyncStorage.getItem(ENABLED_KEY);
        if (e === '0') setEnabledState(false);
      } catch (_) {}
      // Preload audio so first notification is instant
      try {
        await loadSound();
      } catch (_) {}
    })();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [loadSound]);

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !enabled) {
      setItems([]);
      return;
    }
    setRefreshing(true);
    const out = [];
    let chatSignal = '';
    try {
      const [chat, res, promos] = await Promise.allSettled([
        chatThreads(),
        myReservations(),
        fetchPromos(),
      ]);
      if (chat.status === 'fulfilled' && Array.isArray(chat.value?.data)) {
        chat.value.data
          .filter((t) => Number(t.unread) > 0)
          .forEach((t) => {
            out.push({
              id: `chat-${t.cafe_id}-${t.last_id}`,
              type: 'chat',
              status: null,
              title: `May bagong mensahe mula sa ${t.cafe_name}`,
              body: t.last_message || '',
              time: t.last_at || '',
              data: { cafeId: t.cafe_id, cafeName: t.cafe_name },
            });
            chatSignal += `${t.cafe_id}:${t.last_id};`;
          });
      }
      if (res.status === 'fulfilled' && Array.isArray(res.value?.data)) {
        res.value.data.forEach((r) => {
          const st = String(r.status || '').toLowerCase();
          if (st !== 'confirmed' && st !== 'declined') return;
          out.push({
            id: `res-${r.id}-${st}`,
            type: 'reservation',
            status: st,
            title: st === 'confirmed' ? 'Na-confirm ang reservation mo' : 'Na-decline ang reservation mo',
            body: `${r.cafe_name || 'Cafe'} · ${r.reservation_date || ''} ${r.reservation_time || ''}`.trim(),
            time: r.reservation_date || '',
            data: {},
          });
        });
      }
      if (promos.status === 'fulfilled' && Array.isArray(promos.value?.data)) {
        promos.value.data.slice(0, 10).forEach((p) =>
          out.push({
            id: `promo-${p.id}`,
            type: 'promo',
            status: null,
            title: p.title || 'Bagong promo',
            body: p.cafe_name || p.description || '',
            time: p.start_date || '',
            data: {},
          })
        );
      }
    } catch (e) {
      console.warn('[Notif] refresh failed:', e?.message);
    }
    setItems(out);

    // Sound logic:
    // - Skip the very first poll (baseline)
    // - After that, play whenever chatSignal changes (including first new message after empty)
    if (!initialPollDoneRef.current) {
      initialPollDoneRef.current = true;
      lastChatSignalRef.current = chatSignal;
    } else if (chatSignal !== lastChatSignalRef.current) {
      // Only play when there is something new to notify (signal grew / changed)
      if (chatSignal && chatSignal !== lastChatSignalRef.current) {
        playNotifSound();
      }
      lastChatSignalRef.current = chatSignal;
    }

    setRefreshing(false);
  }, [isLoggedIn, enabled, playNotifSound]);

  useEffect(() => {
    refresh();
    if (!isLoggedIn || !enabled) return undefined;
    const t = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(t);
      sub?.remove?.();
    };
  }, [refresh, isLoggedIn, enabled]);

  const persistRead = (ids) => {
    const trimmed = ids.slice(-300);
    setReadIds(trimmed);
    AsyncStorage.setItem(READ_KEY, JSON.stringify(trimmed)).catch(() => {});
  };

  const markRead = (id) => {
    if (!readIds.includes(id)) persistRead([...readIds, id]);
  };
  const markAllRead = () => {
    persistRead(Array.from(new Set([...readIds, ...items.map((i) => i.id)])));
  };
  const setEnabled = (v) => {
    setEnabledState(v);
    AsyncStorage.setItem(ENABLED_KEY, v ? '1' : '0').catch(() => {});
  };

  const value = useMemo(() => {
    const withRead = items.map((i) => ({ ...i, read: readIds.includes(i.id) }));
    return {
      items: withRead,
      unread: withRead.filter((i) => !i.read).length,
      enabled,
      refreshing,
      refresh,
      markRead,
      markAllRead,
      setEnabled,
    };
  }, [items, readIds, enabled, refreshing, refresh]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
