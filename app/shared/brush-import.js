// قراءة ملفات فُرَش الرسم: يُستخرج من كل ملفٍ «أشكال الفرشاة» (أقنعةٌ رمادية: ٢٥٥ حبرٌ كامل، ٠ لا شيء)
// مع اسم كل فرشاة والمسافة بين طبعاتها. ثم يُطبع الشكل على طول الخط بلون القلم (في الرَّحل).
//
// الصيغ: فوتوشوب ‎.abr‎ (الإصدارات ١ و٢ و٦–١٠: العيّنات والمحسوبة)، GIMP ‏‎.gbr .gih .vbr‎، Krita ‏‎.kpp .bundle‎،
// Procreate ‏‎.brush .brushset‎، MyPaint ‏‎.myb‎، وملفات ZIP التي فيها شيءٌ من ذلك، والصور (PNG وJPEG وWebP وSVG…)،
// وأي ملفٍ آخر تُلتقط منه صور PNG المضمّنة فيه. (قراءة صيغ الملفات للتشغيل البيني مباحة؛ أما الفرشاة نفسها فلصاحبها ورخصتها)
//
// يعمل في المتصفح وفي Node: env = { inflateRaw(bytes)→Uint8Array, inflate(bytes)→Uint8Array, decodeImage?(bytes, mime)→{w,h,data:RGBA} }

const MAX_TIP = 384; // أكبر طولٍ لشكل الفرشاة (يُصغَّر ما فوقه)
const MAX_TIPS = 400;
const td = (enc) => new TextDecoder(enc);
const latin = (b, a = 0, z = b.length) => {
  let s = '';
  for (let i = a; i < z; i++) s += String.fromCharCode(b[i]);
  return s;
};
const ext = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
const bare = (name) => String(name || '').replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');

/* ================================================================ قراءة البايتات */
class R {
  constructor(b, pos = 0) {
    this.b = b;
    this.p = pos;
    this.v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  get left() {
    return this.b.length - this.p;
  }
  u8() {
    return this.b[this.p++];
  }
  u16() {
    const x = this.v.getUint16(this.p);
    this.p += 2;
    return x;
  }
  i16() {
    const x = this.v.getInt16(this.p);
    this.p += 2;
    return x;
  }
  u32() {
    const x = this.v.getUint32(this.p);
    this.p += 4;
    return x;
  }
  i32() {
    const x = this.v.getInt32(this.p);
    this.p += 4;
    return x;
  }
  f64() {
    const x = this.v.getFloat64(this.p);
    this.p += 8;
    return x;
  }
  bytes(n) {
    const x = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return x;
  }
  str(n) {
    return latin(this.bytes(n));
  }
  /** نصٌّ يونيكود (طوله بعدد المحارف ١٦ بت) */
  ustr() {
    const n = this.u32();
    if (n > 100000) throw new Error('ustr');
    const x = this.bytes(n * 2);
    let s = '';
    for (let i = 0; i + 1 < x.length; i += 2) s += String.fromCharCode((x[i] << 8) | x[i + 1]);
    return s.replace(/\0+$/, '');
  }
}

/* ================================================================ تطبيع الشكل */
/** قناعٌ من صورة RGBA: الشفافية إن كانت، وإلا الداكن على الفاتح حبر (والفاتح على الداكن حبرٌ إن كانت الحاشية داكنة) */
export function maskFromRGBA(w, h, d) {
  const n = w * h;
  const m = new Uint8Array(n);
  let transp = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 245) transp++;
  if (transp > n * 0.02) {
    for (let i = 0; i < n; i++) m[i] = d[i * 4 + 3];
    // (شكلٌ أبيض على شفاف أو أسود على شفاف: كلاهما الشفافية)
    return m;
  }
  // الحاشية: داكنة ← الأبيض حبر (Procreate)، وإلا الأسود حبر (فوتوشوب، والصور)
  let edge = 0;
  let k = 0;
  const lum = (i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  for (let x = 0; x < w; x++) (edge += lum(x) + lum((h - 1) * w + x)), (k += 2);
  for (let y = 0; y < h; y++) (edge += lum(y * w) + lum(y * w + w - 1)), (k += 2);
  const darkBg = edge / k < 110;
  for (let i = 0; i < n; i++) m[i] = darkBg ? Math.round(lum(i)) : 255 - Math.round(lum(i));
  return m;
}
/** قصّ الفراغ حول الشكل، وتصغير الكبير، ورفض الفارغ */
export function normalizeTip(t) {
  let { w, h, mask } = t;
  if (!w || !h || !mask || mask.length < w * h) return null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, sum = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = mask[y * w + x];
      if (v > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        sum += v;
      }
    }
  if (x1 < 0 || sum < 255 * 2) return null;
  // هامشٌ صغير حول الشكل
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(w - 1, x1 + 1);
  y1 = Math.min(h - 1, y1 + 1);
  let cw = x1 - x0 + 1;
  let ch = y1 - y0 + 1;
  let m = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) m.set(mask.subarray((y + y0) * w + x0, (y + y0) * w + x0 + cw), y * cw);
  // تصغيرٌ بمتوسط المربعات
  const big = Math.max(cw, ch);
  if (big > MAX_TIP) {
    const k = big / MAX_TIP;
    const nw = Math.max(1, Math.round(cw / k));
    const nh = Math.max(1, Math.round(ch / k));
    const out = new Uint8Array(nw * nh);
    for (let y = 0; y < nh; y++)
      for (let x = 0; x < nw; x++) {
        const sx0 = Math.floor(x * k), sx1 = Math.min(cw, Math.ceil((x + 1) * k));
        const sy0 = Math.floor(y * k), sy1 = Math.min(ch, Math.ceil((y + 1) * k));
        let s = 0, c = 0;
        for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) (s += m[yy * cw + xx]), c++;
        out[y * nw + x] = c ? Math.round(s / c) : 0;
      }
    m = out;
    cw = nw;
    ch = nh;
  }
  const sp = Number.isFinite(+t.spacing) && +t.spacing > 0 ? Math.min(5, Math.max(0.01, +t.spacing)) : 0.25;
  return { name: String(t.name || '').trim().slice(0, 80), w: cw, h: ch, mask: m, spacing: Math.round(sp * 1000) / 1000, ...(Number.isFinite(+t.angle) && +t.angle ? { angle: Math.round(+t.angle) } : {}) };
}
/** شكلٌ محسوب: دائرة أو مربع أو معيّن، بصلابته ونسبته وزاويته (ومساميره) */
export function genTip({ shape = 'circle', size = 96, hardness = 1, aspect = 1, angle = 0, spikes = 2, name = '', spacing = 0.15 } = {}) {
  size = Math.max(4, Math.min(256, Math.round(size)));
  const n = size;
  const m = new Uint8Array(n * n);
  const r = n / 2;
  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  const hard = Math.max(0, Math.min(1, hardness));
  const asp = Math.max(0.05, Math.min(1, aspect));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let dx = (x + 0.5 - r) / r;
      let dy = (y + 0.5 - r) / r;
      const rx = dx * ca + dy * sa;
      const ry = (-dx * sa + dy * ca) / asp;
      let d;
      if (shape === 'square') d = Math.max(Math.abs(rx), Math.abs(ry));
      else if (shape === 'diamond') d = Math.abs(rx) + Math.abs(ry);
      else d = Math.hypot(rx, ry);
      if (spikes > 2 && shape !== 'circle') {
        const th = Math.atan2(ry, rx);
        d *= 1 + 0.35 * Math.cos(spikes * th);
      }
      let v;
      if (d >= 1) v = 0;
      else if (d <= hard) v = 1;
      else v = 1 - (d - hard) / (1 - hard || 1);
      // حافةٌ ناعمة قليلاً حتى للصلب
      m[y * n + x] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
  return { name, w: n, h: n, mask: m, spacing };
}

