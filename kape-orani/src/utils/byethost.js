// Solver para sa Byethost/iFastNet anti-bot challenge ("This site requires Javascript and Cookies").
// Ang challenge page ay may toNumbers("key"), toNumbers("iv"), toNumbers("cipher").
// Ang cookie na __test = hex(AES-128-CBC-decrypt(cipher, key, iv)). Pure JS, walang dagdag na package.

const SBOX = new Array(256);
const INV_SBOX = new Array(256);
(function init() {
  const rotl8 = (x, s) => ((x << s) | (x >> (8 - s))) & 0xff;
  let p = 1;
  let q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
})();

function xtime(a) {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}
function mul(a, b) {
  let r = 0;
  while (b) {
    if (b & 1) r ^= a;
    a = xtime(a);
    b >>= 1;
  }
  return r;
}

function expandKey(key) {
  const w = [];
  for (let i = 0; i < 4; i++) w.push([key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]);
  let rcon = 1;
  for (let i = 4; i < 44; i++) {
    let t = w[i - 1].slice();
    if (i % 4 === 0) {
      t = [SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]];
      rcon = xtime(rcon);
    }
    w.push(w[i - 4].map((v, j) => v ^ t[j]));
  }
  return w;
}

function decryptBlock(block, w) {
  const s = block.slice();
  const addRoundKey = (r) => {
    for (let c = 0; c < 4; c++) for (let j = 0; j < 4; j++) s[c * 4 + j] ^= w[r * 4 + c][j];
  };
  const invShiftRows = () => {
    const o = s.slice();
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[c * 4 + r] = o[((c - r + 4) % 4) * 4 + r];
  };
  const invSubBytes = () => {
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
  };
  const invMixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const a = s.slice(c * 4, c * 4 + 4);
      s[c * 4] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9);
      s[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13);
      s[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11);
      s[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14);
    }
  };
  addRoundKey(10);
  for (let r = 9; r >= 1; r--) {
    invShiftRows();
    invSubBytes();
    addRoundKey(r);
    invMixColumns();
  }
  invShiftRows();
  invSubBytes();
  addRoundKey(0);
  return s;
}

const hexToBytes = (h) => (h.match(/../g) || []).map((x) => parseInt(x, 16));
const bytesToHex = (b) => b.map((x) => ('0' + x.toString(16)).slice(-2)).join('');

export function aesCbcDecryptHex(cipherHex, keyHex, ivHex) {
  const c = hexToBytes(cipherHex);
  const w = expandKey(hexToBytes(keyHex));
  let prev = hexToBytes(ivHex);
  const out = [];
  for (let i = 0; i < c.length; i += 16) {
    const blk = c.slice(i, i + 16);
    const d = decryptBlock(blk, w);
    for (let j = 0; j < 16; j++) out.push(d[j] ^ prev[j]);
    prev = blk;
  }
  return bytesToHex(out);
}

/** Kung challenge page ang `html`, ibalik ang cookie value ng __test; kung hindi, null. */
export function solveByethostChallenge(html) {
  if (!html || !/toNumbers\(/.test(html)) return null;
  const m = [...html.matchAll(/toNumbers\("([0-9a-fA-F]+)"\)/g)].map((x) => x[1]);
  if (m.length < 3) return null;
  const [key, iv, cipher] = m;
  return aesCbcDecryptHex(cipher, key, iv);
}
