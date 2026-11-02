// يبني المضمَّن في البرنامج من بطاقات الأساليب (‎.warraq.png) وملفات الحزم (‎.zip) التي في مجلد واحد:
//
//   node scripts/make-builtin.mjs <المجلد>
//
// الناتج: كتلة PRESETS في shared/presets.js، و builtin/styles.json و builtin/covers.json، وصور public/covers/builtin.
// الترتيب والمعرّفات في القوائم أدناه، والأسلوب يؤخذ من بطاقته لا من الحزمة (فلا يتكرر).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extractCard } from '../shared/style-card.js';
import { zipEntries } from '../shared/docx-import.js';
import { STYLE_DEFAULTS } from '../shared/presets.js';

const STYLES = [['mothhab', 'المذهب'], ['zomorrodi', 'الزمردي'], ['bustan', 'البستان'], ['hibr', 'حبر'], ['najd', 'نجد'], ['samarqand', 'سمرقند'], ['thurayya', 'الثريا']];
const COVERS = [['alwarraq', 'الوراق'], ['zumurrud', 'الزمرد'], ['bustan', 'البستان'], ['tashkil', 'تشكيل'], ['riwaq', 'رواق']];
const BUNDLES = [['alwarraq', 'mothhab'], ['zumurrud', 'zomorrodi'], ['bustan', 'bustan']];
const KINDS = ['front', 'back', 'spine'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC) throw new Error('اذكر مجلد البطاقات والحزم');
const files = fs.readdirSync(SRC);
const plain = (s) => s.normalize('NFC').replace(/[ً-ْ]/g, '');
const pick = (ext, word) => {
  const f = files.find((x) => x.endsWith(ext) && plain(x).replace(ext, '').split(/\s+/).includes(word));
  if (!f) throw new Error('لا ملف لـ ' + word);
  return path.join(SRC, f);
};

/* ---- الأساليب ---- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const literal = (v, ind) => {
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  if (Array.isArray(v)) return '[' + v.map((x) => literal(x, ind)).join(', ') + ']';
  if (v && typeof v === 'object') {
    const pad = ind + '  ';
    const body = Object.entries(v).map(([k, x]) => `${pad}${/^[A-Za-z_$][\w$]*$|^\d+$/.test(k) ? k : literal(k)}: ${literal(x, pad)},`);
    return body.length ? `{\n${body.join('\n')}\n${ind}}` : '{}';
  }
  return JSON.stringify(v);
};
const styleOut = [];
const block = [];
for (const [id, word] of STYLES) {
  const card = extractCard(fs.readFileSync(pick('.warraq.png', word)));
  if (!card) throw new Error('بطاقة غير مقروءة: ' + word);
  const extra = Object.keys(card).filter((k) => !['format', 'version', 'name', 'desc', 'settings', 'extras', 'print', 'exportedAt'].includes(k));
  if (extra.length) console.warn(`  تنبيه: في بطاقة «${card.name}» ما لا يُنقل: ${extra.join('، ')}`);
  const own = {};
  for (const [k, v] of Object.entries(card.settings || {})) {
    if (['preset', 'styleId', 'template'].includes(k) || same(v, STYLE_DEFAULTS[k])) continue;
    own[k] = v;
  }
  const lines = [`    name: ${literal(card.name)},`, `    desc: ${literal(card.desc || '')},`, '    ...BASE,'];
  for (const [k, v] of Object.entries(own)) lines.push(`    ${k}: ${literal(v, '    ')},`);
  block.push(`  ${id}: {\n${lines.join('\n')}\n  },`);
  styleOut.push({ id, extras: card.extras || null, print: card.print || null });
  console.log(`أسلوب ${id}: ${card.name} (${(card.desc || '').length} حرف وصف)`);
}
const presetsFile = path.join(ROOT, 'shared', 'presets.js');
const src = fs.readFileSync(presetsFile, 'utf8');
const m = /export const PRESETS = \{\n[\s\S]*?\n\};/.exec(src);
if (!m) throw new Error('لم توجد كتلة PRESETS');
fs.writeFileSync(presetsFile, src.replace(m[0], () => `export const PRESETS = {\n${block.join('\n')}\n};`));

/* ---- الأغلفة والحزم ---- */
const mediaDir = path.join(ROOT, 'public', 'covers', 'builtin');
fs.rmSync(mediaDir, { recursive: true, force: true });
fs.mkdirSync(mediaDir, { recursive: true });
const putMedia = (data, name) => {
  const ext = name.split('.').pop().toLowerCase();
  const file = crypto.createHash('sha256').update(data).digest('hex').slice(0, 14) + '.' + ext;
  fs.writeFileSync(path.join(mediaDir, file), data);
  return '/covers/builtin/' + file;
};
const designs = { front: [], back: [], spine: [] };
const docs = {};
for (const [slug, word] of COVERS) {
  const zip = zipEntries(new Uint8Array(fs.readFileSync(pick('.zip', word))));
  const read = (name) => {
    const e = zip.get(name);
    if (!e) return null;
    return e.method === 8 ? zlib.inflateRawSync(e.data) : Buffer.from(e.data);
  };
  const doc = JSON.parse(read('bundle.json').toString('utf8'));
  docs[slug] = { doc, image: doc.image ? putMedia(read(doc.image), doc.image) : null };
  for (const kind of KINDS) {
    const dir = doc.parts[kind].dir;
    const d = JSON.parse(read(dir + 'cover.json').toString('utf8')).design;
    const walk = (o) => {
      for (const [k, v] of Object.entries(o)) {
        if (v && typeof v === 'object') walk(v);
        else if (typeof v === 'string' && /^images\//.test(v)) {
          const data = read(dir + v);
          if (!data) throw new Error(`صورة ناقصة في ${word}: ${v}`);
          o[k] = putMedia(data, v);
        } else if (typeof v === 'string' && /^\/covers(-media|\/demo)\//.test(v)) throw new Error(`صورة خارج الملف في ${word}: ${v}`);
      }
    };
    walk(d);
    designs[kind].push({ ...d, id: `bi-${slug}-${kind}`, kind, published: true });
  }
}
const all = KINDS.flatMap((k) => designs[k]).map((d, i) => ({ ...d, order: i + 1 }));
const bundles = BUNDLES.map(([slug, style], i) => {
  const { doc, image } = docs[slug];
  return { id: 'bi-' + slug, name: doc.name, front: `bi-${slug}-front`, back: `bi-${slug}-back`, spine: `bi-${slug}-spine`, style, print: null, color: doc.color || null, image, links: doc.links || [], order: i + 1 };
});
const outDir = path.join(ROOT, 'builtin');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'styles.json'), JSON.stringify(styleOut));
fs.writeFileSync(path.join(outDir, 'covers.json'), JSON.stringify({ designs: all, bundles }));
const size = fs.readdirSync(mediaDir).reduce((n, f) => n + fs.statSync(path.join(mediaDir, f)).size, 0);
console.log(`${all.length} تصميماً، ${bundles.length} حزم، ${fs.readdirSync(mediaDir).length} صورة (${(size / 1048576).toFixed(0)} م.ب)`);
