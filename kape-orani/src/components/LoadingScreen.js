import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet, StatusBar, Platform } from 'react-native';

const SAGE = '#4D6152';
const ND = Platform.OS !== 'web';

/** Animated splash / loading screen with the KapeOrani sage logo. */
export default function LoadingScreen({ backgroundColor = '#FFFFFF' }) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: ND }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 60, useNativeDriver: ND }),
    ]).start();

    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(d, { toValue: 0.3, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.delay((2 - i) * 180),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <StatusBar barStyle="dark-content" backgroundColor={backgroundColor} />
      <Animated.View style={{ opacity: fade, transform: [{ scale }], alignItems: 'center' }}>
        <Image
          source={require('../../assets/kapeorani-logo-sage.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.dotsRow}>
          {dots.map((d, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: d, transform: [{ scale: d.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.2] }) }] }]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 280, height: 140 },
  dotsRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: SAGE },
});
