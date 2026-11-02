// تلوين قناع PNG (RGBA 8-بت غير متشابك، كما تصنعه لوحة المالك): تُستبدل ألوانه بلون واحد وتبقى شفافيته.
// يُستعمل لصورة البسملة في ملف Word (في PDF يلوّنها المتصفح بقناع CSS). بلا أي اعتماديات.
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const chunk = (type, data) => {
  const t = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  out.writeUInt32BE(crc32(t), 8 + data.length);
  return out;
};

/**
 * @param {Buffer} png  صورة PNG
 * @param {string} hex  ‎#RRGGBB
 * @returns {{data: Buffer, w: number, h: number}|null}  null إن لم تكن بالصيغة المتوقعة
 */
export function tintPng(png, hex) {
  if (!Buffer.isBuffer(png) || png.length < 33 || !png.subarray(0, 8).equals(SIG)) return null;
  let o = 8;
  let w = 0, h = 0, ok = false;
  const idat = [];
  while (o + 12 <= png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('latin1', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ok = data[8] === 8 && data[9] === 6 && data[12] === 0; // 8 بت · RGBA · غير متشابك
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!ok || !w || !h || w * h > 40e6) return null;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return null;
  }
  const stride = w * 4;
  if (raw.length < (stride + 1) * h) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  const rgb = m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] : [0, 0, 0];
  const out = Buffer.alloc((stride + 1) * h);
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    const row = y * (stride + 1);
    out[row] = 0; // بلا ترشيح
    for (let x = 0; x < stride; x += 4) {
      out[row + 1 + x] = rgb[0];
      out[row + 2 + x] = rgb[1];
      out[row + 3 + x] = rgb[2];
      out[row + 4 + x] = cur[x + 3];
    }
    cur.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return { data: Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]), w, h };
}
