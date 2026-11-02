// المحرِّر: «كتاب ورق» كما يخرج (يساراً)، ولوحة التعديل (يميناً).
//   · الكتاب يُفتح من ملفه (‎.waraq): يُصنع مرة واحدة من الكتاب الذي على المنضدة (تراث، Word، PDF)، ثم لا يُجلب من مصدره.
//   · الصفحات هي صفحات الإخراج نفسها: ينضّدها محرّك ورّاق فصلاً فصلاً بأسلوب الكتاب، وما يُعدَّل يُعاد تنضيده في الحال.
//   · المؤشر يُضيء ما تحته من الأخص إلى الأعم: الآية أو الحديث أو المتن داخل السطر، ثم البيت أو العنوان، ثم الشرح (أو المتن) كله.
//   · النقر يحدّده، والتحديد بالفأرة يحدّد كلماتٍ بعينها كما في Word؛ فيظهر نوعه في اللوحة ويُغيَّر، ويُنسَّق (المقاس، العريض، اللون).
//   · البحث والاستبدال: في الموضع، أو في الفصل، أو في الكتاب كله؛ وورقة «الخطأ والصواب» تُري ما تغيّر.
// صفحات الإخراج في إطار معزول (قد يحمل الأسلوب كوداً): الإطار يخبر بما تحت المؤشر وما حُدّد، ونحن نخبره بما يُضاء.
import { applyEdits, blockText, sigOf, runsText, sidePart, sideText, SIDE_ALTS, findRegex, sectionRange, splitVerse, opId, diffText, HEAD_LEVELS, VERSE_LAYOUTS, tableToBlocks, tableLooksVerse, UNTABLE_MODES, UNTABLE_SEPS, retypeSpan, splitRunsAt } from '/shared/edits.js';
import { composeVolume } from '/shared/compose.js';
import { runStyle } from '/shared/ustyles.js';
import { normalizeArabic, toArabicDigits, toLatinDigits } from '/shared/arabic.js';
import { loadQuranIndex, suraOf, suraName, findQuran } from '/shared/quran.js';
import { setupAssistant } from '/muharrir/assistant.js';
import { setupMutunEditor } from '/muharrir/mutun-ed.js';
import { openGate, closeGate, gateOpen, kindPill, isKind } from '/js/kind-gate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cut = (s, n = 90) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
};
const MM = 96 / 25.4;
const clone = (x) => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const shell = (() => {
  try {
    return window.top !== window ? window.top.WarraqShell || null : null;
  } catch {
    return null;
  }
})();
const desk = window.warraqDesktop || (window.top !== window && window.top.warraqDesktop) || null;
const COUNTED = {
  موضع: ['موضع واحد', 'موضعان', 'مواضع', 'موضعاً'],
  صفحة: ['صفحة واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  تعديل: ['تعديل واحد', 'تعديلان', 'تعديلات', 'تعديلاً'],
  كتاب: ['كتاب واحد', 'كتابان', 'كتب', 'كتاباً'],
  صف: ['صف واحد', 'صفان', 'صفوف', 'صفاً'],
  عمود: ['عمود واحد', 'عمودان', 'أعمدة', 'عموداً'],
  قطعة: ['قطعة واحدة', 'قطعتان', 'قطع', 'قطعة'],
  جدول: ['جدول واحد', 'جدولان', 'جداول', 'جدولاً'],
  آية: ['آية واحدة', 'آيتان', 'آيات', 'آية'],
  إحالة: ['إحالة واحدة', 'إحالتان', 'إحالات', 'إحالة'],
};
const N = (n, w) => {
  const f = COUNTED[w];
  return n === 1 ? f[0] : n === 2 ? f[1] : `${ar(n)} ${n % 100 >= 3 && n % 100 <= 10 ? f[2] : f[3]}`;
};

/* ------------------------------------------------------------------ الأنواع: اسمها ولونها */
const KIND = {
  t: { name: 'نص', cls: 'k-t' },
  sharh: { name: 'شرح', cls: 'k-t' },
  text: { name: 'نص', cls: 'k-t' },
  m: { name: 'متن', cls: 'k-m' },
  matn: { name: 'متن', cls: 'k-m' },
  q: { name: 'آية', cls: 'k-q' },
  h: { name: 'حديث', cls: 'k-h' },
  ht: { name: 'عنوان داخل السطر', cls: 'k-hd' },
  verse: { name: 'بيت', cls: 'k-v' },
  heading: { name: 'عنوان', cls: 'k-hd' },
  label: { name: 'تسمية', cls: 'k-hd' },
  image: { name: 'صورة', cls: 'k-t' },
  table: { name: 'جدول', cls: 'k-t' },
  note: { name: 'حاشية', cls: 'k-n' },
  qm: { name: 'متن مقتبس', cls: 'k-m' },
  rs: { name: 'رقم شرح', cls: 'k-m' },
  sn: { name: 'رقم شرح', cls: 'k-m' },
  f: { name: 'نص منسَّق', cls: 'k-t' },
};
const levelName = (l) => (HEAD_LEVELS.find((x) => x[0] === l) || HEAD_LEVELS[HEAD_LEVELS.length - 1])[1];
/** ألوان الإضاءة في الصفحة (تتبع ألوان الكتاب) */
const kindColor = (cls) => {
  const L = (st.info && st.info.look) || {};
  return { 'k-m': L.matnColor || '#8B1A1A', 'k-q': L.quranColor || '#1F5E3B', 'k-h': '#8A5A14', 'k-v': '#2E4A7A', 'k-hd': '#B08A3E', 'k-n': '#5B6B7F' }[cls] || '#C5A059';
};

/* ------------------------------------------------------------------ الحال */
const st = {
  info: null,
  bookId: null,
  vol: null,
  raw: new Map(), // المجلد ← ناتج المحلّل (من ملف الكتاب)
  view: null, // المجلد بعد التعديلات
  report: new Map(),
  ops: [],
  redo: [],
  sections: [], // فصول المجلد: [{ a, b, title }] (يُنضَّد الفصل الظاهر وحده)
  si: 0,
  page: { page: 0, total: 0 }, // الصفحة الظاهرة من الفصل
  sel: null,
  hov: null,
  lens: null,
  tags: true,
  find: { hits: [], i: -1 },
  quran: null,
  dismissed: new Set(),
  // الكتابة والتنسيق
  tool: 'select', // select | type
  editing: null, // ما يُكتب فيه الآن (في الصفحة)
  caret: null, // موضع المؤشر فيه
  settings: null, // إعدادات الكتاب (المقاسات والخطوط) لقيم الشريط
  fonts: null,
  painter: null, // ناسخ التنسيق
  pendingCaret: null, // المؤشر بعد إعادة التنضيد
  pendingInline: null, // عنوان أو بيت أُدرج: تُفتح خانة كتابته
  scrollY: null,
  propTab: 'char',
  pkLive: (() => {
    try {
      return localStorage.getItem('warraq.pkLive') === '1';
    } catch {
      return false;
    }
  })(),
  zoom: (() => {
    try {
      const z = localStorage.getItem('warraq.edZoom');
      return !z || z === 'fit' ? 'fit' : +z || 'fit';
    } catch {
      return 'fit';
    }
  })(),
  guides: false,
  invis: false,
};

let AI = null; // المساعد (يُنشأ في آخر الملف)
let MUED = null; // المتون: الأجزاء ومواضع التعليق (muharrir/mutun-ed.js)
let benchWin = null;
async function bench() {
  if (benchWin && benchWin.WarraqBench) return benchWin;
  if (!shell) return null;
  const w = await (shell.frameOf ? shell.frameOf('bench') : shell.win('bench'));
  benchWin = w;
  return w && w.WarraqBench ? w : null;
}
const editor = async () => {
  const w = await bench();
  return w && w.WarraqBench && w.WarraqBench.editor ? w.WarraqBench.editor : null;
};

function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}
function busy(text, sub = '', pct = null) {
  const ld = $('#loading');
  ld.hidden = !text;
  if (!text) return;
  $('#ldText').textContent = text;
  $('#ldSub').textContent = sub;
  if (pct != null) $('.ld-alif i').style.height = Math.max(8, Math.min(100, pct)) + '%';
}

/* ------------------------------------------------------------------ الكتاب: من المنضدة، ومن ملفه */
async function refresh() {
  const ed = await editor();
  const info = ed ? ed.info() : null;
  if (!info) {
    st.info = null;
    st.bookId = null;
    $('#app').hidden = true;
    $('#empty').hidden = false;
    renderEmpty();
    askKind();
    return;
  }
  if (gateOpen()) closeGate(null);
  $('#empty').hidden = true;
  $('#app').hidden = false;
  const sameBook = st.bookId === info.id;
  st.info = info;
  $('#bookName').textContent = info.title;
  const inputs = ed.renderInputs ? ed.renderInputs() : null;
  st.settings = inputs ? inputs.settings : null;
  if (MUED) await MUED.sync();
  if (!st.fonts) loadFonts();
  $('#bookFrom').textContent = info.doc ? 'كتاب ورق' + (info.file ? ' · ' + info.file.split(/[\\/]/).pop() : '') : info.from || '';
  applyLook(info.look);
  // كتابٌ لم يصر كتابَ ورق بعد: يُصنع مرة واحدة (يُجلب ويُحلَّل كله)، ثم يُفتح من ملفه
  if (!info.doc) {
    busy('يُصنع كتاب ورق…', 'يُجلب الكتاب ويُحلَّل مرة واحدة، ثم يُحرَّر من ملفه', 6);
    try {
      await ed.convert((p) => {
        if (p.parsing) busy('تُحلَّل بنيته: متن وشرح وحواشٍ وأبواب', 'كتاب ورق يُصنع مرة واحدة', 96);
        else if (p.total) busy('يُصنع كتاب ورق…', `${ar(p.done)} من ${ar(p.total)} صفحة`, (p.done / p.total) * 95);
      });
    } catch (e) {
      busy('');
      $('#frameBox').innerHTML = `<div class="sh-err"><b>تعذّر صنع كتاب ورق</b><span>${esc(e && e.message ? e.message : e)}</span><button type="button" class="btn" id="retry">أعد المحاولة</button></div>`;
      $('#retry').onclick = () => refresh();
      return;
    }
    busy('');
    return refresh();
  }
  if (!sameBook) {
    st.bookId = info.id;
    st.raw.clear();
    st.ops = (info.edits && info.edits.ops) || [];
    st.redo = [];
    st.sel = null;
    st.find = { hits: [], i: -1 };
    st.dismissed.clear();
    st.si = 0;
    const vs = $('#volSel');
    vs.hidden = info.volumes.length < 2;
    vs.innerHTML = info.volumes.map((v) => `<option value="${esc(v.vol)}">${esc(v.label || 'المجلد ' + ar(v.vol))}</option>`).join('');
    await loadVol(info.volumes[0].vol);
  } else {
    // ما تغيّر من غير هنا (أسلوب الكتاب في المنضدة، أو تعديلات من مشروعٍ استُعيد)
    const ext = (info.edits && info.edits.ops) || [];
    if (JSON.stringify(ext.map((o) => o.id)) !== JSON.stringify(st.ops.map((o) => o.id))) {
      st.ops = ext;
      st.redo = [];
    }
    rebuild();
  }
}

async function loadVol(vol) {
  if (st.editing) await flushEdit();
  if (String(vol) !== st.vol) {
    st.pmap = null;
    st.pmapKey = null;
  }
  st.vol = String(vol);
  $('#volSel').value = st.vol;
  if (!st.raw.has(st.vol)) {
    const ed = await editor();
    try {
      st.raw.set(st.vol, await ed.parse(st.vol));
    } catch (e) {
      $('#frameBox').innerHTML = `<div class="sh-err"><b>تعذّر فتح المجلد</b><span>${esc(e && e.message ? e.message : e)}</span></div>`;
      return;
    }
  }
  st.si = 0;
  st.sel = null;
  rebuild();
  syncPaper();
  syncOm();
  renderStyles();
  loadQuranIndex()
    .then((ix) => {
      st.quran = ix || null;
      renderReview();
    })
    .catch(() => {});
}

/** إعادة التعديلات على المجلد، ثم فصوله، ثم التنضيد */
function rebuild({ render = true } = {}) {
  const raw = st.raw.get(st.vol);
  if (!raw) return;
  const keepAt = st.sections[st.si] ? st.sections[st.si].a : 0;
  const r = applyEdits(raw, st.vol, { ops: st.ops });
  st.view = r.parsed;
  st.report = r.report;
  st.sections = buildSections(st.view.blocks);
  const k = st.sections.findIndex((x) => keepAt >= x.a && keepAt <= x.b);
  st.si = Math.max(0, k);
  if (st.sel && !selNode(st.sel)) st.sel = null;
  if (st.sel) st.sel = settle(st.sel);
  runFind(false);
  renderSections();
  renderSel();
  renderLog();
  renderReview();
  renderMemos();
  $('#undoBtn').disabled = !st.ops.length;
  $('#redoBtn').disabled = !st.redo.length;
  paintTools();
  if (render) renderSection();
}

/** ما يُعرض: الفصل الظاهر، أو المجلد كله («الكتاب كله») */
function curSec() {
  if (st.whole && st.view) return { a: 0, b: Math.max(0, st.view.blocks.length - 1), title: 'الكتاب كله', whole: true };
  return st.sections[st.si];
}
/** الفصول: من كل باب أو فصل (عنوان مستواه ١ أو ٢) إلى ما بعده؛ والفصل الطويل يُقسم أجزاءً */
function buildSections(bl) {
  const cuts = [];
  let start = 0;
  for (let i = 1; i < bl.length; i++) if (bl[i].type === 'heading' && (bl[i].level || 1) <= 2 && i - start >= 6) cuts.push([start, i - 1]), (start = i);
  cuts.push([start, Math.max(start, bl.length - 1)]);
  const out = [];
  for (const [a, b] of cuts) {
    if (b - a < 180) out.push([a, b]);
    else for (let x = a; x <= b; x += 150) out.push([x, Math.min(b, x + 149)]);
  }
  return out.map(([a, b], n) => {
    const h = bl.slice(a, b + 1).find((x) => x.type === 'heading');
    const first = bl.slice(a, b + 1).find((x) => blockText(x).trim());
    // جزءٌ من فصلٍ طويل: باسم عنوانه الذي قبله
    let before = null;
    if (!h || bl[a].type !== 'heading') for (let j = a - 1; j >= 0; j--) if (bl[j].type === 'heading') {
      before = bl[j];
      break;
    }
    const part = n > 0 && bl[a].type !== 'heading' && !!before;
    return { a, b, title: part ? before.text : h ? h.text : first ? cut(blockText(first), 40) : 'أول المجلد', part };
  });
}

/* ------------------------------------------------------------------ مظهر الكتاب */
function applyLook(l) {
  if (!l) return;
  const r = document.documentElement.style;
  r.setProperty('--bk-body', `'${l.body}', 'Adwa Assalaf', 'Amiri', serif`);
  r.setProperty('--bk-head', `'${l.heading || l.body}', 'Adwa Assalaf', 'Amiri', serif`);
  if (l.matnColor) r.setProperty('--bk-matn', l.matnColor);
  if (l.quranColor) r.setProperty('--bk-quran', l.quranColor);
}

/* ------------------------------------------------------------------ الأدوار: متن، شرح، عنوان */
const roleOf = (b) => {
  if (!b) return null;
  if (b.type === 'heading' || b.type === 'label') return 'head';
  if (b.type !== 'para' && b.type !== 'verse') return 'obj';
  if (b.mt) return 'matn';
  if (b.type === 'para') {
    const t = (b.runs || []).filter((r) => r.k !== 'r' && (r.s || '').trim());
    if (t.length && t.every((r) => r.k === 'm')) return 'matn';
  }
  return 'sharh';
};
const hasMatn = () => !!st.view && (st.view.layout === 'split' || st.view.blocks.some((b) => roleOf(b) === 'matn' || (b.runs || []).some((r) => r.k === 'm')));
const roleName = (role) => (role === 'matn' ? 'المتن' : hasMatn() ? 'الشرح' : 'النص');
/** المجموعة التي فيها القطعة: ما يتصل بها من دورها (بين عنوانين، وفي فصلها) */
function groupRange(i) {
  const bl = st.view.blocks;
  const sec = curSec() || { a: 0, b: bl.length - 1 };
  const role = roleOf(bl[i]);
  const same = (j) => j >= sec.a && j <= sec.b && bl[j] && (roleOf(bl[j]) === role || bl[j].type === 'rule');
  let a = i;
  let b = i;
  while (same(a - 1)) a--;
  while (same(b + 1)) b++;
  const out = [];
  for (let j = a; j <= b; j++) if (bl[j].type !== 'rule') out.push(j);
  return out;
}

/* ------------------------------------------------------------------ الموضع */
/** موضعٌ من رسالة إطار الصفحات ← t (فقرة، أو حاشية، أو هامشٌ جانبي لقطعة) */
const tOf = (m) => (m.n != null ? { vol: st.vol, n: m.n, g: m.g || 0 } : m.sd != null ? { vol: st.vol, b: m.i, sd: m.sd } : { vol: st.vol, b: m.i });
function nodeOf(t) {
  if (!st.view || !t) return null;
  if (t.sd != null) {
    // الهامش الجانبي: نصٌّ منسَّق كالحاشية
    const b = st.view.blocks[t.b];
    const v = b && b.side ? b.side[t.sd] : null;
    if (v == null) return null;
    if (typeof v === 'string') b.side[t.sd] = sidePart(v);
    return b.side[t.sd] || null;
  }
  if (t.n != null) {
    const n = st.view.notes[t.n];
    return n && n.segs ? n.segs[t.g || 0] || null : null;
  }
  return st.view.blocks[t.b] || null;
}
function selNode(sel) {
  if (sel.level === 'mc') return !!(st.mu && st.mu.doc && st.mu.doc.list && st.mu.doc.list[sel.k]);
  if (sel.level === 'mx') return !!st.view.blocks[sel.at];
  if (sel.level === 'group' || sel.level === 'multi') return sel.blocks && sel.blocks.every((i) => st.view.blocks[i]);
  return nodeOf(sel.t);
}
/** المقطع الذي فيه الموضع o من نص القطعة ← { a, z, k } */
function runAt(node, o) {
  let a = 0;
  for (const r of node.runs || []) {
    if (r.k === 'r') continue;
    const z = a + (r.s || '').length;
    if (o >= a && o < z) return { a, z, k: r.k };
    a = z;
  }
  return null;
}
/** القطعة التي فيها الحاشية (لمعرفة فصلها) */
function blockOfNote(id) {
  return st.view.blocks.findIndex((b) => (b.runs || []).some((r) => r.k === 'r' && r.id === id));
}
const sectionOf = (i) => Math.max(0, st.sections.findIndex((s) => i >= s.a && i <= s.b));

/** ما تحت المؤشر (كما أخبر به إطار الصفحات) ← تحديدٌ من الأخص إلى الأعم */
function targetOf(h) {
  if (!h || !st.view) return null;
  // موضع التعليق (المتون)
  if (h.mc != null || h.mx != null) return MUED ? MUED.target(h) : null;
  if (h.sd != null) {
    const t = { vol: st.vol, b: h.i, sd: h.sd };
    return nodeOf(t) ? { level: 'block', t } : null;
  }
  if (h.n != null) {
    const g = h.g != null ? h.g : 0;
    const seg = nodeOf({ n: h.n, g });
    if (!seg) return null;
    if (h.o != null && seg.runs) {
      const r = runAt(seg, h.o);
      if (r && /^(q|h)$/.test(r.k)) return { level: 'run', t: { vol: st.vol, n: h.n, g }, from: r.a, to: r.z, k: r.k };
    }
    return { level: 'block', t: { vol: st.vol, n: h.n, g } };
  }
  const b = st.view.blocks[h.i];
  if (!b) return null;
  if (h.o != null && b.runs) {
    const r = runAt(b, h.o);
    if (r && /^(q|h|m|ht|qm)$/.test(r.k)) return { level: 'run', t: { vol: st.vol, b: h.i }, from: r.a, to: r.z, k: r.k };
  }
  if (b.type !== 'para') return { level: 'block', t: { vol: st.vol, b: h.i } };
  return { level: 'group', role: roleOf(b), blocks: groupRange(h.i), at: h.i };
}
/** ما يُضاء في الصفحة لتحديدٍ ما */
function itemsOf(sel) {
  if (!sel) return [];
  if (sel.level === 'mc' || sel.level === 'mx') return MUED ? MUED.items(sel) : [];
  if (sel.level === 'group' || sel.level === 'multi') return sel.blocks.map((i) => ({ i }));
  const t = sel.t;
  const sd = t.sd != null ? { sd: t.sd } : {};
  if (sel.level === 'run' || sel.level === 'span') return [t.n != null ? { n: t.n, g: t.g, a: sel.from, z: sel.to } : { i: t.b, ...sd, a: sel.from, z: sel.to }];
  return [t.n != null ? { n: t.n } : { i: t.b, ...sd }];
}
const sameSel = (a, b) => a && b && a.level === b.level && JSON.stringify(a.t || a.blocks) === JSON.stringify(b.t || b.blocks) && (a.from || 0) === (b.from || 0);
/** الأعم مما حُدّد */
function widen(sel) {
  if (sel.level === 'run' || sel.level === 'span') return { level: 'block', t: sel.t };
  // الهامش ← قطعته
  if (sel.level === 'block' && sel.t.sd != null) return { level: 'block', t: { vol: st.vol, b: sel.t.b } };
  if (sel.level === 'block' && sel.t.b != null && st.view.blocks[sel.t.b].type === 'para') {
    const b = st.view.blocks[sel.t.b];
    return { level: 'group', role: roleOf(b), blocks: groupRange(sel.t.b), at: sel.t.b };
  }
  return null;
}
/** النص المحدَّد يُتتبَّع: إن تزحزح موضعه (استبدالٌ قبله) طُلب في قطعته، وإلا حُدّدت القطعة كلها */
function settle(sel) {
  if (!sel || (sel.level !== 'run' && sel.level !== 'span')) return sel;
  const node = nodeOf(sel.t);
  if (!node || (!node.runs && node.type !== 'verse')) return { level: 'block', t: sel.t };
  const txt = selTextOf(node);
  if (sel.text == null) return { ...sel, text: txt.slice(sel.from, sel.to) };
  if (txt.slice(sel.from, sel.to) === sel.text) return sel;
  let best = -1;
  for (let j = txt.indexOf(sel.text); j >= 0; j = txt.indexOf(sel.text, j + 1)) if (best < 0 || Math.abs(j - sel.from) < Math.abs(best - sel.from)) best = j;
  if (best < 0) return { level: 'block', t: sel.t };
  const r = node.runs ? runAt(node, best) : null;
  return { ...sel, from: best, to: best + sel.text.length, k: sel.level === 'run' && r ? r.k : sel.k };
}
/** نص القطعة كما يُحدَّد منه: مقاطع الفقرة، أو البيت «الصدر … العجز» */
const selTextOf = (node) => (!node ? '' : node.runs ? runsText(node.runs) : node.type === 'verse' ? (node.parts || []).join(' … ') : node.text || '');
/** الكلمات المحدَّدة من البيت: آيةٌ هي كلها؟ */
const verseQ = (node, a, z) => {
  const l0 = String((node.parts || [])[0] || '').length;
  const pa = a <= l0 ? 0 : 1;
  const x = pa ? a - l0 - 3 : a;
  const y = pa ? z - l0 - 3 : Math.min(z, l0);
  return (node.vq || []).some((q) => q[0] === pa && q[1] <= x && q[2] >= y);
};
function describe(sel) {
  if (!sel) return { name: '', cls: '' };
  if (sel.level === 'mc' || sel.level === 'mx') return (MUED && MUED.describe(sel)) || { name: 'موضع التعليق', cls: 'k-mc' };
  if (sel.level === 'group') return { name: roleName(sel.role), cls: sel.role === 'matn' ? 'k-m' : 'k-t' };
  if (sel.level === 'multi') return { name: `${ar(sel.blocks.length)} قطع`, cls: 'k-t' };
  const node = nodeOf(sel.t);
  if (!node) return { name: '', cls: '' };
  if (sel.t.sd != null) return { name: sel.level === 'span' ? 'نصٌّ محدَّد في الهامش' : sideName(sel.t), cls: 'k-sd' };
  const inNote = sel.t.n != null;
  const where = inNote ? 'في الحاشية' : roleOf(node) === 'matn' ? 'في المتن' : `في ${roleName('sharh')}`;
  if (sel.level === 'run') {
    const k = KIND[sel.k] || KIND.t;
    return { name: `${k.name} ${where}`, cls: k.cls };
  }
  if (sel.level === 'span' && node.type === 'verse') return verseQ(node, sel.from, sel.to) ? { name: 'آيةٌ في البيت', cls: 'k-q' } : { name: 'كلماتٌ من البيت', cls: 'k-t' };
  if (sel.level === 'span') return { name: `نصٌّ محدَّد ${where}`, cls: 'k-t' };
  if (node.type === 'heading') return { name: `عنوان: ${levelName(node.level)}`, cls: 'k-hd', sub: `H${node.level}` };
  if (node.type === 'verse') return { name: `بيت ${where}`, cls: 'k-v' };
  if (node.type === 'label') return { name: 'تسمية', cls: 'k-hd' };
  if (node.type === 'image') return { name: 'صورة', cls: 'k-t' };
  if (node.type === 'ornament') return { name: 'فاصل زخرفي', cls: 'k-hd' };
  if (node.type === 'hr') return { name: 'خط فاصل', cls: 'k-t' };
  if (node.type === 'pagebreak') return { name: 'فاصل صفحة', cls: 'k-t' };
  if (node.type === 'table') return { name: 'جدول', cls: 'k-t' };
  if (inNote) return { name: 'فقرة في الحاشية', cls: 'k-n' };
  const role = roleOf(node);
  return { name: role === 'matn' ? 'فقرة من المتن' : `فقرة من ${roleName('sharh')}`, cls: role === 'matn' ? 'k-m' : 'k-t' };
}
/** اسم الهامش بموضعه */
function sideName(t) {
  const b = st.view && st.view.blocks[t.b];
  if (t.sd === 'a') return (b && b.side && b.side.alt) === 'out' ? 'الهامش في الطرف الخارجي' : `الهامش المتبادل (${SIDE_ALTS[(b && b.side && b.side.alt) || 'or'] || ''})`;
  return t.sd === 'l' ? 'الهامش الأيسر' : 'الهامش الأيمن';
}
function select(sel) {
  st.sel = sel ? settle(sel) : null;
  // ناسخ التنسيق: ما يُحدَّد بعده يأخذ التنسيق
  if (st.sel && st.painter && usePainter()) return;
  markSel();
  renderSel();
  paintTools();
}

/* ------------------------------------------------------------------ الصفحات: تنضيد الفصل الظاهر */
let frame = null;
let renderTok = 0;
const send = (m, f = frame) => f && f.contentWindow && f.contentWindow.postMessage({ ed: true, ...m }, '*');
/** الكتاب مُعلَّماً: كل قطعة بموضعها، وكل مقطع بموضعه من نص قطعته (لتعرف الصفحةُ ما تحت المؤشر) */
function annotated(view) {
  const v = clone(view);
  v.blocks.forEach((b, i) => {
    b._i = i;
    if (b.runs) {
      let a = 0;
      for (const r of b.runs) {
        if (r.k === 'r') continue;
        r._o = a;
        a += (r.s || '').length;
      }
    }
  });
  for (const n of Object.values(v.notes || {}))
    for (const s of n.segs || [])
      if (s.runs) {
        let a = 0;
        for (const r of s.runs) {
          if (r.k === 'r') continue;
          r._o = a;
          a += (r.s || '').length;
        }
      }
  return v;
}
async function renderSection({ scroll = 'keep' } = {}) {
  if (scroll !== 'keep') st.keepY = false;
  const sec = curSec();
  const ed = await editor();
  if (!sec || !ed) return;
  const tok = ++renderTok;
  const inputs = ed.renderInputs();
  if (!inputs) return;
  // «الكتاب كله»: المجلد كما يخرج تماماً (بغلافه الداخلي وفهرسه وترقيمه).
  // الفصل: صفحاته وحدها، بأرقام صفحاته في الكتاب (من تنضيد المجلد كله في الخلفية)
  const settings = sec.whole ? { ...inputs.settings } : { ...inputs.settings, innerCover: false, tocPosition: 'none', printReady: false };
  const docAll = composeVolume(annotated(st.view), settings);
  let doc = docAll;
  let numStart = 0;
  if (st.mu) st.mu.doc = docAll.mutun || null;
  if (!sec.whole) {
    const first = docAll.blocks.findIndex((b) => b._i != null && b._i >= sec.a);
    let last = -1;
    docAll.blocks.forEach((b, j) => b._i != null && b._i <= sec.b && (last = j));
    // المتون: الأجزاء التي في الفصل كاملةً بمواضع تعليقها
    const blocks = docAll.mutun && MUED ? MUED.slice(docAll, sec) : first < 0 || last < first ? [] : docAll.blocks.slice(first, last + 1);
    if (blocks[0]) delete blocks[0].breakBefore;
    doc = { ...docAll, blocks, headings: [] };
    numStart = numStartOf(sec);
  }
  $('#frameBox').classList.add('busy');
  let html;
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-warraq': '1' },
      body: JSON.stringify({ doc, settings, cover: inputs.cover, origin: location.origin, editor: true, ...(numStart > 1 ? { numStart } : {}), ...(inputs.userStyle ? { userStyle: inputs.userStyle } : {}) }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    html = j.html;
    st.renderedNumStart = numStart;
  } catch (e) {
    if (tok === renderTok) toast('تعذّر تنضيد الصفحات: ' + e.message, 5000);
    $('#frameBox').classList.remove('busy');
    return;
  }
  if (tok !== renderTok) return;
  const f = document.createElement('iframe');
  f.className = 'ed-frame pending';
  f.title = 'صفحات الكتاب';
  f.setAttribute('sandbox', 'allow-scripts'); // معزول: كود الأسلوب (إن وُجد) لا يصل إلى البرنامج
  f.srcdoc = html;
  f.__pw = (settings.page && settings.page.w ? settings.page.w : 170) * MM;
  const ready = new Promise((res) => {
    const on = (e) => {
      if (e.source !== f.contentWindow || !e.data || !e.data.ed || e.data.type !== 'ready') return;
      window.removeEventListener('message', on);
      res(e.data);
    };
    window.addEventListener('message', on);
    setTimeout(() => res(null), 60000);
  });
  $('#frameBox').appendChild(f);
  sizeFrame(f);
  const info = await ready;
  if (tok !== renderTok) return void f.remove();
  // الإطار الجديد مكان القديم، والصفحة نفسها في النظر
  const prevPage = st.page.page;
  for (const old of $$('#frameBox .ed-frame')) if (old !== f) old.remove();
  $('#frameBox .sh-err')?.remove();
  frame = f;
  f.classList.remove('pending');
  $('#frameBox').classList.remove('busy');
  if (info && info.pageW) f.__pw = info.pageW;
  sizeFrame(f);
  st.page = { page: 0, total: (info && info.pages) || 0 };
  st.pnums = (info && info.pnums) || null;
  st.poems = (info && info.poems) || {};
  if (sec.whole && info && info.pmap) {
    st.pmap = info.pmap;
    st.pmapKey = await numKey();
  } else scheduleNumbering();
  st.editing = null;
  send({ type: 'tool', tool: st.tool });
  send({ type: 'view', guides: st.guides, invis: st.invis });
  sendTags();
  sendLens();
  markSel();
  markHits();
  if (scroll === 'sel' && st.sel) scrollToSel();
  else if (scroll === 'top') send({ type: 'scroll', page: 0 });
  else if (scroll === 'hit') scrollToHit();
  else if (scroll === 'keepBlock') send({ type: 'scroll', i: st.wholeFrom || 0 });
  else if (scroll === 'keep') {
    // يبقى الموضع نفسه في النظر (لا تقفز الصفحة بعد كل تعديل)
    if (st.scrollY != null && st.keepY) send({ type: 'scrollTo', y: st.scrollY });
    else send({ type: 'scroll', page: Math.min(prevPage, Math.max(0, st.page.total - 1)) });
  }
  st.keepY = true;
  if (st.pendingCaret) {
    sendCaret(st.pendingCaret);
    st.pendingCaret = null;
  }
  if (st.pendingCell) {
    send({ type: 'cellTo', ...st.pendingCell });
    st.pendingCell = null;
  }
  if (st.pendingInline != null) {
    const i = st.pendingInline;
    st.pendingInline = null;
    openInlineFor(i);
  }
  renderPageInfo();
  paintTools();
  if (MUED) MUED.renderCard();
  // قياس القصائد وصل مع الصفحات: يُحدَّث جامع أنماط الشعر
  if (st.sel && st.sel.t && st.sel.t.b != null && (nodeOf(st.sel.t) || {}).type === 'verse') renderSel();
}
/* ---- أرقام الصفحات: أرقام الكتاب نفسه ---- */
// يُنضَّد المجلد كله في الخلفية (بعد سكونٍ قصير) ليُعرف في أي صفحة من الكتاب تبدأ كل قطعة،
// فيُرقَّم الفصل الظاهر بأرقامه الحقيقية لا من الواحد.
let numT = 0;
let numTok = 0;
async function numKey() {
  const ed = await editor();
  const inputs = ed && ed.renderInputs ? ed.renderInputs() : null;
  const last = st.ops[st.ops.length - 1];
  return [st.vol, st.ops.length, last ? last.id : '', inputs ? JSON.stringify(inputs.settings).length : 0, inputs ? JSON.stringify(inputs.cover || {}).length : 0].join('|');
}
function numStartOf(sec) {
  if (!st.pmap || !sec) return 0;
  for (let i = sec.a; i <= sec.b; i++) if (st.pmap[i] != null) return st.pmap[i];
  return 0;
}
function scheduleNumbering() {
  clearTimeout(numT);
  numT = setTimeout(runNumbering, 1400);
}
async function runNumbering() {
  if (st.whole || !st.view) return;
  const key = await numKey();
  if (key === st.pmapKey) return;
  const ed = await editor();
  const inputs = ed && ed.renderInputs();
  if (!inputs) return;
  const tok = ++numTok;
  const doc = composeVolume(annotated(st.view), inputs.settings);
  let html;
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-warraq': '1' },
      body: JSON.stringify({ doc, settings: inputs.settings, cover: inputs.cover, origin: location.origin, editor: true, ...(inputs.userStyle ? { userStyle: inputs.userStyle } : {}) }),
    });
    if (!r.ok) return;
    html = (await r.json()).html;
  } catch {
    return;
  }
  if (tok !== numTok) return;
  for (const old of $$('iframe.num-frame')) old.remove();
  const f = document.createElement('iframe');
  f.className = 'num-frame';
  f.setAttribute('aria-hidden', 'true');
  f.setAttribute('sandbox', 'allow-scripts');
  f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1000px;height:700px;visibility:hidden;border:0;pointer-events:none';
  const done = new Promise((res) => {
    const on = (e) => {
      if (e.source !== f.contentWindow || !e.data || !e.data.ed || e.data.type !== 'ready') return;
      window.removeEventListener('message', on);
      res(e.data);
    };
    window.addEventListener('message', on);
    setTimeout(() => res(null), 120000);
  });
  f.srcdoc = html;
  document.body.appendChild(f);
  const info = await done;
  f.remove();
  if (tok !== numTok || !info || !info.pmap) return;
  st.pmap = info.pmap;
  st.pmapKey = key;
  // الفصل الظاهر بأرقامه الحقيقية (إن لم يكن يكتب الآن)
  const ns = numStartOf(curSec());
  if (ns && ns !== st.renderedNumStart && !st.editing && !st.whole) renderSection({ scroll: 'keep' });
}

