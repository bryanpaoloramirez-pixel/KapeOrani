import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Asset } from 'expo-asset';
import { chatMessages, chatSend } from '../services/api';
import { COLORS } from '../constants/config';

const LOCAL_SOUND = require('../../assets/notification.mp3');
const FALLBACK_SOUND_URI = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

let _threadSound = null;
let _audioReady = false;

async function ensureThreadAudio() {
  if (_audioReady) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    _audioReady = true;
  } catch (e) {
    console.warn('[Chat] setAudioMode failed', e?.message);
  }
}

async function playThreadSound() {
  try {
    await ensureThreadAudio();
    if (_threadSound) {
      const st = await _threadSound.getStatusAsync();
      if (st.isLoaded) {
        await _threadSound.setPositionAsync(0);
        await _threadSound.playAsync();
        return;
      }
    }
    // Local first
    try {
      const asset = Asset.fromModule(LOCAL_SOUND);
      await asset.downloadAsync();
      const uri = asset.localUri || asset.uri;
      if (uri) {
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1.0 });
        _threadSound = sound;
        return;
      }
    } catch (e) {
      console.warn('[Chat] local sound failed', e?.message);
    }
    // Fallback (Snack-friendly)
    const { sound } = await Audio.Sound.createAsync(
      { uri: FALLBACK_SOUND_URI },
      { shouldPlay: true, volume: 1.0 }
    );
    _threadSound = sound;
  } catch (e) {
    console.warn('[Chat] sound failed', e?.message);
    _threadSound = null;
  }
}

export default function ChatThreadScreen({ route }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const { cafeId, cafeName } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const lastCountRef = useRef(0);
  const lastIdRef = useRef(0);

  const load = async () => {
    try {
      const res = await chatMessages(cafeId);
      const list = Array.isArray(res.data) ? res.data : [];
      const prevCount = lastCountRef.current;
      const prevId = lastIdRef.current;
      if (prevCount > 0 && list.length > prevCount) {
        const latest = list[list.length - 1];
        if (latest && latest.sender_type === 'owner' && Number(latest.id) > prevId) {
          playThreadSound();
        }
      }
      lastCountRef.current = list.length;
      if (list.length) lastIdRef.current = Number(list[list.length - 1].id) || 0;
      setMessages(list);
    } catch (_) {
      setMessages([]);
    }
  };

  useEffect(() => {
    lastCountRef.current = 0;
    lastIdRef.current = 0;
    (async () => { setLoading(true); await load(); setLoading(false); })();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [cafeId]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await chatSend(cafeId, text.trim());
      setText('');
      await load();
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 100);
    } catch (_) {}
    finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {loading ? (
        <ActivityIndicator color={COLORS.sage} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
          ListEmptyComponent={<Text style={styles.empty}>Mag-umpisa ng usapan tungkol sa {cafeName || 'cafe'}.</Text>}
          renderItem={({ item }) => {
            const mine = item.sender_type === 'user';
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.msg, mine && { color: '#fff' }]}>{item.message}</Text>
                <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
                  {String(item.created_at || '').slice(11, 16)}
                </Text>
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type a message..."
          placeholderTextColor="#9A9A8C"
          multiline
        />
        <TouchableOpacity style={styles.send} onPress={send} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.surface },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.sage },
  theirs: { alignSelf: 'flex-start', backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.darker },
  msg: { color: COLORS.text, fontSize: 15, lineHeight: 20 },
  time: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: 'flex-end' },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
  composer: {
    flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: COLORS.darker,
    backgroundColor: COLORS.white, alignItems: 'flex-end', gap: 8,
  },
  input: {
    flex: 1, maxHeight: 100, backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: COLORS.text,
  },
  send: { backgroundColor: COLORS.sage, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sendText: { color: '#fff', fontWeight: '700' },
});
