// اختبارات «المحرِّر»: تعديلات المستخدم تُعاد على ناتج المحلّل
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVolume } from '../shared/parser.js';
import { composeVolume } from '../shared/compose.js';
import { presetSettings } from '../shared/presets.js';
import { applyEdits, blockText, sigOf, splitVerse, sectionRange, findRegex, runsText, tableToBlocks, tableLooksVerse, splitRunsAt, runsFromText, sideText, sideSlot, normSide } from '../shared/edits.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', f), 'utf8'));
const book = fx('book.json');
const P = parseVolume(book.book, book.pages);
const at = (b) => ({ t: { vol: '1', b }, sig: sigOf(P.blocks[b]) });
let k = 0;
const op = (o) => ({ id: 'o' + ++k, ...o });

// ١) نصٌّ داخل فقرة يصير آية
const pi = P.blocks.findIndex((b) => b.type === 'para' && runsText(b.runs).length > 60 && b.runs.every((r) => r.k === 't' || r.k === 'r'));
const txt = runsText(P.blocks[pi].runs);
const from = txt.indexOf(' ') + 1, to = txt.indexOf(' ', from + 12);
let r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(pi), from, to, kind: 'q' })] });
const q = r.parsed.blocks[pi].runs.find((x) => x.k === 'q');
ok('نص داخل فقرة يصير آية بقوسين مزهّرين', q && q.s.startsWith('﴿') && q.s.endsWith('﴾') && q.s.includes(txt.slice(from, to).trim()), q && q.s);
ok('الأصل لا يُمسّ', !P.blocks[pi].runs.some((x) => x.k === 'q'));
ok('النص كاملاً باقٍ', runsText(r.parsed.blocks[pi].runs).replace(/[﴿﴾]/g, '') === txt);

// ٢) ثم تعود نصاً
const q2 = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(pi), from, to, kind: 'q' }), op({ op: 'kind', t: { vol: '1', b: pi }, sig: sigOf(r.parsed.blocks[pi]), from: from, to: from + q.s.length, kind: 't' })] });
ok('الآية تعود نصاً بلا قوسين', runsText(q2.parsed.blocks[pi].runs) === txt && q2.parsed.blocks[pi].runs.every((x) => x.k !== 'q'), runsText(q2.parsed.blocks[pi].runs).slice(0, 80));

// ٣) فقرة كلها: عنوان بمستواه، ثم مستوى آخر
r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(pi), kind: 'heading', level: 3 })] });
ok('فقرة تصير عنواناً', r.parsed.blocks[pi].type === 'heading' && r.parsed.blocks[pi].level === 3 && r.parsed.stats.headings === P.stats.headings + 1);
const hi = P.blocks.findIndex((b) => b.type === 'heading');
r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(hi), kind: 'heading', level: 2 })] });
ok('مستوى العنوان يتغيّر', r.parsed.blocks[hi].level === 2);
r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(hi), kind: 'text' })] });
ok('العنوان يصير فقرة', r.parsed.blocks[hi].type === 'para' && runsText(r.parsed.blocks[hi].runs) === P.blocks[hi].text);

// ٤) فقرة تصير بيتاً، ووضعه
ok('شطرا البيت عند الفاصل', JSON.stringify(splitVerse('قفا نبك من ذكرى حبيب ومنزل ... بسقط اللوى بين الدخول فحومل')) === JSON.stringify(['قفا نبك من ذكرى حبيب ومنزل', 'بسقط اللوى بين الدخول فحومل']));
r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(pi), kind: 'verse', parts: ['الشطر الأول', 'الشطر الثاني'] })] });
ok('فقرة تصير بيتاً بشطرين', r.parsed.blocks[pi].type === 'verse' && r.parsed.blocks[pi].parts[1] === 'الشطر الثاني');
const vi = P.blocks.findIndex((b) => b.type === 'verse');
r = applyEdits(P, '1', { ops: [op({ op: 'verse', ...at(vi), vl: 'stack', vs: 'one' })] });
ok('وضع البيت يشمل قصيدته', r.parsed.blocks[vi].vl === 'stack' && r.parsed.blocks[vi + 1].type === 'verse' && r.parsed.blocks[vi + 1].vl === 'stack');
const doc = composeVolume(r.parsed, presetSettings('mothhab'));
const cv = doc.blocks.find((b) => b.type === 'verse');
ok('وضع البيت يصل إلى الإخراج', cv && cv.vl === 'stack' && cv.vs === 'one', JSON.stringify(cv));
const { buildBookHtml } = await import('../lib/book-html.js');
const { buildDocx } = await import('../lib/docx.js');
const html = buildBookHtml({ doc, settings: presetSettings('mothhab'), cover: {} });
ok('وضع القصيدة في PDF', html.includes('.verse.vl-stack') && !buildBookHtml({ doc: composeVolume(P, presetSettings('mothhab')), settings: presetSettings('mothhab'), cover: {} }).includes('.verse.vl-stack'));
const dx = await buildDocx({ doc, settings: presetSettings('mothhab'), cover: {}, layout: {} });
ok('وضع القصيدة في Word', !!dx);

// ٥) متن
r = applyEdits(P, '1', { ops: [op({ op: 'kind', ...at(pi), kind: 'matn' })] });
ok('الفقرة كلها متن (مضمَّن)', r.parsed.blocks[pi].runs.filter((x) => x.k !== 'r').every((x) => x.k === 'm'));