/** الإطار يُكبَّر ليملأ عرض مكانه: الصفحة وهامشاها (لعلامات الهامش ورقم الصفحة) */
function sizeFrame(f = frame) {
  if (!f) return;
  const box = $('#frameBox');
  const W = (f.__pw || 640) + 2 * 120;
  const fitK = Math.max(0.35, Math.min(1.5, box.clientWidth / W));
  // التكبير: «ملاءمة العرض»، أو نسبةٌ من حجم الصفحة الحقيقي (فيُمرَّر أفقياً إن زاد)
  const k = st.zoom === 'fit' || !st.zoom ? fitK : Math.max(0.3, Math.min(3, st.zoom));
  f.__k = k;
  f.style.width = box.clientWidth / k + 'px';
  f.style.height = box.clientHeight / k + 'px';
  f.style.transform = `scale(${k})`;
  const zl = $('#zoomVal');
  if (zl) zl.textContent = ar(Math.round(k * 100)) + '٪';
}
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
function setZoom(z) {
  const cur = frame && frame.__k ? frame.__k : 1;
  if (z === 'in') z = ZOOMS.find((x) => x > cur + 0.01) || 2;
  else if (z === 'out') z = [...ZOOMS].reverse().find((x) => x < cur - 0.01) || 0.5;
  st.zoom = z;
  try {
    localStorage.setItem('warraq.edZoom', String(z));
  } catch {}
  sizeFrame();
  send({ type: 'refit' });
}
new ResizeObserver(() => sizeFrame()).observe($('#frameBox'));

function sendTags() {
  const sec = curSec();
  if (!sec || !frame) return;
  const map = {};
  const rn = { matn: roleName('matn'), sharh: roleName('sharh') };
  for (let i = sec.a; i <= sec.b; i++) {
    const b = st.view.blocks[i];
    const role = roleOf(b);
    const t = {};
    if (b.type === 'heading') Object.assign(t, { tag: levelName(b.level), color: kindColor('k-hd') });
    else if (b.type === 'verse') Object.assign(t, { tag: 'بيت', color: kindColor('k-v') });
    else if (b.type === 'image') Object.assign(t, { tag: 'صورة', color: '#8a7a66' });
    else if (b.type === 'ornament' || b.type === 'hr') Object.assign(t, { tag: 'فاصل', color: '#8a7a66' });
    else if (b.type === 'table') Object.assign(t, { tag: 'جدول', color: '#8a7a66' });
    else if (b.type === 'para' && (b.runs || []).some((r) => r.k === 'q')) Object.assign(t, { tag: 'آية', color: kindColor('k-q') });
    if (role === 'matn' || role === 'sharh') Object.assign(t, { role, roleName: rn[role], roleColor: role === 'matn' ? kindColor('k-m') : '#b9ab95' });
    t.color = t.color || '#8a7a66';
    if (b.memo && b.memo.text) t.memo = b.memo.text;
    map[i] = t;
  }
  if (MUED) MUED.tags(map);
  send({ type: 'tags', on: st.tags, map });
}
function markSel() {
  send({ type: 'mark', layer: 'sel', items: itemsOf(st.sel), color: kindColor(describe(st.sel).cls) });
  sendRuler();
}
/** المسطرة فوق الفقرة المحدَّدة (أو التي يُكتب فيها) */
function sendRuler() {
  let i = null;
  if (st.editing && st.editing.sd != null) i = null;
  else if (st.editing && st.editing.i != null) i = st.editing.i;
  else if (st.sel && st.sel.t && st.sel.t.sd != null) i = null;
  else if (st.sel && st.sel.t && st.sel.t.b != null) i = st.sel.t.b;
  else if (st.sel && st.sel.level === 'group' && st.sel.at != null) i = st.sel.at;
  const node = i != null && st.view ? st.view.blocks[i] : null;
  send({ type: 'ruler', i: node && node.type === 'para' && st.ruler !== false ? i : null });
}
function markHov() {
  send({ type: 'mark', layer: 'hov', items: itemsOf(st.hov), color: kindColor(describe(st.hov).cls) });
}
function scrollToSel() {
  const it = itemsOf(st.sel)[0];
  if (it) send({ type: 'scroll', ...(it.i != null ? { i: it.i } : { n: it.n }), smooth: true });
}
/** الانتقال إلى فصل القطعة i (يُنضَّد إن لم يكن الظاهر) */
async function goBlock(i, how = 'sel') {
  const k = sectionOf(i);
  if (!st.whole && k !== st.si) {
    st.si = k;
    renderSections();
    await renderSection({ scroll: how });
  } else if (how === 'sel') scrollToSel();
  else if (how === 'hit') scrollToHit();
}

/* ---- رسائل الإطار ---- */
window.addEventListener('message', (e) => {
  if (!frame || e.source !== frame.contentWindow || !e.data || !e.data.ed) return;
  const m = e.data;
  if (m.type === 'hover' || m.type === 'move' || m.type === 'leave') return onHover(m);
  if (m.type === 'commit') return onCommit(m);
  if (m.type === 'rulerSet') return rulerSet(m);
  if (m.type === 'sideBox') return sideMoved(m);
  if (m.type === 'mlabel') return MUED && MUED.labelMoved(m);
  if (m.type === 'mintro') return MUED && MUED.introMoved(m);
  if (m.type === 'editing') {
    st.editing = m.on ? { i: m.i, sd: m.sd, n: m.n, g: m.g } : null;
    sendRuler();
    if (m.on && st.sel) {
      st.sel = null;
      markSel();
      renderSel();
    }
    return paintTools();
  }
  if (m.type === 'caret') {
    st.caret = m;
    clearTimeout(paintTools.t);
    paintTools.t = setTimeout(paintTools, 60);
    return;
  }
  if (m.type === 'scrollY') {
    st.scrollY = m.y;
    return;
  }
  if (m.type === 'inlineReq') return openInlineFor(m.i);
  if (m.type === 'notePoint') return finishToNote(m);
  if (m.type === 'ctx') return openCtx(m);
  if (m.type === 'pasteImg') return pasteImage(m);
  if (m.type === 'memoOpen') return openMemo(m.i);
  if (m.type === 'cellOn') {
    st.cell = { r: m.r, c: m.c };
    select({ level: 'block', t: { vol: st.vol, b: m.i } });
    return;
  }
  if (m.type === 'cell') {
    const t = { vol: st.vol, b: m.i };
    const node = nodeOf(t);
    if (!node || node.type !== 'table') return;
    const old = ((node.rows[m.r] || {}).cells || [])[m.c];
    st.sel = { level: 'block', t };
    if (m.next) st.pendingCell = { i: m.i, ...m.next };
    return commit({ op: 'cell', t, sig: sigOf(node), r: m.r, c: m.c, set: { t: m.text } }, { kind: 'parts', old: cut((old && old.t) || '—', 30), new: cut(m.text || '—', 30), typed: true }, { quiet: true });
  }
  if (m.type === 'zoom') return setZoom(m.d > 0 ? 'in' : 'out');
  if (m.type === 'inlineDone') return inlineDone(m);
  if (m.type === 'imgset') {
    const t = { vol: st.vol, b: m.i };
    const node = nodeOf(t);
    if (!node || node.type !== 'image') return;
    st.sel = { level: 'block', t };
    return commit({ op: 'img', t, sig: sigOf(node), set: m.set }, { kind: 'style', to: m.set.wPct ? `العرض ${ar(m.set.wPct)}٪` : 'نُقلت الصورة', text: node.cap || 'صورة' });
  }
  if (m.type === 'click') {
    if (m.hit && m.hit.r != null) st.cell = { r: m.hit.r, c: m.hit.c };
    let sel = targetOf(m.hit);
    if (!sel) return;
    // النقر على المحدَّد نفسه: المجموعة تضيق إلى فقرتها، وغيرها يتّسع إلى ما يحويه
    if (st.sel && sameSel(st.sel, sel)) {
      if (sel.level === 'group' && sel.at != null) sel = { level: 'block', t: { vol: st.vol, b: sel.at } };
      else sel = widen(st.sel) || sel;
    }
    return select(sel);
  }
  if (m.type === 'select') {
    if (m.multi) {
      const blocks = [];
      for (let i = m.multi[0]; i <= m.multi[1]; i++) if (st.view.blocks[i] && st.view.blocks[i].type !== 'rule') blocks.push(i);
      return select({ level: 'multi', blocks });
    }
    const t = tOf(m.at);
    const node = nodeOf(t);
    if (!node) return;
    if (!node.runs && node.type !== 'verse') return select({ level: 'block', t });
    const txt = selTextOf(node);
    let a = Math.max(0, m.a);
    let z = Math.min(txt.length, m.z);
    while (a < z && /\s/.test(txt[a])) a++;
    while (z > a && /\s/.test(txt[z - 1])) z--;
    if (z <= a) return;
    if (a === 0 && z === txt.length) return select({ level: 'block', t });
    return select({ level: 'span', t, from: a, to: z });
  }
  if (m.type === 'page') {
    st.page = { page: m.page, total: m.total };
    renderPageInfo();
  }
  if (m.type === 'key') onKey({ key: m.key, ctrlKey: m.ctrl, metaKey: false, shiftKey: m.shift, altKey: m.alt, preventDefault() {}, target: document.body, fromFrame: true });
});
async function rulerSet(m) {
  {
    // ما يُكتب في الفقرة يُحفظ أولاً
    const f = st.editing ? await flushEdit() : null;
    const t = { vol: st.vol, b: m.i };
    const node = nodeOf(t);
    if (!node) return;
    const ps = { ...m.ps };
    // السطر الأول بقيمة الأسلوب: لا يُحفظ
    if ('ind' in ps && st.settings && Math.abs(ps.ind - (st.settings.indentMm || 0)) < 0.26) ps.ind = null;
    for (const k of ['is', 'ie']) if (k in ps && !ps[k]) ps[k] = null;
    if (f) st.pendingCaret = { t: f.t, o: f.from, o2: f.to };
    return commit({ op: 'pstyle', t, sig: sigOf(node), ps }, { kind: 'style', to: 'ind' in m.ps ? 'السطر الأول' : 'is' in m.ps ? 'البعد من اليمين' : 'البعد من اليسار', text: textOf(node) });
  }
}
/** خانة كتابة فوق العنوان أو البيت في الصفحة */
function openInlineFor(i) {
  const node = st.view && st.view.blocks[i];
  if (!node) return;
  const values = node.type === 'verse' ? [node.parts[0] || '', node.parts[1] || ''] : node.type === 'heading' || node.type === 'label' ? [node.text || ''] : null;
  if (!values) return;
  select({ level: 'block', t: { vol: st.vol, b: i } });
  send({ type: 'inline', i, values });
}
function inlineDone(m) {
  const t = { vol: st.vol, b: m.i };
  const node = nodeOf(t);
  if (!node) return;
  const v = (m.values || []).map((x) => String(x || '').trim());
  if (node.type === 'verse') {
    if (v.join('|') === node.parts.join('|')) return;
    return commit({ op: 'edit', t, sig: sigOf(node), parts: [v[0] || '', v[1] || ''] }, { kind: 'parts', old: node.parts.join(' … '), new: v.join(' … ') });
  }
  if (!v[0] || v[0] === node.text) return;
  commit({ op: 'edit', t, sig: sigOf(node), ch: [{ a: 0, z: (node.text || '').length, s: v[0] }] }, { kind: 'parts', old: node.text, new: v[0] });
}
function onHover(m) {
  const tip = $('#tip');
  if (m.type === 'leave') {
    st.hov = null;
    markHov();
    tip.hidden = true;
    return;
  }
  if (m.type === 'hover') {
    st.hov = targetOf(m.hit);
    // أداة الكتابة: لا يُضاء إلا ما ليس نصاً (صورة)
    if (st.tool === 'type' && st.hov && !(st.hov.level === 'block' && st.hov.t.b != null && /image/.test((nodeOf(st.hov.t) || {}).type || ''))) st.hov = null;
    markHov();
    const d = describe(st.hov);
    if (!d.name) return void (tip.hidden = true);
    tip.innerHTML = `<i class="dot ${d.cls}"></i>${esc(d.name)}${d.sub ? ` <small>${d.sub}</small>` : ''}`;
    tip.hidden = false;
  }
  if (tip.hidden) return;
  const r = frame.getBoundingClientRect();
  const pane = $('#pagePane').getBoundingClientRect();
  const k = frame.__k || 1;
  const x = r.left + m.x * k - pane.left;
  const y = r.top + m.y * k - pane.top;
  tip.style.left = Math.min(pane.width - tip.offsetWidth - 8, Math.max(8, x + 14)) + 'px';
  tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
}

/* ---- الفصول والصفحات ---- */
function renderSections() {
  const sel = $('#secSel');
  // «الكتاب كله»: المجلد بصفحاته كما يخرج (بغلافه وفهرسه)، ثم الفصول
  sel.innerHTML = `<option value="w">◆ الكتاب كله</option><optgroup label="الفصول">${st.sections.map((s, i) => `<option value="${i}">${esc(cut(s.title, 60))}${s.part ? ' (تتمة)' : ''}</option>`).join('')}</optgroup>`;
  sel.value = st.whole ? 'w' : String(st.si);
  $('#secPrev').disabled = st.whole || st.si === 0;
  $('#secNext').disabled = st.whole || st.si >= st.sections.length - 1;
  drawStrip();
}
function renderPageInfo() {
  const p = st.page;
  // رقم الصفحة في الكتاب نفسه
  const n = (st.pnums && st.pnums[p.page]) || p.page + 1;
  $('#pgInfo').textContent = !p.total ? '' : st.whole ? `صفحة ${ar(n)} · ${ar(p.total)} صفحة في المجلد` : `صفحة ${ar(n)} · الفصل ${ar(st.si + 1)} من ${ar(st.sections.length)}`;
}
async function goSection(i) {
  if (i === 'w') {
    if (st.whole) return;
    if (st.editing) await flushEdit();
    st.wholeFrom = st.sections[st.si] ? st.sections[st.si].a : 0;
    st.whole = true;
    renderSections();
    return renderSection({ scroll: 'keepBlock' });
  }
  if (i < 0 || i >= st.sections.length || (i === st.si && !st.whole)) return;
  if (st.editing) await flushEdit();
  st.whole = false;
  st.si = i;
  renderSections();
  renderSection({ scroll: 'top' });
}
$('#secSel').addEventListener('change', (e) => goSection(e.target.value === 'w' ? 'w' : +e.target.value));
$('#secPrev').addEventListener('click', () => goSection(st.si - 1));
$('#secNext').addEventListener('click', () => goSection(st.si + 1));

/* ------------------------------------------------------------------ اللوحة: المحدَّد */
const chip = (attrs, label, on, key) => `<button type="button" class="kc${on ? ' on' : ''}" ${attrs} aria-pressed="${!!on}">${label}${key ? `<kbd>${ar(key)}</kbd>` : ''}</button>`;
function renderSel() {
  const box = $('#selCard');
  const sel = st.sel;
  if (!sel || !st.view) {
    if (AI) AI.sync();
    box.innerHTML = `<div class="sc-hint"><b>حدّد نصاً في الصفحة</b><span>مرّر المؤشر فوق الصفحة: يُضيء ما تحته من الأخص (آية، حديث، بيت) إلى الأعم (الشرح أو المتن كله)، وبطاقةٌ صغيرة تسمّيه.</span><span>انقر لتحديده، وانقر مرة أخرى ليضيق إلى الفقرة أو يتّسع إلى ما يحويها؛ أو حدّد بالفأرة كلماتٍ بعينها كما في Word.</span></div>`;
    return;
  }
  // موضع التعليق: بطاقته
  if (sel.level === 'mx') {
    box.innerHTML = MUED ? MUED.mxCard(sel) : '';
    if (AI) AI.sync();
    return;
  }
  if (sel.level === 'mc') {
    box.innerHTML = MUED ? MUED.mcCard(sel) : '';
    if (MUED) MUED.renderCard();
    if (AI) AI.sync();
    return;
  }
  // الهامش الجانبي: يُكتب فيه في موضعه، ويُنسَّق من الشريط، وموضعه في «الخصائص ← الهامش»
  if (sel.t && sel.t.sd != null) {
    const d0 = describe(sel);
    const sn = nodeOf(sel.t);
    const tx = sn ? (sel.level === 'span' ? sideText(sn).slice(sel.from, sel.to) : sideText(sn)) : '';
    box.innerHTML = `<div class="sc-head"><span class="badge k-sd"><i class="dot k-sd"></i>${esc(d0.name)}</span>
      <nav class="crumbs"><button type="button" data-act="sideOwner">القطعة</button><i>›</i><button type="button" aria-current="true">الهامش</button></nav>
      <button type="button" class="x" data-act="clear" title="إلغاء التحديد (Esc)" aria-label="إلغاء التحديد">✕</button></div>
      ${tx ? `<blockquote class="sc-text k-sd">${esc(cut(tx, 220))}</blockquote>` : ''}
      <div class="sc-sec"><div class="bacts"><button type="button" class="btn sm" data-act="sideWrite">اكتب فيه</button></div>
      <p class="sc-note">انقر الهامش نقرةً واحدة (بأي أداة) فاكتب فيه كما تكتب في الصفحة، وEnter سطرٌ جديد فيه. ونسّقه من شريط التنسيق: الخط ومقاسه ولونه والعريض والمحاذاة. وحين تمرّ عليه تظهر مقابضه: اسحب المقبض أعلاه لتنقله (إلى الهامش الآخر، أو بإزاء فقرةٍ أخرى)، وحافته الداخلية لعرضه، وأسفله لارتفاعه؛ وحدوده بالمليمتر في «الخصائص ← الهامش».</p></div>`;
    if (AI) AI.sync();
    return;
  }
  const d = describe(sel);
  const node = sel.level === 'group' || sel.level === 'multi' ? null : nodeOf(sel.t);
  const text =
    sel.level === 'group' || sel.level === 'multi'
      ? sel.blocks.map((i) => blockText(st.view.blocks[i])).join(' ')
      : sel.level === 'run' || sel.level === 'span'
        ? selTextOf(node).slice(sel.from, sel.to)
        : blockText(node);
  // المسار: من الأعم إلى الأخص، وكل حلقة تُحدَّد بنقرة
  const crumbs = [];
  if (sel.level === 'group' && sel.at != null) crumbs.push(['grp', roleName(sel.role)], ['at', 'الفقرة التي نقرتها']);
  else if (sel.t && sel.t.b != null) {
    if (node.type === 'para') crumbs.push(['grp', roleName(roleOf(node))]);
    crumbs.push(['blk', node.type === 'heading' ? 'العنوان' : node.type === 'verse' ? 'البيت' : node.type === 'image' ? 'الصورة' : 'الفقرة']);
    if (sel.level === 'run' || sel.level === 'span') crumbs.push(['in', sel.level === 'run' ? (KIND[sel.k] || KIND.t).name : 'المحدَّد']);
  } else if (sel.t && sel.t.n != null) {
    crumbs.push(['blk', 'الحاشية']);
    if (sel.level === 'run' || sel.level === 'span') crumbs.push(['in', sel.level === 'run' ? (KIND[sel.k] || KIND.t).name : 'المحدَّد']);
  }
  let html = `<div class="sc-head"><span class="badge ${d.cls}"><i class="dot ${d.cls}"></i>${esc(d.name)}${d.sub ? ` <small>${d.sub}</small>` : ''}</span>
    ${crumbs.length > 1 ? `<nav class="crumbs" aria-label="من الأعم إلى الأخص">${crumbs.map(([k, n], i) => `<button type="button" data-crumb="${k}" ${(sel.level === 'group' ? i === 0 : i === crumbs.length - 1) ? 'aria-current="true"' : ''}>${esc(n)}</button>`).join('<i>›</i>')}</nav>` : ''}
    <button type="button" class="x" data-act="clear" title="إلغاء التحديد (Esc)" aria-label="إلغاء التحديد">✕</button></div>
    ${text ? `<blockquote class="sc-text ${d.cls}">${esc(cut(text, 220))}</blockquote>` : ''}`;
  // المتون: أجزاء المتن أول ما يُختار للمحدَّد
  if (MUED) html += MUED.selSection(sel);
  if ((sel.level === 'run' || sel.level === 'span') && node.type === 'verse') {
    // كلماتٌ من البيت: آيةٌ أو نص (قصائد تُضمَّن كلماتٍ من آية)، وتصحيحها في موضعها
    const isQ = verseQ(node, sel.from, sel.to);
    html += `<div class="sc-sec"><h4>اجعله</h4><div class="kinds">${chip(`data-kind="t" class="${KIND.t.cls}"`, 'نص', !isQ, 1)}${chip(`data-kind="q" class="${KIND.q.cls}"`, 'آية', isQ, 2)}</div><p class="sc-note">الآية في البيت بلون الآيات وخطها، والبيت على وزنه وكشيدته.</p></div>`;
    html += `<div class="sc-sec"><h4>صحّح النص</h4><div class="fix"><input type="text" id="fixIn" dir="auto" value="${esc(text)}"><button type="button" class="btn sm" data-act="fix">صحّح</button></div><p class="sc-note">يُستبدل في هذا الموضع من البيت وحده.</p></div>`;
  } else if (sel.level === 'run' || sel.level === 'span') {
    const cur = sel.level === 'run' ? sel.k : null;
    const inNote = sel.t.n != null;
    const kinds = [['t', 'نص'], ...(inNote ? [] : [['m', 'متن']]), ['q', 'آية'], ['h', 'حديث'], ...(inNote ? [] : [['ht', 'عنوان داخل السطر']])];
    html += `<div class="sc-sec"><h4>اجعله</h4><div class="kinds">${kinds.map(([k, n], i) => chip(`data-kind="${k}" class="${KIND[k].cls}"`, n, k === cur, i + 1)).join('')}${inNote ? '' : chip('data-act="toNote" class="k-n" title="يُنقل المحدَّد إلى حاشية: ثم انقر الكلمة التي تُعلَّق عليها"', 'حاشية…', false)}</div></div>`;
    if (sel.level === 'span') html += `<div class="sc-sec"><h4>أو اجعل الفقرة كلها</h4><div class="kinds">${blockKinds(node, sel.t).map(([k, n]) => chip(`data-bkind="${k}"`, n, false)).join('')}</div></div>`;
    html += `<div class="sc-sec"><h4>صحّح النص</h4><div class="fix"><input type="text" id="fixIn" dir="auto" value="${esc(text)}"><button type="button" class="btn sm" data-act="fix">صحّح</button></div><p class="sc-note">يُستبدل في هذا الموضع وحده. ولتصحيحه في الكتاب كله استعمل البحث في الأعلى.</p></div>`;
  } else if (sel.level === 'block') {
    if (node.type === 'image') html += `<p class="sc-note">الالتفاف والعرض والموضع والشرح في «الخصائص» أدناه؛ واسحب زاوية الصورة في الصفحة لتغيّر مقاسها${node.wrap === 'behind' || node.wrap === 'front' ? '، أو اسحبها لتنقلها' : ''}.</p>`;
    else if (node.type === 'table') html += untableHtml(node);
    else if (node.type !== 'table' && !/^(hr|ornament|pagebreak)$/.test(node.type)) {
      const cur = node.type === 'heading' ? 'heading' : node.type === 'verse' ? 'verse' : roleOf(node) === 'matn' ? 'matn' : 'text';
      html += `<div class="sc-sec"><h4>اجعله</h4><div class="kinds">${blockKinds(node, sel.t).map(([k, n], i) => chip(`data-bkind="${k}" class="${(KIND[k] || KIND.t).cls}"`, n, k === cur, i + 1)).join('')}${sel.t.b != null && /^(para|verse)$/.test(node.type) ? chip('data-act="toNote" class="k-n" title="تُنقل القطعة إلى حاشية: ثم انقر الكلمة التي تُعلَّق عليها"', 'حاشية…', false) : ''}</div></div>`;
      if (node.type === 'heading') html += levelsHtml(node.level);
      if (node.type === 'verse') html += verseOpts(node, sel.t.n != null);
    }
  } else {
    const ks = [['text', roleName('sharh')], ['matn', 'متن']];
    html += `<div class="sc-sec"><h4>اجعلها كلها</h4><div class="kinds">${ks.map(([k, n], i) => chip(`data-gkind="${k}"`, n, sel.role === k || (sel.role === 'sharh' && k === 'text'), i + 1)).join('')}${chip('data-act="toNote" class="k-n" title="تُنقل كلها إلى حاشيةٍ واحدة: ثم انقر الكلمة التي تُعلَّق عليها"', 'حاشية…', false)}</div><p class="sc-note">${N(sel.blocks.length, 'موضع')}${sel.level === 'group' ? '؛ وانقر مرة أخرى لتحديد الفقرة وحدها' : ''}</p></div>`;
  }
  if (st.quran && (sel.k === 'q' || (node && node.runs && sel.level !== 'block' && /﴿/.test(text)))) {
    const su = suraOf(text.replace(/[﴿﴾]/g, ''), st.quran);
    if (su) html += `<p class="sc-quran"><i class="dot k-q"></i>من سورة ${esc(suraName(su))}</p>`;
  }
  html += `<div id="similar"></div>`;
  box.innerHTML = html;
  similarHint(sel, text);
  if (MUED) MUED.renderCard();
  if (AI) AI.sync();
}
/** التنسيق: مقاس الخط (نسبةً إلى مقاس الكتاب)، والعريض، واللون — لما حُدّد بعينه */
function styleHtml(node, sel) {
  const from = sel.level === 'block' ? 0 : sel.from;
  const to = sel.level === 'block' ? runsText(node.runs).length : sel.to;
  // التنسيق الحالي: ما يجمع المقاطع المحدَّدة
  let a = 0;
  const sts = [];
  for (const r of node.runs || []) {
    if (r.k === 'r') continue;
    const z = a + (r.s || '').length;
    if (z > from && a < to) sts.push(r.st || {});
    a = z;
  }
  const size = sts.length && sts.every((x) => (x.size || 1) === (sts[0].size || 1)) ? sts[0].size || 1 : 1;
  const bold = sts.length && sts.every((x) => x.bold);
  const color = sts.length && sts.every((x) => x.color === sts[0].color) ? sts[0].color || '' : '';
  const L = (st.info && st.info.look) || {};
  const colors = [['', 'لون النص'], [L.matnColor || '#8B1A1A', 'لون المتن'], [L.quranColor || '#1F5E3B', 'لون الآيات'], ['#6B1D2F', 'عنّابي'], ['#8A6727', 'ذهبي'], ['#22385E', 'لازوردي']];
  return `<div class="sc-sec fmt"><h4>التنسيق</h4><div class="fmt-row">
    <span class="fsz" role="group" aria-label="مقاس الخط"><button type="button" data-fs="-1" title="أصغر">ﺃ<small>−</small></button><b>${ar(Math.round(size * 100))}٪</b><button type="button" data-fs="1" title="أكبر">ﺃ<small>+</small></button></span>
    <button type="button" class="fb${bold ? ' on' : ''}" data-fb aria-pressed="${!!bold}" title="عريض">ع</button>
    <span class="fcol" role="group" aria-label="اللون">${colors.map(([c, n]) => `<button type="button" data-fc="${c}" title="${n}" class="${(color || '') === c ? 'on' : ''}" style="--c:${c || 'var(--page-ink)'}"></button>`).join('')}</span>
    ${sts.some((x) => Object.keys(x).length) ? '<button type="button" class="tl quiet" data-fx title="أزل التنسيق">بلا تنسيق</button>' : ''}
  </div></div>`;
}
function blockKinds(node, t) {
  if (t.n != null) return node.type === 'verse' ? [['text', 'نص'], ['verse', 'بيت']] : [['text', 'نص'], ['q', 'آية'], ['h', 'حديث'], ['verse', 'بيت']];
  return [['text', roleName('sharh')], ['matn', 'متن'], ['q', 'آية'], ['h', 'حديث'], ['verse', 'بيت'], ['heading', 'عنوان']];
}
function levelsHtml(level) {
  return `<div class="sc-sec"><h4>مستوى العنوان</h4><div class="levels">${HEAD_LEVELS.map(
    ([l, n, h]) => `<button type="button" class="lv l${l}${l === level ? ' on' : ''}" data-level="${l}" aria-pressed="${l === level}"><b>${n}</b><small>${h}${l === 4 ? ' · تنبيه' : ''}</small></button>`,
  ).join('')}</div></div>`;
}
/* ---- جامع أنماط الشعر: نمط القصيدة، وقيمه (فراغ الوسط والبادئة)، ونمط فقرتها، والكشيدة، لها أو لكل قصائد المجلد ---- */
const POEM_PATS = [
  ['line', 'موازي'],
  ['stack', 'سلّمي'],
  ['center', 'وسط'],
  ['khams', 'تخميس'],
  ['tri', 'ثلاثي'],
];
const patIcon = (k) =>
  ({
    line: '<i class="pat"><b class="r" style="top:3px"></b><b class="l" style="top:3px"></b><b class="r" style="top:10px"></b><b class="l" style="top:10px"></b><b class="r" style="top:17px"></b><b class="l" style="top:17px"></b></i>',
    stack: '<i class="pat"><b class="r" style="top:2px"></b><b class="l" style="top:7px"></b><b class="r" style="top:12px"></b><b class="l" style="top:17px"></b></i>',
    stagger: '<i class="pat"><b class="r2" style="top:2px"></b><b class="l2" style="top:7px"></b><b class="r2" style="top:12px"></b><b class="l2" style="top:17px"></b></i>',
    center: '<i class="pat"><b class="c" style="top:2px"></b><b class="c" style="top:7px"></b><b class="c" style="top:12px"></b><b class="c" style="top:17px"></b></i>',
    // خمسة أشطر: زوجان متقابلان، والخامس في الوسط
    khams: '<i class="pat"><b class="r" style="top:1px"></b><b class="l" style="top:1px"></b><b class="r" style="top:7px"></b><b class="l" style="top:7px"></b><b class="c" style="top:14px"></b></i>',
    // ثلاثة أشطر: شطران متقابلان، والثالث في الوسط تحتهما
    tri: '<i class="pat"><b class="r" style="top:5px"></b><b class="l" style="top:5px"></b><b class="c" style="top:13px"></b></i>',
  })[k] || '';
