import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { ENDPOINTS, BYETHOST_TEST_COOKIE } from '../constants/config';
import { solveByethostChallenge } from '../utils/byethost';
import { bridgeFetch, bridgeSupported } from '../utils/byethostBridge';

// Cookie na nakuha mula sa Byethost challenge (awtomatiko), o galing sa config kung nilagay mo.
let byethostCookie = BYETHOST_TEST_COOKIE || '';
const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';


const TOKEN_KEY = '@kapeorani_token';

// Byethost/iFastNet ay may anti-bot na JavaScript check ("This site requires Javascript...").
// Ang `i=1` sa URL ay nagbi-bypass nito para sa API calls ng app.
function apiUrl(params = {}) {
  // Dapat NASA DULO ang i=1 (Byethost requirement)
  const qs = new URLSearchParams(params).toString();
  return `${ENDPOINTS.mobile}?${qs ? qs + '&' : ''}i=1`;
}

export async function getToken() {
  try {
    return (await AsyncStorage.getItem(TOKEN_KEY)) || '';
  } catch {
    return '';
  }
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}


// Minsan nagdadagdag ang free hosting ng HTML/comment sa paligid ng JSON. Kunin lang ang JSON part.
function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const t = String(text || '');
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      const cand = t.slice(a, b + 1);
      if (!/requires Javascript|slowAES|toNumbers\(/i.test(t.slice(0, a))) return JSON.parse(cand);
    }
    throw e;
  }
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const token = options.skipAuth ? '' : await getToken();

  try {
    const headers = {
      Accept: 'application/json',
      ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    if (token) headers['X-Mobile-Token'] = token;
    // Native (Android/iOS/Appetize) lang: bawal i-set ang Cookie header sa browser/web.
    if (Platform.OS !== 'web') {
      if (byethostCookie) headers.Cookie = `__test=${byethostCookie}`;
      if (!options._noUA) headers['User-Agent'] = BROWSER_UA;
    }

    console.log('[API]', options.method || 'GET', url);
    const { _retried, _noUA, _trail, _plain, _noBridge, skipAuth, ...fetchOptions } = options;
    // Native: dumaan muna sa hidden WebView bridge (tunay na browser = nakakalusot sa Byethost
    // anti-bot). Kung hindi available ang bridge, babalik sa dating fetch + cookie solver.
    let res = null;
    if (Platform.OS !== 'web' && bridgeSupported() && !options._noBridge) {
      try {
        const b = await bridgeFetch(url, {
          method: fetchOptions.method || 'GET',
          headers,
          body: fetchOptions.body,
        });
        res = { status: b.status, ok: b.ok, text: async () => b.text };
      } catch (bridgeErr) {
        console.warn('[API] bridge failed, fallback to fetch:', bridgeErr && bridgeErr.message);
        res = null;
      }
    }
    if (!res) {
      res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers,
      });
    }

    const text = await res.text();
    let data;
    try {
      data = parseJsonLoose(text);
    } catch {
      console.error('[API] Non-JSON response', res.status, text.slice(0, 200));
      const trail = [...(options._trail || []), `${options._plain ? 'C' : options._retried ? 'B(cookie)' : 'A'}:${res.status}${/toNumbers\(/.test(text) ? ':challenge' : ''}`];
      if (/requires Javascript|__test|aes\.js|slowAES/i.test(text)) {
        // Awtomatikong i-solve ang challenge at ulitin ang request nang isang beses.
        if (!options._retried && Platform.OS !== 'web') {
          const solved = solveByethostChallenge(text);
          if (solved) {
            byethostCookie = solved;
            clearTimeout(timeout);
            return request(url, { ...options, _retried: true, _noBridge: true, _trail: trail });
          }
        }
        throw new Error(
          `[${trail.join(' > ')}] Hinarang ng hosting (Byethost anti-bot check) ang request. Sagot: ${text.slice(0, 160).replace(/\s+/g, ' ')}`
        );
      }
      // Kung 400 pagkatapos magpadala ng cookie, subukan ulit nang WALANG cookie at WALANG custom UA.
      if (res.status === 400 && byethostCookie && !options._plain) {
        byethostCookie = '';
        return request(url, { ...options, _retried: true, _noUA: true, _plain: true, _noBridge: true, _trail: trail });
      }
      throw new Error(
        `[${trail.join(' > ')}] Hindi JSON ang sagot (HTTP ${res.status}) mula sa ${url.replace(ENDPOINTS.mobile, '…/mobile_api.php')} [cookie: ${byethostCookie ? 'oo' : 'wala'}]. Sagot: ${text.slice(0, 300).replace(/\s+/g, ' ')}`
      );
    }
    if (!res.ok && data?.message) {
      const err = new Error(data.message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (e) {
    console.error('[API] request error:', e && e.name, e && e.message);
    if (e.name === 'AbortError') throw new Error('Timeout — hindi umabot sa server.');
    if (
      e.message?.includes('Network request failed') ||
      e.message?.includes('Failed to fetch')
    ) {
      throw new Error(
        'Walang connection sa server. Tama ba ang API_BASE_URL? May internet ka ba?'
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

function mobile(action, body = {}, method = 'POST') {
  if (method === 'GET') {
    const qs = { action, ...Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v)])
    )};
    return request(apiUrl(qs), { method: 'GET' });
  }
  return request(apiUrl(), {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
  });
}

export async function login(username, password) {
  const res = await mobile('login', { username, password });
  if (res.token) await setToken(res.token);
  return res;
}

export async function register(data) {
  const res = await mobile('register', data);
  if (res.token) await setToken(res.token);
  return res;
}

export async function forgotPassword(data) {
  return mobile('forgot', data);
}

export async function logout() {
  // Clear token first so local session is gone even if server is unreachable
  const token = await getToken();
  await setToken('');
  try {
    const res = await mobile('logout', token ? { token } : {});
    console.log('✅ Logout response:', res);
  } catch (e) {
    console.warn('⚠️ Logout call failed (but continuing):', e.message);
  }
}

export async function fetchMe() {
  return mobile('me', {}, 'GET');
}

/** Public: maintenance mode from web site_settings.json */
export async function fetchSiteStatus() {
  return request(apiUrl({ action: 'site_status' }), { method: 'GET', skipAuth: true });
}

export async function fetchCafes(params = {}) {
  // ✅ FIXED: Removed fallback to non-existent ENDPOINTS.search
  const qs = { action: 'cafes', limit: String(params.limit || 100) };
  if (params.q) qs.q = params.q;
  if (params.barangay) qs.barangay = params.barangay;
  if (params.category) qs.category = params.category;
  if (params.lat != null) qs.lat = String(params.lat);
  if (params.lng != null) qs.lng = String(params.lng);
  
  return request(apiUrl(qs), { method: 'GET', skipAuth: true });
}

export async function fetchReviews() {
  return mobile('reviews_public', {}, 'GET');
}

export async function myReviews() {
  return mobile('my_reviews', { _t: Date.now() }, 'GET');
}

export async function submitReview(payload) {
  return mobile('review_submit', payload);
}

export async function fetchPromos() {
  return mobile('promos_public', {}, 'GET');
}

export async function submitClaim(payload) {
  return mobile('claim_submit', payload);
}

export async function createReservation(payload) {
  return mobile('reservation_submit', payload);
}

export async function fetchReservationSettings(cafeId) {
  return request(
    apiUrl({ action: 'reservation_settings', cafe_id: String(cafeId) }),
    { method: 'GET', skipAuth: true }
  );
}

export async function myReservations() {
  // _t = cache-buster para laging fresh (hindi galing sa lumang cache) kapag dinelete ng owner
  return mobile('my_reservations', { _t: Date.now() }, 'GET');
}

export async function chatThreads() {
  return mobile('chat_threads', {}, 'GET');
}

export async function chatMessages(cafeId) {
  return request(apiUrl({ action: 'chat_messages', cafe_id: String(cafeId) }), { method: 'GET' });
}

export async function chatSend(cafeId, message) {
  return mobile('chat_send', { cafe_id: cafeId, message });
}

export async function chatDeleteThread(cafeId) {
  return mobile('chat_delete_thread', { cafe_id: cafeId });
}

export async function updateProfile(payload) {
  return mobile('profile_update', payload);
}