// ٦) الاستبدال: موضع، فصل، كتاب
const word = txt.split(' ').find((w) => w.length > 3 && P.blocks.filter((b) => runsText(b.runs || []).includes(w)).length > 1) || txt.split(' ')[1];
const all = P.blocks.reduce((a, b) => a + (blockText(b).split(word).length - 1), 0) + Object.values(P.notes).reduce((a, n) => a + n.segs.reduce((x, s) => x + (blockText(s).split(word).length - 1), 0), 0);
r = applyEdits(P, '1', { ops: [op({ op: 'text', scope: 'book', find: word, repl: '‹X›' })] });
ok('استبدال في الكتاب كله', r.report.get('o' + k).n === all && all > 1, `${word}: ${all}`);
const off = txt.indexOf(word);
r = applyEdits(P, '1', { ops: [op({ op: 'text', scope: 'one', ...at(pi), at: off, find: word, repl: '‹X›' })] });
ok('استبدال في موضع واحد', r.report.get('o' + k).n === 1 && runsText(r.parsed.blocks[pi].runs).includes('‹X›'));
const [s0, s1] = sectionRange(P.blocks, pi);
ok('حدود الفصل', s0 <= pi && pi <= s1 && (s0 === 0 || P.blocks[s0].type === 'heading'), `${s0}..${s1}`);
r = applyEdits(P, '1', { ops: [op({ op: 'text', scope: 'section', range: [s0, s1], find: word, repl: '‹X›' })] });
ok('استبدال في الفصل', r.report.get('o' + k).n >= 1 && r.report.get('o' + k).n <= all);
ok('تجاهل التشكيل وكلمة كاملة', findRegex('شرط', { marks: true, word: true }).test('هذا شَرْطٌ لازم') && !findRegex('شرط', { word: true }).test('الشروط والاشتراط'));
r = applyEdits({ blocks: [{ type: 'para', runs: [{ k: 't', s: 'هذا شرطً لازم، وشرطً آخر' }], pageId: 1 }], notes: {} }, '1', { ops: [op({ op: 'text', scope: 'book', find: 'شرطً', repl: 'شرطًا' })] });
ok('شرطً ← شرطًا', runsText(r.parsed.blocks[0].runs) === 'هذا شرطًا لازم، وشرطًا آخر');

// ٧) المواضع المماثلة
const m = { blocks: [{ type: 'para', runs: [{ k: 't', s: 'قال تعالى: إنما الأعمال بالنيات وهنا' }], pageId: 1 }, { type: 'para', runs: [{ k: 't', s: 'وفي حديث إنما الأعمال بالنيات أيضاً' }], pageId: 2 }], notes: {} };
r = applyEdits(m, '1', { ops: [op({ op: 'kindText', scope: 'vol', vol: '1', text: 'إنما الأعمال بالنيات', kind: 'h' })] });
ok('نوعٌ لكل نصٍّ مماثل', r.report.get('o' + k).n === 2 && r.parsed.blocks.every((b) => b.runs.some((x) => x.k === 'h' && x.s === '«إنما الأعمال بالنيات»')));

// ٨) تغيّر ترتيب القطع: يُطلب التوقيع
const shifted = { ...P, blocks: [{ type: 'para', runs: [{ k: 't', s: 'قطعة زائدة' }], pageId: 0 }, ...P.blocks] };
r = applyEdits(shifted, '1', { ops: [op({ op: 'kind', ...at(hi), kind: 'heading', level: 4 })] });
ok('الموضع بتوقيعه إذا تزحزحت القطع', r.parsed.blocks[hi + 1].level === 4 && !r.report.get('o' + k).missed);
r = applyEdits(P, '1', { ops: [op({ op: 'kind', t: { vol: '1', b: 3 }, sig: 'ليس في الكتاب', kind: 'q' })] });
ok('ما لم يوجد يُبلَّغ ولا يُفسد', r.report.get('o' + k).missed === true);
r = applyEdits(P, '2', { ops: [op({ op: 'kind', ...at(hi), kind: 'text' })] });
ok('عملية مجلد لا تمسّ غيره', r.parsed.blocks[hi].type === 'heading');

// ٩) الحاشية
const nid = Object.keys(P.notes)[0];
const nseg = P.notes[nid].segs[0];
const nt = runsText(nseg.runs);
r = applyEdits(P, '1', { ops: [op({ op: 'kind', t: { vol: '1', n: nid, g: 0 }, sig: sigOf(nseg), from: 0, to: Math.min(12, nt.length), kind: 'h' })] });
ok('نوعٌ داخل حاشية', r.parsed.notes[nid].segs[0].runs.some((x) => x.k === 'h'));
// ١٠) تنسيق كلمة بعينها، وشرح الصورة
const { styleSpan } = await import('../shared/edits.js');
r = applyEdits(P, '1', { ops: [op({ op: 'style', ...at(pi), from, to, st: { size: 1.3, bold: true } })] });
const stRun = r.parsed.blocks[pi].runs.find((x) => x.st);
ok('تنسيق كلمات بعينها', stRun && stRun.st.size === 1.3 && stRun.st.bold && runsText(r.parsed.blocks[pi].runs) === txt, JSON.stringify(stRun));
const docSt = composeVolume(r.parsed, presetSettings('mothhab'));
const dxSt = await buildDocx({ doc: docSt, settings: presetSettings('mothhab'), cover: {}, layout: {} });
ok('التنسيق في Word', !!dxSt);
const r2 = applyEdits(r.parsed, '1', { ops: [op({ op: 'style', t: { vol: '1', b: pi }, sig: sigOf(r.parsed.blocks[pi]), from, to, st: { size: null, bold: null } })] });
ok('إزالة التنسيق', !r2.parsed.blocks[pi].runs.some((x) => x.st) && r2.parsed.blocks[pi].runs.length === P.blocks[pi].runs.length);

// ١١) ملف الكتاب: يُحفظ ويُفتح كما هو (والصور خارج النص)
const { packBook, unpackBook, isBookFile } = await import('../shared/book-file.js');
const PNG = 'data:image/png;base64,' + Buffer.from(new Uint8Array(300).map((_, i) => i % 251)).toString('base64');
const withImg = { ...P, blocks: [...P.blocks, { type: 'image', src: PNG, w: 10, h: 10, cap: 'شرح الصورة', pageId: 9 }] };
const bytes = await packBook({ manifest: { title: 'كتاب', author: 'مؤلف', volumes: [{ vol: '1', label: '' }], source: { kind: 'turath', id: 1 } }, style: { settings: presetSettings('mothhab') }, volumes: { 1: withImg }, edits: { ops: [{ id: 'x', op: 'kind' }] }, thumb: PNG });
ok('ملف الكتاب ZIP بوسمه', isBookFile(bytes) && bytes.length < JSON.stringify(withImg).length);
const back = await unpackBook(bytes);
ok('يُفتح كما حُفظ', JSON.stringify(back.volumes['1']) === JSON.stringify(withImg) && back.manifest.title === 'كتاب' && back.edits.ops.length === 1 && back.thumb === PNG && back.style.settings.template === presetSettings('mothhab').template);