/** القصيدة التي فيها البيت i: [أولها، آخرها] */
function poemRange(i) {
  const bl = st.view.blocks;
  let a = i;
  let b = i;
  while (a > 0 && bl[a - 1].type === 'verse') a--;
  while (b < bl.length - 1 && bl[b + 1].type === 'verse') b++;
  return [a, b];
}
function poemDraft(i) {
  const node = st.view.blocks[i];
  const [a] = poemRange(i);
  if (!st.pd || st.pd.a !== a || st.pd.vol !== st.vol) {
    st.pd = { a, vol: st.vol, vl: node.vl || '', vg: node.vg != null ? +node.vg : null, vi: node.vi != null ? +node.vi : null, vk: node.vk || '', pst: (node.ps && node.ps.pst) || '', custom: node.vg != null || node.vi != null };
  }
  return st.pd;
}
function verseOpts(node, inNote) {
  const look = (st.info && st.info.look) || {};
  const parts = `<div class="sc-sec"><h4>الشطران</h4><div class="parts"><label><span>الأول</span><input type="text" data-part="0" dir="auto" value="${esc(node.parts[0])}"></label><label><span>الثاني</span><input type="text" data-part="1" dir="auto" value="${esc(node.parts[1] || '')}"></label></div></div>`;
  if (inNote) return parts;
  const i = st.sel.t.b;
  const d = poemDraft(i);
  const [a, b] = poemRange(i);
  const vl = d.vl || look.verseLayout || 'line';
  // القياس (من الصفحة المنضَّدة)
  let meas = null;
  for (let k = a; k <= b && !meas; k++) meas = st.poems && st.poems[k];
  const hs = st.view.blocks.slice(a, b + 1).reduce((n, x) => n + (x.parts || []).filter((p) => String(p || '').trim()).length, 0);
  const grpN = vl === 'tri' ? 3 : vl === 'khams' ? 5 : 0;
  const lines = grpN ? Math.floor(hs / grpN) * (grpN === 3 ? 2 : 3) + (hs % grpN ? Math.ceil((hs % grpN) / 2) : 0) : b - a + 1;
  const status = [
    `<span>${ar(lines)} سطر${grpN ? ` · ${ar(hs)} شطراً` : ''}${grpN ? (hs % grpN ? ` — المجموعة الأخيرة ناقصة: ${ar(hs % grpN)} من ${ar(grpN)}` : ' — المجموعات كاملة') : ''}</span>`,
    d.vk === 'off' ? '<span class="off">الكشيدة الآلية معطّلة</span>' : meas ? `<span class="ok">✓ الكشيدة: ${ar(meas.kashida || 0)} شطراً مُدّ · عرض الشطر ${ar(fmt1(meas.widthMm))} مم${meas.scale < 1 ? ` · صُغّر الخط ${ar(Math.round(meas.scale * 100))}٪` : ''}</span>` : '',
  ].filter(Boolean);
  const U = ustyles();
  const pstyles = Object.entries(U).filter(([, x]) => x.kind === 'p');
  const val = (k, v) => `<div class="pv"><span>${k === 'vg' ? 'فراغ الوسط' : 'البادئة'}</span><button type="button" data-pv="${k}" data-d="-0.5" ${d.custom ? '' : 'disabled'}>−</button><input type="number" step="0.5" data-pvi="${k}" value="${v == null ? '' : v}" placeholder="${k === 'vg' ? (meas ? fmt1(meas.gapMm) : '—') : '0'}" ${d.custom ? '' : 'disabled'}><button type="button" data-pv="${k}" data-d="0.5" ${d.custom ? '' : 'disabled'}>+</button><small>مم</small></div>`;
  return `${parts}
    <div class="sc-sec poemkit">
      <div class="pk-title">جامع أنماط الشعر <small>للقصيدة كلها (${ar(b - a + 1)} بيت)</small></div>
      <fieldset><legend>نمط الشعر</legend>
        <div class="vpats">${POEM_PATS.map(([k, n]) => `<button type="button" data-pat="${k}" aria-pressed="${(d.vl || '') === k || (!d.vl && false)}" class="${vl === k || (k === 'stack' && vl === 'stagger') ? 'cur' : ''}">${patIcon(k === 'stack' && vl === 'stagger' ? 'stagger' : k)}<span>${n}</span></button>`).join('')}</div>
        <div class="pk-row"><button type="button" class="tl${!d.vl ? ' on' : ''}" data-pat="">نمط الأسلوب${look.verseLayout ? ` (${esc(VERSE_LAYOUTS[look.verseLayout] || '')})` : ''}</button>${vl === 'stack' || vl === 'stagger' ? `<label class="chk"><input type="checkbox" data-stag ${vl === 'stagger' ? 'checked' : ''}><span>متداخل</span></label>` : ''}</div>
        ${vl === 'line' || vl === 'tri' || vl === 'khams' ? `<div class="vseps"><span>بين الشطرين</span>${[['', 'كالأسلوب'], ['none', 'لا شيء'], ['one', look.verseSepSymbol || '✽'], ['three', '✽ ✽ ✽']].map(([k, n]) => `<button type="button" data-vs="${k}" class="${(node.vs || '') === k ? 'on' : ''}" aria-pressed="${(node.vs || '') === k}">${esc(n)}</button>`).join('')}</div>` : ''}
      </fieldset>
      <fieldset><legend>القيم</legend>
        ${val('vg', d.vg)}${val('vi', d.vi)}
        <div class="pk-row"><label class="rad"><input type="radio" name="pkm" data-pkm="def" ${d.custom ? '' : 'checked'}><span>افتراضي</span></label><label class="rad"><input type="radio" name="pkm" data-pkm="custom" ${d.custom ? 'checked' : ''}><span>تعديل القيم</span></label><button type="button" class="btn sm" data-pk="pick" title="خذ القيم كما هي الآن في الصفحة (فراغ الوسط المحسوب)">التقاط</button></div>
      </fieldset>
      <fieldset><legend>نمط الفقرة</legend>
        <div class="pk-row"><select data-pkst><option value="">شعر (نمط الكتاب)</option>${pstyles.map(([sid, x]) => `<option value="${esc(sid)}" ${d.pst === sid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button type="button" class="ib sm" data-pk="nopst" title="نمط الكتاب">↺</button></div>
      </fieldset>
      <button type="button" class="btn pk-all" data-pk="all" title="هذا النمط وقيمه ونمط فقرته لكل قصائد المجلد">التنسيق المتكامل ◀</button>
      <div class="pk-row pk-acts"><button type="button" class="btn sm pri" data-pk="apply">تطبيق</button><button type="button" class="btn sm${d.vk !== 'off' ? ' on' : ''}" data-pk="kash" title="مدّ الأشطر بالكشيدة حتى تتساوى">الكشيدة الآلية</button><button type="button" class="ib sm${d.vk === 'off' ? ' on' : ''}" data-pk="nokash" title="بلا كشيدة">⊘</button></div>
      <div class="pk-row"><label class="chk"><input type="checkbox" data-pklive ${st.pkLive ? 'checked' : ''}><span>تنسيق فوري</span></label><button type="button" class="btn sm" data-pk="reset">إعادة تعيين</button><button type="button" class="ib sm" data-pk="undo" title="رجوع (Ctrl+Z)"><svg><use href="#i-undo"/></svg></button></div>
      <div class="pk-status">${status.join('')}</div>
    </div>`;
}
/** ما في الجامع ← عملية (للقصيدة، أو لكل قصائد المجلد) */
function poemOp(all) {
  const i = st.sel.t.b;
  const node = st.view.blocks[i];
  const d = poemDraft(i);
  const o = { op: 'verse', vl: d.vl || null, vg: d.custom && d.vg != null ? d.vg : null, vi: d.custom && d.vi != null && d.vi !== 0 ? d.vi : null, vk: d.vk || null, pst: d.pst || null };
  return all ? { ...o, all: true, vol: st.vol } : { ...o, t: st.sel.t, sig: sigOf(node) };
}
function applyPoem(all, label) {
  const i = st.sel.t.b;
  const node = st.view.blocks[i];
  const d = poemDraft(i);
  const name = d.vl ? VERSE_LAYOUTS[d.vl] : 'نمط الأسلوب';
  commit(poemOp(all), { kind: 'style', to: label || `نمط الشعر: ${name}${all ? ' (كل القصائد)' : ''}`, text: (node.parts || []).join(' … '), ...(all ? { all: true } : {}) });
}
function poemChanged() {
  if (st.pkLive) applyPoem(false);
  else renderSel();
}
function poemAct(el, ev) {
  const sel = st.sel;
  if (!sel || !sel.t || sel.t.b == null) return false;
  const node = nodeOf(sel.t);
  if (!node || node.type !== 'verse') return false;
  const d = poemDraft(sel.t.b);
  const ds = el.dataset;
  if (ds.pat !== undefined) {
    d.vl = ds.pat;
    poemChanged();
    return true;
  }
  if (ds.pv) {
    const k = ds.pv;
    const base = d[k] != null ? d[k] : k === 'vg' ? ((st.poems && Object.values(st.poems)[0]) || {}).gapMm || 7 : 0;
    d[k] = Math.round((base + +ds.d) * 2) / 2;
    d.custom = true;
    poemChanged();
    return true;
  }
  const a = ds.pk;
  if (!a) return false;
  if (a === 'pick') {
    const [x, y] = poemRange(sel.t.b);
    let m = null;
    for (let k = x; k <= y && !m; k++) m = st.poems && st.poems[k];
    if (m) d.vg = m.gapMm;
    d.vi = node.vi != null ? +node.vi : 0;
    d.custom = true;
    toast(m ? `التُقط فراغ الوسط: ${ar(fmt1(m.gapMm))} مم` : 'لم تُقَس القصيدة بعد');
    poemChanged();
  } else if (a === 'apply') applyPoem(false);
  else if (a === 'all') applyPoem(true);
  else if (a === 'kash') {
    d.vk = '';
    applyPoem(false, 'الكشيدة الآلية');
  } else if (a === 'nokash') {
    d.vk = 'off';
    applyPoem(false, 'بلا كشيدة');
  } else if (a === 'reset') {
    st.pd = { ...d, vl: '', vg: null, vi: null, vk: '', pst: '', custom: false };
    commit({ op: 'verse', t: sel.t, sig: sigOf(node), vl: null, vs: null, vg: null, vi: null, vk: null, pst: null }, { kind: 'style', to: 'أُعيد تعيين القصيدة', text: node.parts.join(' … ') });
  } else if (a === 'undo') undo();
  else if (a === 'nopst') {
    d.pst = '';
    poemChanged();
  }
  return true;
}
$('#selCard').addEventListener('change', (e) => {
  const t = e.target;
  if (!st.sel || !st.sel.t || st.sel.t.b == null || !st.pd) return;
  const d = st.pd;
  if (t.dataset.pvi) {
    const v = t.value.trim() === '' ? null : parseFloat(t.value);
    d[t.dataset.pvi] = Number.isFinite(v) ? v : null;
    d.custom = true;
    return poemChanged();
  }
  if (t.dataset.pkm) {
    d.custom = t.dataset.pkm === 'custom';
    return poemChanged();
  }
  if (t.dataset.pkst !== undefined) {
    d.pst = t.value;
    return poemChanged();
  }
  if (t.dataset.pklive !== undefined) {
    st.pkLive = t.checked;
    try {
      localStorage.setItem('warraq.pkLive', t.checked ? '1' : '');
    } catch {}
  }
  if (t.dataset.stag !== undefined) {
    d.vl = t.checked ? 'stagger' : 'stack';
    return poemChanged();
  }
});

/* ---- اقتراح: النص نفسه في مواضع أخرى بنوع آخر ---- */
function similarHint(sel, text) {
  const box = $('#similar');
  if (!box || !st.view) return;
  const t = String(text || '').replace(/[﴿﴾«»]/g, '').trim();
  if (t.length < 6 || t.length > 200 || sel.level === 'group' || sel.level === 'multi') return;
  const node = nodeOf(sel.t);
  if (sel.level === 'block' && node.type === 'heading') {
    const key = normalizeArabic(t);
    const others = st.view.blocks.filter((b) => b.type === 'para' && normalizeArabic(blockText(b)) === key);
    if (others.length) box.innerHTML = `<div class="sim"><span>وفي المجلد ${N(others.length, 'موضع')} آخر بهذا النص ليس عنواناً.</span><button type="button" class="btn sm" data-sim="heading">اجعلها عناوين مثله</button></div>`;
    return;
  }
  if (sel.level !== 'run') return;
  const re = findRegex(t, { marks: true });
  let n = 0;
  for (const b of [...st.view.blocks, ...Object.values(st.view.notes).flatMap((x) => x.segs || [])]) {
    if (b.type !== 'para' && b.type !== 'p') continue;
    let a = 0;
    const kinds = b.runs.map((r) => {
      const s = r.k === 'r' ? '' : r.s;
      const o = [a, a + s.length, r.k];
      a += s.length;
      return o;
    });
    const full = runsText(b.runs);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(full))) {
      const inside = kinds.filter(([x, y]) => y > m.index && x < m.index + m[0].length);
      if (!inside.every(([, , k]) => k === sel.k)) n++;
    }
  }
  if (n) box.innerHTML = `<div class="sim"><span>وهذا النص نفسه في ${N(n, 'موضع')} آخر من المجلد ليس «${esc((KIND[sel.k] || KIND.t).name)}».</span><button type="button" class="btn sm" data-sim="${sel.k}">اجعلها كلها ${esc((KIND[sel.k] || KIND.t).name)}</button></div>`;
}

/* ---- أوامر اللوحة ---- */
$('#selCard').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !st.sel) return;
  const sel = st.sel;
  if (b.dataset.act === 'clear') return select(null);
  if (b.dataset.act === 'sideOwner' && sel.t) return select({ level: 'block', t: { vol: st.vol, b: sel.t.b } });
  if (b.dataset.act === 'sideWrite' && sel.t && sel.t.sd != null) {
    setTool('type');
    return sendCaret({ t: sel.t, o: 0 });
  }
  if (MUED && MUED.selClick(b)) return;
  if (b.dataset.crumb) {
    if (b.dataset.crumb === 'at') return select({ level: 'block', t: { vol: st.vol, b: sel.at } });
    if (b.dataset.crumb === 'grp' && sel.level === 'group') return;
    if (b.dataset.crumb === 'grp') return select(widen({ level: 'block', t: sel.t }));
    if (b.dataset.crumb === 'blk') return select({ level: 'block', t: sel.t });
    return;
  }
  if (b.dataset.act === 'fix') return fixText();
  if (b.dataset.act === 'toNote') return startToNote();
  if (b.dataset.ut !== undefined || b.dataset.act === 'untable' || b.dataset.act === 'untableAll') return untableAct(b);
  if (b.dataset.act === 'cap') return setCaption();
  if (b.dataset.kind) return setKind(b.dataset.kind);
  if (b.dataset.bkind) return b.dataset.bkind === 'heading' ? setBlockKind('heading', { level: 3 }) : setBlockKind(b.dataset.bkind);
  if (b.dataset.gkind) return setGroupKind(b.dataset.gkind);
  if (b.dataset.level) return setBlockKind('heading', { level: +b.dataset.level });
  if ((b.dataset.pat !== undefined || b.dataset.pv || b.dataset.pk) && poemAct(b)) return;
  if (b.dataset.vl !== undefined) return verseStyle({ vl: b.dataset.vl });
  if (b.dataset.vs !== undefined) return verseStyle({ vs: b.dataset.vs });
  if (b.dataset.sim) return applySimilar(b.dataset.sim);
  if (b.dataset.fs) return setStyle('size', +b.dataset.fs);
  if (b.dataset.fb !== undefined) return setStyle('bold');
  if (b.dataset.fc !== undefined) return setStyle('color', b.dataset.fc);
  if (b.dataset.fx !== undefined) return setStyle('clear');
});
$('#selCard').addEventListener('change', (e) => {
  if (e.target.closest('[data-utk]')) return untableAct(e.target.closest('[data-utk]'));
  const inp = e.target.closest('[data-part]');
  if (!inp || !st.sel) return;
  const node = nodeOf(st.sel.t);
  const parts = [...node.parts];
  parts[+inp.dataset.part] = inp.value;
  commit({ op: 'verse', t: st.sel.t, sig: sigOf(node), parts }, { kind: 'parts', old: node.parts.join(' … '), new: parts.join(' … ') });
});
$('#selCard').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'fixIn') fixText();
});

function setKind(kind) {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  if (!node) return;
  if (node.type === 'verse') {
    const text = selTextOf(node).slice(sel.from, sel.to);
    if (verseQ(node, sel.from, sel.to) === (kind === 'q')) return;
    const len0 = selTextOf(node).length;
    commit({ op: 'kind', t: sel.t, sig: sigOf(node), from: sel.from, to: sel.to, kind: kind === 'q' ? 'q' : 't' }, { kind: 'kind', from: kind === 'q' ? 'نص' : 'آية', to: kind === 'q' ? 'آية' : 'نص', text });
    // قوسا الآية أُضيفا إلى الشطر (أو رُفعا منه): المحدَّد يشملهما
    const nv = nodeOf(sel.t);
    const len1 = nv ? selTextOf(nv).length : len0;
    const to = Math.max(sel.from, Math.min(len1, sel.to + (len1 - len0)));
    st.sel = { level: 'span', t: sel.t, from: sel.from, to, text: nv ? selTextOf(nv).slice(sel.from, to) : text };
    markSel();
    renderSel();
    return;
  }
  const old = sel.level === 'run' ? sel.k : 't';
  if (old === kind) return;
  const text = runsText(node.runs).slice(sel.from, sel.to);
  commit({ op: 'kind', t: sel.t, sig: sigOf(node), from: sel.from, to: sel.to, kind, ...(kind === 'ht' ? { level: 3 } : {}) }, { kind: 'kind', from: KIND[old] ? KIND[old].name : 'نص', to: KIND[kind].name, text });
  // يبقى المحدَّد محدَّداً بنوعه الجديد
  const nn = nodeOf(sel.t);
  if (nn && nn.runs) {
    const key = normalizeArabic(text);
    let a = 0;
    let found = null;
    for (const r of nn.runs) {
      const s = r.k === 'r' ? '' : r.s;
      if (!found && r.k === kind && normalizeArabic(s) === key) found = { level: 'run', t: sel.t, from: a, to: a + s.length, k: kind, text: s };
      a += s.length;
    }
    st.sel = found || { level: 'block', t: sel.t };
  }
  markSel();
  renderSel();
}
function setBlockKind(kind, extra = {}) {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  if (!node) return;
  const fromD = describe({ level: 'block', t: sel.t }).name;
  const op = { op: 'kind', t: sel.t, sig: sigOf(node), kind, ...extra };
  if (kind === 'verse' && node.type !== 'verse') op.parts = splitVerse(node.type === 'heading' ? node.text : runsText(node.runs || []));
  st.sel = { level: 'block', t: sel.t };
  commit(op, { kind: 'kind', from: fromD, to: kind === 'heading' ? `عنوان: ${levelName(extra.level || 3)}` : (KIND[kind] || KIND.t).name, text: blockText(node) });
}
function setGroupKind(kind) {
  const sel = st.sel;
  const ops = sel.blocks
    .map((i) => ({ b: st.view.blocks[i], i }))
    .filter(({ b }) => b && (b.type === 'para' || b.type === 'verse'))
    .map(({ b, i }) => ({ op: 'kind', t: { vol: st.vol, b: i }, sig: sigOf(b), kind }));
  if (!ops.length) return;
  st.sel = null;
  commit({ op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: roleName(sel.role), to: kind === 'matn' ? 'متن' : roleName('sharh'), text: blockText(st.view.blocks[sel.blocks[0]]), count: ops.length });
}
function verseStyle(p) {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  if (!node || node.type !== 'verse') return;
  const op = { op: 'verse', t: sel.t, sig: sigOf(node) };
  if (p.vl !== undefined) op.vl = p.vl;
  if (p.vs !== undefined) op.vs = p.vs;
  const nm = p.vl !== undefined ? (p.vl ? VERSE_LAYOUTS[p.vl] : 'كأسلوب الكتاب') : p.vs === 'one' ? 'فاصل ✽' : p.vs === 'three' ? 'فاصل ✽ ✽ ✽' : p.vs === 'none' ? 'بلا فاصل' : 'فاصل الأسلوب';
  commit(op, { kind: 'style', to: nm, text: node.parts.join(' … ') });
}
/** تنسيق ما حُدّد: size (+١ أو −١ خطوة)، bold، color، clear */
function setStyle(what, v) {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  if (!node || !node.runs) return;
  const from = sel.level === 'block' ? 0 : sel.from;
  const to = sel.level === 'block' ? runsText(node.runs).length : sel.to;
  let a = 0;
  let cur = {};
  for (const r of node.runs) {
    if (r.k === 'r') continue;
    const z = a + (r.s || '').length;
    if (z > from && a < to) {
      cur = r.st || {};
      break;
    }
    a = z;
  }
  const STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2, 2.5];
  let stp;
  let label;
  if (what === 'size') {
    const i = STEPS.findIndex((x) => x >= (cur.size || 1) - 0.001);
    const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, (i < 0 ? 3 : i) + v))];
    stp = { size: next };
    label = `المقاس ${ar(Math.round(next * 100))}٪`;
  } else if (what === 'bold') {
    stp = { bold: cur.bold ? null : true };
    label = cur.bold ? 'بلا عريض' : 'عريض';
  } else if (what === 'color') {
    stp = { color: v || null };
    label = v ? 'لون' : 'لون النص';
  } else {
    stp = { size: null, bold: null, color: null };
    label = 'بلا تنسيق';
  }
  commit({ op: 'style', t: sel.t, sig: sigOf(node), from, to, st: stp }, { kind: 'style', to: label, text: runsText(node.runs).slice(from, to) });
}
function setCaption() {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  const v = ($('#capIn') || {}).value || '';
  if (!node || v === (node.cap || '')) return;
  commit({ op: 'cap', t: sel.t, sig: sigOf(node), cap: v.trim() }, { kind: 'parts', old: node.cap || '—', new: v.trim() || '—' });
}
function fixText() {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  const inp = $('#fixIn');
  if (!node || !inp) return;
  const old = selTextOf(node).slice(sel.from, sel.to);
  const repl = inp.value;
  if (!repl.trim() || repl === old) return;
  st.sel = { level: 'span', t: sel.t, from: sel.from, to: sel.from + repl.length, text: repl };
  commit({ op: 'text', scope: 'one', t: sel.t, sig: sigOf(node), at: sel.from, find: old, repl }, { kind: 'text', old, new: repl, scope: 'one' });
}
function applySimilar(kind) {
  const sel = st.sel;
  const node = nodeOf(sel.t);
  if (kind === 'heading') commit({ op: 'kindText', scope: 'vol', vol: st.vol, block: true, text: node.text, kind: 'heading', level: node.level }, { kind: 'kind', to: `عنوان: ${levelName(node.level)}`, text: node.text, all: true });
  else {
    const text = runsText(node.runs).slice(sel.from, sel.to).replace(/[﴿﴾«»]/g, '').trim();
    commit({ op: 'kindText', scope: 'vol', vol: st.vol, text, kind }, { kind: 'kind', to: KIND[kind].name, text, all: true });
  }
}

/* ------------------------------------------------------------------ العمليات: الحفظ، والرجوع، والإعادة */
async function save() {
  const ed = await editor();
  if (ed) ed.setEdits({ v: 1, ops: st.ops });
}
function commit(op, note, opts = {}) {
  op.id = opId();
  op.ts = Date.now(); // وقت التعديل (at موضعٌ في النص لبعض العمليات)
  if (!op.vol && op.t) op.vol = op.t.vol;
  op.note = note || null;
  if (op.t && op.t.b != null) op.b = op.t.b;
  else if (op.t && op.t.n != null) op.b = blockOfNote(op.t.n);
  st.ops.push(op);
  st.redo = [];
  rebuild({ render: opts.render !== false });
  save();
  const r = st.report.get(op.id);
  if (r && r.missed) toast('تعذّر تطبيقه في هذا الموضع');
  // ما يُكتب في الصفحة لا يُعلَن في ورقة (يُرى في الصفحة نفسها، وفي جدول الخطأ والصواب)
  if (!opts.quiet) showSlip(op, r);
}
async function undo() {
  // ما يُكتب الآن يُحفظ أولاً، فيكون الرجوعُ رجوعاً عنه
  if (st.editing) await flushEdit();
  const op = st.ops.pop();
  if (!op) return;
  st.redo.push(op);
  rebuild();
  save();
  slipUndone(op);
}
async function redo() {
  if (st.editing) await flushEdit();
  const op = st.redo.pop();
  if (!op) return;
  st.ops.push(op);
  rebuild();
  save();
  showSlip(op, st.report.get(op.id));
}
function removeOp(id) {
  const i = st.ops.findIndex((o) => o.id === id);
  if (i < 0) return;
  const [op] = st.ops.splice(i, 1);
  st.redo = [];
  rebuild();
  save();
  slipUndone(op);
}
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);

/* ---- ورقة التصويب: ما تغيّر، وسهمٌ من الخطأ إلى الصواب ---- */
const ARROW = '<svg class="arw" aria-hidden="true"><use href="#i-arrow"/></svg>';
function slipBody(op, r) {
  const nt = op.note || {};
  const scope = op.op === 'text' ? (op.scope === 'one' ? 'في هذا الموضع' : op.scope === 'section' ? 'في الفصل' : 'في الكتاب كله') : nt.all ? 'في المجلد' : '';
  const count = r && r.n > 1 ? N(r.n, 'موضع') : r && r.n === 1 && op.scope !== 'one' ? 'موضع واحد' : '';
  if (op.op === 'text' || nt.kind === 'parts')
    return `<b class="sl-h">صُوِّب</b><div class="sl-row"><s class="old">${esc(cut(nt.old || op.find, 40))}</s>${ARROW}<ins class="new">${esc(cut(nt.new != null ? nt.new : op.repl, 40))}</ins></div><small>${[count, scope].filter(Boolean).join(' · ')}</small>`;
  return `<b class="sl-h">${nt.kind === 'style' ? 'تغيّر شكله' : 'تغيّر نوعه'}</b><div class="sl-row">${nt.from ? `<span class="tb">${esc(nt.from)}</span>${ARROW}` : ''}<span class="tb new">${esc(nt.to || '')}</span></div><small>${esc(cut(nt.text || '', 60))}${count && nt.all ? ' · ' + count : ''}</small>`;
}
function showSlip(op, r) {
  const s = $('#slip');
  s.innerHTML = `${slipBody(op, r)}<button type="button" class="btn sm" data-undo>تراجع <kbd>Ctrl+Z</kbd></button>`;
  s.hidden = false;
  s.classList.remove('out');
  void s.offsetWidth;
  s.classList.add('in');
  clearTimeout(showSlip.t);
  showSlip.t = setTimeout(hideSlip, 6500);
}
function slipUndone(op) {
  const s = $('#slip');
  s.innerHTML = `<b class="sl-h">رُجع عنه</b><small>${esc(cut((op.note && (op.note.text || op.note.old)) || op.find || '', 60))}</small>`;
  s.hidden = false;
  s.classList.remove('out');
  s.classList.add('in');
  clearTimeout(showSlip.t);
  showSlip.t = setTimeout(hideSlip, 2600);
}
function hideSlip() {
  const s = $('#slip');
  if (s.matches(':hover')) return void (showSlip.t = setTimeout(hideSlip, 1500));
  s.classList.add('out');
  setTimeout(() => (s.hidden = true), 260);
}
$('#slip').addEventListener('click', (e) => {
  if (e.target.closest('[data-undo]')) undo();
});

/* ---- جدول الخطأ والصواب: كل ما غُيّر ---- */
function renderLog() {
  const box = $('#logCard');
  const ops = st.ops;
  if (!ops.length) {
    box.innerHTML = `<h3>جدول الخطأ والصواب</h3><p class="lg-empty">ما تغيّره هنا يُكتب في هذا الجدول، ويُحفظ في ملف الكتاب، ويدخل إخراجه.</p>`;
    return;
  }
  const rows = ops
    .slice()
    .reverse()
    .map((op) => {
      const r = st.report.get(op.id);
      const nt = op.note || {};
      const other = op.vol && String(op.vol) !== st.vol && op.scope !== 'book';
      const missed = r && r.missed;
      let what;
      if (op.op === 'text' || nt.kind === 'parts') what = `${nt.ai ? '<i class="lg-ai" title="من المساعد">✦</i>' : ''}<s>${esc(cut(nt.old || op.find, 28))}</s>${ARROW}<ins>${esc(cut(nt.new != null ? nt.new : op.repl, 28))}</ins>`;
      else what = `${nt.from ? `<span class="tb">${esc(nt.from)}</span>${ARROW}` : ''}<span class="tb new">${esc(nt.to || '')}</span><em>${esc(cut(nt.text || '', 34))}</em>`;
      const sec = op.b != null && op.b >= 0 && !other ? st.sections[sectionOf(op.b)] : null;
      const where = op.op === 'text' && op.scope !== 'one' ? (op.scope === 'book' ? 'الكتاب' : 'الفصل') : nt.all ? 'المجلد' : sec ? cut(sec.title, 26) : '';
      return `<li class="${missed ? 'missed' : ''}${other ? ' other' : ''}" data-op="${op.id}">
        <button type="button" class="lg-go" data-go="${op.id}" title="${missed ? 'لم يُعثر على موضعه بعد تغيّر الكتاب' : 'اذهب إلى موضعه'}"><span class="lg-what">${what}</span><span class="lg-where">${missed ? 'لم يُعثر على موضعه' : esc(where)}${r && r.n > 1 ? ` · ${N(r.n, 'موضع')}` : ''}</span></button>
        <button type="button" class="lg-x" data-rm="${op.id}" title="ألغِ هذا التعديل" aria-label="ألغِ هذا التعديل">✕</button></li>`;
    })
    .join('');
  box.innerHTML = `<h3>جدول الخطأ والصواب <small>${N(ops.length, 'تعديل')}</small></h3><ol class="lg">${rows}</ol>`;
}
$('#logCard').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm) return removeOp(rm.dataset.rm);
  const go = e.target.closest('[data-go]');
  if (!go) return;
  const op = st.ops.find((o) => o.id === go.dataset.go);
  if (!op) return;
  if (op.vol && String(op.vol) !== st.vol && op.scope !== 'book') return loadVol(op.vol);
  if (op.b != null && op.b >= 0 && st.view.blocks[op.b]) {
    st.sel = { level: 'block', t: { vol: st.vol, b: op.b } };
    renderSel();
    goBlock(op.b, 'sel');
  }
});

/* ------------------------------------------------------------------ البحث والاستبدال */
const fOpts = () => ({ word: $('#fWord').checked, marks: $('#fMarks').checked, ...($('#fRe').checked ? { re: true } : {}) });
/** كل المواضع في المجلد: [{ t, a, z, b (القطعة، أو قطعة الحاشية)، text }] */
function runFind(jump = true) {
  const q = $('#fFind').value;
  st.find.hits = [];
  if (!q || !st.view) {
    st.find.i = -1;
    paintFind();
    return;
  }
  const re = findRegex(q, fOpts());
  const seen = new Set();
  const scan = (node, t, b) => {
    const txt = node.type === 'para' || node.type === 'p' ? runsText(node.runs) : blockText(node);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(txt))) {
      st.find.hits.push({ t, a: m.index, z: m.index + m[0].length, b, text: m[0], para: node.type === 'para' || node.type === 'p' });
      if (!m[0].length) re.lastIndex++;
    }
  };
  st.view.blocks.forEach((b, i) => {
    scan(b, { vol: st.vol, b: i }, i);
    for (const r of b.runs || [])
      if (r.k === 'r' && st.view.notes[r.id] && !seen.has(r.id)) {
        seen.add(r.id);
        st.view.notes[r.id].segs.forEach((s, g) => scan(s, { vol: st.vol, n: r.id, g }, i));
      }
  });
  if (jump) {
    const sec = curSec();
    const k = sec ? st.find.hits.findIndex((h) => h.b >= sec.a) : 0;
    st.find.i = st.find.hits.length ? (k < 0 ? 0 : k) : -1;
  } else st.find.i = Math.min(st.find.i, st.find.hits.length - 1);
  paintFind();
}
function paintFind() {
  const n = st.find.hits.length;
  const q = $('#fFind').value;
  $('#fCount').textContent = !q ? '' : n ? `${ar(st.find.i + 1)} من ${ar(n)}` : 'لا شيء';
  $('#fCount').classList.toggle('none', !!q && !n);
  const cur = st.find.hits[st.find.i];
  const repl = $('#fRepl').value;
  const can = !!q && n > 0 && repl !== q;
  $('[data-rep="one"]').disabled = !can || !cur;
  let sec = 0;
  if (cur) {
    const [a, b] = sectionRange(st.view.blocks, cur.b);
    sec = st.find.hits.filter((h) => h.b >= a && h.b <= b).length;
  }
  $('[data-rep="section"]').disabled = !can || !sec;
  $('[data-rep="book"]').disabled = !can;
  $('[data-n="section"]').textContent = sec ? `(${ar(sec)})` : '';
  $('[data-n="book"]').textContent = n ? `(${ar(n)}${st.info && st.info.volumes.length > 1 ? '+' : ''})` : '';
  markHits();
  drawStrip();
}
function markHits() {
  const sec = curSec();
  if (!sec) return;
  const items = [];
  let cur = [];
  st.find.hits.forEach((h, k) => {
    if (h.b < sec.a || h.b > sec.b || !h.para) return;
    const it = h.t.n != null ? { n: h.t.n, g: h.t.g, a: h.a, z: h.z } : { i: h.t.b, a: h.a, z: h.z };
    if (k === st.find.i) cur = [it];
    else items.push(it);
  });
  send({ type: 'mark', layer: 'hit', items });
  send({ type: 'mark', layer: 'cur', items: cur });
}
function scrollToHit() {
  const h = st.find.hits[st.find.i];
  if (h) send({ type: 'scroll', ...(h.t.n != null ? { n: h.t.n } : { i: h.t.b }), smooth: true });
}
function stepFind(d) {
  const n = st.find.hits.length;
  if (!n) return;
  st.find.i = (st.find.i + d + n) % n;
  paintFind();
  goBlock(st.find.hits[st.find.i].b, 'hit');
}
let fT = null;
$('#fFind').addEventListener('input', () => {
  clearTimeout(fT);
  fT = setTimeout(() => {
    runFind(true);
    const h = st.find.hits[st.find.i];
    if (h) goBlock(h.b, 'hit');
  }, 160);
});
$('#fRepl').addEventListener('input', paintFind);
$('#fWord').addEventListener('change', () => runFind(true));
$('#fMarks').addEventListener('change', () => runFind(true));
$('#fRe').addEventListener('change', () => runFind(true));
$('#fFind').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    stepFind(e.shiftKey ? -1 : 1);
  }
});
$('#fRepl').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    replace(e.ctrlKey ? 'book' : 'one');
  }
});
$('#fPrev').addEventListener('click', () => stepFind(-1));
$('#fNext').addEventListener('click', () => stepFind(1));
$('.f-acts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rep]');
  if (b && !b.disabled) replace(b.dataset.rep);
});
function replace(scope) {
  const find = $('#fFind').value;
  const repl = $('#fRepl').value;
  if (!find || repl === find) return;
  const cur = st.find.hits[st.find.i];
  const o = fOpts();
  let op;
  if (scope === 'one') {
    if (!cur) return;
    // في الموضع الواحد: النص الذي وُجد نفسه، والبديل محسوباً (بمجموعات التعبير النمطي إن كان)
    let r1 = repl;
    if (o.re) {
      try {
        r1 = cur.text.replace(new RegExp(find, 'u'), repl);
      } catch {}
    }
    const { re: _re, ...o1 } = o;
    op = { op: 'text', scope: 'one', t: cur.t, sig: sigOf(nodeOf(cur.t)), at: cur.para ? cur.a : undefined, find: cur.text, repl: r1, ...o1, word: false, marks: false };
  } else if (scope === 'section') {
    if (!cur) return;
    op = { op: 'text', scope: 'section', vol: st.vol, range: sectionRange(st.view.blocks, cur.b), find, repl, ...o };
  } else op = { op: 'text', scope: 'book', vol: null, find, repl, ...o };
  const i = st.find.i;
  commit(op, { kind: 'text', old: scope === 'one' ? cur.text : find, new: repl, scope });
  if (st.find.hits.length) {
    st.find.i = Math.min(i, st.find.hits.length - 1);
    paintFind();
  }
}

/* ------------------------------------------------------------------ مواضع تستحق النظر */
function suspects() {
  if (!st.view) return [];
  const out = [];
  const bl = st.view.blocks;
  bl.forEach((b, i) => {
    if (b.type !== 'para' || b.mt) return;
    const txt = runsText(b.runs);
    const plain = b.runs.every((r) => r.k === 't' || r.k === 'r');
    const key = 'b' + i + ':' + sigOf(b);
    if (st.dismissed.has(key)) return;
    if (plain && txt.length < 150 && /\S\s+(?:\.{3,}|…|\*{1,3})\s+\S/.test(txt) && !/[.؟?!]\s*$/.test(txt)) out.push({ key, i, why: 'قد يكون بيتاً', act: 'verse', text: txt });
    else if (plain && txt.length >= 4 && txt.length < 48 && !/[.،؛:؟?!»)]\s*$/.test(txt) && !b.runs.some((r) => r.k === 'r') && bl[i + 1] && bl[i + 1].type === 'para' && bl[i - 1] && bl[i - 1].type !== 'heading' && runsText(bl[i + 1].runs || []).length > 120)
      out.push({ key, i, why: 'قد يكون عنواناً', act: 'heading', text: txt });
    else if (st.quran) {
      const re = /[«"(]([^«»"()]{12,160})[»")]/g;
      let m;
      let a = 0;
      const kinds = b.runs.map((r) => {
        const s = r.k === 'r' ? '' : r.s;
        const o = [a, a + s.length, r.k];
        a += s.length;
        return o;
      });
      while ((m = re.exec(txt))) {
        const from = m.index;
        const to = m.index + m[0].length;
        if (kinds.some(([x, y, k]) => y > from && x < to && k === 'q')) continue;
        if (findQuranLoose(m[1])) {
          out.push({ key: key + ':' + from, i, why: 'قد تكون آية', act: 'q', from, to, text: m[1] });
          break;
        }
      }
    }
  });
  return out;
}
function findQuranLoose(text) {
  if (!st.quran) return false;
  if (findQuran(text, st.quran).length) return true;
  const ws = text.replace(/[ً-ٰٟـ]/g, '').split(/\s+/).filter(Boolean);
  return ws.length >= 4 && !!suraOf(text, st.quran);
}
function renderReview() {
  const box = $('#revCard');
  const list = suspects();
  box.hidden = !list.length;
  box._list = list;
  if (!list.length) return;
  box.innerHTML = `<details ${box.querySelector('details[open]') ? 'open' : ''}><summary><span>مواضع تستحق نظرك</span><b class="cnt">${ar(list.length)}</b></summary>
    <p class="rv-note">ما قد يكون فات ورّاق في هذا المجلد. انقر الموضع لتراه، أو اقبل الاقتراح.</p>
    <ol class="rv">${list
      .slice(0, 40)
      .map(
        (x) => `<li><button type="button" class="rv-go" data-rv="${esc(x.key)}"><b>${esc(x.why)}</b><span>${esc(cut(x.text, 70))}</span><small>${esc(cut(st.sections[sectionOf(x.i)].title, 18))}</small></button>
        <span class="rv-acts"><button type="button" class="btn sm" data-ok="${esc(x.key)}">${x.act === 'verse' ? 'اجعله بيتاً' : x.act === 'heading' ? 'اجعله عنواناً' : 'اجعله آية'}</button><button type="button" class="tl quiet" data-no="${esc(x.key)}">ليس كذلك</button></span></li>`,
      )
      .join('')}</ol></details>`;
}
$('#revCard').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rv], [data-ok], [data-no]');
  if (!b) return;
  const key = b.dataset.rv || b.dataset.ok || b.dataset.no;
  const x = ($('#revCard')._list || []).find((y) => y.key === key);
  if (!x) return;
  if (b.dataset.no) {
    st.dismissed.add(key);
    return renderReview();
  }
  const sel = x.act === 'q' ? { level: 'span', t: { vol: st.vol, b: x.i }, from: x.from, to: x.to } : { level: 'block', t: { vol: st.vol, b: x.i } };
  if (b.dataset.rv) {
    select(sel);
    return goBlock(x.i, 'sel');
  }
  st.sel = settle(sel);
  if (x.act === 'q') setKind('q');
  else if (x.act === 'heading') setBlockKind('heading', { level: 3 });
  else setBlockKind('verse');
});

/* ------------------------------------------------------------------ شريط المجلد: فصوله بأطوالها */
function drawStrip() {
  const cv = $('#strip');
  if (!st.view || !cv.isConnected || !st.sections.length) return;
  const w = cv.clientWidth;
  const h = 18;
  if (!w) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const col = (v, f) => css.getPropertyValue(v).trim() || f;
  const total = st.view.blocks.length || 1;
  const edited = new Set(st.ops.filter((o) => String(o.vol) === st.vol && o.b != null).map((o) => sectionOf(o.b)));
  const hits = new Set(st.find.hits.map((x) => sectionOf(x.b)));
  // الأول في اليمين
  let x = w;
  st.sections.forEach((s, i) => {
    const sw = Math.max(2, ((s.b - s.a + 1) / total) * w);
    x -= sw;
    g.fillStyle = i === st.si ? col('--ink', '#2A1D14') : i % 2 ? col('--line', '#ddd') : col('--muted', '#999');
    g.globalAlpha = i === st.si ? 0.85 : 0.35;
    g.fillRect(x + 0.5, 6, sw - 1, 6);
    g.globalAlpha = 1;
    if (hits.has(i)) {
      g.fillStyle = col('--hit', '#3f8f5a');
      g.fillRect(x + 0.5, 13, sw - 1, 3);
    }
    if (edited.has(i)) {
      g.fillStyle = col('--rubric', '#6B1D2F');
      const cx = x + sw / 2;
      g.beginPath();
      g.moveTo(cx, 0);
      g.lineTo(cx + 3, 3);
      g.lineTo(cx, 6);
      g.lineTo(cx - 3, 3);
      g.fill();
    }
  });
}
$('#strip').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const total = st.view.blocks.length || 1;
  const at = ((r.right - e.clientX) / r.width) * total;
  goSection(Math.max(0, st.sections.findIndex((s) => at >= s.a && at <= s.b + 1)));
});
new ResizeObserver(() => drawStrip()).observe($('#strip'));

/* ------------------------------------------------------------------ العدسة، وعلامات الهامش، واختصارات لوحة المفاتيح */
function sendLens() {
  if (!st.lens || !st.view) return send({ type: 'lens', items: null });
  const sec = curSec();
  const items = [];
  for (let i = sec.a; i <= sec.b; i++) {
    const b = st.view.blocks[i];
    const runs = b.runs || [];
    const ok =
      st.lens === 'm' ? roleOf(b) === 'matn' || runs.some((r) => r.k === 'm') : st.lens === 'q' ? runs.some((r) => r.k === 'q' || (r.k === 'm' && r.q)) : st.lens === 'h' ? runs.some((r) => r.k === 'h') : st.lens === 'v' ? b.type === 'verse' : st.lens === 'hd' ? b.type === 'heading' || runs.some((r) => r.k === 'ht') : false;
    if (ok) items.push({ i });
    if (st.lens === 'n') for (const r of runs) if (r.k === 'r') items.push({ n: r.id });
  }
  send({ type: 'lens', items });
}
$('#lensSel').addEventListener('change', (e) => {
  st.lens = e.target.value || null;
  $('#lens').classList.toggle('on', !!st.lens);
  sendLens();
});
// لون الورق: أبيض أو أصفر (إعدادٌ من إعدادات التنضيد، يُخرج به الكتاب)
async function syncPaper() {
  const ed = await editor();
  const v = ed && ed.paper ? ed.paper.get() : 'white';
  $('#paperBtn').setAttribute('aria-pressed', String(v === 'yellow'));
}
$('#paperBtn').addEventListener('click', async () => {
  const ed = await editor();
  if (!ed || !ed.paper) return toast('ضع كتاباً على المنضدة أولاً');
  ed.paper.set(ed.paper.get() === 'yellow' ? 'white' : 'yellow');
  syncPaper();
});
// الهامش الخارجي: معتاد، أو واسع في طرف الكتاب يُكتب فيه (إعدادٌ من إعدادات التنضيد كلون الورق: يُخرج به الكتاب)،
// وجهة الصفحة الفردية، ونص الهامش في خانةٍ بقدره — في شريط العرض وبطاقة «الأسلوب»
async function syncOm() {
  const ed = await editor();
  const o = ed && ed.om ? ed.om.get() : null;
  $('#omBtn').setAttribute('aria-pressed', String(!!(o && o.on)));
  $('#omBtn').hidden = !o;
  if (!o) return;
  for (const b of document.querySelectorAll('#styOm [data-om]')) b.setAttribute('aria-pressed', String((b.dataset.om === 'on') === !!o.on));
  for (const b of document.querySelectorAll('#styOdd [data-odd]')) b.setAttribute('aria-pressed', String(b.dataset.odd === o.odd));
  $('#styOdd').hidden = !o.on;
  $('#styBox').checked = o.box === null || o.box === undefined ? !!o.styleBox : !!o.box;
  const cm = (mm) => ar(String(Math.round(mm) / 10).replace('.', '٫'));
  const g = o.geom;
  if (g) {
    $('#styOmOff').textContent = `النص ${cm(g.text + g.extra)} سم`;
    $('#styOmOn').textContent = `النص ${cm(g.text)} سم، وهامشه ${cm(g.outer)} سم`;
  }
}
async function setOm(v, msg) {
  const ed = await editor();
  if (!ed || !ed.om) return toast('ضع كتاباً على المنضدة أولاً');
  ed.om.set(v);
  syncOm();
  if (msg) toast(msg);
}
$('#omBtn').addEventListener('click', async () => {
  const ed = await editor();
  const on = !!(ed && ed.om && ed.om.get().on);
  setOm({ on: !on }, on ? 'الهامش الخارجي معتاد' : 'الهامش الخارجي واسع: النص أضيق، والهامش في طرف الكتاب أوسع يُكتب فيه');
});
$('#styOm').addEventListener('click', (e) => {
  const b = e.target.closest('[data-om], [data-odd]');
  if (!b) return;
  if (b.dataset.om) setOm({ on: b.dataset.om === 'on' });
  else setOm({ odd: b.dataset.odd }, b.dataset.odd === 'r' ? 'الصفحة الفردية يمنى: هامشها الواسع يمينها' : 'الصفحة الفردية يسرى (الكتاب العربي): هامشها الواسع يسارها');
});
$('#styBox').addEventListener('change', (e) => setOm({ box: e.target.checked }, e.target.checked ? 'نص الهامش في خانةٍ بقدره' : 'نص الهامش بلا خانة'));
/* ------------------------------------------------------------------ الأسلوب وخلفيات الصفحات */
// أساليب ورّاق للكتاب، و«بدون أسلوب»: الكتاب على أصله (تنسيق ملفه، أو أسلوبه السابق بتعديلاته).
// تغيير الأسلوب لا يمسّ ما خُصّ به نصٌّ أو كلمة في المحرِّر: ذلك في التعديلات، والأسلوب في إعدادات التنضيد.
const BG_LABEL = { body: 'المتن والشرح', h1: 'الباب', h2: 'الفصل', toc: 'الفهرس' };
async function renderStyles() {
  const ed = await editor();
  const card = $('#styCard');
  if (!ed || !ed.styles || !st.info) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const list = ed.styles.list();
  const now = ed.styles.current();
  const cur = list.find((x) => x.id === now.id);
  $('#styNow').textContent = now.id === 'none' ? 'بدون أسلوب' + (now.origin ? ' — ' + now.origin : '') : cur ? cur.name : '';
  const item = (id, name, sub, colors, cls = '') =>
    `<button type="button" class="sty-it ${cls}" role="radio" data-sty="${esc(id)}" aria-checked="${now.id === id}" title="${esc(sub || name)}"><span class="sw">${colors.length ? colors.map((c) => `<i style="background:${esc(c)}"></i>`).join('') : '<i></i><i></i><i></i>'}</span><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  $('#styList').innerHTML =
    item('none', 'بدون أسلوب', now.origin ? 'على أصله: ' + now.origin : 'الكتاب على أصله', [], 'none') +
    list.map((x) => item(x.id, x.name, x.mine ? 'من صنعك' : '', x.colors)).join('');
  // الخلفيات
  const B = ed.bgs ? ed.bgs.get() : {};
  $('#styBgs').innerHTML = Object.entries(BG_LABEL)
    .map(([k, l]) => {
      const own = B[k] || '';
      const shown = own || (k === 'h1' || k === 'h2' ? B.body || '' : '');
      return `<button type="button" data-bg-pick="${k}" class="${own ? 'on' : shown ? 'inh' : ''}" title="${own ? 'غيّر خلفية ' : 'اختر خلفيةً لـ'}${l}"><i style="${shown ? `background-image:url('${shown}')` : ''}"></i>${l}${own ? `<span class="x" data-bg-clear="${k}" title="أزلها">✕</span>` : ''}</button>`;
    })
    .join('');
  $('#styBgClear').hidden = !Object.values(B).some(Boolean);
}
let bgPick = null;
$('#styCard').addEventListener('click', async (e) => {
  const ed = await editor();
  if (!ed) return;
  const clr = e.target.closest('[data-bg-clear]');
  if (clr) {
    e.preventDefault();
    e.stopPropagation();
    ed.bgs.clear(clr.dataset.bgClear);
    return renderStyles();
  }
  const pk = e.target.closest('[data-bg-pick]');
  if (pk) {
    bgPick = pk.dataset.bgPick;
    return $('#styBgFile').click();
  }
  const sb = e.target.closest('[data-sty]');
  if (!sb) return;
  if (sb.getAttribute('aria-checked') === 'true') return;
  if (ed.styles.apply(sb.dataset.sty)) {
    toast(sb.dataset.sty === 'none' ? 'الكتاب على أصله: بلا أسلوبٍ من ورّاق' : 'الأسلوب: ' + sb.querySelector('b').textContent + ' — وما غيّرته في النص باقٍ');
    renderStyles();
  }
});
$('#styBgFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  const ed = await editor();
  if (!f || !bgPick || !ed || !ed.bgs) return;
  try {
    await ed.bgs.setFile(bgPick, f);
  } catch {
    toast('تعذّرت قراءة الصورة');
  }
  bgPick = null;
  renderStyles();
});
$('#tagsOn').addEventListener('change', (e) => {
  st.tags = e.target.checked;
  sendTags();
});
$('#volSel').addEventListener('change', (e) => loadVol(e.target.value));
function onKey(e) {
  const typing = e.target && e.target.closest && e.target.closest('input, textarea, select');
  const k = String(e.key || '').toLowerCase();
  const code = e.code || '';
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (st.sel || st.editing)) {
    // اختصارات التنسيق (كما في Word)
    const fmt = {
      b: () => toggleChar('bold', 'عريض'),
      i: () => toggleChar('it', 'مائل'),
      u: () => toggleChar('ul', 'تحته خط'),
      ']': () => stepSize(1),
      '[': () => stepSize(-1),
      '>': () => stepSize(1),
      '<': () => stepSize(-1),
      e: () => applyPara({ al: 'c' }, 'توسيط'),
      l: () => applyPara({ al: 'l' }, 'محاذاة إلى اليسار'),
      r: () => applyPara({ al: 'r' }, 'محاذاة إلى اليمين'),
      j: () => applyPara({ al: null }, 'ضبط الطرفين'),
      ' ': () => clearFmt(),
    };
    const key = { KeyB: 'b', KeyI: 'i', KeyU: 'u', BracketRight: ']', BracketLeft: '[', KeyE: 'e', KeyL: 'l', KeyR: 'r', KeyJ: 'j', Space: ' ' }[code] || k;
    if (fmt[key] && !(key === 'r' && e.shiftKey)) {
      e.preventDefault();
      return fmt[key]();
    }
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (k === 'f') {
      e.preventDefault();
      $('#fFind').focus();
      $('#fFind').select();
    } else if (k === 'z' && !e.shiftKey && !typing) {
      e.preventDefault();
      undo();
    } else if ((k === 'y' || (k === 'z' && e.shiftKey)) && !typing) {
      e.preventDefault();
      redo();
    }
    return;
  }
  if (typing) return;
  if (e.key === 'Escape') {
    if (st.toNote) return cancelToNote(true);
    if (st.painter) {
      st.painter = null;
      return paintTools();
    }
    return select(null);
  }
  // الأداتان: V للتحديد و T للكتابة (كما في InDesign)
  if (!e.ctrlKey && !e.altKey && (k === 'v' || code === 'KeyV')) return setTool('select');
  if (!e.ctrlKey && !e.altKey && (k === 't' || code === 'KeyT')) return setTool('type');
  if (e.key === 'Delete' && st.sel && st.sel.level === 'block' && st.sel.t.b != null) return blockAct('del');
  if (e.key === 'Enter' && st.sel && st.sel.t && st.sel.t.b != null) {
    // Enter على فقرة محدَّدة: اكتب في آخرها
    const node = nodeOf(st.sel.t);
    if (node && node.runs) {
      setTool('type');
      return sendCaret({ t: st.sel.t, o: textOf(node).length });
    }
    if (node && /heading|verse|label/.test(node.type)) return openInlineFor(st.sel.t.b);
  }
  if (e.key === 'PageDown') return goSection(st.si + 1);
  if (e.key === 'PageUp') return goSection(st.si - 1);
  if (st.sel && /^[1-9]$/.test(e.key)) {
    const b = $$('#selCard .kinds .kc:not(.mu-act)')[+e.key - 1];
    if (b) b.click();
  }
}
document.addEventListener('keydown', onKey);

