// لوحات «المتون» (في المنضدة وفي المحرِّر): اللوحة نفسها في المكانين، تقرأ الإعدادات وتكتبها بما يُعطى لها.
//   createMutunPanel: «التنضيد» — اللوح (صفحتا الكتاب مفتوحتين، تُرسمان بما اختير، ويُنقر عليهما)، ثم موضع التعليق،
//                     والتقسيم (أو ترتيبٌ ثابت لا يمسّه ورّاق)، وما قبل المتن («قال الناظم…»)، وسطور المتن، وعنوان التعليق وسطوره، وأرقام الأبيات.
//   createRangePanel: «المجلد» — نوع المتن (نظم أو نثر)، وما يُخرج منه (كله، من بابٍ إلى باب، من بيتٍ إلى بيت، من فقرةٍ إلى فقرة).
// كل لوحة: { get() ← الإعدادات، set(patch)، ctx() ← ما يُعرف عن المتن }، و render() بعد كل تغيير من خارجها.
import { MUTUN_LIMITS, INTRO_PICKS, MUTUN_DEFAULTS, OWNER_MAX } from '/shared/mutun.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const lat = (s) => String(s || '').replace(/[٠-٩]/g, (d) => AR.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dec = (n) => ar(String(Math.round(n * 100) / 100)).replace('.', '٫');
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
/** المعدود: بيت، فقرة، سطر، صفحة، جزء */
const COUNTED = {
  بيت: ['بيتٌ واحد', 'بيتان', 'أبيات', 'بيتاً'],
  فقرة: ['فقرةٌ واحدة', 'فقرتان', 'فقرات', 'فقرة'],
  سطر: ['سطرٌ واحد', 'سطران', 'أسطر', 'سطراً'],
  صفحة: ['صفحةٌ واحدة', 'صفحتان', 'صفحات', 'صفحة'],
  جزء: ['جزءٌ واحد', 'جزءان', 'أجزاء', 'جزءاً'],
  عنوان: ['عنوانٌ واحد', 'عنوانان', 'عناوين', 'عنواناً'],
};
export function N(n, w) {
  const f = COUNTED[w];
  n = Number(n) || 0;
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  const k = n % 100;
  return `${ar(n)} ${k >= 3 && k <= 10 ? f[2] : f[3]}`;
}
const unitWord = (n, w) => (n === 1 ? { بيت: 'بيت', فقرة: 'فقرة', سطر: 'سطر' }[w] : n === 2 ? { بيت: 'بيتان', فقرة: 'فقرتان', سطر: 'سطران' }[w] : n <= 10 ? { بيت: 'أبيات', فقرة: 'فقرات', سطر: 'أسطر' }[w] : { بيت: 'بيتاً', فقرة: 'فقرة', سطر: 'سطراً' }[w]);

/* ================================================================== رسوم صغيرة */
// كل رسمٍ ٤٠×٣٠: صفحاتٌ بحدّ رفيع، والنص خطوطٌ بلون المداد، والتعليق سطورٌ بلون السطور
const P = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="pg"/>`;
const T = (x, y, w) => `<path d="M${x} ${y}h${-w}" class="tx"/>`; // نصٌّ من اليمين
const L = (x, y, w) => `<path d="M${x} ${y}h${-w}" class="ru"/>`; // سطر تعليق
const lines = (x, y0, w, n, step, f = T) => Array.from({ length: n }, (_, i) => f(x, y0 + i * step, w - (f === T && i === n - 1 ? w * 0.35 : 0))).join('');
const ic = (inner, w = 40, h = 30) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" class="mu-ic">${inner}</svg>`;
const ICON = {
  page: ic(P(21, 3, 16, 24) + lines(35, 8, 12, 4, 4) + P(3, 3, 16, 24) + lines(17, 8, 12, 5, 4, L)),
  below: ic(P(11, 2, 18, 26) + lines(27, 6, 14, 3, 3.5) + '<path d="M27 16h-14" class="sep"/>' + lines(27, 19.5, 14, 3, 3, L)),
  side: ic(P(9, 2, 22, 26) + lines(29, 6, 10, 5, 4) + '<path d="M17.5 4v22" class="sep"/>' + lines(15.5, 6, 4.5, 6, 3.6, L)),
  right: ic(P(21, 3, 16, 24) + lines(35, 8, 12, 4, 4) + P(3, 3, 16, 24) + lines(17, 8, 12, 5, 4, L)),
  left: ic(P(21, 3, 16, 24) + lines(35, 8, 12, 5, 4, L) + P(3, 3, 16, 24) + lines(17, 8, 12, 4, 4)),
  free: ic(P(21, 3, 16, 24) + lines(35, 6, 12, 2, 3.5) + lines(35, 15, 12, 3, 3.5, L) + P(3, 3, 16, 24) + lines(17, 6, 12, 2, 3.5) + lines(17, 15, 12, 3, 3.5, L)),
  auto: ic('<path d="M20 4l2.2 6.3L28.5 12l-6.3 2.2L20 20.5l-2.2-6.3L11.5 12l6.3-1.7z" class="st"/><path d="M30 19l1 2.6 2.6 1-2.6 1L30 26l-1-2.4-2.6-1 2.6-1z" class="st"/>'),
  heads: ic('<path d="M26 6h-12" class="hd"/>' + lines(32, 12, 24, 3, 4) + '<path d="M26 26h-12" class="hd"/>'),
  verses: ic(Array.from({ length: 4 }, (_, i) => T(34, 6 + i * 6, 12) + T(18, 6 + i * 6, 12)).join('')),
  lines: ic(lines(34, 5, 28, 6, 4) + '<path d="M38 5v20" class="mk"/>'),
  paras: ic(T(31, 6, 25) + T(34, 10, 28) + T(34, 14, 16) + T(31, 20, 25) + T(34, 24, 20)),
  blank: ic(P(6, 3, 28, 24)),
  dots: ic(P(6, 3, 28, 24) + [9, 14, 19, 24].map((y) => `<path d="M31 ${y}h-22" class="dt"/>`).join('')),
  rlines: ic(P(6, 3, 28, 24) + [9, 14, 19, 24].map((y) => L(31, y, 22)).join('')),
  grid: ic(P(6, 3, 28, 24) + [8, 13, 18, 23].map((y) => L(34, y, 28)).join('') + [11, 16, 21, 26, 31].map((x) => `<path d="M${x} 3v24" class="ru"/>`).join('')),
  poem: ic(Array.from({ length: 3 }, (_, i) => T(36, 7 + i * 8, 14) + T(18, 7 + i * 8, 14)).join(''), 40, 30),
  prose: ic(T(33, 6, 28) + T(36, 11, 31) + T(36, 16, 31) + T(36, 21, 18) + T(33, 26, 22), 40, 30),
  alR: ic('<path d="M34 9h-14M34 15h-24M34 21h-18" class="tx"/>', 40, 30),
  alC: ic('<path d="M27 9h-14M32 15h-24M29 21h-18" class="tx"/>', 40, 30),
  alL: ic('<path d="M20 9h-14M30 15h-24M24 21h-18" class="tx"/>', 40, 30),
};

