import React, { useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ENDPOINTS } from '../constants/config';

const PLACEHOLDER = '#9A9A8C';

export default function LoginScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [focus, setFocus] = useState(null);
  const passRef = useRef(null);

  const onSubmit = async () => {
    setErrMsg('');
    if (!username.trim() || !password) {
      setErrMsg('Ilagay ang username at password.');
      return;
    }
    setBusy(true);
    console.log('[Login] trying:', ENDPOINTS.mobile, 'user:', username.trim());
    try {
      await login(username.trim(), password);
      console.log('[Login] success');
    } catch (e) {
      console.error('[Login] failed:', e?.message, e);
      setErrMsg(e?.message || 'May error sa login.');
    } finally {
      setBusy(false);
    }
  };

  const iconTint = (key) => (focus === key ? COLORS.sage : PLACEHOLDER);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.brand}>
          <View style={styles.logoRow}>
            <Image
              source={require('../../assets/kapeorani-logo-sage.png')}
              style={{ width: 240, height: 86 }}
              resizeMode="contain"
            />
          </View>
        </View>

<View style={styles.card}>
          <Text style={styles.title}>Login</Text>
          <Text style={styles.sub}>Mag-sign in para makapag-browse.</Text>

          {!!errMsg && (
            <View style={styles.errBox}>
              <Ionicons name="alert-circle" size={18} color={COLORS.danger} style={{ marginTop: 1 }} />
              <Text style={styles.errText}>{errMsg}</Text>
            </View>
          )}

          <Text style={styles.label}>Username</Text>
          <View style={[styles.inputRow, focus === 'user' && styles.inputFocus]}>
            <Ionicons name="person-outline" size={18} color={iconTint('user')} />
            <TextInput
              style={styles.inputFlex}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username mo"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="next"
              onFocus={() => setFocus('user')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={() => passRef.current && passRef.current.focus()}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputRow, focus === 'pass' && styles.inputFocus]}>
            <Ionicons name="lock-closed-outline" size={18} color={iconTint('pass')} />
            <TextInput
              ref={passRef}
              style={styles.inputFlex}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="go"
              onFocus={() => setFocus('pass')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={onSubmit}
            />
            <TouchableOpacity
              onPress={() => setShowPass((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.sage}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('Forgot')} style={styles.forgotWrap}>
            <Text style={styles.forgot}>Nakalimutan ang password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.btnInner}>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.btnText}>Login</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            style={styles.regWrap}
            activeOpacity={0.85}
          >
            <Text style={styles.regText}>
              Wala pang account? <Text style={styles.regBold}>Mag-register</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },

  brand: { alignItems: 'center', marginBottom: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EAF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLeaf: { fontSize: 22 },
  logoText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1C1A17',
    letterSpacing: -0.4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  logoAccent: { color: '#4A5D4E' },
  logoSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#8A867C',
    letterSpacing: 1.6,
    marginTop: 2,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1A17',
    marginBottom: 6,
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  sub: { color: '#6B675F', fontSize: 14, marginBottom: 28, lineHeight: 20 },

  errBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FDF2F2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F5C6C6',
  },
  errText: { flex: 1, color: '#C0392B', fontWeight: '600', fontSize: 13, lineHeight: 18 },

  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B675F',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E2DA',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  inputFocus: { borderColor: '#4A5D4E', backgroundColor: '#FAFBFA' },
  inputFlex: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1C1A17',
  },

  forgotWrap: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 24, paddingVertical: 4 },
  forgot: { color: '#4A5D4E', fontSize: 13, fontWeight: '600' },

  btn: {
    backgroundColor: '#1C1A17',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },

  regWrap: { marginTop: 28, alignItems: 'center' },
  regText: { color: '#6B675F', fontSize: 14 },
  regBold: { color: '#4A5D4E', fontWeight: '700' },
});