/* ================================================================== الكتابة والتنسيق (كما في Word و InDesign) */
// الأداتان: «التحديد» (يُعرف النوع ويُحدَّد، ونقرتان تكتب) و«الكتابة» (المؤشر حيث تنقر، واكتب في الصفحة نفسها).
// ما يُكتب يُحفظ حين تخرج منه (أو قبل أي تنسيق): يُقارن بنصه الأول فيُحفظ ما تغيّر وحده، ويرث المكتوب نوع ما قبله وتنسيقه.
const PT_MM = 25.4 / 72;
const textOf = (node) => (!node ? '' : node.runs ? runsText(node.runs) : node.type === 'verse' ? (node.parts || []).join(' … ') : node.text || '');
const flushWait = new Map();
let flushSeq = 0;
/** ما كُتب في الصفحة يُحفظ الآن ← التحديد فيه بعد الحفظ { t, from, to } أو null */
function flushEdit() {
  if (!st.editing || !frame) return Promise.resolve(null);
  const req = 'f' + ++flushSeq;
  return new Promise((res) => {
    flushWait.set(req, res);
    send({ type: 'flush', req });
    setTimeout(() => flushWait.has(req) && (flushWait.delete(req), res(null)), 3000);
  });
}
/** حول موضع التغيير: كلمات قليلة قبله وبعده (لورقة التصويب) */
function around(s, a, z) {
  let x = a;
  let y = z;
  while (x > 0 && a - x < 24 && !/\s/.test(s[x - 1])) x--;
  while (y < s.length && y - z < 24 && !/\s/.test(s[y])) y++;
  return s.slice(x, y).replace(/\u2029/g, ' ¶ ').trim();
}
function onCommit(m) {
  const res = m.req && flushWait.get(m.req);
  if (res) flushWait.delete(m.req);
  st.editing = null;
  paintTools();
  if (m.none) return res && res(null);
  const t = tOf(m);
  const node = nodeOf(t);
  if (!node) return res && res(null);
  const full = textOf(node);
  const flat = t.n != null || t.sd != null; // الحاشية والهامش: لا تنقسم فقرات
  const text = m.text != null ? m.text : full.slice(m.a, m.z);
  const ops = [];
  let note = null;
  if (m.text != null) {
    const old = full.slice(m.a, m.z);
    // المسافات المكررة في الأصل تُرى في الصفحة واحدة: لا يُعدّ ذلك تغييراً
    const ch = diffText(old, m.text)
      .filter((c) => !(c.s === '' && c.z > c.a && !old.slice(c.a, c.z).trim() && (/\s/.test(old[c.a - 1] || '') || /\s/.test(old[c.z] || ''))))
      .map((c) => ({ a: c.a + m.a, z: c.z + m.a, s: c.s }));
    if (ch.length) {
      ops.push({ op: 'edit', t, sig: sigOf(node), ch });
      const after = full.slice(0, ch[0].a) + ch[0].s + full.slice(ch[0].z);
      note = { kind: 'parts', old: cut(around(full, ch[0].a, ch[0].z), 40) || '—', new: cut(around(after, ch[0].a, ch[0].a + ch[0].s.length), 40) || '—', typed: true };
      if (ch.length > 1) note.count = ch.length;
    }
  }
  // موضع في النص الجديد ← القطعة (بعد تقسيمها فقرات) وموضعه منها
  const placeOf = (idx) => {
    const before = text.slice(0, idx);
    const k = (before.match(/\u2029/g) || []).length;
    if (!k || flat) return { d: 0, o: m.a + idx };
    const p = before.lastIndexOf('\u2029');
    const lead = (text.slice(p + 1).match(/^[ \t]*/) || [''])[0].length;
    return { d: k, o: Math.max(0, idx - p - 1 - lead) };
  };
  const marks = flat ? 0 : (text.match(/\u2029/g) || []).length;
  let caret = null;
  if (m.sel) {
    const s = placeOf(m.sel.s);
    const e = placeOf(m.sel.e);
    caret = { t: flat ? t : { vol: st.vol, b: t.b + s.d }, o: s.o, o2: e.d === s.d ? e.o : s.o };
  }
  if (m.merge === 'prev' && t.b > 0) {
    // Backspace في أول الفقرة: تُضمّ إلى ما قبلها، والمؤشر حيث التقتا
    const prev = st.view.blocks[t.b - 1];
    const sig = ops.length ? sigOf(applyEdits({ blocks: [clone(node)], notes: {} }, st.vol, { ops: [{ ...ops[0], t: { vol: st.vol, b: 0 } }] }).parsed.blocks[0]) : sigOf(node);
    if (prev && prev.runs && node.runs) {
      ops.push({ op: 'merge', t, sig });
      caret = { t: { vol: st.vol, b: t.b - 1 }, o: textOf(prev).length };
      note = note || { kind: 'kind', from: 'فقرتان', to: 'فقرة واحدة', text: cut(textOf(prev), 40) };
    }
  } else if (m.merge === 'next') {
    const nb = st.view.blocks[t.b + 1];
    if (nb && nb.runs && node.runs) {
      ops.push({ op: 'merge', t: { vol: st.vol, b: t.b + 1 + marks }, sig: sigOf(nb) });
      note = note || { kind: 'kind', from: 'فقرتان', to: 'فقرة واحدة', text: cut(textOf(node), 40) };
    }
  }
  if (m.next) {
    // نُقر موضعٌ آخر وهو يكتب: يُنقل المؤشر إليه
    const nx = m.next;
    if (nx.n != null) caret = { t: { vol: st.vol, n: nx.n, g: nx.g || 0 }, o: nx.o };
    else if (nx.sd != null) caret = { t: { vol: st.vol, b: nx.i, sd: nx.sd }, o: nx.o };
    else {
      let b = nx.i;
      let o = nx.o;
      if (t.b != null && t.sd == null && b > t.b) b += marks;
      if (t.b != null && t.sd == null && nx.i === t.b && o >= m.z) o += text.length - (m.z - m.a);
      caret = { t: { vol: st.vol, b }, o };
    }
  }
  const keep = !!(m.keep && caret);
  if (!ops.length) {
    if (res) res(caret && caret.t.b === t.b && caret.t.sd === t.sd ? { t: caret.t, from: caret.o, to: caret.o2 != null ? caret.o2 : caret.o } : null);
    if (keep && !res) sendCaret(caret);
    return;
  }
  st.pendingCaret = keep && !res ? caret : null;
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, note || { kind: 'parts', old: '—', new: '—' }, { render: !res, quiet: true });
  if (res) res(caret ? { t: caret.t, from: caret.o, to: caret.o2 != null ? caret.o2 : caret.o } : null);
}
function sendCaret(c) {
  if (!c || !c.t) return;
  send({ type: 'caretTo', ...(c.t.n != null ? { n: c.t.n, g: c.t.g } : c.t.sd != null ? { i: c.t.b, sd: c.t.sd } : { i: c.t.b }), o: c.o, o2: c.o2 != null && c.o2 !== c.o ? c.o2 : null });
}

