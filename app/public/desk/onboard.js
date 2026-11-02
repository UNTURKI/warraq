// أول لقاء (كما في «ورّاق البرنامج»): خمس شاشات تظهر مرة واحدة عند أول تشغيل للبرنامج.
//   ١. الافتتاح: النقط الخمس تُنقط ثم يُمدّ الألف
//   ٢. المظهر: العنّابي والذهب، أو المِداد والحُمرة، أو السِّراج (ويتبع ويندوز إن شاء)
//   ٣. ترتيب الخزانة: بلا تقسيم، أو بموضوع الكتاب (من فهرس «تراث»)، أو مجموعاتي
//   ٤. أين تُحفظ الكتب (ويُغيَّر)، والخط، والتنبيه يُقرأ ويُقبل
//   ٥. جرّب الآن: كتاب من «تراث»، أو ملف Word يُسحب إلى البطاقة
const desk = window.warraqDesktop || null;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NIGHT = 'warraq.night';

const CSS = `
.ob { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--ink) 38%, transparent); backdrop-filter: blur(3px); }
.ob-card { width: min(640px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 30px 80px -30px rgba(0,0,0,.6); padding: 30px 34px 24px; display: grid; gap: 18px; font: 15.5px/1.8 var(--ui); }
.ob-head { display: flex; align-items: center; gap: 16px; }
.ob-head svg { width: 30px; height: 54px; flex: none; color: var(--mark); }
.ob h2 { margin: 0; font: 700 30px/1.3 var(--display); color: var(--rubric); }
.ob p { margin: 0; }
.ob .muted { color: var(--muted); font-size: 14px; }
.ob-steps { display: flex; gap: 8px; }
.ob-steps i { width: 10px; height: 10px; transform: rotate(45deg); border: 1.5px solid var(--gold); }
.ob-steps i.on { background: var(--gold); }
.ob-looks { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ob-look { border: 1.5px solid var(--line); border-radius: 10px; padding: 10px; background: var(--sheet); cursor: pointer; display: grid; gap: 8px; text-align: center; font: 700 14px var(--ui); color: var(--ink); }
.ob-look[aria-checked="true"] { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold); }
.ob-look i { display: block; height: 54px; border-radius: 6px; }
.ob-chk { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; cursor: pointer; }
.ob-chk input { margin-top: 6px; accent-color: var(--btn); width: 16px; height: 16px; }
.ob-path { display: flex; gap: 10px; align-items: center; }
.ob-path code { flex: 1; min-width: 0; direction: ltr; text-align: right; unicode-bidi: plaintext; font: 14px var(--ui); background: var(--vellum); border: 1px solid var(--line); border-radius: 7px; padding: 8px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-ok { display: flex; gap: 10px; align-items: center; font-size: 14px; color: var(--ink); }
.ob-ok::before { content: ""; width: 9px; height: 9px; background: var(--gold); transform: rotate(45deg); flex: none; }
.ob-note { border-inline-start: 3px solid var(--gold); padding: 6px 14px; background: var(--vellum); border-radius: 0 8px 8px 0; font-size: 15px; }
.ob-note b { color: var(--rubric); }
.ob-acts { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.ob-acts .end { display: flex; gap: 10px; }
.ob .btn { font: 700 14.5px var(--ui); border-radius: 7px; padding: 9px 18px; border: 1px solid var(--line); background: var(--sheet); color: var(--ink); cursor: pointer; }
.ob .btn.pri { background: var(--btn); border-color: var(--btn); color: var(--on-rubric); }
.ob .btn:disabled { opacity: .45; cursor: default; }
.ob .tl { font: 700 14px var(--ui); color: var(--muted); background: none; border: 0; cursor: pointer; padding: 6px; }
`;
const CSS2 = `
.ob-card.s0 { justify-items: center; text-align: center; padding: 46px 34px 26px; gap: 10px; }
.ob-open svg { width: 46px; height: 83px; color: var(--mark); overflow: visible; }
.ob-open .lgd path { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ob-dot .45s var(--stamp, cubic-bezier(.3,1.6,.5,1)) forwards; }
.ob-open .lgd path:nth-child(2) { animation-delay: .12s; } .ob-open .lgd path:nth-child(3) { animation-delay: .24s; } .ob-open .lgd path:nth-child(4) { animation-delay: .36s; } .ob-open .lgd path:nth-child(5) { animation-delay: .48s; }
.ob-open .alif { transform-box: fill-box; transform-origin: top; transform: scaleY(0); animation: ob-mad .7s .7s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes ob-dot { from { opacity: 0; transform: scale(1.8) rotate(-20deg); } to { opacity: 1; transform: none; } }
@keyframes ob-mad { to { transform: none; } }
@media (prefers-reduced-motion: reduce) { .ob-open .lgd path, .ob-open .alif { animation: none; opacity: 1; transform: none; } }
.ob-name { font: 700 46px/1.3 var(--display); color: var(--rubric); margin-top: 8px; }
.ob-tag { font: 17px/1.6 var(--display); color: var(--muted); }
.ob-looks.three { grid-template-columns: repeat(3, 1fr); }
.ob-look i.dark { background: linear-gradient(90deg, #0F1A2B 55%, #E2C27A 55% 75%, #16243B 75%) !important; }
.ob-try { border: 1px solid var(--line); background: var(--sheet); border-radius: 10px; padding: 14px 16px; display: grid; gap: 4px; }
.ob-try b { font: 700 22px/1.4 var(--display); color: var(--rubric); }
.ob-try small { color: var(--muted); font-size: 13px; }
.ob-drop { border: 1.5px dashed var(--gold); border-radius: 10px; padding: 14px; text-align: center; color: var(--muted); font-size: 14px; }
.ob-drop.over { background: color-mix(in srgb, var(--gold) 12%, transparent); color: var(--ink); }
.ob .btn.wide { width: 100%; padding: 11px 18px; font-size: 15.5px; }
.ob-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.ob-mode { display: grid; justify-items: center; gap: 6px; padding: 12px 8px 12px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--sheet); color: var(--ink); cursor: pointer; text-align: center; font: inherit; transition: transform .2s, border-color .2s; }
.ob-mode:hover { transform: translateY(-2px); border-color: var(--gold); }
.ob-mode[aria-checked="true"] { border-color: var(--gold); box-shadow: 0 0 0 2px var(--gold); }
.ob-mode svg { width: 132px; height: 70px; }
.ob-mode b { font: 700 16px var(--display); color: var(--rubric); }
.ob-mode small { font-size: 12px; color: var(--muted); line-height: 1.55; }
`;
const MARK = '<svg viewBox="0 0 40 72" aria-hidden="true"><path d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z" fill="currentColor"/><g class="lgd"><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07z"/><path d="M12 14.14l7.07 7.07L12 28.28l-7.07-7.07z"/><path d="M12 28.28l7.07 7.07L12 42.42l-7.07-7.07z"/><path d="M12 42.42l7.07 7.07L12 56.56l-7.07-7.07z"/><path d="M12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></g></svg>';

