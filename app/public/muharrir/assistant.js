// «المساعد» في المحرِّر: نافذةٌ صغيرة بجانب الصفحة يُكتب فيها للذكاء الاصطناعي.
// طريقتان: «مرتبط بالصفحة» (يُرسل المحدَّد أو الفصل أو المجلد مع سياقه: الكتاب ومؤلفه، والفصل، وكون النص متناً أو شرحاً أو حاشية)،
// و«منفصل» (التوجيه وحده). وللتوجيهات الجاهزة أنواعٌ في ردّها: جوابٌ يُقرأ، أو نصٌّ مصحَّح يُقارن بأصله ويُستبدل،
// أو مواضع أخطاء في فقرات كثيرة تُقبل واحداً واحداً، أو عناوين ومستوياتها، أو المتن من الشرح.
// ما يُطبَّق منها يمرّ بعمليات المحرِّر نفسها (فيُرجع عنه، ويُكتب في جدول الخطأ والصواب).
// ومن «مصادر المعرفة»: مصادر العلم (تلقائياً بحسب النص، أو أقسامٌ يختارها المستخدم وتُجمع) تُرسل نتائجها مع التوجيه،
// فيُجيب المساعد بها ويذكر أرقامها، وتُعرض تحت جوابه بروابطها؛ و«ترجمة» تترجم المحدَّد أو الفصل أو الكتاب بمصادر الترجمة.
import { diffText, sigOf, findRegex, runsFromText, splitRunsAt, opId, sideText } from '/shared/edits.js';