/* ---- الأداة ---- */
function setTool(tool) {
  st.tool = tool === 'type' ? 'type' : 'select';
  for (const b of $$('#tbar [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === st.tool));
  $('#pagePane').classList.toggle('typing', st.tool === 'type');
  send({ type: 'tool', tool: st.tool });
}
$('#tbar').addEventListener('click', (e) => {
  const tb = e.target.closest('[data-tool]');
  if (tb) return setTool(tb.dataset.tool);
});

/* ---- ما يُنسَّق: الكلمات المحدَّدة، أو ما حول المؤشر، أو القطع كلها ---- */
/**
 * ← { spans: [{ t, node, from, to }] (نص في فقرة أو حاشية)، blocks: [{ t, node }] (القطع المحدَّدة كلها)، caret: هل هو مؤشر بلا تحديد }
 */
async function fmtTargets() {
  const f = await flushEdit();
  if (f) {
    const node = nodeOf(f.t);
    if (!node) return null;
    st.pendingCaret = { t: f.t, o: f.from, o2: f.to };
    if (f.to > f.from) return { spans: [{ t: f.t, node, from: f.from, to: f.to }], blocks: [{ t: f.t, node }], caret: false, live: true };
    // مؤشر بلا تحديد: الكلمة التي هو فيها (كما في Word)
    const txt = textOf(node);
    let a = f.from;
    let z = f.from;
    while (a > 0 && !/\s/.test(txt[a - 1])) a--;
    while (z < txt.length && !/\s/.test(txt[z])) z++;
    return { spans: z > a ? [{ t: f.t, node, from: a, to: z }] : [], blocks: [{ t: f.t, node }], caret: true, live: true };
  }
  const sel = st.sel;
  if (!sel) return null;
  if (sel.level === 'group' || sel.level === 'multi') {
    const blocks = sel.blocks.map((i) => ({ t: { vol: st.vol, b: i }, node: st.view.blocks[i] })).filter((x) => x.node);
    return { spans: blocks.filter((x) => x.node.runs).map((x) => ({ ...x, from: 0, to: textOf(x.node).length })), blocks };
  }
  const node = nodeOf(sel.t);
  if (!node) return null;
  if (sel.level === 'run' || sel.level === 'span') return { spans: [{ t: sel.t, node, from: sel.from, to: sel.to }], blocks: [{ t: sel.t, node }] };
  return { spans: node.runs ? [{ t: sel.t, node, from: 0, to: textOf(node).length }] : [], blocks: [{ t: sel.t, node }] };
}
const isWhole = (x) => x.node && !x.node.runs && ['heading', 'verse', 'label'].includes(x.node.type);
/** تنسيق الحرف (ما كان null أُزيل) */
async function applyChar(set, label) {
  const tg = await fmtTargets();
  if (!tg) return toast('حدّد نصاً أو ضع المؤشر فيه أولاً');
  const ops = [];
  for (const x of tg.spans) if (x.to > x.from) ops.push({ op: 'style', t: x.t, sig: sigOf(x.node), from: x.from, to: x.to, st: set });
  for (const x of tg.blocks) if (isWhole(x)) ops.push({ op: 'bst', t: x.t, sig: sigOf(x.node), st: set });
  if (!ops.length) {
    st.pendingCaret && sendCaret(st.pendingCaret);
    st.pendingCaret = null;
    return;
  }
  const text = tg.spans[0] ? textOf(tg.spans[0].node).slice(tg.spans[0].from, tg.spans[0].to) : textOf(tg.blocks[0].node);
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: label, text });
}
/** تنسيق الفقرة */
async function applyPara(set, label) {
  const tg = await fmtTargets();
  if (!tg) return toast('حدّد فقرة أو ضع المؤشر فيها أولاً');
  // (الهامش: الوسط أصله، فالضبط فيه يُحفظ صراحةً)
  const ops = tg.blocks.filter((x) => x.t.b != null && x.node && x.node.type !== 'image').map((x) => ({ op: 'pstyle', t: x.t, sig: sigOf(x.node), ps: x.t.sd != null && 'al' in set && set.al == null ? { ...set, al: 'j' } : set }));
  if (!ops.length) return toast('تنسيق الفقرة لفقرات الكتاب وعناوينه');
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: label, text: textOf(tg.blocks[0].node) });
}
/** الصورة المحدَّدة */
function selImage() {
  const sel = st.sel;
  if (!sel || sel.level !== 'block' || sel.t.b == null) return null;
  const node = nodeOf(sel.t);
  return node && node.type === 'image' ? { t: sel.t, node } : null;
}
function applyImg(set, label) {
  const im = selImage();
  if (!im) return;
  commit({ op: 'img', t: im.t, sig: sigOf(im.node), set }, { kind: 'style', to: label, text: im.node.cap || 'صورة' });
}

/* ---- القيم الحالية (ما عند المؤشر أو أول المحدَّد) ---- */
function curStyle() {
  let t = null;
  let o = 0;
  if (st.editing && st.caret) {
    t = tOf(st.caret);
    o = st.caret.o;
  } else if (st.sel && st.sel.t) {
    t = st.sel.t;
    o = st.sel.from || 0;
  } else if (st.sel && st.sel.blocks) t = { vol: st.vol, b: st.sel.blocks[0] };
  const node = t ? nodeOf(t) : null;
  if (!node) return null;
  let rs = {};
  if (node.runs) {
    // مؤشرٌ بلا تحديد: تنسيق الحرف الذي قبله (كما في Word)؛ وتحديدٌ: تنسيق أول حرفٍ فيه
    const caret = !!(st.editing && st.caret && st.caret.o === st.caret.o2);
    let a = 0;
    for (const r of node.runs) {
      if (r.k === 'r') continue;
      const z = a + (r.s || '').length;
      if (caret ? (o > a && o <= z) || (o === 0 && a === 0) : o >= a && o < z) {
        rs = { ...(r.st || {}), k: r.k };
        break;
      }
      a = z;
    }
  } else rs = { ...(node.st || {}) };
  // ما يُرى في الشريط هو التنسيق الفعلي (بالأنماط)، والنمط نفسه معه
  const U = ustyles();
  const pst = node.ps && node.ps.pst && U[node.ps.pst] ? U[node.ps.pst] : null;
  const k = rs.k;
  const eff = runStyle(rs, pst, U) || {};
  return { t, node, st: { ...eff, k, ...(rs.cs ? { cs: rs.cs } : {}) }, own: rs, inNote: t.n != null || t.sd != null, inSide: t.sd != null, pst: node.ps && node.ps.pst };
}
/** المقاس الأصل (بالنقطة) لما عند المؤشر */
function basePt(cs) {
  const S = st.settings || {};
  const sz = S.sizes || { body: 16, note: 13.5, h1: 24, h2: 19, h3: 17, h4: 16 };
  if (!cs) return sz.body;
  if (cs.inNote) return sz.note;
  if (cs.node.type === 'heading') return sz['h' + Math.min(4, cs.node.level || 1)] || sz.body;
  return sz.body;
}
function baseFont(cs) {
  const S = st.settings || {};
  const f = S.fonts || {};
  return cs && (cs.node.type === 'heading' || cs.node.type === 'label') ? f.heading || f.body : f.body;
}
const fmt1 = (n) => String(Math.round(n * 10) / 10);
function paintTools() {
  const cs = curStyle();
  const s = (cs && cs.st) || {};
  const on = (sel, v) => {
    const b = $(sel);
    if (b) b.setAttribute('aria-pressed', String(!!v));
  };
  on('#tbar [data-c="bold"]', s.bold);
  on('#tbar [data-c="it"]', s.it);
  on('#tbar [data-c="ul"]', s.ul);
  on('#tbar [data-c="sk"]', s.sk);
  on('#tbar [data-c="painter"]', !!st.painter);
  const sty = cs && cs.pst ? ustyles()[cs.pst] : null;
  const al = cs && cs.node ? cs.node.al || (sty && sty.al) || (cs.inSide ? 'c' : 'j') : '';
  for (const b of $$('#tbar [data-al]')) b.setAttribute('aria-pressed', String(b.dataset.al === al));
  const font = s.font || baseFont(cs) || '';
  const fs = $('#tFont');
  if (font && ![...fs.options].some((o) => o.value === font)) fs.insertAdjacentHTML('afterbegin', `<option value="${esc(font)}">${esc(font)}</option>`);
  fs.value = font;
  if (document.activeElement !== $('#tSize')) $('#tSize').value = cs ? fmt1(basePt(cs) * (s.size || 1)) : '';
  $('#tColorBar').style.background = s.color || 'var(--page-ink, #2a1d14)';
  $('#tBgBar').style.background = s.bg || 'transparent';
  $('#tbar').classList.toggle('live', !!st.editing);
  $('#tbar').classList.toggle('none', !cs && !st.editing);
  renderProps();
}

/* ---- الخطوط ---- */
async function loadFonts() {
  const ed = await editor();
  const list = (ed && ed.fonts && ed.fonts()) || [];
  const groups = [['own', 'خطوط ورّاق'], ['sys-ar', 'خطوط جهازك العربية'], ['sys', 'خطوط جهازك الأخرى']];
  $('#tFont').innerHTML = groups
    .map(([g, n]) => {
      const fs = list.filter((f) => f.group === g);
      return fs.length ? `<optgroup label="${n}">${fs.map((f) => `<option value="${esc(f.v)}" style="font-family:'${esc(f.v)}'">${esc(f.label)}</option>`).join('')}</optgroup>` : '';
    })
    .join('');
  st.fonts = list;
}
$('#tFont').addEventListener('change', (e) => {
  const cs = curStyle();
  const v = e.target.value;
  applyChar({ font: v === baseFont(cs) ? null : v }, 'الخط: ' + (((st.fonts || []).find((f) => f.v === v) || {}).label || v));
});
function setSizePt(pt) {
  const cs = curStyle();
  const base = basePt(cs);
  const r = Math.max(0.3, Math.min(4, pt / base));
  applyChar({ size: Math.abs(r - 1) < 0.004 ? null : Math.round(r * 1000) / 1000 }, `المقاس ${ar(fmt1(pt))} نقطة`);
}
$('#tSize').addEventListener('change', (e) => {
  const pt = parseFloat(e.target.value);
  if (pt > 0) setSizePt(pt);
});
$('#tSize').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  }
});
const SIZES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64, 72];
function stepSize(d) {
  const cs = curStyle();
  const cur = basePt(cs) * ((cs && cs.st.size) || 1);
  const next = d > 0 ? SIZES.find((x) => x > cur + 0.01) || cur + 4 : [...SIZES].reverse().find((x) => x < cur - 0.01) || Math.max(5, cur - 1);
  setSizePt(next);
}
function toggleChar(key, label) {
  const cs = curStyle();
  const v = cs && cs.st[key];
  applyChar({ [key]: v ? null : key === 'bold' ? true : 1 }, v ? 'بلا ' + label : label);
}
async function clearFmt() {
  const tg = await fmtTargets();
  if (!tg) return;
  const none = { size: null, bold: null, color: null, font: null, it: null, ul: null, sk: null, bg: null, up: null, va: null, ws: null, ks: null, cs: null };
  const ops = [];
  for (const x of tg.spans) if (x.to > x.from) ops.push({ op: 'style', t: x.t, sig: sigOf(x.node), from: x.from, to: x.to, st: none });
  for (const x of tg.blocks) if (isWhole(x)) ops.push({ op: 'bst', t: x.t, sig: sigOf(x.node), st: none });
  for (const x of tg.blocks) if (x.t.b != null && (x.node.ps || x.node.al)) ops.push({ op: 'pstyle', t: x.t, sig: sigOf(x.node), ps: { al: null, ind: null, is: null, ie: null, sb: null, sa: null, lh: null, bx: null, drop: null } });
  if (ops.length) commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: 'بلا تنسيق', text: textOf(tg.blocks[0].node) });
}

/* ---- ناسخ التنسيق ---- */
function armPainter(sticky) {
  const cs = curStyle();
  if (!cs) return toast('حدّد ما تريد نسخ تنسيقه أولاً');
  const s = { ...cs.st };
  delete s.k;
  st.painter = { st: s, ps: cs.node.ps || null, al: cs.node.al || null, sticky: !!sticky };
  toast(sticky ? 'ناسخ التنسيق: انقر أو حدّد ما يأخذ التنسيق (Esc للإنهاء)' : 'ناسخ التنسيق: انقر أو حدّد ما يأخذ التنسيق', 3500);
  paintTools();
}
function usePainter() {
  const p = st.painter;
  if (!p) return false;
  if (!p.sticky) st.painter = null;
  const none = { size: null, bold: null, color: null, font: null, it: null, ul: null, sk: null, bg: null, up: null, va: null, ws: null, ks: null };
  const set = { ...none, ...p.st };
  const sel = st.sel;
  const ops = [];
  const blocks = sel.level === 'group' || sel.level === 'multi' ? sel.blocks.map((i) => ({ t: { vol: st.vol, b: i } })) : [{ t: sel.t }];
  for (const x of blocks) {
    const node = nodeOf(x.t);
    if (!node) continue;
    if (node.runs) {
      const from = sel.level === 'run' || sel.level === 'span' ? sel.from : 0;
      const to = sel.level === 'run' || sel.level === 'span' ? sel.to : textOf(node).length;
      ops.push({ op: 'style', t: x.t, sig: sigOf(node), from, to, st: set });
    } else if (['heading', 'verse', 'label'].includes(node.type)) ops.push({ op: 'bst', t: x.t, sig: sigOf(node), st: set });
    if (x.t.b != null && sel.level !== 'run' && sel.level !== 'span' && node.type !== 'image') ops.push({ op: 'pstyle', t: x.t, sig: sigOf(node), ps: { al: p.al, ind: null, is: null, ie: null, sb: null, sa: null, lh: null, bx: null, drop: null, ...(p.ps || {}) } });
  }
  if (ops.length) commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: 'نُسخ التنسيق', text: textOf(nodeOf(blocks[0].t)) });
  paintTools();
  return true;
}

/* ---- القوائم المنبثقة: الألوان، تباعد الأسطر، الإدراج، الرموز ---- */
const SWATCHES = ['#000000', '#2A1D14', '#5B4636', '#6B1D2F', '#8B1A1A', '#B3261E', '#A0522D', '#8A6727', '#C5A059', '#1F5E3B', '#2E7D4F', '#22385E', '#2E4A7A', '#3D5A80', '#5B3A7A', '#6E6E6E'];
const HIGHLIGHTS = ['#FFF3A3', '#FDE2A7', '#F9D3C8', '#E4F2D7', '#D6EAF5', '#EBDDF2', '#EFE6D2', '#E8E8E8'];
const SYMBOLS = [
  ['ﷺ', 'صلى الله عليه وسلم'], ['ﷻ', 'جل جلاله'], ['ﷲ', 'الله'], ['﴿', 'قوس الآية'], ['﴾', 'قوس الآية'], ['۝', 'نهاية الآية'], ['۞', 'ربع الحزب'], ['۩', 'سجدة'],
  ['«', ''], ['»', ''], ['❁', ''], ['✽', ''], ['❖', ''], ['※', ''], ['•', ''], ['ـ', 'تطويل'],
  ['رضي الله عنه', ''], ['رضي الله عنهم', ''], ['رحمه الله', ''], ['عليه السلام', ''], ['تعالى', ''], ['صلى الله عليه وسلم', ''],
];
function popHtml(kind) {
  const look = (st.info && st.info.look) || {};
  if (kind === 'color' || kind === 'bg') {
    const book = kind === 'color' ? [look.textColor, look.matnColor, look.quranColor, (look.headingColors || {})[1], look.ornamentColor].filter(Boolean) : [];
    const sw = kind === 'color' ? SWATCHES : HIGHLIGHTS;
    return `<div class="pp-h">${kind === 'color' ? 'لون النص' : 'لون التظليل'}</div>
      ${book.length ? `<div class="pp-sub">ألوان الكتاب</div><div class="sws">${[...new Set(book)].map((c) => `<button type="button" data-set="${kind}" data-v="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div>` : ''}
      <div class="sws">${sw.map((c) => `<button type="button" data-set="${kind}" data-v="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div>
      <div class="pp-row"><button type="button" class="tl" data-set="${kind}" data-v="">${kind === 'color' ? 'لون الكتاب' : 'بلا تظليل'}</button><label class="pp-custom">لون آخر <input type="color" data-custom="${kind}"></label></div>`;
  }
  if (kind === 'lh') {
    const cur = (curStyle() || {}).node;
    const v = cur && cur.ps && cur.ps.lh;
    const base = (st.settings && st.settings.lineHeight) || 1.85;
    return `<div class="pp-h">تباعد الأسطر</div><div class="pp-list">${[['', `كأسلوب الكتاب (${ar(base)})`], ...[1.3, 1.5, 1.7, 1.85, 2, 2.2, 2.5, 3].map((x) => [x, ar(x) + ' ×'])].map(([x, n]) => `<button type="button" data-set="lh" data-v="${x}" aria-pressed="${String(v || '') === String(x)}">${n}</button>`).join('')}</div>`;
  }
  if (kind === 'ins') {
    return `<div class="pp-h">إدراج بعد ${st.editing ? 'الفقرة التي فيها المؤشر' : 'المحدَّد'}</div><div class="pp-list ins">
      <button type="button" data-ins="para"><b>¶</b>فقرة<small>Enter في آخر الفقرة</small></button>
      ${HEAD_LEVELS.map(([l, n, h]) => `<button type="button" data-ins="h${l}"><b>${h}</b>عنوان: ${n}</button>`).join('')}
      <button type="button" data-ins="verse"><b>⁂</b>بيت شعر</button>
      <button type="button" data-ins="image"><b>▣</b>صورة…</button>
      <button type="button" data-ins="table"><b>▦</b>جدول<small>٣ × ٣</small></button>
      <button type="button" data-ins="note"><b>⁽¹⁾</b>حاشية عند المؤشر</button>
      <button type="button" data-ins="sideR"><b>⇥</b>هامش أيمن<small>بإزاء الفقرة، وتكتب فيه في الحال</small></button>
      <button type="button" data-ins="sideL"><b>⇤</b>هامش أيسر<small>ثم اسحبه وغيّر حدوده من مقابضه</small></button>
      <button type="button" data-ins="sideO"><b>⇿</b>هامش في الطرف الخارجي<small>يسار الصفحة اليسرى ويمين اليمنى: في الهامش الواسع</small></button>
      <button type="button" data-ins="ornament"><b>❁</b>فاصل زخرفي</button>
      <button type="button" data-ins="hr"><b>—</b>خط فاصل</button>
      <button type="button" data-ins="pagebreak"><b>⤓</b>فاصل صفحة<small>ما بعده في صفحة جديدة</small></button>
      ${muOn() ? '<button type="button" data-ins="mcpage"><b>✎</b>صفحة تعليق<small>انقر الموضع في المتن فتوضع بعده</small></button>' : ''}</div>`;
  }
  if (kind === 'ls') {
    const cur = ((curStyle() || {}).node || {}).ps || {};
    return `<div class="pp-h">القائمة</div><div class="pp-list">${[['', 'بلا قائمة', ''], ['b', '•', 'نقاط'], ['d', '◆', 'معيّنات'], ['n', '١-', 'ترقيم'], ['p', '(١)', 'ترقيم بين قوسين'], ['w', 'أولاً:', 'ترتيب بالكلمات']].map(([v, m, n]) => `<button type="button" data-set="ls" data-v="${v}" aria-pressed="${(cur.ls || '') === v}"><b>${m}</b>${n}</button>`).join('')}</div><p class="pp-note">الفقرات المتتالية بنوعٍ واحد قائمةٌ واحدة يتتابع ترقيمها.</p>`;
  }
  if (kind === 'tx')
    return `<div class="pp-h">أدوات النص</div><div class="pp-list">${TEXT_TOOLS.map(([k, n, d]) => `<button type="button" data-tx="${k}"><b>${n}</b><small>${d}</small></button>`).join('')}</div><p class="pp-note">على المحدَّد، أو على الفقرة التي فيها المؤشر. ولا يتغيّر نوع النص ولا تنسيقه.</p>`;
  if (kind === 'ayat') {
    if (!st.quran) return `<div class="pp-h">تحديد الآيات</div><p class="pp-note">يُحمَّل نص المصحف… أعد فتح هذه القائمة بعد لحظة.</p>`;
    const sec = ayatScope('sec');
    const vol = ayatScope('vol');
    const sel = st.sel && st.sel.level !== 'mx' && st.sel.level !== 'mc' ? ayatScope('sel') : null;
    const n = (x) => (x ? ayatScan(x).length : 0);
    const row = (k, name, x, sub) => `<button type="button" data-ayat="${k}" ${n(x) ? '' : 'disabled'}><b>${ar(n(x))}</b>${name}<small>${sub}</small></button>`;
    return `<div class="pp-h">تحديد الآيات</div><div class="pp-list ins">
      ${sel ? row('sel', 'في المحدَّد', sel, 'ما حدّدته في الصفحة') : ''}
      ${row('sec', 'في الفصل الظاهر', sec, sec.name)}
      ${row('vol', 'في المجلد كله', vol, 'كل فصوله وحواشيه')}</div>
      <p class="pp-note">يُطابَق النص بالمصحف (خمس كلمات متصلة فأكثر)، فما لم يُعلَّم آيةً يصير آيةً بين ﴿ ﴾، وما كان بين قوسين أو علامتي تنصيص صار قوساه مزهّرين. يُرجع عنه بـ Ctrl+Z. وما خفي على المطابقة اطلبه من «المساعد»: «حدّد الآيات».</p>`;
  }
  if (kind === 'sym') return `<div class="pp-h">رموز</div><div class="syms">${SYMBOLS.map(([c, n]) => `<button type="button" data-sym="${esc(c)}" title="${esc(n || c)}" class="${c.length > 2 ? 'w' : ''}">${esc(c)}</button>`).join('')}</div><p class="pp-note">تُدرج عند المؤشر (أداة الكتابة).</p>`;
  return '';
}
function openPop(kind, btn) {
  const pop = $('#tPop');
  if (!pop.hidden && pop.dataset.kind === kind) return closePop();
  pop.innerHTML = popHtml(kind);
  pop.dataset.kind = kind;
  pop.hidden = false;
  const bar = $('#tbar').getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  pop.style.top = r.bottom - bar.top + 6 + 'px';
  const right = Math.max(4, Math.min(bar.width - pop.offsetWidth - 4, bar.right - r.right));
  pop.style.right = right + 'px';
  for (const b of $$('#tbar [data-pop]')) b.setAttribute('aria-expanded', String(b === btn));
}
function closePop() {
  $('#tPop').hidden = true;
  for (const b of $$('#tbar [data-pop]')) b.setAttribute('aria-expanded', 'false');
}
document.addEventListener('mousedown', (e) => {
  if (!$('#tPop').hidden && !e.target.closest('#tPop, [data-pop]')) closePop();
});
// الضغط على أزرار الشريط لا يأخذ التركيز (فيبقى ما يُكتب كما هو حتى يُحفظ)
$('#tbar').addEventListener('mousedown', (e) => {
  if (e.target.closest('button') && !e.target.closest('input, select')) e.preventDefault();
});
$('#tbar').addEventListener('click', (e) => {
  const pb = e.target.closest('[data-pop]');
  if (pb) return openPop(pb.dataset.pop, pb);
  const c = e.target.closest('[data-c]');
  if (c) {
    const k = c.dataset.c;
    if (k === 'bold') return toggleChar('bold', 'عريض');
    if (k === 'it') return toggleChar('it', 'مائل');
    if (k === 'ul') return toggleChar('ul', 'تحته خط');
    if (k === 'sk') return toggleChar('sk', 'يتوسطه خط');
    if (k === 'clear') return clearFmt();
    if (k === 'painter') return st.painter ? ((st.painter = null), paintTools()) : armPainter(e.detail > 1);
    if (k === 'ind+' || k === 'ind-') return stepIndent(k === 'ind+' ? 1 : -1);
  }
  const al = e.target.closest('[data-al]');
  if (al) return applyPara({ al: al.dataset.al === 'j' ? null : al.dataset.al }, { r: 'محاذاة إلى اليمين', c: 'توسيط', l: 'محاذاة إلى اليسار', j: 'ضبط الطرفين' }[al.dataset.al]);
  const set = e.target.closest('#tPop [data-set]');
  if (set) {
    const k = set.dataset.set;
    const v = set.dataset.v;
    closePop();
    if (k === 'color') return applyChar({ color: v || null }, v ? 'لون' : 'لون الكتاب');
    if (k === 'bg') return applyChar({ bg: v || null }, v ? 'تظليل' : 'بلا تظليل');
    if (k === 'lh') return applyPara({ lh: v ? +v : null }, v ? `تباعد الأسطر ${ar(v)}` : 'تباعد الأسطر كالأسلوب');
    if (k === 'ls') return applyPara({ ls: v || null }, v ? 'قائمة' : 'بلا قائمة');
  }
  const ins = e.target.closest('#tPop [data-ins]');
  if (ins) {
    closePop();
    return insertBlock(ins.dataset.ins);
  }
  const tx = e.target.closest('#tPop [data-tx]');
  if (tx) {
    closePop();
    return textTool(tx.dataset.tx);
  }
  const ay = e.target.closest('#tPop [data-ayat]');
  if (ay) {
    closePop();
    return applyAyat(ay.dataset.ayat);
  }
  const sym = e.target.closest('#tPop [data-sym]');
  if (sym) {
    closePop();
    return insertSymbol(sym.dataset.sym);
  }
});
$('#tbar').addEventListener('change', (e) => {
  const c = e.target.closest('[data-custom]');
  if (!c) return;
  closePop();
  applyChar({ [c.dataset.custom]: c.value }, c.dataset.custom === 'color' ? 'لون' : 'تظليل');
});
async function stepIndent(d) {
  const cs = curStyle();
  const cur = (cs && cs.node.ps && cs.node.ps.is) || 0;
  const v = Math.max(0, cur + d * 6);
  applyPara({ is: v || null }, d > 0 ? 'زيادة المسافة البادئة' : 'إنقاص المسافة البادئة');
}

/* ---- أدوات النص العربي: تُغيّر الحروف وحدها، فيبقى نوع النص وتنسيقه ---- */
const TEXT_TOOLS = [
  ['harakat', 'إزالة التشكيل', 'الحركات والتنوين والشدة'],
  ['tatweel', 'إزالة التطويل', 'ـ بين الحروف'],
  ['hindi', 'الأرقام هندية', '123 ← ١٢٣'],
  ['latin', 'الأرقام عربية', '١٢٣ ← 123'],
  ['punct', 'علامات الترقيم العربية', ', ; ? ← ، ؛ ؟'],
  ['spaces', 'تصحيح المسافات', 'المكررة، وقبل علامات الترقيم وبعدها'],
  ['quotes', 'علامات التنصيص العربية', '"…" ← «…»'],
];
const TX = {
  harakat: (t) => t.replace(/[\u064B-\u0652\u0670]/g, ''),
  tatweel: (t) => t.replace(/\u0640/g, ''),
  hindi: (t) => toArabicDigits(t),
  latin: (t) => toLatinDigits(t),
  punct: (t) => t.replace(/,(?!\d)/g, '،').replace(/;/g, '؛').replace(/\?/g, '؟'),
  spaces: (t) => t.replace(/[ \t]{2,}/g, ' ').replace(/\s+([،؛:؟!.)\]»])/g, '$1').replace(/([(\[«])\s+/g, '$1').replace(/([،؛؟!])(?=[^\s\d)\]»،؛؟!.])/g, '$1 '),
  quotes: (t) => t.replace(/"([^"\n]{1,400})"/g, '«$1»').replace(/“([^”\n]{1,400})”/g, '«$1»'),
};
async function textTool(kind) {
  const fn = TX[kind];
  const tg = await fmtTargets();
  if (!fn || !tg) return toast('حدّد نصاً أو ضع المؤشر في فقرة أولاً');
  // المؤشر وحده: الفقرة كلها
  const spans = tg.caret ? tg.blocks.filter((x) => x.node && x.node.runs).map((x) => ({ ...x, from: 0, to: textOf(x.node).length })) : tg.spans;
  const ops = [];
  let n = 0;
  for (const x of spans) {
    const full = textOf(x.node);
    const old = full.slice(x.from, x.to);
    const ch = diffText(old, fn(old)).map((c) => ({ a: c.a + x.from, z: c.z + x.from, s: c.s }));
    if (ch.length) {
      ops.push({ op: 'edit', t: x.t, sig: sigOf(x.node), ch });
      n += ch.length;
    }
  }
  for (const x of tg.blocks) {
    if (x.node && x.node.type === 'verse') {
      const parts = x.node.parts.map((p) => fn(p));
      if (parts.join('|') !== x.node.parts.join('|')) ops.push({ op: 'edit', t: x.t, sig: sigOf(x.node), parts }), n++;
    } else if (x.node && (x.node.type === 'heading' || x.node.type === 'label')) {
      const t2 = fn(x.node.text || '');
      if (t2 !== x.node.text) ops.push({ op: 'edit', t: x.t, sig: sigOf(x.node), ch: [{ a: 0, z: (x.node.text || '').length, s: t2 }] }), n++;
    }
  }
  const name = (TEXT_TOOLS.find((x) => x[0] === kind) || [])[1];
  if (!ops.length) {
    st.pendingCaret && sendCaret(st.pendingCaret);
    st.pendingCaret = null;
    return toast(`${name}: لا شيء يتغيّر هنا`);
  }
  if (st.pendingCaret && st.pendingCaret.o2 != null) st.pendingCaret = { ...st.pendingCaret, o2: null };
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: name, text: `${N(n, 'موضع')}` });
}

