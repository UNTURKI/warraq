// قارئ فهرس «المكتبة الشاملة» (الإصدار الرابع) مباشرةً من ملفات Lucene 9 في مجلدها، للقراءة فقط:
// لا نسخ ولا فهرس إضافي. يُقرأ من كل كتاب مقطعُ النص المضغوط الذي فيه صفحاته فقط.
//   ‎.cfs/.cfe‎ الملفات المجمَّعة · ‎segments_N‎ المقاطع الحية · ‎.fdm/.fdx‎ مواضع المقاطع الفرعية في ‎.fdt‎
//   ‎.dvm/.dvd‎ رقم الكتاب والصفحة لكل مستند · ‎.fdt‎ النصوص (DEFLATE بقاموس مسبق)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ---- files

function readVInt(buf, p) {
  let v = 0, s = 0;
  for (;;) { const x = buf[p++]; v += (x & 0x7f) * 2 ** s; if (!(x & 0x80)) return [v, p]; s += 7; }
}
const headerEnd = (buf) => { const p = 5 + buf[4] + 4 + 16; return p + 1 + buf[p]; };

class SegmentFiles {
  /** dir: the index folder; name: segment name like "_7d4" */
  constructor(dir, name) {
    this.dir = dir; this.name = name;
    const cfe = path.join(dir, name + '.cfe');
    this.entries = null;
    this.fds = new Map();
    if (fs.existsSync(cfe)) {
      const b = fs.readFileSync(cfe);
      let p = headerEnd(b);
      let n; [n, p] = readVInt(b, p);
      this.entries = new Map();
      for (let i = 0; i < n; i++) {
        let len; [len, p] = readVInt(b, p);
        const id = b.toString('utf8', p, p + len); p += len;
        const offset = Number(b.readBigInt64LE(p)); p += 8;
        const length = Number(b.readBigInt64LE(p)); p += 8;
        this.entries.set(id, { offset, length });
      }
      this.cfs = path.join(dir, name + '.cfs');
    }
  }
  /** where a file lives: { file, offset, length }. `suffix` like ".fdt" or "_Lucene90_0.dvd"; `gen` for updated files */
  locate(suffix, gen) {
    const full = this.name + (gen > 0 ? '_' + gen.toString(36) : '') + suffix;
    // files of later generations (doc-values updates, field infos) are always written loose
    if (this.entries && !(gen > 0)) {
      const e = this.entries.get(suffix);
      if (!e) throw new Error('missing ' + suffix + ' in ' + this.name + '.cfs');
      return { file: this.cfs, offset: e.offset, length: e.length };
    }
    const file = path.join(this.dir, full);
    return { file, offset: 0, length: fs.statSync(file).size };
  }
  has(suffix, gen) { try { this.locate(suffix, gen); return true; } catch { return false; } }
  fd(file) {
    let fd = this.fds.get(file);
    if (fd === undefined) { fd = fs.openSync(file, 'r'); this.fds.set(file, fd); }
    return fd;
  }
  readRange(loc, start, length) {
    const buf = Buffer.allocUnsafe(length);
    fs.readSync(this.fd(loc.file), buf, 0, length, loc.offset + start);
    return buf;
  }
  readAll(suffix, gen) { const loc = this.locate(suffix, gen); return this.readRange(loc, 0, loc.length); }
  close() { for (const fd of this.fds.values()) fs.closeSync(fd); this.fds.clear(); }
}

// ---- docvalues

function packedAt(buf, off, bpv, i) { // Lucene DirectWriter: LSB-first bit packing
  if (bpv === 0) return 0;
  if (bpv === 8) return buf[off + i];
  if (bpv === 16) return buf.readUInt16LE(off + 2 * i);
  if (bpv === 32) return buf.readUInt32LE(off + 4 * i);
  let v = 0;
  for (let b = 0; b < bpv; b++) {
    const bit = i * bpv + b;
    if ((buf[off + Math.floor(bit / 8)] >> (bit % 8)) & 1) v += 2 ** b;
  }
  return v;
}

