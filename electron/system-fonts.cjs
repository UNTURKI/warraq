// خطوط الجهاز: كل خط مثبّت في Windows (أو macOS/Linux) يظهر في البرنامج ليُختار للكتاب والأساليب والأغلفة.
// تُقرأ أسماء العائلات من جداول الملفات نفسها (name: الاسم الإنجليزي والعربي إن وُجد، OS/2: الوزن ودعم العربية)،
// فالاسم هو ما يعرفه Chromium (المعاينة وإخراج PDF) وما يعرفه Word. وتُحفظ النتيجة في مجلد البيانات فلا تُعاد القراءة إلا إذا تغيّرت الخطوط.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function fontDirs() {
  if (process.platform === 'win32') {
    const win = process.env.WINDIR || 'C:\\Windows';
    return [path.join(win, 'Fonts'), path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')];
  }
  if (process.platform === 'darwin') return ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local', 'share', 'fonts')];
}

function listFiles(dir, out, depth = 0) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) listFiles(p, out, depth + 1);
    else if (/\.(ttf|otf|ttc)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** قراءة جزء من الملف */
function reader(fd) {
  return (pos, len) => {
    const b = Buffer.alloc(len);
    const n = fs.readSync(fd, b, 0, len, pos);
    return n === len ? b : b.subarray(0, n);
  };
}

/** خط واحد يبدأ عند offset (في ملف TTC عدة خطوط) ← { family, arFamily, weight, arabic } */
function readFace(read, offset) {
  const head = read(offset, 12);
  if (head.length < 12) return null;
  const numTables = head.readUInt16BE(4);
  if (!numTables || numTables > 200) return null;
  const dir = read(offset + 12, numTables * 16);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const tag = dir.toString('latin1', i * 16, i * 16 + 4);
    tables[tag] = { off: dir.readUInt32BE(i * 16 + 8), len: dir.readUInt32BE(i * 16 + 12) };
  }
  if (!tables.name) return null;
  const nt = read(tables.name.off, Math.min(tables.name.len, 256 * 1024));
  const count = nt.readUInt16BE(2);
  const strOff = nt.readUInt16BE(4);
  const names = {};
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > nt.length) break;
    const platform = nt.readUInt16BE(r);
    const lang = nt.readUInt16BE(r + 4);
    const id = nt.readUInt16BE(r + 6);
    const len = nt.readUInt16BE(r + 8);
    const off = nt.readUInt16BE(r + 10);
    if (![1, 2, 16, 17].includes(id)) continue;
    const raw = nt.subarray(strOff + off, strOff + off + len);
    let s = '';
    if (platform === 3 || platform === 0) {
      const sw = Buffer.from(raw);
      if (sw.length % 2) continue;
      sw.swap16();
      s = sw.toString('utf16le');
    } else if (platform === 1 && lang === 0) s = raw.toString('latin1');
    else continue;
    s = s.replace(/\0/g, '').trim();
    if (!s) continue;
    const key = id + ':' + (lang === 0x0401 || (lang & 0xff) === 0x01 ? 'ar' : lang === 0x0409 || (platform === 1 && lang === 0) || platform === 0 ? 'en' : 'x');
    if (!names[key]) names[key] = s;
  }
  // العائلة كما يعرفها Windows (ID 1 مع أوزانها الأربعة)، وإلا العائلة المطبعية (16)
  const family = names['1:en'] || names['16:en'] || names['1:x'] || names['16:x'];
  if (!family) return null;
  const arFamily = names['1:ar'] || names['16:ar'] || '';
  const typo = names['16:en'] || names['16:x'] || '';
  let weight = 400;
  let arabic = false;
  if (tables['OS/2'] && tables['OS/2'].len >= 58) {
    const t = read(tables['OS/2'].off, 58);
    weight = t.readUInt16BE(4) || 400;
    // ulUnicodeRange1، البت ١٣: العربية
    arabic = !!(t.readUInt32BE(42) & (1 << 13));
  }
  const sub = (names['2:en'] || '').toLowerCase();
  if (/bold/.test(sub) && weight < 600) weight = 700;
  return { family, typo, arFamily, weight, arabic };
}

