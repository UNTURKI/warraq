// ما يحفظه البرنامج في مجلد بياناته (%APPDATA%\Alwarraq): الخزانة، والكتاب الذي على المنضدة، وطابور النسّاخ، وتفضيلات البرنامج.
// ملفات JSON تُكتب كتابةً ذرّية (ملف مؤقت ثم إعادة تسمية)، فلا يفسد الملف إن انقطع البرنامج أثناء الكتابة.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BOOKS = 2000;
const MAX_QUEUE = 200;

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (n) => path.join(dir, n);
  const read = (n, def) => {
    try {
      return JSON.parse(fs.readFileSync(file(n), 'utf8'));
    } catch {
      return def;
    }
  };
  const write = (n, v) => {
    const tmp = file(n) + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(v));
    fs.renameSync(tmp, file(n));
  };
  const remove = (n) => fs.rmSync(file(n), { force: true });

  /* ---------------- الخزانة: ما أُخرج من الكتب ---------------- */
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const jpeg = (v, max) => (typeof v === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < max ? v : '');
  function cleanRecord(r) {
    return {
      title: str(r.title, 300) || 'كتاب',
      author: str(r.author, 300),
      dir: str(r.dir, 1000),
      waraq: /\.waraq$/i.test(r.waraq || '') ? str(r.waraq, 1000) : '', // ملف «وَرَق»: الكتاب كله (صيغة ورّاق)
      color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '',
      accent: /^#[0-9a-f]{6}$/i.test(r.accent || '') ? r.accent : '',
      thumb: jpeg(r.thumb, 400_000),
      // الغلاف الخلفي الحقيقي (صورة صغيرة): للرَّحل والمعاينة؛ وما لم يُختر له غلافٌ خلفي فالشكل الافتراضي
      backImg: jpeg(r.backImg, 400_000),
      volumes: (Array.isArray(r.volumes) ? r.volumes : []).slice(0, 500).map((v) => ({
        vol: str(String(v.vol ?? ''), 40),
        label: str(v.label, 80),
        pdf: str(v.pdf, 1000),
        docx: str(v.docx, 1000),
        pages: Number.isFinite(+v.pages) ? Math.max(0, Math.round(+v.pages)) : 0,
        // كعب المجلد الحقيقي (برقمه): كما يُطبع، فيُرى في الخزانة والرَّحل والمعاينة
        ...(jpeg(v.spineImg, 160_000) ? { spineImg: v.spineImg } : {}),
        // كعب الخزانة: الكعب نفسه مرسوماً بنسبة كعبه على الرف (فلا يُمطّ نصّه في الكعوب النحيفة)
        ...(jpeg(v.shelfImg, 160_000) ? { shelfImg: v.shelfImg } : {}),
      })),
      project: r.project && typeof r.project === 'object' && r.project.format === 'warraq-project' ? r.project : null,
      // دفترٌ من الرَّحل: صفحاته وما كُتب فيها في الرَّحل نفسه، وهنا مكانه في الخزانة
      ...(/^nb-[a-z0-9]{6,20}$/.test(r.nb || '') ? { nb: r.nb, nbPages: Number.isFinite(+r.nbPages) ? Math.max(1, Math.min(9999, Math.round(+r.nbPages))) : 1 } : {}),
      ...place(r),
    };
  }
  /** مكان الكتاب: خزانته، ومجموعته (التقسيم الخاص)، وموضوعه (من «تراث») */
  function place(r) {
    const o = {};
    if (typeof r.cabinet === 'string') o.cabinet = str(r.cabinet, 40);
    if (typeof r.group === 'string') o.group = str(r.group, 40);
    if (typeof r.spine === 'string') o.spine = str(r.spine, 80); // اسمٌ أقصر على كعب المجلد
    // شكل الكعب على الرف: كعب الغلاف (real) أو الجلدي (leather)، و'' كالخزانة كلها
    if (typeof r.spineLook === 'string') o.spineLook = ['real', 'leather'].includes(r.spineLook) ? r.spineLook : '';
    if (r.subject && typeof r.subject === 'object') o.subject = { id: str(String(r.subject.id ?? ''), 40), name: str(r.subject.name, 120) };
    return o;
  }
  const library = () => {
    const l = read('library.json', []);
    return Array.isArray(l) ? l : [];
  };
  /** الخزانة بحال ملفاتها: ما نُقل أو حُذف يُعلَّم ولا يُحذف من الخزانة */
  function listBooks() {
    return library().map((b) => ({
      ...b,
      dirExists: !!b.dir && fs.existsSync(b.dir),
      waraqExists: !!b.waraq && fs.existsSync(b.waraq),
      volumes: b.volumes.map((v) => ({ ...v, pdfExists: !!v.pdf && fs.existsSync(v.pdf), docxExists: !!v.docx && fs.existsSync(v.docx) })),
    }));
  }
  /** كتاب أُخرج: يُضاف أولاً، وإعادة إخراجه في المجلد نفسه تحلّ محل سجلّه القديم */
  function addBook(input) {
    const rec = cleanRecord(input || {});
    const now = new Date().toISOString();
    const list = library();
    const old = list.find((b) => (rec.dir && b.dir === rec.dir) || (rec.nb && b.nb === rec.nb));
    // إعادة الإخراج تُبقي الكتاب في خزانته ومجموعته (ما لم يُختر غيرهما)
    const keep = old ? { cabinet: old.cabinet, group: old.group, subject: old.subject, spine: old.spine, spineLook: old.spineLook } : {};
    for (const k of Object.keys(keep)) if (keep[k] === undefined || rec[k] !== undefined) delete keep[k];
    if (old && old.waraq && !rec.waraq) rec.waraq = old.waraq; // أُعيد إخراجه دون «وَرَق»: يبقى ملفه الأول
    const book = { id: old ? old.id : crypto.randomBytes(6).toString('hex'), added: old ? old.added : now, updated: now, ...keep, ...rec };
    // الكتاب الجديد أول الرفّ (أقصى اليمين)، وما أُعيد إخراجه يبقى في مكانه الذي رتّبه المستخدم
    write('library.json', (old ? list.map((b) => (b === old ? book : b)) : [book, ...list]).slice(0, MAX_BOOKS));
    return book;
  }
  /** نقل كتاب إلى خزانة أو مجموعة، أو تسجيل موضوعه */
  function updateBook(id, patch) {
    const list = library();
    const b = list.find((x) => x.id === id);
    if (!b) return null;
    Object.assign(b, place(patch || {}));
    write('library.json', list);
    return b;
  }
  /** نقل كتب كثيرة معاً (حذف خزانة أو مجموعة): { from: {cabinet|group}, to } */
  function moveBooks(field, from, to) {
    if (!['cabinet', 'group'].includes(field)) return 0;
    const list = library();
    let n = 0;
    for (const b of list) if ((b[field] || '') === (from || '')) (b[field] = str(to || '', 40)), n++;
    if (n) write('library.json', list);
    return n;
  }
  /** ترتيب الكتب كما رتّبها المستخدم في رفوفه: ids بالترتيب الجديد، وما لم يُذكر يبقى بعدها بترتيبه */
  function orderBooks(ids) {
    if (!Array.isArray(ids)) return false;
    const list = library();
    const byId = new Map(list.map((b) => [b.id, b]));
    const seen = new Set();
    const out = [];
    for (const id of ids.slice(0, MAX_BOOKS)) {
      const b = byId.get(String(id));
      if (b && !seen.has(b.id)) seen.add(b.id), out.push(b);
    }
    for (const b of list) if (!seen.has(b.id)) out.push(b);
    if (out.every((b, i) => b === list[i])) return false;
    write('library.json', out);
    return true;
  }
  function removeBook(id) {
    const list = library();
    const next = list.filter((b) => b.id !== id);
    if (next.length !== list.length) write('library.json', next);
    return next.length !== list.length;
  }
  /** هل المسار من ملفات الخزانة؟ (فيُسمح بفتحه وإن كان خارج مجلد الكتب الحالي) */
  function knownPath(p) {
    const n = path.resolve(p);
    return library().some((b) => (b.dir && path.resolve(b.dir) === n) || (b.waraq && path.resolve(b.waraq) === n) || b.volumes.some((v) => (v.pdf && path.resolve(v.pdf) === n) || (v.docx && path.resolve(v.docx) === n)));
  }

  /* ---------------- الكتاب الذي على المنضدة (يعود حين يُفتح البرنامج) ---------------- */
  const loadCurrent = () => read('current.warraq.json', null);
  function saveCurrent(p) {
    if (!p || typeof p !== 'object' || p.format !== 'warraq-project') return remove('current.warraq.json');
    write('current.warraq.json', p);
  }

  /* ---------------- طابور النسّاخ (يُستأنف بعد إعادة التشغيل) ---------------- */
  const loadQueue = () => {
    const q = read('scribes.json', []);
    return Array.isArray(q) ? q : [];
  };
  function saveQueue(q) {
    write('scribes.json', (Array.isArray(q) ? q : []).filter((j) => j && typeof j === 'object').slice(0, MAX_QUEUE));
  }

  /* ---------------- تفضيلات البرنامج ---------------- */
  const prefs = () => ({ ...read('desktop.json', {}) });
  function setPrefs(patch) {
    const next = { ...prefs(), ...(patch && typeof patch === 'object' ? patch : {}) };
    write('desktop.json', next);
    return next;
  }

  return { listBooks, addBook, updateBook, moveBooks, orderBooks, removeBook, knownPath, loadCurrent, saveCurrent, loadQueue, saveQueue, prefs, setPrefs };
}

module.exports = { createStore };