/** Parse a .dvm file: Map(fieldNumber -> entry) for NUMERIC fields */
function readNumericMeta(meta) {
  let p = headerEnd(meta);
  const out = new Map();
  for (;;) {
    const field = meta.readInt32LE(p); p += 4;
    if (field === -1) break;
    const type = meta[p]; p += 1;
    if (type !== 0) throw new Error('doc values type ' + type + ' not supported (field ' + field + ')');
    const e = { field };
    e.dwfOffset = Number(meta.readBigInt64LE(p)); p += 8;
    e.dwfLength = Number(meta.readBigInt64LE(p)); p += 8;
    p += 2 + 1; // jump table entries, dense rank power
    e.numValues = Number(meta.readBigInt64LE(p)); p += 8;
    const tableSize = meta.readInt32LE(p); p += 4;
    e.blockShift = -1;
    if (tableSize >= 0) { e.table = []; for (let i = 0; i < tableSize; i++) { e.table.push(Number(meta.readBigInt64LE(p))); p += 8; } }
    else if (tableSize < -1) e.blockShift = -2 - tableSize;
    e.bpv = meta[p]; p += 1;
    e.min = Number(meta.readBigInt64LE(p)); p += 8;
    e.gcd = Number(meta.readBigInt64LE(p)); p += 8;
    e.valuesOffset = Number(meta.readBigInt64LE(p)); p += 8;
    e.valuesLength = Number(meta.readBigInt64LE(p)); p += 8;
    e.jumpTableOffset = Number(meta.readBigInt64LE(p)); p += 8;
    out.set(field, e);
  }
  return out;
}

/** All values of a dense numeric field as a Float64Array (index = doc number) */
function readNumericValues(e, readData, maxDoc) {
  if (e.dwfOffset !== -1) throw new Error('field ' + e.field + ' is not present on every document');
  const n = maxDoc ?? e.numValues;
  const out = new Float64Array(n);
  if (e.blockShift >= 0) {
    const data = readData(e.valuesOffset, e.valuesLength);
    const size = 2 ** e.blockShift, mul = e.gcd;
    let p = 0;
    for (let start = 0; start < n; start += size) {
      const bpv = data[p]; p += 1;
      const delta = Number(data.readBigInt64LE(p)); p += 8;
      let len = 0;
      if (bpv) { len = data.readInt32LE(p); p += 4; }
      const count = Math.min(size, n - start);
      for (let j = 0; j < count; j++) out[start + j] = bpv ? mul * packedAt(data, p, bpv, j) + delta : delta;
      p += len;
    }
    return out;
  }
  if (e.bpv === 0) { out.fill(e.table ? e.table[0] : e.min); return out; }
  const data = readData(e.valuesOffset, e.valuesLength);
  for (let i = 0; i < n; i++) {
    const v = packedAt(data, 0, e.bpv, i);
    out[i] = e.table ? e.table[v] : e.min + e.gcd * v;
  }
  return out;
}

// ---- fdx

// LSB-first bit packing (Lucene DirectWriter), value i of a block starting at byte `off`
function readMonotonicMeta(meta, p, count, blockShift) {
  const nBlocks = Math.ceil(count / 2 ** blockShift);
  const blocks = [];
  for (let k = 0; k < nBlocks; k++) {
    const min = Number(meta.readBigInt64LE(p)); p += 8;
    const avg = meta.readFloatLE(p); p += 4;
    const offset = Number(meta.readBigInt64LE(p)); p += 8;
    const bpv = meta[p]; p += 1;
    blocks.push({ min, avg, offset, bpv });
  }
  return [blocks, p];
}
function monotonicValues(data, base, blocks, count, blockShift) {
  const out = new Array(count);
  const size = 2 ** blockShift;
  for (let i = 0; i < count; i++) {
    const blk = blocks[Math.floor(i / size)];
    const j = i % size;
    const expected = Math.trunc(Math.fround(Math.fround(j) * blk.avg));
    out[i] = blk.min + expected + packedAt(data, base + blk.offset, blk.bpv, j);
  }
  return out;
}

/** Returns { chunkSize, numDocs, chunkDocs: [docBase...,numDocs], chunkStarts: [offset...,maxPointer] } */
function readFieldsIndex(meta, data) {
  if (typeof meta === 'string') meta = fs.readFileSync(meta);
  if (typeof data === 'string') data = fs.readFileSync(data);
  let p = headerEnd(meta);
  let chunkSize; [chunkSize, p] = readVInt(meta, p);
  const numDocs = meta.readInt32LE(p); p += 4;
  const blockShift = meta.readInt32LE(p); p += 4;
  const n = meta.readInt32LE(p); p += 4; // chunks + 1
  const docsStart = Number(meta.readBigInt64LE(p)); p += 8;
  let docBlocks; [docBlocks, p] = readMonotonicMeta(meta, p, n, blockShift);
  const ptrStart = Number(meta.readBigInt64LE(p)); p += 8;
  let ptrBlocks; [ptrBlocks, p] = readMonotonicMeta(meta, p, n, blockShift);
  const chunkDocs = monotonicValues(data, docsStart, docBlocks, n, blockShift);
  const chunkStarts = monotonicValues(data, ptrStart, ptrBlocks, n, blockShift);
  return { chunkSize, numDocs, chunks: n - 1, chunkDocs, chunkStarts };
}

