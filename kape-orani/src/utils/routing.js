// Routing + travel time per mode (motor, sasakyan, bike, lakad)
// Route/distance: OSM routing servers (car / bike / foot). Hindi kailangan ng API key.
// Oras: sariling computation base sa average speed ng bawat sasakyan.

export const MODES = [
  { key: 'motor', label: 'Motor', icon: '🏍️', speedKmh: 40, profile: 'car' },
  { key: 'car', label: 'Sasakyan', icon: '🚗', speedKmh: 35, profile: 'car' },
  { key: 'bike', label: 'Bike', icon: '🚴', speedKmh: 15, profile: 'bike' },
  { key: 'walk', label: 'Lakad', icon: '🚶', speedKmh: 5, profile: 'foot' },
];

const ROUTER = 'https://routing.openstreetmap.de';

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function fetchProfile(profile, from, to) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const url =
      `${ROUTER}/routed-${profile}/route/v1/driving/` +
      `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Routing server HTTP ${res.status}`);
    const json = await res.json();
    const r = json && json.routes && json.routes[0];
    if (!r) throw new Error('Walang nakitang ruta.');
    return {
      km: r.distance / 1000,
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      estimated: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Fallback kapag walang internet / down ang routing server: tuwid na linya x1.3
function fallback(from, to) {
  return {
    km: haversineKm(from, to) * 1.3,
    coords: [
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ],
    estimated: true,
  };
}

// Returns { car, bike, foot } - bawat isa ay { km, coords, estimated, error? }
export async function getRoutes(from, to) {
  const profiles = ['car', 'bike', 'foot'];
  const out = {};
  await Promise.all(
    profiles.map(async (p) => {
      try {
        out[p] = await fetchProfile(p, from, to);
      } catch (e) {
        console.warn(`[routing] ${p} failed:`, e && e.message);
        out[p] = { ...fallback(from, to), error: (e && e.message) || 'Routing error' };
      }
    })
  );
  return out;
}

export function travelHours(km, mode) {
  return km / mode.speedKmh;
}

export function formatDuration(hours) {
  const mins = Math.round(hours * 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatKm(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