export function setupAssistant(h) {
  const { st, $, esc, ar, cut, nodeOf, textOf, describe, roleOf, roleName, curSec, commit, goBlock, select, toast, levelName, blockOfNote, desk } = h;

  /* ================================================================ الحال */
  const LS = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {}
    return null;
  };
  const A = {
    open: false,
    wide: LS('warraq.ai.wide') === '1',
    mode: ['free', 'trans'].includes(LS('warraq.ai.mode')) ? LS('warraq.ai.mode') : 'linked',
    target: null, // ما اختاره المستخدم: sel | section | book (وإلا فبحسب التحديد)
    cfg: null,
    cfgAt: 0,
    items: [], // ما في المحادثة
    hist: { linked: [], free: [] }, // ما يُرسل للمتابعة (الأجوبة النصية وحدها)
    run: null, // الطلب الجاري { ctl, item }
    seq: 0,
    lastSelKey: '',
    // ما يُرسل إلى المساعد وما له أن يغيّره (يُذكر): all|toc|h|m|s|f ، و auto (مثل ما يُرسل)|none|all|h|m|s|f
    io: (() => {
      try {
        const v = JSON.parse(LS('warraq.ai.io') || 'null');
        if (v && Array.isArray(v.in) && Array.isArray(v.out)) return v;
      } catch {}
      return { in: ['all'], out: ['auto'], sel: 'sel' };
    })(),
    // مصادر العلم المختارة: '' (الأصل: «تلقائي» إن فُعّل) أو auto أو general أو أقسامٌ بينها فواصل
    know: (() => {
      const v = LS('warraq.ai.know') || '';
      return /^[\w,-]{0,120}$/.test(v) ? v : '';
    })(),
    // الترجمة: إلى، ومن، والطريقة (ما لم يُختر فمن الإعدادات)
    tr: (() => {
      try {
        const v = JSON.parse(LS('warraq.ai.tr') || 'null');
        if (v && typeof v === 'object') return v;
      } catch {}
      return {};
    })(),
  };
  // العدد ومعدوده: «كلمة واحدة، كلمتان، ٣ كلمات، ١١ كلمة»
  const COUNTED = {
    كلمة: ['كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة'],
    فقرة: ['فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة'],
    ملاحظة: ['ملاحظة واحدة', 'ملاحظتان', 'ملاحظات', 'ملاحظة'],
    تغيير: ['تغييرٌ واحد', 'تغييران', 'تغييرات', 'تغييراً'],
    سطر: ['سطرٍ واحد', 'سطرين', 'أسطر', 'سطراً'],
    موضع: ['موضعٌ واحد', 'موضعان', 'مواضع', 'موضعاً'],
    دفعة: ['دفعة واحدة', 'دفعتان', 'دفعات', 'دفعة'],
  };
  const cnt = (n, w) => {
    const f = COUNTED[w];
    return n === 1 ? f[0] : n === 2 ? f[1] : `${ar(n)} ${n % 100 >= 3 && n % 100 <= 10 ? f[2] : f[3]}`;
  };
  const tgt = () => {
    if (A.mode === 'free') return 'free';
    const hasSel = selUnits().length > 0;
    if (A.target === 'sel' && !hasSel) return 'section';
    return A.target || (hasSel ? 'sel' : 'section');
  };

  /* ================================================================ الاتصال */
  async function api(path, { method = 'GET', body, signal } = {}) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-warraq': '1' }, body: body === undefined ? undefined : JSON.stringify(body), signal, credentials: 'same-origin' });
    let d = {};
    try {
      d = await r.json();
    } catch {}
    if (!r.ok) throw Object.assign(new Error(r.status === 404 && !d.reason ? 'المساعد لصاحب البرنامج وحده' : d.error || 'HTTP ' + r.status), { status: r.status, reason: d.reason || (r.status === 404 ? 'owner' : ''), trail: d.trail || [] });
    return d;
  }
  async function loadCfg(force) {
    if (!force && A.cfg && Date.now() - A.cfgAt < 15000) return A.cfg;
    try {
      A.cfg = await api('/api/admin/ai/editor');
    } catch (e) {
      A.cfg = { error: e.message, reason: e.reason, presets: [] };
    }
    A.cfgAt = Date.now();
    return A.cfg;
  }

  /* ================================================================ ما يُرسل: الوحدات وسياقها */
  const isText = (n) => !!n && (!!n.runs || n.type === 'verse' || n.type === 'heading' || n.type === 'label');
  const roleWord = (t, node) => {
    if (t.n != null) return 'حاشية';
    if (node.type === 'heading' || node.type === 'label') return 'عنوان';
    const r = roleOf(node);
    const w = r === 'matn' ? 'متن' : roleName('sharh') === 'الشرح' ? 'شرح' : 'نص';
    return node.type === 'verse' ? `بيت (${w})` : w;
  };
  /** وحدة: موضعٌ من قطعة ← { t, from, to, text, verse, role } */
  function unitOf(t, from, to) {
    const node = nodeOf(t);
    if (!isText(node)) return null;
    const full = textOf(node);
    const a = from == null ? 0 : from;
    const z = to == null ? full.length : to;
    const text = full.slice(a, z);
    if (!text.trim()) return null;
    // مواضع إحالات الحواشي في النص (لتبقى كل إحالةٍ عند كلمتها بعد الترجمة)
    const refs = [];
    if (node.runs) {
      let p = 0;
      for (const r of node.runs) {
        if (r.k === 'r') {
          if (p >= a && p <= z) refs.push(p);
          continue;
        }
        p += (r.s || '').length;
      }
    }
    return { t, from: a, to: z, text, verse: node.type === 'verse', role: roleWord(t, node), ...(refs.length ? { refs } : {}), ...(t.n != null ? { note: true } : {}) };
  }
  /** حواشي القطعة (ومنها ما في حواشيها) ← وحداتها */
  function noteUnits(blk, seen) {
    const out = [];
    const walk = (runs) => {
      for (const r of runs || []) {
        if (r.k !== 'r' || seen.has(r.id)) continue;
        seen.add(r.id);
        const nt = st.view.notes[r.id];
        (nt && nt.segs ? nt.segs : []).forEach((sg, g) => {
          const v = unitOf({ vol: st.vol, n: r.id, g });
          if (v) out.push(v);
          if (sg && sg.runs) walk(sg.runs);
        });
      }
    };
    walk(blk && blk.runs);
    return out;
  }
  function selUnits(sel = st.sel, { notes = false } = {}) {
    if (!sel || !st.view) return [];
    let list;
    const seen = new Set();
    // (notes: وحواشي ما حُدّد من القطع كلها، بعد كل قطعة)
    const withNotes = (i) => [unitOf({ vol: st.vol, b: i }), ...(notes ? noteUnits(st.view.blocks[i], seen) : [])];
    if (sel.level === 'group' || sel.level === 'multi') list = sel.blocks.flatMap(withNotes);
    else if (sel.level === 'run' || sel.level === 'span') list = [unitOf(sel.t, sel.from, sel.to)];
    else if (notes && sel.t && sel.t.b != null && sel.t.sd == null) list = withNotes(sel.t.b);
    else list = [unitOf(sel.t)];
    return list.filter(Boolean).map((u, i) => ({ ...u, id: String(i + 1) }));
  }
  /** فقرات مدى (فصل أو مجلد)، ومعها حواشيها */
  function rangeUnits(a, b, { notes = true } = {}) {
    const out = [];
    const seen = new Set();
    for (let i = a; i <= b; i++) {
      const blk = st.view.blocks[i];
      if (!blk) continue;
      const u = unitOf({ vol: st.vol, b: i });
      if (u) out.push(u);
      if (notes) out.push(...noteUnits(blk, seen));
    }
    return out.map((u, i) => ({ ...u, id: String(i + 1) }));
  }
  const multiVol = () => !!(st.info && st.info.volumes && st.info.volumes.length > 1);
  const volLabel = () => {
    const v = st.info && st.info.volumes ? st.info.volumes.find((x) => String(x.vol) === String(st.vol)) : null;
    return (v && v.label) || 'المجلد ' + ar(st.vol);
  };
  const secNow = () => (st.whole ? null : st.sections[st.si]) || curSec();
  function rangeOf(target) {
    if (target === 'book') return { a: 0, b: Math.max(0, st.view.blocks.length - 1), name: multiVol() ? volLabel() : 'الكتاب كله' };
    const s = secNow() || { a: 0, b: st.view.blocks.length - 1, title: '' };
    return { a: s.a, b: s.b, name: s.title ? `الفصل «${cut(s.title, 50)}»` : 'الفصل' };
  }
  function bookHead() {
    const i = st.info || {};
    const out = [`[الكتاب] «${i.title || 'بلا عنوان'}»${i.author ? ' — تأليف: ' + i.author : ''}`];
    if (multiVol()) out.push(`[المجلد] ${volLabel()} من ${ar(i.volumes.length)}`);
    return out;
  }
  const near = (i, d) => {
    for (let j = i + d, k = 0; j >= 0 && j < st.view.blocks.length && k < 4; j += d, k++) {
      const t = textOf(st.view.blocks[j]);
      if (t.trim()) return d < 0 ? '…' + t.slice(-260) : t.slice(0, 260) + '…';
    }
    return '';
  };
  /** سياق المحدَّد: أين هو، وما قبله وما بعده */
  function selHead(sel, units) {
    const lines = bookHead();
    const s = secNow();
    if (s && s.title) lines.push(`[الفصل] «${s.title}»`);
    lines.push(`[المحدَّد] ${describe(sel).name}${units.length > 1 ? ` (${cnt(units.length, 'فقرة')})` : ''}`);
    const first = units[0];
    const bi = first.t.n != null ? blockOfNote(first.t.n) : first.t.b;
    const lastB = units[units.length - 1].t.b != null ? units[units.length - 1].t.b : bi;
    if (first.t.n != null && bi >= 0) lines.push(`[الحاشية على] «${cut(textOf(st.view.blocks[bi]), 220)}»`);
    else {
      const node = nodeOf(first.t);
      const full = textOf(node);
      // ما حول المحدَّد من فقرته، ثم ما قبلها وما بعدها
      if (first.from > 0) lines.push(`[قبله في فقرته] «…${full.slice(Math.max(0, first.from - 200), first.from)}»`);
      else if (bi > 0) lines.push(`[قبله] «${near(bi, -1)}»`);
      const lastU = units[units.length - 1];
      const lastFull = textOf(nodeOf(lastU.t));
      if (lastU.to < lastFull.length) lines.push(`[بعده في فقرته] «${lastFull.slice(lastU.to, lastU.to + 200)}…»`);
      else lines.push(`[بعده] «${near(lastB, 1)}»`);
    }
    return lines;
  }
  /** ما عُلِّم في القطعة آيةً أو حديثاً ← { q: [نص…], h: [نص…] } (والآية في المتن آيةٌ أيضاً) */
  function marksOf(node) {
    const out = { q: [], h: [] };
    if (!node) return out;
    if (node.runs) {
      for (const r of node.runs) {
        if (r.k === 'r' || !(r.s || '').trim()) continue;
        if (r.k === 'q' || (r.k === 'm' && r.q)) out.q.push(r.s.trim());
        else if (r.k === 'h') out.h.push(r.s.trim());
      }
    } else if (node.type === 'verse' && Array.isArray(node.vq)) {
      for (const [p, a, z] of node.vq) out.q.push(String((node.parts || [])[p] || '').slice(a, z).trim());
    }
    return out;
  }
  /** أسطر «[الآيات المعلَّمة]» و«[الأحاديث المعلَّمة]» لوحداتٍ بمعرّفاتها (يراها المساعد وحدها، مفصولةً عن النص) */
  function marksBlock(units, cap = 7000) {
    const q = [];
    const h = [];
    for (const u of units) {
      const node = nodeOf(u.t);
      const m = marksOf(node);
      const inside = (s) => u.from <= 0 && u.to >= textOf(node).length ? true : u.text.includes(s.slice(0, 40));
      for (const x of m.q) if (inside(x)) q.push(`[${u.id}] ${cut(x, 400)}`);
      for (const x of m.h) if (inside(x)) h.push(`[${u.id}] ${cut(x, 300)}`);
    }
    const out = [];
    let n = 0;
    const add = (title, list) => {
      if (!list.length) return;
      out.push('', title);
      for (const l of list) {
        if (n + l.length > cap) {
          out.push('[…وغيرها]');
          break;
        }
        out.push(l);
        n += l.length + 1;
      }
    };
    add('[الآيات المعلَّمة]', q);
    add('[الأحاديث المعلَّمة]', h);
    return out;
  }
  const itemsJson = (units, max) => '[\n' + units.map((u) => JSON.stringify({ id: u.id, role: u.role, text: max ? u.text.slice(0, max) : u.text })).join(',\n') + '\n]';
  /** نص مدى للأجوبة (الفصل أو المجلد): العناوين بعلامتها، ويُختصر الطويل */
  function rangeText(a, b, cap) {
    const parts = [];
    let n = 0;
    for (let i = a; i <= b && n < cap; i++) {
      const blk = st.view.blocks[i];
      if (!isText(blk)) continue;
      const t = textOf(blk).trim();
      if (!t) continue;
      const line = blk.type === 'heading' ? `${'#'.repeat(Math.min(4, blk.level || 2))} ${t}` : t;
      parts.push(line);
      n += line.length + 2;
    }
    let s = parts.join('\n\n');
    if (s.length > cap) s = s.slice(0, cap) + '\n\n[…بقيته محذوفة لطولها]';
    return s;
  }
  const tocOf = (a, b) =>
    st.view.blocks
      .slice(a, b + 1)
      .filter((x) => x.type === 'heading')
      .slice(0, 400)
      .map((x) => `${'  '.repeat(Math.max(0, (x.level || 2) - 1))}- ${x.text}`)
      .join('\n');

  /* ================================================================ الواجهة */
  const ICON = {
    seal: '<svg viewBox="0 0 48 48" aria-hidden="true"><path class="s-d" d="M24 2.5 45.5 24 24 45.5 2.5 24z"/><path class="s-i" d="M24 8.5 39.5 24 24 39.5 8.5 24z"/><path class="s-s" d="M24 13.2c1 5.6 4.2 8.8 9.8 9.8-5.6 1-8.8 4.2-9.8 9.8-1-5.6-4.2-8.8-9.8-9.8 5.6-1 8.8-4.2 9.8-9.8z"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    free: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v10H9l-4 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    wide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    narrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5v5H5M14 19v-5h5M10 10 4 4M14 14l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    trans: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M9 4v3m3 0c-1 4-4 7-7 8m2-4c1.5 2 3.5 3 6 3.5M14 20l3.5-8 3.5 8m-6-2.5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const app = $('#app');
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'ai-fab';
  fab.id = 'aiFab';
  fab.title = 'المساعد (Ctrl+Shift+A)';
  fab.setAttribute('aria-label', 'المساعد');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = ICON.seal + '<span>المساعد</span>';
  const pane = document.createElement('section');
  pane.className = 'ai-pane';
  pane.id = 'aiPane';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'المساعد');
  pane.innerHTML = `
    <header class="ai-h">
      <span class="ai-seal">${ICON.seal}</span>
      <div class="ai-tt"><b>المساعد</b><small id="aiWho"></small></div>
      <button type="button" class="ai-ib" data-a="new" title="محادثة جديدة">${ICON.fresh}</button>
      <button type="button" class="ai-ib" data-a="wide" title="وسّع النافذة">${ICON.wide}</button>
      <button type="button" class="ai-ib" data-a="close" title="أغلق (Esc)" aria-label="أغلق">✕</button>
    </header>
    <div class="ai-modes" role="group" aria-label="طريقة الإرسال">
      <button type="button" data-mode="linked">${ICON.link}<span><b>مرتبط بالصفحة</b><small>المحدَّد وسياقه</small></span></button>
      <button type="button" data-mode="free">${ICON.free}<span><b>منفصل</b><small>توجيهك وحده</small></span></button>
      <button type="button" data-mode="trans">${ICON.trans}<span><b>ترجمة</b><small>بمصادر الترجمة</small></span></button>
    </div>
    <div class="ai-ctx" id="aiCtx"></div>
    <div class="ai-body" id="aiBody"><div class="ai-msgs" id="aiMsgs" aria-live="polite"></div></div>
    <div class="ai-pre" id="aiPre"></div>
    <form class="ai-in" id="aiForm" autocomplete="off">
      <textarea id="aiText" rows="1" dir="auto" placeholder="اكتب ما تريد…" aria-label="اكتب للمساعد"></textarea>
      <button type="submit" class="ai-send" id="aiSend" aria-label="أرسل" title="أرسل (Enter)">${ICON.send}</button>
    </form>`;
  app.appendChild(pane);
  app.appendChild(fab);
  const msgsEl = pane.querySelector('#aiMsgs');
  const bodyEl = pane.querySelector('#aiBody');
  const textEl = pane.querySelector('#aiText');

  function paintFrame() {
    pane.classList.toggle('wide', A.wide);
    const wb = pane.querySelector('[data-a="wide"]');
    wb.innerHTML = A.wide ? ICON.narrow : ICON.wide;
    wb.title = A.wide ? 'صغّر النافذة' : 'وسّع النافذة';
    for (const b of pane.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === A.mode));
    pane.classList.toggle('free', A.mode === 'free');
    pane.classList.toggle('trans', A.mode === 'trans');
    const c = A.cfg || {};
    pane.querySelector('#aiWho').textContent = c.first ? `${c.first.label} · ${c.first.model}` : c.error ? '' : c.ready === false ? 'لا مفتاح بعد' : '';
    textEl.placeholder =
      A.mode === 'free'
        ? 'اسأل ما شئت… (لا يُرسل شيءٌ من الكتاب)'
        : A.mode === 'trans'
          ? 'اكتب نصاً لترجمته… أو اضغط ⏎ لترجمة ' + { sel: 'المحدَّد', section: 'الفصل', book: multiVol() ? 'المجلد' : 'الكتاب' }[tgt()]
          : { sel: 'ماذا تريد في المحدَّد؟', section: 'ماذا تريد في هذا الفصل؟', book: 'ماذا تريد في الكتاب؟' }[tgt()];
  }

  /** بطاقة السياق: ما سيُرسل مع التوجيه */
  function paintCtx() {
    const box = pane.querySelector('#aiCtx');
    if (A.mode === 'free') {
      box.innerHTML = `<p class="ac-free">يُرسل توجيهك وحده، بلا شيءٍ من الكتاب${A.cfg && A.cfg.note ? '، ومعه توجيهك العام من الإعدادات' : ''}.</p>${knowHtml()}`;
      return;
    }
    if (!st.view) return (box.innerHTML = '');
    const t = tgt();
    const units = selUnits();
    const tabs = [
      ['sel', 'المحدَّد', !units.length],
      ['section', 'الفصل', false],
      ['book', multiVol() ? 'المجلد' : 'الكتاب', false],
    ];
    let what = '';
    if (t === 'sel') {
      const d = describe(st.sel);
      const text = units.map((u) => u.text).join(' ');
      const words = (text.match(/\S+/g) || []).length;
      what = `<div class="ac-what"><i class="dot ${d.cls}"></i><b>${esc(d.name)}</b><small>${cnt(words, 'كلمة')}</small></div><p class="ac-text ${d.cls}">${esc(cut(text, 170))}</p>`;
    } else {
      const r = rangeOf(t);
      const n = st.view.blocks.slice(r.a, r.b + 1).filter((x) => isText(x)).length;
      what = `<div class="ac-what"><i class="dot k-hd"></i><b>${esc(r.name)}</b><small>${cnt(n, 'فقرة')}</small></div>`;
    }
    const i = st.info || {};
    const tabsHtml = `<div class="ac-tabs" role="group" aria-label="على ماذا">${tabs.map(([k, n, dis]) => `<button type="button" data-tg="${k}" aria-pressed="${t === k}" ${dis ? 'disabled title="حدّد نصاً في الصفحة"' : ''}>${n}</button>`).join('')}</div>`;
    if (A.mode === 'trans') {
      box.innerHTML = tabsHtml + what + trHtml(t);
      return;
    }
    box.innerHTML = `${tabsHtml}
      ${what}${ioHtml(t)}${knowHtml()}<small class="ac-book">مع اسم الكتاب «${esc(cut(i.title || '', 40))}»${i.author ? ` ومؤلفه` : ''}${t === 'sel' ? '، ونوع النص، وما قبله وما بعده' : ''}</small>`;
  }

  /** التوجيهات الجاهزة لما يناسب الآن */
  // نوع الكتاب: المتون لها توجيهاتها (وما لا يناسبها يُخفى، كتمييز المتن من الشرح)
  const MU = () => (h.mutun ? h.mutun() : null);
  const bookKind = () => (MU() && MU().on() ? 'mutun' : 'books');
  function presetsNow() {
    const c = A.cfg || {};
    const t = tgt();
    const k = bookKind();
    return (c.presets || []).filter((p) => !p.hidden && p.target === t && (!p.only || p.only === k) && p.not !== k && (A.mode !== 'trans' || p.kind === 'translate'));
  }
  function paintPresets() {
    const list = presetsNow();
    const box = pane.querySelector('#aiPre');
    const empty = !A.items.length;
    box.hidden = empty || !list.length;
    box.innerHTML = list.map((p) => `<button type="button" class="ai-chip k-${p.kind}" data-p="${esc(p.id)}" title="${esc(p.hint || p.prompt)}">${esc(p.title)}</button>`).join('');
  }
  function paintWelcome() {
    if (A.items.length) return;
    const c = A.cfg || {};
    let note = '';
    if (c.error) note = `<div class="ai-note warn"><b>${esc(c.error)}</b>${c.reason === 'owner' ? '' : '<button type="button" class="ai-btn" data-a="retry-cfg">أعد المحاولة</button>'}</div>`;
    else if (c.enabled === false) note = `<div class="ai-note warn"><b>المساعد موقوف.</b><span>شغّله من الإعدادات ← الذكاء الاصطناعي ← المحرِّر.</span>${desk ? '<button type="button" class="ai-btn" data-a="settings">افتح الإعدادات</button>' : ''}</div>`;
    else if (c.ready === false) note = `<div class="ai-note"><b>ضع للمساعد مفتاحاً.</b><span>من الإعدادات ← الذكاء الاصطناعي ← المحرِّر: الصق مفتاحاً، أو استعمل مفتاح التنضيد بنقرة.</span>${desk ? '<button type="button" class="ai-btn pri" data-a="settings">افتح الإعدادات</button>' : ''}</div>`;
    const list = presetsNow();
    const t = tgt();
    const lead = {
      sel: 'حدّدت نصاً: دقّقه أو اضبطه، أو اشرحه وخرّجه؛ أو اكتب ما تريد.',
      section: 'لا تحديد: يعمل على الفصل الظاهر. حدّد نصاً في الصفحة ليعمل عليه وحده.',
      book: 'يعمل على ' + (multiVol() ? 'المجلد' : 'الكتاب') + ' كله، دفعةً بعد دفعة.',
      free: 'اسأل ما شئت كما تسأل أي مساعد؛ لا يصله شيءٌ من الكتاب.',
    }[t];
    const trLead = A.mode === 'trans' ? `يترجم ${{ sel: 'المحدَّد', section: 'الفصل الظاهر', book: multiVol() ? 'المجلد كله' : 'الكتاب كله' }[t] || 'ما تكتبه'} إلى ${esc(langName(trNow().to))}، ثم تستبدل به النص، أو تُدرجه بعد كل فقرة، أو تنزّله ملفاً. أو اكتب نصاً في الخانة لترجمته وحده.` : '';
    msgsEl.innerHTML = `<div class="ai-hello">
      <span class="ai-hello-seal">${ICON.seal}</span>
      <h3>بمَ أخدمك؟</h3>
      <p>${trLead || esc(lead)}</p>
      ${note}${A.mode !== 'trans' ? knowLead() : ''}
      ${list.length ? `<div class="ai-cards">${list.map((p) => `<button type="button" class="ai-card k-${p.kind}" data-p="${esc(p.id)}"><b>${esc(p.title)}</b><small>${esc(p.hint || '')}</small></button>`).join('')}</div>` : ''}
    </div>`;
  }
  function paint() {
    if (!A.open) return;
    paintFrame();
    paintCtx();
    paintPresets();
    if (!A.items.length) paintWelcome();
    paintSend();
  }
  function paintSend() {
    const b = pane.querySelector('#aiSend');
    b.innerHTML = A.run ? ICON.stop : ICON.send;
    b.classList.toggle('stop', !!A.run);
    b.title = A.run ? 'أوقف' : 'أرسل (Enter)';
    b.setAttribute('aria-label', A.run ? 'أوقف' : 'أرسل');
  }

  /* ---- فتح وإغلاق ---- */
  async function open(focus = true) {
    A.open = true;
    pane.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.classList.add('hide');
    requestAnimationFrame(() => pane.classList.add('in'));
    paint();
    await loadCfg();
    paint();
    if (focus) textEl.focus();
  }
  function close() {
    A.open = false;
    pane.classList.remove('in');
    fab.setAttribute('aria-expanded', 'false');
    fab.classList.remove('hide');
    setTimeout(() => !A.open && (pane.hidden = true), 180);
  }
  fab.addEventListener('click', () => open());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'KeyA' || String(e.key).toLowerCase() === 'a')) {
      e.preventDefault();
      if (A.open && pane.contains(document.activeElement)) close();
      else open();
    }
  });
  pane.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (A.run) return stop();
      close();
    }
  });
  window.addEventListener('focus', () => A.open && loadCfg().then(paint));

  /* ---- أزرار النافذة ---- */
  pane.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !pane.contains(b)) return;
    const a = b.dataset.a;
    if (a === 'close') return close();
    if (a === 'wide') {
      A.wide = !A.wide;
      LS('warraq.ai.wide', A.wide ? '1' : '0');
      return paintFrame();
    }
    if (a === 'new') {
      if (A.run) stop();
      A.items = [];
      A.hist = { linked: [], free: [] };
      msgsEl.innerHTML = '';
      return paint();
    }
    if (a === 'retry-cfg') return loadCfg(true).then(paint);
    if (a === 'settings') return openSettings();
    if (b.dataset.mode) {
      A.mode = b.dataset.mode;
      LS('warraq.ai.mode', A.mode);
      paint();
      return textEl.focus();
    }
    if (b.dataset.tg) {
      A.target = b.dataset.tg;
      return paint();
    }
    if (b.dataset.ioi || b.dataset.ioo) {
      ioPick(b.dataset.ioi ? 'in' : 'out', b.dataset.ioi || b.dataset.ioo);
      return paintCtx();
    }
    if (b.dataset.kn) {
      knowPick(b.dataset.kn);
      return paintCtx();
    }
    if (b.dataset.trv) {
      A.tr.via = b.dataset.trv;
      LS('warraq.ai.tr', JSON.stringify(A.tr));
      return paintCtx();
    }
    if (a === 'know-settings') return openSettings('sci');
    if (a === 'tr-settings') return openSettings('trans');
    if (a === 'tr-go') return send({ prompt: 'ترجم ' + whereLabel(tgt()), title: 'ترجم ' + whereLabel(tgt()), kind: 'translate' });
    if (b.dataset.p) return usePreset(b.dataset.p);
    const card = b.closest('[data-item]');
    if (card) return itemAct(card, b, e);
  });
  function openSettings(kn) {
    if (kn) {
      LS('warraq.knOpen', kn);
      LS('warraq.knPane', kn);
      LS('warraq.settingsOpen', 'sources');
    } else {
      LS('warraq.aiScope', 'editor');
      LS('warraq.settingsOpen', 'ai');
    }
    if (desk && desk.openWindow) desk.openWindow('settings');
    A.cfgAt = 0;
  }
  pane.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-tr]');
    if (!sel) return;
    A.tr[sel.dataset.tr] = sel.value;
    LS('warraq.ai.tr', JSON.stringify(A.tr));
    paintCtx();
    paintWelcome();
  });

  /* ---- خانة الكتابة ---- */
  const grow = () => {
    textEl.style.height = 'auto';
    textEl.style.height = Math.min(160, textEl.scrollHeight) + 'px';
  };
  textEl.addEventListener('input', grow);
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      pane.querySelector('#aiForm').requestSubmit();
    }
  });
  pane.querySelector('#aiForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (A.run) return stop();
    const v = textEl.value.trim();
    if (A.mode === 'trans') {
      textEl.value = '';
      grow();
      if (v) return send({ prompt: v, title: '', kind: 'translate', target: 'free' });
      if (!st.view) return toast('افتح كتاباً، أو اكتب نصاً لترجمته');
      return send({ prompt: 'ترجم ' + whereLabel(tgt()), title: 'ترجم ' + whereLabel(tgt()), kind: 'translate' });
    }
    if (!v) return textEl.focus();
    if (/…/.test(v) && A.pendingFill && v === A.pendingFill) {
      toast('أكمل موضع «…» أولاً');
      return selectDots();
    }
    textEl.value = '';
    grow();
    const know = A.pendingFill && A.pendingKnow ? A.pendingKnow : undefined;
    A.pendingFill = null;
    A.pendingKnow = null;
    send({ prompt: v, title: '', know });
  });
  function selectDots() {
    const i = textEl.value.indexOf('…');
    textEl.focus();
    if (i >= 0) textEl.setSelectionRange(i, i + 1);
  }

  /* ================================================================ الإرسال */
  function usePreset(id) {
    const p = ((A.cfg && A.cfg.presets) || []).find((x) => x.id === id);
    if (!p) return;
    if (A.run) return toast('ينتظر المساعد ردّاً: أوقفه أو انتظر');
    if (p.fill) {
      textEl.value = p.prompt;
      A.pendingFill = p.prompt;
      A.pendingKnow = p.know || null;
      grow();
      return selectDots();
    }
    send({ prompt: p.prompt, title: p.title, kind: p.kind, target: p.target, know: p.know });
  }

  function send({ prompt, title, kind, target, know }) {
    if (A.run) return;
    const c = A.cfg || {};
    if (c.error && c.reason === 'owner') return toast(c.error);
    // الترجمة: نصٌّ كُتب (منفصل)، أو المحدَّد أو الفصل أو الكتاب
    if (kind === 'translate') {
      const tt = target === 'free' || A.mode === 'free' ? 'free' : target || tgt();
      if (tt !== 'free' && !st.view) return toast('افتح كتاباً أولاً');
      if (tt === 'sel' && !selUnits().length) return toast('حدّد نصاً في الصفحة');
      if (tt === 'free' && (!prompt || title)) return toast('اكتب النص الذي تريد ترجمته');
      pushItem({ role: 'user', id: ++A.seq, text: prompt, title: tt === 'free' ? '' : title || 'ترجم', where: tt === 'free' ? 'ترجمة إلى ' + langName(trNow().to) : whereLabel(tt) + ' ← ' + langName(trNow().to) });
      return runTranslate({ t: tt, text: tt === 'free' ? prompt : '' });
    }
    if (!st.view && A.mode !== 'free') return toast('افتح كتاباً أولاً');
    const t = target || tgt();
    kind = A.mode === 'free' ? 'plain' : kind || 'answer';
    if (t === 'sel' && !selUnits().length) return toast('حدّد نصاً في الصفحة');
    A.nextKnow = know || '';
    const userItem = { role: 'user', id: ++A.seq, text: prompt, title, where: whereLabel(t) };
    pushItem(userItem);
    // ما يكتبه المستخدم بنفسه (وما كان من التوجيهات «جواباً وتغييرات»): اللغة المفتوحة
    if (kind === 'edit' || (!title && kind === 'answer')) return runEdit({ prompt, t, title });
    if (kind === 'plain' || (kind === 'answer' && (t === 'sel' || t === 'section' || t === 'book'))) return runAnswer({ prompt, kind, t, title });
    if (kind === 'fix') return t === 'sel' ? runFix({ prompt, title }) : runFixRange({ prompt, t, title });
    if (kind === 'review') return runReview({ prompt, t, title });
    if (kind === 'structure') return runStructure({ prompt, t, title });
    if (kind === 'roles') return runRoles({ prompt, t, title });
    if (kind === 'units') return runUnits({ prompt, t, title });
    if (kind === 'mhints') return runHints({ prompt, t, title });
    return runAnswer({ prompt, kind: 'answer', t, title });
  }
  function whereLabel(t) {
    if (t === 'free') return 'منفصل';
    if (t === 'sel') return describe(st.sel).name;
    return rangeOf(t).name;
  }

  /** طلبٌ واحد إلى الخادم (يُلغى بالإيقاف) */
  async function call(body, ctl) {
    return api('/api/admin/ai/run', { method: 'POST', body: { scope: 'editor', ...body }, signal: ctl.signal });
  }
  function begin(item) {
    const ctl = new AbortController();
    A.run = { ctl, item };
    paintSend();
    return ctl;
  }
  function end() {
    A.run = null;
    paintSend();
  }
  function stop() {
    if (!A.run) return;
    A.run.ctl.abort();
    const it = A.run.item;
    A.run = null;
    if (it) {
      it.stopped = true;
      if (it.type === 'pending') Object.assign(it, { type: 'error', error: 'أُوقف الطلب' });
      paintItem(it);
    }
    paintSend();
  }
  const failItem = (it, e) => {
    if (e && e.name === 'AbortError') return;
    Object.assign(it, { type: 'error', error: e.message || String(e), reason: e.reason || '', trail: e.trail || [] });
    paintItem(it);
  };

  /* ---- جوابٌ يُقرأ (ومنفصل) ---- */
  async function runAnswer({ prompt, kind, t }) {
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'pending', label: 'يكتب…' });
    const ctl = begin(it);
    let user = prompt;
    let units = [];
    if (kind !== 'plain') {
      if (t === 'sel') {
        units = selUnits();
        const sel = st.sel;
        const text = units.length > 1 ? units.map((u) => `(${u.role}) ${u.text}`).join('\n\n') : units[0].text;
        user = [...selHead(sel, units), '', '[النص]', '<<<', text.slice(0, 40000), '>>>', ...marksBlock(units, 4000), '', '[التوجيه] ' + prompt].join('\n');
        it.sel = units.length === 1 ? { unit: units[0] } : null;
      } else if (t === 'section') {
        const r = rangeOf('section');
        user = [...bookHead(), `[الفصل] ${r.name}`, '', '[نص الفصل]', rangeText(r.a, r.b, 30000), ...marksBlock(rangeUnits(r.a, r.b), 6000).map((l) => l.replace(/^\[\d+\] /, '- ')), '', '[التوجيه] ' + prompt].join('\n');
      } else {
        const r = rangeOf('book');
        const toc = tocOf(r.a, r.b);
        user = [...bookHead(), '', '[فهرسه]', toc || '(لا عناوين)', '', '[أوله]', rangeText(r.a, r.b, toc.length > 8000 ? 8000 : 16000), '', '[التوجيه] ' + prompt].join('\n');
      }
    }
    const mode = kind === 'plain' ? 'free' : 'linked';
    const know = knowFor({ kind, t: kind === 'plain' ? 'free' : t, prompt, units });
    if (know) Object.assign(it, { label: 'يبحث في مصادر العلم ثم يكتب…' }), paintItem(it);
    try {
      const r = await call({ kind, user, history: A.hist[mode].slice(-6), tag: cut(prompt, 30), ...(know ? { know } : {}) }, ctl);
      A.hist[mode].push({ role: 'user', content: user.slice(0, 12000) }, { role: 'assistant', content: r.text.slice(0, 12000) });
      if (A.hist[mode].length > 12) A.hist[mode] = A.hist[mode].slice(-12);
      Object.assign(it, { type: 'answer', text: r.text, provider: r.provider, model: r.model, ms: r.ms, sources: r.sources || null, know: r.know || null });
      paintItem(it);
    } catch (e) {
      failItem(it, e);
    } finally {
      if (A.run && A.run.item === it) end();
    }
  }

  /* ---- تصحيحٌ يُقارن ويُستبدل ---- */
  async function runFix({ prompt }) {
    const units = selUnits();
    const capped = [];
    let n = 0;
    for (const u of units) {
      if (capped.length >= 40 || n + u.text.length > 16000) break;
      capped.push(u);
      n += u.text.length;
    }
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'pending', label: capped.length > 1 ? `يراجع ${cnt(capped.length, 'فقرة')}…` : 'يراجع النص…' });
    const ctl = begin(it);
    const user = [...selHead(st.sel, capped), '', '[التوجيه] ' + prompt, '', '[الفقرات]', itemsJson(capped)].join('\n');
    const know = knowFor({ kind: 'fix', t: 'sel', prompt, units: capped });
    try {
      const r = await call({ kind: 'fix', user, tag: cut(prompt, 30), ...(know ? { know } : {}) }, ctl);
      const got = (r.data && Array.isArray(r.data.items) ? r.data.items : []).filter((x) => x && x.id != null && typeof x.text === 'string');
      const rows = [];
      for (const u of capped) {
        const g = got.find((x) => String(x.id) === u.id);
        if (!g) continue;
        const neu = cleanOut(g.text, u);
        if (neu === u.text) continue;
        rows.push({ u, neu, notes: (Array.isArray(g.notes) ? g.notes : []).map(String).filter(Boolean).slice(0, 8), state: 'new' });
      }
      Object.assign(it, { type: 'fix', rows, more: units.length - capped.length, provider: r.provider, model: r.model, ms: r.ms, view: 'diff' });
      paintItem(it);
    } catch (e) {
      failItem(it, e);
    } finally {
      if (A.run && A.run.item === it) end();
    }
  }
  /* ---- تصحيحٌ يُستبدل في الفصل أو المجلد (التشكيل مثلاً): فقراتٌ دفعةً بعد دفعة، ثم «استبدل الكل» ---- */
  async function runFixRange({ prompt, t }) {
    const r = rangeOf(t);
    const units = rangeUnits(r.a, r.b).filter((u) => u.text.trim());
    if (!units.length) return toast('لا نص في ' + r.name);
    const parts = batches(units, 2400, 14);
    const chars = units.reduce((n, u) => n + u.text.length, 0);
    if (parts.length > BIG() && !(await askGo(`سيُرسل ${r.name} (نحو ${ar(Math.max(100, Math.round(chars / 100) * 100))} حرف) دفعةً بعد دفعة: ${ar(parts.length)} طلباً، ويعود كل نصٍّ مصحَّحاً لتراه وتستبدله. قد يطول، وكل طلبٍ من حصة مفتاحك.`))) return;
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'fix', rows: [], more: 0, running: true, done: 0, total: parts.length, range: r.name, view: 'diff', ms: 0 });
    const ctl = begin(it);
    paintItem(it);
    for (let k = 0; k < parts.length; k++) {
      if (ctl.signal.aborted) break;
      const part = parts[k];
      const user = [...bookHead(), `[الموضع] ${r.name}`, ...(parts.length > 1 ? [`[الدفعة] ${ar(k + 1)} من ${ar(parts.length)}`] : []), '', '[التوجيه] ' + prompt, '', '[الفقرات]', itemsJson(part)].join('\n');
      try {
        const res = await call({ kind: 'fix', user, tag: cut(prompt, 30) }, ctl);
        const got = (res.data && Array.isArray(res.data.items) ? res.data.items : []).filter((x) => x && x.id != null && typeof x.text === 'string');
        for (const u of part) {
          const g = got.find((x) => String(x.id) === u.id);
          if (!g) continue;
          const neu = cleanOut(g.text, u);
          if (neu === u.text) continue;
          it.rows.push({ u, neu, notes: (Array.isArray(g.notes) ? g.notes : []).map(String).filter(Boolean).slice(0, 6), state: 'new' });
        }
        Object.assign(it, { provider: res.provider, model: res.model });
        it.ms += res.ms || 0;
      } catch (e) {
        if (e.name === 'AbortError') break;
        Object.assign(it, { error: e.message, reason: e.reason, trail: e.trail });
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.running = false;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  /** نص النموذج: بلا علامات فقرة ولا اقتباسٍ أحاط به كله */
  function cleanOut(s, u) {
    let t = String(s || '').replace(/\r/g, '').replace(/\u2029/g, ' ');
    if (!u.verse) t = t.replace(/\n+/g, ' ');
    // حذف الاقتباس المحيط إن لم يكن في الأصل
    const q = /^«([\s\S]*)»$/.exec(t.trim());
    if (q && !/^«[\s\S]*»$/.test(u.text.trim())) t = q[1];
    // المسافات في الطرفين كما في الأصل
    const lead = (u.text.match(/^\s*/) || [''])[0];
    const tail = (u.text.match(/\s*$/) || [''])[0];
    return lead + t.trim() + tail;
  }
  const splitVerseText = (s) => {
    const p = String(s).split(/\s*(?:…|\.\.\.|\*\*\*)\s*/).filter((x) => x.trim());
    return p.length === 2 ? p.map((x) => x.trim()) : null;
  };
  /* ---- ما يعيده النموذج لموضعٍ صغير (كلمةٍ في بيت) قد يكون الموضعَ كله مصحّحاً: البيت أو شطره ---- */
  const WORDS = (t) => String(t || '').replace(/[\u064B-\u065F\u0670\u0640]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  /** كم من كلمات a في b (نسبةً إلى a) */
  const share = (a, b) => {
    const A = WORDS(a);
    if (!A.length) return 0;
    const B = new Set(WORDS(b));
    return A.filter((w) => B.has(w)).length / A.length;
  };
  /** حدود الشطر الذي فيه الموضع (في نص البيت «الصدر … العجز») */
  const hemiAround = (full, at) => {
    const k = full.indexOf(' … ');
    if (k < 0) return null;
    return at < k ? [0, k] : [k + 3, full.length];
  };
  /**
   * النص كله بعد وضع neu مكان [from, to): فإن كان neu قد أعاد ما حول الموضع (البيت كله أو شطره) مصحّحاً،
   * وُضع مكان ذلك لا مكان الكلمة — فلا يدخل البيت في كلمته.
   */
  function fitPart(full, from, to, neu) {
    if (from <= 0 && to >= full.length) return neu;
    neu = String(neu);
    const outside = full.slice(0, from) + ' ' + full.slice(to);
    // البيت كله (أو فيه فاصل الشطرين): النص كله
    if (/ (?:…|\.{3}) /.test(neu) && !/ (?:…|\.{3}) /.test(full.slice(from, to))) return neu.replace(/ \.{3} /, ' … ');
    if (WORDS(outside).length >= 3 && share(outside, neu) >= 0.6) return neu;
    // الشطر الذي فيه الموضع
    const h = hemiAround(full, from);
    if (h && to <= h[1]) {
      const ctx = full.slice(h[0], from) + ' ' + full.slice(to, h[1]);
      if (WORDS(ctx).length >= 2 && share(ctx, neu) >= 0.6) return full.slice(0, h[0]) + neu.trim() + full.slice(h[1]);
    }
    return full.slice(0, from) + neu + full.slice(to);
  }
  /** عمليةُ استبدال وحدةٍ بنصٍّ جديد ← { op } أو { err } */
  function opFor(u, neu) {
    const node = nodeOf(u.t);
    if (!node) return { err: 'لم يُعثر على موضعه' };
    const full = textOf(node);
    if (full.slice(u.from, u.to) !== u.text) return { err: 'تغيّر النص منذ الطلب' };
    if (node.type === 'verse') {
      const parts = splitVerseText(fitPart(full, u.from, u.to, neu));
      if (!parts) return { err: 'البيت لم يعد شطرين' };
      return { op: { op: 'edit', t: u.t, sig: sigOf(node), parts }, old: full, neu: parts.join(' … ') };
    }
    const ch = diffText(u.text, neu).map((c) => ({ a: c.a + u.from, z: c.z + u.from, s: c.s }));
    if (!ch.length) return { same: true };
    const after = full.slice(0, u.from) + neu + full.slice(u.to);
    return { op: { op: 'edit', t: u.t, sig: sigOf(node), ch }, old: full, neu: after, ch };
  }
  const around = (s, a, z) => {
    let x = a;
    let y = z;
    while (x > 0 && a - x < 24 && !/\s/.test(s[x - 1])) x--;
    while (y < s.length && y - z < 24 && !/\s/.test(s[y])) y++;
    return s.slice(x, y).trim();
  };
  /** تطبيق عمليات (واحدة أو دفعة) بملاحظةٍ لجدول الخطأ والصواب */
  function applyOps(list, keepSel) {
    const ok = list.filter((x) => x.op);
    if (!ok.length) return 0;
    const f = ok[0];
    let note;
    if (f.ch && f.ch.length) {
      const c = f.ch[0];
      note = { kind: 'parts', old: cut(around(f.old, c.a, c.z), 40) || '—', new: cut(around(f.neu, c.a, c.a + c.s.length), 40) || '—', ai: true };
    } else note = { kind: 'parts', old: cut(f.old, 40), new: cut(f.neu, 40), ai: true };
    const count = ok.reduce((n, x) => n + (x.ch ? x.ch.length : 1), 0);
    if (count > 1) note.count = count;
    if (keepSel) st.sel = keepSel;
    commit(ok.length === 1 ? ok[0].op : { op: 'batch', vol: st.vol, ops: ok.map((x) => x.op) }, note);
    return ok.length;
  }

  /* ---- مراجعة فقرات كثيرة: دفعةً بعد دفعة ---- */
  function batches(units, maxChars = 5200, maxUnits = 40) {
    const out = [];
    let cur = [];
    let n = 0;
    for (const u of units) {
      const len = Math.min(u.text.length, 6000);
      if (cur.length && (n + len > maxChars || cur.length >= maxUnits)) out.push(cur), (cur = []), (n = 0);
      cur.push(u);
      n += len;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  /** عملٌ كبير (دفعات كثيرة): يُستأذن قبله، فهو يطول ويُحسب من حصة المفتاح */
  function askGo(text) {
    return new Promise((resolve) => pushItem({ role: 'ai', id: ++A.seq, type: 'ask', text, resolve }));
  }
  const BIG = () => +LS('warraq.ai.big') || 12; // (ما فوقه من الدفعات يُستأذن له)
  async function runReview({ prompt, t }) {
    const r = rangeOf(t);
    const units = rangeUnits(r.a, r.b);
    const parts = batches(units);
    if (parts.length > BIG()) {
      const chars = units.reduce((n, u) => n + u.text.length, 0);
      if (!(await askGo(`سيُراجَع ${r.name} دفعةً بعد دفعة (الدفعات: ${ar(parts.length)}، والحروف نحو ${ar(Math.max(100, Math.round(chars / 100) * 100))}). قد يطول، وكل دفعةٍ طلبٌ من حصة مفتاحك.`))) return;
    }
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'review', issues: [], done: 0, total: parts.length, units: units.length, running: true, range: r.name, failed: 0 });
    const ctl = begin(it);
    const head = [...bookHead(), `[الموضع] ${r.name}`, '', '[التوجيه] ' + prompt, '', '[الفقرات]'];
    const seen = new Set();
    let lastErr = null;
    paintItem(it);
    for (const part of parts) {
      if (ctl.signal.aborted) break;
      try {
        const res = await call({ kind: 'review', user: [...head, itemsJson(part, 6000)].join('\n'), tag: cut(prompt, 24) }, ctl);
        it.provider = res.provider;
        it.model = res.model;
        for (const x of (res.data && Array.isArray(res.data.issues) ? res.data.issues : []).slice(0, 80)) {
          const u = part.find((p) => p.id === String(x && x.id));
          const iss = u && locateIssue(u, x);
          if (!iss) continue;
          const key = u.id + '|' + iss.at + '|' + iss.repl;
          if (seen.has(key)) continue;
          seen.add(key);
          it.issues.push(iss);
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        it.failed++;
        lastErr = e;
        // انقطاع السلسلة كلها (لا مفتاح، أو كلهم فشلوا مرتين): يُوقف
        if (e.reason === 'no-key' || e.reason === 'disabled' || e.reason === 'owner' || it.failed >= 2) {
          it.error = e.message;
          it.reason = e.reason;
          it.trail = e.trail;
          break;
        }
      }
      it.done++;
      paintItem(it);
    }
    it.running = false;
    if (!it.issues.length && lastErr && !it.error) it.error = lastErr.message;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  /** موضع الخطأ في فقرته (حرفياً، وإلا بتجاهل التشكيل) */
  function locateIssue(u, x) {
    const find = String(x.find || '');
    const repl = String(x.repl == null ? '' : x.repl);
    if (!find.trim() || find === repl) return null;
    let at = u.text.indexOf(find);
    let orig = find;
    if (at < 0) {
      const m = findRegex(find.trim(), { marks: true }).exec(u.text);
      if (!m) return null;
      at = m.index;
      orig = m[0];
    }
    // ما أعاده النموذج أوسع من الخطأ (البيت أو شطره كله): يضيق إلى الكلمة التي تغيّرت
    let fix = { at, orig, repl };
    const after = fitPart(u.text, at, at + orig.length, repl);
    const ch = diffText(u.text, after);
    if (ch.length === 1 && repl.length > orig.length + 6) {
      const c = ch[0];
      let a = c.a;
      let z = c.z;
      while (a > 0 && !/\s/.test(u.text[a - 1])) a--;
      while (z < u.text.length && !/\s/.test(u.text[z])) z++;
      const d = after.length - u.text.length;
      const o2 = u.text.slice(a, z);
      if (o2.trim()) fix = { at: a, orig: o2, repl: after.slice(a, z + d) };
    } else if (!ch.length) return null;
    return { u, ...fix, why: String(x.why || '').slice(0, 300), type: String(x.type || '').slice(0, 20), state: 'new' };
  }
  /** النص الحالي للفقرة، وموضع الخطأ فيه الآن */
  function issueNow(iss) {
    const node = nodeOf(iss.u.t);
    if (!isText(node)) return null;
    const full = textOf(node);
    let at = full.slice(iss.at, iss.at + iss.orig.length) === iss.orig ? iss.at : -1;
    if (at < 0) {
      let best = -1;
      for (let j = full.indexOf(iss.orig); j >= 0; j = full.indexOf(iss.orig, j + 1)) if (best < 0 || Math.abs(j - iss.at) < Math.abs(best - iss.at)) best = j;
      at = best;
    }
    return at < 0 ? null : { full, at };
  }
  function applyIssues(list) {
    // الأخطاء في فقرةٍ واحدة تُجمع، من آخرها إلى أولها
    const by = new Map();
    for (const iss of list) {
      const k = JSON.stringify(iss.u.t);
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(iss);
    }
    const ops = [];
    let missed = 0;
    for (const group of by.values()) {
      const now = group.map((iss) => ({ iss, n: issueNow(iss) })).filter((x) => x.n || (missed++, (x.iss.state = 'gone'), false));
      if (!now.length) continue;
      const full = now[0].n.full;
      now.sort((a, b) => b.n.at - a.n.at);
      let s = full;
      let lastAt = Infinity;
      const used = [];
      for (const { iss, n } of now) {
        if (n.at + iss.orig.length > lastAt) continue; // متداخل
        s = fitPart(s, n.at, n.at + iss.orig.length, iss.repl);
        lastAt = n.at;
        used.push(iss);
      }
      const u = { t: group[0].u.t, from: 0, to: full.length, text: full, verse: group[0].u.verse };
      const r = opFor(u, s);
      if (r.op) {
        ops.push(r);
        for (const iss of used) iss.state = 'done';
      } else if (r.err) for (const iss of used) iss.state = 'gone';
    }
    const n = applyOps(ops);
    if (missed) toast(`تعذّر ${N(missed)}: تغيّر نصه`);
    return n;
  }
  const N = (n) => (n === 1 ? 'موضعٍ واحد' : n === 2 ? 'موضعين' : `${ar(n)} مواضع`);

  /* ---- العناوين: من مقاس الخط وشكله وترتيبه ---- */
  const KEYS = /^(?:ال)?(?:كتاب|باب|فصل|مبحث|مطلب|مسألة|مسائل|فرع|تنبيه|تنبيهات|فائدة|فوائد|مقدمة|المقدمة|خاتمة|تمهيد|قاعدة|ضابط|تتمة|خلاصة|الباب|الفصل|القسم|قسم|الجزء|المبحث|المطلب|المسألة)\b/;
  function featOf(b) {
    const txt = textOf(b).trim();
    if (b.type === 'heading') return { h: b.level || 2, len: txt.length };
    const runs = (b.runs || []).filter((r) => r.k !== 'r' && (r.s || '').trim());
    const size = new Map();
    const color = new Map();
    let bold = runs.length > 0;
    for (const r of runs) {
      const n = (r.s || '').length;
      const s = (r.st && r.st.size) || 1;
      size.set(s, (size.get(s) || 0) + n);
      if (r.st && r.st.color) color.set(r.st.color, (color.get(r.st.color) || 0) + n);
      if (!(r.st && r.st.bold) && r.k !== 'ht') bold = false;
    }
    const top = (m) => [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    const fz = b.fz || (top(size) || [1])[0];
    const col = top(color);
    const al = b.al || (b.ps && b.ps.al) || '';
    return { len: txt.length, ...(fz && Math.abs(fz - 1) >= 0.05 ? { fz: Math.round(fz * 100) / 100 } : {}), ...(bold ? { b: 1 } : {}), ...(al ? { al } : {}), ...(col && col[1] >= txt.length * 0.6 ? { color: col[0] } : {}) };
  }
  function candidates(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) {
      const blk = st.view.blocks[i];
      if (!blk) continue;
      if (blk.type === 'heading') {
        out.push(i);
        continue;
      }
      if (blk.type !== 'para') continue;
      const txt = textOf(blk).trim();
      if (!txt || txt.length > 150) continue;
      const f = featOf(blk);
      const nextLong = (() => {
        const n = st.view.blocks[i + 1];
        return n && textOf(n).trim().length > txt.length * 1.5;
      })();
      if ((f.fz && f.fz >= 1.08) || f.b || f.al === 'c' || KEYS.test(txt) || (txt.length <= 60 && nextLong && !/[.:،؛]$/.test(txt))) out.push(i);
    }
    return out;
  }
  async function runStructure({ prompt, t }) {
    const r = rangeOf(t);
    const ids = candidates(r.a, r.b);
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'structure', rows: [], done: 0, total: 0, running: true, range: r.name, cands: ids.length });
    if (!ids.length) {
      Object.assign(it, { running: false, empty: true });
      return paintItem(it);
    }
    const parts = [];
    for (let k = 0; k < ids.length; k += 150) parts.push(ids.slice(k, k + 150));
    it.total = parts.length;
    const ctl = begin(it);
    paintItem(it);
    let n = 0;
    for (const part of parts) {
      if (ctl.signal.aborted) break;
      const map = new Map();
      const lines = part.map((i) => {
        const id = String(++n);
        map.set(id, i);
        const blk = st.view.blocks[i];
        const prev = textOf(st.view.blocks[i - 1] || {}).trim();
        const next = textOf(st.view.blocks[i + 1] || {}).trim();
        return JSON.stringify({ id, text: cut(textOf(blk).trim(), 150), ...featOf(blk), prev: cut(prev, 40), next: cut(next, 40) });
      });
      try {
        const res = await call({ kind: 'structure', user: [...bookHead(), `[الموضع] ${r.name}`, '', '[التوجيه] ' + prompt, '', '[المرشّحات]', '[\n' + lines.join(',\n') + '\n]'].join('\n'), tag: 'العناوين' }, ctl);
        it.provider = res.provider;
        it.model = res.model;
        const d = res.data || {};
        const not = new Set((Array.isArray(d.notHeadings) ? d.notHeadings : []).map(String));
        for (const x of Array.isArray(d.headings) ? d.headings : []) {
          const i = map.get(String(x && x.id));
          const lv = Math.max(1, Math.min(4, Math.round(+x.level) || 2));
          if (i == null) continue;
          const blk = st.view.blocks[i];
          if (blk.type === 'heading' && blk.level === lv) continue;
          it.rows.push({ i, sig: sigOf(blk), text: textOf(blk).trim(), from: blk.type === 'heading' ? levelName(blk.level) : 'فقرة', level: lv, why: String(x.why || '').slice(0, 200), on: true });
        }
        for (const id of not) {
          const i = map.get(id);
          const blk = i != null && st.view.blocks[i];
          if (!blk || blk.type !== 'heading') continue;
          it.rows.push({ i, sig: sigOf(blk), text: textOf(blk).trim(), from: levelName(blk.level), level: 0, why: 'ليس عنواناً', on: true });
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        it.error = e.message;
        it.reason = e.reason;
        it.trail = e.trail;
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.rows.sort((x, y) => x.i - y.i);
    it.running = false;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  function applyStructure(it) {
    const ops = [];
    let gone = 0;
    for (const r of it.rows) {
      if (!r.on || r.state === 'done') continue;
      const blk = st.view.blocks[r.i];
      if (!blk || sigOf(blk) !== r.sig) {
        gone++;
        continue;
      }
      ops.push(r.level ? { op: 'kind', t: { vol: st.vol, b: r.i }, sig: r.sig, kind: 'heading', level: r.level } : { op: 'kind', t: { vol: st.vol, b: r.i }, sig: r.sig, kind: 'text' });
      r.state = 'done';
    }
    if (!ops.length) return toast(gone ? 'تغيّرت هذه المواضع منذ الطلب' : 'لا شيء محدَّد');
    const f = it.rows.find((r) => r.state === 'done');
    commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: f.from, to: f.level ? `عنوان: ${levelName(f.level)}` : 'فقرة', text: f.text, count: ops.length });
    // (العنوان يغيّر الفصول: تُعاد مواضعها)
    for (const r of it.rows) if (r.state === 'done') r.sig = sigOf(st.view.blocks[r.i] || {});
    paintItem(it);
    toast(ops.length === 1 ? 'عُلّم' : `عُلّم ${cnt(ops.length, 'موضع')}`);
  }

  /* ---- المتن من الشرح ---- */
  async function runRoles({ prompt, t }) {
    const r = rangeOf(t);
    const ids = [];
    for (let i = r.a; i <= r.b; i++) {
      const b = st.view.blocks[i];
      if (b && (b.type === 'para' || b.type === 'verse') && textOf(b).trim()) ids.push(i);
    }
    const parts = [];
    for (let k = 0; k < ids.length; k += 60) parts.push(ids.slice(k, k + 60));
    if (parts.length > BIG() && !(await askGo(`سيُنظر في فقرات ${r.name} دفعةً بعد دفعة (الفقرات: ${ar(ids.length)}، والدفعات: ${ar(parts.length)}). قد يطول، وكل دفعةٍ طلبٌ من حصة مفتاحك.`))) return;
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'roles', rows: [], done: 0, total: parts.length, running: true, range: r.name });
    if (!ids.length) {
      Object.assign(it, { running: false, empty: true });
      return paintItem(it);
    }
    const ctl = begin(it);
    paintItem(it);
    let n = 0;
    for (const part of parts) {
      if (ctl.signal.aborted) break;
      const map = new Map();
      const lines = part.map((i) => {
        const id = String(++n);
        map.set(id, i);
        const t2 = textOf(st.view.blocks[i]).trim();
        return JSON.stringify({ id, len: t2.length, text: t2.length > 240 ? t2.slice(0, 200) + ' … ' + t2.slice(-40) : t2 });
      });
      try {
        const res = await call({ kind: 'roles', user: [...bookHead(), `[الموضع] ${r.name}`, '', '[التوجيه] ' + prompt, '', '[الفقرات]', '[\n' + lines.join(',\n') + '\n]'].join('\n'), tag: 'المتن والشرح' }, ctl);
        it.provider = res.provider;
        it.model = res.model;
        const matn = new Set((res.data && Array.isArray(res.data.matn) ? res.data.matn : []).map(String));
        for (const [id, i] of map) {
          const blk = st.view.blocks[i];
          const want = matn.has(id);
          const cur = roleOf(blk) === 'matn';
          if (want !== cur) it.rows.push({ i, sig: sigOf(blk), text: textOf(blk).trim(), to: want ? 'matn' : 'text', on: true });
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        it.error = e.message;
        it.reason = e.reason;
        it.trail = e.trail;
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.running = false;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  function applyRoles(it) {
    const ops = [];
    for (const r of it.rows) {
      if (!r.on || r.state === 'done') continue;
      const blk = st.view.blocks[r.i];
      if (!blk || sigOf(blk) !== r.sig) continue;
      ops.push({ op: 'kind', t: { vol: st.vol, b: r.i }, sig: r.sig, kind: r.to });
      r.state = 'done';
    }
    if (!ops.length) return toast('لا شيء محدَّد');
    const toM = it.rows.filter((r) => r.state === 'done' && r.to === 'matn').length;
    commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'kind', from: toM ? roleName('sharh') : 'المتن', to: toM ? 'متن' : roleName('sharh'), text: it.rows.find((r) => r.state === 'done').text, count: ops.length });
    paintItem(it);
  }

  /* ================================================================ المتون: الأجزاء، ورؤوس المسائل */
  // تقسيم المتن أجزاءً للتعليق (وحدات معنى تامة، بعناوينها)؛ ورؤوس مسائل تُكتب خفيفةً على سطور التعليق.
  // ما يُطبَّق منهما عملياتٌ من عمليات المحرِّر (op: 'mu')، فيُرجع عنه ويُحفظ مع الكتاب.
  const muList = () => (st.mu && st.mu.doc && st.mu.doc.list) || [];
  const muOwn = (i) => ((st.view.blocks[i] || {}).mu || {});
  /** مدى العمل: المحدَّد، أو الفصل، أو الكتاب ← [أول، آخر] */
  function muRange(t) {
    if (t === 'sel' && st.sel) {
      if (st.sel.level === 'mc') {
        const u = muList()[st.sel.k];
        const nx = muList()[st.sel.k + 1];
        return u && u.ui != null ? { a: u.ui, b: nx && nx.ui != null ? nx.ui - 1 : st.view.blocks.length - 1, name: 'هذا الجزء' } : null;
      }
      const bl = st.sel.blocks || (st.sel.t && st.sel.t.b != null ? [st.sel.t.b] : []);
      if (bl.length) return { a: Math.min(...bl), b: Math.max(...bl), name: describe(st.sel).name };
    }
    return rangeOf(t === 'sel' ? 'section' : t);
  }
  async function runUnits({ prompt, t }) {
    const r = muRange(t);
    const ids = [];
    for (let i = r.a; i <= r.b; i++) {
      const b = st.view.blocks[i];
      if (b && (b.type === 'heading' || b.type === 'verse' || b.type === 'para') && textOf(b).trim()) ids.push(i);
    }
    const parts = [];
    for (let k = 0; k < ids.length; k += 220) parts.push(ids.slice(k, k + 220));
    if (parts.length > BIG() && !(await askGo(`سيُقسم ${r.name} دفعةً بعد دفعة (القطع: ${ar(ids.length)}، والدفعات: ${ar(parts.length)}).`))) return;
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'units', rows: [], done: 0, total: parts.length, running: true, range: r.name, a: r.a, b: r.b });
    if (!ids.length) {
      Object.assign(it, { running: false, empty: true });
      return paintItem(it);
    }
    const ctl = begin(it);
    paintItem(it);
    const starts = new Map();
    for (const part of parts) {
      if (ctl.signal.aborted) break;
      const lines = part.map((i) => {
        const b = st.view.blocks[i];
        return JSON.stringify({ id: String(i), k: b.type === 'heading' ? 'عنوان' + ar(b.level || 1) : b.type === 'verse' ? 'بيت' : 'فقرة', t: cut(textOf(b).trim(), 220) });
      });
      try {
        const res = await call({ kind: 'units', user: [...bookHead(), `[الموضع] ${r.name}`, '', '[التوجيه] ' + prompt, '', '[القطع]', '[\n' + lines.join(',\n') + '\n]'].join('\n'), tag: 'أجزاء المتن' }, ctl);
        it.provider = res.provider;
        it.model = res.model;
        const d = res.data || {};
        for (const x of Array.isArray(d.parts) ? d.parts : []) {
          const i = +String((x && x.start) || '').replace(/[^0-9]/g, '');
          if (!part.includes(i)) continue;
          starts.set(i, String(x.title || '').replace(/\s+/g, ' ').trim().slice(0, 80));
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        Object.assign(it, { error: e.message, reason: e.reason, trail: e.trail });
        break;
      }
      it.done++;
      paintItem(it);
    }
    const ss = [...starts.keys()].sort((x, y) => x - y);
    if (ss.length && ss[0] !== ids[0]) ss.unshift(ids[0]), starts.set(ids[0], starts.get(ids[0]) || '');
    it.rows = ss.map((i, k) => {
      const end = k + 1 < ss.length ? ss[k + 1] - 1 : r.b;
      const n = st.view.blocks.slice(i, end + 1).filter((b) => b.type === 'verse' || b.type === 'para').length;
      return { i, sig: sigOf(st.view.blocks[i]), title: starts.get(i) || '', gist: cut(textOf(st.view.blocks[i]).trim(), 60), n, verse: st.view.blocks.slice(i, end + 1).some((b) => b.type === 'verse') };
    });
    it.running = false;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  function applyUnits(it, labels) {
    const ops = [];
    const at = new Set(it.rows.map((r) => r.i));
    // ما كان محدَّداً قبلُ في المدى يُزال، وتبدأ الأجزاء حيث قُسمت
    for (let i = it.a; i <= it.b; i++) {
      const mu = muOwn(i);
      if ((mu.cut || mu.join) && !at.has(i)) ops.push({ op: 'mu', t: { vol: st.vol, b: i }, sig: sigOf(st.view.blocks[i]), set: { cut: null, join: null } });
    }
    for (const r of it.rows) {
      const blk = st.view.blocks[r.i];
      if (!blk || sigOf(blk) !== r.sig) continue;
      const set = { cut: 1, join: null };
      if (labels && r.title) set.c = { ...(muOwn(r.i).c || {}), label: r.title };
      ops.push({ op: 'mu', t: { vol: st.vol, b: r.i }, sig: r.sig, set });
    }
    if (!ops.length) return toast('لا شيء يُطبَّق');
    it.applied = labels ? 'labels' : 'plain';
    commit({ op: 'batch', vol: st.vol, ops }, { kind: 'style', to: `${ar(it.rows.length)} أجزاء${labels ? ' بعناوينها' : ''}`, text: it.rows[0].gist, count: it.rows.length });
    paintItem(it);
  }
  /** رؤوس مسائل: لأجزاء المدى (أو لجزءٍ بعينه) */
  async function runHints({ prompt, t, unit }) {
    const L = muList();
    if (!L.length) return toast('لا أجزاء بعد: ضع المتن على المنضدة متناً للتعليق');
    let units;
    let name;
    if (unit) {
      units = [unit];
      name = 'هذا الجزء';
    } else {
      const r = muRange(t);
      name = r.name;
      units = L.filter((u) => u.ui != null && u.ui >= r.a && u.ui <= r.b);
      if (!units.length && t === 'sel') {
        const u = [...L].reverse().find((x) => x.ui != null && x.ui <= r.a);
        if (u) units = [u];
      }
    }
    const textOfUnit = (u) => {
      const nx = L[u.k + 1];
      const z = nx && nx.ui != null ? nx.ui - 1 : st.view.blocks.length - 1;
      return st.view.blocks
        .slice(u.ui, z + 1)
        .map((b) => textOf(b).trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 1600);
    };
    const parts = [];
    for (let k = 0; k < units.length; k += 10) parts.push(units.slice(k, k + 10));
    if (parts.length > BIG() && !(await askGo(`ستُكتب رؤوس مسائل لـ${ar(units.length)} جزءاً دفعةً بعد دفعة (${ar(parts.length)} دفعات).`))) return;
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'hints', rows: [], done: 0, total: parts.length, running: true, range: name });
    const ctl = begin(it);
    paintItem(it);
    for (const part of parts) {
      if (ctl.signal.aborted) break;
      const lines = part.map((u) => JSON.stringify({ id: 'u' + (u.k + 1), t: textOfUnit(u) }));
      try {
        const res = await call({ kind: 'mhints', user: [...bookHead(), `[الموضع] ${name}`, '', '[التوجيه] ' + prompt, '', '[الأجزاء]', '[\n' + lines.join(',\n') + '\n]'].join('\n'), tag: 'رؤوس المسائل' }, ctl);
        it.provider = res.provider;
        it.model = res.model;
        for (const x of Array.isArray((res.data || {}).units) ? res.data.units : []) {
          const k = +String((x && x.id) || '').replace(/[^0-9]/g, '') - 1;
          const u = part.find((y) => y.k === k);
          const hs = (Array.isArray(x.hints) ? x.hints : []).map((h2) => String(h2 || '').trim()).filter(Boolean).slice(0, 8);
          if (u && hs.length) it.rows.push({ k: u.k, ui: u.ui, sig: sigOf(st.view.blocks[u.ui]), gist: u.verses ? `البيت ${ar(u.verses[0])}–${ar(u.verses[1])}` : cut(u.gist, 40), hints: hs, on: true });
        }
      } catch (e) {
        if (e.name === 'AbortError') break;
        Object.assign(it, { error: e.message, reason: e.reason, trail: e.trail });
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.rows.sort((x, y) => x.k - y.k);
    it.running = false;
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  function applyHints(it) {
    const ops = [];
    for (const r of it.rows) {
      if (!r.on || r.state === 'done') continue;
      const blk = st.view.blocks[r.ui];
      if (!blk || sigOf(blk) !== r.sig) continue;
      ops.push({ op: 'mu', t: { vol: st.vol, b: r.ui }, sig: r.sig, set: { c: { ...(muOwn(r.ui).c || {}), hints: r.hints } } });
      r.state = 'done';
    }
    if (!ops.length) return toast('لا شيء محدَّد');
    commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: 'رؤوس مسائل في موضع التعليق', text: it.rows.find((r) => r.state === 'done').gist, count: ops.length });
    paintItem(it);
  }
  function unitsHtml(it) {
    if (it.empty) return `<div class="ai-bub ans"><p>لا قطع في ${esc(it.range)}.</p></div>`;
    const rows = it.rows.map((r, k) => `<li class="st-r" data-k="${k}"><button type="button" class="st-t" data-x="go"><b>${ar(k + 1)}. ${esc(r.title || r.gist)}</b><small>${esc(r.title ? r.gist : '')}${r.n ? ` · ${ar(r.n)} ${r.verse ? (r.n <= 10 ? 'أبيات' : 'بيتاً') : r.n <= 10 ? 'فقرات' : 'فقرة'}` : ''}</small></button></li>`).join('');
    const head = it.running ? '' : it.rows.length ? `<b>${ar(it.rows.length)} أجزاء في ${esc(it.range)}</b>` : it.error ? '' : `<b>لم يُقسم ${esc(it.range)}</b>`;
    return `<div class="ai-bub stb">${progress(it, 'يقسم المتن')}${head ? `<div class="fx-h">${head}</div>` : ''}${rows ? `<ol class="st-l">${rows}</ol>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}</div>
      <div class="ai-acts">${it.rows.length && !it.running ? (it.applied ? '<span class="fx-st ok">✓ طُبّق</span>' : '<button type="button" class="ai-btn pri" data-x="applyunits">طبّق التقسيم</button><button type="button" class="ai-btn" data-x="applyunitsl">وبعناوينها في مواضع التعليق</button>') : ''}${meta(it)}</div>`;
  }
  function hintsHtml(it) {
    const rows = it.rows
      .map(
        (r, k) => `<li class="st-r ${r.state || ''}" data-k="${k}">
          <label class="st-c"><input type="checkbox" data-x="on" ${r.on ? 'checked' : ''} ${r.state === 'done' ? 'disabled' : ''}></label>
          <button type="button" class="st-t" data-x="go"><b>الجزء ${ar(r.k + 1)} <small>${esc(r.gist)}</small></b><small>${r.hints.map((x, j) => `${ar(j + 1)}- ${esc(x)}`).join('<br>')}</small></button>
          ${r.state === 'done' ? '<span class="fx-st ok">✓</span>' : ''}
        </li>`,
      )
      .join('');
    const on = it.rows.filter((r) => r.on && r.state !== 'done').length;
    const head = it.running ? '' : it.rows.length ? `<b>رؤوس مسائل لـ${ar(it.rows.length)} ${it.rows.length <= 10 ? 'أجزاء' : 'جزءاً'}</b><small>تُكتب خفيفةً على سطور التعليق، وتعدّلها من موضع التعليق</small>` : it.error ? '' : '<b>لم يُكتب شيء</b>';
    return `<div class="ai-bub stb">${progress(it, 'يكتب رؤوس المسائل')}${head ? `<div class="fx-h col">${head}</div>` : ''}${rows ? `<ol class="st-l">${rows}</ol>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}</div>
      <div class="ai-acts">${on && !it.running ? `<button type="button" class="ai-btn pri" data-x="applyhints">ضعها في مواضع التعليق (${ar(on)})</button>` : ''}${meta(it)}</div>`;
  }

  /* ================================================================ لغةٌ مفتوحة: ما يُرسل، وما يُغيَّر */
  // يختار المستخدم ما يُرسل من الكتاب (الكتاب كله، أو الفهرس، أو العناوين، أو المتن، أو الشرح، أو الحاشية)
  // وما للمساعد أن يغيّره منه؛ فيكتب ما يريد بكلامه، ويردّ المساعد بجوابٍ ومعه كتلة تغييرات (lib/ai-editor.js ← PROTOCOL.edit)
  // يعرضها المحرِّر واحداً واحداً: يُقبل ما يُقبل ويُطبَّق بعمليات المحرِّر نفسها (يُرجع عنه، ويُكتب في جدول الخطأ والصواب).
  const CAT_ORDER = ['h', 'm', 's', 'f'];
  const catName = (c) => ({ all: 'الكتاب كله', toc: 'الفهرس', h: 'العناوين', m: 'المتن', s: roleName('sharh'), f: 'الحواشي', auto: 'مثل ما يُرسل', none: 'لا شيء', sel: 'المحدَّد' })[c] || c;
  const hasNotes = () => !!(st.view && st.view.notes && Object.keys(st.view.notes).length);
  const hasMatnNow = () => roleName('sharh') === 'الشرح';
  function ioPick(side, k) {
    const io = A.io;
    if (side === 'out' && (k === 'sel' || k === 'none') && tgt() === 'sel') io.sel = k;
    else if (side === 'in') {
      if (k === 'all') io.in = ['all'];
      else {
        const set = new Set(io.in.filter((x) => x !== 'all'));
        set.has(k) ? set.delete(k) : set.add(k);
        io.in = set.size ? [...set] : ['all'];
      }
    } else if (k === 'auto' || k === 'none' || k === 'all') io.out = [k];
    else {
      const set = new Set(io.out.filter((x) => !['auto', 'none', 'all'].includes(x)));
      set.has(k) ? set.delete(k) : set.add(k);
      io.out = set.size ? [...set] : ['auto'];
    }
    LS('warraq.ai.io', JSON.stringify(io));
  }
  /** ما يُرسل وما يُغيَّر الآن ← { inC:Set(toc,h,m,s,f), outC:Set(h,m,s,f | sel) } */
  function ioNow(t) {
    if (t === 'sel') return { inC: new Set(['sel']), outC: new Set(A.io.sel === 'none' ? [] : ['sel']) };
    const all = ['h', 'm', 's', 'f'];
    const inC = new Set(A.io.in.includes('all') ? all : A.io.in);
    let outC;
    if (A.io.out.includes('none')) outC = new Set();
    else if (A.io.out.includes('all')) outC = new Set(all);
    else if (A.io.out.includes('auto')) outC = new Set([...inC].map((c) => (c === 'toc' ? 'h' : c)));
    else outC = new Set(A.io.out);
    // ما يُغيَّر يُرسل (لا يُغيَّر ما لم يُرَ): العناوين يكفيها الفهرس
    for (const c of outC) if (c !== 'h' ? !inC.has(c) : !inC.has('h') && !inC.has('toc')) inC.add(c === 'h' ? 'toc' : c);
    return { inC, outC };
  }
  function ioHtml(t) {
    if (A.mode === 'free') return '';
    const chip = (side, k, on) => `<button type="button" data-io${side === 'in' ? 'i' : 'o'}="${k}" aria-pressed="${on}">${esc(catName(k))}</button>`;
    if (t === 'sel') return `<div class="ac-io"><span class="ac-l">يُغيّر</span><span class="ac-chips">${chip('out', 'sel', A.io.sel !== 'none')}${chip('out', 'none', A.io.sel === 'none')}</span></div>`;
    const ins = ['all', 'toc', 'h', ...(hasMatnNow() ? ['m'] : []), 's', ...(hasNotes() ? ['f'] : [])];
    const outs = ['auto', 'none', 'h', ...(hasMatnNow() ? ['m'] : []), 's', ...(hasNotes() ? ['f'] : []), 'all'];
    const io = ioNow(t);
    const size = ioBuild(t, io).chars;
    return `<div class="ac-io"><span class="ac-l">يُرسل</span><span class="ac-chips">${ins.map((k) => chip('in', k, A.io.in.includes(k))).join('')}</span></div>
      <div class="ac-io"><span class="ac-l">يُغيّر</span><span class="ac-chips">${outs.map((k) => chip('out', k, A.io.out.includes(k))).join('')}</span></div>
      <small class="ac-size">يُرسل ${esc([...io.inC].map(catName).join('، '))} — نحو ${ar(size >= 1000 ? Math.round(size / 1000) + ' ألف' : size)} حرف${io.outC.size ? '، ويُقترح تغيير ' + esc([...io.outC].map(catName).join('، ')) : '، للجواب وحده'}</small>`;
  }
  /** أجزاء المدى بمعرّفاتها وأنواعها ← { units, lines, toc, chars, map } */
  function ioBuild(t, io) {
    const units = [];
    if (t === 'sel') {
      for (const u of selUnits()) {
        const node = nodeOf(u.t);
        units.push({ ...u, cat: 'sel', kind: node.type === 'heading' ? 'h' : roleOf(node) === 'matn' ? 'm' : u.t.n != null ? 'f' : 's', level: node.level, full: textOf(node) });
      }
    } else {
      const r = rangeOf(t);
      const seen = new Set();
      for (let i = r.a; i <= r.b; i++) {
        const blk = st.view.blocks[i];
        if (!isText(blk)) continue;
        const full = textOf(blk);
        if (!full.trim()) continue;
        const heading = blk.type === 'heading' || blk.type === 'label';
        const cat = heading ? 'h' : roleOf(blk) === 'matn' ? 'm' : 's';
        const u = { t: { vol: st.vol, b: i }, from: 0, to: full.length, text: full, full, verse: blk.type === 'verse', cat, kind: cat, level: blk.level || 2 };
        units.push(u);
        if (!blk.runs) continue;
        for (const rr of blk.runs) {
          if (rr.k !== 'r' || seen.has(rr.id)) continue;
          seen.add(rr.id);
          const nt = st.view.notes && st.view.notes[rr.id];
          (nt && nt.segs ? nt.segs : []).forEach((sg, g) => {
            const ft = textOf(sg);
            if (ft.trim()) units.push({ t: { vol: st.vol, n: rr.id, g }, from: 0, to: ft.length, text: ft, full: ft, verse: sg.type === 'verse', cat: 'f', kind: 'f', on: u });
          });
        }
      }
    }
    units.forEach((u, k) => (u.id = String(k + 1)));
    const map = new Map(units.map((u) => [u.id, u]));
    const tag = (u) => (u.kind === 'h' ? `عنوان${ar(u.level || 2)}` : u.kind === 'f' ? `حاشية${u.on ? ' على ' + u.on.id : ''}` : (u.verse ? 'بيت·' : '') + (u.kind === 'm' ? 'متن' : hasMatnNow() ? 'شرح' : 'نص'));
    const inC = io.inC;
    const lines = [];
    const body = t === 'sel' || [...inC].some((c) => c !== 'toc');
    if (body)
      units.forEach((u, k) => {
        if (t !== 'sel' && !inC.has(u.cat)) return;
        let line = `[${u.id}|${tag(u)}] ${(t === 'sel' ? u.text : u.full).replace(/\s*\n\s*/g, ' ')}`;
        // ما في هامش الصفحة بجانبه
        const sd = u.t.b != null ? (nodeOf(u.t) || {}).side : null;
        if (sd && sd.r) line += `\n⟵ هامش أيمن: ${sideText(sd.r).replace(/\s*\n\s*/g, ' / ')}`;
        if (sd && sd.l) line += `\n⟵ هامش أيسر: ${sideText(sd.l).replace(/\s*\n\s*/g, ' / ')}`;
        if (sd && sd.a) line += `\n⟵ هامش متبادل: ${sideText(sd.a).replace(/\s*\n\s*/g, ' / ')}`;
        // العناوين وحدها: ومعها أول ما تحتها (ليُعرف ما يصلح لها)
        if (u.cat === 'h' && t !== 'sel' && !inC.has('m') && !inC.has('s')) {
          const next = units.slice(k + 1).find((x) => x.cat !== 'f');
          if (next && next.cat !== 'h') line += ` — يليه: «${cut(next.full, 110)}»`;
        }
        lines.push(line);
      });
    const toc = t !== 'sel' && inC.has('toc') && !inC.has('h') ? units.filter((u) => u.cat === 'h').map((u) => `${'  '.repeat(Math.max(0, (u.level || 2) - 1))}[${u.id}] ${u.full}`) : [];
    const chars = lines.reduce((n, l) => n + l.length + 1, 0) + toc.reduce((n, l) => n + l.length + 1, 0);
    return { units, lines, toc, chars, map };
  }
  /** ردّ المساعد ← { message, changes, bad } (الكتلة: ```json {"changes":[…]} ```، وإلا أول {"changes" في النص) */
  function parseEdit(text) {
    const s = String(text || '');
    let json = null;
    let at = -1;
    let len = 0;
    const re = /```[a-zA-Z]*[ \t]*\n?([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(s))) if (/"changes"\s*:/.test(m[1])) (json = m[1]), (at = m.index), (len = m[0].length);
    if (json == null) {
      const k = s.search(/\{\s*"changes"\s*:/);
      if (k >= 0) {
        const z = s.lastIndexOf('}');
        if (z > k) (json = s.slice(k, z + 1)), (at = k), (len = z + 1 - k);
      }
    }
    let changes = [];
    let bad = false;
    if (json != null) {
      const tryParse = (x) => {
        try {
          return JSON.parse(x);
        } catch {
          return undefined;
        }
      };
      const d = tryParse(json.trim()) ?? tryParse(json.trim().replace(/,\s*([\]}])/g, '$1'));
      if (d === undefined) bad = true;
      else changes = Array.isArray(d) ? d : d && Array.isArray(d.changes) ? d.changes : [];
    }
    const message = (at >= 0 ? s.slice(0, at) + s.slice(at + len) : s).replace(/\n{3,}/g, '\n\n').trim();
    return { message, changes, bad };
  }
  const KIND_NAME = { h: 'عنوان', m: 'متن', s: 'نص', f: 'حاشية' };
  /** التغييرات ← صفوفٌ تُعرض وتُقبل (وما خرج عمّا سُمح به يُعرض ممنوعاً) */
  function rowsOf(changes, map, outC) {
    const rows = [];
    let unknown = 0;
    const allow = (cat) => outC.has('sel') || outC.has(cat);
    for (const c of changes.slice(0, 800)) {
      if (!c || typeof c !== 'object') continue;
      const why = String(c.why || '').slice(0, 240);
      // صورةٌ تُدرج قبل جزءٍ أو بعده (SVG يرسمه المساعد، أو رابط صورة)
      if (c.image != null && c.insert == null) {
        const ref = map.get(String(c.after != null ? c.after : c.before != null ? c.before : c.id));
        const img = typeof c.image === 'string' ? (/^\s*<svg[\s>]/i.test(c.image) ? { svg: c.image } : { url: c.image }) : c.image && typeof c.image === 'object' ? c.image : null;
        const svg = img && typeof img.svg === 'string' && /<svg[\s>]/i.test(img.svg) ? img.svg.slice(0, 400000) : '';
        const url = img && typeof img.url === 'string' && /^https?:\/\/\S+$/i.test(img.url.trim()) ? img.url.trim() : '';
        if (!ref || ref.cat === 'f' || ref.t.b == null || (!svg && !url)) {
          unknown++;
          continue;
        }
        rows.push({ type: 'image', u: ref, where: c.after == null && c.before != null ? 'before' : 'after', svg, url, cap: String(c.caption || c.cap || '').trim().slice(0, 600), width: Math.max(20, Math.min(100, Math.round(+c.width) || 60)), why, ok: allow(ref.cat) || allow('s') });
        continue;
      }
      if (c.insert != null) {
        const ref = map.get(String(c.after != null ? c.after : c.before));
        if (!ref || ref.cat === 'f') {
          unknown++;
          continue;
        }
        const as = ['heading', 'text', 'matn'].includes(c.as) ? c.as : 'text';
        const cat = as === 'heading' ? 'h' : as === 'matn' ? 'm' : 's';
        rows.push({ type: 'insert', u: ref, where: c.after == null && c.before != null ? 'before' : 'after', text: String(c.insert).trim(), as, level: Math.max(1, Math.min(4, Math.round(+c.level) || 2)), why, ok: allow(cat) && !!String(c.insert).trim() });
        continue;
      }
      const u = map.get(String(c.id));
      if (!u) {
        unknown++;
        continue;
      }
      const base = { u, why };
      // الإضافات: حاشية، أو نوعٌ لمقطع (آية، حديث)، أو هامشٌ جانبي — ولا تمسّ نص الجزء
      if (c.note != null && String(c.note).trim()) {
        if (u.cat === 'f' || u.cat === 'h' || u.t.b == null || u.verse) unknown++;
        else rows.push({ ...base, type: 'note', note: String(c.note).trim().slice(0, 6000), after: c.after != null ? String(c.after) : '', ok: allow(u.cat) || allow('f') });
      }
      if (c.mark != null && /^(q|h|t|aya|ayah|hadith|text)$/i.test(String(c.mark))) {
        const mk = String(c.mark).toLowerCase();
        const kind = mk === 'q' || mk.startsWith('aya') ? 'q' : mk === 'h' || mk === 'hadith' ? 'h' : 't';
        rows.push({ ...base, type: 'mark', kind, find: c.find != null ? String(c.find) : '', ok: allow(u.cat) });
      }
      if (c.side != null && /^(r|l|right|left|يمين|يسار)$/i.test(String(c.side))) {
        if (u.cat === 'f' || u.t.b == null) unknown++;
        else rows.push({ ...base, type: 'side', side: /^(l|left|يسار)$/i.test(String(c.side)) ? 'l' : 'r', text: String(c.text == null ? '' : c.text).trim().slice(0, 600), ok: allow(u.cat) });
      }
      if ((c.note != null || c.mark != null || c.side != null) && !c.delete && !c.make && c.level == null && !(c.find != null && c.repl != null) && (c.side != null || c.text == null)) continue;
      if (c.delete) rows.push({ ...base, type: 'delete', ok: allow(u.cat) });
      else {
        if (typeof c.text === 'string' && c.text.trim()) rows.push({ ...base, type: 'text', neu: c.text, ok: allow(u.cat) });
        else if (c.find != null && String(c.find).trim()) rows.push({ ...base, type: 'find', find: String(c.find), repl: String(c.repl == null ? '' : c.repl), ok: allow(u.cat) });
        if (c.make) {
          const to = ['heading', 'text', 'matn', 'sharh'].includes(c.make) ? c.make : null;
          const cat = to === 'heading' ? 'h' : to === 'matn' ? 'm' : 's';
          if (to && u.cat !== 'f') rows.push({ ...base, type: 'make', to, level: Math.max(1, Math.min(4, Math.round(+c.level) || 2)), ok: allow(u.cat) || allow(cat) });
        } else if (c.level != null && u.kind === 'h' && Math.round(+c.level) !== (u.level || 2)) rows.push({ ...base, type: 'level', level: Math.max(1, Math.min(4, Math.round(+c.level) || 2)), ok: allow('h') });
      }
    }
    for (const r of rows) r.on = r.ok;
    return { rows, unknown };
  }
  /** النص الجديد للجزء بعد تغييراته (نصٌّ كامل، أو مقاطع فيه) ← { neu } أو { err } */
  function composeText(u, list) {
    const node = nodeOf(u.t);
    if (!node) return { err: 'لم يُعثر على موضعه' };
    const full = textOf(node);
    if (full !== u.full) return { err: 'تغيّر نصه منذ الطلب' };
    let s = full;
    for (const r of list) {
      // (المحدَّد بعضُ فقرة: النص الجديد مكانه وحده)
      if (r.type === 'text') s = u.from > 0 || u.to < full.length ? fitPart(full, u.from, u.to, cleanOut(r.neu, { text: u.text, verse: u.verse })) : cleanOut(r.neu, { text: full, verse: u.verse });
      else {
        let at = s.indexOf(r.find);
        let orig = r.find;
        if (at < 0) {
          const m = findRegex(r.find.trim(), { marks: true }).exec(s);
          if (!m) return { err: 'لم يُعثر على «' + cut(r.find, 30) + '»' };
          at = m.index;
          orig = m[0];
        }
        s = fitPart(s, at, at + orig.length, r.repl);
      }
    }
    return { neu: s };
  }
  /** موضع نصٍّ في نص الجزء (حرفياً، وإلا بتجاهل التشكيل) ← [من، إلى] أو null */
  function spotIn(text, find) {
    const f = String(find || '');
    if (!f.trim()) return null;
    let at = text.indexOf(f);
    if (at >= 0) return [at, at + f.length];
    const ft = f.trim();
    at = text.indexOf(ft);
    if (at >= 0) return [at, at + ft.length];
    try {
      const m = findRegex(ft, { marks: true }).exec(text);
      if (m) return [m.index, m.index + m[0].length];
    } catch {}
    // أوله وآخره (حين يختصر المساعد الآية الطويلة)
    const ws = ft.split(/\s+/).filter(Boolean);
    if (ws.length >= 6) {
      const head = spotIn(text, ws.slice(0, 3).join(' '));
      const tail = head && spotIn(text.slice(head[1]), ws.slice(-3).join(' '));
      if (head && tail) return [head[0], head[1] + tail[1]];
    }
    return null;
  }
  /** صورة المساعد: SVG يُرسم صورةً (PNG)، أو رابطٌ يجلبه البرنامج ← { src, w, h } */
  async function imageOf(r) {
    if (r.svg) {
      let svg = String(r.svg)
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
        .replace(/(href\s*=\s*)("(?!#)[^"]*"|'(?!#)[^']*')/gi, '$1"#"');
      if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
      const wA = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)(px)?["']/i.exec(svg);
      const hA = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)(px)?["']/i.exec(svg);
      let w = vb ? +vb[1] : wA ? +wA[1] : 800;
      let h = vb ? +vb[2] : hA ? +hA[1] : 600;
      if (!(w > 0 && h > 0)) (w = 800), (h = 600);
      // يُرسم بعرض ١٦٠٠ نقطة ليبقى واضحاً في الطباعة
      const k = Math.min(4, 1600 / w);
      const W = Math.round(w * k);
      const H = Math.round(h * k);
      if (!vb) svg = svg.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`);
      svg = svg.replace(/<svg([^>]*)\swidth\s*=\s*["'][^"']*["']/i, '<svg$1').replace(/<svg([^>]*)\sheight\s*=\s*["'][^"']*["']/i, '<svg$1').replace(/<svg/i, `<svg width="${W}" height="${H}"`);
      const im = new Image();
      await new Promise((res, rej) => {
        im.onload = res;
        im.onerror = () => rej(new Error('لم تُرسم صورة المساعد (SVG غير صحيح)'));
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      // (الخلفية شفافة: تأخذ لون الورق، أبيض أو أصفر)
      cv.getContext('2d').drawImage(im, 0, 0, W, H);
      return { src: cv.toDataURL('image/png'), w: W, h: H };
    }
    const j = await api('/api/admin/ai/image', { method: 'POST', body: { url: r.url } });
    if (!j || !j.src) throw new Error('لم تُجلب الصورة');
    let { src, w, h } = j;
    const im = new Image();
    await new Promise((res, rej) => {
      im.onload = res;
      im.onerror = () => rej(new Error('الصورة لا تُقرأ'));
      im.src = src;
    });
    w = im.naturalWidth || w || 800;
    h = im.naturalHeight || h || 600;
    // WEBP و SVG (لا يعرضهما Word) والكبيرة جداً: تُرسم PNG أو JPEG بمقاسٍ معقول
    const k = Math.min(1, 2400 / Math.max(w, h));
    if (k < 1 || /^data:image\/(webp|svg)/.test(src)) {
      const W = Math.round(w * k);
      const H = Math.round(h * k);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      cv.getContext('2d').drawImage(im, 0, 0, W, H);
      src = /^data:image\/jpe?g/.test(src) ? cv.toDataURL('image/jpeg', 0.9) : cv.toDataURL('image/png');
      w = W;
      h = H;
    }
    return { src, w, h };
  }
  async function applyEdit(it, only) {
    const pick = (only ? [only] : it.rows).filter((r) => r.on && r.ok && r.state !== 'done');
    if (!pick.length) return toast('لا شيء محدَّد');
    if (it.applying) return;
    const ops = [];
    const sigNow = new Map(); // الجزء ← توقيعه بعد تغيير نصه (لما بعده من عمليات عليه)
    const textNow = new Map(); // الجزء ← نصه بعد تغيير نصه
    let first = null;
    let n = 0;
    const gone = (r, err) => Object.assign(r, { state: 'gone', err });
    // ٠) الصور: تُرسم أو تُجلب أولاً
    const imgs = pick.filter((r) => r.type === 'image' && !r.img);
    if (imgs.length) {
      it.applying = true;
      paintItem(it);
      for (const r of imgs) {
        try {
          r.img = await imageOf(r);
        } catch (e) {
          gone(r, e.message || 'تعذّرت الصورة');
        }
      }
      it.applying = false;
    }
    // ١) النصوص: كل جزءٍ تغييراته معاً
    const byU = new Map();
    for (const r of pick) if (r.type === 'text' || r.type === 'find') byU.set(r.u, [...(byU.get(r.u) || []), r]);
    for (const [u, list] of byU) {
      const c = composeText(u, list);
      if (c.err) {
        for (const r of list) gone(r, c.err);
        continue;
      }
      const o = opFor({ t: u.t, from: 0, to: u.full.length, text: u.full, verse: u.verse }, c.neu);
      if (o.err) {
        for (const r of list) gone(r, o.err);
        continue;
      }
      if (o.op) ops.push(o.op), (first ||= { old: u.full, neu: c.neu }), sigNow.set(u, sigOf({ type: 'heading', text: c.neu })), textNow.set(u, c.neu);
      for (const r of list) r.state = 'done';
      n += list.length;
    }
    const sig = (u) => sigNow.get(u) ?? sigOf(nodeOf(u.t) || {});
    /** نص الجزء الآن (بعد ما سبق من تغييراتٍ في هذه الدفعة) أو null إن تغيّر منذ الطلب */
    const textOfU = (u) => {
      if (textNow.has(u)) return textNow.get(u);
      const node = nodeOf(u.t);
      if (!node) return null;
      const full = textOf(node);
      return full === u.full ? full : null;
    };
    // ٢) الحواشي (الإحالة لا طول لها: لا تتغيّر بها مواضع النص)
    for (const r of pick) {
      if (r.type !== 'note' || r.state === 'gone') continue;
      const text = textOfU(r.u);
      const node = nodeOf(r.u.t);
      if (text == null || !node || !node.runs) {
        gone(r, 'تغيّر نصه منذ الطلب');
        continue;
      }
      let pos = text.length;
      if (r.after && r.after.trim()) {
        const sp = spotIn(text, r.after);
        if (!sp) {
          gone(r, 'لم يُعثر على «' + cut(r.after, 30) + '»');
          continue;
        }
        pos = sp[1];
        // علامة ترقيم أو قوسٌ ملاصق: الإحالة بعده
        while (pos < text.length && /[»"”)\]﴾،.؛:!؟]/.test(text[pos]) && pos - sp[1] < 2) pos++;
      }
      ops.push({ op: 'note', t: r.u.t, sig: sig(r.u), pos, nid: 'u' + opId(), runs: runsFromText(r.note) });
      first ||= { old: cut(text.slice(Math.max(0, pos - 30), pos), 40) || '—', neu: '⁽ⁿ⁾ ' + cut(r.note, 36) };
      r.state = 'done';
      n++;
    }
    // ٣) الآيات والأحاديث: من آخر الجزء إلى أوله (فقوسا الآية لا يغيّران مواضع ما قبلها)
    const marks = new Map();
    for (const r of pick) if (r.type === 'mark' && r.state !== 'gone') marks.set(r.u, [...(marks.get(r.u) || []), r]);
    for (const [u, list] of marks) {
      const text = textOfU(u);
      const node = nodeOf(u.t);
      if (text == null || !node) {
        for (const r of list) gone(r, 'تغيّر نصه منذ الطلب');
        continue;
      }
      const spans = [];
      for (const r of list) {
        if (node.type === 'heading' || node.type === 'label') {
          gone(r, 'العنوان لا يُعلَّم فيه نوع');
          continue;
        }
        if (node.type === 'verse' && r.kind === 'h') {
          gone(r, 'البيت يُعلَّم فيه الآية وحدها');
          continue;
        }
        let sp = r.find && r.find.trim() ? spotIn(text, r.find) : [0, text.length];
        if (!sp) {
          gone(r, 'لم يُعثر على «' + cut(r.find, 30) + '»');
          continue;
        }
        let [a, z] = sp;
        if (r.kind === 'q' || r.kind === 'h') {
          // القوسان حول الآية (أو علامتا التنصيص حول الحديث) يدخلان فيها، فلا يتكرران
          const pre = (r.kind === 'q' ? /([﴿«("“[])\s*$/ : /([«"“])\s*$/).exec(text.slice(Math.max(0, a - 3), a));
          const post = (r.kind === 'q' ? /^\s*([﴾»)"”\]])/ : /^\s*([»"”])/).exec(text.slice(z, z + 3));
          if (pre && post) (a -= pre[0].length), (z += post[0].length);
        }
        if (spans.some((x) => a < x.z && z > x.a)) {
          r.state = 'done';
          continue;
        }
        spans.push({ a, z, r });
      }
      spans.sort((x, y) => y.a - x.a);
      for (const { a, z, r } of spans) {
        ops.push({ op: 'kind', t: u.t, sig: sig(u), from: a, to: z, kind: r.kind });
        first ||= { old: cut(text.slice(a, z), 40), neu: r.kind === 'q' ? 'آية' : r.kind === 'h' ? 'حديث' : 'نص' };
        r.state = 'done';
        n++;
      }
    }
    // ٤) الأنواع والمستويات
    for (const r of pick) {
      if (r.type !== 'make' && r.type !== 'level') continue;
      if (!nodeOf(r.u.t)) {
        gone(r, 'لم يُعثر على موضعه');
        continue;
      }
      if (r.type === 'level') ops.push({ op: 'kind', t: r.u.t, sig: sig(r.u), kind: 'heading', level: r.level });
      else ops.push({ op: 'kind', t: r.u.t, sig: sig(r.u), kind: r.to === 'heading' ? 'heading' : r.to === 'matn' ? 'matn' : 'text', ...(r.to === 'heading' ? { level: r.level } : {}) });
      first ||= { old: cut(r.u.full, 40), neu: r.type === 'level' ? levelName(r.level) : r.to === 'heading' ? 'عنوان: ' + levelName(r.level) : r.to === 'matn' ? 'متن' : roleName('sharh') };
      r.state = 'done';
      n++;
    }
    // ٥) الهوامش الجانبية: لكل جزءٍ هامشاه معاً
    const sides = new Map();
    for (const r of pick) if (r.type === 'side') sides.set(r.u, [...(sides.get(r.u) || []), r]);
    for (const [u, list] of sides) {
      if (!nodeOf(u.t)) {
        for (const r of list) gone(r, 'لم يُعثر على موضعه');
        continue;
      }
      const set = {};
      for (const r of list) set[r.side] = r.text;
      ops.push({ op: 'side', t: u.t, sig: sig(u), set });
      first ||= { old: cut(u.full, 30), neu: 'هامش: ' + cut(list[0].text || '—', 34) };
      for (const r of list) r.state = 'done';
      n += list.length;
    }
    // ٦) الإضافة والحذف والصور (من آخر الكتاب إلى أوله)
    const tail = pick.filter((r) => (r.type === 'insert' || r.type === 'delete' || r.type === 'image') && r.state !== 'gone').sort((a, b) => (b.u.t.b ?? 0) - (a.u.t.b ?? 0));
    for (const r of tail) {
      if (!nodeOf(r.u.t)) {
        gone(r, 'لم يُعثر على موضعه');
        continue;
      }
      if (r.type === 'delete') ops.push({ op: 'remove', t: r.u.t, sig: sig(r.u) });
      else if (r.type === 'image') {
        // الصورة في وسط السطر (تُغيَّر من «الخصائص ← الصورة»)
        ops.push({ op: 'insert', t: r.u.t, sig: sig(r.u), where: r.where, block: { type: 'image', src: r.img.src, w: r.img.w, h: r.img.h, wPct: r.width, al: 'c', ...(r.cap ? { cap: r.cap } : {}) } });
      } else {
        const block = r.as === 'heading' ? { type: 'heading', level: r.level, text: r.text } : r.as === 'matn' ? (st.view.layout === 'split' ? { type: 'para', runs: [{ k: 't', s: r.text }], mt: true } : { type: 'para', runs: [{ k: 'm', s: r.text }] }) : { type: 'para', runs: runsFromText(r.text) };
        ops.push({ op: 'insert', t: r.u.t, sig: sig(r.u), where: r.where, block });
      }
      first ||= { old: r.type === 'delete' ? cut(r.u.full, 40) : '—', neu: r.type === 'delete' ? '— (حُذف)' : r.type === 'image' ? '▣ صورة' + (r.cap ? ': ' + cut(r.cap, 30) : '') : cut(r.text, 40) };
      r.state = 'done';
      n++;
    }
    if (!ops.length) {
      paintItem(it);
      return toast('تغيّرت هذه المواضع منذ الطلب');
    }
    commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'parts', old: cut(first.old, 40) || '—', new: cut(first.neu, 40) || '—', ai: true, ...(n > 1 ? { count: n } : {}) });
    paintItem(it);
    const bad = pick.filter((r) => r.state === 'gone').length;
    toast((n === 1 ? 'طُبّق' : `طُبّق ${cnt(n, 'تغيير')}`) + (bad ? ` · ${cnt(bad, 'تغيير')} لم يُطبَّق` : ''));
  }
  async function runEdit({ prompt, t }) {
    const io = ioNow(t);
    const B = ioBuild(t, io);
    const where = t === 'sel' ? describe(st.sel).name : rangeOf(t).name;
    const inNames = t === 'sel' ? 'المحدَّد' : [...io.inC].map(catName).join('، ');
    const outNames = [...io.outC].map(catName).join('، ');
    // الدفعات: ما يُغيَّر يُرسل كله دفعةً بعد دفعة؛ والجواب وحده يكفيه أوله
    const CAP = 40000;
    const parts = [];
    let cur = [];
    let n = 0;
    for (const l of B.lines) {
      if (cur.length && n + l.length > CAP) parts.push(cur), (cur = []), (n = 0);
      cur.push(l.length > CAP ? l.slice(0, CAP) : l);
      n += l.length + 1;
    }
    if (cur.length || !parts.length) parts.push(cur);
    let cutNote = '';
    if (!io.outC.size && parts.length > 1) {
      parts.length = 1;
      cutNote = '[…وبقيته لم تُرسل لطولها]';
    }
    if (parts.length > BIG() && !(await askGo(`سيُرسل ${where} دفعةً بعد دفعة (الدفعات: ${ar(parts.length)}، والحروف نحو ${ar(Math.max(100, Math.round(B.chars / 100) * 100))}) ليُقترح تغيير ${outNames}. قد يطول، وكل دفعةٍ طلبٌ من حصة مفتاحك. وتقلّ الدفعات إن اخترتَ فيما «يُرسل» أقلّ (العناوين أو الفهرس وحده مثلاً).`))) return;
    const one = t === 'sel' ? selUnits() : [];
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'edit', msgs: [], rows: [], done: 0, total: parts.length, running: true, range: where, out: outNames, unknown: 0, bad: 0, sel: one.length === 1 ? { unit: one[0] } : null });
    const ctl = begin(it);
    paintItem(it);
    const head = [
      ...(t === 'sel' ? selHead(st.sel, selUnits()) : [...bookHead(), `[الموضع] ${where}`]),
      `[ما يُرسل] ${inNames}`,
      `[ما يُسمح بتغييره] ${outNames || 'لا شيء: أجب فقط، ولا تكتب كتلة التغييرات'}`,
    ];
    const tocBlock = B.toc.length ? ['', '[الفهرس]', ...B.toc] : [];
    for (let k = 0; k < parts.length; k++) {
      if (ctl.signal.aborted) break;
      // الآيات والأحاديث المعلَّمة في أجزاء هذه الدفعة، مفصولةً عن النص
      const ids = new Set(parts[k].map((l) => (/^\[(\d+)\|/.exec(l) || [])[1]).filter(Boolean));
      const marks = marksBlock(B.units.filter((u) => ids.has(u.id)));
      const user = [
        ...head,
        ...(parts.length > 1 ? [`[الدفعة] ${ar(k + 1)} من ${ar(parts.length)} (غيّر ما فيها وحده)`] : []),
        ...(k === 0 || B.toc.join('\n').length < 8000 ? tocBlock : []),
        ...(parts[k].length ? ['', '[الأجزاء]', '<<<', ...parts[k], ...(cutNote ? [cutNote] : []), '>>>'] : []),
        ...marks,
        '',
        '[التوجيه] ' + prompt,
      ].join('\n');
      const know = k === 0 ? knowFor({ kind: 'edit', t, prompt, units: t === 'sel' ? one : null }) : null;
      if (know && k === 0) it.searching = true, paintItem(it);
      try {
        const res = await call({ kind: 'edit', user, history: k === 0 ? A.hist.linked.slice(-6) : [], tag: cut(prompt, 30), ...(know ? { know } : {}) }, ctl);
        it.searching = false;
        if (res.sources && res.sources.length) it.sources = res.sources;
        if (res.know) it.know = res.know;
        it.provider = res.provider;
        it.model = res.model;
        it.ms = (it.ms || 0) + (res.ms || 0);
        const pe = parseEdit(res.text);
        if (pe.message) it.msgs.push(pe.message);
        if (pe.bad) it.bad++;
        const rr = rowsOf(pe.changes, B.map, io.outC);
        it.rows.push(...rr.rows);
        it.unknown += rr.unknown;
      } catch (e) {
        if (e.name === 'AbortError') break;
        it.error = e.message;
        it.reason = e.reason;
        it.trail = e.trail;
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.running = false;
    it.text = it.msgs.join('\n\n');
    // للمتابعة: ما طُلب (بلا نص الكتاب)، وما أجاب به وما اقترحه
    const asked = [...head, '', '[التوجيه] ' + prompt].join('\n');
    const proposed = it.rows.length ? '\n\n[اقترحتُ ' + cnt(it.rows.length, 'تغيير') + ']\n' + it.rows.slice(0, 60).map((r) => `- ${r.type} ${r.u.id}${r.neu ? ': ' + cut(r.neu, 80) : r.repl != null ? ': ' + cut(r.find, 30) + ' ← ' + cut(r.repl, 30) : r.text ? ': ' + cut(r.text, 60) : r.level ? ' ' + r.level : ''}`).join('\n') : '';
    A.hist.linked.push({ role: 'user', content: asked.slice(0, 6000) }, { role: 'assistant', content: (it.msgs.join('\n\n') + proposed).slice(0, 12000) });
    if (A.hist.linked.length > 12) A.hist.linked = A.hist.linked.slice(-12);
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  function editHtml(it) {
    const msg = it.msgs.length ? `<div class="ai-bub ans">${md(it.msgs.join('\n\n'), it.sources)}</div>${sourcesHtml(it)}` : '';
    const rowHtml = (r, k) => {
      const u = r.u;
      const role = `<span class="fx-role">${esc(r.type === 'note' ? 'حاشية جديدة' : r.type === 'side' ? 'هامش' : r.type === 'image' ? 'صورة' : r.type === 'mark' ? (r.kind === 'q' ? 'آية' : r.kind === 'h' ? 'حديث' : 'نوع') : u.kind === 'h' ? 'عنوان' : u.kind === 'f' ? 'حاشية' : u.kind === 'm' ? 'متن' : roleName('sharh').replace(/^ال/, ''))}</span>`;
      let what = '';
      if (r.type === 'text') {
        const old = u.from > 0 || u.to < u.full.length ? u.text : u.full;
        what = `<p class="fx-x">${old.length + r.neu.length < 900 ? diffHtml(old, r.neu) : esc(cut(r.neu, 400))}</p>`;
      }
      else if (r.type === 'find') what = `<p class="fx-x"><span class="iss-d"><del>${esc(r.find)}</del><span class="arr">←</span><ins>${esc(r.repl || '∅')}</ins></span><small class="ed-in">في: «${esc(cut(u.full, 80))}»</small></p>`;
      else if (r.type === 'level') what = `<p class="fx-x"><b>${esc(cut(u.full, 70))}</b><small class="ed-in">${esc(levelName(u.level || 2))} ← ${esc(levelName(r.level))}</small></p>`;
      else if (r.type === 'make') what = `<p class="fx-x"><b>${esc(cut(u.full, 70))}</b><small class="ed-in">${esc(KIND_NAME[u.kind] || 'نص')} ← ${esc(r.to === 'heading' ? 'عنوان: ' + levelName(r.level) : r.to === 'matn' ? 'متن' : roleName('sharh'))}</small></p>`;
      else if (r.type === 'delete') what = `<p class="fx-x"><del>${esc(cut(u.full, 160))}</del><small class="ed-in">يُحذف</small></p>`;
      else if (r.type === 'insert') what = `<p class="fx-x"><ins>${esc(cut(r.text, 200))}</ins><small class="ed-in">${r.as === 'heading' ? 'عنوانٌ جديد (' + esc(levelName(r.level)) + ')' : r.as === 'matn' ? 'متنٌ جديد' : 'فقرةٌ جديدة'} ${r.where === 'before' ? 'قبل' : 'بعد'} «${esc(cut(u.full, 40))}»</small></p>`;
      else if (r.type === 'note') what = `<p class="fx-x"><span class="ed-note">${esc(cut(r.note, 300))}</span><small class="ed-in">حاشيةٌ ${r.after ? `بعد «${esc(cut(r.after, 40))}»` : 'في آخره'} — في: «${esc(cut(u.full, 60))}»</small></p>`;
      else if (r.type === 'mark') what = `<p class="fx-x"><span class="ed-mk k-${r.kind}">${esc(cut(r.find || u.full, 200))}</span><small class="ed-in">يصير ${r.kind === 'q' ? 'آيةً' : r.kind === 'h' ? 'حديثاً' : 'نصاً عادياً'}${r.find ? ` — في: «${esc(cut(u.full, 50))}»` : ''}</small></p>`;
      else if (r.type === 'side') what = `<p class="fx-x"><span class="ed-side ${r.side}">${esc(cut(r.text || '— (يُمحى)', 200))}</span><small class="ed-in">في الهامش ${r.side === 'l' ? 'الأيسر' : 'الأيمن'} بجانب «${esc(cut(u.full, 50))}»</small></p>`;
      else if (r.type === 'image') what = `<div class="fx-x">${r.img ? `<img class="ed-img" src="${esc(r.img.src)}" alt="">` : r.svg ? `<img class="ed-img" src="${esc('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg.replace(/<script[\s\S]*?<\/script>/gi, '')))}" alt="">` : `<p class="ed-url" dir="ltr">${esc(cut(r.url, 120))}</p>`}${r.cap ? `<small class="ed-cap">${esc(r.cap)}</small>` : ''}<small class="ed-in">صورةٌ في الوسط (${ar(r.width)}٪ من السطر) ${r.where === 'before' ? 'قبل' : 'بعد'} «${esc(cut(u.full, 40))}»</small></div>`;
      const stt = r.state === 'done' ? '<span class="fx-st ok">✓</span>' : r.state === 'gone' ? `<span class="fx-st bad">${esc(r.err || 'تغيّر')}</span>` : !r.ok ? '<span class="fx-st bad">خارج ما سمحتَ بتغييره</span>' : '';
      return `<li class="ed-r ${r.state || ''} ${r.ok ? '' : 'no'}" data-k="${k}">
        <label class="st-c"><input type="checkbox" data-x="on" ${r.on ? 'checked' : ''} ${r.state === 'done' || !r.ok ? 'disabled' : ''}></label>
        <div class="ed-b"><div class="fx-t">${role}${stt}<button type="button" class="ai-btn sm q ed-go" data-x="go" title="اذهب إليه">↖</button></div>${what}${r.why ? `<small class="ed-why">${esc(r.why)}</small>` : ''}</div>
      </li>`;
    };
    const on = it.rows.filter((r) => r.on && r.ok && r.state !== 'done').length;
    const blocked = it.rows.filter((r) => !r.ok).length;
    const head = it.rows.length ? `<div class="fx-h col"><b>${cnt(it.rows.length, 'تغيير')} مقترحة في ${esc(it.range)}</b><small>${it.out ? 'سمحتَ بتغيير ' + esc(it.out) : ''}${blocked ? ` · ${cnt(blocked, 'تغيير')} خارجه (لا يُطبَّق)` : ''}</small></div>` : '';
    const notes = [it.unknown ? `أشار إلى ${cnt(it.unknown, 'موضع')} لم يُرسل إليه فتُرك.` : '', it.bad ? 'لم تُفهم كتلة التغييرات في ردّه (ليست JSON صحيحاً): اطلب منه أن يعيدها.' : ''].filter(Boolean);
    const list = it.rows.length ? `<div class="ai-bub fxb edb">${head}<ol class="ed-l">${it.rows.map(rowHtml).join('')}</ol></div>` : '';
    const prog = it.running ? `<div class="ai-bub wait">${progress(it, it.searching ? 'يبحث في مصادر العلم…' : it.total > 1 ? `يقرأ ${it.range}` : 'يكتب…') || dots}</div>` : it.applying ? `<div class="ai-bub wait">${dots} يرسم الصور ويطبّق…</div>` : '';
    return `${msg}${list}${prog}${notes.length ? `<p class="ai-errline">${esc(notes.join(' '))}</p>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}
      <div class="ai-acts">${on && !it.running ? `<button type="button" class="ai-btn pri" data-x="applyedit">طبّقها (${ar(on)})</button><button type="button" class="ai-btn q" data-x="dropedit">اتركها</button>` : ''}${it.msgs.length ? `<button type="button" class="ai-btn" data-x="copy">${ICON.copy}انسخ</button>` : ''}${it.sel && !it.rows.length && it.msgs.length && !it.running ? '<button type="button" class="ai-btn" data-x="compare">قارنه بالمحدَّد واستبدل</button>' : ''}${meta(it)}</div>`;
  }

  /* ================================================================ مصادر العلم (من «مصادر المعرفة») */
  const KB = () => (A.cfg && A.cfg.know) || null;
  const readyCats = () => ((KB() || {}).cats || []).filter((c) => !c.free && c.ready);
  const generalAi = () => !!(((KB() || {}).cats || []).find((c) => c.id === 'general') || {}).ai;
  /** ما اختاره المستخدم الآن ← ['auto'] | ['general'] | [أقسام] */
  function knowNow() {
    const kb = KB();
    const ready = readyCats().map((c) => c.id);
    let list = (A.know || (kb && kb.auto === false ? 'general' : 'auto')).split(',').filter((x) => x === 'auto' || x === 'general' || ready.includes(x));
    if (!list.length) list = ['auto'];
    return list;
  }
  function knowPick(id) {
    let cur = knowNow();
    if (id === 'auto' || id === 'general') cur = [id];
    else {
      cur = cur.filter((x) => x !== 'auto' && x !== 'general');
      cur = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (!cur.length) cur = ['auto'];
    }
    A.know = cur.join(',');
    LS('warraq.ai.know', A.know);
  }
  /** صفّ «المصادر» في بطاقة السياق */
  function knowHtml() {
    const kb = KB();
    if (!kb) return '';
    const ready = readyCats();
    if (!ready.length) return `<div class="ac-io ac-know"><span class="ac-l">المصادر</span><span class="ac-none">بلا مصادر علم بعد <button type="button" class="ac-link" data-a="know-settings">أضف مفتاح الدرر أو سِوار</button></span></div>`;
    const cur = knowNow();
    const chip = (id, n, title) => `<button type="button" data-kn="${esc(id)}" aria-pressed="${cur.includes(id)}" title="${esc(title || '')}">${esc(n)}</button>`;
    const note = cur[0] === 'auto' ? 'يُختار من الأقسام ما يناسب النص' : cur[0] === 'general' ? 'بلا مصادر: الذكاء الاصطناعي حرٌّ في جوابه' : 'يُبحث في: ' + cur.map((id) => (ready.find((c) => c.id === id) || {}).name).filter(Boolean).join(' + ');
    return `<div class="ac-io ac-know"><span class="ac-l" title="${esc(note)}">المصادر</span><span class="ac-chips">${chip('auto', 'تلقائي', 'بحسب النص: يُختار ما يناسبه من الأقسام')}${chip('general', 'عام', 'بلا مصادر: الذكاء الاصطناعي حرٌّ في جوابه')}${ready.map((c) => chip(c.id, c.name, c.desc + (c.ai ? ' — ' + c.ai : ''))).join('')}</span></div>`;
  }
  /** سطرٌ في الترحيب: ما يستعين به المساعد */
  function knowLead() {
    const ready = readyCats();
    if (!ready.length) return '';
    return `<p class="ai-kn-lead">ويستعين بمصادر العلم: ${ready.map((c) => esc(c.name)).join('، ')} — ويذكر رقم كل مصدر.</p>`;
  }
  /** نص الموضع للبحث (المحدَّد، أو أول الفصل، أو فهرس الكتاب وأوله) */
  function knowText(t, units) {
    if (t === 'free') return '';
    if (t === 'sel') return (units && units.length ? units : selUnits()).map((u) => u.text).join('\n').slice(0, 6000);
    const r = rangeOf(t);
    if (t === 'book') return ((tocOf(r.a, r.b) || '') + '\n' + rangeText(r.a, r.b, 3000)).slice(0, 6000);
    return rangeText(r.a, r.b, 6000);
  }
  /**
   * ما يُرسل للبحث في مصادر العلم مع الطلب، أو لا شيء.
   * توجيهٌ له مصادره (k-hadith…) يُقدَّم على «تلقائي»، واختيار المستخدم الصريح يُقدَّم على كليهما.
   */
  function knowFor({ kind, t, prompt, units }) {
    const kb = KB();
    if (!kb) return null;
    const ready = readyCats().map((c) => c.id);
    const preset = (A.nextKnow || '').split(',').filter(Boolean);
    let cats = knowNow();
    const userChose = !!A.know && cats[0] !== 'auto';
    if (preset.length && !userChose) cats = preset;
    cats = cats.filter((x) => x === 'auto' || x === 'general' || ready.includes(x));
    if (!cats.length) cats = preset.includes('general') ? ['general'] : ['auto'];
    if (!ready.length && cats.includes('auto')) cats = ['general'];
    // «عام» وحده: لا بحث؛ يُرسل إن كان له ذكاءٌ اختير (فيُجيب به)
    if (cats.length === 1 && cats[0] === 'general' && !generalAi()) return null;
    // التصحيح: بمصادر اختيرت صراحةً وحدها
    if (kind === 'fix' && (cats.includes('auto') || cats.includes('general'))) return null;
    return { cats, text: knowText(t, units), prompt: String(prompt || '').slice(0, 1200) };
  }
  /** المصادر تحت الجواب: مطويّةٌ بأرقامها، وما بُحث فيه فلم يُوجد */
  function sourcesHtml(it) {
    const src = it.sources || [];
    const used = (it.know && it.know.used) || [];
    const errs = (it.know && it.know.errors) || [];
    if (!src.length && !used.length && !errs.length) return '';
    const names = [...new Set(src.map((s) => s.catName))];
    const empty = used.filter((u) => !u.n);
    const foot = [empty.length ? `لم يُوجد شيءٌ في: ${empty.map((u) => esc(u.name) + (u.queries && u.queries.length ? ` («${esc(cut(u.queries[0], 30))}»)` : '')).join('، ')}` : '', errs.length ? `تعذّر: ${errs.map((e) => esc(e.cat) + ' — ' + esc(e.error)).join('؛ ')}` : ''].filter(Boolean);
    if (!src.length) return `<p class="ai-kn-foot">${foot.join(' · ') || 'لم يُوجد في مصادر العلم ما يتصل بالسؤال.'}</p>`;
    return `<details class="ai-srcs"${src.length <= 3 ? ' open' : ''}><summary><b>المصادر</b> <small>${ar(src.length)} · ${esc(names.join('، '))}</small></summary><ol>${src
      .map(
        (s) => `<li data-sn="${s.n}"><span class="ai-sn">${ar(s.n)}</span><div><small>${esc(s.catName)} · ${esc(s.via)}</small>${s.title ? `<b>${esc(cut(s.title, 160))}</b>` : ''}<p>${esc(cut(s.text, 320))}</p>${s.grade ? `<em>خلاصة حكم المحدث: ${esc(s.grade)}</em>` : ''}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" dir="ltr">${esc(cut(s.url.replace(/^https?:\/\//, ''), 48))}</a>` : ''}</div></li>`,
      )
      .join('')}</ol>${foot.length ? `<p class="ai-kn-foot">${foot.join(' · ')}</p>` : ''}</details>`;
  }

  /* ================================================================ الترجمة (من «مصادر الترجمة») */
  const langName = (l) => ((KB() || {}).langs || {})[l] || l || '';
  const RTL_LANGS = new Set(['ar', 'fa', 'ur', 'ps', 'ku']);
  /** الإعداد الآن: ما اختاره المستخدم هنا، وإلا ما في الإعدادات */
  function trNow() {
    const kb = KB() || {};
    const T = kb.trans || {};
    const engines = T.engines || [];
    let via = A.tr.via || T.mode || 'ai';
    if (via !== 'ai' && !engines.length) via = 'ai';
    return { to: A.tr.to || T.to || 'en', from: A.tr.from || T.from || 'auto', via, engines, ai: T.ai || '', siwar: !!T.siwar, glossary: T.glossary || 0 };
  }
  function trHtml() {
    const kb = KB();
    if (!kb) return '<p class="ac-free">يُحمَّل…</p>';
    const tr = trNow();
    const langs = Object.entries(kb.langs || {});
    const sel = (f, cur, auto) => `<select data-tr="${f}" aria-label="${f === 'to' ? 'إلى' : 'من'}">${langs.filter(([k]) => auto || k !== 'auto').map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    const via = [
      ['ai', 'الذكاء الاصطناعي'],
      ['engine', 'المحرك وحده'],
      ['hybrid', 'المحرك ثم الذكاء'],
    ];
    const who = tr.via === 'ai' ? tr.ai || 'سلسلة المحرِّر' : tr.via === 'engine' ? (tr.engines[0] || {}).label : `${(tr.engines[0] || {}).label} ثم ${tr.ai || 'سلسلة المحرِّر'}`;
    const extra = [tr.via !== 'engine' && tr.glossary ? `مسردك (${ar(tr.glossary)})` : '', tr.via !== 'engine' && tr.siwar ? 'مقابلات سِوار' : ''].filter(Boolean);
    return `<div class="ac-io ac-tr"><span class="ac-l">إلى</span><span class="ac-trl">${sel('to', tr.to)}<small>من</small>${sel('from', tr.from, true)}</span></div>
      <div class="ac-io"><span class="ac-l">بـ</span><span class="ac-chips">${via.map(([v, n]) => `<button type="button" data-trv="${v}" aria-pressed="${tr.via === v}" ${v !== 'ai' && !tr.engines.length ? 'disabled title="أضف مفتاح محرك ترجمة من الإعدادات ← مصادر المعرفة ← مصادر الترجمة"' : ''}>${n}</button>`).join('')}</span></div>
      <small class="ac-size">${esc(who || '')}${extra.length ? ' · يستعين بـ' + esc(extra.join(' و')) : ''} · <button type="button" class="ac-link" data-a="tr-settings">الإعدادات</button></small>
      <label class="ai-chk ac-trn" title="الحواشي تُترجم مع فقراتها، وتبقى كل إحالةٍ عند كلمتها، وتُستبدل أو تُدرج كسائر النص"><input type="checkbox" data-a="tr-notes" ${trNotes() ? 'checked' : ''}><span>ترجم الحواشي معها</span></label>
      <div class="ac-go"><button type="button" class="ai-btn pri" data-a="tr-go">${ICON.trans}ترجم ${esc(whereLabel(tgt()))}</button></div>`;
  }
  /** نص الترجمة: البيت شطران « … »، بلا أسطر في الفقرة */
  function cleanTr(s, u) {
    let t = String(s == null ? '' : s).replace(/\r/g, '').replace(/\u2029/g, ' ').trim();
    if (u.verse) t = t.replace(/\s*(?:…|\.{3}|\*\*\*|\s\/\s|\n+)\s*/, ' … ');
    else t = t.replace(/\s*\n+\s*/g, ' ');
    return t;
  }
  /**
   * مقاطع الوحدة بأنواعها (لتبقى الآية آيةً والحديث حديثاً والمتن متناً بعد الترجمة):
   * ← [{ a, z, k, text, lead, trail }] بمواضع نص القطعة، أو null إن كانت نوعاً واحداً
   */
  function segsOf(u) {
    const node = nodeOf(u.t);
    if (!node || !node.runs || u.free) return null;
    const grp = (r) => (r.k === 'q' || (r.k === 'm' && r.q) ? 'q' : r.k === 'h' ? 'h' : r.k === 'm' ? 'm' : r.k === 'ht' ? 'ht' : 't');
    const full = textOf(node);
    // قطع الوحدة بأنواعها
    const raw = [];
    let p = 0;
    for (const r of node.runs) {
      if (r.k === 'r') continue;
      const len = (r.s || '').length;
      const a = Math.max(p, u.from);
      const z = Math.min(p + len, u.to);
      p += len;
      if (z > a) raw.push({ a, z, k: grp(r) });
    }
    // ما كان مسافةً وحدها يتبع ما قبله، والمتجاوران من نوعٍ واحد مقطعٌ واحد
    const segs = [];
    for (const x of raw) {
      const prev = segs[segs.length - 1];
      if (prev && (prev.k === x.k || !full.slice(x.a, x.z).trim())) {
        prev.z = x.z;
        continue;
      }
      if (prev && !full.slice(prev.a, prev.z).trim()) {
        prev.z = x.z;
        prev.k = x.k;
        continue;
      }
      segs.push({ ...x });
    }
    for (const x of segs) {
      const txt = full.slice(x.a, x.z);
      x.lead = (txt.match(/^\s*/) || [''])[0].length;
      x.trail = x.lead >= txt.length ? 0 : (txt.match(/\s*$/) || [''])[0].length;
      x.text = txt.trim();
    }
    const out = segs.filter((x) => x.text);
    return out.length > 1 ? out : null;
  }
  /**
   * ترجمة المقطع بعلامتيه: الآية بين ﴿ ﴾ والحديث بين « » كما كان في الأصل.
   * وفي اللغة التي تُكتب من اليسار يتبادل القوسان المزهّران موضعيهما (﴾…﴿)، فيُفتح كلٌّ إلى ما بينهما
   */
  function wrapSeg(x, out, ltr) {
    let o = String(out || '').trim();
    if (x.k === 'q' && /^﴿/.test(x.text)) {
      const core = o.replace(/^[﴿﴾«"“({[\s]+|[﴿﴾»"”)}\]\s]+$/g, '').trim();
      const tail = (/[.,;:!?،؛]+$/.exec(o.replace(/[﴿﴾»"”)}\]\s]+$/, '')) || [''])[0];
      o = ltr ? '\uFD3E' + core.replace(/[.,;:!?،؛]+$/, '') + '\uFD3F' + (tail && !/[﴾﴿]$/.test(o) ? tail : '') : '﴿' + core.replace(/[.,;:!?،؛]+$/, '') + '﴾' + (tail && !/[﴾﴿]$/.test(o) ? tail : '');
    }
    if (x.k === 'h' && /^[«"“]/.test(x.text) && !/^[«"“]/.test(o)) o = '«' + o + '»';
    return o;
  }
  /** «ترجم الحواشي معها» (يُذكر؛ أصله نعم) */
  const trNotes = () => LS('warraq.ai.trnotes') !== '0';
  /** الفقرة بعلامات مواضع إحالاتها ⟦١⟧… (تبقى في الترجمة عند كلماتها، فتعود كل إحالةٍ إلى موضعها) */
  const MK = (n) => '⟦' + n + '⟧';
  function withMarks(u) {
    if (!u.refs || !u.refs.length) return u.text;
    let out = '';
    let at = u.from;
    u.refs.forEach((p, j) => {
      out += u.text.slice(at - u.from, p - u.from) + MK(j + 1);
      at = p;
    });
    return out + u.text.slice(at - u.from);
  }
  /** ترجمةٌ بعلاماتها ← { out: بلا علامات، pieces: ما بين الإحالات (أو null إن ضاعت علامةٌ أو تبدّل ترتيبها) } */
  function splitMarks(raw, u) {
    const s = String(raw == null ? '' : raw);
    const re = /\s*⟦\s*([0-9٠-٩]+)\s*⟧/g;
    const out = s.replace(re, '').replace(/[ \t]{2,}/g, ' ').trim();
    if (!u.refs || !u.refs.length) return { out, pieces: null };
    const pieces = [];
    const seq = [];
    let at = 0;
    let m;
    while ((m = re.exec(s))) {
      seq.push(+String(m[1]).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      pieces.push(s.slice(at, m.index));
      at = m.index + m[0].length;
    }
    pieces.push(s.slice(at));
    const ok = seq.length === u.refs.length && seq.every((n, j) => n === j + 1);
    return { out, pieces: ok ? pieces : null };
  }
  async function runTranslate({ t, text }) {
    const tr = trNow();
    let units;
    if (t === 'free') units = [{ id: '1', text, free: true }];
    else if (t === 'sel') units = selUnits(st.sel, { notes: trNotes() });
    else {
      const r = rangeOf(t);
      units = rangeUnits(r.a, r.b, { notes: trNotes() });
    }
    units = units.filter((u) => u.text && u.text.trim());
    if (!units.length) return toast('لا نص يُترجم');
    const where = t === 'free' ? 'النص' : whereLabel(t);
    const parts = tr.via === 'engine' ? batches(units, 14000, 90) : batches(units, 3600, 24);
    const chars = units.reduce((n, u) => n + u.text.length, 0);
    if (parts.length > BIG() && !(await askGo(`سيُترجم ${where} (نحو ${ar(Math.max(100, Math.round(chars / 100) * 100))} حرف) دفعةً بعد دفعة: ${ar(parts.length)} ${tr.via === 'engine' ? 'طلباً إلى محرك الترجمة' : 'طلباً إلى الذكاء الاصطناعي'}. قد يطول، وكل طلبٍ من حصة مفتاحك.`))) return;
    const it = pushItem({ role: 'ai', id: ++A.seq, type: 'trans', rows: [], done: 0, total: parts.length, running: true, to: tr.to, via: tr.via, range: where, free: t === 'free', view: 'tr', glossary: [], ms: 0 });
    const ctl = begin(it);
    paintItem(it);
    const info = st.info || {};
    for (let k = 0; k < parts.length; k++) {
      if (ctl.signal.aborted) break;
      const part = parts[k];
      try {
        // الفقرة ذات الأنواع (نصٌّ فيه آيةٌ أو حديث): مقاطع تُترجم كلٌّ وحده بنوعه، وتبقى أنواعها في الكتاب
        const items = [];
        const segMap = new Map();
        for (const u of part) {
          const sg = t === 'free' ? null : segsOf(u);
          if (sg) {
            segMap.set(u, sg);
            sg.forEach((x, j) => items.push({ id: u.id + '.' + (j + 1), text: x.text, k: x.k, p: u.id, ...(u.note ? { n: 1 } : {}) }));
          } else items.push({ id: u.id, text: withMarks(u), ...(u.note ? { n: 1 } : {}) });
        }
        const r = await api('/api/admin/know/translate', { method: 'POST', body: { items, to: tr.to, from: tr.from, via: tr.via, ctx: { title: info.title || '', author: info.author || '' } }, signal: ctl.signal });
        const map = new Map((r.items || []).map((x) => [String(x.id), x.text]));
        for (const u of part) {
          const sg = segMap.get(u);
          if (!sg) {
            const got = map.get(u.id);
            const mk = splitMarks(got, u);
            it.rows.push({ u, out: cleanTr(mk.out, u), ...(mk.pieces ? { pieces: mk.pieces.map((x) => x.replace(/\r/g, '').replace(/\s*\n+\s*/g, ' ')) } : {}), state: got ? 'new' : 'gone', err: got ? '' : 'لم تُترجم' });
            continue;
          }
          const segs = sg.map((x, j) => {
            const got = map.get(u.id + '.' + (j + 1));
            return { ...x, out: got ? wrapSeg(x, cleanTr(got, { verse: false }), !RTL_LANGS.has(tr.to)) : x.text, miss: !got };
          });
          const any = segs.some((x) => !x.miss);
          it.rows.push({ u, segs, out: segs.map((x) => x.out).join(' '), state: any ? 'new' : 'gone', err: any ? (segs.some((x) => x.miss) ? '' : '') : 'لم تُترجم' });
        }
        Object.assign(it, { engine: r.engine || it.engine, provider: r.provider || it.provider, model: r.model || it.model, viaDone: r.via });
        it.ms += r.ms || 0;
        for (const g of r.glossary || []) if (!it.glossary.some((x) => x.src === g.src)) it.glossary.push(g);
      } catch (e) {
        if (e.name === 'AbortError') break;
        Object.assign(it, { error: e.message, reason: e.reason, trail: e.trail });
        break;
      }
      it.done++;
      paintItem(it);
    }
    it.running = false;
    it.text = it.rows.map((r) => r.out).join('\n\n');
    paintItem(it);
    if (A.run && A.run.item === it) end();
  }
  const TR_SHOW = 160;
  /** «من اليسار إلى اليمين، مضبوطاً من الطرفين» للترجمة إلى لغةٍ لاتينية (يُذكر) */
  const trLtr = () => LS('warraq.ai.trltr') !== '0';
  function transItemHtml(it) {
    const rows = it.rows;
    const n = rows.length;
    const pend = rows.filter((r) => r.state === 'new').length;
    const dir = RTL_LANGS.has(it.to) ? 'rtl' : 'ltr';
    const via = it.viaDone === 'engine' ? it.engine : it.viaDone === 'hybrid' ? `${it.engine} ثم ${it.provider}` : it.provider;
    const views = [
      ['tr', 'الترجمة'],
      ['both', 'جنباً إلى جنب'],
    ];
    const list = rows
      .slice(0, TR_SHOW)
      .map((r, k) => {
        const role = it.free ? '' : `<span class="fx-role">${esc(r.u.role || '')}</span>`;
        const stt = r.state === 'done' ? '<span class="fx-st ok">✓</span>' : r.state === 'gone' ? `<span class="fx-st bad">${esc(r.err || 'تغيّر')}</span>` : '';
        const src = it.view === 'both' && !it.free ? `<p class="tr-src">${esc(cut(r.u.text, 600))}</p>` : '';
        return `<li class="tr-r ${r.state}" data-k="${k}">${role || stt ? `<div class="fx-t">${role}${stt}${it.free ? '' : '<button type="button" class="ai-btn sm q ed-go" data-x="go" title="اذهب إليه">↖</button>'}</div>` : ''}${src}<p class="tr-out" dir="${dir}">${esc(r.out)}</p></li>`;
      })
      .join('');
    const head = n ? `<div class="fx-h col"><b>${it.free ? 'الترجمة' : `ترجمة ${esc(it.range)}`} إلى ${esc(langName(it.to))}</b><small>${it.free ? '' : cnt(n, 'فقرة')}${via ? ' · ' + esc(via) : ''}${it.glossary.length ? ` · بمسردٍ من ${ar(it.glossary.length)} مصطلحاً` : ''}</small></div>` : '';
    const tabs = n && !it.free ? `<div class="fx-v" role="group">${views.map(([v, l]) => `<button type="button" data-x="trview" data-v="${v}" aria-pressed="${it.view === v}">${l}</button>`).join('')}</div>` : '';
    const more = n > TR_SHOW ? `<p class="ai-kn-foot">… و${cnt(n - TR_SHOW, 'فقرة')} غيرها (تُنسخ وتُنزَّل وتُطبَّق كلها)</p>` : '';
    const gl = it.glossary.length ? `<details class="tr-gl"><summary>المسرد المستعمل</summary><ul>${it.glossary.map((g) => `<li><b>${esc(g.src)}</b> = <span dir="auto">${esc(g.dst)}</span> <small>(${esc(g.from)})</small></li>`).join('')}</ul></details>` : '';
    const prog = it.running ? `<div class="ai-bub wait">${progress(it, 'يترجم ' + it.range) || dots}</div>` : '';
    const acts =
      n && !it.running
        ? `${!it.free && !RTL_LANGS.has(it.to) ? `<label class="ai-chk" title="الترجمة إلى لغةٍ تُكتب من اليسار: تبدأ الفقرات من اليسار، وتُضبط من الطرفين (Justify)، وتبقى الآية آيةً والحديث حديثاً"><input type="checkbox" data-x="trltr" ${trLtr() ? 'checked' : ''}><span>من اليسار إلى اليمين، مضبوطاً من الطرفين</span></label>` : ''}<button type="button" class="ai-btn" data-x="copytr">${ICON.copy}انسخ</button>${it.free ? '' : `<button type="button" class="ai-btn" data-x="savetr">${ICON.save}نزّل ملفاً</button>${!RTL_LANGS.has(it.to) && rows.some((r) => r.state === 'done' && r.how === 'replace') ? '<button type="button" class="ai-btn" data-x="tr-dir" title="الفقرات المترجمة في الكتاب: من اليسار إلى اليمين مضبوطةً من الطرفين">اجعل المترجَم من اليسار</button>' : ''}${pend ? `<button type="button" class="ai-btn pri" data-x="tr-replace" title="يُستبدل نص كل فقرة بترجمتها (يُرجع عنه بـ Ctrl+Z)">استبدل بها النص (${ar(pend)})</button><button type="button" class="ai-btn" data-x="tr-insert" title="تبقى الفقرة، وتحتها ترجمتها">أدرجها بعد كل فقرة</button>` : ''}`}`
        : '';
    return `${n ? `<div class="ai-bub fxb trb">${head}${tabs}<ol class="tr-l">${list}</ol>${more}${gl}</div>` : ''}${prog}${it.error ? errHtml(it) : ''}<div class="ai-acts">${acts}${meta(it)}</div>`;
  }
  /** الترجمة في الكتاب: تستبدل نص الفقرة، أو تُدرج بعدها */
  function trApply(it, how) {
    const rows = it.rows.filter((r) => r.state === 'new');
    if (!rows.length) return;
    if (rows.length > 30 && !confirm(`${how === 'replace' ? 'استبدال نص' : 'إدراج ترجمة بعد'} ${cnt(rows.length, 'فقرة')}؟ (يُرجع عنه بـ Ctrl+Z)`)) return;
    const ltr = !RTL_LANGS.has(it.to);
    // الترجمة إلى لغةٍ من اليسار: الفقرات من اليسار إلى اليمين مضبوطةً من الطرفين (خيارٌ يُذكر)
    const ltrDir = ltr && trLtr();
    const ops = [];
    // من آخر الكتاب إلى أوله: فلا تتغيّر مواضع ما قبله (والحواشي: من آخر مقاطعها)
    const ord = rows.slice().sort((a, b) => (b.u.t.b ?? (blockOfNote(b.u.t.n) + 0.5)) - (a.u.t.b ?? (blockOfNote(a.u.t.n) + 0.5)) || (b.u.t.g || 0) - (a.u.t.g || 0));
    for (const r of ord) {
      const node = nodeOf(r.u.t);
      if (!node) {
        Object.assign(r, { state: 'gone', err: 'لم يُعثر على موضعه' });
        continue;
      }
      const full = textOf(node);
      if (full.slice(r.u.from, r.u.to) !== r.u.text) {
        Object.assign(r, { state: 'gone', err: 'تغيّر نصه منذ الترجمة' });
        continue;
      }
      if (how === 'replace') {
        if (node.type === 'verse') {
          const p = (r.u.from > 0 || r.u.to < full.length ? full.slice(0, r.u.from) + r.out + full.slice(r.u.to) : r.out).split(' … ');
          if (p.length !== 2) {
            Object.assign(r, { state: 'gone', err: 'لم تأتِ ترجمة البيت شطرين' });
            continue;
          }
          ops.push({ op: 'edit', t: r.u.t, sig: sigOf(node), parts: p });
        } else {
          // المقاطع بأنواعها: كلٌّ مكان أصله (فيرث نوعه: الآية آية، والحديث حديث)
          // (مقطعان متلاصقان في الأصل بلا مسافة: في اللغة الأخرى تُفصل الكلمتان بمسافة)
          const ch = r.segs
            ? r.segs.map((x, j) => {
                const prev = j ? r.segs[j - 1] : null;
                const glue = prev && !prev.trail && !x.lead && /[\p{L}\p{N}﴿﴾»)]$/u.test(prev.out) && /^[\p{L}\p{N}﴾﴿«(]/u.test(x.out);
                return { a: x.a + x.lead, z: x.z - x.trail, s: (glue ? ' ' : '') + x.out };
              })
            : r.pieces && r.u.refs
              ? // ما بين إحالات الحواشي: كلُّ قطعةٍ من الترجمة في موضعها، فتبقى كل إحالةٍ عند كلمتها
                r.pieces.map((x, j) => {
                  const a = j ? r.u.refs[j - 1] : r.u.from;
                  const z = j < r.u.refs.length ? r.u.refs[j] : r.u.to;
                  const piece = j === 0 ? x.replace(/^\s+/, '') : j === r.pieces.length - 1 ? x.replace(/\s+$/, '') : x;
                  return { a, z, s: piece };
                }).filter((c) => c.z > c.a || c.s)
              : [{ a: r.u.from, z: r.u.to, s: r.out }];
          ops.push({ op: 'edit', t: r.u.t, sig: sigOf(node), ch });
          const whole = node.runs && r.u.from === 0 && r.u.to >= full.length;
          let after = full;
          for (const c of ch.slice().sort((x, y) => y.a - x.a)) after = after.slice(0, c.a) + c.s + after.slice(c.z);
          if (ltr && whole && r.u.t.b != null) ops.push({ op: 'pstyle', t: r.u.t, sig: sigOf({ type: 'para', runs: [{ k: 't', s: after }] }), ps: ltrDir ? { dir: 'ltr', al: null } : { al: 'l' } });
        }
      } else {
        let block;
        if (node.type === 'heading') block = { type: 'heading', level: node.level || 2, text: r.out };
        else if (node.type === 'verse' && r.out.split(' … ').length === 2) block = { type: 'verse', parts: r.out.split(' … ') };
        else {
          const runs = r.segs ? r.segs.map((x, j) => ({ k: x.k === 'q' ? 'q' : x.k === 'h' ? 'h' : x.k === 'm' && node.type !== 'p' ? 'm' : x.k === 'ht' && node.type !== 'p' ? 'ht' : 't', s: (j ? ' ' : '') + x.out, ...(x.k === 'ht' ? { level: 3 } : {}) })) : [{ k: 't', s: r.out }];
          block = { type: node.type === 'p' ? 'p' : 'para', runs, ...(ltr ? (ltrDir && node.type !== 'p' ? { ps: { dir: 'ltr' } } : { al: 'l' }) : {}), ...(node.mt ? { mt: true } : {}) };
        }
        ops.push({ op: 'insert', t: r.u.t, sig: sigOf(node), where: 'after', block });
      }
      r.state = 'done';
      r.how = how;
    }
    if (!ops.length) return paintItem(it), toast('تغيّرت هذه المواضع منذ الترجمة');
    const done = rows.filter((r) => r.state === 'done');
    const note = how === 'replace' ? { kind: 'parts', old: cut(done[0].u.text, 40), new: cut(done[0].out, 40), ai: true, ...(done.length > 1 ? { count: done.length } : {}) } : { kind: 'kind', to: 'أُدرجت الترجمة (' + langName(it.to) + ')', text: done.length > 1 ? cnt(done.length, 'فقرة') : cut(done[0].out, 40) };
    commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, note);
    paintItem(it);
    toast(how === 'replace' ? `تُرجمت ${cnt(done.length, 'فقرة')} في الكتاب` : `أُدرجت ترجمة ${cnt(done.length, 'فقرة')}`);
  }
  function trFile(it) {
    const info = st.info || {};
    const lines = [];
    // الحواشي: تحت فقرتها، مرقّمةً كما في الكتاب (والإحالة في الفقرة برقمها)
    let fn = 0;
    const num = new Map();
    let pend = [];
    const flushNotes = () => {
      if (pend.length) lines.push(pend.join('\n'));
      pend = [];
    };
    for (const r of it.rows) {
      const node = nodeOf(r.u.t);
      if (r.u.note) {
        if (!num.has(r.u.t.n)) num.set(r.u.t.n, ++fn);
        const k = num.get(r.u.t.n);
        pend.push(`${r.u.t.g ? '   ' : '(' + ar(k) + ') '}${r.out}`);
        continue;
      }
      flushNotes();
      const isH = node && node.type === 'heading';
      let out = r.out;
      if (r.pieces && r.u.refs) {
        // أرقام الحواشي في مواضع إحالاتها
        const ids = [];
        let p = 0;
        for (const x of node.runs || []) {
          if (x.k === 'r') {
            if (p >= r.u.from && p <= r.u.to) ids.push(x.id);
            continue;
          }
          p += (x.s || '').length;
        }
        out = r.pieces.map((x, j) => x + (j < ids.length ? `(${ar(num.has(ids[j]) ? num.get(ids[j]) : (num.set(ids[j], ++fn), fn))})` : '')).join('').replace(/[ \t]{2,}/g, ' ').trim();
      }
      lines.push(isH ? `\n${'#'.repeat(Math.min(4, node.level || 2))} ${out}\n` : out);
    }
    flushNotes();
    const head = `${info.title || ''}${info.author ? ' — ' + info.author : ''}\n(${it.range} — ترجمة إلى ${langName(it.to)})\n\n`;
    const blob = new Blob(['﻿' + head + lines.join('\n\n').replace(/\n{3,}/g, '\n\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${String(info.title || 'ترجمة').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)} — ${langName(it.to)}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1500);
  }
  function transAct(it, x, b) {
    if (x === 'trview') {
      it.view = b.dataset.v;
      return paintItem(it);
    }
    if (x === 'copytr') return copy(it.rows.map((r) => r.out).join('\n\n'));
    if (x === 'savetr') return trFile(it);
    if (x === 'tr-replace') return trApply(it, 'replace');
    if (x === 'tr-dir') {
      // ما استُبدل نصه بترجمته: من اليسار إلى اليمين مضبوطاً (بعد الترجمة، ولو لم يُختر قبلها)
      const ops = [];
      for (const r of it.rows) {
        if (r.state !== 'done' || r.how !== 'replace' || r.u.t.b == null) continue;
        const node = nodeOf(r.u.t);
        if (node && node.type === 'para') ops.push({ op: 'pstyle', t: r.u.t, sig: sigOf(node), ps: { dir: 'ltr', al: null } });
      }
      if (!ops.length) return toast('لا فقرات مترجمة في الكتاب');
      commit(ops.length === 1 ? ops[0] : { op: 'batch', vol: st.vol, ops }, { kind: 'style', to: 'من اليسار إلى اليمين، مضبوطاً', text: cnt(ops.length, 'فقرة') });
      return toast(`صارت ${cnt(ops.length, 'فقرة')} من اليسار إلى اليمين`);
    }
    if (x === 'tr-insert') return trApply(it, 'insert');
    if (x === 'go') {
      const li = b.closest('[data-k]');
      const r = li && it.rows[+li.dataset.k];
      if (r) return goTo(r.u.t);
    }
  }

  /* ================================================================ المحادثة: عرض الرسائل */
  function pushItem(it) {
    if (!A.items.length) msgsEl.innerHTML = '';
    A.items.push(it);
    const el = document.createElement('div');
    el.className = 'ai-msg ' + (it.role === 'user' ? 'me' : 'ai');
    el.dataset.item = it.id;
    msgsEl.appendChild(el);
    paintItem(it);
    paintPresets();
    requestAnimationFrame(() => (bodyEl.scrollTop = bodyEl.scrollHeight));
    return it;
  }
  const itemEl = (it) => msgsEl.querySelector(`[data-item="${it.id}"]`);
  const byId = (id) => A.items.find((x) => String(x.id) === String(id));
  const dots = '<span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  const meta = (it) => (it.provider ? `<small class="ai-meta">${esc(it.provider)}${it.model ? ` · <span dir="ltr">${esc(it.model)}</span>` : ''}${it.ms >= 100 ? ` · ${ar((it.ms / 1000).toFixed(1)).replace('.', '٫')} ث` : ''}</small>` : '');
  function md(s, cites) {
    // تنسيقٌ يسير: فقرات، وقوائم، و**غامق**، وعناوين بعلامة #؛ وأرقام المصادر [٢] أزرارٌ إلى مصدرها
    const N = cites && cites.length ? cites.length : 0;
    const toN = (d) => +String(d).replace(/[٠-٩]/g, (x) => '٠١٢٣٤٥٦٧٨٩'.indexOf(x));
    const inline = (x) => {
      let h = esc(x).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      if (N) h = h.replace(/\[([٠-٩0-9]{1,2})\]/g, (m, d) => (toN(d) >= 1 && toN(d) <= N ? `<button type="button" class="ai-cite" data-x="cite" data-n="${toN(d)}" title="${esc(cut(cites[toN(d) - 1].title || cites[toN(d) - 1].text, 90))}">${ar(toN(d))}</button>` : m));
      return h;
    };
    const out = [];
    let list = null;
    for (const raw of String(s).replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      const li = /^(?:[-*•]|\d+[.)-]|[٠-٩]+[.)-])\s+(.*)$/.exec(line);
      if (li) {
        if (!list) list = [];
        list.push(`<li>${inline(li[1])}</li>`);
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
  /** الفرق بين نصين: المحذوف والمضاف بكلماتهما */
  function diffHtml(a, b) {
    const ch = diffText(a, b);
    let p = 0;
    let html = '';
    for (const c of ch) {
      html += esc(a.slice(p, c.a));
      if (c.z > c.a) html += `<del>${esc(a.slice(c.a, c.z))}</del>`;
      if (c.s) html += `<ins>${esc(c.s)}</ins>`;
      p = c.z;
    }
    return html + esc(a.slice(p));
  }
  function paintItem(it) {
    const el = itemEl(it);
    if (!el) return;
    if (it.role === 'user') {
      el.innerHTML = `<div class="ai-bub">${it.title ? `<b class="ai-pt">${esc(it.title)}</b>` : `<p>${esc(it.text)}</p>`}</div><small class="ai-where">${esc(it.where || '')}</small>`;
      return;
    }
    const seal = `<span class="ai-av">${ICON.seal}</span>`;
    let body = '';
    if (it.type === 'pending') body = `<div class="ai-bub wait">${dots}<span>${esc(it.label || '')}</span></div>`;
    else if (it.type === 'error') body = errHtml(it);
    else if (it.type === 'ask')
      body = `<div class="ai-bub ans ask"><p>${esc(it.text)}</p></div><div class="ai-acts">${it.answered ? `<small class="ai-meta">${it.answered === 'yes' ? 'بدأ' : 'أُلغي'}</small>` : '<button type="button" class="ai-btn pri" data-x="ask-yes">ابدأ</button><button type="button" class="ai-btn q" data-x="ask-no">ألغِ</button>'}</div>`;
    else if (it.type === 'answer')
      body = `<div class="ai-bub ans">${md(it.text, it.sources)}</div>${sourcesHtml(it)}<div class="ai-acts"><button type="button" class="ai-btn" data-x="copy">${ICON.copy}انسخ</button>${it.sel ? '<button type="button" class="ai-btn" data-x="compare">قارنه بالمحدَّد واستبدل</button>' : ''}${meta(it)}</div>`;
    else if (it.type === 'trans') body = transItemHtml(it);
    else if (it.type === 'fix') body = fixHtml(it);
    else if (it.type === 'review') body = reviewHtml(it);
    else if (it.type === 'structure') body = structHtml(it);
    else if (it.type === 'roles') body = rolesHtml(it);
    else if (it.type === 'edit') body = editHtml(it);
    else if (it.type === 'units') body = unitsHtml(it);
    else if (it.type === 'hints') body = hintsHtml(it);
    el.innerHTML = seal + `<div class="ai-col">${body}</div>`;
    if (it === A.items[A.items.length - 1]) requestAnimationFrame(() => (bodyEl.scrollTop = bodyEl.scrollHeight));
  }
  function errHtml(it) {
    const trail = (it.trail || []).filter((t) => !t.ok);
    const settings = it.reason === 'no-key' || it.reason === 'disabled';
    return `<div class="ai-bub err"><b>${esc(it.error || 'تعذّر')}</b>${
      trail.length ? `<details><summary>ما جُرّب</summary><ol>${trail.map((t) => `<li><b>${esc(t.label)}</b>: ${esc(t.error || '')}${t.detail ? ` <code dir="ltr">${esc(String(t.detail).slice(0, 160))}</code>` : ''}</li>`).join('')}</ol></details>` : ''
    }</div>${settings && desk ? '<div class="ai-acts"><button type="button" class="ai-btn" data-a="settings">افتح الإعدادات</button></div>' : ''}`;
  }
  function fixHtml(it) {
    const prog = it.running ? `<div class="ai-bub wait">${progress(it, 'يعمل في ' + (it.range || 'النص'))}</div>` : '';
    const err = it.error ? errHtml(it) : '';
    if (!it.rows.length) return prog || err ? prog + err : `<div class="ai-bub ans"><p>✓ لم يجد ما يُصحَّح.</p></div><div class="ai-acts">${meta(it)}</div>`;
    const pending = it.rows.filter((r) => r.state === 'new');
    const views = [
      ['diff', 'الفرق'],
      ['new', 'المعدَّل'],
      ['old', 'الأصل'],
    ];
    const rows = it.rows
      .map((r, k) => {
        const txt = it.view === 'new' ? esc(r.neu) : it.view === 'old' ? esc(r.u.text) : diffHtml(r.u.text, r.neu);
        const tag = it.rows.length > 1 || r.u.role !== 'نص' ? `<span class="fx-role">${esc(r.u.role)}</span>` : '';
        const st2 = r.state === 'done' ? '<span class="fx-st ok">✓ استُبدل</span>' : r.state === 'skip' ? '<span class="fx-st">تُرك</span>' : r.state === 'gone' ? `<span class="fx-st bad">${esc(r.err || 'تغيّر نصه')}</span>` : '';
        return `<div class="fx ${r.state}" data-r="${k}">
          <div class="fx-t">${tag}${st2}</div>
          <p class="fx-x">${txt}</p>
          ${r.notes.length ? `<ul class="fx-n">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
          ${r.state === 'new' && it.rows.length > 1 ? `<div class="fx-a"><button type="button" class="ai-btn sm" data-x="one">استبدل هذه</button><button type="button" class="ai-btn sm q" data-x="skip">اتركها</button></div>` : ''}
        </div>`;
      })
      .join('');
    return `<div class="ai-bub fxb">
        <div class="fx-h"><b>${it.rows.length === 1 ? 'التصحيح' : `${cnt(it.rows.length, 'فقرة')} فيها تصحيح`}</b>
          <span class="fx-v" role="group">${views.map(([k, n]) => `<button type="button" data-x="view" data-v="${k}" aria-pressed="${it.view === k}">${n}</button>`).join('')}</span></div>
        ${rows}
        ${it.more > 0 ? `<p class="fx-more">أُرسلت أول الفقرات وحدها لطول المحدَّد؛ حدّد ما بقي واطلبه.</p>` : ''}
      </div>${prog}${err}
      <div class="ai-acts">${pending.length && !it.running ? `<button type="button" class="ai-btn pri" data-x="apply">استبدل${pending.length > 1 ? ` الكل (${ar(pending.length)})` : ''}</button><button type="button" class="ai-btn" data-x="copyfix">${ICON.copy}انسخ</button><button type="button" class="ai-btn q" data-x="dismiss">تجاهل</button>` : ''}${meta(it)}</div>`;
  }
  const progress = (it, what) =>
    it.running ? `<div class="ai-prog"><span class="pg-bar"><i style="width:${it.total ? Math.round((it.done / it.total) * 100) : 4}%"></i></span><small>${dots} ${esc(what)} ${it.total > 1 ? `· دفعة ${ar(Math.min(it.done + 1, it.total))} من ${ar(it.total)}` : ''}</small><button type="button" class="ai-btn sm q" data-x="stop">أوقف</button></div>` : '';
  function reviewHtml(it) {
    const open = it.issues.filter((x) => x.state === 'new');
    const rows = it.issues
      .map(
        (x, k) => `<li class="iss ${x.state}" data-k="${k}">
          <button type="button" class="iss-go" data-x="go" title="اذهب إليه في الصفحة"><span class="iss-d"><del>${esc(x.orig)}</del><span class="arr">←</span><ins>${esc(x.repl || '∅')}</ins></span>${x.why ? `<small>${x.type ? `<em>${esc(x.type)}</em> ` : ''}${esc(x.why)}</small>` : ''}</button>
          ${x.state === 'new' ? `<span class="iss-a"><button type="button" class="ai-btn sm" data-x="take" title="اقبله">✓</button><button type="button" class="ai-btn sm q" data-x="drop" title="اتركه">✕</button></span>` : `<span class="fx-st ${x.state === 'done' ? 'ok' : x.state === 'gone' ? 'bad' : ''}">${x.state === 'done' ? '✓' : x.state === 'gone' ? 'تغيّر' : 'تُرك'}</span>`}
        </li>`,
      )
      .join('');
    const head = it.running ? '' : it.issues.length ? `<b>${cnt(it.issues.length, 'ملاحظة')} في ${esc(it.range)}</b>` : it.error ? '' : `<b>✓ لم يجد أخطاء في ${esc(it.range)}</b>`;
    return `<div class="ai-bub rvb">${progress(it, `يراجع ${it.range}`)}${head ? `<div class="fx-h">${head}</div>` : ''}${rows ? `<ol class="iss-l">${rows}</ol>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}${it.failed && !it.error ? `<p class="ai-errline">تعذّرت ${cnt(it.failed, 'دفعة')}.</p>` : ''}</div>
      <div class="ai-acts">${open.length > 1 && !it.running ? `<button type="button" class="ai-btn pri" data-x="takeall">اقبل الكل (${ar(open.length)})</button>` : ''}${open.length && !it.running ? '<button type="button" class="ai-btn q" data-x="dropall">اترك الباقي</button>' : ''}${meta(it)}</div>`;
  }
  function structHtml(it) {
    if (it.empty) return `<div class="ai-bub ans"><p>لم أجد في ${esc(it.range)} سطوراً تشبه العناوين (قصيرة، أو أكبر خطاً، أو غامقة، أو في الوسط).</p></div>`;
    const rows = it.rows
      .map(
        (r, k) => `<li class="st-r ${r.state || ''}" data-k="${k}">
          <label class="st-c"><input type="checkbox" data-x="on" ${r.on ? 'checked' : ''} ${r.state === 'done' ? 'disabled' : ''}></label>
          <button type="button" class="st-t" data-x="go"><b class="${r.level ? 'l' + r.level : 'l0'}">${esc(cut(r.text, 80))}</b><small>${esc(r.from)} ← ${r.level ? esc(levelName(r.level)) : 'فقرة'}${r.why && r.level ? ' · ' + esc(r.why) : ''}</small></button>
          ${r.level && r.state !== 'done' ? `<span class="st-lv" role="group">${[1, 2, 3, 4].map((l) => `<button type="button" data-x="lv" data-l="${l}" aria-pressed="${r.level === l}" title="${esc(levelName(l))}">${ar(l)}</button>`).join('')}</span>` : r.state === 'done' ? '<span class="fx-st ok">✓</span>' : ''}
        </li>`,
      )
      .join('');
    const on = it.rows.filter((r) => r.on && r.state !== 'done').length;
    const head = it.running ? '' : it.rows.length ? `<b>${cnt(it.rows.length, 'تغيير')} في العناوين</b><small>من ${cnt(it.cands, 'سطر')} مرشّحة في ${esc(it.range)}</small>` : it.error ? '' : `<b>✓ العناوين في ${esc(it.range)} كما ينبغي</b>`;
    return `<div class="ai-bub stb">${progress(it, 'ينظر في العناوين')}${head ? `<div class="fx-h col">${head}</div>` : ''}${rows ? `<ol class="st-l">${rows}</ol>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}</div>
      <div class="ai-acts">${on && !it.running ? `<button type="button" class="ai-btn pri" data-x="applystr">علّمها (${ar(on)})</button>` : ''}${meta(it)}</div>`;
  }
  function rolesHtml(it) {
    if (it.empty) return `<div class="ai-bub ans"><p>لا فقرات في ${esc(it.range)}.</p></div>`;
    const rows = it.rows
      .map(
        (r, k) => `<li class="st-r ${r.state || ''}" data-k="${k}">
          <label class="st-c"><input type="checkbox" data-x="on" ${r.on ? 'checked' : ''} ${r.state === 'done' ? 'disabled' : ''}></label>
          <button type="button" class="st-t" data-x="go"><b class="${r.to === 'matn' ? 'k-m' : ''}">${esc(cut(r.text, 90))}</b><small>${r.to === 'matn' ? 'إلى المتن' : 'إلى ' + esc(roleName('sharh'))}</small></button>
          ${r.state === 'done' ? '<span class="fx-st ok">✓</span>' : ''}
        </li>`,
      )
      .join('');
    const on = it.rows.filter((r) => r.on && r.state !== 'done').length;
    const head = it.running ? '' : it.rows.length ? `<b>${cnt(it.rows.length, 'فقرة')} يُقترح تغييرها</b>` : it.error ? '' : `<b>✓ المتن والشرح في ${esc(it.range)} كما ينبغي</b>`;
    return `<div class="ai-bub stb">${progress(it, 'يميّز المتن من الشرح')}${head ? `<div class="fx-h">${head}</div>` : ''}${rows ? `<ol class="st-l">${rows}</ol>` : ''}${it.error ? `<p class="ai-errline">${esc(it.error)}</p>` : ''}</div>
      <div class="ai-acts">${on && !it.running ? `<button type="button" class="ai-btn pri" data-x="applyroles">طبّقها (${ar(on)})</button>` : ''}${meta(it)}</div>`;
  }

  /* ---- أفعال الرسائل ---- */
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('نُسخ');
    } catch {
      toast('تعذّر النسخ');
    }
  }
  function goTo(t, from, to) {
    const i = t.n != null ? blockOfNote(t.n) : t.b;
    if (i == null || i < 0) return;
    const node = nodeOf(t);
    if (node && node.runs && from != null) select({ level: 'span', t, from, to, text: textOf(node).slice(from, to) });
    else select({ level: 'block', t: t.n != null ? t : { vol: st.vol, b: i } });
    goBlock(i, 'sel');
  }
  function itemAct(card, b, e) {
    const it = byId(card.dataset.item);
    const x = b.dataset.x;
    if (!it || !x) return;
    if (x === 'stop') return stop();
    if (x === 'ask-yes' || x === 'ask-no') {
      if (it.answered) return;
      it.answered = x === 'ask-yes' ? 'yes' : 'no';
      paintItem(it);
      return it.resolve(it.answered === 'yes');
    }
    if (x === 'copy') return copy(it.text + (it.sources && it.sources.length ? '\n\n— المصادر —\n' + it.sources.map((s) => `[${ar(s.n)}] ${s.catName} · ${s.via}${s.title ? ' — ' + s.title : ''}${s.url ? '\n' + s.url : ''}`).join('\n') : ''));
    if (x === 'cite') {
      const d = card.querySelector('details.ai-srcs');
      if (d) d.open = true;
      const li = card.querySelector(`.ai-srcs [data-sn="${b.dataset.n}"]`);
      if (li) {
        li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        li.classList.remove('flash');
        void li.offsetWidth;
        li.classList.add('flash');
      }
      return;
    }
    if (it.type === 'trans') return transAct(it, x, b);
    if (x === 'compare') {
      // الجواب نصٌّ بديل للمحدَّد: يُعرض الفرق ثم يُستبدل
      const u = it.sel.unit;
      const neu = cleanOut(it.text.replace(/^\s*<<<\s*|\s*>>>\s*$/g, ''), u);
      if (neu === u.text) return toast('لا فرق بينهما');
      const fx = pushItem({ role: 'ai', id: ++A.seq, type: 'fix', rows: [{ u, neu, notes: [], state: 'new' }], more: 0, view: 'diff', provider: it.provider, model: it.model });
      return fx;
    }
    if (it.type === 'fix') {
      const row = b.closest('[data-r]');
      if (x === 'view') {
        it.view = b.dataset.v;
        return paintItem(it);
      }
      if (x === 'copyfix') return copy(it.rows.filter((r) => r.state !== 'skip').map((r) => r.neu).join('\n\n'));
      if (x === 'dismiss') {
        for (const r of it.rows) if (r.state === 'new') r.state = 'skip';
        return paintItem(it);
      }
      const list = x === 'apply' ? it.rows.filter((r) => r.state === 'new') : x === 'one' && row ? [it.rows[+row.dataset.r]] : [];
      if (x === 'skip' && row) {
        it.rows[+row.dataset.r].state = 'skip';
        return paintItem(it);
      }
      if (!list.length) return;
      const ops = [];
      for (const r of list) {
        const o = opFor(r.u, r.neu);
        if (o.op) ops.push(o), (r.state = 'done');
        else if (o.same) r.state = 'done';
        else Object.assign(r, { state: 'gone', err: o.err });
      }
      // يبقى المحدَّد محدَّداً بنصه الجديد (نصٌّ في فقرة)
      const one = list.length === 1 && it.rows.length === 1 ? list[0] : null;
      const node = one && nodeOf(one.u.t);
      const keep = one && node && node.runs && one.state === 'done' ? { level: 'span', t: one.u.t, from: one.u.from, to: one.u.from + one.neu.length, text: one.neu } : null;
      applyOps(ops, keep);
      return paintItem(it);
    }
    if (it.type === 'review') {
      const li = b.closest('[data-k]');
      const iss = li && it.issues[+li.dataset.k];
      if (x === 'go' && iss) {
        const n = issueNow(iss);
        return goTo(iss.u.t, n ? n.at : null, n ? n.at + iss.orig.length : null);
      }
      if (x === 'take' && iss) applyIssues([iss]);
      if (x === 'drop' && iss) iss.state = 'skip';
      if (x === 'takeall') applyIssues(it.issues.filter((y) => y.state === 'new'));
      if (x === 'dropall') for (const y of it.issues) if (y.state === 'new') y.state = 'skip';
      return paintItem(it);
    }
    if (it.type === 'edit') {
      const li = b.closest('[data-k]');
      const r = li && it.rows[+li.dataset.k];
      if (x === 'go' && r) return goTo(r.u.t);
      if (x === 'applyedit') return applyEdit(it);
      if (x === 'copyedit') return copy(it.msgs.join('\n\n'));
      if (x === 'dropedit') {
        for (const y of it.rows) if (y.state !== 'done') y.on = false;
        return paintItem(it);
      }
      return;
    }
    if (it.type === 'units' || it.type === 'hints') {
      const li = b.closest('[data-k]');
      const r = li && it.rows[+li.dataset.k];
      if (x === 'go' && r) return goTo({ vol: st.vol, b: it.type === 'units' ? r.i : r.ui });
      if (x === 'applyunits' || x === 'applyunitsl') return applyUnits(it, x === 'applyunitsl');
      if (x === 'applyhints') return applyHints(it);
      return;
    }
    if (it.type === 'structure' || it.type === 'roles') {
      const li = b.closest('[data-k]');
      const r = li && it.rows[+li.dataset.k];
      if (x === 'go' && r) return goTo({ vol: st.vol, b: r.i });
      if (x === 'lv' && r) {
        r.level = +b.dataset.l;
        return paintItem(it);
      }
      if (x === 'applystr') return applyStructure(it);
      if (x === 'applyroles') return applyRoles(it);
    }
  }
  pane.addEventListener('change', (e) => {
    if (e.target.matches && e.target.matches('[data-x="trltr"]')) return LS('warraq.ai.trltr', e.target.checked ? '1' : '0');
    if (e.target.matches && e.target.matches('[data-a="tr-notes"]')) return LS('warraq.ai.trnotes', e.target.checked ? '1' : '0');
    const inp = e.target.closest('[data-x="on"]');
    if (!inp) return;
    const card = inp.closest('[data-item]');
    const it = card && byId(card.dataset.item);
    const li = inp.closest('[data-k]');
    if (!it || !li) return;
    it.rows[+li.dataset.k].on = inp.checked;
    paintItem(it);
  });

  /* ================================================================ مع المحرِّر */
  /** يُستدعى كلما تغيّر التحديد أو الكتاب */
  function sync() {
    const key = st.sel ? JSON.stringify([st.sel.level, st.sel.t || st.sel.blocks, st.sel.from, st.sel.to]) : '';
    if (key !== A.lastSelKey) {
      // تحديدٌ جديد: يعمل عليه؛ وزواله: يرجع إلى الفصل
      A.target = key ? 'sel' : A.target === 'sel' ? null : A.target;
      A.lastSelKey = key;
    }
    if (A.open) {
      paintCtx();
      paintFrame();
      paintPresets();
      if (!A.items.length) paintWelcome();
    }
  }
  /** من موضع التعليق: «اقترحها بالمساعد» — رؤوس مسائل لهذا الجزء */
  async function mutunHints(u) {
    await open(false);
    const c = A.cfg || {};
    if (c.error && c.reason === 'owner') return toast(c.error);
    const p = (c.presets || []).find((x) => x.id === 'mu-hints-sel');
    const prompt = (p && p.prompt) || 'اكتب رؤوس مسائل لهذا الجزء من المتن.';
    pushItem({ role: 'user', id: ++A.seq, text: prompt, title: (p && p.title) || 'رؤوس مسائل لجزئه', where: `الجزء ${ar(u.k + 1)}` });
    return runHints({ prompt, t: 'sel', unit: u });
  }
  return { open, close, sync, mutunHints, get isOpen() {
    return A.open;
  } };
}