// ---- segments
function readString(buf, p) { let n; [n, p] = readVInt(buf, p); return [buf.toString('utf8', p, p + n), p + n]; }
function readSetOfStrings(buf, p) { let n; [n, p] = readVInt(buf, p); const out = []; for (let i = 0; i < n; i++) { let s; [s, p] = readString(buf, p); out.push(s); } return [out, p]; }

function readSegmentInfos(file) {
  const b = fs.readFileSync(file);
  let p = 5 + b[4] + 4 + 16; p += 1 + b[p];
  let maj, min, bug, created;
  [maj, p] = readVInt(b, p); [min, p] = readVInt(b, p); [bug, p] = readVInt(b, p);
  [created, p] = readVInt(b, p);
  const version = Number(b.readBigInt64BE(p)); p += 8; // the commit point keeps big-endian ints
  let counter; [counter, p] = readVInt(b, p);
  const count = b.readInt32BE(p); p += 4;
  if (count > 0) { let t; [t, p] = readVInt(b, p); [t, p] = readVInt(b, p); [t, p] = readVInt(b, p); }
  const segs = [];
  for (let i = 0; i < count; i++) {
    const s = {};
    [s.name, p] = readString(b, p);
    p += 16; // segment id
    [s.codec, p] = readString(b, p);
    s.delGen = Number(b.readBigInt64BE(p)); p += 8;
    s.delCount = b.readInt32BE(p); p += 4;
    s.fieldInfosGen = Number(b.readBigInt64BE(p)); p += 8;
    s.dvGen = Number(b.readBigInt64BE(p)); p += 8;
    s.softDelCount = b.readInt32BE(p); p += 4;
    const marker = b[p++]; if (marker === 1) p += 16;
    [s.fieldInfosFiles, p] = readSetOfStrings(b, p);
    const nUpd = b.readInt32BE(p); p += 4;
    s.dvUpdates = {};
    for (let k = 0; k < nUpd; k++) { const field = b.readInt32BE(p); p += 4; let files; [files, p] = readSetOfStrings(b, p); s.dvUpdates[field] = files; }
    segs.push(s);
  }
  return { lucene: maj + '.' + min + '.' + bug, created, version, counter, segments: segs, end: p, size: b.length };
}

// ---- library

/**
 * عدد الحقول وطول كل مستند في المقطع الفرعي (Lucene StoredFieldsInts): بايت بعرض القيمة (0 أو 8 أو 16 أو 32)،
 * ثم القيم في كتل من 128 مضفورةً في أعداد من 64 بتاً تُكتب little-endian:
 *   عرض 8:  العدد i من 16 = v[i]<<56 | v[16+i]<<48 | … | v[112+i]
 *   عرض 16: العدد i من 32 = v[i]<<48 | v[32+i]<<32 | v[64+i]<<16 | v[96+i]
 *   عرض 32: العدد i من 64 = v[i]<<32 | v[64+i]
 * وما بقي بعد آخر كتلة كاملة يُكتب قيمةً قيمة. (والعرض 0: القيم كلها واحدة، تليه بـ VInt)
 */