function readFile(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const read = reader(fd);
    const tag = read(0, 12);
    if (tag.length < 12) return [];
    const sig = tag.toString('latin1', 0, 4);
    const offs = [];
    if (sig === 'ttcf') {
      const n = Math.min(tag.readUInt32BE(8), 64);
      const t = read(12, n * 4);
      for (let i = 0; i < n; i++) offs.push(t.readUInt32BE(i * 4));
    } else offs.push(0);
    return offs.map((o) => readFace(read, o)).filter(Boolean);
  } catch {
    return [];
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * عائلةٌ واحدة لأوزانها: «Lotus Linotype Light» و«Lotus Linotype» (Bold) خطٌّ واحد اسمه «Lotus Linotype» بوزنين،
 * كما يعرفه Chromium (أسماء DirectWrite). ولـ Word اسم الوجه الأقرب إلى الطبيعي (Word يعرف الخطوط بأسمائها القديمة).
 */
const WEIGHT_WORD = /^(Thin|Hairline|ExtraLight|Extra Light|UltraLight|Ultra Light|Light|Book|Regular|Medium|SemiBold|Semi Bold|Semibold|DemiBold|Demi Bold|Demi|ExtraBold|Extra Bold|UltraBold|Ultra Bold|Black|Heavy)$/i;
function familyKey(face) {
  if (!face.typo || face.typo === face.family) return face.family;
  const rest = face.family.startsWith(face.typo + ' ') ? face.family.slice(face.typo.length + 1).trim() : '';
  return rest && WEIGHT_WORD.test(rest) ? face.typo : face.family;
}

/** كل خطوط الجهاز ← [{ family, label, arabic, weights }] (العربية أولاً، ثم الأبجدية) */
function scan(cacheFile) {
  const files = [];
  for (const d of fontDirs()) listFiles(d, files);
  const sig = 'v2:' + files.length + ':' + files.reduce((a, f) => {
    try {
      return a + Math.round(fs.statSync(f).mtimeMs / 1000);
    } catch {
      return a;
    }
  }, 0);
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c && c.sig === sig && Array.isArray(c.fonts)) return c.fonts;
  } catch {}
  const fams = new Map();
  for (const f of files)
    for (const face of readFile(f)) {
      if (face.family.startsWith('.') || /^(Marlett|Symbol|Webdings|Wingdings.*|MT Extra|HoloLens.*|Segoe MDL2.*|Segoe Fluent.*|Segoe UI Emoji|Segoe UI Symbol)$/i.test(face.family)) continue;
      const key = familyKey(face);
      const x = fams.get(key) || { family: key, label: face.arFamily || key, arabic: false, weights: new Set(), docx: face.family, docxW: 9999 };
      x.arabic = x.arabic || face.arabic;
      if (face.arFamily && x.label === x.family) x.label = face.arFamily;
      x.weights.add(face.weight >= 600 ? 700 : 400);
      // اسم Word: الوجه الأقرب إلى الوزن الطبيعي (٤٠٠)
      const d = Math.abs(face.weight - 400) + (face.weight >= 600 ? 1000 : 0);
      if (d < x.docxW) (x.docxW = d), (x.docx = face.family);
      fams.set(key, x);
    }
  const fonts = [...fams.values()]
    .map((x) => ({ family: x.family, label: x.label, arabic: x.arabic, weights: [...x.weights].sort(), ...(x.docx !== x.family ? { docx: x.docx } : {}) }))
    .sort((a, b) => (b.arabic - a.arabic) || a.label.localeCompare(b.label, 'ar'));
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ sig, fonts }));
  } catch {}
  return fonts;
}

module.exports = { scan, readFile };