/* ================================================================ فوتوشوب ‎.abr‎ */
function unpackBits(r, outLen) {
  const out = new Uint8Array(outLen);
  let o = 0;
  while (o < outLen && r.left > 0) {
    let n = r.u8();
    if (n > 127) n -= 256;
    if (n >= 0) {
      const c = Math.min(n + 1, outLen - o, r.left);
      out.set(r.bytes(c), o);
      o += c;
    } else if (n !== -128) {
      const v = r.u8();
      const c = Math.min(1 - n, outLen - o);
      out.fill(v, o, o + c);
      o += c;
    }
  }
  return out;
}
/** صورة العيّنة: خام أو مضغوطة (PackBits لكل سطر)، بعمق ٨ أو ١٦ بت */
function abrImage(r, w, h, depth, comp) {
  const bpp = depth === 16 ? 2 : 1;
  let raw;
  if (!comp) raw = r.bytes(w * h * bpp);
  else {
    const counts = [];
    for (let y = 0; y < h; y++) counts.push(r.u16());
    const parts = new Uint8Array(w * h * bpp);
    for (let y = 0; y < h; y++) {
      const sub = new R(r.bytes(counts[y]));
      parts.set(unpackBits(sub, w * bpp), y * w * bpp);
    }
    raw = parts;
  }
  if (bpp === 1) return raw.slice();
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = raw[i * 2];
  return m;
}
const okBounds = (t, l, b, rr) => b > t && rr > l && b - t <= 6000 && rr - l <= 6000 && t >= -10 && l >= -10;
function abrV12(r, version) {
  const count = r.u16();
  const tips = [];
  for (let k = 0; k < count && r.left > 6; k++) {
    const type = r.u16();
    const size = r.u32();
    const end = r.p + size;
    try {
      if (type === 1) {
        // محسوبة: (٤ بايتات) ثم المسافة والقطر والاستدارة والزاوية والصلابة
        r.u32();
        const spacing = r.u16();
        const dia = r.u16();
        const round = r.u16();
        const ang = r.i16();
        const hard = r.u16();
        tips.push(genTip({ size: Math.min(256, Math.max(8, dia)), hardness: hard / 100, aspect: round / 100, angle: ang, spacing: spacing / 100, name: '' }));
      } else if (type === 2) {
        r.u32();
        const spacing = r.u16();
        let name = '';
        if (version === 2) name = r.ustr();
        r.u8(); // antialias
        r.bytes(8); // الحدود القصيرة
        const t = r.i32(), l = r.i32(), b = r.i32(), rr = r.i32();
        const depth = r.u16();
        const comp = r.u8();
        if (okBounds(t, l, b, rr)) {
          const w = rr - l, h = b - t;
          tips.push({ name: name || '', w, h, mask: abrImage(r, w, h, depth, comp), spacing: spacing / 100 });
        }
      }
    } catch {}
    r.p = end;
  }
  return tips;
}
/** العيّنات (8BIMsamp) في الإصدار ٦ فما بعده: لكل عيّنةٍ مفتاحها وصورتها */
function abrSamples(b, start, len, sub) {
  const out = [];
  const r = new R(b, start);
  const stop = start + len;
  while (r.p + 4 < stop) {
    const size = r.u32();
    let blen = size;
    while (blen % 4) blen++;
    const bstart = r.p;
    const next = bstart + blen;
    if (!size || next > stop + 4) break;
    try {
      const keyLen = b[bstart];
      const key = latin(b, bstart + 1, bstart + 1 + keyLen);
      // موضع الحدود: ما يعرفه GIMP (٤٧ أو ٣٠١ بايتاً بعد بداية العيّنة)، وإلا يُبحث عنه
      const tryAt = (p) => {
        if (p + 19 > bstart + size) return null;
        const q = new R(b, p);
        const t = q.i32(), l = q.i32(), bt = q.i32(), rr = q.i32();
        const depth = q.u16();
        const comp = q.u8();
        if (!okBounds(t, l, bt, rr) || (depth !== 8 && depth !== 16) || comp > 1) return null;
        const w = rr - l, h = bt - t;
        const need = comp ? h * 2 : w * h * (depth / 8);
        if (q.p + need > bstart + size + 4) return null;
        return { q, w, h, depth, comp };
      };
      let hit = tryAt(bstart + (sub === 1 ? 47 : 301));
      for (let p = bstart + 1 + keyLen; !hit && p < Math.min(bstart + size - 19, bstart + 1200); p++) hit = tryAt(p);
      if (hit) out.push({ key, w: hit.w, h: hit.h, mask: abrImage(hit.q, hit.w, hit.h, hit.depth, hit.comp) });
    } catch {}
    r.p = next;
  }
  return out;
}
/* ---- واصف فوتوشوب (Action Descriptor): أسماء الفُرَش ومسافاتها وزواياها ---- */
function descId(r) {
  const n = r.u32();
  return n === 0 ? r.str(4) : r.str(n);
}
function descValue(r, type, depth) {
  if (depth > 40) throw new Error('deep');
  switch (type) {
    case 'obj ':
    case 'Objc':
    case 'GlbO':
      return descriptor(r, depth + 1);
    case 'VlLs': {
      const n = r.u32();
      const arr = [];
      for (let i = 0; i < n; i++) arr.push(descValue(r, r.str(4), depth + 1));
      return arr;
    }
    case 'doub':
      return r.f64();
    case 'UntF':
      r.str(4);
      return r.f64();
    case 'UnFl': {
      r.str(4);
      const n = r.u32();
      const a = [];
      for (let i = 0; i < n; i++) a.push(r.f64());
      return a;
    }
    case 'TEXT':
      return r.ustr();
    case 'enum':
      descId(r);
      return descId(r);
    case 'long':
      return r.i32();
    case 'comp':
      r.u32();
      return r.u32();
    case 'bool':
      return !!r.u8();
    case 'type':
    case 'GlbC':
      r.ustr();
      return descId(r);
    case 'alis':
    case 'tdta': {
      const n = r.u32();
      r.p += n;
      return null;
    }
    case 'ObAr': {
      // مصفوفة كائنات: نسخةٌ ثم واصف
      r.u32();
      return descriptor(r, depth + 1);
    }
    case 'Pth ': {
      const n = r.u32();
      r.p += n;
      return null;
    }
    case 'obj': // (لا يقع)
    default:
      throw new Error('desc type ' + type);
  }
}
function descriptor(r, depth = 0) {
  const o = { _name: r.ustr(), _class: descId(r) };
  const n = r.u32();
  if (n > 10000) throw new Error('desc count');
  for (let i = 0; i < n; i++) {
    const key = descId(r);
    const type = r.str(4);
    o[key] = descValue(r, type, depth);
  }
  return o;
}
function abrPresets(b, start, len) {
  try {
    const r = new R(b, start);
    r.u32(); // الإصدار (١٦)
    const d = descriptor(r);
    const list = Array.isArray(d.Brsh) ? d.Brsh : [];
    return list.map((p) => {
      const br = (p && p.Brsh) || {};
      return {
        name: (p && p['Nm  ']) || '',
        uuid: br.sampledData || '',
        spacing: Number.isFinite(br.Spcn) ? br.Spcn / 100 : undefined,
        angle: Number.isFinite(br.Angl) ? br.Angl : undefined,
        round: Number.isFinite(br.Rndn) ? br.Rndn / 100 : undefined,
        dia: Number.isFinite(br.Dmtr) ? br.Dmtr : undefined,
        hard: Number.isFinite(br.Hrdn) ? br.Hrdn / 100 : undefined,
        computed: br._class === 'computedBrush' || (!br.sampledData && Number.isFinite(br.Dmtr)),
      };
    });
  } catch {
    return [];
  }
}
function readAbr(b) {
  const r = new R(b);
  const version = r.u16();
  if (version === 1 || version === 2) return { format: `فوتوشوب ABR (الإصدار ${version})`, tips: abrV12(r, version) };
  if (version < 6 || version > 12) throw new Error('ليس ملف ABR معروفاً');
  const sub = r.u16();
  // الأقسام: 8BIM + المفتاح + الطول
  const sections = {};
  let p = 4;
  while (p + 12 <= b.length) {
    if (latin(b, p, p + 4) !== '8BIM') break;
    const key = latin(b, p + 4, p + 8);
    const len = new DataView(b.buffer, b.byteOffset + p + 8, 4).getUint32(0);
    sections[key] = { start: p + 12, len };
    p += 12 + len;
    while (p % 4 && p < b.length && latin(b, p, p + 4) !== '8BIM') p++;
  }
  // (ملفات لا تتبع الترتيب: يُبحث عن القسمين بالاسم)
  for (const key of ['samp', 'desc']) {
    if (sections[key]) continue;
    const s = latin(b, 0, Math.min(b.length, 64 * 1024 * 1024));
    const i = s.indexOf('8BIM' + key);
    if (i >= 0) sections[key] = { start: i + 12, len: new DataView(b.buffer, b.byteOffset + i + 8, 4).getUint32(0) };
  }
  const samples = sections.samp ? abrSamples(b, sections.samp.start, sections.samp.len, sub) : [];
  const presets = sections.desc ? abrPresets(b, sections.desc.start, sections.desc.len) : [];
  const bare$ = (k) => String(k || '').replace(/^\$/, '');
  const byKey = new Map(samples.map((s) => [bare$(s.key), s]));
  const used = new Set();
  const tips = [];
  for (const pr of presets) {
    if (pr.uuid && byKey.has(bare$(pr.uuid))) {
      const s = byKey.get(bare$(pr.uuid));
      used.add(s);
      tips.push({ name: pr.name, w: s.w, h: s.h, mask: s.mask, spacing: pr.spacing, angle: pr.angle });
    } else if (pr.computed && pr.dia) tips.push(genTip({ size: Math.min(256, Math.max(8, pr.dia)), hardness: pr.hard ?? 1, aspect: pr.round ?? 1, angle: pr.angle || 0, spacing: pr.spacing ?? 0.25, name: pr.name }));
  }
  // عيّناتٌ لا واصف لها (أو تعذّر قراءته): بأسمائها المرقّمة
  for (const s of samples) if (!used.has(s)) tips.push({ name: '', w: s.w, h: s.h, mask: s.mask, spacing: 0.25 });
  return { format: `فوتوشوب ABR (الإصدار ${version}.${sub})`, tips };
}