/* ================================================================== اللوح: صفحتا الكتاب مفتوحتين */
// يرسم ما اختير: أين المتن وأين التعليق، وعنوانه وسطوره ولونها، وتوسيط المتن، والأبيات بأرقامها
function spread(m, ctx) {
  const W = 320;
  const H = 214;
  const pw = 148;
  const ph = 196;
  const y0 = 9;
  const xr = W / 2 + 3; // الصفحة اليمنى
  const xl = W / 2 - 3 - pw; // اليسرى
  const pad = 16;
  const poem = !!ctx.poem;
  const color = m.mRuleColor || '#B7AC98';
  const gap = 4.2 + (m.mGap - 5) * 0.32;
  const lead = m.mLead > 0 ? m.mLead / 1.85 : 1;
  const labelAl = m.mLabelAl;
  // المتن: أبياتٌ (شطرين بخاناتها) أو أسطر
  const matn = (x, y, w, h, opt = {}) => {
    const out = [];
    const step = (poem ? 11 : 7.6) * lead;
    let n = Math.max(1, Math.min(opt.max || 99, Math.floor(h / step)));
    if (opt.count) n = Math.min(n, opt.count);
    let yy = y + 4;
    if (opt.center) yy = y + (h - n * step) / 2 + 4;
    // عنوان الباب في الوسط
    out.push(`<path d="M${x + w / 2 + 16} ${yy}h-32" class="lh-h"/>`);
    yy += step * 1.2;
    // ما قبل المتن («قال الناظم…») بلونه وفي موضعه
    if (m.mIntro) {
      const iw = Math.min(w * 0.6, 8 + m.mIntro.length * 2.2);
      const ix = m.mIntroAl === 'c' ? x + (w + iw) / 2 : m.mIntroAl === 'l' ? x + iw : x + w;
      out.push(`<path d="M${ix} ${yy - 1}h${-iw}" class="lh-in" style="stroke:${m.mIntroColor || 'var(--rubric)'}"/>`);
      yy += step;
    }
    const nums = poem ? [m.mSeq !== 'off' && m.mSeq !== 'mid' ? 's' : '', m.mNum !== 'off' && m.mNum !== 'mid' ? 'n' : ''].filter(Boolean).length : 0;
    const mid = poem && ctx.midOk && (m.mNum === 'mid' || m.mSeq === 'mid');
    for (let i = 0; i < n - 1; i++) {
      if (poem) {
        const nx = x + w;
        let bx = nx;
        for (let k = 0; k < nums; k++) {
          out.push(`<rect x="${bx - 7}" y="${yy - 3.4}" width="6" height="6" class="lh-n${k ? ' b' : ''}"/>`);
          bx -= 8;
        }
        const avail = bx - x - (mid ? 10 : 6);
        const hw = avail / 2;
        out.push(`<path d="M${bx - 1} ${yy}h${-hw + 2}" class="lh-t"/><path d="M${x + hw} ${yy}h${-hw + 2}" class="lh-t"/>`);
        if (mid) out.push(`<rect x="${x + hw + 1.5}" y="${yy - 3.2}" width="6" height="6" class="lh-n"/>`);
      } else out.push(`<path d="M${x + w} ${yy}h${-(i % 4 === 3 ? w * 0.55 : w)}" class="lh-t"/>`);
      yy += step;
    }
    return { svg: out.join(''), end: yy };
  };
  const label = (x, y, w, small) => {
    if (!m.mLabel) return { svg: '', end: y };
    const lw = Math.min(w * 0.55, 10 + m.mLabel.length * (small ? 3.6 : 4.6));
    const lx = labelAl === 'r' ? x + w - lw : labelAl === 'l' ? x : x + (w - lw) / 2;
    const c = m.mLabelColor || 'var(--rubric)';
    let deco = '';
    if (m.mLabelDeco === 'rule') deco = `<path d="M${lx + lw} ${y + 9}h${-lw}" stroke="${c}" stroke-width=".8"/>`;
    if (m.mLabelDeco === 'frame') deco = `<rect x="${lx - 3}" y="${y - 5}" width="${lw + 6}" height="12" fill="none" stroke="${c}" stroke-width=".7"/>`;
    if (m.mLabelDeco === 'band') deco = `<rect x="${x}" y="${y - 5}" width="${w}" height="12" fill="${c}" opacity=".12"/><rect x="${x + w - 2}" y="${y - 5}" width="2" height="12" fill="${c}"/>`;
    if (m.mLabelDeco === 'orn') deco = `<path d="M${lx - 6} ${y - 1}l2.2 2.2-2.2 2.2-2.2-2.2zM${lx + lw + 6} ${y - 1}l2.2 2.2-2.2 2.2-2.2-2.2z" fill="var(--gold)"/>`;
    return { svg: deco + `<text x="${lx + lw / 2}" y="${y + 4}" text-anchor="middle" class="lh-l" style="fill:${c}">${esc(m.mLabel.length > 18 ? m.mLabel.slice(0, 17) + '…' : m.mLabel)}</text>`, end: y + 14 };
  };
  const rules = (x, y, w, h) => {
    const out = [];
    const n = Math.floor(h / gap);
    for (let i = 1; i <= n; i++) {
      const yy = y + i * gap;
      if (m.mRule === 'lines' || m.mRule === 'grid') out.push(`<path d="M${x + w} ${yy}h${-w}" stroke="${color}" stroke-width=".55"/>`);
      if (m.mRule === 'dots') out.push(`<path d="M${x + w} ${yy}h${-w}" stroke="${color}" stroke-width=".9" stroke-dasharray=".1 2.4" stroke-linecap="round"/>`);
    }
    if (m.mRule === 'grid') for (let xx = x + w; xx >= x; xx -= gap) out.push(`<path d="M${xx} ${y}v${n * gap}" stroke="${color}" stroke-width=".55"/>`);
    if (m.mRule === 'blank') out.push(`<rect x="${x}" y="${y}" width="${w}" height="${n * gap}" fill="none" stroke="${color}" stroke-width=".4" stroke-dasharray="2 2.6" opacity=".55"/>`);
    return out.join('');
  };
  const page = (x, kind, extra = '') => {
    const ix = x + pad;
    const iw = pw - 2 * pad;
    const iy = y0 + 16;
    const ih = ph - 34;
    let body = '';
    if (kind === 'm') body = matn(ix, iy, iw, ih, { center: m.mCenter, count: poem ? Math.min(7, (m.mDivide === 'verses' || m.mDivide === 'auto' ? m.mCount : 7) + 1) : 9 }).svg;
    else if (kind === 'c') {
      const l = label(ix, iy + 2, iw);
      body = l.svg + rules(ix, l.end, iw, ih - (l.end - iy));
    } else if (kind === 'mb') {
      const t = matn(ix, iy, iw, ih * 0.5, { count: poem ? 5 : 7 });
      const sep = t.end + 1;
      const l = label(ix, sep + 8, iw);
      const room = iy + ih - l.end;
      body = t.svg + `<path d="M${ix + iw} ${sep}h${-iw}" class="lh-sep"/>` + l.svg + rules(ix, l.end, iw, m.mBelow > 0 ? Math.min(room, m.mBelow * gap) : room);
    } else if (kind === 'ms') {
      const sw = iw * (m.mSideW / 100);
      const colLeft = (m.mSide === 'free' ? x < W / 2 : m.mSide !== 'left');
      const mx = colLeft ? ix + sw : ix;
      const cx = colLeft ? ix : ix + iw - sw + 4;
      const t = matn(mx, iy, iw - sw, ih, { count: poem ? 7 : 12 });
      const l = label(cx, iy + 2, sw - 4, true);
      const div = colLeft ? ix + sw - 2 : ix + iw - sw + 2;
      body = t.svg + `<path d="M${div} ${iy}v${ih}" class="lh-sep"/>` + l.svg + rules(cx, l.end, sw - 4, ih - (l.end - iy));
    }
    return `<g class="lh-pg${kind === 'm' || kind === 'mb' || kind === 'ms' ? ' is-m' : ' is-c'}" data-pg="${x > W / 2 ? 'r' : 'l'}"><rect x="${x}" y="${y0}" width="${pw}" height="${ph}" class="lh-paper"/>${body}${extra}</g>`;
  };
  let r;
  let l;
  if (m.mPlace === 'none') (r = 'm'), (l = 'm');
  else if (m.mPlace === 'below') (r = 'mb'), (l = 'mb');
  else if (m.mPlace === 'side') (r = 'ms'), (l = 'ms');
  else if (m.mSide === 'left') (r = 'c'), (l = 'm');
  else (r = 'm'), (l = 'c');
  const fold = `<rect x="${W / 2 - 3}" y="${y0}" width="6" height="${ph}" class="lh-fold"/>`;
  return `<svg class="mu-spread" viewBox="0 0 ${W} ${H}" role="img" aria-label="شكل الصفحتين بما اختير">
    <defs><linearGradient id="muFold" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".0"/><stop offset=".5" stop-color="#000" stop-opacity=".16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    ${page(xr, r)}${page(xl, l)}${fold}</svg>`;
}