// ١٢) الكتابة في الصفحة (كما في Word)
const { diffText, spliceRuns, PARA_MARK } = await import('../shared/edits.js');
const apl = (a, ch) => ch.slice().sort((x, y) => y.a - x.a).reduce((s, c) => s.slice(0, c.a) + c.s + s.slice(c.z), a);
const pairs = [['قال شرطً في الكتاب', 'قال شرطًا في الكتاب'], ['أول ثاني ثالث', 'أول ثانٍ ثالث رابع'], ['نص', ''], ['', 'جديد']];
ok('الفرق بين النصين', pairs.every(([a, b2]) => apl(a, diffText(a, b2)) === b2));
ok('التصحيح يضيق إلى حروفه', JSON.stringify(diffText('قال شرطً في', 'قال شرطًا في')) === JSON.stringify([{ a: 8, z: 8, s: 'ا' }]));
const qruns = [{ k: 't', s: 'قال: ' }, { k: 'q', s: '﴿الحمد لله﴾', st: { bold: true } }, { k: 't', s: ' وبعد' }];
const qn = spliceRuns(qruns, 11, 11, 'ُ');
ok('المكتوب يرث نوع ما قبله وتنسيقه', qn.length === 3 && qn[1].k === 'q' && qn[1].s === '﴿الحمدُ لله﴾' && qn[1].st.bold);
const ti2 = pi;
const T2 = runsText(P.blocks[ti2].runs);
const cut1 = T2.indexOf(' ', 30);
r = applyEdits(P, '1', { ops: [op({ op: 'edit', ...at(ti2), ch: [{ a: cut1, z: cut1 + 1, s: PARA_MARK }, { a: 0, z: 0, s: 'زيادةٌ ' }] })] });
ok('Enter يقسم الفقرة', r.parsed.blocks.length === P.blocks.length + 1 && runsText(r.parsed.blocks[ti2].runs).startsWith('زيادةٌ ') && runsText(r.parsed.blocks[ti2 + 1].runs) === T2.slice(cut1 + 1).replace(/^\s+/, ''));
const merged = applyEdits(r.parsed, '1', { ops: [op({ op: 'merge', t: { vol: '1', b: ti2 + 1 }, sig: sigOf(r.parsed.blocks[ti2 + 1]) })] });
ok('Backspace يضمّها', merged.parsed.blocks.length === P.blocks.length && runsText(merged.parsed.blocks[ti2].runs).includes(T2.slice(cut1 + 1, cut1 + 20).trim()));
// إدراج، ونقل، وحذف
r = applyEdits(P, '1', { ops: [op({ op: 'insert', ...at(ti2), where: 'after', block: { type: 'heading', level: 2, text: 'فصلٌ جديد' } }), op({ op: 'insert', t: { vol: '1', b: ti2 + 1 }, sig: sigOf({ type: 'heading', text: 'فصلٌ جديد' }), where: 'after', block: { type: 'para', runs: [] } })] });
ok('إدراج عنوان وفقرة فارغة', r.parsed.blocks[ti2 + 1].type === 'heading' && r.parsed.blocks[ti2 + 2].type === 'para' && r.parsed.blocks[ti2 + 2].ins === 1);
const docIns = composeVolume(r.parsed, presetSettings('mothhab'));
ok('الفقرة الفارغة تبقى سطراً يُكتب فيه', docIns.blocks.some((b) => b.type === 'para' && b.runs.length === 1 && b.runs[0].s === '​'));
const mv = applyEdits(r.parsed, '1', { ops: [op({ op: 'move', t: { vol: '1', b: ti2 + 1 }, sig: sigOf(r.parsed.blocks[ti2 + 1]), d: -1 })] });
ok('نقل القطعة', mv.parsed.blocks[ti2].type === 'heading');
const rm = applyEdits(mv.parsed, '1', { ops: [op({ op: 'remove', t: { vol: '1', b: ti2 }, sig: sigOf(mv.parsed.blocks[ti2]) })] });
ok('حذف القطعة', rm.parsed.blocks.length === mv.parsed.blocks.length - 1 && !rm.parsed.blocks.some((b) => b.text === 'فصلٌ جديد'));
// تنسيق الحرف والفقرة والصورة والحاشية
r = applyEdits(P, '1', {
  ops: [
    op({ op: 'style', ...at(ti2), from: 0, to: 10, st: { font: 'Amiri', it: 1, ul: 1, sk: 1, bg: '#FFF3A3', up: 20, ws: 30, size: 1.25, color: '#22385E' } }),
    op({ op: 'pstyle', ...at(ti2), ps: { al: 'c', ind: 0, is: 6, ie: 4, sb: 3, sa: 2, lh: 2.2, bx: 'box', drop: 1, pb: 1 } }),
    op({ op: 'insert', ...at(ti2), where: 'before', block: { type: 'image', src: PNG, w: 10, h: 10, wPct: 40 } }),
  ],
});
const imgI = ti2;
r = applyEdits(r.parsed, '1', { ops: [op({ op: 'img', t: { vol: '1', b: imgI }, sig: '', set: { wrap: 'right', op: 0.5, rot: 5, bd: 'line' } }), op({ op: 'note', t: { vol: '1', b: imgI + 1 }, sig: sigOf(r.parsed.blocks[imgI + 1]), pos: 5, nid: 'uabc1234', text: 'حاشيتي' })] });
const pb = r.parsed.blocks[imgI + 1];
ok('تنسيق الفقرة', pb.al === 'c' && pb.ps.lh === 2.2 && pb.ps.bx === 'box' && pb.ps.ind === 0, JSON.stringify(pb.ps));
ok('الصورة والتفافها', r.parsed.blocks[imgI].wrap === 'right' && r.parsed.blocks[imgI].op === 0.5);
ok('حاشية جديدة', r.parsed.notes.uabc1234 && pb.runs.some((x) => x.k === 'r' && x.id === 'uabc1234'));
const s2 = { ...presetSettings('mothhab'), template: 'matn_sharh', footnotes: false };
const docF = composeVolume(r.parsed, s2);
ok('حاشية المستخدم تظهر ولو كان القالب بلا حواشٍ', !!docF.notes.uabc1234);
const docF2 = composeVolume(r.parsed, presetSettings('mothhab'));
const pbOut = docF2.blocks.find((b) => b.ps && b.ps.bx === 'box');
ok('تنسيق الفقرة يصل إلى الإخراج', pbOut && pbOut.breakBefore && pbOut.ps.lh === 2.2);
const dxF = await buildDocx({ doc: docF2, settings: presetSettings('mothhab'), cover: {}, layout: {} });
const { zipEntries } = await import('../shared/docx-import.js');
const zlib = await import('node:zlib');
const docXml = (() => {
  const e = zipEntries(new Uint8Array(dxF)).get('word/document.xml');
  return Buffer.from(e.method === 8 ? zlib.inflateRawSync(e.data) : e.data).toString('utf8');
})();
ok('Word: الخط والمائل والتظليل والرفع', /w:rFonts w:ascii="Amiri"/.test(docXml) && /<w:i\/>/.test(docXml) && /<w:strike\/>/.test(docXml) && /w:shd w:val="clear" w:color="auto" w:fill="FFF3A3"/.test(docXml) && /<w:position w:val="\d+"\/>/.test(docXml));
ok('Word: إطار الفقرة وتباعدها ومسافتها', /<w:pBdr><w:top w:val="single"/.test(docXml) && /w:right="340" w:left="227" w:firstLine="0"/.test(docXml) && /<w:jc w:val="center"\/>/.test(docXml));
ok('Word: الصورة يلتف النص حولها', /<wp:anchor[^>]*>[\s\S]*?<wp:align>right<\/wp:align>[\s\S]*?<wp:wrapSquare wrapText="bothSides"\/>/.test(docXml) && /alphaModFix amt="50000"/.test(docXml));
// الصور المدرجة في ملف الكتاب: في media لا في التعديلات
const bytes2 = await packBook({ manifest: { title: 'ك', volumes: [{ vol: '1' }] }, style: {}, volumes: { 1: P }, edits: { ops: [{ id: 'i', op: 'insert', block: { type: 'image', src: PNG } }] } });
const back2 = await unpackBook(bytes2);
ok('صور «المحرِّر» في media', back2.edits.ops[0].block.src === PNG && bytes2.length < 10000 + JSON.stringify(P).length);

