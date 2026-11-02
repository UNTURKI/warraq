// يبني «بطاقة أسلوب» من مجلد، لتُركَّب في الموقع من خانة التركيب (لوحة المالك ← أساليب دور النشر).
// المرجع الكامل لما تحمله البطاقة: docs/style-card-spec.md
//
//   node scripts/make-card.mjs <مجلد الأسلوب | ملف بطاقة نصية> [--out ملف] [--png صورة.png] [--pdf معاينة.pdf] [--book كتاب.json]
//
// «البطاقة النصية»: ملف نصي فيه كل ملف من ملفات الأسلوب في مربع كود وقبله اسمه (كما يجيب به ذكاء اصطناعي
// أُعطي التوجيه docs/ai-style-prompt-books.md و docs/ai-style-prompt-research.md). تُقبل هنا وفي خانة التركيب في الموقع.
//
// بنية المجلد (كل شيء اختياري إلا style.json):
//   style.json            { "name": "...", "desc": "...", "settings": { ... }, "options": { "blankPage": false },
//                           "slots": { "pageBg": "frame" }, "h1OrnamentMm": 7, "separatorMm": 8,
//                           "pages": [ { "file": "basmala.html", "at": "afterCover", "name": "basmala", "folio": false } ],
//                           "print": { "front": ["half", "blank", "cover", "basmala"], "numbering": "book", "gutterMm": 6 },
//                           "fonts": [ { "file": "Katibeh-Regular.woff", "family": "Katibeh", "label": "كاتبة", "weight": "all" } ] }
//   style.css             تنسيق خاص. الصورة فيه: asset(اسمها)
//   script.js             برنامج الأسلوب: كود يتحكم في آلية التنضيد (W.on / W.set) — اختياري
//   templates/<key>.html  قوالب العناصر: h1 h2 h3 h4 folio rh page cover chapterPage ornament tocHead
//   pages/<file>.html     الصفحات الخاصة المذكورة في style.json
//   images/<name>.png|jpg|webp|svg   صور الأسلوب (الاسم بلا امتداد هو اسمها في asset)
//   fonts/<file>          ملفات الخطوط المذكورة في style.json (تدخل مكتبة خطوط الموقع عند التركيب)
//
// الناتج: ملف ‎.warraq.json (يُقبل في خانة التركيب كما هو). ومع ‎--png تُضمَّن البيانات في تلك الصورة فتصير بطاقة PNG.
// ‎--pdf: يركّب البطاقة في مخزن مؤقت كما يفعل الموقع تماماً، وينضّد بها صفحات المعاينة الست في PDF للتحقق قبل التسليم.
// بعد التركيب في الموقع يمكن تنزيل البطاقة المرسومة بزر «تنزيل البطاقة».
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { embedCard } from '../shared/style-card.js';

const args = process.argv.slice(2);
const FLAGS = ['--out', '--png', '--pdf', '--book'];
const dir = args.find((a, i) => !a.startsWith('--') && !FLAGS.includes(args[i - 1]));
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const isText = dir && fs.existsSync(dir) && fs.statSync(dir).isFile();
if (!dir || (!isText && !fs.existsSync(path.join(dir, 'style.json')))) {
  console.error('الاستعمال: node scripts/make-card.mjs <مجلد فيه style.json | ملف بطاقة نصية> [--out ملف] [--png صورة.png] [--pdf معاينة.pdf] [--book كتاب.json]');
  process.exit(1);
}
let card;
let meta;
let images = {};
let templates = {};
let pages = [];
let fonts = [];
let textWarnings = [];
if (isText) {
  // بطاقة نصية (جواب ذكاء اصطناعي محفوظ في ملف): كل ملف في مربع كود وقبله اسمه
  const { parseCardText } = await import('../shared/card-text.js');
  const r = parseCardText(fs.readFileSync(dir, 'utf8'));
  if (!r) {
    console.error('الملف ليس بطاقة نصية: لا مربعات كود فيه بأسماء ملفات الأسلوب');
    process.exit(1);
  }
  card = r.card;
  meta = { name: card.name };
  images = card.extras.images || {};
  templates = card.extras.templates || {};
  pages = card.extras.pages || [];
  textWarnings = r.warnings;
} else {
  const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
  meta = JSON.parse(read('style.json'));
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

  const imgDir = path.join(dir, 'images');
  if (fs.existsSync(imgDir)) {
    for (const f of fs.readdirSync(imgDir).sort()) {
      const ext = f.split('.').pop().toLowerCase();
      if (!MIME[ext]) continue;
      images[f.replace(/\.[^.]+$/, '').toLowerCase()] = `data:${MIME[ext]};base64,` + fs.readFileSync(path.join(imgDir, f)).toString('base64');
    }
  }
  const tplDir = path.join(dir, 'templates');
  if (fs.existsSync(tplDir)) {
    for (const f of fs.readdirSync(tplDir)) if (f.endsWith('.html')) templates[f.replace(/\.html$/, '')] = fs.readFileSync(path.join(tplDir, f), 'utf8').trim();
  }
  pages = (meta.pages || []).map((p) => ({ at: p.at || 'afterCover', name: p.name || '', folio: !!p.folio, html: p.html || read(path.join('pages', p.file)).trim() }));
  fonts = (meta.fonts || []).map((f) => ({
    family: f.family,
    label: f.label || f.family,
    weight: String(f.weight || '400'),
    name: f.file,
    data: fs.readFileSync(path.join(dir, 'fonts', f.file)).toString('base64'),
  }));

  card = {
    format: 'warraq-style',
    version: read('script.js').trim() ? 3 : 2, // البطاقة التي فيها كود تحتاج موقعاً يفهم الإصدار ٣
    name: meta.name,
    desc: meta.desc || '',
    settings: meta.settings || {},
    extras: {
      css: read('style.css'),
      images,
      slots: meta.slots || {},
      h1OrnamentMm: meta.h1OrnamentMm,
      separatorMm: meta.separatorMm,
      templates,
      pages,
      options: meta.options || {},
      ...(read('script.js').trim() ? { script: read('script.js') } : {}),
    },
    ...(meta.print && typeof meta.print === 'object' ? { print: meta.print } : {}),
    ...(fonts.length ? { fonts } : {}),
    exportedAt: new Date().toISOString(),
  };
}

