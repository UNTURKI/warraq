// محرر «إعدادات الطباعة» (النسخة الجاهزة للطباعة) — يُستعمل لإعداد الموقع العام ولإعداد خاص بأسلوب.
// يسار: تسلسل الصفحات قبل الكتاب وبعده (إضافة، حذف، ترتيب)، وإعدادات كل صفحة، والترقيم وهامش التجليد، ومكتبة صور البسملة.
// يمين: معاينة حية بمحرك التنضيد نفسه (ما قبل الكتاب · صفحات الكتاب · ما بعده).
import { createPreview } from '/js/preview.js';
import { toMask, toPageImage, tintMask } from '/js/basmala-mask.js';
import { mountRichText } from '/studio/rich-text.js';
import { FONTS } from '/shared/presets.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

const TYPE_LABEL = { blank: 'صفحة بيضاء', half: 'العنوان المختصر', cover: 'الغلاف الداخلي', basmala: 'البسملة', text: 'صفحة نص', image: 'صفحة صورة' };
const ADD_FRONT = ['blank', 'half', 'basmala', 'text', 'image'];
const ADD_BACK = ['blank', 'text', 'image'];
const NEW_ITEM = {
  blank: () => ({ type: 'blank' }),
  half: () => ({ type: 'half' }),
  basmala: () => ({ type: 'basmala' }),
  text: () => ({ type: 'text', v: 'middle', lineHeight: 1.75, paras: [{ align: 'center', runs: [{ t: '', b: true, sizePt: 18, font: 'heading', color: '' }] }] }),
  image: () => ({ type: 'image', src: '', w: 0, h: 0, fit: 'contain', widthPct: 60, yPct: 50 }),
};
const HALF_POS = [['tr', 'أعلى اليمين'], ['tl', 'أعلى اليسار'], ['c', 'الوسط'], ['br', 'أسفل اليمين'], ['bl', 'أسفل اليسار']];
const PREVIEW_VIEWS = [
  { key: 'front', label: 'ما قبل الكتاب', short: 'ما قبل الكتاب' },
  { key: 'book', label: 'صفحات الكتاب', short: 'صفحات الكتاب' },
  { key: 'back', label: 'ما بعد الكتاب', short: 'ما بعد الكتاب' },
];

/**
 * @param {HTMLElement} host
 * @param {object} o
 * @param {(method: string, url: string, body?: any) => Promise<any>} o.api
 * @param {(msg: string, warn?: boolean) => void} o.toast
 * @param {(name: string) => string} o.ic
 * @returns {{open: Function, value: object, refreshLibrary: Function}}
 */