// ١٣) القوائم والجداول والأنماط
r = applyEdits(P, '1', { ops: [
  op({ op: 'pstyle', ...at(ti2), ps: { ls: 'n' } }),
  op({ op: 'insert', ...at(ti2), where: 'after', block: { type: 'table', rtl: true, borders: true, cols: [50, 50], rows: [{ hdr: true, cells: [{ t: 'أ' }, { t: 'ب' }] }, { cells: [{ t: '' }, { t: '' }] }] } }),
] });
r = applyEdits(r.parsed, '1', { ops: [
  op({ op: 'cell', t: { vol: '1', b: ti2 + 1 }, sig: '', r: 1, c: 0, set: { t: 'خلية', b: true } }),
  op({ op: 'table', t: { vol: '1', b: ti2 + 1 }, sig: '', act: 'colAfter', r: 0, c: 1 }),
  op({ op: 'table', t: { vol: '1', b: ti2 + 1 }, sig: '', act: 'rowAfter', r: 1, c: 0 }),
] });
const tbN = r.parsed.blocks[ti2 + 1];
ok('الجدول: خلية، وعمود، وصف', tbN.rows[1].cells[0].t === 'خلية' && tbN.rows[1].cells[0].b && tbN.rows[0].cells.length === 3 && tbN.rows.length === 3 && tbN.cols.length === 3);
r = applyEdits(r.parsed, '1', { ops: [
  op({ op: 'defstyle', sid: 'sA', name: 'تنبيه', kind: 'p', ps: { bx: 'shade', sb: 2 }, st: { color: '#22385E', bold: true }, al: 'c' }),
  op({ op: 'pstyle', t: { vol: '1', b: ti2 + 2 }, sig: sigOf(r.parsed.blocks[ti2 + 2]), ps: { pst: 'sA' } }),
  op({ op: 'defstyle', sid: 'sB', name: 'مصطلح', kind: 'c', st: { bg: '#FFF3A3' } }),
  op({ op: 'style', t: { vol: '1', b: ti2 + 2 }, sig: sigOf(r.parsed.blocks[ti2 + 2]), from: 0, to: 5, st: { cs: 'sB', it: 1 } }),
] });
const docSty = composeVolume(r.parsed, presetSettings('mothhab'));
const styled = docSty.blocks.find((b) => b.ps && b.ps.bx === 'shade');
ok('نمط الفقرة يُحلّ عند الإخراج', styled && styled.al === 'c' && styled.runs.every((x) => x.k === 'r' || (x.st && x.st.color === '#22385E')));
ok('نمط الحرف فوق نمط الفقرة، وتنسيق الكلمة فوقهما', styled.runs[0].st.bg === '#FFF3A3' && styled.runs[0].st.it && styled.runs[0].st.bold);
const r3 = applyEdits(r.parsed, '1', { ops: [op({ op: 'defstyle', sid: 'sA', name: 'تنبيه', kind: 'p', ps: { bx: 'box' } })] });
ok('تحديث النمط يغيّر ما يحمله', composeVolume(r3.parsed, presetSettings('mothhab')).blocks.some((b) => b.ps && b.ps.bx === 'box'));
const dxL = await buildDocx({ doc: docSty, settings: presetSettings('mothhab'), cover: {}, layout: {} });
const xmlL = (() => { const e = zipEntries(new Uint8Array(dxL)).get('word/document.xml'); return Buffer.from(e.method === 8 ? zlib.inflateRawSync(e.data) : e.data).toString('utf8'); })();
ok('Word: القائمة والجدول', /<w:t[^>]*>١-<\/w:t>/.test(xmlL) && /w:hanging=/.test(xmlL) && /<w:t[^>]*>خلية<\/w:t>/.test(xmlL));

