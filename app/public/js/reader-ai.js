// مساعد الرَّحل: لوحةٌ بجانب الكتاب في القارئ يُكتب فيها للذكاء الاصطناعي، بثلاث طرق:
//  · مرتبط بالصفحة: يصله نص الصفحة المفتوحة (أو الصفحتين) وما كتبه القارئ عليها، واسم الكتاب.
//  · مرتبط بالمقطع: يصله رابط الدرس الذي بجانب الكتاب (أو رابطٌ يلصقه القارئ) وعنوانه وموضع السماع، وتفريغه حين يُضاف.
//  · منفصل: سؤال القارئ وحده.
// والجواب يُنسخ، أو يصير ملاحظةً على الصفحة. (التوجيهات الجاهزة تُعدَّل من الإعدادات ← الذكاء الاصطناعي ← الرَّحل)

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
const clock = (t) => {
  t = Math.max(0, Math.floor(+t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return ar(h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`);
};
const LS = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};

const SEAL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="s-d" d="M24 2.5 45.5 24 24 45.5 2.5 24z"/><path class="s-i" d="M24 8.5 39.5 24 24 39.5 8.5 24z"/><path class="s-s" d="M24 13.2c1 5.6 4.2 8.8 9.8 9.8-5.6 1-8.8 4.2-9.8 9.8-1-5.6-4.2-8.8-9.8-9.8 5.6-1 8.8-4.2 9.8-9.8z"/></svg>';
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  page: I('<path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/>'),
  clip: I('<path d="M4 6.5h16v11H4z"/><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor"/>'),
  free: I('<path d="M5 5h14v10H9l-4 4z"/>'),
  send: I('<path d="M20 12H5m6-6-6 6 6 6"/>'),
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  fresh: I('<path d="M12 5v14M5 12h14"/>'),
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  note: I('<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>'),
};
export const AI_ICON = SEAL;

/**
 * @param {object} c
 * @param {HTMLElement} c.room
 * @param {string} c.title  @param {boolean} [c.notebook]
 * @param {() => number[]} c.pages      الصفحات الظاهرة
 * @param {() => number} c.N
 * @param {() => object} c.notes        دفتر القارئ (pageContext, addAiNote)
 * @param {() => object|null} [c.clip]  الدرس الذي بجانب الكتاب
 * @param {(msg:string)=>void} c.toast
 * @param {() => void} c.onLayout
 */
export function createReaderAI(c) {
  const { room } = c;
  const A = {
    open: false,
    mode: ['page', 'clip', 'free'].includes(LS('warraq.rahlai.mode')) ? LS('warraq.rahlai.mode') : 'page',
    cfg: null,
    cfgAt: 0,
    items: [],
    hist: { page: [], clip: [], free: [] },
    run: null,
    seq: 0,
    link: '',
  };
  const panel = document.createElement('aside');
  panel.className = 'nt-ui bk-ai';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'المساعد');
  panel.innerHTML = `
    <header class="ra-h">
      <span class="ra-seal">${SEAL}</span>
      <div class="ra-tt"><b>المساعد</b><small class="ra-who"></small></div>
      <button type="button" class="ra-ib" data-a="new" title="محادثة جديدة">${IC.fresh}</button>
      <button type="button" class="ra-ib" data-a="close" title="أغلق">${IC.x}</button>
    </header>
    <div class="ra-modes" role="group" aria-label="طريقة الإرسال">
      <button type="button" data-mode="page">${IC.page}<span>بالصفحة</span></button>
      <button type="button" data-mode="clip">${IC.clip}<span>بالمقطع</span></button>
      <button type="button" data-mode="free">${IC.free}<span>منفصل</span></button>
    </div>
    <div class="ra-ctx"></div>
    <div class="ra-body"><div class="ra-msgs" aria-live="polite"></div></div>
    <div class="ra-pre"></div>
    <form class="ra-in" autocomplete="off">
      <textarea rows="1" dir="auto" placeholder="اكتب ما تريد…" aria-label="اكتب للمساعد"></textarea>
      <button type="submit" class="ra-send" aria-label="أرسل">${IC.send}</button>
    </form>`;
  room.querySelector('.bk-mid').appendChild(panel);
  const $ = (s) => panel.querySelector(s);
  const msgs = $('.ra-msgs');
  const body = $('.ra-body');
  const ta = $('textarea');

  /* ------------------------------------------------------------ الاتصال */
  async function api(path, { method = 'GET', data, signal } = {}) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-warraq': '1' }, body: data === undefined ? undefined : JSON.stringify(data), signal, credentials: 'same-origin' });
    let d = {};
    try {
      d = await r.json();
    } catch {}
    if (!r.ok) throw Object.assign(new Error(r.status === 404 && !d.reason ? 'المساعد في برنامج ورّاق لصاحبه' : d.error || 'HTTP ' + r.status), { reason: d.reason || (r.status === 404 ? 'owner' : ''), trail: d.trail || [] });
    return d;
  }
  async function loadCfg(force) {
    if (!force && A.cfg && Date.now() - A.cfgAt < 15000) return;
    try {
      A.cfg = await api('/api/admin/ai/prompts?scope=rahl');
    } catch (e) {
      A.cfg = { error: e.message, reason: e.reason, presets: [] };
    }
    A.cfgAt = Date.now();
  }

  /* ------------------------------------------------------------ ما يُرسل */
  const clipNow = () => {
    let k = null;
    try {
      k = c.clip ? c.clip() : null;
    } catch {}
    const link = A.link.trim();
    if (link) return { kind: 'web', url: link, title: k && k.url === link ? k.title : '', t: k && k.url === link ? k.t : 0, d: k && k.url === link ? k.d : 0, transcript: k && k.url === link ? k.transcript : '' , pasted: !(k && k.url === link) };
    return k && (k.url || k.name) ? k : null;
  };
  const pagesNow = () => (c.pages() || []).filter((i) => i >= 1);
  async function pageBlock() {
    const notes = c.notes();
    const ps = pagesNow();
    const out = [`[${c.notebook ? 'الدفتر' : 'الكتاب'}] «${c.title || ''}»`];
    if (!ps.length) return [...out, '[الصفحة] الكتاب مغلق: لا صفحة مفتوحة'].join('\n');
    out.push(`[${ps.length > 1 ? 'الصفحتان' : 'الصفحة'}] ${ps.map(ar).join(' و')} من ${ar(c.N())}`);
    for (const i of ps) {
      const ctx = notes && notes.pageContext ? await notes.pageContext(i) : { text: '', mine: [], inked: 0 };
      const text = (ctx.text || '').trim();
      const hs = c.heads ? c.heads(i) : [];
      if (hs.length) out.push('', `[عناوين الصفحة ${ar(i)}]`, ...hs.map((h) => `- ${h.lvl === 2 ? 'فصل' : 'باب'}: ${h.t}`));
      out.push('', `[نص الصفحة ${ar(i)}]`, text ? '<<<\n' + text.slice(0, 14000) + '\n>>>' : c.notebook ? '(صفحة من دفتري: لا نص مطبوع فيها، وما كتبتُه مذكورٌ بعدُ)' : '(لا نص مقروء في هذه الصفحة: لعلها صورة)');
      if (ctx.mine.length) out.push(`[ما كتبتُه على الصفحة ${ar(i)}]`, ...ctx.mine.map((m) => '- ' + m));
      if (ctx.inked) out.push(`(وعليها ${ar(ctx.inked)} من خطوط القلم بخط اليد لا تُقرأ)`);
    }
    return out.join('\n');
  }
  function clipBlock() {
    const k = clipNow();
    if (!k) return null;
    const out = [];
    out.push(`[الدرس] «${k.title || k.name || 'بلا عنوان'}»`);
    if (k.url) out.push(`[الرابط] ${k.url}`);
    else out.push('[المصدر] ملفٌّ في جهاز القارئ');
    if (k.d) out.push(`[موضع السماع] ${clock(k.t)} من ${clock(k.d)}`);
    out.push(k.transcript ? `[تفريغ الدرس]\n<<<\n${String(k.transcript).slice(0, 60000)}\n>>>` : '[تفريغ الدرس] لا تفريغ له بعد: لا تزعم أنك سمعته، واعتمد عنوانه ورابطه وما يُعرف عنهما');
    const ps = pagesNow();
    if (ps.length) out.push(`[وبين يديّ] ${c.notebook ? 'دفتر' : 'كتاب'} «${c.title || ''}» مفتوحٌ على ص ${ps.map(ar).join(' و')}`);
    return out.join('\n');
  }

  /* ------------------------------------------------------------ الواجهة */
  function paintHead() {
    const k = A.cfg || {};
    $('.ra-who').textContent = k.first ? `${k.first.label} · ${k.first.model}` : k.ready === false && !k.error ? 'لا مفتاح بعد' : '';
    for (const b of panel.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === A.mode));
    ta.placeholder = { page: 'اسأل عن هذه الصفحة…', clip: 'اسأل عن الدرس…', free: 'اسأل ما شئت…' }[A.mode];
  }
  function paintCtx() {
    const box = $('.ra-ctx');
    if (A.mode === 'free') {
      box.innerHTML = `<p class="ra-quiet">يُرسل سؤالك وحده، بلا شيءٍ من الكتاب ولا الدرس.</p>`;
      return;
    }
    if (A.mode === 'page') {
      const ps = pagesNow();
      box.innerHTML = ps.length
        ? `<div class="ra-what">${IC.page}<b>${ps.length > 1 ? 'الصفحتان' : 'الصفحة'} ${ps.map(ar).join(' و')}</b><small>من ${ar(c.N())}</small></div><p class="ra-quiet">يصله نصها، وما كتبتَه عليها من نصوص وملاحظات وتظليل، واسم ${c.notebook ? 'الدفتر' : 'الكتاب'}.</p>`
        : `<p class="ra-quiet">افتح ${c.notebook ? 'الدفتر' : 'الكتاب'} على صفحة ليصله ما فيها.</p>`;
      return;
    }
    const k = (() => {
      try {
        return c.clip ? c.clip() : null;
      } catch {
        return null;
      }
    })();
    const cur = clipNow();
    box.innerHTML = `${
      cur
        ? `<div class="ra-what">${IC.clip}<b>${esc(cut(cur.title || cur.name || cur.url, 60))}</b>${cur.d ? `<small>${clock(cur.t)} من ${clock(cur.d)}</small>` : ''}</div>${cur.url ? `<p class="ra-url" dir="ltr">${esc(cut(cur.url, 80))}</p>` : ''}`
        : `<p class="ra-quiet">لا درس بجانب الكتاب: افتح «الدرس» من الشريط، أو الصق رابطاً هنا.</p>`
    }
      <label class="ra-link"><span>رابطٌ آخر</span><input type="url" dir="ltr" placeholder="https://…" value="${esc(A.link)}" spellcheck="false"></label>
      <p class="ra-quiet">${cur && cur.transcript ? 'يصله تفريغ الدرس ورابطه وعنوانه.' : 'يصله رابط الدرس وعنوانه وموضع سماعك؛ وتفريغه حين تشغّل «التفريغ» في المجلس.'}${k && A.link && k.url !== A.link ? ' (الرابط الملصق مقدَّمٌ على درس المجلس)' : ''}</p>`;
  }
  const presetsNow = () => ((A.cfg && A.cfg.presets) || []).filter((p) => !p.hidden && p.target === A.mode);
  function paintPresets() {
    const list = presetsNow();
    const pre = $('.ra-pre');
    pre.hidden = !A.items.length || !list.length;
    pre.innerHTML = list.map((p) => `<button type="button" class="ra-chip" data-p="${esc(p.id)}" title="${esc(p.hint || p.prompt)}">${esc(p.title)}</button>`).join('');
  }
  function paintWelcome() {
    if (A.items.length) return;
    const k = A.cfg || {};
    let note = '';
    if (k.error) note = `<div class="ra-note warn"><b>${esc(k.error)}</b></div>`;
    else if (k.enabled === false) note = `<div class="ra-note warn"><b>المساعد موقوف.</b><span>شغّله من الإعدادات ← الذكاء الاصطناعي ← الرَّحل.</span>${window.warraqDesktop || hasDesk() ? '<button type="button" class="ra-btn" data-a="settings">افتح الإعدادات</button>' : ''}</div>`;
    else if (k.ready === false) note = `<div class="ra-note"><b>ضع للمساعد مفتاحاً.</b><span>من الإعدادات ← الذكاء الاصطناعي ← الرَّحل: الصق مفتاحاً، أو استعمل مفتاح قسمٍ آخر بنقرة.</span>${hasDesk() ? '<button type="button" class="ra-btn pri" data-a="settings">افتح الإعدادات</button>' : ''}</div>`;
    const lead = { page: 'اسأل عن الصفحة المفتوحة: اشرحها، أو لخّصها، أو خرّج ما فيها، أو اختبر فهمك.', clip: 'اسأل عن الدرس الذي تسمعه بجانب الكتاب، أو عن رابطٍ تلصقه.', free: 'اسأل ما شئت كما تسأل أي مساعد.' }[A.mode];
    const list = presetsNow();
    msgs.innerHTML = `<div class="ra-hello"><span class="ra-hello-seal">${SEAL}</span><h3>بمَ أعينك؟</h3><p>${esc(lead)}</p>${note}${list.length ? `<div class="ra-cards">${list.map((p) => `<button type="button" class="ra-card" data-p="${esc(p.id)}"><b>${esc(p.title)}</b><small>${esc(p.hint || '')}</small></button>`).join('')}</div>` : ''}</div>`;
  }
  const hasDesk = () => {
    try {
      return !!(window.warraqDesktop || (window.top !== window && window.top.warraqDesktop));
    } catch {
      return false;
    }
  };
  function paintSend() {
    const b = $('.ra-send');
    b.innerHTML = A.run ? IC.stop : IC.send;
    b.classList.toggle('stop', !!A.run);
    b.setAttribute('aria-label', A.run ? 'أوقف' : 'أرسل');
  }
  function paint() {
    paintHead();
    paintCtx();
    paintPresets();
    paintWelcome();
    paintSend();
  }
  function md(s) {
    const inline = (x) => esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const out = [];
    let list = null;
    for (const raw of String(s).replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      const li = /^(?:[-*•]|\d+[.)-]|[٠-٩]+[.)-])\s+(.*)$/.exec(line);
      if (li) {
        (list ||= []).push(`<li>${inline(li[1])}</li>`);
        continue;
      }
      if (list) out.push(`<ul>${list.join('')}</ul>`), (list = null);
      if (!line) continue;
      const hd = /^#{1,4}\s+(.*)$/.exec(line);
      out.push(hd ? `<h4>${inline(hd[1])}</h4>` : `<p>${inline(line)}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('');
  }
  const dots = '<span class="ra-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  function push(it) {
    if (!A.items.length) msgs.innerHTML = '';
    A.items.push(it);
    const el = document.createElement('div');
    el.className = 'ra-msg ' + (it.role === 'user' ? 'me' : 'ai');
    el.dataset.item = it.id;
    msgs.appendChild(el);
    paintItem(it);
    paintPresets();
    return it;
  }
  function paintItem(it) {
    const el = msgs.querySelector(`[data-item="${it.id}"]`);
    if (!el) return;
    if (it.role === 'user') el.innerHTML = `<div class="ra-bub">${it.title ? `<b>${esc(it.title)}</b>` : `<p>${esc(it.text)}</p>`}</div><small class="ra-where">${esc(it.where)}</small>`;
    else if (it.type === 'wait') el.innerHTML = `<span class="ra-av">${SEAL}</span><div class="ra-bub wait">${dots}<span>يكتب…</span></div>`;
    else if (it.type === 'err')
      el.innerHTML = `<span class="ra-av">${SEAL}</span><div class="ra-col"><div class="ra-bub err"><b>${esc(it.error)}</b>${(it.trail || []).filter((t) => !t.ok).length ? `<details><summary>ما جُرّب</summary><ol>${it.trail.filter((t) => !t.ok).map((t) => `<li><b>${esc(t.label)}</b>: ${esc(t.error || '')}</li>`).join('')}</ol></details>` : ''}</div>${(it.reason === 'no-key' || it.reason === 'disabled') && hasDesk() ? '<div class="ra-acts"><button type="button" class="ra-btn" data-a="settings">افتح الإعدادات</button></div>' : ''}</div>`;
    else
      el.innerHTML = `<span class="ra-av">${SEAL}</span><div class="ra-col"><div class="ra-bub ans">${md(it.text)}</div>${srcHtml(it.sources)}<div class="ra-acts"><button type="button" class="ra-btn" data-x="copy">${IC.copy}انسخ</button>${it.page ? `<button type="button" class="ra-btn" data-x="note" ${it.noted ? 'disabled' : ''}>${IC.note}${it.noted ? 'صار ملاحظة' : `اجعله ملاحظة على ص ${ar(it.page)}`}</button>` : ''}<small class="ra-meta">${esc(it.provider || '')}</small></div></div>`;
    requestAnimationFrame(() => (body.scrollTop = body.scrollHeight));
  }

  /* ------------------------------------------------------------ الإرسال */
  /** مصادر العلم (من «مصادر المعرفة»): تلقائياً بحسب الصفحة، أو ما في التوجيه — إن كان لها مفاتيح */
  function knowOf(know, text, prompt) {
    const kb = A.cfg && A.cfg.know;
    const ready = ((kb && kb.cats) || []).filter((x) => !x.free && x.ready).map((x) => x.id);
    if (!ready.length || (kb && kb.auto === false && !know)) return null;
    const cats = String(know || 'auto').split(',').filter((x) => x === 'auto' || ready.includes(x));
    return cats.length ? { cats, text: String(text || '').slice(0, 6000), prompt: String(prompt || '').slice(0, 1200) } : null;
  }
  const srcHtml = (list) =>
    list && list.length
      ? `<details class="ra-srcs"><summary>المصادر (${ar(list.length)})</summary><ol>${list.map((x) => `<li><small>${esc(x.catName)} · ${esc(x.via)}</small> ${x.title ? `<b>${esc(x.title)}</b>` : ''}<p>${esc(String(x.text || '').slice(0, 260))}</p>${x.grade ? `<em>خلاصة حكم المحدث: ${esc(x.grade)}</em>` : ''}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" dir="ltr">${esc(x.url.replace(/^https?:\/\//, '').slice(0, 50))}</a>` : ''}</li>`).join('')}</ol></details>`
      : '';
  async function send({ prompt, title, know }) {
    if (A.run) return;
    const mode = A.mode;
    if (mode === 'clip' && !clipNow()) return c.toast('لا درس بجانب الكتاب: افتح «الدرس»، أو الصق رابطاً');
    const ps = pagesNow();
    push({ role: 'user', id: ++A.seq, text: prompt, title, where: mode === 'free' ? 'منفصل' : mode === 'clip' ? 'بالمقطع' : ps.length ? `ص ${ps.map(ar).join(' و')}` : 'بالصفحة' });
    const it = push({ role: 'ai', id: ++A.seq, type: 'wait' });
    const ctl = new AbortController();
    A.run = { ctl, it };
    paintSend();
    try {
      let user = prompt;
      if (mode === 'page') user = (await pageBlock()) + '\n\n[التوجيه] ' + prompt;
      else if (mode === 'clip') user = clipBlock() + '\n\n[التوجيه] ' + prompt;
      const kn = knowOf(know, mode === 'free' ? '' : user, prompt);
      const r = await api('/api/admin/ai/run', { method: 'POST', data: { scope: 'rahl', kind: mode === 'free' ? 'plain' : 'answer', user, history: A.hist[mode].slice(-6), tag: cut(title || prompt, 30), ...(kn ? { know: kn } : {}) }, signal: ctl.signal });
      A.hist[mode].push({ role: 'user', content: user.slice(0, 12000) }, { role: 'assistant', content: r.text.slice(0, 12000) });
      if (A.hist[mode].length > 12) A.hist[mode] = A.hist[mode].slice(-12);
      Object.assign(it, { type: 'ans', text: r.text, provider: r.provider, page: mode === 'free' ? 0 : ps[0] || 0, sources: r.sources || null });
    } catch (e) {
      if (e.name === 'AbortError') Object.assign(it, { type: 'err', error: 'أُوقف الطلب' });
      else Object.assign(it, { type: 'err', error: e.message, reason: e.reason, trail: e.trail });
    }
    A.run = null;
    paintItem(it);
    paintSend();
  }
  function usePreset(id) {
    const p = presetsNow().find((x) => x.id === id);
    if (!p) return;
    if (p.fill) {
      ta.value = p.prompt;
      grow();
      ta.focus();
      const i = ta.value.indexOf('…');
      if (i >= 0) ta.setSelectionRange(i, i + 1);
      return;
    }
    send({ prompt: p.prompt, title: p.title, know: p.know });
  }
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(150, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation(); // (لا تصل مفاتيح الكتابة إلى القارئ)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $('.ra-in').requestSubmit();
    }
    if (e.key === 'Escape') close();
  });
  $('.ra-in').addEventListener('submit', (e) => {
    e.preventDefault();
    if (A.run) return A.run.ctl.abort();
    const v = ta.value.trim();
    if (!v) return ta.focus();
    ta.value = '';
    grow();
    send({ prompt: v, title: '' });
  });
  panel.addEventListener('input', (e) => {
    if (e.target.matches('.ra-link input')) {
      A.link = e.target.value;
      const w = $('.ra-what b');
      if (w) {
        const k = clipNow();
        w.textContent = k ? cut(k.title || k.name || k.url, 60) : '';
      }
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) e.stopPropagation();
  });
  panel.addEventListener('change', (e) => e.target.matches('.ra-link input') && paintCtx());
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'new') {
      if (A.run) A.run.ctl.abort();
      A.items = [];
      A.hist = { page: [], clip: [], free: [] };
      return paint();
    }
    if (a === 'settings') {
      LS('warraq.aiScope', 'rahl');
      LS('warraq.settingsOpen', 'ai');
      const d = window.warraqDesktop || window.top.warraqDesktop;
      if (d && d.openWindow) d.openWindow('settings');
      A.cfgAt = 0;
      return;
    }
    if (b.dataset.mode) {
      A.mode = b.dataset.mode;
      LS('warraq.rahlai.mode', A.mode);
      paint();
      return ta.focus();
    }
    if (b.dataset.p) return usePreset(b.dataset.p);
    const el = b.closest('[data-item]');
    const it = el && A.items.find((x) => String(x.id) === el.dataset.item);
    if (!it) return;
    if (b.dataset.x === 'copy') {
      try {
        await navigator.clipboard.writeText(it.text);
        c.toast('نُسخ');
      } catch {
        c.toast('تعذّر النسخ');
      }
    }
    if (b.dataset.x === 'note' && !it.noted) {
      const notes = c.notes();
      if (notes && notes.addAiNote) {
        notes.addAiNote(it.text, it.page);
        it.noted = true;
        paintItem(it);
        c.toast(`صار ملاحظةً على ص ${ar(it.page)}`);
      }
    }
  });

  /* ------------------------------------------------------------ فتح وإغلاق */
  async function open() {
    A.open = true;
    panel.hidden = false;
    room.classList.add('ai-on');
    syncBtn();
    paint();
    c.onLayout();
    await loadCfg();
    paint();
    ta.focus();
  }
  function close() {
    A.open = false;
    panel.hidden = true;
    room.classList.remove('ai-on');
    syncBtn();
    c.onLayout();
  }
  const syncBtn = () => {
    for (const b of room.querySelectorAll('[data-act="ai"]')) b.setAttribute('aria-pressed', String(A.open));
  };
  window.addEventListener('focus', () => A.open && loadCfg().then(paint));
  return {
    toggle: () => (A.open ? close() : open()),
    open,
    close,
    get isOpen() {
      return A.open;
    },
    /** تغيّرت الصفحة: يُحدَّث ما يُرسل معها */
    onPage() {
      if (A.open && A.mode !== 'free') paintCtx();
    },
    destroy() {
      if (A.run) A.run.ctl.abort();
    },
  };
}