/** رفٌّ مصغّر لكل ترتيب: كعوب على لوح، والمجموعات بينها قائم خشبي وفوق كل منها بطاقة نحاسية */
function shelfArt(kind) {
  const C = ['#6A1F2B', '#22385E', '#1D5A3F', '#7A5A1E', '#4A2C1A', '#5A1824', '#2E4A6B', '#8A3A24', '#355E3B', '#6B4A2A', '#22385E', '#6A1F2B'];
  const H = [40, 44, 38, 46, 42, 40, 45, 37, 43, 41, 44, 39];
  const spines = (from, to, x0, w = 8) => {
    let o = '';
    let x = x0;
    for (let i = from; i < to; i++) {
      o += `<rect x="${x}" y="${58 - H[i]}" width="${w}" height="${H[i]}" rx="1" fill="${C[i]}"/><rect x="${x + 1.5}" y="${58 - H[i] + 8}" width="${w - 3}" height="2" fill="#E3C77E" opacity=".8"/>`;
      x += w + 2;
    }
    return o;
  };
  const card = (cx) => `<rect x="${cx - 13}" y="6" width="26" height="9" rx="1.5" fill="#B08A3E"/><rect x="${cx - 11}" y="7.5" width="22" height="6" fill="#F4E7C4"/><rect x="${cx - 7}" y="9.8" width="14" height="1.4" fill="#8A6A2A"/>`;
  const frame = '<rect x="1" y="1" width="130" height="68" rx="4" fill="#3B2617"/><rect x="5" y="4" width="122" height="54" fill="#5A3B24"/><rect x="1" y="58" width="130" height="7" fill="#7A5232"/>';
  if (kind === 'none') return `<svg viewBox="0 0 132 70" aria-hidden="true">${frame}${spines(0, 12, 8)}</svg>`;
  const post = '<rect x="63.5" y="4" width="5" height="54" fill="#7A5232"/>';
  if (kind === 'subject') return `<svg viewBox="0 0 132 70" aria-hidden="true">${frame}<rect x="68" y="4" width="59" height="54" fill="#664530"/>${post}${spines(0, 4, 74)}${spines(4, 9, 8)}<g transform="translate(0,12)">${card(97)}${card(34)}</g></svg>`;
  return `<svg viewBox="0 0 132 70" aria-hidden="true">${frame}<rect x="68" y="4" width="59" height="54" fill="#664530"/>${post}${spines(2, 6, 74)}<g transform="translate(0,12)">${card(97)}</g><rect x="14" y="22" width="40" height="30" rx="4" fill="none" stroke="#E3C77E" stroke-width="1.4" stroke-dasharray="3 3" opacity=".8"/><path d="M34 31v12M28 37h12" stroke="#E3C77E" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

/** يعرض «أول لقاء» إن لم يُعرض من قبل ← وعدٌ يتمّ حين يُغلق: { tryBook } */
export async function onboard(shell, { force = false } = {}) {
  if (!desk) return null;
  const info = await desk.info().catch(() => null);
  if (!info || (info.prefs && info.prefs.onboarded && !force)) return null;
  let outDir = info.outDir;
  let theme = 'annabi';
  try {
    const l = await (await fetch('/api/admin/look', { cache: 'no-store' })).json();
    theme = l.theme || theme;
  } catch {}
  let followSystem = true;
  try {
    followSystem = localStorage.getItem(NIGHT) === null;
  } catch {}

  const st = document.createElement('style');
  st.textContent = CSS + CSS2;
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.className = 'ob';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'أهلاً بك في ورّاق');
  document.body.appendChild(ov);

  let step = 0;
  return new Promise((resolve) => {
    const OPEN = '<svg viewBox="0 0 40 72" aria-hidden="true"><path class="alif" d="M27.4 5.4 36 0v52.5c0 7.6-2 13.6-5.4 19-1.6-5.8-3.2-11.6-3.2-19z" fill="currentColor"/><g class="lgd"><path d="M12 0l7.07 7.07L12 14.14 4.93 7.07z"/><path d="M12 14.14l7.07 7.07L12 28.28l-7.07-7.07z"/><path d="M12 28.28l7.07 7.07L12 42.42l-7.07-7.07z"/><path d="M12 42.42l7.07 7.07L12 56.56l-7.07-7.07z"/><path d="M12 56.56l7.07 7.07L12 70.7l-7.07-7.07z"/></g></svg>';
    let night = (() => {
      try {
        return localStorage.getItem(NIGHT) === '1';
      } catch {
        return false;
      }
    })();
    let accepted = false;
    let shelfMode = (info.prefs && info.prefs.shelfMode) || 'none';
    const MODES = [
      ['none', 'بلا تقسيم', 'الكتب متجاورة على الرفوف كما أخرجتها'],
      ['subject', 'بموضوع الكتاب', 'العقيدة، والتفسير، والحديث… من فهرس «تراث» تلقائياً'],
      ['custom', 'مجموعاتي', 'تسمّي مجموعاتك وتضع فيها ما تشاء من الكتب'],
    ];
    const steps = [
      () => `<div class="ob-open">${OPEN}</div><div class="ob-name"><span class="wq-word" role="img" aria-label="ورّاق"></span></div><p class="ob-tag">إحياء التراث بإخراجٍ يليق به</p>`,
      () => `<h2>اختر مظهرك</h2>
        <div class="ob-looks three" role="radiogroup" aria-label="المظهر">
          <button type="button" class="ob-look" role="radio" data-theme="annabi" aria-checked="${!night && theme === 'annabi'}"><i style="background:linear-gradient(90deg,#FBF8F1 55%,#6B1D2F 55% 82%,#C5A059 82%)"></i>العنّابي والذهب</button>
          <button type="button" class="ob-look" role="radio" data-theme="midad" aria-checked="${!night && theme === 'midad'}"><i style="background:linear-gradient(90deg,#F3EBDD 55%,#4A2C1A 55% 82%,#9A3324 82%)"></i>المِداد والحُمرة</button>
          <button type="button" class="ob-look" role="radio" data-night aria-checked="${night}"><i class="dark"></i>السِّراج</button>
        </div>
        <label class="ob-chk"><input type="checkbox" id="obNight" ${followSystem ? 'checked' : ''}><span>اتبع الوضع الليلي في ويندوز</span></label>
        <p class="muted">تغيّره متى شئت من «الإعدادات»، والسِّراج من زرّه في الشريط الجانبي.</p>`,
      () => `<h2>كيف تُرتَّب خزانتك؟</h2>
        <div class="ob-modes" role="radiogroup" aria-label="ترتيب الخزانة">
          ${MODES.map(([id, name, hint]) => `<button type="button" class="ob-mode" role="radio" data-mode="${id}" aria-checked="${shelfMode === id}">${shelfArt(id)}<b>${name}</b><small>${hint}</small></button>`).join('')}
        </div>
        <p class="muted">لكل خزانة أربعة رفوف، وتصنع ما شئت من الخزائن بأسمائها. وتغيّر الترتيب متى شئت من أعلى الرفوف.</p>`,
      () => `<h2>أين تُحفظ كتبك؟</h2>
        <div class="ob-path"><code id="obDir">${esc(outDir)}</code><button type="button" class="btn" id="obChange">تغيير…</button></div>
        <label class="ob-chk"><input type="checkbox" checked disabled><span>خط «أضواء السلف» مثبَّت مع البرنامج، فيفتح Word كتبك بخطها</span></label>
        <p class="ob-note"><b>ورّاق</b> مبذولٌ لكل أحد بلا حقوق محفوظة. ولا يحلّ استعماله فيما حرّم الله، ولا في نسخ إخراج دار نشرٍ أو غلافها نسخاً مطابقاً بغير إذنها.</p>
        <label class="ob-chk"><input type="checkbox" id="obAccept" ${accepted ? 'checked' : ''}><span>قرأتُ التنبيه وقبلته</span></label>`,
      () => `<h2>جرّب الآن</h2>
        <div class="ob-try"><b>الأربعون النووية</b><small>من مكتبة «تراث» · يحتاج اتصالاً بالإنترنت</small></div>
        <button type="button" class="btn pri wide" data-act="try">أخرِجها بأسلوب «ورّاق»</button>
        <div class="ob-drop" id="obDrop">أو اسحب كتاب «وَرَق» أو ملف Word أو PDF من جهازك إلى هنا</div>`,
    ];
    function paint() {
      const last = step === steps.length - 1;
      const next = step === 0 ? 'ابدأ' : 'التالي';
      ov.innerHTML = `<div class="ob-card s${step}">
        <div class="ob-steps" aria-hidden="true">${steps.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        ${steps[step]()}
        <div class="ob-acts">
          ${step ? '<button type="button" class="tl" data-act="back">السابق</button>' : '<span></span>'}
          <span class="end">${last ? '<button type="button" class="btn" data-act="done">إلى الخزانة</button>' : `<button type="button" class="btn pri" data-act="next" ${step === 3 && !accepted ? 'disabled' : ''}>${next}</button>`}</span>
        </div></div>`;
      const first = ov.querySelector('.ob-look[aria-checked="true"], .ob-mode[aria-checked="true"], #obAccept, .btn.pri');
      if (first) first.focus();
      const drop = ov.querySelector('#obDrop');
      if (drop) {
        drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('over')));
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', async (e) => {
          e.preventDefault();
          const paths = [...e.dataTransfer.files].map((f) => desk.pathOf(f)).filter((p) => /\.(docx|pdf|waraq|warraq)$/i.test(p));
          if (!paths.length) return;
          await finish('');
          const wq = paths.find((p) => /\.(waraq|warraq)$/i.test(p));
          shell.openOnBench && shell.openOnBench(wq ? { path: wq, paths: [wq] } : { paths });
        });
      }
    }
    async function finish(tryBook) {
      await desk.setPrefs({ onboarded: true, acceptedNotice: new Date().toISOString(), shelfMode }).catch(() => {});
      if (shell.libraryChanged) shell.libraryChanged();
      ov.remove();
      st.remove();
      resolve({ tryBook });
    }
    const setNight = (on) => {
      night = on;
      try {
        localStorage.setItem(NIGHT, on ? '1' : '0');
      } catch {}
      document.documentElement.classList.toggle('night', on);
      for (const f of document.querySelectorAll('iframe')) {
        try {
          f.contentDocument.documentElement.classList.toggle('night', on);
        } catch {}
      }
      const cb = ov.querySelector('#obNight');
      if (cb) cb.checked = false;
    };
    ov.addEventListener('click', async (e) => {
      const md = e.target.closest('.ob-mode');
      if (md) {
        shelfMode = md.dataset.mode;
        for (const b of ov.querySelectorAll('.ob-mode')) b.setAttribute('aria-checked', String(b === md));
        return;
      }
      const look = e.target.closest('.ob-look');
      if (look) {
        for (const b of ov.querySelectorAll('.ob-look')) b.setAttribute('aria-checked', String(b === look));
        if (look.hasAttribute('data-night')) return setNight(true);
        if (night || !ov.querySelector('#obNight').checked) setNight(false);
        theme = look.dataset.theme;
        // يُطبَّق في الحال: البرنامج كله بمظهره
        await fetch('/api/admin/look', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-warraq': '1' }, body: JSON.stringify({ theme }) }).catch(() => {});
        shell.refreshLook && shell.refreshLook();
        return;
      }
      const b = e.target.closest('[data-act], #obChange');
      if (!b) return;
      if (b.id === 'obChange') {
        const d = await desk.chooseOutDir().catch(() => null);
        if (d) {
          outDir = d;
          ov.querySelector('#obDir').textContent = d;
        }
        return;
      }
      const act = b.dataset.act;
      if (act === 'next') step++;
      else if (act === 'back') step--;
      if (act === 'next' || act === 'back') return paint();
      if (act === 'done' || act === 'try') return finish(act === 'try' ? 'الأربعون النووية' : '');
    });
    ov.addEventListener('change', (e) => {
      if (e.target.id === 'obNight') {
        try {
          if (e.target.checked) {
            localStorage.removeItem(NIGHT);
            night = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.classList.toggle('night', night);
          } else localStorage.setItem(NIGHT, document.documentElement.classList.contains('night') ? '1' : '0');
        } catch {}
      }
      if (e.target.id === 'obAccept') {
        accepted = e.target.checked;
        const n = ov.querySelector('[data-act="next"]');
        if (n) n.disabled = !accepted;
      }
    });
    paint();
  });
}