function readStoredInts(buf, p, n) {
  const bpv = buf[p++];
  if (bpv === 0) { const [v, q] = readVInt(buf, p); return [new Array(n).fill(v), q]; }
  const w = bpv / 8; // bytes per value
  if (w !== 1 && w !== 2 && w !== 4) throw new Error('unexpected stored-ints width ' + bpv);
  const per = 8 / w; // values per long
  const lanes = 128 / per; // longs per block
  const read = (o) => (w === 1 ? buf[o] : w === 2 ? buf.readUInt16LE(o) : buf.readUInt32LE(o));
  const out = new Array(n);
  let k = 0;
  for (; k + 128 <= n; k += 128) {
    for (let i = 0; i < lanes; i++) {
      const base = p + 8 * i;
      // the highest bits of the long hold v[k+i]; in little-endian bytes that is the last slot
      for (let j = 0; j < per; j++) out[k + lanes * j + i] = read(base + w * (per - 1 - j));
    }
    p += 128 * w;
  }
  for (; k < n; k++) { out[k] = read(p); p += w; }
  return [out, p];
}
function readFieldNames(buf) { // Lucene94 FieldInfos -> Map(number -> name)
  let p = headerEnd(buf);
  let count; [count, p] = readVInt(buf, p);
  const m = new Map();
  for (let i = 0; i < count; i++) {
    let len; [len, p] = readVInt(buf, p);
    const name = buf.toString('utf8', p, p + len); p += len;
    let number; [number, p] = readVInt(buf, p);
    p += 3 + 8;
    let nattr; [nattr, p] = readVInt(buf, p);
    for (let k = 0; k < nattr; k++) { let l; [l, p] = readVInt(buf, p); p += l; [l, p] = readVInt(buf, p); p += l; }
    let pd; [pd, p] = readVInt(buf, p);
    if (pd) { let t; [t, p] = readVInt(buf, p); [t, p] = readVInt(buf, p); }
    let vd; [vd, p] = readVInt(buf, p);
    p += 2;
    m.set(number, name);
  }
  return m;
}
function decodeChunk(buf, names) {
  let p = 0, docBase, token;
  [docBase, p] = readVInt(buf, p);
  [token, p] = readVInt(buf, p);
  const ndocs = token >> 2;
  if (token & 1) throw new Error('sliced chunk not supported');
  let nsf, lens, dictLen, blockLen, clen;
  [nsf, p] = readStoredInts(buf, p, ndocs);
  [lens, p] = readStoredInts(buf, p, ndocs);
  [dictLen, p] = readVInt(buf, p);
  [blockLen, p] = readVInt(buf, p);
  [clen, p] = readVInt(buf, p);
  const dict = zlib.inflateRawSync(buf.subarray(p, p + clen)); p += clen;
  const total = lens.reduce((a, b) => a + b, 0);
  const parts = [dict.subarray(0, dictLen)];
  let produced = dictLen;
  while (produced < total) {
    [clen, p] = readVInt(buf, p);
    const blk = zlib.inflateRawSync(buf.subarray(p, p + clen), { dictionary: dict.subarray(0, dictLen) });
    p += clen; parts.push(blk); produced += blk.length;
  }
  const data = Buffer.concat(parts);
  let s = 0;
  const docs = [];
  for (let i = 0; i < ndocs; i++) {
    const fields = [];
    const end = s + lens[i];
    for (let k = 0; k < nsf[i]; k++) {
      let info; [info, s] = readVInt(data, s);
      const name = names.get(Math.floor(info / 8)) || '#' + Math.floor(info / 8), type = info & 7;
      if (type === 0 || type === 1) { let len; [len, s] = readVInt(data, s); fields.push([name, data.toString('utf8', s, s + len)]); s += len; }
      else if (type === 2 || type === 4) { let v; [v, s] = readVInt(data, s); fields.push([name, (v % 2 ? -1 : 1) * Math.floor(v / 2)]); }
      else if (type === 3) { s += 4; }
      else if (type === 5) { s += 8; }
      else throw new Error('bad field type ' + type);
    }
    if (s !== end) throw new Error('document ' + (docBase + i) + ' does not match its stored length');
    docs.push(fields);
  }
  if (s !== data.length) throw new Error('chunk does not line up');
  return { docBase, docs };
}