export function mountPrintEditor(host, o) {
  const ic = o.ic;
  host.classList.add('pe');
  host.innerHTML = `<form class="pe-form ed-form" autocomplete="off" onsubmit="return false"></form><aside class="ed-preview pe-preview"><div class="pe-pvhost"></div></aside>`;
  const form = host.querySelector('.pe-form');
  /** السياق الحالي: الإعداد المحرَّر، وإعدادات الأسلوب الذي تُعرض به المعاينة */
  const cur = { value: null, getSettings: null, getExtras: null, onChange: null, sel: null, library: [], open: { seq: true } };

  const settings = () => ({ ...cur.getSettings(), printReady: true, template: 'full' });
  const preview = createPreview(host.querySelector('.pe-pvhost'), {
    // (المالك: معاينة بإضافات غير محفوظة. المستخدم: المعاينة العامة بأسلوبه الذي في متصفحه)
    endpoint: o.endpoint || '/api/admin/styles/preview',
    title: 'معاينة الطباعة',
    views: PREVIEW_VIEWS,
    view: 'front',
    hints: {
      front: 'صفحات ما قبل الكتاب بترتيبها، ومنها البيضاء. تنقّل بينها بالسهمين، أو اضغط صفحة في التسلسل.',
      book: 'صفحات الكتاب: الترقيم، وهامش التجليد يتبدل بين الصفحة الفردية والزوجية.',
      back: 'ما بعد آخر الكتاب، ومعه الصفحات البيضاء التي تتم العدد.',
    },
    empty: { back: 'لا صفحات بعد الكتاب.', front: 'لا صفحات قبل الكتاب.' },
    getSettings: settings,
    getParseOpts: () => ({ matnQawluhu: settings().matnQawluhu !== false }),
    getExtras: () => (cur.getExtras ? cur.getExtras() : undefined),
    getPrint: () => cur.value,
    ...(o.getFonts ? { getFonts: o.getFonts } : {}),
  });

  const bsmColor = () => {
    const s = cur.getSettings ? cur.getSettings() : {};
    return s.basmalaColor || (cur.value && cur.value.basmala.color) || (s.headingColors || {})[1] || '#6B1D2F';
  };
  /** صفحات بطاقة الأسلوب التي تدخل ما قبل الكتاب: قبل التسلسل، وبعد الغلاف الداخلي */
  const xCount = (at) => ((cur.getExtras && cur.getExtras() && cur.getExtras().pages) || []).filter((p) => p.at === at && String(p.html || '').trim()).length;
  /** موضع عنصر من التسلسل في لوحة المعاينة */
  function previewIndex(where, i) {
    if (where === 'back') return i;
    const ci = cur.value.front.findIndex((x) => x.type === 'cover');
    return xCount('start') + i + (ci >= 0 && i > ci ? xCount('afterCover') : 0);
  }

  /* ---------------------------------------------------------------- الرسم */
  const pg = (type, extra = '') => `<span class="pe-pg t-${type}" ${extra}><i></i></span>`;
  const seg = (name, val, opts) => `<div class="seg2" data-seg="${name}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${val === v}">${t}</button>`).join('')}</div>`;
  const range = (f, label, val, min, max, step, unit) =>
    `<label class="field pe-range"><span>${label} <b data-out="${f}">${ar(val)}${unit}</b></span><input type="range" data-f="${f}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
  const colorF = (f, label, val, emptyLabel) =>
    `<label class="cfield"><span class="color ${val ? '' : 'empty'}"><input type="color" data-f="${f}" value="${val || '#888888'}"></span><span>${label}${!val ? ` <small class="muted">(${emptyLabel})</small>` : ''}</span>${val ? `<button type="button" class="link-btn" data-clear="${f}">${emptyLabel}</button>` : ''}</label>`;

  function itemOptions(it, where, i) {
    const p = `${where}.${i}.`;
    if (it.type === 'text') {
      // محرر مرئي: يُكتب فيه كما في Word (يُركَّب بعد الرسم، انظر mountText)
      return `<div class="pe-opts">
        <div class="pe-rt" data-rt="${where}.${i}"></div>
        <div class="rowf"><span class="lbl">موضع النص في الصفحة</span>${seg(p + 'v', it.v, [['top', 'أعلى'], ['middle', 'وسط'], ['bottom', 'أسفل']])}
          <label class="mini">تباعد الأسطر <input class="inp pe-lh" type="number" min="1" max="3" step="0.05" data-f="${p}lineHeight" value="${it.lineHeight || 1.75}"></label></div>
      </div>`;
    }
    if (it.type === 'image') {
      return `<div class="pe-opts">
        <div class="pe-imgrow">
          <div class="pe-imgview checker">${it.src ? `<img src="${it.src}" alt="">` : '<span class="muted small">لا صورة بعد</span>'}</div>
          <div class="pe-imgside">
            <label class="btn sm ${it.src ? '' : 'primary'}" tabindex="0">${ic('upload')} ${it.src ? 'تغيير الصورة' : 'اختر الصورة'}<input type="file" data-img="${where}.${i}" accept="image/png,image/jpeg,image/webp" hidden></label>
            <div class="rowf">${seg(p + 'fit', it.fit, [['contain', 'في موضعها'], ['page', 'تملأ الصفحة']])}</div>
          </div>
        </div>
        ${it.fit === 'page' ? '' : range(p + 'widthPct', 'عرضها من عرض الصفحة', it.widthPct, 10, 100, 1, '٪') + range(p + 'yPct', 'موضعها الرأسي (من أعلى الصفحة)', it.yPct, 10, 90, 1, '٪')}
      </div>`;
    }
    if (it.type === 'half') return `<p class="pe-note">عنوان الكتاب وحده في زاوية من صفحة. موضعه ومقاساته في <button type="button" class="link-btn" data-go="half">«صفحة العنوان المختصر»</button> أدناه.</p>`;
    if (it.type === 'basmala') return `<p class="pe-note">البسملة في صفحتها. صورها ومقاسها في <button type="button" class="link-btn" data-go="bsm">«صفحة البسملة»</button> أدناه.</p>`;
    if (it.type === 'cover') return `<p class="pe-note">صفحة الغلاف الداخلي للكتاب (العنوان والمؤلف والمحقق). تُقدَّم وتُؤخَّر، ولا تُحذف.</p>`;
    return `<p class="pe-note">صفحة فارغة تماماً.</p>`;
  }

  function seqList(where) {
    const list = cur.value[where];
    const base = where === 'front' ? 0 : -1;
    return list
      .map((it, i) => {
        const on = cur.sel && cur.sel.where === where && cur.sel.i === i;
        const sub = it.type === 'text' ? esc(firstLine(it)) || 'فارغة' : it.type === 'image' ? (it.src ? (it.fit === 'page' ? 'تملأ الصفحة' : 'في موضعها') : 'لا صورة بعد') : '';
        return `<li class="pe-item ${on ? 'on' : ''}" data-where="${where}" data-i="${i}">
          <div class="pe-row" role="button" tabindex="0" aria-expanded="${on}">
            <span class="pe-n">${base < 0 ? '+' + ar(i + 1) : ar(previewIndex(where, i) + 1)}</span>${pg(it.type)}
            <span class="pe-t"><b>${TYPE_LABEL[it.type]}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</span>
            <span class="pe-acts">
              <button type="button" class="ibtn" data-act="up" title="تقديم" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
              <button type="button" class="ibtn" data-act="down" title="تأخير" ${i === list.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
              <button type="button" class="ibtn" data-act="dup" title="تكرارها" ${it.type === 'cover' ? 'disabled' : ''}>${ic('copy')}</button>
              <button type="button" class="ibtn danger" data-act="del" title="حذف" ${it.type === 'cover' ? 'disabled' : ''}>${ic('trash')}</button>
            </span>
          </div>
          ${on ? itemOptions(it, where, i) : ''}
        </li>`;
      })
      .join('');
  }
  /** أول سطر فيه كلام من صفحة نص */
  const firstLine = (it) => ((it.paras || []).map((p) => (p.runs || []).map((r) => r.t).join('').trim()).find(Boolean) || ((it.paras || []).some((p) => p.img) ? 'صورة' : '')).slice(0, 40);
  /** محرر صفحة النص المختارة (يُركَّب بعد كل رسم) */
  function mountText() {
    const el = form.querySelector('[data-rt]');
    if (!el) return;
    const [where, i] = el.dataset.rt.split('.');
    const it = cur.value[where][+i];
    const s = cur.getSettings ? cur.getSettings() : {};
    cur.rt = mountRichText(el, {
      paras: it.paras,
      v: it.v,
      lineHeight: it.lineHeight,
      roleFonts: () => (cur.getSettings ? cur.getSettings().fonts : {}) || {},
      fonts: Object.entries(FONTS).map(([f, x]) => [f, x.label + (x.uploaded && !x.system ? ' ★' : x.system ? ' · من جهازك' : '')]),
      textColor: s.textColor,
      page: s.page,
      // صورة في صفحة النص: تُجهَّز كصور صفحات الطباعة (PNG أو JPEG بحجم معقول)
      pickImage: async (file) => {
        try {
          if (file.size > 12 * 1024 * 1024) throw new Error('الصورة أكبر من ١٢ م.ب');
          const img = await toPageImage(file);
          if (img.src.length > 2.6 * 1024 * 1024) throw new Error('الصورة كبيرة بعد تجهيزها: صغّرها ثم ارفعها');
          return img;
        } catch (err) {
          o.toast(err.message || 'تعذّرت قراءة الصورة', true);
          throw err;
        }
      },
      onChange: (paras) => {
        it.paras = paras;
        const small = el.closest('.pe-item').querySelector('.pe-t small');
        if (small) small.textContent = firstLine(it) || 'فارغة';
        changed({ view: { v: where, page: previewIndex(where, +i) } });
      },
    });
  }
  const addRow = (where, types) => `<div class="pe-add" data-where="${where}"><span class="lbl">أضف:</span>${types.map((t) => `<button type="button" class="btn sm" data-add="${t}">${pg(t)} ${TYPE_LABEL[t]}</button>`).join('')}</div>`;

  function libraryHtml() {
    const lib = cur.library;
    // عند المستخدم: صور المكتبة للعرض فقط (يرفعها صاحب الموقع)
    if (o.manageLibrary === false) {
      return `<div class="pe-lib">${lib.map((b) => `<figure class="pe-bsm" data-id="${b.id}"><div class="pe-bsm-v"><img data-mask="${b.id}" alt="${esc(b.name)}"></div><figcaption><small>${esc(b.name)}</small></figcaption></figure>`).join('')}</div>
      <p class="muted small">${lib.length ? 'صور البسملة في ورّاق: تختار بينها في صفحة الإخراج، وتُلوَّن بلون البسملة.' : 'لا صور بسملة في ورّاق: تُكتب نصاً بخط الرقعة.'}</p>`;
    }
    return `<div class="pe-lib">${lib
      .map(
        (b, i) => `<figure class="pe-bsm" data-id="${b.id}">
          <div class="pe-bsm-v"><img data-mask="${b.id}" alt="${esc(b.name)}"></div>
          <figcaption>
            <input class="inp" data-bname="${b.id}" value="${esc(b.name)}" maxlength="40" aria-label="اسم الصورة">
            <span class="row">${i === 0 ? '<span class="chip ok">الافتراضية</span>' : `<button type="button" class="btn sm" data-bfirst="${b.id}">اجعلها الافتراضية</button>`}
              <button type="button" class="ibtn danger" data-bdel="${b.id}" title="حذف">${ic('trash')}</button></span>
          </figcaption>
        </figure>`,
      )
      .join('')}
      <label class="pe-bsm add" tabindex="0">${ic('upload')}<b>إضافة صورة بسملة</b><small>حبر داكن على خلفية فاتحة، أو صورة شفافة الخلفية</small><input type="file" data-bfile accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden></label>
    </div>
    <p class="muted small">${lib.length ? 'المستخدم يختار بين هذه الصور عند «نسخة جاهزة للطباعة»، والأولى هي التي تُطبع إن لم يختر. كل صورة تُحوَّل إلى قناع فتُلوَّن بلون البسملة.' : 'لا صور بعد: تُكتب البسملة نصاً بخط الرقعة. ارفع صورة أو أكثر ليختار المستخدم بينها.'}</p>`;
  }

  function render() {
    const v = cur.value;
    if (!v) return;
    const open = { ...cur.open };
    form.querySelectorAll('details[data-sec]').forEach((d) => (open[d.dataset.sec] = d.open));
    cur.open = open;
    const frontTotal = v.front.length + xCount('start') + xCount('afterCover');
    const first = v.numbering === 'book' ? 1 : frontTotal + 1;
    const h = v.half;
    const b = v.basmala;
    const sec = (key, title, body) => `<details class="ed-sec" data-sec="${key}" ${open[key] ? 'open' : ''}><summary>${title}</summary><div class="ed-body">${body}</div></details>`;
    form.innerHTML =
      sec(
        'seq',
        'تسلسل الصفحات',
        `<p class="muted small">رتّب ما يأتي قبل الكتاب كما تريد: أضف صفحة، احذفها، قدّمها أو أخّرها. اضغط صفحة لترى إعداداتها وتظهر في المعاينة. كل هذه الصفحات بلا أرقام.</p>
        <ol class="pe-seq">${seqList('front')}</ol>
        ${addRow('front', ADD_FRONT)}
        <div class="pe-book">${pg('book')}<span><b>الكتاب</b> <small class="muted">الفهرس (إن كان في البداية) ثم المتن</small><br><small>يبدأ بعد ${ar(frontTotal)} ${frontTotal > 10 ? 'صفحة' : 'صفحات'}، وهي الصفحة ${ar(frontTotal + 1)} من الملف (${(frontTotal + 1) % 2 ? 'فردية' : 'زوجية'}) · رقمها المطبوع ${ar(first)}</small></span></div>
        <h4 class="sub">بعد الكتاب</h4>
        ${v.back.length ? `<ol class="pe-seq">${seqList('back')}</ol>` : '<p class="muted small">لا شيء بعد آخر الكتاب.</p>'}
        ${addRow('back', ADD_BACK)}`,
      ) +
      sec(
        'half',
        'صفحة العنوان المختصر',
        `<div class="rowf"><span class="lbl">موضع العنوان</span><div class="pe-pos" data-seg="half.pos">${HALF_POS.map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${h.pos === k}" title="${t}"><span class="pe-pg pos-${k}"><i></i></span><small>${t}</small></button>`).join('')}</div></div>
        <div class="grid3">
          <label class="field"><span>حجم العنوان (نقطة)</span><input class="inp" type="number" min="10" max="72" step="0.5" data-f="half.titlePt" value="${h.titlePt}"></label>
          <label class="field"><span>حجم العنوان الفرعي</span><input class="inp" type="number" min="8" max="48" step="0.5" data-f="half.subPt" value="${h.subPt}"></label>
        </div>
        <label class="sw"><span>إظهار العنوان الفرعي تحته</span><input type="checkbox" data-f="half.showSub" ${h.showSub ? 'checked' : ''}></label>
        <label class="sw"><span>إظهار اسم المؤلف تحته</span><input type="checkbox" data-f="half.showAuthor" ${h.showAuthor ? 'checked' : ''}></label>
        <div class="colors">${colorF('half.color', 'لون العنوان', h.color, 'لون الأبواب')}${colorF('half.subColor', 'لون ما تحته', h.subColor, 'بنّي داكن')}</div>`,
      ) +
      sec(
        'bsm',
        `صفحة البسملة <small class="muted">— ${cur.library.length ? ar(cur.library.length) + ' ' + (cur.library.length > 2 && cur.library.length < 11 ? 'صور' : 'صورة') : 'بلا صور'}</small>`,
        `${libraryHtml()}
        ${range('basmala.widthPct', 'عرض البسملة من عرض الصفحة', b.widthPct, 20, 100, 1, '٪')}
        ${range('basmala.yPct', 'موضعها الرأسي (من أعلى الصفحة)', b.yPct, 15, 85, 1, '٪')}
        <div class="colors">${colorF('basmala.color', 'لون البسملة الافتراضي', b.color, 'لون الأبواب')}</div>
        <p class="muted small">اللون الذي يختاره المستخدم، أو الأسلوب في إعداداته، يتقدم على هذا اللون.</p>`,
      ) +
      sec(
        'num',
        'الترقيم والتجليد',
        `<div class="rowf"><span class="lbl">أرقام الصفحات</span>${seg('numbering', v.numbering, [['count', 'تُحسب صفحات ما قبل الكتاب'], ['book', 'يبدأ الكتاب من ١']])}</div>
        <p class="muted small">${v.numbering === 'book' ? 'أول صفحة في الكتاب رقمها ١، وما قبلها لا يدخل في العد.' : `ما قبل الكتاب يدخل في العد ولا يُطبع عليه رقم، فأول صفحة في الكتاب رقمها ${ar(frontTotal + 1)}.`}</p>
        <div class="grid2">
          <label class="field"><span>هامش التجليد (مم) <small class="muted">— يُزاد جهة الكعب</small></span><input class="inp" type="number" min="0" max="25" step="0.5" data-f="gutterMm" value="${v.gutterMm}"></label>
          <label class="field"><span>إتمام عدد الصفحات إلى مضاعف</span><select class="inp" data-f="padTo">${[0, 2, 4, 8, 16, 32].map((n) => `<option value="${n}" ${v.padTo === n ? 'selected' : ''}>${n ? 'مضاعف ' + ar(n) : 'بلا إتمام'}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">هامش التجليد يزيح النص عن الكعب: يمين الصفحة الفردية ويسار الزوجية، وعرض النص واحد في الجميع. والإتمام يضيف صفحات بيضاء في آخر الملف حتى يقبل عدد الصفحات القسمة (للملازم). الإتمام في ملف PDF فقط.</p>`,
      );
    paintMasks();
    mountText();
  }

  /** مصغّرات البسملة ملوّنةً بلونها */
  function paintMasks() {
    const color = bsmColor();
    for (const img of form.querySelectorAll('img[data-mask]')) {
      const b = cur.library.find((x) => x.id === img.dataset.mask);
      if (b) tintMask(b.src, color).then((u) => (img.src = u)).catch(() => {});
    }
  }

  /* ---------------------------------------------------------------- التغيير */
  const getAt = (path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), cur.value);
  function setAt(path, val) {
    const ks = path.split('.');
    let a = cur.value;
    for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]];
    a[ks[ks.length - 1]] = val;
  }
  /** بعد كل تغيير: إبلاغ الصفحة الأم وتحديث المعاينة */
  function changed({ rerender = false, view = null } = {}) {
    if (rerender) render();
    if (view) preview.goto(view.v, view.page);
    preview.update();
    if (cur.onChange) cur.onChange(cur.value);
  }
  const viewOf = (path) => {
    const m = /^(front|back)\.(\d+)\./.exec(path);
    if (m) return { v: m[1], page: previewIndex(m[1], +m[2]) };
    const first = (t) => {
      const i = cur.value.front.findIndex((x) => x.type === t);
      return i >= 0 ? { v: 'front', page: previewIndex('front', i) } : null;
    };
    if (path.startsWith('half.')) return first('half');
    if (path.startsWith('basmala.')) return first('basmala');
    if (path === 'gutterMm' || path === 'numbering') return { v: 'book', page: preview.state.view === 'book' ? preview.state.page : 0 };
    if (path === 'padTo') return { v: 'back', page: 0 };
    return null;
  };

  form.addEventListener('input', (e) => {
    const t = e.target;
    const f = t.dataset.f;
    if (!f) return;
    let val = t.type === 'checkbox' ? t.checked : t.type === 'number' || t.type === 'range' ? (t.value === '' ? getAt(f) : Number(t.value)) : t.value;
    if (f === 'padTo') val = Number(val);
    setAt(f, val);
    if (t.type === 'range') {
      const out = form.querySelector(`[data-out="${f}"]`);
      if (out) out.textContent = ar(val) + (t.dataset.unit || '');
    }
    if (t.type === 'color') t.parentElement.classList.remove('empty');
    changed({ view: viewOf(f) });
    // تباعد أسطر صفحة النص: يظهر في صفحتها في المحرر فوراً
    if (/\.lineHeight$/.test(f) && cur.rt && cur.rt.area.isConnected) cur.rt.setLayout({ v: getAt(f.replace(/lineHeight$/, 'v')), lineHeight: val });
    if (t.type === 'color' && f === 'basmala.color') paintMasks();
  });
  form.addEventListener('change', async (e) => {
    const t = e.target;
    // بعد اختيار لون أو خانة تغيّر ما يُعرض حولها: إعادة رسم
    if (t.dataset.f && (t.type === 'color' || t.dataset.f === 'padTo')) return render();
    if (t.dataset.img) {
      const [where, i] = t.dataset.img.split('.');
      const file = t.files[0];
      t.value = '';
      if (!file) return;
      try {
        if (file.size > 12 * 1024 * 1024) throw new Error('الصورة أكبر من ١٢ م.ب');
        const img = await toPageImage(file);
        if (img.src.length > 2.6 * 1024 * 1024) throw new Error('الصورة كبيرة بعد تجهيزها: صغّرها ثم ارفعها');
        Object.assign(cur.value[where][+i], img);
        changed({ rerender: true, view: { v: where, page: previewIndex(where, +i) } });
      } catch (err) {
        o.toast(err.message || 'تعذّرت قراءة الصورة', true);
      }
      return;
    }
    if (t.dataset.bfile !== undefined) {
      const files = [...t.files];
      t.value = '';
      for (const file of files) {
        try {
          const mask = await toMask(file);
          const name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 40);
          const r = await o.api('POST', '/api/admin/basmala', { ...mask, name });
          cur.library = r.items;
        } catch (err) {
          o.toast(`${file.name}: ${err.message || 'تعذّرت قراءة الصورة'}`, true);
        }
      }
      render();
      preview.update();
      if (o.onLibrary) o.onLibrary(cur.library);
      return;
    }
    if (t.dataset.bname) {
      try {
        cur.library = (await o.api('PATCH', '/api/admin/basmala/' + t.dataset.bname, { name: t.value })).items;
        if (o.onLibrary) o.onLibrary(cur.library);
      } catch (err) {
        o.toast(err.message, true);
      }
    }
  });
  form.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pe-row')) {
      e.preventDefault();
      e.target.click();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('label.btn, label.pe-bsm.add')) {
      e.preventDefault();
      e.target.querySelector('input[type=file]').click();
    }
  });
  form.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    const item = e.target.closest('.pe-item');
    if (b && b.dataset.add) {
      const where = b.closest('.pe-add').dataset.where;
      const list = cur.value[where];
      if (list.length >= (where === 'front' ? 24 : 12)) return o.toast('بلغ التسلسل حدّه', true);
      list.push(NEW_ITEM[b.dataset.add]());
      cur.sel = { where, i: list.length - 1 };
      return changed({ rerender: true, view: { v: where, page: previewIndex(where, list.length - 1) } });
    }
    if (b && b.dataset.act && item) {
      const where = item.dataset.where;
      const i = +item.dataset.i;
      const list = cur.value[where];
      const act = b.dataset.act;
      let to = i;
      if (act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]], (to = i - 1);
      else if (act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]], (to = i + 1);
      else if (act === 'dup' && list[i].type !== 'cover') list.splice(i + 1, 0, clone(list[i])), (to = i + 1);
      else if (act === 'del' && list[i].type !== 'cover') {
        list.splice(i, 1);
        cur.sel = null;
        return changed({ rerender: true, view: { v: where, page: Math.max(0, previewIndex(where, Math.min(i, list.length - 1))) } });
      } else return;
      cur.sel = { where, i: to };
      return changed({ rerender: true, view: { v: where, page: previewIndex(where, to) } });
    }
    if (b && b.dataset.go) {
      cur.open[b.dataset.go] = true;
      const d = form.querySelector(`details[data-sec="${b.dataset.go}"]`);
      if (d) {
        d.open = true;
        d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    const segEl = b && b.closest('[data-seg]');
    if (segEl && b.dataset.v) {
      setAt(segEl.dataset.seg, b.dataset.v);
      return changed({ rerender: true, view: viewOf(segEl.dataset.seg) });
    }
    if (b && b.dataset.clear) {
      setAt(b.dataset.clear, '');
      return changed({ rerender: true, view: viewOf(b.dataset.clear) });
    }
    if (b && b.dataset.bfirst) {
      try {
        cur.library = (await o.api('PATCH', '/api/admin/basmala/' + b.dataset.bfirst, { first: true })).items;
        render();
        preview.update();
        if (o.onLibrary) o.onLibrary(cur.library);
      } catch (err) {
        o.toast(err.message, true);
      }
      return;
    }
    if (b && b.dataset.bdel) {
      const it = cur.library.find((x) => x.id === b.dataset.bdel);
      if (!confirm(`حذف صورة البسملة «${it ? it.name : ''}»؟`)) return;
      try {
        cur.library = (await o.api('DELETE', '/api/admin/basmala/' + b.dataset.bdel)).items;
        render();
        preview.update();
        if (o.onLibrary) o.onLibrary(cur.library);
      } catch (err) {
        o.toast(err.message, true);
      }
      return;
    }
    // الضغط على صف صفحة: اختيارها (تظهر إعداداتها) وعرضها في المعاينة
    const row = e.target.closest('.pe-row');
    if (row && item && !b) {
      const where = item.dataset.where;
      const i = +item.dataset.i;
      const same = cur.sel && cur.sel.where === where && cur.sel.i === i;
      cur.sel = same ? null : { where, i };
      render();
      preview.goto(where, previewIndex(where, i));
    }
  });

  return {
    /**
     * فتح إعدادٍ للتحرير.
     * @param {object} value                إعداد الطباعة (يُعدَّل في مكانه)
     * @param {object} ctx  { getSettings, getExtras, onChange, library }
     */
    open(value, ctx) {
      cur.value = value;
      cur.getSettings = ctx.getSettings;
      cur.getExtras = ctx.getExtras || null;
      cur.onChange = ctx.onChange || null;
      cur.library = ctx.library || cur.library || [];
      cur.sel = null;
      render();
      // تُفتح المعاينة على أول صفحة فيها شيء (لا على صفحة بيضاء)
      const firstInk = value.front.findIndex((x) => x.type !== 'blank');
      preview.goto('front', previewIndex('front', Math.max(firstInk, 0)));
      preview.update();
    },
    get value() {
      return cur.value;
    },
    get library() {
      return cur.library;
    },
    render,
    preview,
  };
}
