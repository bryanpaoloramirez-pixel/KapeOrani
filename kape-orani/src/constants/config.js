// src/constants/config.js

import { Platform } from 'react-native';

// ✅ LIVE server (Byethost). Dito na kumukuha ng data ang app (MySQL ng website).
// Dapat nasa ROOT ng htdocs ang mobile_api.php (katabi ng db.php).
// Kung nasa subfolder (hal. htdocs/KapeOrani/), idagdag: '/KapeOrani'
// Walang trailing slash.
const LIVE_API_BASE_URL = 'https://kapeoraniapp.byethost5.com';

// Kung gusto mong bumalik sa local XAMPP para sa testing, gawing false ito.
const USE_LIVE_SERVER = true;

let API_BASE_URL;

if (USE_LIVE_SERVER) {
  API_BASE_URL = LIVE_API_BASE_URL;
} else if (Platform.OS === 'web') {
  API_BASE_URL = 'http://localhost/KapeOrani';  // Browser (XAMPP)
} else {
  API_BASE_URL = 'http://192.168.100.67/KapeOrani';  // Phone/Emulator (XAMPP)
}

export { API_BASE_URL };

// Byethost anti-bot cookie. Kunin sa Chrome: buksan ang https://kapeoraniapp.byethost5.com
// → F12 → Application → Cookies → kopyahin ang VALUE ng "__test" at i-paste dito.
// Halimbawa: '1f2e3d4c5b6a79880011223344556677'. Iwanang '' kung hindi kailangan.
export const BYETHOST_TEST_COOKIE = '';

export const ENDPOINTS = {
  mobile: `${API_BASE_URL}/mobile_api.php`,
};

export const COLORS = {
  espresso: '#1C1A17',
  charcoal: '#2A2723',
  muted: '#3E3A35',
  cream: '#FAFAF7',
  surface: '#F3F3ED',
  darker: '#E8E8DF',
  sage: '#4A5D4E',
  sageLight: '#6E8573',
  sageSoft: '#EAF0EC',
  sand: '#D8A268',
  sandSoft: '#F4E8D8',
  white: '#FFFFFF',
  danger: '#C0392B',
  success: '#27AE60',
  waze: '#33AADD',
  text: '#1C1A17',
  card: '#FAFAF7',
};

export const LIGHT_COLORS = { ...COLORS, header: COLORS.sage };

export const DARK_COLORS = {
  espresso: '#1C1A17',
  charcoal: '#2A2723',
  muted: '#B5AFA3',
  cream: '#FAFAF7',
  surface: '#12100E',
  darker: '#34302A',
  sage: '#5E7A64',
  sageLight: '#8FB096',
  sageSoft: '#232D26',
  sand: '#D8A268',
  sandSoft: '#3A2E20',
  white: '#1E1B18',
  danger: '#E5604F',
  success: '#2ECC71',
  waze: '#33AADD',
  text: '#F2EEE6',
  card: '#1E1B18',
  header: '#000000',
};

export const SECURITY_QUESTIONS = [
  'Ano ang pangalan ng unang alaga mo?',
  'Ano ang pangalan ng elementary school mo?',
  'Ano ang paborito mong pagkain?',
  'Saan ka isinilang (lungsod)?',
  'Ano ang middle name ng ina mo?',
];