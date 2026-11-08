import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';

const AuthContext = createContext(null);
const STORAGE_KEY = '@kapeorani_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const token = await api.getToken();
        if (raw && token) {
          setUser(JSON.parse(raw));
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
          await api.setToken('');
          setUser(null);
        }
      } catch (_) {
        setUser(null);
      }
      setLoading(false);
    })();
  }, []);

  const persist = async (u) => {
    if (u) {
      setUser(u);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      setUser(null);
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
  };

  const login = async (username, password) => {
    const res = await api.login(username, password);
    if (!res.success) throw new Error(res.message || 'Login failed');
    await persist(res.user);
    return res;
  };

  const register = async (data) => {
    const res = await api.register(data);
    if (!res.success) throw new Error(res.message || 'Registration failed');
    await persist(res.user);
    return res;
  };

  const logout = async () => {
    // Clear local session first so browser UI logs out even if API hangs
    setUser(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    try {
      await api.logout();
    } catch (e) {
      console.warn('API logout:', e?.message);
      try {
        await api.setToken('');
      } catch (_) {}
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      isLoggedIn: !!user,
      setUser: persist,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