/* ---- الإدراج ---- */
/** القطعة التي يُدرج بعدها: ما فيه المؤشر، أو المحدَّد، أو آخر الفصل الظاهر */
async function anchor() {
  const f = await flushEdit();
  if (f && f.t.b != null) return { b: f.t.b, o: f.from };
  if (f && f.t.n != null) return { b: blockOfNote(f.t.n) };
  const sel = st.sel;
  if (sel && sel.t && sel.t.b != null) return { b: sel.t.b, o: sel.level === 'span' || sel.level === 'run' ? sel.to : null };
  if (sel && sel.blocks) return { b: sel.blocks[sel.blocks.length - 1] };
  const sec = curSec();
  return sec ? { b: sec.b } : null;
}
async function insertBlock(kind) {
  if (kind === 'mcpage') return startCommentPage();
  if (kind === 'sideR' || kind === 'sideL' || kind === 'sideO') return insertSide(kind === 'sideR' ? 'r' : kind === 'sideL' ? 'l' : 'o');
  const an = await anchor();
  if (!an || !st.view) return;
  const node = st.view.blocks[an.b];
  if (kind === 'note') return insertNote(an);
  if (kind === 'image') {
    st.imgAnchor = an;
    $('#imgFile').value = '';
    return $('#imgFile').click();
  }
  let block;
  let label;
  if (kind === 'para') {
    block = { type: 'para', runs: [], ...(node && node.mt ? { mt: true } : {}), ...(node && node.sh ? { sh: true } : {}) };
    label = 'فقرة جديدة';
  } else if (/^h[1-4]$/.test(kind)) {
    block = { type: 'heading', level: +kind[1], text: 'عنوان جديد' };
    label = 'عنوان: ' + levelName(+kind[1]);
  } else if (kind === 'verse') {
    block = { type: 'verse', parts: ['الشطر الأول', 'الشطر الثاني'] };
    label = 'بيت شعر';
  } else if (kind === 'ornament') (block = { type: 'ornament' }), (label = 'فاصل زخرفي');
  else if (kind === 'hr') (block = { type: 'hr' }), (label = 'خط فاصل');
  else if (kind === 'pagebreak') (block = { type: 'pagebreak' }), (label = 'فاصل صفحة');
  else if (kind === 'table') {
    const row = (hdr) => ({ ...(hdr ? { hdr: true } : {}), cells: [0, 1, 2].map(() => ({ t: '' })) });
    block = { type: 'table', rtl: true, borders: true, cols: [33.33, 33.33, 33.34], rows: [row(true), row(), row()] };
    label = 'جدول';
    st.pendingCell = { i: node ? an.b + 1 : 0, r: 0, c: 0 };
  }
  if (!block) return;
  const op = node ? { op: 'insert', t: { vol: st.vol, b: an.b }, sig: sigOf(node), where: 'after', block } : { op: 'insert', vol: st.vol, pos: 0, block };
  const at = node ? an.b + 1 : 0;
  if (kind === 'para') {
    st.pendingCaret = { t: { vol: st.vol, b: at }, o: 0 };
    setTool('type');
  } else if (block.type === 'heading' || block.type === 'verse') st.pendingInline = at;
  st.sel = kind === 'para' ? null : { level: 'block', t: { vol: st.vol, b: at } };
  commit(op, { kind: 'kind', to: 'أُدرج: ' + label, text: node ? cut(textOf(node), 40) : '' });
}
function insertNote(an) {
  const node = st.view.blocks[an.b];
  if (!node || !node.runs) return toast('ضع المؤشر في فقرة لتُدرج عنده حاشية');
  const at = an.o != null ? an.o : textOf(node).length;
  const id = 'u' + opId();
  st.pendingCaret = { t: { vol: st.vol, n: id, g: 0 }, o: 0, o2: 1 };
  setTool('type');
  commit({ op: 'note', t: { vol: st.vol, b: an.b }, sig: sigOf(node), pos: at, nid: id, text: '…' }, { kind: 'kind', to: 'أُدرجت حاشية', text: cut(textOf(node).slice(Math.max(0, at - 30), at), 40) });
}
async function insertSymbol(s) {
  if (st.editing) return send({ type: 'insertText', s });
  const sel = st.sel;
  if (sel && (sel.level === 'span' || sel.level === 'run')) {
    const node = nodeOf(sel.t);
    if (node && node.runs) return commit({ op: 'edit', t: sel.t, sig: sigOf(node), ch: [{ a: sel.to, z: sel.to, s }] }, { kind: 'parts', old: '—', new: s });
  }
  toast('ضع المؤشر حيث تريد الرمز (أداة الكتابة)، ثم اختره');
}
/** صورة من الجهاز: تُصغَّر إن كبرت (٢٤٠٠ نقطة)، وتُدرج بعد القطعة */
$('#imgFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const img = await readImage(f);
    if (st.imgReplace) {
      const im = st.imgReplace;
      st.imgReplace = null;
      return commit({ op: 'img', t: im.t, sig: sigOf(im.node), set: { src: img.src, w: img.w, h: img.h } }, { kind: 'style', to: 'استُبدلت الصورة', text: im.node.cap || 'صورة' });
    }
    const an = st.imgAnchor || (await anchor());
    st.imgAnchor = null;
    const node = an && st.view.blocks[an.b];
    const block = { type: 'image', src: img.src, w: img.w, h: img.h, wPct: Math.min(100, Math.round((img.w / 6) * 10) / 10) > 70 ? 70 : 50, al: 'c' };
    const at = node ? an.b + 1 : 0;
    st.sel = { level: 'block', t: { vol: st.vol, b: at } };
    commit(node ? { op: 'insert', t: { vol: st.vol, b: an.b }, sig: sigOf(node), where: 'after', block } : { op: 'insert', vol: st.vol, pos: 0, block }, { kind: 'kind', to: 'أُدرجت صورة', text: f.name });
    setTool('select');
  } catch (err) {
    toast('تعذّرت قراءة الصورة: ' + (err.message || err), 4000);
  }
});
/** صورة من الحافظة (لُصقت وهو يكتب): تُصغَّر إن كبرت، وتُدرج بعد الفقرة */
async function pasteImage(m) {
  if (m.i == null) return;
  await flushEdit();
  const img = await new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      let w = im.naturalWidth;
      let h = im.naturalHeight;
      const k = Math.min(1, 2400 / Math.max(w, h));
      if (k >= 1 && m.size < 2.5e6 && !/webp/.test(m.mime || '')) return res({ src: m.src, w, h });
      w = Math.round(w * k);
      h = Math.round(h * k);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(im, 0, 0, w, h);
      res({ src: cv.toDataURL('image/png'), w, h });
    };
    im.onerror = () => res(null);
    im.src = m.src;
  });
  if (!img) return toast('تعذّرت قراءة الصورة');
  const node = st.view.blocks[m.i];
  if (!node) return;
  st.sel = { level: 'block', t: { vol: st.vol, b: m.i + 1 } };
  setTool('select');
  commit({ op: 'insert', t: { vol: st.vol, b: m.i }, sig: sigOf(node), where: 'after', block: { type: 'image', src: img.src, w: img.w, h: img.h, wPct: 50, al: 'c' } }, { kind: 'kind', to: 'أُلصقت صورة', text: cut(textOf(node), 40) });
}
function readImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('لا تُقرأ'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error('ليست صورة'));
      im.onload = () => {
        let w = im.naturalWidth;
        let h = im.naturalHeight;
        const MAX = 2400;
        // WebP يُحوَّل (Word لا يعرضه)
        if (w <= MAX && h <= MAX && file.size < 2.5e6 && !/webp/.test(file.type)) return res({ src: fr.result.replace(/^data:image\/jpg/, 'data:image/jpeg'), w, h });
        const k = Math.min(1, MAX / Math.max(w, h));
        w = Math.round(w * k);
        h = Math.round(h * k);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d').drawImage(im, 0, 0, w, h);
        const png = /png|gif|webp/.test(file.type);
        res({ src: cv.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9), w, h });
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---- الآيات: تُحدَّد بنص المصحف (بلا ذكاء اصطناعي) ---- */
/** المدى: المحدَّد، أو الفصل الظاهر، أو المجلد ← { a, b, name, span? } */
function ayatScope(k) {
  if (!st.view) return null;
  if (k === 'vol') return { a: 0, b: st.view.blocks.length - 1, name: 'المجلد كله' };
  if (k === 'sel') {
    const sel = st.sel;
    if (!sel) return null;
    if (sel.level === 'group' || sel.level === 'multi') return { a: Math.min(...sel.blocks), b: Math.max(...sel.blocks), only: new Set(sel.blocks), name: 'المحدَّد' };
    if (!sel.t) return null;
    if (sel.t.n != null) return { note: sel.t, name: 'الحاشية' };
    return { a: sel.t.b, b: sel.t.b, ...(sel.level === 'span' || sel.level === 'run' ? { span: [sel.from, sel.to] } : {}), name: 'المحدَّد' };
  }
  const sec = (st.whole ? null : st.sections[st.si]) || curSec();
  return sec ? { a: sec.a, b: sec.b, name: sec.title ? cut(sec.title, 36) : 'الفصل' } : { a: 0, b: st.view.blocks.length - 1, name: 'المجلد كله' };
}
/** الآيات غير المعلَّمة في مدى (وفي حواشيه) ← [{ t, from, to, text }] */
function ayatScan(scope) {
  if (!st.quran || !st.view || !scope) return [];
  const out = [];
  const scanNode = (t, node, span) => {
    if (!node || !node.runs) return;
    const full = runsText(node.runs);
    if (full.length < 16) return;
    const kinds = [];
    let p = 0;
    for (const r of node.runs) {
      const s = r.k === 'r' ? '' : r.s || '';
      kinds.push([p, p + s.length, r.k === 'm' && r.q ? 'q' : r.k]);
      p += s.length;
    }
    for (const h of findQuran(full, st.quran)) {
      if (span && (h.b <= span[0] || h.a >= span[1])) continue;
      const inside = kinds.filter(([x, y, k]) => y > h.a && x < h.b && k !== 'r');
      // ما كان آيةً كله يُترك، وما في المتن أو العنوان داخل السطر لا يُمسّ (آية المتن تُعلَّم من المتن نفسه)
      if (!inside.length || inside.every(([, , k]) => k === 'q') || inside.some(([, , k]) => k === 'm' || k === 'ht')) continue;
      let from = h.a;
      let to = h.b;
      // القوسان حول الآية المكتوبة يدخلان فيها (فيصيران ﴿ ﴾)
      const pre = /([﴿«("“[])\s*$/.exec(full.slice(Math.max(0, from - 3), from));
      const post = /^\s*([﴾»)"”\]])/.exec(full.slice(to, to + 3));
      if (pre && post) {
        from -= pre[0].length;
        to += post[0].length;
      }
      out.push({ t, from, to, text: full.slice(from, to) });
    }
  };
  if (scope.note) {
    const nt = st.view.notes[scope.note.n];
    (nt && nt.segs ? nt.segs : []).forEach((sg, g) => scanNode({ vol: st.vol, n: scope.note.n, g }, sg));
    return out;
  }
  const seen = new Set();
  for (let i = scope.a; i <= scope.b; i++) {
    if (scope.only && !scope.only.has(i)) continue;
    const blk = st.view.blocks[i];
    if (!blk || blk.type !== 'para') continue;
    scanNode({ vol: st.vol, b: i }, blk, scope.span || null);
    if (scope.span) continue;
    for (const r of blk.runs || []) {
      if (r.k !== 'r' || seen.has(r.id)) continue;
      seen.add(r.id);
      const nt = st.view.notes[r.id];
      (nt && nt.segs ? nt.segs : []).forEach((sg, g) => scanNode({ vol: st.vol, n: r.id, g }, sg));
    }
  }
  return out;
}
/** عمليات «اجعله آية» لمواضع كثيرة: في كل قطعةٍ من آخرها إلى أولها (فلا تتغيّر مواضع ما قبلها)، وتوقيع كلٍّ بعد ما سبقه */
function ayatOps(hits) {
  const by = new Map();
  for (const h of hits) {
    const k = JSON.stringify(h.t);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(h);
  }
  const ops = [];
  for (const list of by.values()) {
    list.sort((x, y) => y.from - x.from);
    const base = nodeOf(list[0].t);
    if (!base || !base.runs) continue;
    const node = JSON.parse(JSON.stringify(base));
    for (const h of list) {
      ops.push({ op: 'kind', t: h.t, sig: sigOf(node), from: h.from, to: h.to, kind: 'q' });
      retypeSpan(node, h.from, h.to, 'q');
    }
  }
  return ops;
}
function applyAyat(k) {
  if (!st.quran) return toast('يُحمَّل نص المصحف… أعد المحاولة بعد لحظة');
  const scope = ayatScope(k);
  const hits = ayatScan(scope);
  if (!hits.length) return toast(`لا آيات غير معلَّمة في ${scope ? scope.name : 'هذا الموضع'}`);
  const ops = ayatOps(hits);
  st.sel = null;
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: 'نص', to: 'آية', text: cut(hits[0].text, 40), ...(hits.length > 1 ? { count: hits.length } : {}) });
  toast(hits.length === 1 ? 'عُلّمت آيةٌ واحدة' : `عُلّمت ${N(hits.length, 'آية')} في ${scope.name}`);
}

/* ---- «اجعله حاشية»: نصٌّ من الكتاب يُنقل إلى حاشيةٍ على موضعٍ يُختار بنقرة ---- */
/** ما يصير حاشية: كلماتٌ من فقرة (بأنواعها)، أو قطعٌ كاملة ← { kind, … } */
function noteSource(sel) {
  if (!sel || !st.view) return null;
  if ((sel.level === 'span' || sel.level === 'run') && sel.t && sel.t.b != null) {
    const node = nodeOf(sel.t);
    if (!node || !node.runs) return null;
    const [, rest] = splitRunsAt(node.runs, sel.from);
    const [mid] = splitRunsAt(rest, sel.to - sel.from);
    const text = runsText(mid).trim();
    if (!text) return null;
    // الفقرة كلها: تُحذف القطعة لا نصها وحده
    if (sel.from <= 0 && sel.to >= runsText(node.runs).length) return { kind: 'blocks', blocks: [sel.t.b], segs: [{ type: 'p', runs: node.runs }], text };
    return { kind: 'span', t: sel.t, from: sel.from, to: sel.to, runs: mid, text };
  }
  const idx = sel.level === 'group' || sel.level === 'multi' ? sel.blocks : sel.level === 'block' && sel.t && sel.t.b != null ? [sel.t.b] : [];
  const list = idx.map((i) => ({ i, b: st.view.blocks[i] })).filter(({ b }) => b && /^(para|verse|heading)$/.test(b.type));
  if (!list.length) return null;
  const segs = list.map(({ b }) => (b.type === 'verse' ? { type: 'verse', parts: b.parts } : b.type === 'heading' ? { type: 'p', runs: [{ k: 't', s: b.text }] } : { type: 'p', runs: b.runs }));
  return { kind: 'blocks', blocks: list.map((x) => x.i), segs, text: list.map(({ b }) => blockText(b)).join(' ') };
}
async function startToNote() {
  if (st.editing) await flushEdit();
  const src = noteSource(st.sel);
  if (!src) return toast('حدّد أولاً ما يصير حاشية: كلماتٍ من المتن أو الشرح، أو فقرةً، أو فقرات');
  const refs = src.kind === 'blocks' ? src.blocks.reduce((n, i) => n + (st.view.blocks[i].runs || []).filter((r) => r.k === 'r').length, 0) : src.runs.filter((r) => r.k === 'r').length;
  if (refs && !confirm(`في هذا النص ${N(refs, 'إحالة')} إلى حواشٍ أخرى، وتُحذف مع نقله إلى حاشية. أتمضي؟`)) return;
  st.toNote = src;
  send({ type: 'pickPoint', on: true });
  const bar = $('#pickBar');
  bar.innerHTML = `<b>انقر الكلمة التي تُعلَّق عليها الحاشية</b><span>«${esc(cut(src.text, 60))}» يصير حاشيةً، ورقمها بعد الكلمة التي تنقرها.</span><button type="button" class="btn sm" data-act="pickCancel">إلغاء (Esc)</button>`;
  bar.hidden = false;
}
/* ---- المتون: صفحة تعليق في موضعٍ يُنقر ---- */
const muOn = () => !!(st.mu && st.mu.doc);
async function startCommentPage() {
  if (!muOn()) return toast('صفحة التعليق للمتون: اختر نوع «المتون» للكتاب أولاً');
  if (st.editing) await flushEdit();
  st.toNote = { kind: 'mcpage' };
  send({ type: 'pickPoint', on: true });
  const bar = $('#pickBar');
  bar.innerHTML = `<b>انقر الموضع الذي توضع بعده صفحة التعليق</b><span>كلمةً من المتن أو بيتاً: ينتهي الجزء عندها، وتليه صفحة تعليقٍ له، ويبدأ ما بعدها جزءاً جديداً.</span><button type="button" class="btn sm" data-act="pickCancel">إلغاء (Esc)</button>`;
  bar.hidden = false;
}
/**
 * صفحة تعليق بعد الموضع o من القطعة i: ينتهي جزؤه هنا (وتعليقه صفحةٌ تقابله)، ويبدأ ما بعده جزءاً
 * (الفقرة تُقسم عند الموضع إن كان في وسطها)
 */
async function addCommentPage(i, o) {
  if (st.editing) await flushEdit();
  const node = st.view && st.view.blocks[i];
  if (!node || !/^(para|verse)$/.test(node.type)) return toast('صفحة التعليق توضع بعد بيتٍ أو فقرةٍ من المتن');
  const t = { vol: st.vol, b: i };
  const ops = [];
  // موضع التعليق للجزء الذي ينتهي هنا: صفحة (وما حُدّد لغيرها في الجزء نفسه يصير صفحةً كذلك)
  const list = (st.mu.doc && st.mu.doc.list) || [];
  let ua = 0;
  for (const u of list) if (u.ui != null && u.ui <= i) ua = Math.max(ua, u.ui);
  const pageC = (b) => ({ ...((b.mu && b.mu.c) || {}), place: 'page' });
  for (let j = ua; j < i; j++) {
    const b = st.view.blocks[j];
    if (b && b.mu && b.mu.c && b.mu.c.place !== 'page') ops.push({ op: 'mu', t: { vol: st.vol, b: j }, sig: sigOf(b), set: { c: pageC(b) } });
  }
  ops.push({ op: 'mu', t, sig: sigOf(node), set: { c: pageC(node) } });
  const len = textOf(node).length;
  const mid = node.type === 'para' && o != null && o > 0 && o < len && textOf(node).slice(o).trim();
  if (mid) ops.push({ op: 'mu', t, sig: sigOf(node), split: [o, len], set: { cut: 1 } });
  else {
    const nx = st.view.blocks[i + 1];
    if (nx) ops.push({ op: 'mu', t: { vol: st.vol, b: i + 1 }, sig: sigOf(nx), set: { cut: 1 } });
  }
  st.sel = null;
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'kind', to: 'صفحة تعليق بعد هذا الموضع', text: cut(mid ? textOf(node).slice(Math.max(0, o - 40), o) : textOf(node), 40) });
  toast('أُضيفت صفحة تعليق بعد الموضع، وبدأ بعده جزءٌ جديد');
}
function cancelToNote(tell) {
  if (!st.toNote) return;
  st.toNote = null;
  send({ type: 'pickPoint', on: false });
  $('#pickBar').hidden = true;
  if (tell) toast('أُلغي');
}
function finishToNote(m) {
  const src = st.toNote;
  st.toNote = null;
  $('#pickBar').hidden = true;
  if (!src || m.cancel) return;
  if (src.kind === 'mcpage') return m.none || m.i == null || m.sd != null ? toast('صفحة التعليق توضع بعد كلمةٍ أو بيتٍ من المتن: أعد «صفحة تعليق» وانقر الموضع') : addCommentPage(m.i, m.o);
  if (src.kind === 'side') return m.none || m.i == null ? toast('الهامش يكون بإزاء فقرةٍ أو عنوانٍ أو بيت: أعد «إدراج ← هامش» وانقر واحداً منها') : addSideAt(m.i, src.k);
  if (m.none || m.i == null) return toast('موضع الحاشية كلمةٌ في فقرةٍ من الكتاب: أعد «حاشية…» وانقر الكلمة');
  const t = { vol: st.vol, b: m.i };
  const node = nodeOf(t);
  if (!node || !node.runs) return toast('موضع الحاشية يكون في فقرة');
  if (src.kind === 'blocks' && src.blocks.includes(m.i)) return toast('اختر موضعاً خارج النص الذي يصير حاشية');
  if (src.kind === 'span' && src.t.b === m.i && m.o > src.from && m.o < src.to) return toast('اختر موضعاً خارج النص الذي يصير حاشية');
  const id = 'u' + opId();
  const pos = Math.max(0, Math.min(runsText(node.runs).length, m.o | 0));
  const ops = [{ op: 'note', t, sig: sigOf(node), pos, nid: id, ...(src.kind === 'span' ? { runs: src.runs } : { segs: src.segs }) }];
  if (src.kind === 'span') {
    const sn = nodeOf(src.t);
    const full = runsText(sn.runs);
    let a = src.from;
    let z = src.to;
    // ومعه مسافةٌ واحدة، فلا تبقى مسافتان (ولا مسافةٌ قبل علامة الترقيم)
    if (/\s/.test(full[z] || '') && (a === 0 || /\s/.test(full[a - 1] || ''))) z++;
    else if (a > 0 && /\s/.test(full[a - 1]) && (z >= full.length || /[\s.،؛:!؟)»﴾\]]/.test(full[z]))) a--;
    ops.push({ op: 'edit', t: src.t, sig: sigOf(sn), ch: [{ a, z, s: '' }] });
  } else for (const i of [...src.blocks].sort((x, y) => y - x)) ops.push({ op: 'remove', t: { vol: st.vol, b: i }, sig: sigOf(st.view.blocks[i]) });
  st.sel = null;
  commit({ op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: 'نص', to: 'حاشية', text: cut(src.text, 40) });
  toast(`صار حاشيةً على «${cut(m.word || runsText(nodeOf(t) ? nodeOf(t).runs : []).slice(Math.max(0, pos - 20), pos), 30)}»`);
}
$('#pickBar').addEventListener('click', (e) => {
  if (e.target.closest('[data-act="pickCancel"]')) cancelToNote(true);
});

/* ---- الهامش الجانبي: ما يُكتب في هامش الصفحة بإزاء القطعة ---- */
/* ---- الهامش الجانبي: نصٌّ منسَّق في هامش الصفحة بإزاء القطعة (الأيمن، والأيسر، والمتبادل بين الفردية والزوجية) ---- */
const SIDE_NAMES = { r: 'الأيمن', l: 'الأيسر', a: 'المتبادل', o: 'في الطرف الخارجي' };
/** القطعة التي للهامش (المحدَّد قطعةٌ أو هامشٌ منها) */
function sideOwner(cs) {
  if (!cs || cs.t.b == null) return null;
  const t = { vol: st.vol, b: cs.t.b };
  const node = st.view.blocks[cs.t.b];
  return node && /^(para|heading|verse|label)$/.test(node.type) ? { t, node } : null;
}
/** خانة حدٍّ من حدود الهامش (مم) */
const sboxNum = (k, f, label, v, ph, min, max, title = '') =>
  `<label class="pf" ${title ? `title="${esc(title)}"` : ''}><span>${esc(label)}</span><input type="number" data-sbox="${f}" data-k="${k}" value="${v == null ? '' : v}" step="0.5" min="${min}" max="${max}" placeholder="${esc(ph)}"><small>مم</small></label>`;
function sideTab(cs) {
  const ow = sideOwner(cs);
  if (!ow) return '';
  const sd = ow.node.side || {};
  const what = ow.node.type === 'heading' ? 'العنوان' : ow.node.type === 'verse' ? 'البيت' : 'الفقرة';
  const keys = ['r', 'l', 'a'].filter((k) => sd[k]);
  const rows = keys
    .map((k) => {
      const txt = sideText(sd[k]).replace(/\s*\n\s*/g, ' / ');
      const on = cs.inSide && cs.t.sd === k;
      const part = typeof sd[k] === 'object' ? sd[k] : {};
      const bx = part.box || {};
      return `<div class="side-row${on ? ' on' : ''}">
        <div class="side-txt" dir="auto">${esc(cut(txt, 70))}</div>
        <div class="prow"><span>موضعه</span><div class="seg">${['r', 'l', 'a'].map((x) => `<button type="button" data-side="mv" data-from="${k}" data-to="${x}" aria-pressed="${x === k}" title="${x === 'a' ? 'يتبدّل بين الصفحات: انظر «المتبادل» تحته' : 'في الهامش ' + SIDE_NAMES[x] + ' في كل صفحة'}">${x === 'r' ? 'يمين' : x === 'l' ? 'يسار' : 'متبادل'}</button>`).join('')}</div></div>
        <div class="sbox-f" title="حدود الهامش بالمليمتر: فارغةً تكون تلقائية (عرض الهامش كله، بإزاء أول ${what}). وتُغيَّر كذلك بسحب مقابضه في الصفحة">
          ${sboxNum(k, 'w', 'العرض', bx.w, 'تلقائي', 6, 160)}${sboxNum(k, 'h', 'الارتفاع', bx.h, 'بقدر نصه', 4, 280)}
          ${sboxNum(k, 'dy', 'أعلى ' + what + ' بـ', bx.dy, '٠', -250, 300, 'بُعده عن أول ' + what + ' نزولاً (وبالسالب صعوداً)')}${sboxNum(k, 'x', 'عن حافة الصفحة', bx.x, 'وسط الهامش', -20, 200, 'بُعده عن حافة الصفحة التي هو فيها')}
          ${part.box ? `<button type="button" class="tl" data-side="autobox" data-k="${k}" title="عرضٌ وموضعٌ تلقائيان">↺ تلقائي</button>` : ''}
        </div>
        <div class="bacts"><button type="button" class="btn sm" data-side="write" data-k="${k}">اكتب فيه</button><button type="button" class="tl quiet" data-side="del" data-k="${k}">احذفه</button></div>
      </div>`;
    })
    .join('');
  const add = ['r', 'l', 'a'].filter((k) => !sd[k]);
  const alt = sd.alt === 'ol' || sd.alt === 'out' ? sd.alt : 'or';
  return `<p class="pp-note">ما يُكتب في الهامش يُطبع في هامش الصفحة بإزاء أول ${what}: عنوانٌ جانبي، أو تلخيص، أو تنبيه. يُكتب فيه في الصفحة نفسها، ويُنسَّق كسائر النصوص (الخط ومقاسه ولونه، والعريض، والمحاذاة) من شريط التنسيق.</p>
    ${rows || '<p class="pp-note">لا هامش لهذه القطعة بعد.</p>'}
    ${add.length ? `<div class="prow"><span>أضف</span><div class="seg wrap">${add.map((k) => `<button type="button" data-side="add" data-k="${k}">${k === 'a' ? 'هامشاً متبادلاً' : 'هامشاً ' + SIDE_NAMES[k]}</button>`).join('')}${!sd.r && !sd.l ? '<button type="button" data-side="both" title="هامشان معاً: الأيمن والأيسر">الاثنين معاً</button>' : ''}</div></div>` : ''}
    ${sd.a || add.includes('a') ? `<div class="prow"><span>المتبادل</span><div class="seg wrap">${Object.entries(SIDE_ALTS).map(([v, t]) => `<button type="button" data-side="alt" data-alt="${v}" aria-pressed="${!!sd.a && alt === v}" ${sd.a ? '' : 'disabled'}>${t}</button>`).join('')}</div></div>` : ''}
    <label class="sty-box"><input type="checkbox" data-side-frame ${st.settings && st.settings.sideNote && st.settings.sideNote.box ? 'checked' : ''}><span>نصوص الهامش في خانة <small>— إطارٌ بقدر نصه، للكتاب كله (وفي «الأسلوب»)</small></span></label>
    <p class="pp-note">يُكتب بخط الحواشي، ويأخذ عرض هامش الصفحة ما لم تحدّد عرضه. وفي الصفحة: مرّ عليه فتظهر مقابضه، فاسحبه إلى حيث شئت أو غيّر عرضه وارتفاعه. ويُدرج كذلك من «إدراج ← هامش أيمن / أيسر».</p>`;
}
async function sideAct(b) {
  const cs = curStyle();
  const ow = sideOwner(cs);
  if (!ow) return;
  if (st.editing) await flushEdit();
  const node = st.view.blocks[ow.t.b];
  if (!node) return;
  const sd = node.side || {};
  const act = b.dataset.side;
  const k = b.dataset.k;
  const base = { op: 'side', t: ow.t, sig: sigOf(node) };
  const label = (x) => ({ kind: 'style', to: x, text: cut(textOf(node), 40) });
  const PH = 'هامش';
  const writeAt = (key, len) => {
    st.pendingCaret = { t: { vol: st.vol, b: ow.t.b, sd: key }, o: 0, o2: len };
    st.sel = null;
    setTool('type');
  };
  if (act === 'write' && sd[k]) {
    writeAt(k, 0);
    sendCaret(st.pendingCaret);
    st.pendingCaret = null;
    return;
  }
  if (act === 'add') {
    writeAt(k, PH.length);
    return commit({ ...base, set: { [k]: PH, ...(k === 'a' && !sd.a ? { alt: 'or' } : {}) } }, label('هامش ' + SIDE_NAMES[k]));
  }
  if (act === 'both') {
    writeAt('r', PH.length);
    return commit({ ...base, set: { r: PH, l: PH } }, label('هامشان: الأيمن والأيسر'));
  }
  if (act === 'del') {
    st.sel = { level: 'block', t: ow.t };
    return commit({ ...base, set: { [k]: null } }, label('حُذف الهامش ' + SIDE_NAMES[k]));
  }
  if (act === 'mv') {
    const from = b.dataset.from;
    const to = b.dataset.to;
    if (from === to || !sd[from]) return;
    st.sel = { level: 'block', t: { vol: st.vol, b: ow.t.b, sd: to } };
    return commit({ ...base, mv: [from, to], ...(to === 'a' && !sd.a ? { set: { alt: 'or' } } : {}) }, label('الهامش إلى ' + SIDE_NAMES[to]));
  }
  if (act === 'alt') return commit({ ...base, set: { alt: b.dataset.alt } }, label('الهامش المتبادل: ' + SIDE_ALTS[b.dataset.alt]));
  if (act === 'autobox' && sd[k]) return commit({ ...base, box: [k, null] }, label('الهامش ' + SIDE_NAMES[k] + ': حدودٌ تلقائية'));
}
/** حدٌّ من حدود الهامش كُتب في «الخصائص ← الهامش» */
async function sideBoxField(inp) {
  const cs = curStyle();
  const ow = sideOwner(cs);
  if (!ow) return;
  if (st.editing) await flushEdit();
  const node = st.view.blocks[ow.t.b];
  const k = inp.dataset.k;
  if (!node || !node.side || !node.side[k]) return;
  const raw = inp.value.trim();
  const v = raw === '' ? null : parseFloat(raw);
  if (raw !== '' && !Number.isFinite(v)) return;
  const f = inp.dataset.sbox;
  const names = { w: 'عرض الهامش', h: 'ارتفاع الهامش', dy: 'موضع الهامش', x: 'بُعد الهامش عن الحافة' };
  commit({ op: 'side', t: ow.t, sig: sigOf(node), box: [k, { [f]: v }] }, { kind: 'style', to: v == null ? names[f] + ': تلقائي' : `${names[f]} ${ar(v)} مم`, text: cut(textOf(node), 40) });
}

/* ---- إدراج ← هامش أيمن أو أيسر: بإزاء الفقرة التي فيها المؤشر (أو المحدَّدة)، وإلا يُنقر موضعه ---- */
const SIDE_OK = /^(para|heading|verse|label)$/;
async function insertSide(k) {
  const f = st.editing ? await flushEdit() : null;
  let b = f && f.t && f.t.b != null ? f.t.b : null;
  if (b == null && st.sel && st.sel.t && st.sel.t.b != null) b = st.sel.t.b;
  if (b == null && st.sel && st.sel.blocks) b = st.sel.blocks[0];
  const node = b != null && st.view ? st.view.blocks[b] : null;
  if (node && SIDE_OK.test(node.type)) return addSideAt(b, k);
  // لا فقرة محدَّدة: تُنقر الفقرة التي يكون الهامش بإزائها
  st.toNote = { kind: 'side', k };
  send({ type: 'pickPoint', on: true });
  const bar = $('#pickBar');
  bar.innerHTML = `<b>انقر الفقرة التي يكون الهامش ${SIDE_NAMES[k]} بإزائها</b><span>فقرةً أو عنواناً أو بيتاً: يوضع الهامش بجانب أولها، وتكتب فيه في الحال، ثم تنقله وتغيّر عرضه وارتفاعه من مقابضه.</span><button type="button" class="btn sm" data-act="pickCancel">إلغاء (Esc)</button>`;
  bar.hidden = false;
}
/** هامشٌ k بإزاء القطعة b، والمؤشر فيه (وكلمة «هامش» محدَّدةٌ فيه فيحلّ محلها ما يُكتب)
 *  (o: في الطرف الخارجي من الكتاب — هامشٌ متبادل a بـ alt: 'out') */
