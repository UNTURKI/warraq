// «الطِّراز»: المودات — إضافتها (ملف ‎.wqmod‎ أو سحبه)، وإشعالها وإطفاؤها، وإعداداتها، وترتيبها، وأخطاؤها،
// وصنعها («قيد الصنع» يتبع ملفاته)، وتصديرها، والوضع الآمن. والعمل كله في العملية الرئيسية (electron/mods.cjs) عبر desk.mods.
const desk = window.warraqDesktop || (window.top !== window && window.top.warraqDesktop) || null;
const M = desk && desk.mods;
const $ = (s, r = document) => r.querySelector(s);
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clean = (e) => String((e && e.message) || e || '').replace(/^Error invoking remote method '[^']+':\s*(\w*Error:\s*)?/, '');
const kb = (n) => (n < 1024 * 1024 ? ar(Math.max(1, Math.round(n / 1024))) + ' ك.ب' : ar((n / 1048576).toFixed(1)).replace('.', '٫') + ' م.ب');
const PART_ORDER = ['shell', 'khizana', 'bench', 'muharrir', 'rahl', 'styles', 'covers', 'settings', 'other'];

let data = { safe: false, mods: [], gallery: [], parts: {} };
const open = new Set(); // بطاقاتٌ إعداداتها مفتوحة
const timers = new Map();

/* ---------------------------------------------------------------- رسالة */
let toastT = 0;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'tz-toast ' + kind;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 3600);
}
async function run(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return r;
  } catch (e) {
    toast(clean(e), 'err');
    return undefined;
  }
}