/* ================================================================== أدوات اللوحة */
const tile = (k, v, cur, label, sub, icon, dis = false, title = '') =>
  `<button type="button" class="mu-tile" data-k="${k}" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}" ${dis ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${icon || ''}<b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
const seg = (k, cur, opts, cls = '') =>
  `<div class="mu-seg ${cls}" role="group">${opts.map(([v, label, dis, title]) => `<button type="button" data-k="${k}" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}" ${dis ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${label}</button>`).join('')}</div>`;
const counter = (k, v, lim, unit = '', title = '') =>
  `<span class="mu-count" data-count="${k}" ${title ? `title="${esc(title)}"` : ''}><button type="button" data-step="1" data-ck="${k}" aria-label="زد">+</button><input type="text" inputmode="numeric" data-num="${k}" value="${ar(v)}" aria-label="${esc(title || k)}" data-lo="${lim[0]}" data-hi="${lim[1]}"><button type="button" data-step="-1" data-ck="${k}" aria-label="أنقص">−</button>${unit ? `<em>${unit}</em>` : ''}</span>`;
const sw = (k, on, label, sub = '') => `<label class="mu-sw"><input type="checkbox" data-k="${k}" ${on ? 'checked' : ''}><i aria-hidden="true"></i><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
const swatches = (k, cur, list, custom = true, none = '') =>
  `<span class="mu-sws">${none ? `<button type="button" class="mu-swc none${!cur ? ' on' : ''}" data-k="${k}" data-v="" title="${esc(none)}" aria-pressed="${!cur}"><i></i></button>` : ''}${list.map(([c, t]) => `<button type="button" class="mu-swc${cur && cur.toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-k="${k}" data-v="${c}" title="${esc(t)}" aria-pressed="${!!cur && cur.toLowerCase() === c.toLowerCase()}"><i style="background:${c}"></i></button>`).join('')}${custom ? `<label class="mu-swc custom${cur && !list.some(([c]) => c.toLowerCase() === cur.toLowerCase()) ? ' on' : ''}" title="لون آخر"><input type="color" data-k="${k}" value="${/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#B7AC98'}"><i></i></label>` : ''}</span>`;
const RULE_COLORS = [['#B7AC98', 'رمادي الكاغد'], ['#C5A059', 'ذهبي'], ['#9FB3C2', 'أزرق باهت'], ['#A9B79A', 'أخضر زيتي'], ['#D2A9A0', 'وردي باهت'], ['#8F8F8F', 'رمادي']];
const LABEL_COLORS = [['#6B1D2F', 'حُمرة'], ['#2A1D14', 'مداد'], ['#8A6727', 'ذهبي غامق'], ['#1F5E3B', 'أخضر'], ['#2E4A7A', 'أزرق']];
const LABELS = ['التعليقات', 'الشرح', 'الفوائد', 'فقه الحديث', 'المسائل', 'ملحوظات', 'التعليق على الدرس'];
const LEADS = [0, 1.6, 1.85, 2.1, 2.4, 2.8, 3.2];
const GAPS = [6, 7, 8, 10, 12];
const OPEN_KEY = 'warraq.muOpen';

/** مجموعةٌ تُطوى: عنوانها (بمعيَّن) وما اختير فيها مختصراً */
const group = (id, title, sum, body, open) =>
  `<details class="mu-g" data-g="${id}" ${open ? 'open' : ''}><summary><i class="mu-d" aria-hidden="true"></i><b>${title}</b><small>${sum}</small></summary><div class="mu-gb">${body}</div></details>`;

/* ================================================================== «التنضيد»: لوحة المتون */
export function createMutunPanel(host, o) {
  host.classList.add('mu-panel');
  let opened = (() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '["place","divide"]'));
    } catch {
      return new Set(['place', 'divide']);
    }
  })();
  const set = (patch) => o.set(patch);
  function render() {
    const m = o.get();
    const ctx = o.ctx() || {};
    const poem = !!ctx.poem;
    const fonts = ctx.fonts || [];
    const est = ctx.estimate;
    // ما يُذكر في عنوان كل مجموعة
    const placeName = { page: 'صفحةٌ تقابل المتن', below: 'تحت المتن', side: 'هامشٌ بجانب المتن', none: 'كما في الملف' }[m.mPlace];
    const sideName = m.mPlace === 'page' ? { right: 'المتن يميناً', left: 'المتن يساراً', free: 'بلا تقابل' }[m.mSide] : m.mPlace === 'side' ? { right: 'الهامش يساراً', left: 'الهامش يميناً', free: 'الهامش في الحافة الخارجية' }[m.mSide] : '';
    const keep = m.mDivide === 'manual';
    const how = m.mDivide === 'auto' ? 'تلقائي' : { heads: 'بالأبواب', verses: 'بعدد الأبيات', lines: 'بعدد الأسطر', paras: 'بعدد الفقرات', manual: 'ثابتٌ كما هو' }[m.mDivide];
    const counted = !keep && (m.mDivide === 'verses' || m.mDivide === 'lines' || m.mDivide === 'paras' || (m.mDivide === 'auto' && poem));
    const countWord = poem ? 'بيت' : m.mDivide === 'lines' ? 'سطر' : 'فقرة';
    // التقسيم: النظم بأبياته، والنثر بأسطره أو فقراته
    const divs = poem
      ? [['auto', 'تلقائي', 'بعدد الأبيات، والباب يبدأ جزءاً', ICON.auto], ['heads', 'بالأبواب', 'كل بابٍ جزء', ICON.heads, !ctx.hasHeads], ['verses', 'بالأبيات', 'عددٌ تختاره', ICON.verses]]
      : [['auto', 'تلقائي', ctx.hasHeads ? 'بالأبواب' : 'فقرةً فقرة', ICON.auto], ['heads', 'بالأبواب', 'كل بابٍ جزء', ICON.heads, !ctx.hasHeads], ['lines', 'بالأسطر', 'وينتهي بنهاية فقرة', ICON.lines], ['paras', 'بالفقرات', 'عددٌ تختاره', ICON.paras]];
    const divCur = poem && (m.mDivide === 'lines' || m.mDivide === 'paras') ? 'verses' : !poem && m.mDivide === 'verses' ? 'paras' : m.mDivide;
    const placeBody =
      `<div class="mu-tiles t3">${tile('mPlace', 'page', m.mPlace, 'صفحةٌ تقابله', 'المتن في صفحة والتعليق في التي تقابلها', ICON.page)}${tile('mPlace', 'below', m.mPlace, 'تحته', 'بعد فاصلٍ في صفحته', ICON.below)}${tile('mPlace', 'side', m.mPlace, 'بجانبه', 'هامشٌ بطول الصفحة', ICON.side)}</div>` +
      // «كما في الملف»: موضع التعليق في الملف نفسه (في خلفية صفحته مثلاً)، فلا يُزاد عليه شيء — حتى يُختار موضعٌ من هذه
      (m.mPlace === 'none' ? `<p class="mu-note">كما في الملف: موضع التعليق من الملف نفسه (في صفحته أو خلفيتها)، فلا يزيد ورّاق عليه شيئاً. اختر موضعاً مما فوق ليضعه ورّاق.</p>` : '') +
      (m.mPlace === 'page'
        ? `<div class="mu-row"><span class="mu-l">جهة المتن</span><div class="mu-tiles t3 sm">${tile('mSide', 'right', m.mSide, 'المتن يميناً', 'والتعليق يساراً', ICON.right)}${tile('mSide', 'left', m.mSide, 'المتن يساراً', 'والتعليق يميناً', ICON.left)}${tile('mSide', 'free', m.mSide, 'بلا تقابل', 'يلي المتنَ تعليقُه', ICON.free)}</div></div>` +
          `<div class="mu-row two">${sw('mCenter', m.mCenter, 'المتن في وسط صفحته', 'إن لم يملأها')}<span class="mu-inl"><span class="mu-l">صفحات التعليق</span>${counter('mPages', m.mPages, MUTUN_LIMITS.mPages, '', 'صفحات التعليق لكل جزء')}</span></div>` +
          (m.mSide !== 'free' && m.mPages % 2 === 0 ? `<p class="mu-note">بصفحتين للتعليق تُزاد صفحةٌ ليبدأ الجزء التالي في جهته؛ فصفحةٌ أو ثلاث أوفر.</p>` : '')
        : m.mPlace === 'below'
          ? `<div class="mu-row"><span class="mu-l">مساحة التعليق</span><div class="mu-inl">${seg('mBelowMode', m.mBelow > 0 ? 'n' : 'fill', [['fill', 'ما بقي من الصفحة'], ['n', 'عددٌ من السطور']])}${m.mBelow > 0 ? counter('mBelow', m.mBelow, [1, 60], 'سطراً', 'سطور التعليق تحت المتن') : ''}</div></div>`
          : `<div class="mu-row"><span class="mu-l">جهة الهامش</span>${seg('mSide', m.mSide, [['right', 'يسار المتن'], ['left', 'يمين المتن'], ['free', 'الحافة الخارجية']])}</div>` +
            `<div class="mu-row"><span class="mu-l">عرض الهامش</span><span class="mu-range"><input type="range" min="${MUTUN_LIMITS.mSideW[0]}" max="${MUTUN_LIMITS.mSideW[1]}" step="2" value="${m.mSideW}" data-k="mSideW" aria-label="عرض الهامش"><output>${ar(m.mSideW)}٪</output></span></div>` +
            (poem ? `<p class="mu-note">في الهامش يضيق السطر: فالبيت شطرٌ في سطر، والشطر الثاني تحته.</p>` : ''));
    const keepCard = `<div class="mu-keep${keep ? ' on' : ''}">${sw('mKeep', keep, 'لا تمسّ ترتيب الكتاب', keep ? 'الأجزاء ثابتةٌ كما هي، لا يعيد ورّاق تقسيمها ولا تنضيدها؛ وتغيّرها أنت في المحرِّر: حدّد بيتاً أو فقرة ثم «اجعله جزءاً وحده» أو «ابدأ جزءاً من هنا» أو «ضمّه».' : 'يثبّت الأجزاء كما تراها الآن، فلا يعيد ورّاق تقسيمها ولا تنضيدها إذا عدّلت المتن في المحرِّر.')}</div>`;
    const divideBody =
      keepCard +
      (keep
        ? est && est.units
          ? `<p class="mu-est"><i class="mu-d"></i>الأجزاء ثابتة: <b>${N(est.units, 'جزء')}</b>. وفواصل الصفحات التي في الملف تبقى كما هي.</p>`
          : ''
        : `<div class="mu-tiles t${divs.length}">${divs.map(([v, l, s, i, dis]) => tile('mDivide', v, divCur, l, s, i, dis, dis ? 'لا أبواب في هذا المتن' : '')).join('')}</div>`) +
      (keep ? '' : divCur === 'heads'
        ? `<div class="mu-row"><span class="mu-l">يبدأ الجزء عند</span>${seg('mHead', m.mHead >= 4 ? 4 : m.mHead, [[1, 'كل باب'], [2, 'كل باب وفصل'], [4, 'كل عنوان']])}</div>`
        : counted
          ? `<div class="mu-big"><span class="mu-l">في كل جزء</span>${counter('mCount', m.mCount, MUTUN_LIMITS.mCount, unitWord(m.mCount, countWord), 'العدد في كل جزء')}</div>`
          : '') +
      (est && est.units && !keep ? `<p class="mu-est"><i class="mu-d"></i>يخرج المتن في <b>${N(est.units, 'جزء')}</b>${est.verses ? `، و${N(est.verses, 'بيت')}` : est.paras ? `، و${N(est.paras, 'فقرة')}` : ''}. وما تحدّده في المحرِّر (جزءٌ يبدأ هنا، أو يُضمّ إلى ما قبله) يعلو هذا التقسيم.</p>` : '');
    const leadIdx = Math.max(0, LEADS.findIndex((v) => Math.abs(v - (m.mLead || 0)) < 0.01));
    const leadBody =
      `<div class="mu-row"><span class="mu-l">تباعد سطور المتن</span><span class="mu-range"><input type="range" min="0" max="${LEADS.length - 1}" step="1" value="${leadIdx}" data-lead aria-label="تباعد سطور المتن"><output>${m.mLead ? dec(m.mLead) : 'كالأسلوب'}</output></span></div>` +
      `<div class="mu-leadpv" aria-hidden="true" style="--lh:${m.mLead || 1.85}">${poem ? '<i></i><i></i><i></i><i></i><i></i><i></i>' : '<i></i><i></i><i></i><i class="s"></i>'}</div>`;
    const decos = [['plain', 'بلا زينة'], ['rule', 'خطٌّ تحته'], ['frame', 'في إطار'], ['band', 'شريط'], ['orn', 'زخرفة']];
    const fontOpts = `<option value="">خط العناوين${ctx.headingFont ? ` (${esc(ctx.headingFont)})` : ''}</option>` + fonts.map((f) => `<option value="${esc(f.v)}" ${f.v === m.mLabelFont ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
    const labelBody =
      `<div class="mu-row"><span class="mu-l">العنوان</span><span class="mu-lbl"><input type="text" data-text="mLabel" value="${esc(m.mLabel)}" maxlength="60" placeholder="بلا عنوان" aria-label="عنوان موضع التعليق"></span></div>` +
      `<div class="mu-chips">${LABELS.map((t) => `<button type="button" data-k="mLabel" data-v="${esc(t)}" aria-pressed="${t === m.mLabel}">${t}</button>`).join('')}<button type="button" data-k="mLabel" data-v="" aria-pressed="${!m.mLabel}" class="none">بلا عنوان</button></div>` +
      (m.mLabel
        ? `<div class="mu-row"><span class="mu-l">موضعه</span>${seg('mLabelAl', m.mLabelAl, [['r', ICON.alR + '<span>يمين</span>'], ['c', ICON.alC + '<span>وسط</span>'], ['l', ICON.alL + '<span>يسار</span>']], 'icons')}</div>` +
          `<div class="mu-row"><span class="mu-l">زينته</span><div class="mu-decos">${decos.map(([v, t]) => `<button type="button" data-k="mLabelDeco" data-v="${v}" aria-pressed="${m.mLabelDeco === v}" title="${t}"><span class="dl d-${v}">${esc(m.mLabel.length > 10 ? m.mLabel.slice(0, 9) + '…' : m.mLabel)}</span><small>${t}</small></button>`).join('')}</div></div>` +
          `<div class="mu-row"><span class="mu-l">خطه</span><span class="mu-inl"><select data-sel="mLabelFont" aria-label="خط العنوان">${fontOpts}</select>${counter('mLabelSize', m.mLabelSize || ctx.labelSize || 17, MUTUN_LIMITS.mLabelSize, 'نقطة', 'مقاس العنوان')}${sw('mLabelBold', m.mLabelBold, 'عريض')}</span></div>` +
          `<div class="mu-row"><span class="mu-l">لونه</span>${swatches('mLabelColor', m.mLabelColor, LABEL_COLORS, true, 'لون الفصل في الأسلوب')}</div>`
        : '');
    // ما قبل المتن («قال الناظم رحمه الله:»)
    const ifontOpts = `<option value="">خط العناوين${ctx.headingFont ? ` (${esc(ctx.headingFont)})` : ''}</option>` + fonts.map((f) => `<option value="${esc(f.v)}" ${f.v === m.mIntroFont ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
    const picks = poem ? INTRO_PICKS : [...INTRO_PICKS.slice(2), ...INTRO_PICKS.slice(0, 2)];
    const introBody =
      `<p class="mu-note">نصٌّ يسبق المتن، بعد الباب أو الفصل إن كان: «قال الناظم رحمه الله:» أو «قال المصنف…». وتضعه في موضعٍ بعينه (أو ترفعه منه) من المحرِّر.</p>` +
      `<div class="mu-row"><span class="mu-l">النص</span><span class="mu-lbl"><input type="text" data-text="mIntro" value="${esc(m.mIntro)}" maxlength="80" placeholder="بلا نص" aria-label="ما قبل المتن"></span></div>` +
      `<div class="mu-chips">${picks.map((t) => `<button type="button" data-k="mIntro" data-v="${esc(t)}" aria-pressed="${t === m.mIntro}">${esc(t)}</button>`).join('')}<button type="button" data-k="mIntro" data-v="" aria-pressed="${!m.mIntro}" class="none">بلا نص</button></div>` +
      (m.mIntro
        ? `<div class="mu-row"><span class="mu-l">يوضع</span>${seg('mIntroAt', m.mIntroAt, [['first', 'أول المتن'], ['heads', 'بعد كل باب وفصل'], ['units', 'أول كل جزء']])}</div>` +
          `<div class="mu-row"><span class="mu-l">موضعه</span>${seg('mIntroAl', m.mIntroAl, [['r', ICON.alR + '<span>يمين</span>'], ['c', ICON.alC + '<span>وسط</span>'], ['l', ICON.alL + '<span>يسار</span>']], 'icons')}</div>` +
          `<div class="mu-row"><span class="mu-l">زينته</span><div class="mu-decos">${decos.map(([v, t]) => `<button type="button" data-k="mIntroDeco" data-v="${v}" aria-pressed="${m.mIntroDeco === v}" title="${t}"><span class="dl d-${v} in">${esc(m.mIntro.length > 10 ? m.mIntro.slice(0, 9) + '…' : m.mIntro)}</span><small>${t}</small></button>`).join('')}</div></div>` +
          `<div class="mu-row"><span class="mu-l">خطه</span><span class="mu-inl"><select data-sel="mIntroFont" aria-label="خط ما قبل المتن">${ifontOpts}</select>${counter('mIntroSize', m.mIntroSize || ctx.bodySize || 16, MUTUN_LIMITS.mIntroSize, 'نقطة', 'مقاسه')}${sw('mIntroBold', m.mIntroBold, 'عريض')}</span></div>` +
          `<div class="mu-row"><span class="mu-l">لونه</span>${swatches('mIntroColor', m.mIntroColor, LABEL_COLORS, true, 'لون المتن في الأسلوب')}</div>`
        : '');
    const rulesBody =
      `<div class="mu-tiles t4 sm">${tile('mRule', 'lines', m.mRule, 'خطوط', '', ICON.rlines)}${tile('mRule', 'dots', m.mRule, 'منقّطة', '', ICON.dots)}${tile('mRule', 'grid', m.mRule, 'مربعات', '', ICON.grid)}${tile('mRule', 'blank', m.mRule, 'فارغة', '', ICON.blank)}</div>` +
      (m.mRule !== 'blank' ? `<div class="mu-row"><span class="mu-l">لونها</span>${swatches('mRuleColor', m.mRuleColor, RULE_COLORS)}</div>` : '') +
      `<div class="mu-row"><span class="mu-l">ما بينها</span>${seg('mGap', GAPS.includes(m.mGap) ? m.mGap : 8, GAPS.map((g) => [g, ar(g) + ' مم']))}</div>`;
    // أرقام الأبيات: رقم البيت في المنظومة، والعدّ المتسلسل (يبدأ من رقمٍ يُختار)
    const sample = ctx.sample || { parts: ['كلامُنا لفظٌ مفيدٌ كاستقمْ', 'واسمٌ وفعلٌ ثمَّ حرفٌ الكَلِمْ'], vn: 9 };
    const midOk = ctx.midOk !== false;
    const pos = (k, cur) => seg(k, cur === 'off' ? 'side' : cur, [['side', 'خانة يمين البيت'], ['mid', 'بين الشطرين', !midOk, midOk ? '' : 'لا يكون بين الشطرين والشطران في سطرين أو بينهما رموز']]);
    const sn = m.mSeqFrom || 1;
    const numSample = () => {
      const side = [];
      if (m.mSeq === 'side' || (m.mSeq === 'mid' && (!midOk || m.mNum === 'mid'))) side.push(sn);
      if (m.mNum === 'side' || (m.mNum === 'mid' && !midOk)) side.push(sample.vn);
      const mid = midOk && m.mNum === 'mid' ? sample.vn : midOk && m.mSeq === 'mid' && m.mNum !== 'mid' ? sn : null;
      return `<div class="mu-vs" aria-label="مثالٌ من المتن">${side.map((n, i) => `<span class="n${i ? ' b' : ''}">${ar(n)}</span>`).join('')}<span class="h">${esc(sample.parts[0])}</span><span class="c">${mid != null ? ar(mid) : ''}</span><span class="h">${esc(sample.parts[1])}</span></div>`;
    };
    const numsBody =
      numSample() +
      `<div class="mu-nc${m.mNum !== 'off' ? ' on' : ''}">${sw('mNumOn', m.mNum !== 'off', 'رقم البيت في المنظومة', `رقمه في المنظومة كلها: يبقى البيت ${ar(sample.vn)} كذلك وإن بدأ المقطع منه`)}${m.mNum !== 'off' ? pos('mNum', m.mNum) : ''}</div>` +
      `<div class="mu-nc${m.mSeq !== 'off' ? ' on' : ''}">${sw('mSeqOn', m.mSeq !== 'off', 'العدّ المتسلسل', 'عدٌّ جديد لما يُخرج: أول بيتٍ فيه رقمه ما تختاره')}${m.mSeq !== 'off' ? `<div class="mu-inl">${pos('mSeq', m.mSeq)}<span class="mu-inl"><span class="mu-l">يبدأ من</span>${counter('mSeqFrom', m.mSeqFrom, MUTUN_LIMITS.mSeqFrom, '', 'يبدأ العدّ من')}</span></div>` : ''}</div>`;
    // خانات صاحب النسخة أسفل الغلاف الداخلي: الاسم ورقم الهاتف، وما يزيده المستخدم، وبعد كلٍّ خطٌّ أو نقاط أو فراغ
    const own = m.mOwner || { on: false, fields: [] };
    const FILLS = [['line', 'خط'], ['dots', 'نقاط'], ['blank', 'فارغ']];
    const colon = (t) => (/[:：]$/.test(t) ? t : t + ':');
    const ownerBody =
      `<div class="mu-nc${own.on ? ' on' : ''}">${sw('ownOn', own.on, 'خانات يكتب فيها صاحب النسخة', 'أسفل الغلاف الداخلي: يكتب الطالب اسمه ورقمه في نسخته (للمعاهد والدورات)')}</div>` +
      (own.on
        ? `<div class="mu-own">${own.fields
            .map(
              (f, i) => `<div class="mu-of" data-of="${i}"><input type="text" data-of-t="${i}" value="${esc(f.t)}" maxlength="40" aria-label="نص الخانة">` +
                `<div class="mu-seg sm" role="group" aria-label="ما بعد النص">${FILLS.map(([v, t]) => `<button type="button" data-of-f="${v}" data-i="${i}" aria-pressed="${f.f === v}" title="${t === 'فارغ' ? 'فراغٌ يُكتب فيه بلا خط' : t + ' يُكتب عليه'}">${t}</button>`).join('')}</div>` +
                `<span class="mu-of-acts"><button type="button" class="mu-ico" data-of-up="${i}" ${i ? '' : 'disabled'} title="قدّمها" aria-label="قدّمها">↑</button><button type="button" class="mu-ico x" data-of-x="${i}" title="احذف الخانة" aria-label="احذف الخانة">✕</button></span></div>`,
            )
            .join('')}` +
          (own.fields.length < OWNER_MAX
            ? `<div class="mu-of add"><input type="text" data-of-new maxlength="40" placeholder="خانة أخرى، مثل: الرقم الأكاديمي" aria-label="خانة جديدة"><button type="button" class="mu-btn" data-of-add>＋ أضفها</button></div>`
            : '') +
          `</div>${ctx.innerCover === false ? `<p class="mu-note">الغلاف الداخلي الذي يصنعه ورّاق متروكٌ لهذا الكتاب (جاء ملفه بصفحات عنوانه)، فلا تظهر الخانات حتى تختار «إضافة الغلاف الداخلي» في خطوة الكتاب.</p>` : ''}<div class="mu-ownpv" aria-label="هكذا تظهر أسفل الغلاف">${own.fields.map((f) => `<div><span>${esc(colon(f.t))}</span><i class="f-${f.f}"></i></div>`).join('')}</div>`
        : '');
    const ruleName = { lines: 'خطوط', dots: 'منقّطة', grid: 'مربعات', blank: 'فارغة' }[m.mRule];
    const swapTip = m.mPlace === 'page' ? 'انقر صفحةً لتبادل المتن والتعليق جهتيهما' : m.mPlace === 'side' ? 'انقر صفحةً لتبادل المتن والهامش جهتيهما' : '';
    host.innerHTML =
      `<div class="mu-hero"><div class="mu-book" ${swapTip ? `title="${swapTip}" data-swap` : ''}>${spread(m, { ...ctx, midOk })}</div>` +
      `<p class="mu-cap">${esc(placeName)}${sideName ? '، ' + esc(sideName) : ''}${m.mCenter && m.mPlace === 'page' ? '، والمتن في وسط صفحته' : ''}.${swapTip ? ` <span>${swapTip}.</span>` : ''}</p></div>` +
      group('place', 'موضع التعليق', [placeName, sideName].filter(Boolean).join('، '), placeBody, opened.has('place')) +
      group('divide', 'التقسيم', counted && divCur !== 'heads' ? `${how}: ${ar(m.mCount)} في كل جزء` : how, divideBody, opened.has('divide')) +
      group('intro', 'قبل المتن', m.mIntro ? `«${esc(m.mIntro.length > 26 ? m.mIntro.slice(0, 25) + '…' : m.mIntro)}»` : 'بلا نص', introBody, opened.has('intro')) +
      group('lead', 'سطور المتن', m.mLead ? `تباعدها ${dec(m.mLead)}` : 'كالأسلوب', leadBody, opened.has('lead')) +
      group('label', 'عنوان التعليق', m.mLabel ? `«${esc(m.mLabel)}»` : 'بلا عنوان', labelBody, opened.has('label')) +
      group('rules', 'سطور التعليق', `${ruleName}، ${ar(m.mGap)} مم`, rulesBody, opened.has('rules')) +
      group('owner', 'الغلاف الداخلي: خانات صاحب النسخة', own.on ? own.fields.map((f) => esc(f.t)).join('، ') : 'بلا خانات', ownerBody, opened.has('owner')) +
      (poem ? group('nums', 'أرقام الأبيات', [m.mNum !== 'off' ? 'رقم البيت' : '', m.mSeq !== 'off' ? `العدّ من ${ar(sn)}` : ''].filter(Boolean).join(' و') || 'بلا أرقام', numsBody, opened.has('nums')) : '');
  }
  // ما يُختار
  const val = (k, v) => {
    if (['mHead', 'mGap', 'mSideW'].includes(k)) return +v;
    return v;
  };
  // خانات صاحب النسخة
  const owner = () => o.get().mOwner || { on: false, fields: [] };
  const setOwner = (fields, on = true) => set({ mOwner: { on, fields } });
  function addOwner() {
    const inp = host.querySelector('[data-of-new]');
    const t = inp ? inp.value.trim() : '';
    if (!t) return inp && inp.focus();
    setOwner([...owner().fields, { t, f: (owner().fields[owner().fields.length - 1] || {}).f || 'dots' }]);
    const again = host.querySelector('[data-of-new]');
    if (again) again.focus();
  }
  host.addEventListener('click', (e) => {
    const of = e.target.closest('[data-of-f], [data-of-x], [data-of-up], [data-of-add]');
    if (of) {
      const fs = owner().fields.map((f) => ({ ...f }));
      if (of.dataset.ofAdd !== undefined) return addOwner();
      if (of.dataset.ofF) {
        fs[+of.dataset.i].f = of.dataset.ofF;
        return setOwner(fs);
      }
      if (of.dataset.ofX !== undefined) {
        fs.splice(+of.dataset.ofX, 1);
        return setOwner(fs, fs.length > 0);
      }
      if (of.dataset.ofUp !== undefined) {
        const i = +of.dataset.ofUp;
        if (i > 0) [fs[i - 1], fs[i]] = [fs[i], fs[i - 1]];
        return setOwner(fs);
      }
    }
    const sw2 = e.target.closest('[data-swap]');
    if (sw2) {
      const m = o.get();
      const g = e.target.closest('[data-pg]');
      if (!g) return;
      if (m.mPlace === 'page') set({ mSide: m.mSide === 'left' ? 'right' : 'left' });
      else if (m.mPlace === 'side') set({ mSide: m.mSide === 'left' ? 'right' : 'left' });
      return;
    }
    const st = e.target.closest('[data-step]');
    if (st) {
      const k = st.dataset.ck;
      const inp = host.querySelector(`[data-num="${k}"]`);
      const lo = +inp.dataset.lo;
      const hi = +inp.dataset.hi;
      const cur = parseFloat(lat(inp.value)) || lo;
      set({ [k]: clamp(Math.round(cur + +st.dataset.step), [lo, hi]) });
      return;
    }
    const b = e.target.closest('button[data-k]');
    if (!b || b.disabled) return;
    const k = b.dataset.k;
    const m = o.get();
    if (k === 'mBelowMode') return set({ mBelow: b.dataset.v === 'n' ? m.mBelow || 8 : 0 });
    if (k === 'mDivide' && b.dataset.v === 'verses' && !['verses', 'auto'].includes(m.mDivide)) return set({ mDivide: 'verses', mCount: m.mCount > 40 ? 5 : m.mCount });
    if (k === 'mNum' || k === 'mSeq') {
      // الوسط لواحدٍ منهما: يُنقل الآخر إلى الخانة
      const other = k === 'mNum' ? 'mSeq' : 'mNum';
      return set({ [k]: b.dataset.v, ...(b.dataset.v === 'mid' && m[other] === 'mid' ? { [other]: 'side' } : {}) });
    }
    set({ [k]: val(k, b.dataset.v) });
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-k="ownOn"]')) {
      const fs = owner().fields.length ? owner().fields : MUTUN_DEFAULTS.mOwner.fields;
      return setOwner(fs.map((f) => ({ ...f })), t.checked);
    }
    if (t.matches('[data-of-t]')) {
      const fs = owner().fields.map((f) => ({ ...f }));
      const i = +t.dataset.ofT;
      if (t.value.trim()) fs[i].t = t.value.trim();
      else fs.splice(i, 1);
      return setOwner(fs, fs.length > 0);
    }
    if (t.matches('[data-of-new]')) return;
    if (t.matches('[data-num]')) {
      const n = parseFloat(lat(t.value));
      return set({ [t.dataset.num]: clamp(Number.isFinite(n) ? Math.round(n) : +t.dataset.lo, [+t.dataset.lo, +t.dataset.hi]) });
    }
    if (t.matches('[data-text]')) return set({ [t.dataset.text]: t.value.trim() });
    if (t.matches('[data-sel]')) return set({ [t.dataset.sel]: t.value });
    if (t.matches('input[type="checkbox"][data-k]')) {
      const k = t.dataset.k;
      if (k === 'mNumOn') return set({ mNum: t.checked ? 'side' : 'off' });
      if (k === 'mSeqOn') return set({ mSeq: t.checked ? 'side' : 'off' });
      if (k === 'mKeep') return set({ mDivide: t.checked ? 'manual' : 'auto' });
      return set({ [k]: t.checked });
    }
    if (t.matches('input[type="color"][data-k]')) return set({ [t.dataset.k]: t.value });
    if (t.matches('input[type="range"][data-k]')) return set({ [t.dataset.k]: +t.value });
    if (t.matches('[data-lead]')) return set({ mLead: LEADS[+t.value] || 0 });
  });
  // المنزلقات: القيمة تظهر وهي تتحرك
  host.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-lead]')) t.nextElementSibling.textContent = LEADS[+t.value] ? dec(LEADS[+t.value]) : 'كالأسلوب';
    else if (t.matches('input[type="range"][data-k="mSideW"]')) t.nextElementSibling.textContent = ar(t.value) + '٪';
  });
  // العدّاد: السهمان من لوحة المفاتيح، وعجلة الفأرة
  host.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.matches && e.key === 'Enter' && t.matches('[data-of-new]')) return void (e.preventDefault(), addOwner());
    if (t.matches && e.key === 'Enter' && t.matches('[data-of-t]')) return void (e.preventDefault(), t.blur());
    if (!t.matches || !t.matches('[data-num]') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const n = (parseFloat(lat(t.value)) || 0) + (e.key === 'ArrowUp' ? 1 : -1);
    set({ [t.dataset.num]: clamp(n, [+t.dataset.lo, +t.dataset.hi]) });
  });
  host.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches || !d.matches('details.mu-g')) return;
    if (d.open) opened.add(d.dataset.g);
    else opened.delete(d.dataset.g);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...opened]));
    } catch {}
  }, true);
  return {
    render() {
      // ما يُكتب الآن (العنوان) لا يُعاد رسمه تحت المؤشر
      const a = document.activeElement;
      const keep = a && host.contains(a) && a.matches('[data-text]') ? { k: a.dataset.text, s: a.selectionStart, e: a.selectionEnd, v: a.value } : null;
      const y = host.scrollTop;
      render();
      host.scrollTop = y;
      if (keep) {
        const n = host.querySelector(`[data-text="${keep.k}"]`);
        if (n) {
          n.value = keep.v;
          n.focus();
          n.setSelectionRange(keep.s, keep.e);
        }
      }
    },
    open(g) {
      opened.add(g);
      render();
    },
  };
}