/* ================================================================ GIMP: ‎.gbr .gih .vbr‎ */
function gbrAt(b, p) {
  const r = new R(b, p);
  const hsize = r.u32();
  const version = r.u32();
  const w = r.u32();
  const h = r.u32();
  const bytes = r.u32();
  if (!w || !h || w > 8000 || h > 8000 || ![1, 2, 4].includes(bytes) || hsize < 20 || hsize > 4096) throw new Error('ليس ملف GBR');
  let spacing = 25;
  if (version >= 2) {
    if (r.str(4) !== 'GIMP') throw new Error('ليس ملف GBR');
    spacing = r.u32();
  }
  const name = td('utf-8').decode(b.subarray(r.p, p + hsize)).replace(/\0[\s\S]*$/, '');
  r.p = p + hsize;
  const data = r.bytes(w * h * bytes);
  let mask;
  if (bytes === 1) mask = data.slice();
  else if (bytes === 2) {
    mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = data[i * 2 + 1];
  } else {
    mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3];
  }
  return { tip: { name, w, h, mask, spacing: spacing / 100 }, end: r.p };
}
function readGih(b) {
  // سطران نصّيان: الاسم، ثم عدد الأشكال ومعاملاتها؛ ثم الأشكال GBR متتالية
  let p = 0;
  const line = () => {
    const i = b.indexOf(10, p);
    const s = td('utf-8').decode(b.subarray(p, i < 0 ? b.length : i));
    p = i < 0 ? b.length : i + 1;
    return s;
  };
  const name = line().trim();
  const params = line();
  const n = parseInt(params, 10) || 0;
  const tips = [];
  for (let k = 0; k < Math.min(n || 1000, 1000) && p < b.length; k++) {
    try {
      const g = gbrAt(b, p);
      tips.push({ ...g.tip, name: n > 1 ? `${name} ${k + 1}` : name });
      p = g.end;
    } catch {
      break;
    }
  }
  return { format: 'GIMP GIH (أنبوب فُرَش)', tips };
}
function readVbr(b, fname) {
  const L = td('utf-8').decode(b).split(/\r?\n/).map((s) => s.trim());
  if (L[0] !== 'GIMP-VBR') throw new Error('ليس ملف VBR');
  const v15 = L[1] === '1.5';
  const name = L[2] || bare(fname);
  const num = (i) => parseFloat(L[i]) || 0;
  const t = v15
    ? { shape: L[3] || 'circle', spacing: num(4) / 100, size: num(5) * 2, spikes: num(6), hardness: num(7), aspect: num(8) ? 1 / num(8) : 1, angle: num(9) }
    : { shape: 'circle', spacing: num(3) / 100, size: num(4) * 2, hardness: num(5), aspect: num(6) ? 1 / num(6) : 1, angle: num(7) };
  return { format: 'GIMP VBR (فرشاة محسوبة)', tips: [genTip({ ...t, size: Math.min(256, Math.max(8, t.size || 32)), name })] };
}

