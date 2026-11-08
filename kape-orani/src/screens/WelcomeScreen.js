import React, { useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, Animated, StyleSheet, StatusBar, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const SAGE = '#4D6152';
const ND = Platform.OS !== 'web';

/**
 * Unang screen pagkatapos ng loading screen.
 * Logo sa gitna, may Login at Register buttons sa ibaba ng logo.
 * - Login    -> LoginScreen
 * - Register -> RegisterScreen
 */
export default function WelcomeScreen({ navigation }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: ND }),
      Animated.timing(rise, { toValue: 0, duration: 500, useNativeDriver: ND }),
    ]).start();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], alignItems: 'center', width: '100%' }}>
        <Image
          source={require('../../assets/kapeorani-logo-sage.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.loginText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add-outline" size={20} color={SAGE} />
            <Text style={styles.registerText}>Register</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  logo: { width: 280, height: 140 },
  actions: { width: '100%', maxWidth: 340, marginTop: 28, gap: 12 },
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: SAGE, paddingVertical: 14, borderRadius: 14,
  },
  loginText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  registerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingVertical: 13, borderRadius: 14,
    borderWidth: 1.5, borderColor: SAGE,
  },
  registerText: { color: SAGE, fontWeight: '800', fontSize: 16 },
});
