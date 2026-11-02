// «العتبة»: أول ما يُرى في المِنضدة والمحرِّر حين لا كتاب عليهما — ثلاثة أبواب للعمل: الكتب، والأبحاث، والمتون.
// لكلٍّ منها فهمه وتنضيده: الكتاب متنه وشرحه وحواشيه، والبحث صفحة عنوانه وملخصه ومباحثه ومراجعه، والمتون (قريباً).
// وحدةٌ واحدة للبابين (تُحقن أنماطها مرة)، بألوان البرنامج ومتغيّراته (wq.css) فتتبع السِّراج.

export const WORK_KINDS = {
  books: { name: 'الكتب', short: 'كتب' },
  research: { name: 'الأبحاث', short: 'بحث' },
  mutun: { name: 'المتون', short: 'متن' },
};
export const isKind = (k) => k === 'books' || k === 'research' || k === 'mutun';

/* رسوم الأبواب: بخطوط البرنامج وألوانه (الحُمرة والذهب والحبر) */
const ART = {
  books: `<svg viewBox="0 0 120 84" aria-hidden="true">
    <path d="M10 76h100" stroke="var(--kg-line)" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="22" y="22" width="15" height="54" rx="1.5" fill="var(--kg-rubric)"/>
    <rect x="22" y="30" width="15" height="2.6" fill="var(--kg-gold)"/><rect x="22" y="66" width="15" height="2.6" fill="var(--kg-gold)"/>
    <rect x="39" y="14" width="13" height="62" rx="1.5" fill="var(--kg-ink)" opacity=".86"/>
    <rect x="39" y="22" width="13" height="2.4" fill="var(--kg-gold)"/><rect x="39" y="68" width="13" height="2.4" fill="var(--kg-gold)"/>
    <path d="M44 40l1.5 1.5L44 43l-1.5-1.5z" fill="var(--kg-gold)"/>
    <rect x="54" y="26" width="17" height="50" rx="1.5" fill="var(--kg-rubric)" opacity=".78"/>
    <rect x="54" y="33" width="17" height="2.4" fill="var(--kg-gold)"/><rect x="54" y="68" width="17" height="2.4" fill="var(--kg-gold)"/>
    <g transform="rotate(-14 86 76)"><rect x="76" y="20" width="14" height="56" rx="1.5" fill="var(--kg-gold)" opacity=".9"/>
    <rect x="76" y="28" width="14" height="2.4" fill="var(--kg-rubric)"/><rect x="76" y="68" width="14" height="2.4" fill="var(--kg-rubric)"/></g>
  </svg>`,
  research: `<svg viewBox="0 0 120 84" aria-hidden="true">
    <rect x="34" y="4" width="54" height="76" rx="2" fill="var(--kg-sheet)" stroke="var(--kg-line)" stroke-width="1.6"/>
    <rect x="28" y="8" width="54" height="76" rx="2" fill="var(--kg-sheet)" stroke="var(--kg-ink)" stroke-opacity=".55" stroke-width="1.6"/>
    <rect x="45" y="16" width="20" height="3.2" rx="1" fill="var(--kg-ink)"/>
    <rect x="35" y="24" width="40" height="13" rx="1" fill="none" stroke="var(--kg-rubric)" stroke-width="1.3"/>
    <path d="M39 29h32M39 33h22" stroke="var(--kg-rubric)" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="58" y="42" width="17" height="2.6" rx="1" fill="var(--kg-ink)"/>
    <path d="M35 49h40M35 54h40M35 59h40M47 64h28" stroke="var(--kg-ink)" stroke-opacity=".45" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M61 70h14" stroke="var(--kg-ink)" stroke-width="1"/>
    <path d="M43 74h32" stroke="var(--kg-ink)" stroke-opacity=".35" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M92 16l3 3-3 3-3-3zM92 24l3 3-3 3-3-3z" fill="var(--kg-gold)"/>
  </svg>`,
  // المتن في صفحة، ومقابلها صفحةٌ مسطّرة للتعليق عليه
  mutun: `<svg viewBox="0 0 120 84" aria-hidden="true">
    <path d="M60 10C50 6 32 5 14 8v66c18-3 36-2 46 2z" fill="var(--kg-sheet)" stroke="var(--kg-line)" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M60 10c10-4 28-5 46-2v66c-18-3-36-2-46 2z" fill="var(--kg-sheet)" stroke="var(--kg-line)" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M60 10v66" stroke="var(--kg-line)" stroke-width="1.2"/>
    <path d="M83 15l2.5 2.5-2.5 2.5-2.5-2.5z" fill="var(--kg-gold)"/>
    <path d="M68 27h31M68 34h31M68 41h31M68 48h24M68 55h31M68 62h20" stroke="var(--kg-rubric)" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M20 22h33M20 30h33M20 38h33M20 46h33M20 54h33M20 62h33" stroke="var(--kg-ink)" stroke-opacity=".22" stroke-width="1" stroke-dasharray="2 2.4"/>
    <path d="M24 29c4-2 8 1 12-1M24 37c5-2 9 1 15-1" stroke="var(--kg-ink)" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round" fill="none"/>
  </svg>`,
};
/** أيقونة صغيرة للنوع (لزرّ «تغيير») */
export const kindIcon = (k) => (ART[k] || ART.books).replace('<svg ', '<svg class="kg-ico" ');