/* ================================================================ MyPaint ‎.myb‎ */
function readMyb(b, fname) {
  const s = td('utf-8').decode(b);
  let radius = 2, hard = 0.8, ratio = 1, ang = 0;
  try {
    const j = JSON.parse(s);
    const g = (k) => (j.settings && j.settings[k] && Number.isFinite(+j.settings[k].base_value) ? +j.settings[k].base_value : undefined);
    radius = g('radius_logarithmic') ?? radius;
    hard = g('hardness') ?? hard;
    ratio = g('elliptical_dab_ratio') ?? ratio;
    ang = g('elliptical_dab_angle') ?? ang;
  } catch {
    // الصيغة القديمة: «اسم القيمة | …» سطراً سطراً
    const v = (k) => {
      const m = new RegExp('^' + k + '\\s+(-?[\\d.]+)', 'm').exec(s);
      return m ? +m[1] : undefined;
    };
    radius = v('radius_logarithmic') ?? radius;
    hard = v('hardness') ?? hard;
    ratio = v('elliptical_dab_ratio') ?? ratio;
    ang = v('elliptical_dab_angle') ?? ang;
  }
  const px = Math.exp(radius) * 2;
  return { format: 'MyPaint', tips: [genTip({ size: Math.min(160, Math.max(12, px * 4)), hardness: hard, aspect: ratio > 1 ? 1 / ratio : 1, angle: ang, spacing: 0.08, name: bare(fname) })] };
}