/* ---------------------------------------------------------------- نقشٌ لكل مود (من معرّفه) حين لا صورة له */
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
function band(id) {
  const h = hash(id);
  const hue = h % 360;
  const c1 = `hsl(${hue} 52% 34%)`;
  const c2 = `hsl(${(hue + 40) % 360} 62% 62%)`;
  const c3 = `hsl(${(hue + 200) % 360} 30% 90%)`;
  const k = 8 + (h >> 9) % 5;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${k * 4}' height='44'><rect width='100%' height='100%' fill='${c1}'/><path d='M0 22 L${k} 14 L${k * 2} 22 L${k * 3} 14 L${k * 4} 22' stroke='${c2}' stroke-width='2.2' fill='none'/><path d='M0 26 L${k} 34 L${k * 2} 26 L${k * 3} 34 L${k * 4} 26' stroke='${c3}' stroke-width='1.4' fill='none' opacity='.75'/><path d='M${k * 2} 3 l3 3 -3 3 -3 -3z M${k * 2} 35 l3 3 -3 3 -3 -3z' fill='${c2}'/><path d='M0 9.5 H${k * 4} M0 34.5 H${k * 4}' stroke='${c3}' stroke-width='.8' stroke-dasharray='2 3' opacity='.6'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/* ---------------------------------------------------------------- القائمة */
async function load() {
  if (!M) {
    $('#list').innerHTML = `<div class="tz-empty"><b>المودات في البرنامج وحده</b><span>في برنامج ورّاق على الحاسوب تُضاف المودات وتُطفأ من هنا.</span></div>`;
    for (const b of document.querySelectorAll('.tz-tools button, #safeSw')) b.disabled = true;
    return;
  }
  try {
    data = await M.list();
  } catch (e) {
    return toast(clean(e), 'err');
  }
  render();
}
function render() {
  // الوضع الآمن
  const on = !data.safe;
  $('#safeSw').setAttribute('aria-checked', String(on));
  $('#master').classList.toggle('off', !on);
  $('#masterT').textContent = on ? 'المودات تعمل' : 'المودات موقوفة (الوضع الآمن)';
  const ban = $('#banner');
  const why = { crash: 'توقّفت واجهة البرنامج والمودات تعمل، فأُوقفت كلها احتياطاً.', hang: 'لم تستجب واجهة البرنامج فأُوقفت المودات كلها.', key: 'أوقفتَها من القائمة أو بالاختصار.', start: 'بدأ البرنامج في الوضع الآمن.' }[data.safeReason];
  if (data.safe && why) {
    ban.hidden = false;
    ban.className = 'tz-banner warn';
    ban.innerHTML = `<span>${esc(why)} شغّلها، ثم أطفئ ما تشكّ فيه (وأخطاء كل مود تحت اسمه).</span><button type="button" class="btn sm pri" data-a="unsafe">شغّل المودات</button>`;
  } else if (data.needsReload) {
    ban.hidden = false;
    ban.className = 'tz-banner';
    ban.innerHTML = `<span>بعض ما أطفأتَه يزول أثره تماماً بعد إعادة تحميل الواجهة.</span><button type="button" class="btn sm" data-a="reloadUi">أعد تحميل الواجهة</button>`;
  } else ban.hidden = true;

  const list = $('#list');
  $('#orderHint').hidden = data.mods.length < 2;
  if (!data.mods.length) {
    list.innerHTML = `<div class="tz-empty">
      <div class="tz-empty-band" aria-hidden="true"></div>
      <b>لا مودات بعد</b>
      <span>المود ملفٌّ ‎.wqmod‎ يصنعه أي أحد: يغيّر ألوان البرنامج، أو يجعل السِّراج ناراً تتّقد بصوتها، أو يجعل الأبواب غرفاً في دارٍ تمشي فيها.
      أضف ملفاً أو اسحبه إلى هنا (أو افتحه من المستكشف)، أو اصنع مودك بيدك أو «بالذكاء الاصطناعي».</span>
    </div>`;
  } else list.innerHTML = data.mods.map(card).join('');
  // المعرض
  $('#galSec').hidden = !data.gallery.length;
  $('#gallery').innerHTML = data.gallery
    .map(
      (g) => `<div class="tz-gi" style="--band:${esc(band(g.id))}"><i class="tz-gb" aria-hidden="true"></i><div><b>${esc(g.name)}</b><small>${esc(g.description)}</small></div><button type="button" class="btn sm" data-a="gallery" data-id="${esc(g.id)}">أضفه</button></div>`,
    )
    .join('');
}
function card(m, i) {
  if (m.broken)
    return `<article class="tz-card broken" data-id="${esc(m.id)}">
      <div class="tz-band" style="--band:${esc(band(m.id))}"></div>
      <div class="tz-cb"><div class="tz-ch"><div><b>${esc(m.id)}</b><small>${m.dev ? 'قيد الصنع · ' : ''}لا يعمل</small></div></div>
      <p class="tz-err1">${esc(m.broken)}</p><p class="tz-path" dir="ltr">${esc(m.path)}</p>
      <div class="tz-cf"><span></span><span class="tz-acts">${m.dev ? `<button type="button" class="btn sm" data-a="reload">أعد قراءته</button>` : ''}<button type="button" class="btn sm" data-a="reveal">افتح مجلده</button><button type="button" class="btn sm danger" data-a="remove">${m.dev ? 'افصله' : 'احذفه'}</button></span></div></div>
    </article>`;
  const pv = m.preview ? `<div class="tz-band img" style="background-image:url('${esc(m.preview)}')"></div>` : `<div class="tz-band" style="--band:${esc(band(m.id))}">${m.icon ? `<img src="${esc(m.icon)}" alt="">` : ''}</div>`;
  const errs = m.errors || [];
  const isOpen = open.has(m.id);
  return `<article class="tz-card${m.enabled ? ' on' : ''}${data.safe ? ' safe' : ''}" data-id="${esc(m.id)}">
    ${pv}
    <div class="tz-cb">
      <div class="tz-ch">
        <div class="tz-cn"><b>${esc(m.name)}</b><small>${m.author ? esc(m.author) + ' · ' : ''}${esc(ar(m.version))}${m.dev ? ' · <em class="tz-dev">قيد الصنع</em>' : ''}${m.builtin && !m.dev ? ' · <em class="tz-bi">من المعرض</em>' : ''}</small></div>
        <button type="button" class="tz-switch" role="switch" aria-checked="${m.enabled}" data-a="toggle" title="${m.enabled ? 'أطفئه' : 'شغّله'}" aria-label="${esc(m.name)}"><i></i></button>
      </div>
      ${m.description ? `<p class="tz-desc">${esc(m.description)}</p>` : ''}
      <div class="tz-chips">${m.partNames.map((p) => `<span>${esc(p)}</span>`).join('')}${m.reload ? '<span class="r" title="يُعاد تحميل الصفحة حين يُطفأ">يُعاد التحميل</span>' : ''}</div>
      ${m.dev ? `<p class="tz-path" dir="ltr" title="يتبع هذا المجلد: كل ما يُحفظ فيه يظهر في الحال">${esc(m.path)}</p>` : ''}
      ${errs.length ? `<details class="tz-errs"><summary>${errs.length === 1 ? 'خطأٌ واحد' : ar(errs.length) + ' أخطاء'} <small>آخرها ${esc(ar(new Date(errs[errs.length - 1].at).toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })))}</small></summary><ol>${errs
        .slice()
        .reverse()
        .map((e) => `<li><em>${esc(e.partName || e.part)}</em>${e.n > 1 ? ` <small>×${ar(e.n)}</small>` : ''} ${esc(e.message)}</li>`)
        .join('')}</ol><button type="button" class="btn sm" data-a="clearErrors">امسحها</button></details>` : ''}
      <div class="tz-cf">
        <span class="tz-ord">
          <button type="button" class="btn ib sm" data-a="up" title="قدّمه (يعلوه ما بعده)" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg></button>
          <button type="button" class="btn ib sm" data-a="down" title="أخّره (يعلو ما قبله)" ${i === data.mods.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg></button>
        </span>
        <span class="tz-acts">
          ${m.schema.length ? `<button type="button" class="btn sm${isOpen ? ' on' : ''}" data-a="settings" aria-expanded="${isOpen}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>إعداداته</button>` : ''}
          <span class="tz-mw"><button type="button" class="btn ib sm" data-a="menu" title="المزيد" aria-haspopup="menu"><svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/></svg></button>
            <span class="tz-menu" role="menu" hidden>
              <button type="button" role="menuitem" data-a="reload">أعد تحميله</button>
              <button type="button" role="menuitem" data-a="reveal">افتح مجلده</button>
              <button type="button" role="menuitem" data-a="export">صدّره للمشاركة (‎.wqmod‎)</button>
              ${m.homepage ? `<button type="button" role="menuitem" data-a="home">صفحته</button>` : ''}
              <button type="button" role="menuitem" data-a="remove" class="danger">${m.dev ? 'افصله (يبقى مجلده)' : 'احذفه'}</button>
            </span></span>
        </span>
      </div>
      ${isOpen ? settingsForm(m) : ''}
    </div>
  </article>`;
}

/* ---------------------------------------------------------------- الإعدادات: نموذجٌ من وصفها في mod.json */
function settingsForm(m) {
  const row = (s) => {
    const v = m.settings[s.key];
    const id = `s-${m.id}-${s.key}`;
    const hint = s.hint ? `<small>${esc(s.hint)}</small>` : '';
    if (s.type === 'toggle') return `<label class="tz-set tg" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><button type="button" class="tz-switch" role="switch" id="${esc(id)}" data-k="${esc(s.key)}" aria-checked="${!!v}"><i></i></button></label>`;
    if (s.type === 'range')
      return `<label class="tz-set" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><span class="tz-rg"><input type="range" id="${esc(id)}" data-k="${esc(s.key)}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"><output>${esc(fmt(v, s))}</output></span></label>`;
    if (s.type === 'number') return `<label class="tz-set" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><input type="number" id="${esc(id)}" data-k="${esc(s.key)}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"></label>`;
    if (s.type === 'color') return `<label class="tz-set" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><input type="color" id="${esc(id)}" data-k="${esc(s.key)}" value="${esc(v)}"></label>`;
    if (s.type === 'select') {
      if (s.options.length <= 4)
        return `<div class="tz-set"><span>${esc(s.label)}${hint}</span><span class="seg" role="radiogroup" data-k="${esc(s.key)}">${s.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === v}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</span></div>`;
      return `<label class="tz-set" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><select id="${esc(id)}" data-k="${esc(s.key)}">${s.options.map((o) => `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    }
    return `<label class="tz-set" for="${esc(id)}"><span>${esc(s.label)}${hint}</span><input type="text" id="${esc(id)}" data-k="${esc(s.key)}" value="${esc(v)}" maxlength="500"></label>`;
  };
  return `<div class="tz-sets">${m.schema.map(row).join('')}<div class="tz-sf"><small>تسري في الحال.</small><button type="button" class="tl" data-a="resetSettings">استعد الأصل</button></div></div>`;
}
function fmt(v, s) {
  const n = +v;
  const p = s.step < 1 ? Math.min(2, String(s.step).split('.')[1]?.length || 1) : 0;
  if (s.max === 1 && s.min === 0 && !s.unit) return ar(Math.round(n * 100)) + '٪';
  return ar(n.toFixed(p)).replace('.', '٫') + (s.unit ? ' ' + s.unit : '');
}
function setValue(id, key, value) {
  const m = data.mods.find((x) => x.id === id);
  if (!m) return;
  m.settings[key] = value;
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => run(() => M.settings(id, { ...m.settings })), 160),
  );
}

/* ---------------------------------------------------------------- الأزرار */
document.addEventListener('click', async (e) => {
  if (!e.target.closest('.tz-mw')) for (const mm of document.querySelectorAll('.tz-menu')) mm.hidden = true;
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const a = b.dataset.a;
  const cardEl = b.closest('.tz-card');
  const id = b.dataset.id || (cardEl && cardEl.dataset.id);
  const m = data.mods.find((x) => x.id === id);
  if (a === 'menu') {
    const menu = b.parentElement.querySelector('.tz-menu');
    for (const mm of document.querySelectorAll('.tz-menu')) if (mm !== menu) mm.hidden = true;
    menu.hidden = !menu.hidden;
    if (!menu.hidden) {
      menu.classList.remove('up');
      const r = menu.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8 && b.getBoundingClientRect().top > r.height + 12) menu.classList.add('up');
    }
    return;
  }
  if (b.closest('.tz-menu')) b.closest('.tz-menu').hidden = true;
  if (a === 'toggle') {
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on));
    cardEl.classList.toggle('on', on);
    return run(() => M.enable(id, on), on ? `«${m.name}» يعمل` : `أُطفئ «${m.name}»`);
  }
  if (a === 'settings') {
    open.has(id) ? open.delete(id) : open.add(id);
    return render();
  }
  if (a === 'resetSettings') return run(() => M.resetSettings(id), 'عادت إعداداته الأصلية').then(load);
  if (a === 'up' || a === 'down') {
    const ids = data.mods.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = a === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return run(() => M.order(ids));
  }
  if (a === 'reload') return run(() => M.reload(id), 'أُعيد تحميله');
  if (a === 'reveal') return run(() => M.reveal(id));
  if (a === 'home' && m && m.homepage) return void window.open(m.homepage, '_blank', 'noopener');
  if (a === 'export') {
    const r = await run(() => M.exportMod(id));
    if (r && r.path) toast(`حُفظ «${r.path.split(/[\\/]/).pop()}» (${kb(r.size)}) — أرسله لمن شئت`);
    return;
  }
  if (a === 'remove') {
    if (!m && !cardEl) return;
    const name = m ? m.name : id;
    const dev = m ? m.dev : cardEl.querySelector('.tz-path');
    if (!confirm(dev ? `تفصل «${name}»؟ يبقى مجلده كما هو.` : `تحذف «${name}»؟`)) return;
    open.delete(id);
    return run(() => M.remove(id), dev ? 'فُصل' : 'حُذف');
  }
  if (a === 'clearErrors') return run(() => M.clearErrors(id));
  if (a === 'gallery') return run(() => M.gallery(id), 'أُضيف وهو يعمل');
  if (a === 'unsafe') return run(() => M.safe(false), 'المودات تعمل');
  if (a === 'reloadUi') return run(() => M.reloadUi());
  if (a === 'link') return run(() => M.link(), (r) => (r ? `رُبط «${r.id}»: يتبع ملفاته` : '')).then(load);
  if (a === 'guide') return openGuide();
});
$('#moreBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const mm = $('#moreMenu');
  mm.hidden = !mm.hidden;
  $('#moreBtn').setAttribute('aria-expanded', String(!mm.hidden));
});
$('#safeSw').addEventListener('click', () => {
  const on = $('#safeSw').getAttribute('aria-checked') !== 'true';
  run(() => M.safe(!on), on ? 'المودات تعمل' : 'أُوقفت المودات كلها');
});
// الإعدادات: تسري وهي تتغيّر
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-k]');
  const c = el && el.closest('.tz-card');
  if (!c) return;
  const m = data.mods.find((x) => x.id === c.dataset.id);
  const s = m && m.schema.find((x) => x.key === el.dataset.k);
  if (!s) return;
  let v = el.value;
  if (s.type === 'range' || s.type === 'number') {
    v = +v;
    const o = el.parentElement.querySelector('output');
    if (o) o.textContent = fmt(v, s);
  }
  setValue(m.id, s.key, v);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('select[data-k]');
  if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
});
document.addEventListener('click', (e) => {
  const sw = e.target.closest('.tz-sets .tz-switch[data-k]');
  const seg = e.target.closest('.tz-sets .seg[data-k] [data-v]');
  const c = (sw || seg) && (sw || seg).closest('.tz-card');
  if (!c) return;
  e.preventDefault();
  if (sw) {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(on));
    return setValue(c.dataset.id, sw.dataset.k, on);
  }
  const g = seg.parentElement;
  for (const x of g.children) x.setAttribute('aria-checked', String(x === seg));
  setValue(c.dataset.id, g.dataset.k, seg.dataset.v);
});

/* ---------------------------------------------------------------- الإضافة: ملف، أو سحب، أو من المستكشف */
async function showInstall(info) {
  if (!info) return;
  const d = $('#instDlg');
  $('#instKind').textContent = info.update ? `تحديث: من ${ar(info.update.from)} إلى ${ar(info.version)}` : 'مودٌ جديد';
  $('#instT').textContent = info.name;
  $('#instBy').textContent = [info.author, ar(info.version)].filter(Boolean).join(' · ');
  $('#instDesc').textContent = info.description || '';
  $('#instPv').style.cssText = info.preview ? `background-image:url('${info.preview}')` : `--band:${band(info.id)}`;
  $('#instPv').innerHTML = !info.preview && info.icon ? `<img src="${info.icon}" alt="">` : '';
  $('#instPv').classList.toggle('img', !!info.preview);
  const fromAi = info.fromText ? `<dt>من الردّ</dt><dd dir="ltr" class="tz-files">${esc([...info.found, ...(info.added || [])].join('  ·  '))}</dd>` : '';
  const miss = info.missing && info.missing.length ? `<dt class="warn">لم يُرفق</dt><dd class="warn" dir="ltr">${esc(info.missing.join('  ·  '))}</dd>` : '';
  $('#instFacts').innerHTML = fromAi + miss + `<dt>يعمل في</dt><dd>${esc(info.partNames.join('، '))}</dd><dt>حجمه</dt><dd>${ar(info.files)} ${info.files === 1 ? 'ملف' : info.files <= 10 ? 'ملفات' : 'ملفاً'} · ${kb(info.size)}</dd>${info.settings ? `<dt>إعدادات</dt><dd>${ar(info.settings)}</dd>` : ''}<dt>معرّفه</dt><dd dir="ltr">${esc(info.id)}</dd>`;
  $('#instYes').textContent = info.update ? 'حدّثه' : 'ثبّته وشغّله';
  d.returnValue = '';
  d.showModal();
  const ans = await new Promise((r) => d.addEventListener('close', () => r(d.returnValue), { once: true }));
  if (ans !== 'yes') return void M.cancel(info.token).catch(() => {});
  const r = await run(() => M.install(info.token));
  if (r) toast(r.updated ? `حُدِّث «${info.name}»` : `«${info.name}» يعمل الآن`);
  return r;
}
$('#instNo').addEventListener('click', () => $('#instDlg').close('no'));
$('#addBtn').addEventListener('click', async () => showInstall(await run(() => M.pick())));
async function inspectPath(p) {
  if (!p) return;
  return showInstall(await run(() => M.inspect(p)));
}
// السحب
let dragN = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || !M) return;
  dragN++;
  $('#drop').hidden = false;
});
document.addEventListener('dragleave', () => {
  if (--dragN <= 0) (dragN = 0), ($('#drop').hidden = true);
});
document.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
document.addEventListener('drop', (e) => {
  dragN = 0;
  $('#drop').hidden = true;
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (!f || !M) return;
  e.preventDefault();
  const p = desk.pathOf ? desk.pathOf(f) : '';
  if (!p) return toast('لم يُعرف مكان الملف؛ استعمل «أضف مودًا»', 'err');
  inspectPath(p);
});

/* ---------------------------------------------------------------- اصنع مودًا */
$('#makeBtn').addEventListener('click', () => {
  const parts = data.parts || {};
  $('#makeParts').innerHTML = PART_ORDER.filter((p) => parts[p])
    .map((p) => `<label class="chk"><input type="checkbox" value="${p}"${p === 'shell' ? ' checked' : ''}> ${esc(parts[p])}</label>`)
    .join('');
  $('#makeName').value = '';
  $('#makeDlg').returnValue = '';
  $('#makeDlg').showModal();
  $('#makeName').focus();
});
$('#makeNo').addEventListener('click', () => $('#makeDlg').close('no'));
$('#makeDlg').addEventListener('close', async () => {
  if ($('#makeDlg').returnValue !== 'yes') return;
  const parts = [...document.querySelectorAll('#makeParts input:checked')].map((x) => x.value);
  const r = await run(() => M.create({ name: $('#makeName').value.trim(), parts }));
  if (r) toast(`صُنع «${$('#makeName').value.trim() || r.id}» وفُتح مجلده: عدّل ملفاته واحفظ، يظهر أثرها في الحال`);
});

/* ---------------------------------------------------------------- اصنعه بالذكاء الاصطناعي: التوجيه، ثم ردّه (نصاً) وما يُرفق معه */
let promptText = '';
let attached = [];
async function loadPrompt() {
  if (!promptText) promptText = await fetch('/api/mods/prompt', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  $('#aiPrompt').textContent = promptText;
  return promptText;
}
$('#aiBtn').addEventListener('click', async () => {
  await loadPrompt();
  $('#aiMsg').hidden = true;
  $('#aiDlg').showModal();
});
$('#aiX').addEventListener('click', () => $('#aiDlg').close());
$('#aiCopy').addEventListener('click', async () => {
  const t = await loadPrompt();
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    // (احتياط: نسخٌ من خانةٍ مخفية)
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  $('#aiCopy').classList.add('done');
  $('#aiCopy').lastChild.textContent = 'نُسخ ✓';
  setTimeout(() => ($('#aiCopy').classList.remove('done'), ($('#aiCopy').lastChild.textContent = 'انسخ التوجيه')), 2600);
  toast('نُسخ التوجيه: ألصقه في الذكاء الاصطناعي، واكتب تحته ما تريد');
});
const paintAtt = () => {
  $('#aiAtt').innerHTML = attached.map((f, i) => `<span>${esc(f.name)} <button type="button" data-att="${i}" title="أزله">×</button></span>`).join('');
};
$('#aiFiles').addEventListener('change', (e) => {
  attached.push(...[...e.target.files].slice(0, 200));
  e.target.value = '';
  paintAtt();
});
$('#aiAtt').addEventListener('click', (e) => {
  const b = e.target.closest('[data-att]');
  if (b) attached.splice(+b.dataset.att, 1), paintAtt();
});
function aiMsg(html, kind = 'err') {
  const m = $('#aiMsg');
  m.className = 'tz-ai-msg ' + kind;
  m.innerHTML = html;
  m.hidden = false;
}
$('#aiMake').addEventListener('click', async () => {
  const text = $('#aiText').value;
  if (!text.trim()) return aiMsg('ألصق ردّ الذكاء الاصطناعي أولاً.');
  const files = [];
  for (const f of attached) files.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
  let info;
  try {
    info = await M.fromText(text, files);
  } catch (e) {
    return aiMsg(esc(clean(e)) + '<br><small>إن كان الخطأ في mod.json أو في الكود فألصقه للذكاء الاصطناعي ليصلحه، ثم ألصق ردّه الجديد هنا.</small>');
  }
  $('#aiMsg').hidden = true;
  $('#aiDlg').close();
  const r = await showInstall(info);
  if (r) {
    $('#aiText').value = '';
    attached = [];
    paintAtt();
  } else $('#aiDlg').showModal();
});

/* ---------------------------------------------------------------- دليل الصانع (Markdown بسيط) */
function md(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let out = '';
  let i = 0;
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out += `<pre dir="ltr"><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) {
      const n = Math.min(4, h[1].length + 1);
      out += `<h${n}>${inline(h[2])}</h${n}>`;
      i++;
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out += `<table>${body.map((r, k) => `<tr>${cells(r).map((c) => (k ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`).join('')}</table>`;
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      out += '<ul>';
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) out += `<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`;
      out += '</ul>';
      continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out += `<blockquote>${inline(buf.join(' '))}</blockquote>`;
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#|```|\||\s*[-*]\s|>)/.test(lines[i])) buf.push(lines[i++]);
    out += `<p>${inline(buf.join(' '))}</p>`;
  }
  return out;
}
async function openGuide() {
  const d = $('#guideDlg');
  if (!$('#guide').innerHTML) {
    const t = await fetch('/api/mods/guide', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
    $('#guide').innerHTML = t ? md(t) : '<p>تعذّر فتح الدليل.</p>';
  }
  d.showModal();
}
$('#guideX').addEventListener('click', () => $('#guideDlg').close());

/* ---------------------------------------------------------------- التبليغ: ما تغيّر (من هنا، أو من غيره، أو خطأٌ من مود) */
let reT = 0;
const refresh = () => {
  clearTimeout(reT);
  reT = setTimeout(load, 60);
};
try {
  const bc = new BroadcastChannel('warraq-mods');
  bc.onmessage = refresh;
} catch {}
if (M && M.onChange && window.top === window) M.onChange(refresh);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const mm of document.querySelectorAll('.tz-menu')) mm.hidden = true;
});
window.WarraqTiraz = { inspect: inspectPath, refresh: load, get data() { return data; } };
if (!M) $('#aiBtn').disabled = true;
load();