// ١٥) آيةٌ في شطر بيت: تُحاط بقوسي الآية (لا لونٌ وحده)، وتعود نصاً بلا قوسين
{
  const V = { blocks: [{ type: 'verse', parts: ['قال الإله قل هو الله أحد', 'فاحفظ كلامه يا فتى'] }], notes: {} };
  const vat = { t: { vol: '1', b: 0 }, sig: sigOf(V.blocks[0]) };
  const a = 'قال الإله '.length;
  const z = 'قال الإله قل هو الله أحد'.length;
  const rv = applyEdits(V, '1', { ops: [op({ op: 'kind', ...vat, from: a, to: z, kind: 'q' })] });
  const vb = rv.parsed.blocks[0];
  ok('آية في شطر بيت بقوسيها', vb.parts[0] === 'قال الإله ﴿قل هو الله أحد﴾' && JSON.stringify(vb.vq) === JSON.stringify([[0, a, z + 2]]), vb.parts[0] + ' ' + JSON.stringify(vb.vq));
  ok('الأصل لا يُمسّ (البيت)', V.blocks[0].parts[0] === 'قال الإله قل هو الله أحد');
  const rv2 = applyEdits(V, '1', { ops: [op({ op: 'kind', ...vat, from: a, to: z, kind: 'q' }), op({ op: 'kind', t: { vol: '1', b: 0 }, sig: sigOf(vb), from: a + 1, to: z + 1, kind: 't' })] });
  ok('الآية في الشطر تعود نصاً بلا قوسين', rv2.parsed.blocks[0].parts[0] === 'قال الإله قل هو الله أحد' && !rv2.parsed.blocks[0].vq, rv2.parsed.blocks[0].parts[0]);
  // في الشطر الثاني (المحدَّد بعد الفاصل « … »)
  const off = V.blocks[0].parts[0].length + 3;
  const rv3 = applyEdits(V, '1', { ops: [op({ op: 'kind', ...vat, from: off + 'فاحفظ '.length, to: off + 'فاحفظ كلامه'.length, kind: 'q' })] });
  ok('آية في الشطر الثاني بقوسيها', rv3.parsed.blocks[0].parts[1] === 'فاحفظ ﴿كلامه﴾ يا فتى', rv3.parsed.blocks[0].parts[1]);
}

// ١٤) تعبير نمطي، وملاحظة المراجع
r = applyEdits(P, '1', { ops: [op({ op: 'text', scope: 'book', vol: null, find: '(قال)\\s+(\\S+)', repl: '$2 $1', re: true })] });
const P2 = { blocks: [{ type: 'para', runs: [{ k: 't', s: 'قال زيد، ثم قال عمرو' }] }], notes: {} };
const rx = applyEdits(P2, '1', { ops: [op({ op: 'text', scope: 'book', vol: null, find: '(قال)\\s+(\\S+)', repl: '$2 $1', re: true })] });
ok('الاستبدال بتعبير نمطي ومجموعاته', runsText(rx.parsed.blocks[0].runs) === 'زيد، قال ثم عمرو قال', runsText(rx.parsed.blocks[0].runs));
r = applyEdits(P, '1', { ops: [op({ op: 'memo', ...at(ti2), text: 'راجعه' })] });
ok('ملاحظة المراجع لا تدخل الإخراج', r.parsed.blocks[ti2].memo.text === 'راجعه' && !JSON.stringify(composeVolume(r.parsed, presetSettings('mothhab'))).includes('راجعه'));

// ١٥) المتن المضمَّن المنكسر عند آخر الصفحة: تتمته متن، ولا يُفصل، ولا يبدأ المتنُ المستشهَد به صفحةً جديدة
{
  const PB = parseVolume({ meta: { id: 1, name: 'ت' }, indexes: { headings: [] } }, [
    { page: 1, text: 'قال الشارح: هذا كلام في أول الشرح طويل. ــ قال المصنف رحمه الله تعالى: إنما الأعمال بالنيات وإنما لكل' },
    { page: 2, text: 'امرئ ما نوى ــ وهذا شرح لما تقدم من كلامه، وفيه فوائد كثيرة.\nثم قال: ــ فمن كانت هجرته ــ وهذا شرح.' },
  ]);
  const m0 = PB.blocks[0].runs.filter((x) => x.k === 'm').map((x) => x.s).join('');
  ok('تتمة المتن في الصفحة التالية متن', /لكل امرئ ما نوى/.test(m0) && !PB.blocks[0].runs.some((x) => x.k === 'm' && /وهذا شرح/.test(x.s)), m0);
  const DB = composeVolume(PB, { ...presetSettings('mothhab'), template: 'full' });
  ok('المتن المستشهَد به في وسط الشرح لا يبدأ صفحة جديدة', !DB.blocks.some((b) => b.breakBefore));
}