/* فحص: يمر المحتوى بمنقّي الموقع نفسه، ويُنبَّه إلى كل ما سيُحذف أو يُتجاهل عند التركيب */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'warraq-card-'));
process.env.WARRAQ_DATA_DIR = tmp;
const { lintCard, importCard, styleExtras } = await import('../lib/styles.js');
const warn = [...textWarnings, ...lintCard(card)];

const png = opt('--png');
const out = opt('--out') || path.join(path.dirname(path.resolve(dir)), `أسلوب ${card.name}.warraq.${png ? 'png' : 'json'}`);
fs.writeFileSync(out, png ? embedCard(new Uint8Array(fs.readFileSync(png)), card) : JSON.stringify(card));
console.log(`✓ ${out}  (${Math.ceil(fs.statSync(out).size / 1024)} ك.ب · ${Object.keys(images).length} صورة · ${Object.keys(templates).length} قالب · ${pages.length} صفحة خاصة · ${fonts.length} ملف خط${card.extras.script ? ' · برنامج ' + card.extras.script.split('\n').length + ' سطراً' : ''})`);
for (const w of [...new Set(warn)]) console.log('  ⚠ ' + w);

const pdf = opt('--pdf');
if (pdf) {
  const { styleSettings } = await import('../shared/presets.js');
  const { buildPreviewDoc } = await import('../shared/preview-sample.js');
  const { renderPdf, closeBrowser } = await import('../lib/render-pdf.js');
  const st = await importCard(JSON.parse(JSON.stringify(card)), { allowScript: true });
  const settings = { ...styleSettings(st), template: 'full' };
  // ‎--book ملف: كتاب من test/fixtures بدل صفحات المعاينة (للتحقق على نص حقيقي طويل)
  let doc, cover;
  if (opt('--book')) {
    const { parseVolume, parseCover } = await import('../shared/parser.js');
    const { composeVolume } = await import('../shared/compose.js');
    const fx = JSON.parse(fs.readFileSync(opt('--book'), 'utf8'));
    doc = composeVolume(parseVolume(fx.book, fx.pages.map((p) => ({ ...p, meta: JSON.parse(p.meta) })), {}), settings);
    cover = { ...parseCover(fx.book.meta), volLabel: 'الجزء الأول' };
  } else ({ doc, cover } = buildPreviewDoc(settings));
  const { pdf: bytes, layout } = await renderPdf({ doc, settings, cover, baseUrl: 'http://127.0.0.1:1', extra: styleExtras(st.id) });
  await closeBrowser();
  fs.writeFileSync(pdf, bytes);
  console.log(`✓ ${pdf}  (${layout.pageCount} صفحة${st.installedFonts.length ? ' · خطوط البطاقة: ' + st.installedFonts.join('، ') : ''}${layout.warnings.length ? ' · تنبيهات التنضيد: ' + layout.warnings.join(' ') : ''})`);
}
fs.rmSync(tmp, { recursive: true, force: true });
