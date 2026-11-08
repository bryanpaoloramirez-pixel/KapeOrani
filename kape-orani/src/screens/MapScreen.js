import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useMemo as useThemedMemo } from 'react';
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { COLORS } from '../constants/config';
import * as api from '../services/api';
import LeafletMap from '../components/LeafletMap';
import { MODES, getRoutes, travelHours, formatDuration, formatKm } from '../utils/routing';

const ORANI = {
  latitude: 14.8005,
  longitude: 120.5372,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

function cafeCoords(cafe) {
  const lat = parseFloat(cafe.lat ?? cafe.latitude);
  const lng = parseFloat(cafe.lng ?? cafe.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

export default function MapScreen({ navigation, route }) {
  const { colors: COLORS, isDark } = useTheme();
  const styles = useThemedMemo(() => createStyles(COLORS), [COLORS]);

  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(true);
  const paramCafe = route?.params?.cafe || null;
  const [selectedCafe, setSelectedCafe] = useState(paramCafe);
  const [error, setError] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  // Directions (interactive map)
  const [showDir, setShowDir] = useState(!!paramCafe);
  const [modeKey, setModeKey] = useState('motor');
  const [routes, setRoutes] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [locMsg, setLocMsg] = useState(null);
  const [showCoords, setShowCoords] = useState(false);

  useEffect(() => {
    loadCafes();
    getUserLocation();
  }, []);

  const loadCafes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.fetchCafes({ limit: 100 });
      // mobile_api returns { success, data: [...] }
      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.cafes)
          ? res.cafes
          : [];
      setCafes(list);
      if (!list.length && res?.success === false) {
        setError(res.message || 'Hindi ma-load ang cafes');
      }
    } catch (e) {
      setError(e.message || 'Error loading cafes');
      console.error('Cafe load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getUserLocation = async () => {
    try {
      setLocMsg(null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocMsg('Hindi pinayagan ang location permission. Gagamitin ang Orani bilang simula.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLoc({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    } catch (e) {
      console.warn('Location error:', e?.message);
      setLocMsg(`Hindi makuha ang location (${e?.message || 'unknown'}). Gagamitin ang Orani bilang simula.`);
    }
  };

  const cafesWithCoords = useMemo(
    () =>
      cafes
        .map((c) => ({ cafe: c, coords: cafeCoords(c) }))
        .filter((x) => x.coords),
    [cafes]
  );

  const origin = userLoc || { latitude: ORANI.latitude, longitude: ORANI.longitude };
  const usingFallbackOrigin = !userLoc;
  const destCoords = selectedCafe ? cafeCoords(selectedCafe) : null;
  const activeMode = MODES.find((m) => m.key === modeKey) || MODES[0];

  // Kunin ang ruta (car / bike / foot) kapag may napiling cafe at naka-on ang directions
  useEffect(() => {
    if (!showDir || !destCoords) {
      setRoutes(null);
      return undefined;
    }
    let cancelled = false;
    setRouteLoading(true);
    getRoutes(origin, destCoords)
      .then((r) => {
        if (!cancelled) setRoutes(r);
      })
      .catch((e) => {
        console.warn('Route error:', e?.message);
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDir, selectedCafe?.id, origin.latitude, origin.longitude]);

  const activeRoute = routes ? routes[activeMode.profile] : null;

  const mapView = useMemo(() => {
    if (showDir && activeRoute) {
      return {
        mode: 'route',
        key: `route-${selectedCafe?.id}-${activeMode.profile}-${activeRoute.coords.length}`,
      };
    }
    if (destCoords) {
      return {
        mode: 'point',
        key: `cafe-${selectedCafe?.id}`,
        lat: destCoords.latitude,
        lng: destCoords.longitude,
      };
    }
    return { mode: 'all', key: `all-${cafesWithCoords.length}` };
  }, [showDir, activeRoute, selectedCafe, activeMode.profile, cafesWithCoords.length]);

  const mapCafes = useMemo(
    () =>
      cafesWithCoords.map(({ cafe, coords }) => ({
        id: cafe.id,
        name: cafe.name || 'Cafe',
        lat: coords.latitude,
        lng: coords.longitude,
      })),
    [cafesWithCoords]
  );

  const focusCafe = (cafe) => {
    setSelectedCafe(cafe);
  };

  const startDirections = (cafe) => {
    setSelectedCafe(cafe);
    setShowDir(true);
  };

  const closeDirections = () => {
    setShowDir(false);
    setRoutes(null);
  };

  const onMapSelect = (id) => {
    const c = cafes.find((x) => String(x.id) === String(id));
    if (c) {
      setSelectedCafe(c);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.sand} />
        <Text style={styles.loadingText}>Loading map…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>❌ {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadCafes}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const missingCoords = cafes.length - cafesWithCoords.length;

  const renderDirectionsPanel = () => (
    <View style={styles.dirPanel}>
      <View style={styles.dirHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dirTitle} numberOfLines={1}>
            🧭 {selectedCafe?.name}
          </Text>
          <Text style={styles.dirSub} numberOfLines={1}>
            {activeMode.icon} {activeMode.label} · ~{activeMode.speedKmh} km/h
            {activeRoute ? ` · ${formatKm(activeRoute.km)} · ${formatDuration(travelHours(activeRoute.km, activeMode))}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.dirSmallBtn}
          onPress={() => navigation.navigate('CafeDetail', { cafe: selectedCafe })}
        >
          <Text style={styles.dirSmallBtnText}>Details</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={closeDirections}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {routeLoading ? (
        <View style={styles.routeLoading}>
          <ActivityIndicator color={COLORS.sage} />
          <Text style={styles.routeLoadingText}>Kinukuha ang ruta…</Text>
        </View>
      ) : routes ? (
        <View style={styles.modeRow}>
          {MODES.map((m) => {
            const r = routes[m.profile];
            const on = m.key === activeMode.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeChip, on && styles.modeChipOn]}
                onPress={() => setModeKey(m.key)}
              >
                <Text style={styles.modeIcon}>{m.icon}</Text>
                <Text style={[styles.modeTime, on && styles.modeTextOn]}>
                  {formatDuration(travelHours(r.km, m))}
                </Text>
                <Text style={[styles.modeKm, on && styles.modeTextOn]}>{formatKm(r.km)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {!destCoords && (
        <Text style={styles.warnText}>
          Walang coordinates ang cafe na ito, hindi makagawa ng ruta.
        </Text>
      )}
      {activeRoute?.estimated && (
        <Text style={styles.warnText}>
          ⚠️ Tantya lang (tuwid na linya ×1.3). Hindi naabot ang routing server.
        </Text>
      )}
      {!!locMsg && <Text style={styles.warnText}>{locMsg}</Text>}

      <View style={styles.dirFooter}>
        <TouchableOpacity onPress={() => setShowCoords((v) => !v)}>
          <Text style={styles.linkText}>{showCoords ? '▾ Itago ang coordinates' : '▸ Coordinates'}</Text>
        </TouchableOpacity>
        {usingFallbackOrigin && (
          <TouchableOpacity onPress={getUserLocation}>
            <Text style={styles.linkText}>📍 Gamitin location ko</Text>
          </TouchableOpacity>
        )}
      </View>
      {showCoords && (
        <View>
          <Text style={styles.coordLine}>
            <Text style={styles.coordLabel}>Simula </Text>
            Lat {origin.latitude.toFixed(5)} · Lng {origin.longitude.toFixed(5)}
            {usingFallbackOrigin ? ' (Orani, default)' : ' (Ikaw)'}
          </Text>
          {destCoords && (
            <Text style={styles.coordLine}>
              <Text style={styles.coordLabel}>Destinasyon </Text>
              Lat {destCoords.latitude.toFixed(5)} · Lng {destCoords.longitude.toFixed(5)}
            </Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {!showDir && (
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Interactive Map · Orani, Bataan</Text>
        <Text style={styles.legendSubtitle}>
          OpenStreetMap · {cafesWithCoords.length} cafe sa mapa
          {missingCoords > 0 ? ` · ${missingCoords} walang coordinates` : ''}
        </Text>
        <TouchableOpacity onPress={loadCafes}>
          <Text style={styles.refreshText}>↻ I-refresh ang cafes</Text>
        </TouchableOpacity>
      </View>
      )}

      <LeafletMap
        style={styles.map}
        cafes={mapCafes}
        user={userLoc ? { lat: userLoc.latitude, lng: userLoc.longitude, label: 'Ikaw' } : null}
        route={showDir && activeRoute ? activeRoute.coords : null}
        routeEstimated={!!activeRoute?.estimated}
        selectedId={selectedCafe?.id ?? null}
        view={mapView}
        onSelect={onMapSelect}
        onDeselect={() => {
          if (!showDir) setSelectedCafe(null);
        }}
        onError={(m) => setMapError(m)}
      />

      {!!mapError && (
        <View style={styles.mapErrBox}>
          <Text style={styles.mapErrText}>⚠️ {mapError}</Text>
        </View>
      )}

      {selectedCafe && !showDir && (
        <View style={styles.detailsPanel}>
          <View style={styles.detailsHeader}>
            <Text style={styles.detailsTitle} numberOfLines={1}>
              {selectedCafe.name}
            </Text>
            <TouchableOpacity onPress={() => setSelectedCafe(null)}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.detailsMeta} numberOfLines={2}>
            {[selectedCafe.barangay, selectedCafe.address].filter(Boolean).join(' · ') ||
              'Orani, Bataan'}
          </Text>
          <View style={styles.detailActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('CafeDetail', { cafe: selectedCafe })}
            >
              <Text style={styles.primaryBtnText}>View Details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.dirBtn]}
              onPress={() => startDirections(selectedCafe)}
            >
              <Text style={[styles.secondaryBtnText, { color: '#fff' }]}>🧭 Directions</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {selectedCafe && showDir ? renderDirectionsPanel() : renderBottomPanel()}
    </View>
  );

  function renderBottomPanel() {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>
          ☕ Cafes ({cafes.length}
          {cafesWithCoords.length !== cafes.length
            ? ` · ${cafesWithCoords.length} on map`
            : ''}
          )
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cafes.map((cafe) => {
            const hasPin = !!cafeCoords(cafe);
            return (
              <TouchableOpacity
                key={String(cafe.id)}
                style={[
                  styles.cafeCard,
                  selectedCafe?.id === cafe.id && styles.cafeCardActive,
                  !hasPin && styles.cafeCardNoPin,
                ]}
                onPress={() => {
                  if (hasPin) focusCafe(cafe);
                  else setSelectedCafe(cafe);
                }}
              >
                <Text style={styles.cafeCardIcon}>{hasPin ? '📍' : '☕'}</Text>
                <Text style={styles.cafeCardName} numberOfLines={2}>
                  {cafe.name}
                </Text>
                <Text style={styles.cafeCardLocation} numberOfLines={1}>
                  {cafe.barangay || 'Orani'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }
}

const createStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  center: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: { marginTop: 12, color: COLORS.muted, fontWeight: '600' },
  errorText: {
    color: COLORS.danger,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: COLORS.sage,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },
  legend: {
    backgroundColor: COLORS.espresso,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  legendTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  legendSubtitle: { color: COLORS.sageLight, fontSize: 12, marginTop: 2 },
  map: { flex: 1, minHeight: 280 },
  webMapWrap: { flex: 1, minHeight: 320, backgroundColor: COLORS.darker },
  detailsPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 130,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.darker,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailsTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  closeBtn: { fontSize: 18, color: COLORS.muted, padding: 4 },
  detailsMeta: { color: COLORS.muted, fontSize: 12, marginTop: 4, marginBottom: 10 },
  detailActions: { flexDirection: 'row', gap: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.sage,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: COLORS.sandSoft,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.sand,
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  listContainer: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.darker,
    paddingVertical: 10,
    maxHeight: 120,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  cafeCard: {
    backgroundColor: COLORS.sageSoft,
    borderRadius: 12,
    padding: 10,
    marginLeft: 12,
    width: 120,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  cafeCardActive: {
    borderColor: COLORS.sand,
    backgroundColor: COLORS.sandSoft,
  },
  cafeCardNoPin: { opacity: 0.7 },
  refreshText: { color: COLORS.sand, fontSize: 12, fontWeight: '700', marginTop: 4 },
  mapErrBox: { backgroundColor: '#FDECEA', padding: 8 },
  mapErrText: { color: COLORS.danger, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  dirBtn: { backgroundColor: '#1E6FFF', borderColor: '#1E6FFF' },
  dirPanel: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.darker,
    elevation: 8,
  },
  dirHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  dirSub: { fontSize: 12, color: '#1E6FFF', fontWeight: '700', marginTop: 2 },
  dirSmallBtn: {
    backgroundColor: COLORS.sandSoft,
    borderColor: COLORS.sand,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dirSmallBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  dirFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  coordLine: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  coordLabel: { fontWeight: '800', color: '#1E6FFF' },
  linkText: { color: '#1E6FFF', fontWeight: '700', fontSize: 12 },
  warnText: { color: COLORS.danger, fontSize: 11, marginTop: 6 },
  routeLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  routeLoadingText: { color: COLORS.muted, fontSize: 12 },
  modeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeChipOn: { backgroundColor: '#1E6FFF', borderColor: '#1E6FFF' },
  modeIcon: { fontSize: 20 },
  modeLabel: { fontSize: 10, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  modeKm: { fontSize: 12, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  modeTime: { fontSize: 11, fontWeight: '700', color: COLORS.sage, marginTop: 1 },
  modeSpeed: { fontSize: 9, color: COLORS.muted, marginTop: 1 },
  modeTextOn: { color: '#fff' },
  cafeCardIcon: { fontSize: 20, marginBottom: 4 },
  cafeCardName: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  cafeCardLocation: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
});