// ١٦) الجدول يصير نصاً: فقرة لكل صف، ولكل خلية، و«العنوان: القيمة»، وأبيات
{
  const T = { type: 'table', rtl: 1, borders: 1, rows: [
    { hdr: 1, cells: [{ t: 'العلَم' }, { t: 'الوفاة' }] },
    { cells: [{ t: 'النووي' }, { t: '٦٧٦هـ' }] },
    { cells: [{ t: 'ابن حجر\nالعسقلاني' }, { t: '٨٥٢هـ' }] },
    { cells: [{ t: '' }, { t: '', skip: 1 }] },
  ] };
  const PT = { blocks: [{ type: 'para', runs: [{ k: 't', s: 'قبل الجدول' }] }, T, { type: 'para', runs: [{ k: 't', s: 'بعده' }] }], notes: {} };
  let r = applyEdits(PT, '1', { ops: [op({ op: 'untable', t: { vol: '1', b: 1 }, sig: sigOf(T), mode: 'row', sep: '، ', hdr: 'heading' })] });
  const bl = r.parsed.blocks;
  ok('الجدول يصير فقرات، والفارغ يُترك', bl.length === 5 && !bl.some((b) => b.type === 'table'), bl.map((b) => b.type).join(','));
  ok('صف العنوان عنوان', bl[1].type === 'heading' && bl[1].text === 'العلَم، الوفاة', bl[1].text);
  ok('فقرة لكل صف بفاصلها، وأسطر الخلية في سطر', runsText(bl[2].runs) === 'النووي، ٦٧٦هـ' && runsText(bl[3].runs) === 'ابن حجر العسقلاني، ٨٥٢هـ', runsText(bl[3].runs));
  ok('ما قبل الجدول وبعده باقٍ', runsText(bl[0].runs) === 'قبل الجدول' && runsText(bl[4].runs) === 'بعده');
  const kv = tableToBlocks(T, { mode: 'kv' });
  ok('«العنوان: القيمة»', kv.length === 2 && runsText(kv[0].runs) === 'العلَم: النووي — الوفاة: ٦٧٦هـ', runsText(kv[0].runs));
  const cells = tableToBlocks(T, { mode: 'cell', hdr: 'drop' });
  ok('فقرة لكل خلية (وأسطرها فقرات)', cells.length === 5 && runsText(cells[3].runs) === 'العسقلاني', cells.map((b) => runsText(b.runs)).join(' | '));
  const rev = tableToBlocks(T, { mode: 'row', hdr: 'drop', reverse: true });
  ok('عكس ترتيب الخلايا', runsText(rev[0].runs) === '٦٧٦هـ، النووي');
  const V = { type: 'table', rows: [{ cells: [{ t: 'قفا نبك' }, { t: 'بسقط اللوى' }] }, { cells: [{ t: 'فتوضح' }, { t: 'لما نسجتها' }] }] };
  const vv = tableToBlocks(V, { mode: 'verse' });
  ok('جدول شعر يصير أبياتاً', tableLooksVerse(V) && vv.length === 2 && vv[0].type === 'verse' && vv[0].parts[1] === 'بسقط اللوى');
  r = applyEdits(PT, '1', { ops: [op({ op: 'untable', t: { vol: '1', b: 1 }, sig: '', mode: 'row' }), op({ op: 'kind', t: { vol: '1', b: 3 }, sig: sigOf({ type: 'para', runs: [{ k: 't', s: 'ابن حجر العسقلاني، ٨٥٢هـ' }] }), kind: 'heading', level: 3 })] });
  ok('ما بعد التحويل يُطبَّق على الفقرات الجديدة', r.parsed.blocks[3].type === 'heading', r.parsed.blocks.map((b) => b.type).join(','));
}

