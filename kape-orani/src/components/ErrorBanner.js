import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/config';

// Nakikita sa screen mismo ang error (hindi umaasa sa Alert).
export default function ErrorBanner({ message, hint }) {
  const { colors: COLORS } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  if (!message) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.title}>⚠️ {message}</Text>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const createStyles = (COLORS) => StyleSheet.create({
  box: {
    backgroundColor: '#FDECEA',
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  title: { color: COLORS.danger, fontWeight: '700', fontSize: 13 },
  hint: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
});