class Segment {
  constructor(dir, info) {
    this.info = info;
    this.files = new SegmentFiles(dir, info.name);
    const fnm = info.fieldInfosGen > 0 ? this.files.readAll('.fnm', info.fieldInfosGen) : this.files.readAll('.fnm');
    this.names = readFieldNames(fnm);
    this.byName = new Map([...this.names].map(([n, name]) => [name, n]));
    this.index = readFieldsIndex(this.files.readAll('.fdm'), this.files.readAll('.fdx'));
    this.fdt = this.files.locate('.fdt');
    this.cache = new Map();
  }
  get numDocs() { return this.index.numDocs; }
  /** numeric doc values of a field for all docs (takes doc-values updates into account) */
  numeric(name) {
    const num = this.byName.get(name);
    if (num === undefined) return null;
    // a field rewritten by a doc-values update lives in its own generation: _50g_1_Lucene90_0.dvd
    let gen = 0;
    const upd = (this.info.dvUpdates || {})[num];
    if (upd && upd.length) { const m = /^_[0-9a-z]+_([0-9a-z]+)_Lucene90/.exec(upd[0]); if (m) gen = parseInt(m[1], 36); }
    const metaBuf = gen ? this.files.readAll('_Lucene90_0.dvm', gen) : this.files.readAll('_Lucene90_0.dvm');
    const loc = gen ? this.files.locate('_Lucene90_0.dvd', gen) : this.files.locate('_Lucene90_0.dvd');
    const e = readNumericMeta(metaBuf).get(num);
    if (!e) return null;
    return readNumericValues(e, (o, l) => this.files.readRange(loc, o, l), this.numDocs);
  }
  chunkOf(docId) {
    const d = this.index.chunkDocs;
    let lo = 0, hi = this.index.chunks - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (d[mid] <= docId) lo = mid; else hi = mid - 1; }
    return lo;
  }
  readChunk(c) {
    const hit = this.cache.get(c);
    if (hit) return hit;
    const start = this.index.chunkStarts[c], end = this.index.chunkStarts[c + 1];
    const out = decodeChunk(this.files.readRange(this.fdt, start, end - start), this.names);
    if (out.docBase !== this.index.chunkDocs[c]) throw new Error('chunk ' + c + ' does not match the index');
    this.cache.set(c, out);
    if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    return out;
  }
  doc(docId) { const c = this.readChunk(this.chunkOf(docId)); return c.docs[docId - c.docBase]; }
  close() { this.files.close(); }
}

/** newest segments_N in the folder */
function latestCommit(dir) {
  let best = null, gen = -1;
  for (const f of fs.readdirSync(dir)) {
    const m = /^segments_([0-9a-z]+)$/.exec(f);
    if (m && parseInt(m[1], 36) > gen) { gen = parseInt(m[1], 36); best = f; }
  }
  if (!best) throw new Error('no segments_N file in ' + dir);
  return path.join(dir, best);
}

class ShamelaPages {
  constructor(dir, { onSegmentError } = {}) {
    this.dir = dir;
    const commit = readSegmentInfos(latestCommit(dir));
    this.segments = [];
    this.runs = new Map(); // bookId -> [{ seg, from, to }] contiguous doc ranges
    for (const info of commit.segments) {
      let seg;
      try { seg = new Segment(dir, info); } catch (e) { if (onSegmentError) { onSegmentError(info.name, e); continue; } throw e; }
      const si = this.segments.push(seg) - 1;
      const book = seg.numeric('book');
      seg.pageNo = seg.numeric('page');
      if (!book) continue;
      let from = 0;
      for (let d = 1; d <= book.length; d++) {
        if (d === book.length || book[d] !== book[from]) {
          const id = book[from];
          if (!this.runs.has(id)) this.runs.set(id, []);
          this.runs.get(id).push({ seg: si, from, to: d - 1 });
          from = d;
        }
      }
    }
  }
  books() {
    const out = new Map();
    for (const [id, runs] of this.runs) out.set(id, runs.reduce((a, r) => a + r.to - r.from + 1, 0));
    return out;
  }
  /** All pages of one book in page order: [{ page, key, body, foot }] */
  bookPages(bookId) {
    const runs = this.runs.get(+bookId) || [];
    const pages = [];
    for (const r of runs) {
      const seg = this.segments[r.seg];
      for (let d = r.from; d <= r.to; d++) {
        // one document = one page: its key, and every body / foot value it stores (in order)
        const rec = { page: seg.pageNo ? seg.pageNo[d] : null, key: '', body: '', foot: '' };
        for (const [name, value] of seg.doc(d)) {
          if (name === 'id') { if (!rec.key) rec.key = String(value); }
          else if (name === 'body' || name === 'foot') rec[name] = rec[name] ? rec[name] + '\n' + value : String(value);
        }
        if (rec.key) pages.push(rec);
      }
    }
    const n = (k) => +String(k).split('-')[1];
    return pages.sort((a, b) => n(a.key) - n(b.key));
  }
  close() { for (const s of this.segments) s.close(); }
}

export { ShamelaPages, Segment, SegmentFiles, readSegmentInfos };