// الحاشية من نصٍّ في الكتاب، والهامش الجانبي، والفقرة من اليسار إلى اليمين
{
  const base = () => ({ blocks: [
    { type: 'para', runs: [{ k: 't', s: 'قال الله تعالى ' }, { k: 'q', s: '﴿إن الله غفور رحيم﴾' }, { k: 't', s: ' وهذا شرحٌ قصير.' }] },
    { type: 'para', runs: [{ k: 't', s: 'وفيه كلامٌ ينبغي أن يكون حاشيةً على ما قبله.' }] },
    { type: 'heading', level: 2, text: 'فصل' },
  ], notes: {} });
  const PB = base();
  const b0 = PB.blocks[0], b1 = PB.blocks[1];
  // ١) المقطع من الفقرة نفسها: يُنقل حاشيةً عند موضعٍ قبله، والآية تبقى آيةً في الحاشية
  const t0 = runsText(b0.runs);
  const a = t0.indexOf('﴿'), z = t0.indexOf('﴾') + 1;
  const [, rest] = splitRunsAt(b0.runs, a);
  const [mid] = splitRunsAt(rest, z - a);
  let r = applyEdits(PB, '1', { ops: [op({ op: 'batch', vol: '1', ops: [
    { op: 'note', t: { vol: '1', b: 0 }, sig: sigOf(b0), pos: 3, nid: 'uabcdef1', runs: mid },
    { op: 'edit', t: { vol: '1', b: 0 }, sig: sigOf(b0), ch: [{ a, z: z + 1, s: '' }] },
  ] })] });
  const nb = r.parsed.blocks[0];
  const nt = r.parsed.notes.uabcdef1;
  ok('النص المحدَّد يصير حاشية بنوعه (الآية آية)', nt && nt.segs[0].runs[0].k === 'q' && nt.segs[0].runs[0].s === '﴿إن الله غفور رحيم﴾', JSON.stringify(nt && nt.segs));
  ok('ويُحذف من موضعه، والإحالة حيث اختير', !runsText(nb.runs).includes('غفور') && nb.runs.findIndex((x) => x.k === 'r') === 1 && runsText(nb.runs).startsWith('قال'), runsText(nb.runs));
  // ٢) فقرةٌ كاملة تصير حاشيةً على فقرةٍ أخرى وتُحذف
  r = applyEdits(PB, '1', { ops: [op({ op: 'batch', vol: '1', ops: [
    { op: 'note', t: { vol: '1', b: 0 }, sig: sigOf(b0), pos: t0.length, nid: 'uabcdef2', segs: [b1] },
    { op: 'remove', t: { vol: '1', b: 1 }, sig: sigOf(b1) },
  ] })] });
  ok('الفقرة كلها تصير حاشية', r.parsed.blocks.length === 2 && runsText(r.parsed.notes.uabcdef2.segs[0].runs) === runsText(b1.runs) && r.parsed.blocks[0].runs.at(-1).k === 'r');
  // ٣) الهامش الجانبي
  r = applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'المغفرة' } }), op({ op: 'side', t: { vol: '1', b: 2 }, sig: sigOf(PB.blocks[2]), set: { l: 'هامش أيسر' } })] });
  ok('الهامش الأيمن والأيسر', sideText(r.parsed.blocks[0].side.r) === 'المغفرة' && sideText(r.parsed.blocks[2].side.l) === 'هامش أيسر');
  r = applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'x' } }), op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: '' } })] });
  ok('الهامش الفارغ يُحذف', !r.parsed.blocks[0].side);
  const cdoc = composeVolume(applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { l: 'تلخيص' } })] }).parsed, presetSettings('mothhab'));
  ok('الهامش يصل إلى التنضيد', cdoc.blocks.some((b) => b.side && sideText(b.side.l) === 'تلخيص'));
  // الهامش نصٌّ منسَّق: يُكتب فيه في موضعه، ويُنسَّق، ويُحاذى، ويُنقل إلى المتبادل
  const sd0 = { vol: '1', b: 0, sd: 'r' };
  r = applyEdits(PB, '1', { ops: [
    op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'حكم المسألة' } }),
    op({ op: 'edit', t: sd0, sig: sigOf({ type: 'p', runs: [{ k: 't', s: 'حكم المسألة' }] }), ch: [{ a: 11, z: 11, s: ' الأولى' }] }),
    op({ op: 'style', t: sd0, sig: sigOf({ type: 'p', runs: [{ k: 't', s: 'حكم المسألة\nالأولى' }] }), from: 0, to: 3, st: { color: '#8a1c1c', bold: true, font: 'Amiri', size: 1.2 } }),
    op({ op: 'pstyle', t: sd0, ps: { al: 'r', lh: 1.4 } }),
  ] });
  const s0 = r.parsed.blocks[0].side && r.parsed.blocks[0].side.r;
  ok('الكتابة في الهامش (السطر الجديد سطرٌ فيه)', s0 && sideText(s0) === 'حكم المسألة\nالأولى', JSON.stringify(s0));
  ok('تنسيق نص الهامش (اللون والخط والمقاس)', s0 && s0.runs[0].st && s0.runs[0].st.color === '#8a1c1c' && s0.runs[0].st.font === 'Amiri' && s0.runs[0].s === 'حكم');
  ok('محاذاة الهامش وتباعد أسطره', s0 && s0.al === 'r' && s0.ps && s0.ps.lh === 1.4);
  r = applyEdits(r.parsed, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), mv: ['r', 'a'], set: { alt: 'ol' } })] });
  const s1 = r.parsed.blocks[0].side;
  ok('نقل الهامش إلى المتبادل بتنسيقه', s1 && !s1.r && s1.a && s1.a.runs[0].st && s1.a.runs[0].st.bold && s1.alt === 'ol');
  ok('المتبادل: الفردية يميناً والزوجية يساراً، والعكس', sideSlot('a', 'or', 1) === 'r' && sideSlot('a', 'or', 2) === 'l' && sideSlot('a', 'ol', 1) === 'l' && sideSlot('a', 'ol', 2) === 'r' && sideSlot('l', 'or', 1) === 'l');
  r = applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'x' } }), op({ op: 'edit', t: sd0, sig: 'x', ch: [{ a: 0, z: 1, s: '' }] })] });
  ok('الهامش يُمحى كله فيُحذف', !r.parsed.blocks[0].side);
  ok('نص الإصدارات السابقة يُقرأ', sideText(normSide({ r: 'قديم' }).r) === 'قديم');
  r = applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'y' } }), op({ op: 'remove', t: sd0, sig: 'y' })] });
  ok('لا يُحذف بالهامش ما ليس منه', r.parsed.blocks.length === PB.blocks.length);
  // حدود الهامش (مم): تُختار وتُغيَّر وحدها، وتبقى مع الكتابة فيه ونقله، وتعود تلقائية
  r = applyEdits(PB, '1', { ops: [
    op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: 'هامش' } }),
    op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), box: ['r', { w: 30, h: 45.26, dy: 12, x: 999 }] }),
    op({ op: 'edit', t: sd0, sig: 'هامش', ch: [{ a: 0, z: 4, s: 'تنبيه مهم' }] }),
  ] });
  const bx = r.parsed.blocks[0].side && r.parsed.blocks[0].side.r && r.parsed.blocks[0].side.r.box;
  ok('حدود الهامش تُحفظ (وتُقصر على حدودها)', bx && bx.w === 30 && bx.h === 45.3 && bx.dy === 12 && bx.x === 200, JSON.stringify(bx));
  ok('والكتابة فيه تُبقيها', sideText(r.parsed.blocks[0].side.r) === 'تنبيه مهم' && !!r.parsed.blocks[0].side.r.box);
  let r2 = applyEdits(r.parsed, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), box: ['r', { h: null }] })] });
  ok('حدٌّ واحد يعود تلقائياً', r2.parsed.blocks[0].side.r.box.h === undefined && r2.parsed.blocks[0].side.r.box.w === 30);
  r2 = applyEdits(r.parsed, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), mv: ['r', 'l'] })] });
  ok('نقل الهامش إلى الجهة الأخرى بحدوده', !r2.parsed.blocks[0].side.r && r2.parsed.blocks[0].side.l.box.w === 30);
  // نقله بإزاء قطعةٍ أخرى: يُحذف من الأولى ويوضع في الثانية بحدوده
  const movedPart = { ...r.parsed.blocks[0].side.r, box: { ...r.parsed.blocks[0].side.r.box, dy: -3 } };
  r2 = applyEdits(r.parsed, '1', { ops: [op({ op: 'batch', vol: '1', ops: [
    { op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { r: null } },
    { op: 'side', t: { vol: '1', b: 2 }, sig: sigOf(PB.blocks[2]), set: { l: movedPart } },
  ] })] });
  ok('نقل الهامش بإزاء فقرةٍ أخرى', !r2.parsed.blocks[0].side && r2.parsed.blocks[2].side.l.box.dy === -3 && sideText(r2.parsed.blocks[2].side.l) === 'تنبيه مهم');
  r2 = applyEdits(r.parsed, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), box: ['r', null] })] });
  ok('الحدود كلها تعود تلقائية', !r2.parsed.blocks[0].side.r.box);
  // الهامش في الطرف الخارجي (المتبادل out): يسار اليسرى ويمين اليمنى، والفردية يسرى إلا أن تُجعل يمنى
  r2 = applyEdits(PB, '1', { ops: [op({ op: 'side', t: { vol: '1', b: 0 }, sig: sigOf(b0), set: { a: 'تعليق', alt: 'out' } })] });
  ok('هامشٌ في الطرف الخارجي يُحفظ', r2.parsed.blocks[0].side && r2.parsed.blocks[0].side.alt === 'out' && sideText(r2.parsed.blocks[0].side.a) === 'تعليق');
  ok('الطرف الخارجي: يسار الفردية ويمين الزوجية، والعكس إن كانت الفردية يمنى', sideSlot('a', 'out', 1) === 'l' && sideSlot('a', 'out', 2) === 'r' && sideSlot('a', 'out', 3, true) === 'r' && sideSlot('a', 'out', 4, true) === 'l');
  ok('قيمةٌ غير معروفة للمتبادل تعود الأصل', normSide({ a: 'x', alt: 'zz' }).alt === 'or');
  // الترجمة بين إحالات الحواشي: كل قطعةٍ في موضعها، فتبقى الإحالة عند كلمتها
  {
    const TB = { blocks: [{ type: 'para', runs: [{ k: 't', s: 'قال ابن عمر' }, { k: 'r', id: 'n1' }, { k: 't', s: ' وهو حديث' }, { k: 'r', id: 'n2' }, { k: 't', s: '.' }] }], notes: { n1: { id: 'n1', kind: 'fn', segs: [{ type: 'p', runs: [{ k: 't', s: 'رواه البخاري' }] }] }, n2: { id: 'n2', kind: 'fn', segs: [{ type: 'p', runs: [{ k: 't', s: 'صحيح' }] }] } } };
    const pieces = ['Ibn Umar said', ' and it is a hadith', '.'];
    const refs = [11, 20];
    const ch = pieces.map((x, j) => ({ a: j ? refs[j - 1] : 0, z: j < refs.length ? refs[j] : 21, s: x }));
    const tr = applyEdits(TB, '1', { ops: [op({ op: 'edit', t: { vol: '1', b: 0 }, sig: sigOf(TB.blocks[0]), ch }), op({ op: 'edit', t: { vol: '1', n: 'n1', g: 0 }, sig: sigOf(TB.notes.n1.segs[0]), ch: [{ a: 0, z: 12, s: 'Narrated by al-Bukhari' }] })] });
    const rs = tr.parsed.blocks[0].runs.map((x) => (x.k === 'r' ? '[' + x.id + ']' : x.s)).join('');
    ok('الترجمة تُبقي إحالات الحواشي عند كلماتها', rs === 'Ibn Umar said[n1] and it is a hadith[n2].', rs);
    ok('والحاشية تُترجم في موضعها', runsText(tr.parsed.notes.n1.segs[0].runs) === 'Narrated by al-Bukhari');
  }
  // ٤) الفقرة من اليسار إلى اليمين
  r = applyEdits(PB, '1', { ops: [op({ op: 'pstyle', t: { vol: '1', b: 1 }, sig: sigOf(b1), ps: { dir: 'ltr', al: null } })] });
  ok('الفقرة من اليسار إلى اليمين', r.parsed.blocks[1].ps && r.parsed.blocks[1].ps.dir === 'ltr' && !r.parsed.blocks[1].al);
  // ٥) نصٌّ فيه آيات ← مقاطع
  const rr = runsFromText('قال: ﴿قل هو الله أحد﴾ وهي سورة.');
  ok('الآية بين ﴿﴾ تصير آية', rr.length === 3 && rr[1].k === 'q' && rr[1].s === '﴿قل هو الله أحد﴾');
}