function addSideAt(b, k0) {
  const k = k0 === 'o' ? 'a' : k0;
  const t = { vol: st.vol, b };
  const node = nodeOf(t);
  if (!node || !SIDE_OK.test(node.type)) return toast('الهامش يكون بإزاء فقرةٍ أو عنوانٍ أو بيت');
  const sd = node.side || {};
  if (sd[k]) {
    // له هامشٌ في هذه الجهة: يُكتب فيه
    sendCaret({ t: { vol: st.vol, b, sd: k }, o: 0, o2: sideText(sd[k]).length });
    return toast(`لهذه القطعة هامشٌ ${SIDE_NAMES[k]}، فاكتب فيه`);
  }
  const PH = 'هامش';
  st.sel = null;
  st.pendingCaret = { t: { vol: st.vol, b, sd: k }, o: 0, o2: PH.length };
  const alt = k0 === 'o' ? { alt: 'out' } : k === 'a' ? { alt: 'or' } : {};
  commit({ op: 'side', t, sig: sigOf(node), set: { [k]: PH, ...alt } }, { kind: 'style', to: 'هامش ' + SIDE_NAMES[k0], text: cut(textOf(node), 40) });
}
/** الهامش سُحب في الصفحة (sideBox من الإطار): نُقل، أو غُيّر عرضه أو ارتفاعه — بالمليمتر */
async function sideMoved(m) {
  if (st.editing) await flushEdit();
  const t = { vol: st.vol, b: m.i };
  const node = nodeOf(t);
  const part = node && node.side && node.side[m.sd];
  if (!part) return;
  const base = { op: 'side', t, sig: sigOf(node) };
  const label = (x) => ({ kind: 'style', to: x, text: cut(sideText(part).replace(/\s+/g, ' '), 40) || 'الهامش' });
  if (m.box) {
    st.sel = { level: 'block', t: { ...t, sd: m.sd } };
    return commit({ ...base, box: [m.sd, m.box] }, label(m.box.w != null ? `عرض الهامش ${ar(m.box.w)} مم` : `ارتفاع الهامش ${ar(m.box.h)} مم`));
  }
  // النقل: إلى الهامش الآخر إن عُبر به وسط الصفحة، وبإزاء قطعةٍ أخرى إن وُضع عندها (فيتبعها)
  let key = m.slot && m.sd !== 'a' ? m.slot : m.sd;
  if (key !== m.sd && node.side[key]) key = m.sd; // في الجهة الأخرى هامشٌ له: يبقى في جهته
  const box = { ...(part.box || {}), x: m.x };
  const toNode = m.to != null ? nodeOf({ vol: st.vol, b: m.to }) : null;
  if (toNode && SIDE_OK.test(toNode.type) && !(toNode.side && toNode.side[key])) {
    const moved = { ...part, box: { ...box, dy: m.dyTo } };
    st.sel = { level: 'block', t: { vol: st.vol, b: m.to, sd: key } };
    return commit(
      { op: 'batch', vol: st.vol, ops: [{ ...base, set: { [m.sd]: null } }, { op: 'side', t: { vol: st.vol, b: m.to }, sig: sigOf(toNode), set: { [key]: moved } }] },
      label(`نُقل الهامش بإزاء «${cut(textOf(toNode), 24)}»`),
    );
  }
  const moved = { ...part, box: { ...box, dy: m.dy } };
  st.sel = { level: 'block', t: { ...t, sd: key } };
  return commit({ ...base, set: key !== m.sd ? { [m.sd]: null, [key]: moved } : { [key]: moved } }, label(key !== m.sd ? 'الهامش إلى ' + SIDE_NAMES[key] : 'نُقل الهامش'));
}

/* ---- أوامر القطعة: نقل، تكرار، حذف ---- */
function blockAct(act) {
  const sel = st.sel;
  if (!sel || !sel.t || sel.t.b == null) return;
  const node = nodeOf(sel.t);
  if (!node) return;
  const name = describe({ level: 'block', t: sel.t }).name;
  if (act === 'up' || act === 'down') {
    const d = act === 'up' ? -1 : 1;
    const j = sel.t.b + d;
    if (j < 0 || j >= st.view.blocks.length) return;
    st.sel = { level: 'block', t: { vol: st.vol, b: j } };
    return commit({ op: 'move', t: sel.t, sig: sigOf(node), d }, { kind: 'kind', to: d < 0 ? 'نُقل إلى أعلى' : 'نُقل إلى أسفل', text: cut(textOf(node), 40) || name });
  }
  if (act === 'dup') {
    st.sel = { level: 'block', t: { vol: st.vol, b: sel.t.b + 1 } };
    return commit({ op: 'insert', t: sel.t, sig: sigOf(node), where: 'after', block: clone(node) }, { kind: 'kind', to: 'نُسخ', text: cut(textOf(node), 40) || name });
  }
  if (act === 'del') {
    st.sel = null;
    return commit({ op: 'remove', t: sel.t, sig: sigOf(node) }, { kind: 'parts', old: cut(textOf(node), 40) || name, new: '—' });
  }
}

/* ---- الأنماط (كأنماط InDesign): نمط فقرة ونمط حرف، مرتبطان بما يُطبَّقان عليه ---- */
// أنماط الكتاب، وتحتها أنماط الأسلوب المختار (تظهر جاهزةً، وتعديلها يحفظ نسخةً في الكتاب باسمها)
const ustyles = () => ({ ...((st.settings && st.settings.ustyles) || {}), ...((st.view && st.view.ustyles) || {}) });
function ustPreview(x) {
  const s = x.st || {};
  return [s.font ? `font-family:'${String(s.font).replace(/['";]/g, '')}'` : '', s.color ? `color:${s.color}` : '', s.bold ? 'font-weight:700' : '', s.it ? 'font-style:italic' : '', s.bg ? `background:${s.bg}` : '', s.ul ? 'text-decoration:underline' : ''].filter(Boolean).join(';');
}
function stylesTab(cs) {
  const U = ustyles();
  const list = (kind) => Object.entries(U).filter(([, x]) => x.kind === kind);
  const curP = cs.pst && U[cs.pst] ? cs.pst : null;
  const curC = cs.st.cs && U[cs.st.cs] ? cs.st.cs : null;
  const chips = (kind, cur) => {
    const l = list(kind);
    return l.length ? l.map(([sid, x]) => `<button type="button" class="ust${sid === cur ? ' on' : ''}" data-ust="${sid}" style="${esc(ustPreview(x))}" title="${kind === 'p' ? 'طبّقه على الفقرة' : 'طبّقه على المحدَّد'}">${esc(x.name)}</button>`).join('') : `<span class="ust-none">لا أنماط بعد</span>`;
  };
  const form = (kind) =>
    st.ustNew === kind
      ? `<div class="ust-form"><input type="text" id="ustName" maxlength="60" placeholder="${kind === 'p' ? 'اسم النمط: تنبيه، فائدة، قاعدة…' : 'اسم النمط: مصطلح، علم، كلمة مشروحة…'}"><button type="button" class="btn sm pri" data-ust-save="${kind}">احفظ</button><button type="button" class="tl quiet" data-ust-cancel>إلغاء</button></div>`
      : `<button type="button" class="tl" data-ust-new="${kind}">＋ ${kind === 'p' ? 'نمط من هذه الفقرة' : 'نمط من المحدَّد'}</button>`;
  const curBox = (kind, sid) =>
    sid
      ? `<div class="ust-cur"><span>${kind === 'p' ? 'نمط الفقرة' : 'نمط المحدَّد'}: <b>${esc(U[sid].name)}</b></span><button type="button" class="tl" data-ust-redef="${sid}" title="يأخذ النمط تنسيق ${kind === 'p' ? 'هذه الفقرة' : 'المحدَّد'}، فيتغيّر كل ما يحمله في الكتاب">حدّث النمط بهذا التنسيق</button><button type="button" class="tl quiet" data-ust-unlink="${kind}">افصله</button><button type="button" class="tl quiet" data-ust-del="${sid}">احذف النمط</button></div>`
      : '';
  return `${cs.inNote ? '' : `<div class="ust-sec"><h5>أنماط الفقرة</h5><div class="usts">${chips('p', curP)}</div>${curBox('p', curP)}${form('p')}</div>`}
    <div class="ust-sec"><h5>أنماط الحرف</h5><div class="usts">${chips('c', curC)}</div>${curBox('c', curC)}${form('c')}</div>
    <p class="pp-note">النمط مرتبط بما طُبّق عليه: إن حدّثته تغيّر في الكتاب كله (وفي كل مجلداته)، ويبقى ما نسّقته بيدك فوقه.</p>`;
}
/** تنسيق ما عند المؤشر ← قيم النمط */
function captureStyle(kind) {
  const cs = curStyle();
  if (!cs) return null;
  const s = { ...cs.st };
  delete s.k;
  delete s.cs;
  if (kind === 'c') return { st: s };
  // تنسيق الفقرة الفعلي: نمطها ثم ما فوقه
  const sty = cs.pst ? ustyles()[cs.pst] : null;
  const ps = { ...((sty && sty.ps) || {}), ...((cs.node && cs.node.ps) || {}) };
  delete ps.pst;
  delete ps.pb;
  return { st: s, ps, al: cs.node.al || (sty && sty.al) || null };
}
async function ustAct(b) {
  const U = ustyles();
  const cs = curStyle();
  if (!cs) return;
  if (b.dataset.ust) {
    const sid = b.dataset.ust;
    const x = U[sid];
    if (!x) return;
    if (x.kind === 'p') return applyPara({ pst: sid, al: null, ind: null, is: null, ie: null, sb: null, sa: null, lh: null, bx: null, drop: null }, 'نمط الفقرة: ' + x.name);
    return applyChar({ cs: sid }, 'نمط الحرف: ' + x.name);
  }
  if (b.dataset.ustNew) {
    st.ustNew = b.dataset.ustNew;
    renderProps();
    setTimeout(() => $('#ustName') && $('#ustName').focus(), 0);
    return;
  }
  if (b.dataset.ustCancel !== undefined) {
    st.ustNew = null;
    return renderProps();
  }
  if (b.dataset.ustSave) {
    const kind = b.dataset.ustSave;
    const name = (($('#ustName') || {}).value || '').trim();
    if (!name) return $('#ustName') && $('#ustName').focus();
    st.ustNew = null;
    const cap = captureStyle(kind);
    const sid = 's' + opId();
    const def = { op: 'defstyle', sid, name, kind, ...cap };
    // يُعرَّف النمط ويُطبَّق على ما صُنع منه
    if (kind === 'p') {
      if (cs.t.b == null) return;
      return commit({ op: 'batch', vol: null, ops: [def, { op: 'pstyle', t: cs.t, sig: sigOf(cs.node), ps: { pst: sid, al: null, ind: null, is: null, ie: null, sb: null, sa: null, lh: null, bx: null, drop: null } }] }, { kind: 'style', to: 'نمط جديد: ' + name, text: textOf(cs.node) });
    }
    const tg = await fmtTargets();
    const ops = [def];
    if (tg) for (const x of tg.spans) if (x.to > x.from) ops.push({ op: 'style', t: x.t, sig: sigOf(x.node), from: x.from, to: x.to, st: { cs: sid } });
    return commit({ op: 'batch', vol: null, ops }, { kind: 'style', to: 'نمط جديد: ' + name, text: textOf(cs.node).slice(0, 40) });
  }
  if (b.dataset.ustRedef) {
    const sid = b.dataset.ustRedef;
    const x = U[sid];
    if (!x) return;
    const cap = captureStyle(x.kind);
    return commit({ op: 'defstyle', sid, name: x.name, kind: x.kind, ...cap }, { kind: 'style', to: 'حُدِّث النمط: ' + x.name, text: 'في الكتاب كله' });
  }
  if (b.dataset.ustUnlink) return b.dataset.ustUnlink === 'p' ? applyPara({ pst: null }, 'بلا نمط فقرة') : applyChar({ cs: null }, 'بلا نمط حرف');
  if (b.dataset.ustDel) {
    const sid = b.dataset.ustDel;
    const x = U[sid];
    if (!x) return;
    return commit({ op: 'defstyle', sid, remove: true }, { kind: 'style', to: 'حُذف النمط: ' + x.name, text: 'وبقي ما طُبّق عليه بتنسيق الكتاب' });
  }
}

/* ---- ملاحظات المراجع: على القطعة، في الهامش خارج الصفحة، ولا تُطبع ---- */
function openMemo(i) {
  if (!st.view || !st.view.blocks[i]) return;
  select({ level: 'block', t: { vol: st.vol, b: i } });
  st.propTab = 'blk';
  renderProps();
  const ta = $('#memoIn');
  if (ta) {
    ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    ta.focus();
  }
}
function saveMemo(del) {
  const sel = st.sel;
  if (!sel || !sel.t || sel.t.b == null) return;
  const node = nodeOf(sel.t);
  if (!node) return;
  const text = del ? '' : (($('#memoIn') || {}).value || '').trim();
  if (!del && text === ((node.memo && node.memo.text) || '')) return;
  commit({ op: 'memo', t: sel.t, sig: sigOf(node), text }, { kind: 'style', to: del || !text ? 'حُذفت الملاحظة' : 'ملاحظة للمراجع', text: cut(text || textOf(node), 50) });
}
function renderMemos() {
  const box = $('#memoCard');
  if (!box || !st.view) return;
  const list = st.view.blocks.map((b, i) => (b.memo && b.memo.text ? { i, b } : null)).filter(Boolean);
  box.hidden = !list.length;
  if (!list.length) return;
  box.innerHTML = `<details ${box.querySelector('details[open]') ? 'open' : ''}><summary><span>ملاحظات المراجعة</span><b class="cnt">${ar(list.length)}</b></summary><ol class="memos">${list
    .map(({ i, b }) => `<li><button type="button" data-memo-go="${i}"><b>${esc(cut(b.memo.text, 90))}</b><small>${esc(cut(textOf(b), 40))} · ${esc(cut(st.sections[sectionOf(i)].title, 20))}</small></button></li>`)
    .join('')}</ol></details>`;
}
$('#memoCard').addEventListener('click', (e) => {
  const b = e.target.closest('[data-memo-go]');
  if (!b) return;
  const i = +b.dataset.memoGo;
  openMemo(i);
  goBlock(i, 'sel');
});