/* ================================================================ ZIP (Procreate وKrita وحزم الفُرَش) */
export async function unzip(b, env) {
  // الفهرس المركزي من نهاية الملف
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) {
    e = i;
    break;
  }
  if (e < 0) throw new Error('ليس ملف ZIP');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const out = [];
  for (let k = 0; k < n && p + 46 <= b.length; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const usize = v.getUint32(p + 24, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
    const off = v.getUint32(p + 42, true);
    const name = td('utf-8').decode(b.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith('/') || usize > 80 * 1024 * 1024) continue;
    const lnl = v.getUint16(off + 26, true), lxl = v.getUint16(off + 28, true);
    const data = b.subarray(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csize);
    out.push({
      name,
      read: async () => (method === 0 ? data : method === 8 ? await env.inflateRaw(data) : null),
    });
  }
  return out;
}
/* ---- قائمة خصائص Apple الثنائية (bplist): اسم فرشاة Procreate ---- */
function bplistName(b) {
  try {
    if (latin(b, 0, 6) !== 'bplist') return '';
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const t = b.length - 32;
    const offSize = b[t + 6], refSize = b[t + 7];
    const num = Number(v.getBigUint64(t + 8)), top = Number(v.getBigUint64(t + 16)), tabOff = Number(v.getBigUint64(t + 24));
    const uint = (p, n) => {
      let x = 0;
      for (let i = 0; i < n; i++) x = x * 256 + b[p + i];
      return x;
    };
    const offs = [];
    for (let i = 0; i < num; i++) offs.push(uint(tabOff + i * offSize, offSize));
    const len = (p) => {
      const lo = b[p] & 15;
      if (lo !== 15) return [lo, p + 1];
      const ib = b[p + 1];
      const n = 1 << (ib & 15);
      return [uint(p + 2, n), p + 2 + n];
    };
    const obj = (i, d = 0) => {
      if (d > 20) return null;
      const p = offs[i];
      const hi = b[p] >> 4;
      if (hi === 5) {
        const [n, s] = len(p);
        return latin(b, s, s + n);
      }
      if (hi === 6) {
        const [n, s] = len(p);
        let str = '';
        for (let k = 0; k < n; k++) str += String.fromCharCode(v.getUint16(s + k * 2));
        return str;
      }
      if (hi === 8) return { uid: uint(p + 1, (b[p] & 15) + 1) };
      if (hi === 1) return uint(p + 1, 1 << (b[p] & 15));
      if (hi === 10) {
        const [n, s] = len(p);
        return Array.from({ length: n }, (_, k) => uint(s + k * refSize, refSize));
      }
      if (hi === 13) {
        const [n, s] = len(p);
        const o = {};
        for (let k = 0; k < n; k++) {
          const key = obj(uint(s + k * refSize, refSize), d + 1);
          o[key] = uint(s + (n + k) * refSize, refSize);
        }
        return o;
      }
      return null;
    };
    const root = obj(top);
    const objects = root && root.$objects != null ? obj(root.$objects) : null;
    if (!Array.isArray(objects)) return '';
    // الكائن الأول المؤرشف: قاموسٌ فيه «name»
    for (const ref of objects.slice(0, 8)) {
      const o = obj(ref);
      if (o && typeof o === 'object' && !Array.isArray(o) && o.name != null) {
        const nm = obj(o.name);
        const s = nm && nm.uid != null ? obj(objects[nm.uid]) : nm;
        if (typeof s === 'string' && s && s !== '$null') return s;
      }
    }
  } catch {}
  return '';
}