// المتون: خانات صاحب النسخة في الغلاف الداخلي
{
  const { cleanMutun } = await import('../shared/mutun.js');
  const d = cleanMutun({}).mOwner;
  ok('خانات صاحب النسخة: مطفأةٌ أصلاً، والاسم ورقم الهاتف', d.on === false && d.fields.map((f) => f.t).join('|') === 'الاسم|رقم الهاتف');
  const o = cleanMutun({ mOwner: { on: true, fields: [{ t: 'الاسم', f: 'line' }, { t: '  ', f: 'dots' }, { t: 'الرقم الأكاديمي', f: 'blank' }, { t: 'الحلقة', f: 'x' }] } }).mOwner;
  ok('خانةٌ يزيدها المستخدم، وما بعدها خطٌّ أو نقاط أو فراغ', o.on && o.fields.length === 3 && o.fields[0].f === 'line' && o.fields[1].t === 'الرقم الأكاديمي' && o.fields[1].f === 'blank' && o.fields[2].f === 'dots', JSON.stringify(o));
  ok('بلا خانات: لا تظهر', cleanMutun({ mOwner: { on: true, fields: [] } }).mOwner.on === false);
}

// الهامش الخارجي الواسع (shared/margin.js): النص ١١ سم والهامش في طرف الكتاب ٤ سم في صفحة ١٧ سم بهامشين ٢ سم
{
  const { pageGeom, cleanOuterMargin } = await import('../shared/margin.js');
  const { cleanSettings } = await import('../lib/styles.js');
  const page = { w: 170, h: 240, side: 20, top: 18, bottom: 14 };
  const g0 = pageGeom({ page });
  ok('الهامش المعتاد: النص ١٣ سم والهامشان ٢ سم', g0.text === 130 && g0.outer === 20 && g0.extra === 0 && !g0.on);
  const g1 = pageGeom({ page, outerMargin: { on: true } });
  ok('الواسع: النص ١١ سم، والخارجي ٤ سم، والداخلي ٢ سم', g1.text === 110 && g1.outer === 40 && g1.inner === 20 && g1.extra === 20, JSON.stringify(g1));
  ok('ويبقى للنص ٤٠ مم على الأقل', pageGeom({ page: { ...page, w: 110 }, outerMargin: { on: true, w: 90 } }).text === 40);
  ok('الفردية يمنى', pageGeom({ page, outerMargin: { on: true, odd: 'r' } }).oddRight && !pageGeom({ page, outerMargin: { on: false, odd: 'r' } }).oddRight);
  ok('تنقية الهامش الخارجي', JSON.stringify(cleanOuterMargin({ on: true, w: 500, odd: 'x', z: 1 })) === '{"on":true,"w":90}' && cleanOuterMargin({}) === null);
  const cs = cleanSettings({ outerMargin: { on: true, w: 38 }, sideNote: { box: true, rule: false } }, { partial: true });
  ok('الأسلوب يحمل الهامش الواسع وخانة الهامش', cs.outerMargin.on === true && cs.outerMargin.w === 38 && cs.sideNote.box === true, JSON.stringify(cs));
}

console.log(`\n${pass} نجح، ${fail} أخفق`);
process.exit(fail ? 1 : 0);
