// src/utils/byethostBridge.js
//
// Byethost (iFastNet) ay may anti-bot na JavaScript check (aes.js + "__test" cookie).
// Hindi ito nalulusutan ng normal na fetch() ng React Native, kaya gagamit tayo ng
// HIDDEN WebView: tunay na browser, kaya kusa nitong na-so-solve ang challenge at
// natatandaan ang cookie. Ang mga API call ay tatakbo SA LOOB ng WebView (same-origin)
// at ibabalik ang sagot sa app.
//
// Gamit:
//   <ByethostBridge />   → nasa App.js (isang beses lang)
//   bridgeFetch(url, { method, headers, body }) → { status, ok, text }

import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { API_BASE_URL } from '../constants/config';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    WebView = null;
  }
}

const WARMUP_URL = `${API_BASE_URL}/mobile_api.php?action=site_status&i=1`;
const READY_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_MS = 30000;
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Mga header na bawal i-set sa loob ng browser
const FORBIDDEN_HEADERS = ['cookie', 'user-agent', 'host', 'origin', 'referer', 'content-length'];

// --- shared state (isang bridge lang sa buong app) ---
let webRef = null; // ref ng WebView
let ready = false;
let readyWaiters = [];
let seq = 0;
const pending = new Map();
let httpsUpgradeTried = false;

function unavailable(msg) {
  const e = new Error(msg);
  e.bridgeUnavailable = true;
  return e;
}

function markReady() {
  ready = true;
  const w = readyWaiters;
  readyWaiters = [];
  w.forEach((r) => r.resolve());
}

function waitUntilReady() {
  if (ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    readyWaiters.push(waiter);
    setTimeout(() => {
      const i = readyWaiters.indexOf(waiter);
      if (i >= 0) {
        readyWaiters.splice(i, 1);
        reject(unavailable('Hindi pa handa ang bridge (hindi natapos ang Byethost check).'));
      }
    }, READY_TIMEOUT_MS);
  });
}

export function bridgeSupported() {
  return Platform.OS !== 'web' && !!WebView;
}

export async function bridgeFetch(url, options = {}) {
  if (!bridgeSupported()) throw unavailable('Walang WebView.');
  await waitUntilReady();
  if (!webRef) throw unavailable('Walang aktibong WebView.');

  const id = ++seq;
  const headers = {};
  Object.entries(options.headers || {}).forEach(([k, v]) => {
    if (v != null && !FORBIDDEN_HEADERS.includes(String(k).toLowerCase())) headers[k] = String(v);
  });

  const payload = {
    id,
    url,
    method: options.method || 'GET',
    headers,
    body: options.body == null ? null : String(options.body),
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(unavailable('Timeout sa bridge.'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });

    // Same-origin ang fetch: ginagamit ang location.origin ng WebView (http o https man)
    const js = `
      (function () {
        var P = ${JSON.stringify(payload)};
        function send(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
        try {
          var u = new URL(P.url);
          var full = location.origin + u.pathname + u.search;
          var init = { method: P.method, headers: P.headers, credentials: 'same-origin', cache: 'no-store' };
          if (P.body !== null && P.method !== 'GET') init.body = P.body;
          fetch(full, init).then(function (r) {
            return r.text().then(function (t) {
              send({ id: P.id, status: r.status, ok: r.ok, text: t });
            });
          }).catch(function (e) {
            send({ id: P.id, error: String(e && e.message ? e.message : e) });
          });
        } catch (e) {
          send({ id: P.id, error: String(e && e.message ? e.message : e) });
        }
      })();
      true;
    `;
    webRef.injectJavaScript(js);
  });
}

// Tatakbo pagkatapos ng bawat page load sa WebView. Kapag JSON/same-origin page na
// (wala nang challenge), sasabihin sa app na "ready" na.
const INJECTED_ON_LOAD = `
  (function () {
    try {
      var isChallenge = (typeof window.toNumbers === 'function') || (typeof window.slowAES !== 'undefined');
      var html = (document.documentElement && document.documentElement.innerHTML) || '';
      if (!isChallenge && !/requires Javascript|slowAES|toNumbers\\(/i.test(html)) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', origin: location.origin }));
      }
    } catch (e) {}
  })();
  true;
`;

export default function ByethostBridge() {
  const ref = useRef(null);

  useEffect(() => {
    return () => {
      webRef = null;
      ready = false;
    };
  }, []);

  const setRef = useCallback((r) => {
    ref.current = r;
    webRef = r;
  }, []);

  const onMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!msg) return;

    if (msg.type === 'ready') {
      // Ang challenge ng Byethost ay nagre-redirect sa http://. Subukan nating ilipat sa
      // https nang isang beses (nakaset na ang cookie, host-wide ito).
      if (
        !httpsUpgradeTried &&
        /^http:\/\//i.test(msg.origin || '') &&
        /^https:\/\//i.test(API_BASE_URL) &&
        webRef
      ) {
        httpsUpgradeTried = true;
        webRef.injectJavaScript(`location.replace(${JSON.stringify(WARMUP_URL)}); true;`);
        // Kung hindi gumana ang https, ready pa rin naman ang http page.
        setTimeout(() => {
          if (!ready) markReady();
        }, 6000);
        return;
      }
      markReady();
      return;
    }

    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) {
        p.reject(unavailable(msg.error));
      } else {
        p.resolve({ status: msg.status, ok: msg.ok, text: msg.text });
      }
    }
  }, []);

  if (!WebView) return null;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0.01 }}
    >
      <WebView
        ref={setRef}
        source={{ uri: WARMUP_URL }}
        userAgent={CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        injectedJavaScript={INJECTED_ON_LOAD}
        onMessage={onMessage}
        onError={() => {}}
        onHttpError={() => {}}
        onShouldStartLoadWithRequest={() => true}
      />
    </View>
  );
}
