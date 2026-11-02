// «بطاقة الأسلوب»: ملف PNG يظهر في الجهاز كمربع دائري الزوايا عليه معلومات الأسلوب،
// وبداخله بيانات الأسلوب كاملة (إعدادات + إضافات) في مقطع iTXt باسم warraq-style.
// هذا الملف يعمل في المتصفح وفي Node (للاختبارات).

export const CARD_KEY = 'warraq-style';
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let TABLE = null;
function crc32(bytes) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const isPng = (u8) => u8.length > 8 && SIG.every((b, i) => u8[i] === b);

function* chunks(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 8;
  while (o + 12 <= u8.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
    if (o + 12 + len > u8.length) return;
    yield { type, start: o, dataStart: o + 8, len, end: o + 12 + len };
    o += 12 + len;
  }
}

/** يضع بيانات الأسلوب داخل صورة PNG (قبل IEND)، ويستبدل أي بيانات سابقة */
export function embedCard(png, card) {
  const u8 = png instanceof Uint8Array ? png : new Uint8Array(png);
  if (!isPng(u8)) throw new Error('ليست صورة PNG');
  const enc = new TextEncoder();
  const key = enc.encode(CARD_KEY);
  const text = enc.encode(JSON.stringify(card));
  // iTXt: keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text(UTF-8)
  const data = new Uint8Array(key.length + 5 + text.length);
  data.set(key, 0);
  data.set(text, key.length + 5);
  const typed = new Uint8Array(4 + data.length);
  typed.set(enc.encode('iTXt'), 0);
  typed.set(data, 4);
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(typed, 4);
  dv.setUint32(8 + data.length, crc32(typed));

  const keep = [];
  let iend = null;
  for (const c of chunks(u8)) {
    if (c.type === 'IEND') iend = c;
    else if (!(c.type === 'iTXt' && keywordOf(u8, c) === CARD_KEY)) keep.push(c);
  }
  if (!iend) throw new Error('صورة PNG غير مكتملة');
  const size = 8 + keep.reduce((a, c) => a + (c.end - c.start), 0) + chunk.length + (iend.end - iend.start);
  const out = new Uint8Array(size);
  out.set(u8.subarray(0, 8), 0);
  let o = 8;
  for (const c of keep) {
    out.set(u8.subarray(c.start, c.end), o);
    o += c.end - c.start;
  }
  out.set(chunk, o);
  o += chunk.length;
  out.set(u8.subarray(iend.start, iend.end), o);
  return out;
}

function keywordOf(u8, c) {
  let e = c.dataStart;
  const max = Math.min(c.dataStart + 80, c.dataStart + c.len);
  while (e < max && u8[e] !== 0) e++;
  return String.fromCharCode(...u8.subarray(c.dataStart, e));
}

/**
 * يقرأ بيانات الأسلوب من ملف: بطاقة PNG، أو ملف JSON.
 * @returns {object|null} محتوى البطاقة، أو null إن لم يكن الملف بطاقة أسلوب
 */
export function extractCard(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dec = new TextDecoder('utf-8');
  if (isPng(u8)) {
    for (const c of chunks(u8)) {
      if (c.type !== 'iTXt' || keywordOf(u8, c) !== CARD_KEY) continue;
      let o = c.dataStart + CARD_KEY.length + 1;
      const compressed = u8[o];
      o += 2;
      while (o < c.dataStart + c.len && u8[o] !== 0) o++; // language tag
      o++;
      while (o < c.dataStart + c.len && u8[o] !== 0) o++; // translated keyword
      o++;
      if (compressed) return null;
      try {
        return JSON.parse(dec.decode(u8.subarray(o, c.dataStart + c.len)));
      } catch {
        return null;
      }
    }
    return null;
  }
  // ملف JSON نصي
  try {
    const j = JSON.parse(dec.decode(u8).replace(/^﻿/, ''));
    return j && j.format === CARD_KEY ? j : null;
  } catch {
    return null;
  }
}