/* ================================================================ الصور: PNG (بلا مساعدة) وغيرها (بالمتصفح) */
export async function decodePng(b, env) {
  if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) throw new Error('ليس PNG');
  const r = new R(b, 8);
  let w = 0, h = 0, depth = 8, ctype = 0, inter = 0;
  const idat = [];
  let plte = null, trns = null;
  const text = {};
  while (r.left >= 12) {
    const len = r.u32();
    const type = r.str(4);
    const data = r.bytes(len);
    r.u32();
    if (type === 'IHDR') {
      const q = new R(data);
      w = q.u32();
      h = q.u32();
      depth = q.u8();
      ctype = q.u8();
      q.u8();
      q.u8();
      inter = q.u8();
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const z = data.indexOf(0);
      const key = latin(data, 0, z);
      try {
        if (type === 'tEXt') text[key] = td('latin1').decode(data.subarray(z + 1));
        else if (type === 'zTXt') text[key] = td('utf-8').decode(await env.inflate(data.subarray(z + 2)));
        else {
          const comp = data[z + 1];
          let q = z + 3;
          q = data.indexOf(0, q) + 1; // اللغة
          q = data.indexOf(0, q) + 1; // الكلمة المترجمة
          const body = data.subarray(q);
          text[key] = td('utf-8').decode(comp ? await env.inflate(body) : body);
        }
      } catch {}
    } else if (type === 'IEND') break;
  }
  const out = { w, h, text };
  if (inter || !idat.length) return out; // (المتشابك يُفك بالمتصفح)
  let total = 0;
  for (const x of idat) total += x.length;
  const all = new Uint8Array(total);
  let o = 0;
  for (const x of idat) all.set(x, o), (o += x.length);
  const raw = await env.inflate(all);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const bits = depth * ch;
  const stride = Math.ceil((w * bits) / 8);
  const bpp = Math.max(1, bits >> 3);
  const px = new Uint8Array(stride * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) {
        const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
      }
      cur[i] = v & 255;
    }
    px.set(cur, y * stride);
    prev = cur;
  }
  const data = new Uint8Array(w * h * 4);
  const sample = (y, i) => {
    // عيّنةٌ من القناة (بعمق ١–١٦) مطبّعةً إلى ٠–٢٥٥
    if (depth === 8) return px[y * stride + i];
    if (depth === 16) return px[y * stride + i * 2];
    const bitPos = i * depth;
    const byte = px[y * stride + (bitPos >> 3)];
    const v = (byte >> (8 - depth - (bitPos & 7))) & ((1 << depth) - 1);
    return ctype === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      if (ctype === 0) {
        const g = sample(y, x);
        data.set([g, g, g, 255], d);
      } else if (ctype === 4) {
        const g = sample(y, x * 2);
        data.set([g, g, g, sample(y, x * 2 + 1)], d);
      } else if (ctype === 2) data.set([sample(y, x * 3), sample(y, x * 3 + 1), sample(y, x * 3 + 2), 255], d);
      else if (ctype === 6) data.set([sample(y, x * 4), sample(y, x * 4 + 1), sample(y, x * 4 + 2), sample(y, x * 4 + 3)], d);
      else if (ctype === 3 && plte) {
        const k = sample(y, x);
        data.set([plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], trns && k < trns.length ? trns[k] : 255], d);
      }
    }
  out.data = data;
  return out;
}
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', avif: 'image/avif' };
async function imageTip(b, name, env) {
  let img = null;
  const e = ext(name);
  if (e === 'png' || (b[0] === 0x89 && b[1] === 0x50)) {
    try {
      img = await decodePng(b, env);
    } catch {}
  }
  if ((!img || !img.data) && env.decodeImage) img = await env.decodeImage(b, IMG_MIME[e] || 'image/png');
  if (!img || !img.data) throw new Error('تعذّرت قراءة الصورة');
  return { name: bare(name), w: img.w, h: img.h, mask: maskFromRGBA(img.w, img.h, img.data), spacing: 0.25 };
}