/* ---- الجدول ---- */
function tableAct(b) {
  const sel = st.sel;
  if (!sel || !sel.t || sel.t.b == null) return;
  const node = nodeOf(sel.t);
  if (!node || node.type !== 'table') return;
  const c0 = st.cell || { r: 0, c: 0 };
  const d = b.dataset;
  if (d.tbl) {
    const names = { rowBefore: 'صف قبله', rowAfter: 'صف بعده', colBefore: 'عمود قبله', colAfter: 'عمود بعده', rowDel: 'حُذف الصف', colDel: 'حُذف العمود', hdr: 'صف العنوان', borders: 'حدود الخلايا' };
    if (d.tbl === 'rowAfter') st.cell = { r: c0.r + 1, c: c0.c };
    if (d.tbl === 'colAfter') st.cell = { r: c0.r, c: c0.c + 1 };
    if (d.tbl === 'rowDel') st.cell = { r: Math.max(0, c0.r - 1), c: c0.c };
    if (d.tbl === 'colDel') st.cell = { r: c0.r, c: Math.max(0, c0.c - 1) };
    return commit({ op: 'table', t: sel.t, sig: sigOf(node), act: d.tbl, r: c0.r, c: c0.c }, { kind: 'style', to: 'الجدول: ' + names[d.tbl], text: 'جدول' });
  }
  const cell = ((node.rows[c0.r] || {}).cells || [])[c0.c] || {};
  const set = d.cell === 'b' ? { b: cell.b ? null : true } : d.cal ? { al: cell.al === d.cal ? null : d.cal } : d.cbg ? { bg: /^#fff(fff)?$/i.test(d.cbg) ? null : d.cbg } : null;
  if (set) commit({ op: 'cell', t: sel.t, sig: sigOf(node), r: c0.r, c: c0.c, set }, { kind: 'style', to: 'تنسيق الخلية', text: cut(cell.t || '—', 30) });
}

/* ---- الجدول ← نص: يُستخرج كلامه فقراتٍ ويُحذف الجدول (والطريقة تُحفظ لما بعده) ---- */
const UT_KEY = 'warraq.untable';
function utOpts() {
  let o = {};
  try {
    o = JSON.parse(localStorage.getItem(UT_KEY) || '{}') || {};
  } catch {}
  return { mode: UNTABLE_MODES[o.mode] ? o.mode : 'row', sep: UNTABLE_SEPS.some(([v]) => v === o.sep) ? o.sep : '، ', hdr: ['heading', 'para', 'drop'].includes(o.hdr) ? o.hdr : 'heading', reverse: !!o.reverse };
}
function utSave(o) {
  try {
    localStorage.setItem(UT_KEY, JSON.stringify(o));
  } catch {}
}
/** الطريقة المختارة، مع ما يصلح لهذا الجدول */
function utFor(node) {
  const o = utOpts();
  const hasHdr = !!(node.rows && node.rows.length > 1 && node.rows[0].hdr);
  if (o.mode === 'verse' && !tableLooksVerse(node)) o.mode = 'row';
  if (o.mode === 'kv' && !hasHdr) o.mode = 'row';
  if (o.mode === 'kv') o.hdr = 'drop'; // صف العنوان أسماءٌ للقيم
  return { ...o, hasHdr };
}
const tablesIn = (a, b) => {
  const out = [];
  for (let i = a; i <= b; i++) if (st.view.blocks[i] && st.view.blocks[i].type === 'table') out.push(i);
  return out;
};
function untableHtml(node) {
  const o = utFor(node);
  const verseOk = tableLooksVerse(node);
  const rows = (node.rows || []).length;
  const cols = Math.max(0, ...(node.rows || []).map((r) => (r.cells || []).length));
  const modes = Object.entries(UNTABLE_MODES).filter(([k]) => (k === 'verse' ? verseOk : k === 'kv' ? o.hasHdr : true));
  const prev = tableToBlocks(node, o);
  const pv = prev
    .slice(0, 4)
    .map((b) => (b.type === 'heading' ? `<b class="ut-h">${esc(cut(b.text, 80))}</b>` : b.type === 'verse' ? `<span class="ut-v">${esc(cut(b.parts[0], 34))} <i>…</i> ${esc(cut(b.parts[1], 34))}</span>` : `<span>${esc(cut(runsText(b.runs), 110))}</span>`))
    .join('');
  const all = tablesIn(0, st.view.blocks.length - 1).length;
  return `<div class="sc-sec ut"><h4>حوّل الجدول نصاً <small>${N(rows, 'صف')} × ${N(cols, 'عمود')}</small></h4>
    <div class="kinds">${modes.map(([k, n]) => `<button type="button" class="kc${o.mode === k ? ' on' : ''}" data-ut="mode" data-v="${k}" aria-pressed="${o.mode === k}">${esc(n)}</button>`).join('')}</div>
    <div class="ut-opts">
      ${o.mode !== 'cell' && o.mode !== 'verse' ? `<label>بين الخلايا <select data-utk="sep">${UNTABLE_SEPS.map(([v, n]) => `<option value="${esc(v)}" ${o.sep === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
      ${o.hasHdr && o.mode !== 'kv' ? `<label>صف العنوان <select data-utk="hdr"><option value="heading" ${o.hdr === 'heading' ? 'selected' : ''}>عنواناً</option><option value="para" ${o.hdr === 'para' ? 'selected' : ''}>فقرةً غامقة</option><option value="drop" ${o.hdr === 'drop' ? 'selected' : ''}>يُحذف</option></select></label>` : ''}
      <label class="chk"><input type="checkbox" data-utk="reverse" ${o.reverse ? 'checked' : ''}> اعكس ترتيب الخلايا</label>
    </div>
    ${pv ? `<div class="ut-pv" aria-label="معاينة">${pv}${prev.length > 4 ? `<small>… و${ar(prev.length - 4)} غيرها</small>` : ''}</div>` : '<p class="sc-note">الجدول فارغ: يُحذف.</p>'}
    <div class="bacts"><button type="button" class="btn sm pri" data-act="untable">حوّله نصاً${prev.length ? ' — ' + N(prev.length, 'قطعة') : ''}</button>${all > 1 ? `<button type="button" class="btn sm" data-act="untableAll" title="بالطريقة نفسها">كل جداول المجلد (${ar(all)})</button>` : ''}</div>
    <p class="sc-note">يُكتب في جدول الخطأ والصواب، ويُرجع عنه بـ Ctrl+Z.</p></div>`;
}
function untableAct(el) {
  const o = utOpts();
  const d = el.dataset;
  if (d.ut === 'mode') o.mode = d.v;
  else if (d.utk === 'sep') o.sep = el.value;
  else if (d.utk === 'hdr') o.hdr = el.value;
  else if (d.utk === 'reverse') o.reverse = el.checked;
  else if (d.act === 'untable') return untable();
  else if (d.act === 'untableAll') return untable(true);
  utSave(o);
  renderSel();
}
/** تحويل الجدول المحدَّد (أو كل جداول المجلد) */
function untable(all = false) {
  const sel = st.sel;
  if (!st.view) return;
  const one = sel && sel.t && sel.t.b != null ? nodeOf(sel.t) : null;
  if (!all && (!one || one.type !== 'table')) return toast('حدّد جدولاً أولاً');
  const list = all ? tablesIn(0, st.view.blocks.length - 1) : [sel.t.b];
  if (!list.length) return toast('لا جداول في هذا المجلد');
  if (all && list.length > 1 && !confirm(`تحويل ${N(list.length, 'جدول')} في هذا المجلد إلى نص؟ (يُرجع عنه بـ Ctrl+Z)`)) return;
  // من الآخر إلى الأول: فلا تتغيّر مواضع ما قبله
  const ops = list
    .slice()
    .sort((x, y) => y - x)
    .map((i) => {
      const node = st.view.blocks[i];
      return { op: 'untable', t: { vol: st.vol, b: i }, sig: sigOf(node), ...utFor(node) };
    });
  for (const x of ops) delete x.hasHdr;
  const first = st.view.blocks[list[0]];
  const n = tableToBlocks(first, utFor(first)).length;
  st.sel = !all && n ? { level: 'block', t: { vol: st.vol, b: list[0] } } : null;
  commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: 'جدول', to: UNTABLE_MODES[utFor(first).mode], text: all ? N(list.length, 'جدول') : 'جدول', ...(all ? { all: true } : {}) });
}

/* ---- لوحة الخصائص ---- */
const num = (id, v, step, min, max, unit, title) => `<label class="pf" title="${esc(title || '')}"><span>${esc(id[1])}</span><input type="number" data-p="${id[0]}" value="${v == null ? '' : v}" step="${step}" min="${min}" max="${max}" placeholder="—"><small>${unit}</small></label>`;
const WRAPS = [
  ['block', 'أعلى وأسفل', '<i class="wm wm-block"><b></b><em></em><b></b></i>'],
  ['right', 'يلتف يساره', '<i class="wm wm-right"><em></em><b></b><b></b></i>'],
  ['left', 'يلتف يمينه', '<i class="wm wm-left"><em></em><b></b><b></b></i>'],
  ['behind', 'خلف النص', '<i class="wm wm-behind"><em></em><b></b><b></b><b></b></i>'],
  ['front', 'أمام النص', '<i class="wm wm-front"><b></b><b></b><b></b><em></em></i>'],
];
function renderProps() {
  const box = $('#propCard');
  const cs = curStyle();
  const im = selImage();
  if (!cs && !im) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const tab = st.propTab || 'char';
  const tabs = [];
  const tbl = !im && cs && cs.node && cs.node.type === 'table' && cs.t.b != null;
  if (im) tabs.push(['img', 'الصورة']);
  else if (tbl) tabs.push(['tbl', 'الجدول']);
  else {
    tabs.push(['char', 'الحرف']);
    if (!cs.inNote || cs.inSide) tabs.push(['para', 'الفقرة']);
  }
  if (cs && !im && !tbl && !cs.inSide) tabs.push(['sty', 'الأنماط']);
  if (cs && !im && !tbl && (cs.inSide || (!cs.inNote && cs.t.b != null && cs.node && /^(para|heading|verse|label)$/.test(cs.node.type)))) tabs.push(['side', 'الهامش']);
  if (cs && !cs.inNote && cs.t.b != null) tabs.push(['blk', 'القطعة']);
  const cur = tabs.some((x) => x[0] === tab) ? tab : tabs[0][0];
  let body = '';
  if (cur === 'char') {
    const s = cs.st;
    const base = basePt(cs);
    const pt = base * (s.size || 1);
    body = `<div class="pgrid">
      ${num(['pt', 'المقاس'], fmt1(pt), 0.5, 5, 96, 'نقطة', 'مقاس الخط بالنقطة')}
      ${num(['up', 'رفع عن السطر'], s.up ? fmt1((s.up / 100) * pt) : '', 0.5, -40, 40, 'نقطة', 'يرفع الحروف عن خط السطر (أو يخفضها بقيمة سالبة) دون أن يتغيّر ارتفاع السطر')}
      ${num(['ws', 'تباعد الكلمات'], s.ws || '', 5, -50, 300, '٪', 'المسافة بين الكلمات: نسبة من عرض الحرف')}
      ${num(['ks', 'مدّ الكلمات'], s.ks || '', 1, 0, 9, 'كشيدة', 'تطويل الكلمات بالكشيدة (ـ) في أحسن مواضعها، كما يصنع الخطّاط')}
    </div>
    <div class="prow"><span>الموضع</span><div class="seg">${[['', 'عادي'], ['sup', 'مرتفع'], ['sub', 'منخفض']].map(([v, n]) => `<button type="button" data-va="${v}" aria-pressed="${(s.va || '') === v}">${n}</button>`).join('')}</div></div>
    <div class="prow"><span>اللون</span><input type="color" data-pc="color" value="${s.color || '#2a1d14'}"><span>التظليل</span><input type="color" data-pc="bg" value="${s.bg || '#fff3a3'}">${s.bg ? '<button type="button" class="tl quiet" data-pcx="bg">بلا</button>' : ''}</div>`;
  } else if (cur === 'para') {
    const n = cs.node;
    // القيم الفعلية: نمط الفقرة ثم ما فوقه
    const sty = cs.pst ? ustyles()[cs.pst] : null;
    const ps = { ...((sty && sty.ps) || {}), ...(n.ps || {}) };
    const nal = n.al || (sty && sty.al) || (cs.inSide ? 'c' : 'j');
    const S = st.settings || {};
    if (cs.inSide)
      body = `<div class="prow"><span>المحاذاة</span><div class="seg">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار'], ['j', 'ضبط']].map(([v, t]) => `<button type="button" data-pal="${v}" aria-pressed="${nal === v}">${t}</button>`).join('')}</div></div>
    <div class="pgrid">${num(['lh', 'تباعد الأسطر'], ps.lh || '', 0.05, 0.8, 5, '×', 'ارتفاع السطر في الهامش نسبةً إلى مقاس خطه')}</div>
    <p class="pp-note">الهامش يُحاذى في الوسط ما لم تختر غيره، وبخط الحواشي ومقاسها ما لم تغيّرهما من شريط التنسيق.</p>`;
    else body = `<div class="prow"><span>المحاذاة</span><div class="seg">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار'], ['j', 'ضبط']].map(([v, t]) => `<button type="button" data-pal="${v}" aria-pressed="${nal === v}">${t}</button>`).join('')}</div></div>
    <div class="pgrid">
      ${num(['ind', 'السطر الأول'], ps.ind != null ? ps.ind : '', 0.5, -60, 120, 'مم', `المسافة البادئة للسطر الأول (الأسلوب: ${ar(S.indentMm != null ? S.indentMm : '')} مم). بقيمة سالبة: سطر معلّق`)}
      ${num(['is', 'من اليمين'], ps.is || '', 0.5, -40, 120, 'مم', 'بُعد الفقرة كلها عن حافة النص اليمنى')}
      ${num(['ie', 'من اليسار'], ps.ie || '', 0.5, -40, 120, 'مم', 'بُعد الفقرة كلها عن حافة النص اليسرى')}
      ${num(['sb', 'قبلها'], ps.sb != null ? ps.sb : '', 0.5, -20, 200, 'مم', 'المسافة قبل الفقرة')}
      ${num(['sa', 'بعدها'], ps.sa != null ? ps.sa : '', 0.5, -20, 200, 'مم', 'المسافة بعد الفقرة')}
      ${num(['lh', 'تباعد الأسطر'], ps.lh || '', 0.05, 0.8, 5, '×', `ارتفاع السطر نسبةً إلى مقاس الخط (الأسلوب: ${ar(S.lineHeight || '')})`)}
    </div>
    ${n.type === 'para' ? `<div class="prow"><span>إطار</span><div class="seg wrap">${[['', 'بلا'], ['box', 'إطار'], ['double', 'مزدوج'], ['shade', 'مظلَّل'], ['side', 'خط جانبي']].map(([v, t]) => `<button type="button" data-bx="${v}" aria-pressed="${(ps.bx || '') === v}">${t}</button>`).join('')}</div></div>
    <label class="chk prow2"><input type="checkbox" data-pk="drop" ${ps.drop ? 'checked' : ''}><span>بداية مميزة: الكلمة الأولى كبيرةً في سطرين</span></label>` : ''}
    <label class="chk prow2"><input type="checkbox" data-pk="pb" ${ps.pb ? 'checked' : ''}><span>تبدأ في صفحة جديدة</span></label>
    ${n.type === 'para' ? `<div class="prow"><span>الاتجاه</span><div class="seg">${[['', 'من اليمين'], ['ltr', 'من اليسار']].map(([v, t]) => `<button type="button" data-pdir="${v}" aria-pressed="${(ps.dir || '') === v}" title="${v ? 'للنص اللاتيني (ترجمةٌ إلى الإنجليزية أو الفرنسية…): يبدأ السطر من اليسار' : 'الاتجاه العربي'}">${t}</button>`).join('')}</div></div>` : ''}`;
  } else if (cur === 'side') {
    body = sideTab(cs);
  } else if (cur === 'img') {
    const n = im.node;
    const wrap = n.wrap || 'block';
    body = `<div class="wraps">${WRAPS.map(([v, t, ic]) => `<button type="button" data-wrap="${v}" aria-pressed="${wrap === v}" title="${t}">${ic}<span>${t}</span></button>`).join('')}</div>
    <div class="pgrid">
      ${num(['wPct', 'العرض'], n.wPct || 60, 1, 5, 100, '٪ من السطر', 'عرض الصورة نسبةً إلى عرض السطر (اسحب زاويتها في الصفحة)')}
      ${wrap === 'behind' || wrap === 'front' ? num(['x', 'أفقياً'], n.x != null ? n.x : 50, 0.5, 0, 100, '٪', 'موضع وسط الصورة من عرض الصفحة (اسحبها في الصفحة)') + num(['y', 'رأسياً'], n.y != null ? n.y : 30, 0.5, 0, 100, '٪', 'موضع وسط الصورة من ارتفاع الصفحة') : ''}
      ${num(['op', 'الظهور'], n.op ? Math.round(n.op * 100) : 100, 5, 5, 100, '٪', 'الشفافية: أقل من ١٠٠٪ تبهت الصورة (مفيد خلف النص كالعلامة المائية)')}
      ${num(['rot', 'التدوير'], n.rot || 0, 1, -180, 180, '°', 'تدوير الصورة')}
    </div>
    ${wrap === 'block' ? `<div class="prow"><span>المحاذاة</span><div class="seg">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']].map(([v, t]) => `<button type="button" data-ial="${v}" aria-pressed="${(n.al || 'c') === v}">${t}</button>`).join('')}</div></div>` : ''}
    <div class="prow"><span>الإطار</span><div class="seg">${[['', 'بلا'], ['line', 'خط'], ['frame', 'مزخرف']].map(([v, t]) => `<button type="button" data-ibd="${v}" aria-pressed="${(n.bd || '') === v}">${t}</button>`).join('')}</div></div>
    <div class="pcap"><span>شرح الصورة</span><textarea id="capIn" rows="2" dir="auto" placeholder="ما يُكتب تحت الصورة">${esc(n.cap || '')}</textarea><button type="button" class="btn sm" data-act="cap">احفظ الشرح</button></div>
    <div class="prow"><button type="button" class="btn sm" data-act="imgReplace">استبدل الصورة…</button></div>`;
  } else if (cur === 'tbl') {
    const n = cs.node;
    const c0 = st.cell || { r: 0, c: 0 };
    const cell = ((n.rows[c0.r] || {}).cells || [])[c0.c] || {};
    body = `<p class="pp-note">انقر خلية مرتين (أو بأداة الكتابة مرة) لتكتب فيها، و Tab للخلية التالية. الخلية الآن: الصف ${ar(c0.r + 1)}، العمود ${ar(c0.c + 1)}.</p>
    <div class="bacts"><button type="button" class="btn sm" data-tbl="rowBefore">صف قبله</button><button type="button" class="btn sm" data-tbl="rowAfter">صف بعده</button><button type="button" class="btn sm" data-tbl="colBefore">عمود قبله</button><button type="button" class="btn sm" data-tbl="colAfter">عمود بعده</button></div>
    <div class="bacts"><button type="button" class="btn sm danger" data-tbl="rowDel">احذف الصف</button><button type="button" class="btn sm danger" data-tbl="colDel">احذف العمود</button></div>
    <div class="bacts"><button type="button" class="btn sm" data-act="untable" title="يُستخرج كلام الجدول فقراتٍ ويُحذف الجدول (طرق التحويل في بطاقة المحدَّد أعلاه)">حوّله نصاً</button></div>
    <label class="chk prow2"><input type="checkbox" data-tblk="hdr" ${n.rows[0] && n.rows[0].hdr ? 'checked' : ''}><span>الصف الأول عنوان (يتكرر في كل صفحة)</span></label>
    <label class="chk prow2"><input type="checkbox" data-tblk="borders" ${n.borders ? 'checked' : ''}><span>حدود الخلايا</span></label>
    <div class="prow"><span>الخلية</span><button type="button" class="tl${cell.b ? ' on' : ''}" data-cell="b">عريض</button><div class="seg">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']].map(([v, t]) => `<button type="button" data-cal="${v}" aria-pressed="${(cell.al || '') === v}">${t}</button>`).join('')}</div><input type="color" data-cbg value="${cell.bg || '#ffffff'}" title="لون الخلية"></div>`;
  } else if (cur === 'sty') {
    body = stylesTab(cs);
  } else if (cur === 'blk') {
    const n = cs.node;
    body = `<div class="bacts">
      <button type="button" class="btn sm" data-blk="up" ${cs.t.b > 0 ? '' : 'disabled'}><svg><use href="#i-up"/></svg>إلى أعلى</button>
      <button type="button" class="btn sm" data-blk="down" ${cs.t.b < st.view.blocks.length - 1 ? '' : 'disabled'}><svg><use href="#i-down"/></svg>إلى أسفل</button>
      <button type="button" class="btn sm" data-blk="dup"><svg><use href="#i-copy"/></svg>نسخة</button>
      <button type="button" class="btn sm danger" data-blk="del"><svg><use href="#i-trash"/></svg>احذف</button></div>
      <p class="pp-note">${esc(describe({ level: 'block', t: cs.t }).name)}${n.runs ? ` · ${ar(textOf(n).split(/\s+/).filter(Boolean).length)} كلمة` : ''}</p>
      <div class="pcap memo"><span>ملاحظة للمراجع <small>(تُرى هنا وحده، ولا تُطبع)</small></span><textarea id="memoIn" rows="2" dir="auto" placeholder="مثلاً: راجع هذا النقل مع الأصل المخطوط">${esc((n.memo && n.memo.text) || '')}</textarea>
        <div class="bacts"><button type="button" class="btn sm" data-act="memo">احفظ الملاحظة</button>${n.memo ? '<button type="button" class="tl quiet" data-act="memoDel">احذفها</button>' : ''}</div></div>`;
  }
  box.innerHTML = `<h3>الخصائص</h3><div class="ptabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-ptab="${k}" aria-selected="${k === cur}">${n}</button>`).join('')}</div><div class="pbody" data-tab="${cur}">${body}</div>`;
}
$('#propCard').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.ptab) {
    st.propTab = b.dataset.ptab;
    return renderProps();
  }
  if (b.dataset.va !== undefined) return applyChar({ va: b.dataset.va || null }, b.dataset.va === 'sup' ? 'مرتفع' : b.dataset.va === 'sub' ? 'منخفض' : 'موضع عادي');
  if (b.dataset.pcx) return applyChar({ [b.dataset.pcx]: null }, 'بلا تظليل');
  if (b.dataset.pal) {
    const cs = curStyle();
    // الهامش: الوسط أصله، فالضبط يُحفظ صراحةً
    if (cs && cs.inSide) return applyPara({ al: b.dataset.pal === 'j' ? null : b.dataset.pal }, 'محاذاة الهامش');
    return applyPara({ al: b.dataset.pal === 'j' ? null : b.dataset.pal }, 'المحاذاة');
  }
  if (b.dataset.pdir !== undefined) return applyPara({ dir: b.dataset.pdir || null }, b.dataset.pdir ? 'من اليسار إلى اليمين' : 'من اليمين إلى اليسار');
  if (b.dataset.side) return sideAct(b);
  if (b.dataset.bx !== undefined) return applyPara({ bx: b.dataset.bx || null }, b.dataset.bx ? 'إطار الفقرة' : 'بلا إطار');
  if (b.dataset.wrap) return applyImg({ wrap: b.dataset.wrap === 'block' ? null : b.dataset.wrap, ...(b.dataset.wrap === 'behind' || b.dataset.wrap === 'front' ? { wPct: (selImage().node.wPct || 60) } : {}) }, 'الالتفاف: ' + WRAPS.find((w) => w[0] === b.dataset.wrap)[1]);
  if (b.dataset.ial) return applyImg({ al: b.dataset.ial }, 'محاذاة الصورة');
  if (b.dataset.ibd !== undefined) return applyImg({ bd: b.dataset.ibd || null }, 'إطار الصورة');
  if (b.dataset.blk) return blockAct(b.dataset.blk);
  if (b.dataset.tbl || b.dataset.cell || b.dataset.cal) return tableAct(b);
  if (b.dataset.ust || b.dataset.ustNew || b.dataset.ustSave || b.dataset.ustRedef || b.dataset.ustUnlink || b.dataset.ustDel || b.dataset.ustCancel !== undefined) return ustAct(b);
  if (b.dataset.act === 'cap') return setCaption();
  if (b.dataset.act === 'untable') return untable();
  if (b.dataset.act === 'memo' || b.dataset.act === 'memoDel') return saveMemo(b.dataset.act === 'memoDel');
  if (b.dataset.act === 'imgReplace') {
    st.imgReplace = selImage();
    $('#imgFile').value = '';
    return $('#imgFile').click();
  }
});
$('#propCard').addEventListener('change', (e) => {
  if (e.target.matches('[data-side-frame]')) return setOm({ box: e.target.checked }, e.target.checked ? 'نص الهامش في خانةٍ بقدره' : 'نص الهامش بلا خانة');
  const inp = e.target;
  if (inp.dataset.sbox) return sideBoxField(inp);
  if (inp.dataset.tblk) return tableAct({ dataset: { tbl: inp.dataset.tblk } });
  if (inp.dataset.cbg !== undefined) return tableAct({ dataset: { cbg: inp.value } });
  if (inp.dataset.pc) return applyChar({ [inp.dataset.pc]: inp.value }, inp.dataset.pc === 'color' ? 'لون' : 'تظليل');
  if (inp.dataset.pk) return applyPara({ [inp.dataset.pk]: inp.checked ? 1 : null }, inp.dataset.pk === 'drop' ? (inp.checked ? 'بداية مميزة' : 'بلا بداية مميزة') : inp.checked ? 'تبدأ في صفحة جديدة' : 'بلا فاصل صفحة');
  const p = inp.dataset.p;
  if (!p) return;
  const raw = inp.value.trim();
  const v = raw === '' ? null : parseFloat(raw);
  if (raw !== '' && !Number.isFinite(v)) return;
  const tab = inp.closest('.pbody').dataset.tab;
  if (tab === 'char') {
    const cs = curStyle();
    const base = basePt(cs);
    const pt = base * ((cs && cs.st.size) || 1);
    if (p === 'pt') return v > 0 && setSizePt(v);
    if (p === 'up') return applyChar({ up: v ? Math.round((v / pt) * 100) : null }, 'رفع عن السطر');
    if (p === 'ws') return applyChar({ ws: v || null }, 'تباعد الكلمات');
    if (p === 'ks') return applyChar({ ks: v ? Math.round(v) : null }, v ? 'مدّ الكلمات' : 'بلا مدّ');
  }
  if (tab === 'para') return applyPara({ [p]: v }, { ind: 'السطر الأول', is: 'البعد من اليمين', ie: 'البعد من اليسار', sb: 'المسافة قبلها', sa: 'المسافة بعدها', lh: 'تباعد الأسطر' }[p] || 'الفقرة');
  if (tab === 'img') {
    if (p === 'op') return applyImg({ op: v == null || v >= 100 ? null : Math.max(0.05, v / 100) }, 'ظهور الصورة');
    return applyImg({ [p]: v }, { wPct: 'عرض الصورة', x: 'موضع الصورة', y: 'موضع الصورة', rot: 'تدوير الصورة' }[p]);
  }
});
$('#propCard').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'ustName') {
    e.preventDefault();
    const b = $('#propCard [data-ust-save]');
    if (b) ustAct(b);
    return;
  }
  if (e.key === 'Enter' && e.target.matches('input[type="number"]')) {
    e.preventDefault();
    e.target.blur();
  }
});

/* ---- قائمة الزر الأيمن في الصفحة ---- */
function openCtx(m) {
  const menu = $('#ctxMenu');
  // ما تحت المؤشر يُحدَّد أولاً (إلا إن كان يكتب، أو كان داخل المحدَّد)
  if (!m.editing && m.hit) {
    const t = targetOf(m.hit);
    const inside = st.sel && t && JSON.stringify((st.sel.t || {}).b) === JSON.stringify((t.t || {}).b ?? t.at);
    if (t && !inside) select(t.level === 'group' && t.at != null ? { level: 'block', t: { vol: st.vol, b: t.at } } : t);
  }
  const sel = st.sel;
  const node = sel && sel.t ? nodeOf(sel.t) : null;
  const isText = m.editing || (node && node.runs);
  const span = m.editing || (sel && (sel.level === 'span' || sel.level === 'run'));
  const item = (act, label, key = '') => `<button type="button" data-ctx="${act}"><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const parts = [];
  if (isText) parts.push(item('bold', 'عريض', 'Ctrl+B') + item('it', 'مائل', 'Ctrl+I') + item('ul', 'تحته خط', 'Ctrl+U') + item('hl', 'تظليل') + item('clear', 'أزل التنسيق'));
  if (span && !m.editing) parts.push(`<div class="cm-h">اجعله</div>` + [['t', 'نصاً'], ['m', 'متناً'], ['q', 'آية'], ['h', 'حديثاً']].map(([k, n]) => item('kind-' + k, n)).join('') + (sel && sel.t && sel.t.b != null ? item('toNote', 'حاشيةً على موضع…') : ''));
  else if (!m.editing && sel && ((sel.t && sel.t.b != null && node && /^(para|verse)$/.test(node.type)) || sel.level === 'multi' || sel.level === 'group')) parts.push(item('toNote', 'اجعله حاشيةً على موضع…'));
  if (isText) parts.push(item('note', 'أدرج حاشية هنا') + item('para', 'فقرة جديدة بعدها') + item('image', 'صورة بعدها…'));
  else if (node) parts.push(item('para', 'فقرة جديدة بعدها') + item('image', 'صورة بعدها…'));
  // هامشٌ بإزاء القطعة (الأيمن أو الأيسر، ما لم يكن لها)
  if (node && sel.t.b != null && SIDE_OK.test(node.type)) {
    const sd0 = node.side || {};
    const adds = ['r', 'l', 'o'].filter((k) => !sd0[k === 'o' ? 'a' : k]);
    if (adds.length) parts.push(adds.map((k) => item('side-' + k, k === 'o' ? 'هامش بإزائها في الطرف الخارجي' : 'هامش ' + SIDE_NAMES[k] + ' بإزائها')).join(''));
  }
  if (node && node.type === 'table' && sel.t.b != null) parts.push(item('untable', 'حوّل الجدول نصاً'));
  if (node && sel.t.b != null) parts.push(item('memo', 'ملاحظة للمراجع…'));
  if (node && sel.t.b != null) parts.push(item('up', 'انقل إلى أعلى') + item('down', 'انقل إلى أسفل') + item('dup', 'نسخة منها') + item('pb', 'فاصل صفحة بعدها') + item('del', 'احذفها', 'Delete'));
  if (cs0()) parts.push(item('painter', 'انسخ التنسيق'));
  // المتون: صفحة تعليق بعد هذا الموضع
  st.ctxAt = m.hit && m.hit.i != null && m.hit.sd == null ? { i: m.hit.i, o: m.hit.o } : st.caret && st.editing && st.caret.sd == null && st.caret.n == null ? { i: st.caret.i, o: st.caret.o } : null;
  if (muOn() && st.ctxAt && st.view.blocks[st.ctxAt.i] && /^(para|verse)$/.test(st.view.blocks[st.ctxAt.i].type)) parts.push(item('mcpage', 'صفحة تعليق بعد هذا الموضع'));
  if (MUED) {
    const mi = MUED.ctxItems(st.sel, item);
    if (mi) parts.unshift(mi);
  }
  if (!parts.length) return;
  menu.innerHTML = parts.filter((x) => typeof x === 'string').join('<hr>');
  menu.hidden = false;
  const r = frame.getBoundingClientRect();
  const pane = $('#pagePane').getBoundingClientRect();
  const k = frame.__k || 1;
  const x = r.left + m.x * k - pane.left;
  const y = r.top + m.y * k - pane.top;
  menu.style.left = Math.max(6, Math.min(pane.width - menu.offsetWidth - 6, x - menu.offsetWidth)) + 'px';
  menu.style.top = Math.max(6, Math.min(pane.height - menu.offsetHeight - 6, y)) + 'px';
}
const cs0 = () => curStyle();
function closeCtx() {
  $('#ctxMenu').hidden = true;
}
document.addEventListener('mousedown', (e) => {
  if (!$('#ctxMenu').hidden && !e.target.closest('#ctxMenu')) closeCtx();
});
$('#ctxMenu').addEventListener('mousedown', (e) => e.preventDefault());
$('#ctxMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ctx]');
  if (!b) return;
  closeCtx();
  const a = b.dataset.ctx;
  if (MUED && MUED.ctxAct(a)) return;
  if (a === 'bold') return toggleChar('bold', 'عريض');
  if (a === 'it') return toggleChar('it', 'مائل');
  if (a === 'ul') return toggleChar('ul', 'تحته خط');
  if (a === 'hl') return applyChar({ bg: '#FFF3A3' }, 'تظليل');
  if (a === 'clear') return clearFmt();
  if (a.startsWith('kind-')) return setKind(a.slice(5));
  if (a === 'toNote') return startToNote();
  if ((a === 'side-r' || a === 'side-l' || a === 'side-o') && st.sel && st.sel.t && st.sel.t.b != null) return addSideAt(st.sel.t.b, a.slice(5));
  if (a === 'mcpage' && st.ctxAt) {
    // بعد الكلمة التي نُقرت (لا قبلها)
    const node = st.view.blocks[st.ctxAt.i];
    let o = st.ctxAt.o;
    if (node && node.runs && o != null) {
      const txt = textOf(node);
      while (o < txt.length && !/\s/.test(txt[o])) o++;
    }
    return addCommentPage(st.ctxAt.i, o);
  }
  if (a === 'note' || a === 'para' || a === 'image') return insertBlock(a);
  if (a === 'pb') return insertBlock('pagebreak');
  if (a === 'painter') return armPainter(false);
  if (a === 'memo') return openMemo(st.sel.t.b);
  if (a === 'untable') return untable();
  if (['up', 'down', 'dup', 'del'].includes(a)) return blockAct(a);
});

/* ---- العرض: التكبير، وأدلة الهوامش، والعلامات المخفية ---- */
$('#zoomBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-zoom]');
  if (!b) return;
  setZoom(b.dataset.zoom === 'fit' ? 'fit' : b.dataset.zoom === 'in' || b.dataset.zoom === 'out' ? b.dataset.zoom : +b.dataset.zoom);
});
$('#guidesBtn').addEventListener('click', () => {
  st.guides = !st.guides;
  $('#guidesBtn').setAttribute('aria-pressed', String(st.guides));
  send({ type: 'view', guides: st.guides, invis: st.invis });
});
$('#invisBtn').addEventListener('click', () => {
  st.invis = !st.invis;
  $('#invisBtn').setAttribute('aria-pressed', String(st.invis));
  send({ type: 'view', guides: st.guides, invis: st.invis });
});

/* ------------------------------------------------------------------ أيّ كتاب يُحرَّر */
async function libraryBooks() {
  if (!desk || !desk.library) return [];
  try {
    return (await desk.library()) || [];
  } catch {
    return [];
  }
}
const bookCard = (b, i) =>
  `<button type="button" class="bk" data-lib="${i}"><span class="bk-cv" style="--c:${esc(b.color || '#6A1F2B')}">${b.thumb ? `<img alt="" src="${esc(b.thumb)}">` : ''}</span><span class="bk-t"><b>${esc(b.title)}</b><small>${esc(b.author || '')}${b.project && b.project.bookFile ? ' · وَرَق' : ''}</small></span></button>`;
let libCache = [];
/* ---- نوع العمل (الكتب، الأبحاث): من المنضدة، ويُختار من «العتبة» أول ما يُدخل المحرِّر ولا كتاب ---- */
async function benchKind() {
  const w = await bench();
  return w && w.WarraqBench.kind ? w.WarraqBench.kind() : '';
}
let asking = false;
async function askKind(force = false) {
  if (gateOpen() || asking || !shell) return;
  asking = true;
  let pick = null;
  try {
    const cur = await benchKind();
    if (st.info) return; // وُضع كتابٌ في الأثناء
    pick = await openGate({ door: 'editor', current: force ? cur || 'books' : cur });
  } finally {
    asking = false;
  }
  if (!pick) return;
  const w = await bench();
  if (w && w.WarraqBench.setKind) w.WarraqBench.setKind(pick);
  renderEmpty();
}
// شاشة المحرِّر الفارغة بحسب النوع
const EMPTY_TEXT = {
  mutun: {
    p: 'هنا تراجع متنك كما يخرج، صفحةً صفحة: المتن بأجزائه، ولكل جزءٍ موضع التعليق عليه.<br>حدّد نصاً فاجعله جزءاً وحده، أو ابدأ منه جزءاً، أو ضمّه إلى ما قبله أو بعده؛ وانقر موضع التعليق في الصفحة فاختر له موضعه ومساحته وعنوانه، لهذا الجزء أو لفصله أو للكتاب كله.',
    muted: 'يُوضع المتن على المنضدة (من «تراث» ومصادرك، أو ملف Word أو PDF) فيُقرأ ويُقسم، ثم يُحرَّر هنا.',
    acts: '<button type="button" class="btn pri" data-act="open">افتح متناً: ملف Word أو PDF…</button><button type="button" class="btn" data-act="bench">متنٌ من «تراث» على المنضدة</button>',
  },
  research: {
    p: 'هنا تراجع بحثك كما يخرج، صفحةً صفحة: صفحة العنوان، والملخص والكلمات المفتاحية، والمباحث والمطالب بمستوياتها، والحواشي، والمصادر والمراجع.<br>حدّد أي نص فيظهر نوعه، وغيّره إن أخطأ؛ ونسّقه، وابحث عن كلمة فصحّحها في موضعها أو في البحث كله.',
    muted: 'يُفتح البحث من ملفه (Word أو PDF) فيُقرأ على المنضدة بتنضيد الأبحاث، ثم يُحرَّر هنا.',
    acts: '<button type="button" class="btn pri" data-act="open">افتح بحثاً: ملف Word أو PDF…</button>',
  },
};
let emptyBooksHtml = null;
async function renderEmpty() {
  const kind = await benchKind();
  const box = $('#empty .me-in');
  if (emptyBooksHtml == null) emptyBooksHtml = { p: $('p:not(.muted)', box).innerHTML, muted: $('p.muted', box).innerHTML, acts: $('.me-acts', box).innerHTML };
  const t = EMPTY_TEXT[kind] || emptyBooksHtml;
  $('p:not(.muted)', box).innerHTML = t.p;
  $('p.muted', box).innerHTML = t.muted;
  $('.me-acts', box).innerHTML = t.acts;
  let pill = $('.me-kind', box);
  if (!pill) {
    pill = document.createElement('div');
    pill.className = 'me-kind';
    $('h1', box).after(pill);
  }
  pill.innerHTML = isKind(kind) ? kindPill(kind) : '';
  if (kind === 'research') {
    $('#emptyBooks').innerHTML = '';
    return;
  }
  libCache = (await libraryBooks()).filter((b) => b.project);
  $('#emptyBooks').innerHTML = libCache.length ? `<h2>أو حرّر كتاباً من خزانتك</h2><div class="bks">${libCache.slice(0, 18).map(bookCard).join('')}</div>` : '';
}
async function openFromLibrary(i) {
  const b = libCache[i];
  if (!b || !b.project) return;
  const w = await bench();
  if (!w) return;
  busy('يُفتح الكتاب…', b.title);
  try {
    await w.WarraqBench.restore(b.project);
  } catch (e) {
    busy('');
    return toast('تعذّر فتح الكتاب: ' + (e && e.message ? e.message : e), 5000);
  }
  busy('');
  st.bookId = null;
  closeBookMenu();
  refresh();
}
async function openBookMenu() {
  const m = $('#bookMenu');
  libCache = (await libraryBooks()).filter((b) => b.project);
  m.innerHTML = `<div class="bm-cur"><small>على المنضدة الآن</small><b>${esc(st.info ? st.info.title : '—')}</b></div>
    ${libCache.length ? `<div class="bm-h">من الخزانة</div><div class="bm-list">${libCache.slice(0, 30).map(bookCard).join('')}</div>` : ''}
    <div class="bm-acts"><button type="button" class="btn sm" data-act="open">افتح كتاب «وَرَق» أو ملف Word أو PDF…</button><button type="button" class="btn sm" data-act="bench">كتاب من «تراث» على المنضدة</button></div>`;
  m.hidden = false;
  $('#bookBtn').setAttribute('aria-expanded', 'true');
}
function closeBookMenu() {
  $('#bookMenu').hidden = true;
  $('#bookBtn').setAttribute('aria-expanded', 'false');
}
$('#bookBtn').addEventListener('click', () => ($('#bookMenu').hidden ? openBookMenu() : closeBookMenu()));

/* ---- «احفظ»: الكتاب بتعديلاته PDF أو Word أو «وَرَق» ---- */
const SAVE_NAMES = { pdf: 'PDF', docx: 'Word', waraq: 'وَرَق' };
function saveBar(html, ms = 0) {
  let bar = $('#saveBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'saveBar';
    bar.className = 'savebar';
    bar.setAttribute('role', 'status');
    $('#pagePane').appendChild(bar);
  }
  clearTimeout(saveBar.t);
  bar.hidden = !html;
  if (html) bar.innerHTML = html;
  if (ms) saveBar.t = setTimeout(() => (bar.hidden = true), ms);
  return bar;
}
function toggleSaveMenu(on) {
  const m = $('#saveMenu');
  m.hidden = !on;
  $('#saveBtn').setAttribute('aria-expanded', String(!!on));
  if (on) {
    const busyNow = !!st.saving;
    for (const b of $$('#saveMenu [data-save]')) b.disabled = busyNow;
    const f = $('#saveMenu [data-save]');
    if (f) f.focus();
  }
}
async function saveAs(fmt) {
  toggleSaveMenu(false);
  if (st.saving) return toast('يُحفظ الكتاب الآن');
  const ed = await editor();
  if (!ed || !ed.exportAs) return toast('افتح كتاباً أولاً');
  // ما كُتب في الصفحة يُحفظ أولاً، فيدخل الملف
  if (st.editing) await flushEdit();
  st.saving = fmt;
  const name = SAVE_NAMES[fmt];
  saveBar(`<i class="spin-dot"></i><span class="grow"><b>${fmt === 'waraq' ? 'يُحفظ كتاب «وَرَق»…' : `يُخرج الكتاب ${name}…`}</b> ${fmt === 'waraq' ? '' : 'بأسلوبه وتعديلاتك؛ تابع التحرير إن شئت (ما تغيّره بعد الآن لا يدخل هذا الملف).'}</span>`);
  try {
    const r = await ed.exportAs(fmt, (p) => {
      if (p && p.total > 1) saveBar(`<i class="spin-dot"></i><span class="grow"><b>يُخرج الكتاب ${name}…</b> ${ar(p.done)} من ${ar(p.total)} مجلد</span>`);
    });
    if (r && r.cancel) return saveBar('');
    if (!r || !r.ok || !r.files.length) throw new Error('لم يُخرج الملف');
    // في الموقع: يُنزَّل
    for (const f of r.files)
      if (f.blob) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(f.blob);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 4000);
      }
    const withPath = r.files.filter((f) => f.path);
    st.savedFiles = withPath;
    const names = r.files.map((f) => esc(f.name)).join('، ');
    saveBar(
      `<span class="grow">حُفظ الكتاب ${esc(name)}: <b>${names}</b></span>` +
        (withPath.length && desk ? `<button type="button" class="btn sm" data-sv="open">افتحه</button><button type="button" class="tl" data-sv="folder">افتح المجلد</button>` : '') +
        `<button type="button" class="tl quiet" data-sv="close" aria-label="أغلق">✕</button>`,
      withPath.length ? 0 : 6000,
    );
  } catch (e) {
    saveBar(`<span class="grow">تعذّر الحفظ ${esc(name)}: ${esc(e && e.message ? e.message : e)}</span><button type="button" class="tl quiet" data-sv="close" aria-label="أغلق">✕</button>`);
  } finally {
    st.saving = null;
  }
}
$('#saveBtn').addEventListener('click', () => toggleSaveMenu($('#saveMenu').hidden));
$('#saveMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-save]');
  if (b && !b.disabled) saveAs(b.dataset.save);
});
$('#saveMenu').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return toggleSaveMenu(false), $('#saveBtn').focus();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const bs = $$('#saveMenu [data-save]');
    const i = bs.indexOf(document.activeElement);
    bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus();
  }
});
document.addEventListener('mousedown', (e) => {
  if (!$('#saveMenu').hidden && !e.target.closest('#saveMenu, #saveBtn')) toggleSaveMenu(false);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('#saveBar [data-sv]');
  if (!b) return;
  const f = (st.savedFiles || [])[0];
  if (b.dataset.sv === 'close') return saveBar('');
  if (b.dataset.sv === 'open' && f && desk) return desk.openPath(f.path);
  if (b.dataset.sv === 'folder' && f && desk) return desk.showFolder(f.path.replace(/[\\/][^\\/]*$/, ''));
});
document.addEventListener('click', (e) => {
  if (!$('#bookMenu').hidden && !e.target.closest('#bookMenu, #bookBtn')) closeBookMenu();
  const lib = e.target.closest('[data-lib]');
  if (lib) return openFromLibrary(+lib.dataset.lib);
  if (e.target.closest('#empty [data-kind-pill]')) return askKind(true);
  const act = e.target.closest('#bookMenu [data-act], #empty [data-act]');
  if (!act) return;
  closeBookMenu();
  if (act.dataset.act === 'open') desk && desk.openDialog('bench');
  if (act.dataset.act === 'bench') shell && shell.go('bench');
});

/* ------------------------------------------------------------------ مع الهيكل */
window.WarraqEditor = {
  refresh,
  /** القلم: ابحث في الكتاب */
  find(q) {
    $('#fFind').value = q || '';
    runFind(true);
    $('#fFind').focus();
  },
};

/* ------------------------------------------------------------------ المساعد: نافذة الذكاء الاصطناعي بجانب الصفحة */
AI = setupAssistant({ st, $, esc, ar, cut, nodeOf, textOf, describe, roleOf, roleName, curSec, commit, goBlock, select, toast, levelName, blockOfNote, desk, mutun: () => MUED });
window.WarraqEditor.assistant = AI;
MUED = setupMutunEditor({ st, $, esc, ar, editor, bench, commit, select, goBlock, toast, nodeOf, sigOf, blockText, renderSel, sectionOf, ai: () => AI });
// ما يتغيّر من إعدادات المتون (في المنضدة أو من لوحة المحرِّر نفسها): يُعاد تنضيد الصفحات
bench().then((w) => {
  if (!w) return;
  let t = 0;
  w.addEventListener('warraq:look', async () => {
    if (!st.info) return;
    const ed = await editor();
    const inputs = ed && ed.renderInputs ? ed.renderInputs() : null;
    if (inputs) st.settings = inputs.settings;
    syncPaper();
    syncOm();
    renderStyles();
    renderSection({ scroll: 'keep' });
  });
  w.addEventListener('warraq:mutun', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!st.info) return;
      const ed = await editor();
      // ترقيم الملف (يُحذف أو يبقى): يُحلَّل المجلد من جديد
      const ms = ed && ed.mutun && ed.mutun.get ? ed.mutun.get().mStrip !== false : true;
      if (st.muStrip !== undefined && ms !== st.muStrip) {
        st.muStrip = ms;
        st.raw.clear();
        await loadVol(st.vol);
        return;
      }
      st.muStrip = ms;
      // «ثبّت الترتيب» يضيف إلى التعديلات عمليةً من المنضدة: تُؤخذ هنا
      const info = ed && ed.info ? ed.info() : null;
      const ext = (info && info.edits && info.edits.ops) || null;
      if (ext && JSON.stringify(ext.map((o) => o.id)) !== JSON.stringify(st.ops.map((o) => o.id))) {
        st.ops = ext;
        st.redo = [];
        rebuild({ render: false });
      }
      const inputs = ed && ed.renderInputs ? ed.renderInputs() : null;
      if (inputs) st.settings = inputs.settings;
      await MUED.sync();
      renderSection({ scroll: 'keep' });
      if (st.sel && st.sel.level === 'mc') renderSel();
    }, 220);
  });
});
refresh();