/* ================================================================== «المجلد»: نوع المتن، وما يُخرج منه */
export function createRangePanel(host, o) {
  host.classList.add('mu-panel', 'mu-range-panel');
  const set = (patch) => o.set(patch);
  function render() {
    const m = o.get();
    const ctx = o.ctx() || {};
    const poem = !!ctx.poem;
    const R = m.mRange || { mode: 'all' };
    const ol = ctx.outline; // { verses: [...], paras: [...] } أو null (لم يُقرأ بعد)
    const det = ctx.detected; // ما عرفه ورّاق
    const kindCard = (v, name, sub, icon) => {
      const on = m.mKind === v || (m.mKind === 'auto' && det === v);
      return `<button type="button" class="mu-kind" data-kind="${v}" aria-pressed="${on}">${icon}<b>${name}</b><small>${sub}</small>${det === v ? `<em>${m.mKind === 'auto' ? 'عرفه ورّاق' : 'كما عرفه ورّاق'}</em>` : ''}</button>`;
    };
    const total = poem ? (ol ? ol.verses.length : ctx.totalVerses || 0) : ol ? ol.paras.length : ctx.totalParas || 0;
    const word = poem ? 'بيت' : 'فقرة';
    const listOf = poem ? (ol ? ol.verses : null) : ol ? ol.paras : null;
    // أرقام الأبيات قد تكون أرقامها في الملف (منظومةٌ تبدأ من البيت ٤١): أولها وآخرها، وموضع البيت n
    const vnum = poem && ol && Array.isArray(ol.vnum) && ol.vnum.length ? ol.vnum : null;
    const lo = vnum ? ol.vlo : 1;
    const hi = vnum ? ol.vhi : total;
    const idxOf = (n) => (vnum ? vnum.indexOf(n) : n - 1);
    const countIn = (a, z) => (vnum ? vnum.filter((n) => n >= a && n <= z).length : Math.max(0, z - a + 1));
    const modeVerses = poem ? 'verses' : 'paras';
    const curMode = R.mode === 'verses' || R.mode === 'paras' ? (R.mode === modeVerses ? R.mode : 'all') : R.mode;
    const heads = ctx.heads || [];
    const opt = (h, i) => `<option value="${i}">${' '.repeat(Math.max(0, (h.lvl - 1) * 3))}${esc(h.t.length > 70 ? h.t.slice(0, 68) + '…' : h.t)}</option>`;
    const idx = (x) => (x ? Math.max(0, heads.findIndex((h) => h.t === x.t && h.n === x.n)) : 0);
    let body = '';
    if (curMode === 'heads') {
      body = `<div class="mu-fromto"><label><span class="mu-l">من</span><select data-head="from">${heads.map(opt).join('')}</select></label><label><span class="mu-l">إلى (وما تحته)</span><select data-head="to">${heads.map(opt).join('')}</select></label></div>`;
    } else if (curMode === modeVerses) {
      const from = Math.max(lo, R.from || lo);
      const to = R.to || 0;
      const gist = (n) => (listOf && listOf[idxOf(n)] ? `<q>${esc(listOf[idxOf(n)])}</q>` : '');
      body =
        `<div class="mu-fromto"><div class="mu-pick"><span class="mu-l">من ${poem ? 'البيت' : 'الفقرة'}</span>${counter('rFrom', from, [lo, Math.max(lo, hi || 99999)], '', 'من')}${gist(from)}</div>` +
        `<div class="mu-pick"><span class="mu-l">إلى ${poem ? 'البيت' : 'الفقرة'}</span>${to ? counter('rTo', to, [from, Math.max(from, hi || 99999)], '', 'إلى') : `<span class="mu-end">${poem ? 'آخر المنظومة' : 'آخر المتن'}</span>`}${to ? gist(to) : ''}${sw('rEnd', !to, poem ? 'إلى آخرها' : 'إلى آخره')}</div></div>` +
        (total ? `<p class="mu-est"><i class="mu-d"></i>يُخرج <b>${N(countIn(from, to || hi), word)}</b> من ${N(total, word)}${poem ? '، وأرقامها أرقامها في المنظومة كلها' : ''}. والباب والفصل اللذان فيهما أوله يُذكران فوقه.</p>` : ctx.loading ? `<p class="mu-est loading">يُقرأ المتن ليُعرف أول كل ${poem ? 'بيت' : 'فقرة'}…</p>` : '');
    }
    host.innerHTML =
      `<div class="mu-kinds" role="group" aria-label="نوع المتن">${kindCard('poem', 'نظم', 'منظومة: أبياتٌ بشطريها', ICON.poem)}${kindCard('prose', 'نثر', 'متنٌ منثور: فقراتٌ وأبواب', ICON.prose)}</div>` +
      `<p class="mu-note">${poem ? 'المنظومة تُقسم بأبياتها وتُرقّم، وتُخرج من بيتٍ إلى بيت.' : 'المتن المنثور يُقسم بأسطره أو فقراته أو أبوابه، ويُخرج من فقرةٍ إلى فقرة.'}${det && m.mKind !== 'auto' && m.mKind !== det ? ` <button type="button" class="mu-link" data-kind="auto">ارجع إلى ما عرفه ورّاق</button>` : ''}</p>` +
      `<div class="mu-strip${m.mStrip !== false ? ' on' : ''}">${sw('mStrip', m.mStrip !== false, 'احذف ترقيم الملف', poem ? (ctx.srcNums ? `في الملف أبياتٌ مرقّمة: يُحذف الرقم وما بعده («١-»، «(١)»، «١.») ويُرقّم المتن بأرقام ورّاق، ورقم البيت في المنظومة يبقى رقمه${vnum && lo > 1 ? ` (أوله البيت ${ar(lo)})` : ''}.` : 'إن كانت الأبيات في الملف مرقّمة («١- …» أو في جدولٍ بخانة الرقم): يُحذف الرقم ويُرقّم المتن بأرقام ورّاق.') : 'الأبيات المرقّمة في الملف يُحذف رقمها ويُرقّم بأرقام ورّاق.')}</div>` +
      `<div class="mu-sub"><i class="mu-d"></i><b>ما يُخرج من المتن</b></div>` +
      `<div class="mu-tiles t3">${tile('rMode', 'all', curMode, poem ? 'المنظومة كلها' : 'المتن كله', total ? N(total, word) : '', '')}${tile('rMode', 'heads', curMode, 'من بابٍ إلى باب', heads.length ? N(heads.length, 'عنوان') : 'لا أبواب فيه', '', !heads.length)}${tile('rMode', modeVerses, curMode, poem ? 'من بيتٍ إلى بيت' : 'من فقرةٍ إلى فقرة', poem ? 'بأرقامها في المنظومة' : 'بترتيبها في المتن', '')}</div>` +
      body;
    if (curMode === 'heads') {
      const f = host.querySelector('[data-head="from"]');
      const t = host.querySelector('[data-head="to"]');
      if (f) f.value = String(idx(R.from));
      if (t) t.value = String(R.to ? idx(R.to) : idx(R.from));
    }
  }
  const headOf = (i) => {
    const h = (o.ctx().heads || [])[+i];
    return h ? { t: h.t, n: h.n } : null;
  };
  const range = () => o.get().mRange || { mode: 'all' };
  host.addEventListener('click', (e) => {
    const k = e.target.closest('[data-kind]');
    if (k) return set({ mKind: k.dataset.kind });
    const st = e.target.closest('[data-step]');
    if (st) {
      const inp = host.querySelector(`[data-num="${st.dataset.ck}"]`);
      const n = clamp(Math.round((parseFloat(lat(inp.value)) || 1) + +st.dataset.step), [+inp.dataset.lo, +inp.dataset.hi]);
      return setNum(st.dataset.ck, n);
    }
    const b = e.target.closest('button[data-k="rMode"]');
    if (!b || b.disabled) return;
    const v = b.dataset.v;
    if (v === 'heads') set({ mRange: { mode: 'heads', from: headOf(0), to: headOf(0) } });
    else if (v === 'verses' || v === 'paras') {
      const ol = (o.ctx() || {}).outline;
      set({ mRange: { mode: v, from: v === 'verses' && ol && ol.vlo ? ol.vlo : 1, to: 0 } });
    }
    else set({ mRange: { mode: 'all' } });
    if (o.needOutline) o.needOutline();
  });
  function setNum(k, n) {
    const R = range();
    if (k === 'rFrom') set({ mRange: { ...R, from: n, to: R.to ? Math.max(n, R.to) : 0 } });
    else if (k === 'rTo') set({ mRange: { ...R, to: Math.max(R.from || 1, n) } });
  }
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-head]')) {
      const a = +host.querySelector('[data-head="from"]').value;
      let z = +host.querySelector('[data-head="to"]').value;
      if (z < a) z = a;
      return set({ mRange: { mode: 'heads', from: headOf(a), to: headOf(z) } });
    }
    if (t.matches('[data-num]')) {
      const n = Math.round(parseFloat(lat(t.value)) || 1);
      return setNum(t.dataset.num, clamp(n, [+t.dataset.lo, +t.dataset.hi]));
    }
    if (t.matches('[data-k="mStrip"]')) return set({ mStrip: t.checked });
    if (t.matches('[data-k="rEnd"]')) {
      const R = range();
      const c = o.ctx() || {};
      const total = c.poem ? (c.outline && c.outline.vhi ? c.outline.vhi : c.totalVerses || 0) : c.outline ? c.outline.paras.length : c.totalParas || 0;
      return set({ mRange: { ...R, to: t.checked ? 0 : Math.max(R.from || 1, Math.min(total || (R.from || 1) + 9, (R.from || 1) + 9)) } });
    }
  });
  host.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.matches || !t.matches('[data-num]') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    setNum(t.dataset.num, clamp((parseFloat(lat(t.value)) || 1) + (e.key === 'ArrowUp' ? 1 : -1), [+t.dataset.lo, +t.dataset.hi]));
  });
  return { render };
}
