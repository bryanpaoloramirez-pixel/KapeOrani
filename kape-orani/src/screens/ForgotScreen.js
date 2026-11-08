import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { forgotPassword } from '../services/api';
import { SECURITY_QUESTIONS, ENDPOINTS } from '../constants/config';

const PLACEHOLDER = '#9A9A8C';

export default function ForgotScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const [form, setForm] = useState({
    username: '', security_q: SECURITY_QUESTIONS[0], security_a: '', password: '', confirm: '',
  });
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [showQDropdown, setShowQDropdown] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    if (!form.username || !form.security_a || !form.password) {
      setErrMsg('Punan lahat ng fields.');
      return;
    }
    if (form.password.length < 6) {
      setErrMsg('Password minimum 6 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setErrMsg('Hindi magkatugma ang password.');
      return;
    }
    setErrMsg('');
    setBusy(true);
    try {
      const res = await forgotPassword({
        username: form.username.trim(),
        security_q: form.security_q,
        security_a: form.security_a.trim(),
        password: form.password,
      });
      if (!res.success) throw new Error(res.message);
      Alert.alert('Success', res.message || 'Na-reset ang password!', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e) {
      console.error('[Forgot] failed:', e?.message, e);
      setErrMsg(e?.message || 'May error.');
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.sub}>Sagutin ang security question para ma-reset ang password.</Text>

        {!!errMsg && (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={18} color={COLORS.danger} style={{ marginTop: 1 }} />
            <Text style={styles.errText}>{errMsg}</Text>
          </View>
        )}

        <Text style={styles.label}>Username</Text>
        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={18} color={PLACEHOLDER} />
          <TextInput
            style={styles.inputFlex}
            value={form.username}
            onChangeText={(v) => set('username', v)}
            autoCapitalize="none"
            placeholderTextColor={PLACEHOLDER}
            placeholder="username"
          />
        </View>

        <Text style={styles.label}>Security question</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowQDropdown((v) => !v)}
          activeOpacity={0.8}
        >
          <Ionicons name="help-circle-outline" size={18} color={PLACEHOLDER} />
          <Text style={styles.dropdownText} numberOfLines={2}>{form.security_q}</Text>
          <Ionicons
            name={showQDropdown ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.sage}
          />
        </TouchableOpacity>
        {showQDropdown && (
          <View style={styles.dropdownList}>
            {SECURITY_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.dropdownItem, form.security_q === q && styles.dropdownItemActive]}
                onPress={() => {
                  set('security_q', q);
                  setShowQDropdown(false);
                }}
              >
                <Text style={[styles.dropdownItemText, form.security_q === q && styles.dropdownItemTextActive]}>
                  {q}
                </Text>
                {form.security_q === q && (
                  <Ionicons name="checkmark" size={16} color={COLORS.sage} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Sagot</Text>
        <View style={styles.inputRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={PLACEHOLDER} />
          <TextInput
            style={styles.inputFlex}
            value={form.security_a}
            onChangeText={(v) => set('security_a', v)}
            placeholderTextColor={PLACEHOLDER}
            placeholder="sagot"
          />
        </View>

        <Text style={styles.label}>Bagong password</Text>
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={18} color={PLACEHOLDER} />
          <TextInput
            style={styles.inputFlex}
            value={form.password}
            onChangeText={(v) => set('password', v)}
            secureTextEntry
            placeholderTextColor={PLACEHOLDER}
            placeholder="min 6"
          />
        </View>

        <Text style={styles.label}>Confirm</Text>
        <View style={styles.inputRow}>
          <Ionicons name="shield-checkmark-outline" size={18} color={PLACEHOLDER} />
          <TextInput
            style={styles.inputFlex}
            value={form.confirm}
            onChangeText={(v) => set('confirm', v)}
            secureTextEntry
            placeholderTextColor={PLACEHOLDER}
            placeholder="ulitin"
          />
        </View>

        <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnInner}>
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>I-reset</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backWrap}>
        <View style={styles.backRow}>
          <Ionicons name="arrow-back" size={16} color={COLORS.sage} />
          <Text style={styles.backText}>Bumalik sa Login</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 36 },

  brand: { alignItems: 'center', marginBottom: 28 },
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

  header: { marginBottom: 8 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1A17',
    marginBottom: 6,
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  sub: { color: '#6B675F', fontSize: 14, marginBottom: 24, lineHeight: 20 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    padding: 0,
  },
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
  okBox: {
    backgroundColor: '#EDF7ED',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#B7E0B7',
  },
  okText: { color: '#1E7A32', fontWeight: '600', fontSize: 13, lineHeight: 18 },

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
    marginBottom: 14,
  },
  inputFocus: { borderColor: '#4A5D4E', backgroundColor: '#FAFBFA' },
  inputFlex: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1C1A17',
  },

  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E5E2DA',
  },
  dropdownText: { flex: 1, color: '#1C1A17', fontSize: 14, fontWeight: '500' },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E2DA',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EEE8',
  },
  dropdownItemActive: { backgroundColor: '#EAF0EC' },
  dropdownItemText: { flex: 1, color: '#1C1A17', fontSize: 13 },
  dropdownItemTextActive: { color: '#4A5D4E', fontWeight: '700' },

  btn: {
    backgroundColor: '#1C1A17',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.65 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },

  backWrap: { marginTop: 28, alignItems: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#4A5D4E', fontWeight: '600', fontSize: 14 },
  linkWrap: { marginTop: 28, alignItems: 'center' },
  linkText: { color: '#6B675F', fontSize: 14 },
  linkBold: { color: '#4A5D4E', fontWeight: '700' },
});
