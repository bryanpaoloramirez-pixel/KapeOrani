import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/api';
import ErrorBanner from '../components/ErrorBanner';

export default function EditProfileScreen({ navigation }) {
  const { colors: COLORS } = useTheme();
  const styles = useMemo(() => createStyles(COLORS), [COLORS]);
  const { user, setUser } = useAuth();
  const [fullname, setFullname] = useState(user?.fullname || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const onSave = async () => {
    setErrMsg('');
    if (!fullname.trim()) return setErrMsg('Kailangan ang pangalan.');
    if (!/^09\d{9}$/.test(phone.trim())) return setErrMsg('Phone dapat 11 digits, nagsisimula sa 09.');
    if (newPass || curPass || confirm) {
      if (!curPass) return setErrMsg('Ilagay ang current password.');
      if (newPass.length < 6) return setErrMsg('Bagong password: minimum 6 characters.');
      if (newPass !== confirm) return setErrMsg('Hindi magkatugma ang bagong password.');
    }
    setBusy(true);
    try {
      const res = await updateProfile({
        fullname: fullname.trim(),
        phone: phone.trim(),
        current_password: curPass,
        new_password: newPass,
      });
      if (!res.success) throw new Error(res.message || 'Hindi na-save ang profile.');
      await setUser({ ...user, ...(res.user || { fullname: fullname.trim(), phone: phone.trim() }) });
      Alert.alert('Success', res.message || 'Na-update ang profile!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.error('[EditProfile] failed:', e?.message, e);
      setErrMsg(e?.message || 'May error sa pag-save.');
    } finally {
      setBusy(false);
    }
  };

  const Field = ({ label, ...props }) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={COLORS.muted} {...props} />
    </>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(fullname || user?.username || '?').trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>@{user?.username}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Personal Info</Text>
        {Field({ label: 'Buong pangalan', value: fullname, onChangeText: setFullname, placeholder: 'Juan Dela Cruz' })}
        {Field({ label: 'Phone number', value: phone, onChangeText: setPhone, placeholder: '09XXXXXXXXX', keyboardType: 'phone-pad', maxLength: 11 })}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Palitan ang Password (optional)</Text>
        {Field({ label: 'Current password', value: curPass, onChangeText: setCurPass, secureTextEntry: true, placeholder: '••••••••' })}
        {Field({ label: 'Bagong password', value: newPass, onChangeText: setNewPass, secureTextEntry: true, placeholder: 'Minimum 6 characters' })}
        {Field({ label: 'Ulitin ang bagong password', value: confirm, onChangeText: setConfirm, secureTextEntry: true, placeholder: '••••••••' })}
      </View>

      <ErrorBanner message={errMsg} />

      <TouchableOpacity style={[styles.btn, busy && { opacity: 0.7 }]} onPress={onSave} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>I-save ang Profile</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (COLORS) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: COLORS.surface },
    avatarWrap: { alignItems: 'center', marginBottom: 16 },
    avatar: {
      width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.sage,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
    username: { color: COLORS.muted, marginTop: 8, fontWeight: '600' },
    card: {
      backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 14,
      borderWidth: 1, borderColor: COLORS.darker,
    },
    section: { color: COLORS.text, fontWeight: '800', fontSize: 15, marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '600', color: COLORS.sageLight, marginBottom: 6 },
    input: {
      backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.darker, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text, marginBottom: 12,
    },
    btn: { backgroundColor: COLORS.sage, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  });