const TEXT = {
  bench: {
    h: 'ماذا تضع على المِنضدة؟',
    p: 'لكلٍّ فهمه وتنضيده: الكتاب يُعرف متنه وشرحه وحواشيه، والبحث صفحة عنوانه وملخصه ومباحثه ومراجعه.',
  },
  editor: {
    h: 'ماذا تحرّر؟',
    p: 'اختر ما تراجعه صفحةً صفحة كما يخرج، فيُفتح المحرِّر بما يناسبه.',
  },
};
const CARD = {
  books: 'كتب التراث من «تراث» والشاملة، أو ملف Word و PDF من جهازك: المتن والشرح والحاشية، والآيات والأبيات، بأساليب دور النشر.',
  research: 'بحثك العلمي من Word أو PDF: صفحة العنوان والملخص، والمقدمة والمباحث والمطالب، والحواشي والمراجع، بمواصفات الأبحاث الجامعية والمحكّمة.',
  mutun: 'المتن وصفحةٌ للتعليق عليه: المتن في صفحة، ومقابلها صفحةٌ مسطّرة يكتب فيها الطالب تعليقه وفوائده.',
};

const CSS = `
.kg { --kg-rubric: var(--rubric, #6B1D2F); --kg-gold: var(--gold, #C5A059); --kg-ink: var(--ink, #1d1712); --kg-line: var(--line, #E4DCCB);
  --kg-sheet: var(--sheet, #fffdf8); --kg-muted: var(--muted, #6C5949);
  position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; overflow: auto; padding: 32px 24px;
  background: radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--sheet, #fffdf8) 70%, var(--paper, #f6f1e7)), var(--paper, #f6f1e7) 72%);
  font-family: var(--ui, Tajawal, sans-serif); color: var(--kg-ink); direction: rtl;
  animation: kgIn .35s var(--pen, ease) both; }
.kg.out { animation: kgOut .32s ease both; }
@keyframes kgIn { from { opacity: 0; } }
@keyframes kgOut { to { opacity: 0; } }
.kg-in { width: min(980px, 100%); display: grid; justify-items: center; gap: 10px; text-align: center; }
.kg-mark { width: 26px; height: 48px; color: var(--kg-rubric); margin-bottom: 2px; }
.kg-mark .lgd { fill: var(--kg-gold); }
.kg h1 { margin: 0; font: 700 34px/1.35 var(--display, serif); color: var(--kg-rubric); }
.kg-lead { margin: 0 0 18px; max-width: 58ch; color: var(--kg-muted); font-size: 15px; line-height: 1.8; }
.kg-cards { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.kg-card { position: relative; display: grid; grid-template-rows: auto auto 1fr auto; justify-items: center; gap: 8px; padding: 26px 22px 20px;
  font: inherit; color: inherit; text-align: center; cursor: pointer; border-radius: 6px;
  border: 1px solid var(--kg-line); background: linear-gradient(180deg, var(--kg-sheet), color-mix(in srgb, var(--kg-sheet) 88%, var(--kg-gold)));
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 10px 26px -18px rgba(60,30,10,.45);
  transition: transform .25s var(--pen, ease), box-shadow .25s, border-color .2s;
  animation: kgUp .55s var(--pen, ease) both; animation-delay: calc(var(--i) * 90ms + 80ms); }
@keyframes kgUp { from { opacity: 0; transform: translateY(18px); } }
.kg-card::before { content: ''; position: absolute; inset: 7px; border: 1px solid color-mix(in srgb, var(--kg-gold) 45%, transparent); border-radius: 3px; pointer-events: none; }
.kg-card:not([aria-disabled="true"]):hover, .kg-card:not([aria-disabled="true"]):focus-visible { transform: translateY(-5px); border-color: var(--kg-gold);
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 22px 40px -22px rgba(60,30,10,.55); outline: none; }
.kg-card svg { width: 132px; height: 92px; display: block; transition: transform .35s var(--pen, ease); }
.kg-card:not([aria-disabled="true"]):hover svg { transform: scale(1.05); }
.kg-card b { font: 700 27px/1.4 var(--display, serif); color: var(--kg-rubric); }
.kg-card b::after { content: ''; display: block; height: 2px; width: 0; margin: 4px auto 0; background: var(--kg-gold); transition: width .3s var(--pen, ease); }
.kg-card:not([aria-disabled="true"]):hover b::after, .kg-card:not([aria-disabled="true"]):focus-visible b::after, .kg-card.cur b::after { width: 46px; }
.kg-card p { margin: 0; font-size: 13.5px; line-height: 1.85; color: var(--kg-muted); }
.kg-go { margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--kg-rubric); opacity: .0; transform: translateY(4px); transition: opacity .2s, transform .2s; }
.kg-card:not([aria-disabled="true"]):hover .kg-go, .kg-card:focus-visible .kg-go, .kg-card.cur .kg-go { opacity: 1; transform: none; }
.kg-card.cur { border-color: var(--kg-rubric); }
.kg-card.cur .kg-go { opacity: 1; transform: none; }
.kg-card[aria-disabled="true"] { cursor: default; filter: saturate(.55); }
.kg-card[aria-disabled="true"] svg, .kg-card[aria-disabled="true"] p { opacity: .62; }
.kg-seal { position: absolute; top: 14px; left: 14px; padding: 3px 11px; border-radius: 999px; font-size: 12px; font-weight: 700;
  color: var(--kg-gold); border: 1px solid var(--kg-gold); background: var(--kg-sheet); transform: rotate(-8deg); }
.kg-card.pick { animation: kgPick .45s var(--stamp, ease) both; border-color: var(--kg-rubric); }
@keyframes kgPick { 40% { transform: translateY(-6px) scale(1.03); } 100% { transform: translateY(-2px) scale(1); } }
.kg-foot { margin-top: 16px; display: flex; gap: 10px; align-items: center; color: var(--kg-muted); font-size: 12.5px; }
.kg-foot button { font: 700 12.5px/1.6 var(--ui, sans-serif); padding: 5px 14px; border-radius: 999px; border: 1px solid var(--kg-line); background: var(--kg-sheet); color: var(--kg-ink); cursor: pointer; }
.kg-foot button:hover { border-color: var(--kg-gold); color: var(--kg-rubric); }
.kg-foot kbd { font: inherit; padding: 0 6px; border: 1px solid var(--kg-line); border-radius: 4px; }
@media (max-width: 760px) { .kg-cards { grid-template-columns: 1fr; } .kg h1 { font-size: 28px; } }
@media (prefers-reduced-motion: reduce) { .kg, .kg-card, .kg-card svg { animation: none !important; transition: none !important; } }
/* زرّ النوع: في المنضدة والمحرِّر */
.kg-pill { display: inline-flex; align-items: center; gap: 7px; padding: 4px 12px 4px 6px; border-radius: 999px; border: 1px solid var(--line, #E4DCCB);
  background: var(--sheet, #fffdf8); color: var(--ink, #1d1712); font: 700 13px/1.6 var(--ui, sans-serif); cursor: pointer; transition: border-color .15s, color .15s; }
.kg-pill:hover { border-color: var(--gold, #C5A059); color: var(--rubric, #6B1D2F); }
.kg-pill .kg-ico { width: 30px; height: 21px; --kg-rubric: var(--rubric, #6B1D2F); --kg-gold: var(--gold, #C5A059); --kg-ink: var(--ink, #1d1712); --kg-line: var(--line, #E4DCCB); --kg-sheet: var(--sheet, #fffdf8); }
.kg-pill small { font-weight: 400; color: var(--muted, #6C5949); font-size: 11.5px; }
`;
function injectCss() {
  if (document.getElementById('kg-css')) return;
  const st = document.createElement('style');
  st.id = 'kg-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

const MARK = `<svg class="kg-mark" viewBox="0 0 40 72" aria-hidden="true"><path d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z" fill="currentColor"/><g class="lgd"><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07z"/><path d="M12 14.14l7.07 7.07L12 28.28l-7.07-7.07z"/><path d="M12 28.28l7.07 7.07L12 42.42l-7.07-7.07z"/><path d="M12 42.42l7.07 7.07L12 56.56l-7.07-7.07z"/><path d="M12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></g></svg>`;

let openGateEl = null;
export const gateOpen = () => !!openGateEl;

/**
 * يعرض العتبة ← وعدٌ بالنوع المختار ('books' | 'research')، أو null إن أُغلقت (Esc، وفي النوع المختار قبلُ).
 * @param {{door?: 'bench'|'editor', current?: string, note?: string}} o
 */
export function openGate(o = {}) {
  injectCss();
  if (openGateEl) closeGate(null);
  const t = TEXT[o.door] || TEXT.bench;
  const cur = isKind(o.current) ? o.current : '';
  const el = document.createElement('div');
  el.className = 'kg';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t.h);
  el.innerHTML =
    `<div class="kg-in">${MARK}<h1>${t.h}</h1><p class="kg-lead">${o.note || t.p}</p><div class="kg-cards" role="group">` +
    Object.entries(WORK_KINDS)
      .map(
        ([k, v], i) =>
          `<button type="button" class="kg-card${k === cur ? ' cur' : ''}" data-kind="${k}" style="--i:${i}"${v.soon ? ' aria-disabled="true" title="قريباً"' : ''}>` +
          `${v.soon ? '<span class="kg-seal">قريباً</span>' : ''}${ART[k]}<b>${v.name}</b><p>${CARD[k]}</p>` +
          `<span class="kg-go">${v.soon ? '' : k === cur ? 'المختار الآن' : 'ابدأ ←'}</span></button>`,
      )
      .join('') +
    `</div>${cur ? `<div class="kg-foot"><button type="button" data-kg="stay">ابقَ على «${WORK_KINDS[cur].name}»</button><span><kbd>Esc</kbd></span></div>` : ''}</div>`;
  document.body.appendChild(el);
  openGateEl = el;
  return new Promise((resolve) => {
    el._resolve = resolve;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kg="stay"]')) return closeGate(null);
      const c = e.target.closest('.kg-card');
      if (!c || c.getAttribute('aria-disabled') === 'true') return;
      c.classList.add('pick');
      setTimeout(() => closeGate(c.dataset.kind), 260);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cur) closeGate(null);
      // الأسهم بين البطاقات
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const cs = [...el.querySelectorAll('.kg-card:not([aria-disabled="true"])')];
        const i = cs.indexOf(document.activeElement);
        const n = cs[(i + (e.key === 'ArrowLeft' ? 1 : -1) + cs.length) % cs.length];
        if (n) n.focus();
      }
    });
    setTimeout(() => {
      const f = el.querySelector('.kg-card.cur') || el.querySelector('.kg-card');
      if (f && el.isConnected) f.focus({ preventScroll: true });
    }, 120);
  });
}
/** يغلق العتبة (pick: النوع المختار أو null) */
export function closeGate(pick = null) {
  const el = openGateEl;
  if (!el) return;
  openGateEl = null;
  el.classList.add('out');
  setTimeout(() => el.remove(), 320);
  if (el._resolve) el._resolve(pick);
}

/** زرّ النوع الحالي ← يفتح العتبة لتغييره */
export function kindPill(kind) {
  injectCss();
  const k = isKind(kind) ? kind : 'books';
  return `<button type="button" class="kg-pill" data-kind-pill title="تغيير: الكتب، أو الأبحاث، أو المتون">${kindIcon(k)}<span>${WORK_KINDS[k].name}</span><small>تغيير</small></button>`;
}