/* ================================================================ Krita ‎.kpp‎ */
function b64(s) {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const xmlAttr = (s, k) => {
  const m = new RegExp('\\b' + k + '="([^"]*)"').exec(s);
  return m ? m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '';
};
async function readKpp(b, fname, env, depth) {
  const png = await decodePng(b, env);
  const xml = png.text.preset || '';
  if (!xml) throw new Error('ليس فيه إعداد فرشاة Krita');
  const name = xmlAttr(/<Preset\b[^>]*>/.exec(xml)?.[0] || '', 'name') || bare(fname);
  const tips = [];
  // موارد مضمّنة (شكل الفرشاة نفسه)
  for (const m of xml.matchAll(/<resource\b([^>]*)>([\s\S]*?)<\/resource>/g)) {
    const fn = xmlAttr(m[1], 'filename') || xmlAttr(m[1], 'name');
    const t = xmlAttr(m[1], 'type');
    if (t && !/brush/i.test(t)) continue;
    try {
      const r = await readAny(fn || 'x.png', b64(m[2].trim()), env, depth + 1);
      for (const tip of r.tips) tips.push({ ...tip, name: name });
    } catch {}
  }
  if (!tips.length) {
    // الفرشاة المحسوبة: من مولّد القناع
    const defm = /<param name="brush_definition"[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/param>/.exec(xml);
    const def = defm ? defm[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
    const brush = /<Brush\b[^>]*>/.exec(def)?.[0] || '';
    const mg = /<MaskGenerator\b[^>]*>/.exec(def)?.[0] || '';
    if (/auto_brush/.test(xmlAttr(brush, 'type')) && mg) {
      const dia = parseFloat(xmlAttr(mg, 'diameter')) || 40;
      const fade = parseFloat(xmlAttr(mg, 'hfade'));
      tips.push(genTip({ shape: xmlAttr(mg, 'type') === 'rect' ? 'square' : 'circle', size: Math.min(256, Math.max(12, dia)), hardness: Number.isFinite(fade) ? fade : 0.8, aspect: parseFloat(xmlAttr(mg, 'ratio')) || 1, spikes: parseInt(xmlAttr(mg, 'spikes'), 10) || 2, angle: ((parseFloat(xmlAttr(brush, 'angle')) || 0) * 180) / Math.PI, spacing: parseFloat(xmlAttr(brush, 'spacing')) || 0.1, name }));
    }
  }
  if (!tips.length) throw new Error('شكل هذه الفرشاة في ملفٍ آخر لم يُضمَّن فيها');
  return { format: 'Krita KPP', tips };
}

/* ================================================================ القارئ العام */
/**
 * @returns {Promise<{format:string, tips:Array<{name,w,h,mask:Uint8Array,spacing,angle?}>, warnings:string[]}>}
 */
export async function readBrushFile(fname, bytes, env) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const r = await readAny(fname, b, env, 0);
  const tips = [];
  for (const t of r.tips) {
    const n = normalizeTip(t);
    if (n) tips.push(n);
    if (tips.length >= MAX_TIPS) break;
  }
  // الأسماء: ما لا اسم له يُسمّى باسم الملف ورقمه
  const base = bare(fname);
  let k = 0;
  const AR = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  const unnamed = tips.filter((t) => !t.name).length;
  for (const t of tips) if (!t.name) t.name = unnamed > 1 ? `${base} ${AR(++k)}` : base;
  if (!tips.length) throw new Error(r.why || 'لم نجد في الملف أشكال فرشاة');
  return { format: r.format, tips, warnings: r.warnings || [] };
}
async function readAny(fname, b, env, depth) {
  if (depth > 3) return { format: '', tips: [] };
  const e = ext(fname);
  const head = latin(b, 0, 16);
  if (e === 'abr' || ((b[0] === 0 && [1, 2, 6, 7, 10].includes(b[1])) && latin(b, 4, 8) === '8BIM')) return readAbr(b);
  if (e === 'gih') return readGih(b);
  if (e === 'vbr' || head.startsWith('GIMP-VBR')) return readVbr(b, fname);
  if (e === 'gbr' || e === 'gpb' || latin(b, 20, 24) === 'GIMP') {
    const g = gbrAt(b, 0);
    return { format: 'GIMP GBR', tips: [{ ...g.tip, name: g.tip.name || bare(fname) }] };
  }
  if (e === 'myb') return readMyb(b, fname);
  if (e === 'kpp') return readKpp(b, fname, env, depth);
  if (head.startsWith('PK\u0003\u0004')) return readZip(fname, b, env, depth);
  if (IMG_MIME[e] || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || head.startsWith('RIFF') || /<svg/i.test(latin(b, 0, 300))) {
    return { format: 'صورة', tips: [await imageTip(b, fname, env)] };
  }
  // صيغةٌ أخرى: تُلتقط صور PNG المضمّنة فيها (كثيرٌ من البرامج تحفظ أشكالها هكذا)
  const found = await embeddedPngs(b, env);
  if (found.length) return { format: `مضمّنة في ‎.${e || 'ملف'}‎`, tips: found.map((t) => ({ ...t, name: '' })), warnings: ['قُرئت الأشكال من الصور المضمّنة في الملف؛ وقد لا تكون كل إعدادات الفرشاة'] };
  return { format: '', tips: [], why: e === 'sut' ? 'فُرَش Clip Studio ‎.sut‎ لا تُقرأ بعد: صدّرها من البرنامج صورةً PNG أو فرشاة ABR ثم أضفها' : 'لم نتعرّف على صيغة هذا الملف، ولم نجد فيه أشكال فرشاة' };
}
async function embeddedPngs(b, env) {
  const out = [];
  for (let i = 0; i < b.length - 8 && out.length < 200; i++) {
    if (b[i] !== 0x89 || b[i + 1] !== 0x50 || b[i + 2] !== 0x4e || b[i + 3] !== 0x47 || b[i + 4] !== 0x0d) continue;
    // نهاية الصورة: IEND
    let j = i + 8;
    let end = -1;
    while (j + 8 <= b.length) {
      const len = new DataView(b.buffer, b.byteOffset + j, 4).getUint32(0);
      const type = latin(b, j + 4, j + 8);
      j += 12 + len;
      if (type === 'IEND') {
        end = j;
        break;
      }
      if (len > b.length) break;
    }
    if (end < 0) continue;
    try {
      const t = await imageTip(b.subarray(i, end), 'x.png', env);
      if (t.w >= 8 && t.h >= 8) out.push(t);
    } catch {}
    i = end - 1;
  }
  return out;
}
async function readZip(fname, b, env, depth) {
  const entries = await unzip(b, env);
  const e = ext(fname);
  const tips = [];
  const warnings = [];
  // Procreate: لكل فرشاة مجلدٌ فيه Shape.png و Brush.archive (والحزمة ‎.brushset‎ مجلداتٌ كثيرة)
  const shapes = entries.filter((x) => /(^|\/)Shape\.png$/i.test(x.name));
  if (shapes.length) {
    for (const s of shapes) {
      const dir = s.name.replace(/Shape\.png$/i, '');
      const arch = entries.find((x) => x.name === dir + 'Brush.archive');
      let name = '';
      if (arch) name = bplistName(await arch.read());
      try {
        const t = await imageTip(await s.read(), 'Shape.png', env);
        tips.push({ ...t, name: name || '', spacing: 0.12 });
      } catch {}
    }
    return { format: e === 'brushset' ? 'Procreate (حزمة فُرَش)' : 'Procreate', tips };
  }
  // Krita ‎.bundle‎ وحزم الفُرَش: كل ما فيها من فُرَش (أشكال الفرش أولاً، ثم الإعدادات)
  const KNOWN = /\.(abr|gbr|gih|vbr|myb|kpp|png|jpe?g|webp|svg|brush|brushset|zip)$/i;
  const list = entries.filter((x) => KNOWN.test(x.name) && !/(^|\/)(__MACOSX|thumbnails?|preview)\b|_prev\.png$|(^|\/)preview\.png$/i.test(x.name));
  const pref = list.filter((x) => /^brushes\//i.test(x.name));
  const use = pref.length ? pref : list.filter((x) => !/\.png$/i.test(x.name) || !list.some((y) => /\.(myb|kpp)$/i.test(y.name)));
  for (const x of use.slice(0, 400)) {
    try {
      const r = await readAny(x.name, await x.read(), env, depth + 1);
      for (const t of r.tips) tips.push({ ...t, name: t.name || bare(x.name) });
    } catch (err) {
      warnings.push(`${x.name}: ${err.message}`);
    }
  }
  return { format: e === 'bundle' ? 'Krita (حزمة موارد)' : 'ZIP', tips, warnings: warnings.slice(0, 10) };
}
