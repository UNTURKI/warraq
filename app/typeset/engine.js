/* محرّك التنضيد في «ورّاق» — يعمل داخل Chromium (Playwright) لتقسيم الكتاب إلى صفحات
 * Al-Warraq pagination engine. Runs inside headless Chromium; the result is printed to PDF.
 *
 * - يبني الصفحات فعلياً في DOM ويقيس كل صفحة (fit-check) بدقة البكسل.
 * - يقسم الفقرة الطويلة على حدود الأسطر بالبحث الثنائي على الكلمات.
 * - يضع كل حاشية في صفحة إحالتها، ويقسم الحاشية الطويلة وينقل بقيتها لحاشية الصفحة التالية.
 * - يرقّم الحواشي من (١) في كل صفحة، وبالأرقام العربية المشرقية.
 * - يبني الفهرس بنقاط متصلة وأرقام صفحات صحيحة (بعد معرفة مواضع العناوين).
 */
(function () {
  'use strict';
  const DATA = JSON.parse(document.getElementById('book-data').textContent);
  const S = DATA.settings;
  const DOC = DATA.doc;
  const NOTES = DOC.notes || {};
  // المحرِّر: الصفحات المنضَّدة نفسها، وكل قطعة وكلمة فيها تعرف موضعها مما حلّله المحلّل (لتُحدَّد وتُعدَّل)
  const ED = !!(DATA.preview && DATA.preview.editor);
  // كتب «المتن أعلى الصفحة ثم خط ثم الشرح»: الشرح يجري في قسم مستقل تحت الخط ويستمر عبر الصفحات
  const SPLIT = DOC.layout === 'split';
  // نظام العناوين المعتمد (الجزء/الباب، الفصل، المبحث، المطلب): دور كل عنوانٍ في b.hr (shared/typo-rules.js)
  const HS = S.headScheme === 'pro';
  const EAST = '٠١٢٣٤٥٦٧٨٩';
  const ar = (n) => String(n).replace(/[0-9]/g, (d) => EAST[+d]);
  // الفاصل بين شطري البيت: لا شيء / رمز / ثلاثة رموز
  // وضع الشطرين: في سطر واحد، أو الثاني في السطر التالي (تحته، أو بعده متداخلاً معه). الفاصل للسطر الواحد فقط.
  // أنماط الشعر: موازي (line)، سلّمي (stack، ومتداخله stagger)، وسط (center). والثلاثي والتخميس يُجمعان في التأليف (compose)
  // أبياتاً موازية، وآخر كل مجموعة شطرٌ وحده في الوسط
  const VL_OK = ['line', 'stack', 'stagger', 'center'];
  const VLAYOUT = VL_OK.includes(S.verseLayout) ? S.verseLayout : 'line';
  const VSEP = VLAYOUT !== 'line' ? '' : S.verseSep === 'one' ? S.verseSepSymbol || '✽' : S.verseSep === 'three' ? [1, 2, 3].map(() => S.verseSepSymbol || '✽').join(' ') : '';
  // وضعٌ لقصيدةٍ بعينها (من «المحرِّر») يعلو وضع الأسلوب
  const layoutOf = (b) => (b && VL_OK.includes(b.vl) ? b.vl : b && (b.vl === 'tri' || b.vl === 'khams') ? 'line' : VLAYOUT);
  const sepOf = (b) => {
    if (!b || (!b.vl && !b.vs)) return VSEP;
    if (layoutOf(b) !== 'line') return '';
    const vs = b.vs || S.verseSep;
    const sym = S.verseSepSymbol || '✽';
    return vs === 'one' ? sym : vs === 'three' ? [sym, sym, sym].join(' ') : '';
  };
  const verseInner = (a, b, sep = VSEP) =>
    '<span class="hm">' + esc(a) + '</span>' + (sep ? '<span class="vsep">' + esc(sep) + '</span>' : '') + '<span class="hm">' + esc(b) + '</span>';
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  /**
   * الشطر وما فيه من آية: النص (ممدوداً بالكشيدة أو لا) يُكتب، وما كان آيةً منه في <span class="q">.
   * مواضع الآية على النص الأصلي (data-q)، والكشيدة المزيدة تتبع الحرف الذي قبلها.
   */
  function hmPaint(sp, txt) {
    let q = null;
    try {
      q = sp.dataset.q ? JSON.parse(sp.dataset.q) : null;
    } catch {}
    if (!q || !q.length) {
      sp.textContent = txt;
      return;
    }
    const o = sp.dataset.orig || txt;
    const inQ = (k) => q.some(([a, z]) => k >= a && k < z);
    let j = 0;
    let html = '';
    let run = '';
    let cur = null;
    for (let i = 0; i < txt.length; i++) {
      let k;
      if (j < o.length && txt[i] === o[j]) k = j++;
      else k = Math.max(0, j - 1);
      const w = inQ(k);
      if (cur !== null && w !== cur) {
        html += cur ? '<span class="q">' + esc(run) + '</span>' : esc(run);
        run = '';
      }
      cur = w;
      run += txt[i];
    }
    if (run) html += cur ? '<span class="q">' + esc(run) + '</span>' : esc(run);
    sp.innerHTML = html;
  }
  const MM = 96 / 25.4;
  const book = document.getElementById('book');
  // الهامش الخارجي الواسع (shared/margin.js): النص أضيق، والهامش في طرف الكتاب أوسع. والصفحة اليسرى: الفردية (الأصل) أو الزوجية (ODD_R)
  const OM = S.outerMargin && typeof S.outerMargin === 'object' && S.outerMargin.on ? S.outerMargin : null;
  const ODD_R = !!(OM && OM.odd === 'r');
  /** أهي صفحة يسرى؟ (pos موضعها في الكتاب) — كعب اليسرى يمين وطرفها الخارجي يسار، واليمنى عكسها */
  const leftPos = (pos) => (Math.abs(Math.round(+pos || 1)) % 2 === 1) !== ODD_R;
  /** نص الهامش في خانةٍ بقدره (من الأسلوب أو اختيار المستخدم) */
  const SIDE_FRAMED = !!(S.sideNote && S.sideNote.box);
  // ما اختاره المستخدم أصنافاً على #book: ليتبع تنسيقُ البطاقة (CSS) كل خيارٍ يُفعَّل أو يُطفأ، في الكتب والأبحاث والمتون
  // (المرجع: «حالة الإعدادات» في docs/style-card-spec.md)
  {
    const M = DOC.mutun || null;
    const work = M ? 'mutun' : S.template === 'research' || S.research ? 'research' : 'books';
    const c = ['w-' + work, 'tpl-' + (S.template || 'full'), 'toc-' + (S.tocPosition || 'end'), 'paper-' + (S.paper === 'yellow' ? 'yellow' : 'white'), 'vlay-' + VLAYOUT];
    if (S.footnotes === false) c.push('no-fn');
    if (S.runningHead === false) c.push('no-rh');
    if (S.chapterNewPage === false) c.push('no-newpage');
    if (S.ornaments === false) c.push('no-orn');
    if (S.frame) c.push('has-frame');
    if (S.printReady) c.push('print-ready');
    if (S.innerCover === false || DOC.ownCover) c.push('no-cover');
    if (S.bgs && Object.keys(S.bgs).length) c.push('has-bgs');
    if (OM) c.push('om-wide', ODD_R ? 'om-odd-r' : 'om-odd-l');
    if (SIDE_FRAMED) c.push('side-box');
    if (HS) c.push('hs-pro'); // نظام العناوين: التقسيم العلمي
    if (work === 'research') c.push('r-' + (S.rlayout || 'uni'));
    if (M) {
      c.push('mu-' + (M.place || 'page'), 'mu-rule-' + (M.rule || 'lines'), M.poem ? 'mu-poem' : 'mu-prose');
      if (M.place === 'page') c.push('mu-side-' + (M.side || 'free'));
      if (M.place === 'side') c.push('mu-col-' + (M.colSide || 'right'));
      if (M.label) c.push('mu-label');
      if (M.intro || M.intros) c.push('mu-intro');
      if (M.center) c.push('mu-center');
      if (M.keep) c.push('mu-keep');
      if (M.poem) c.push('mu-num-' + (S.mNum || 'side'), 'mu-seq-' + (S.mSeq || 'off'));
      if (S.mOwner && S.mOwner.on && Array.isArray(S.mOwner.fields) && S.mOwner.fields.length && !c.includes('no-cover')) c.push('mu-owner');
    }
    book.classList.add(...c);
  }

  /* ------------------------------------------------------------ قوالب الأسلوب (من بطاقة الأسلوب) */
  // البطاقة قد تحمل قوالب HTML لعناصر الصفحة وصفحات خاصة، فيتغير شكل الكتاب وبنيته دون تعديل المحرك.
  const TPL = DATA.tpl || {}; // h1..h4, folio, rh, cover, page, chapterPage, ornament
  const XPAGES = Array.isArray(DATA.pages) ? DATA.pages : []; // صفحات خاصة: { at, html, name, folio }
  const OPTS = DATA.opts || {};
  const ORD1 = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];
  const ORDC = ['', 'الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع'];
  const ORDT = ['', '', 'العشرون', 'الثلاثون', 'الأربعون', 'الخمسون', 'الستون', 'السبعون', 'الثمانون', 'التسعون'];
  const ordinal = (n) =>
    n >= 1 && n <= 10 ? ORD1[n] : n < 20 ? ORDC[n - 10] + ' عشر' : n < 100 ? (n % 10 ? ORDC[n % 10] + ' و' + ORDT[(n / 10) | 0] : ORDT[(n / 10) | 0]) : ar(n);
  /** تعبئة قالب: {{key}} قيمة (مهرَّبة) · {{#key}}…{{/key}} يظهر إن وُجدت القيمة · {{^key}}…{{/key}} إن غابت */
  function fill(str, vars) {
    let out = String(str || '');
    for (let i = 0; i < 4 && /\{\{[#^]/.test(out); i++) {
      out = out.replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (m, t, k, body) => ((t === '#') === !!vars[k] ? body : ''));
    }
    return out.replace(/\{\{(\w+)\}\}/g, (m, k) => esc(vars[k] == null ? '' : vars[k]));
  }
  const numVars = (n) => ({ n, n_ar: ar(n), n_word: ordinal(n) });
  const warnings = [];

  /* ------------------------------------------------------------ برنامج الأسلوب (كود من بطاقة الأسلوب) */
  // البطاقة قد تحمل كوداً يتحكم في آلية التنضيد نفسها. يسجّل دواله هنا قبل بدء التنضيد:
  //   W.on(حدث, دالة)   يُستدعى عند كل حدث (doc · page · para · note · block · order · pageDone · done)
  //   W.set(اسم, دالة)   يستبدل جزءاً من المحرك (used · capacity · lines · place)
  // خطأ في دالة لا يوقف التنضيد: يُسجَّل تنبيهاً (script:…) ويُكمل المحرك عمله الافتراضي.
  const HOOKS = {};
  const OVER = {};
  const scriptWarn = (where, e) => {
    const m = 'script:' + where + ': ' + String((e && e.message) || e).slice(0, 240);
    if (warnings.length < 60 && !warnings.includes(m)) warnings.push(m);
  };
  function emit(name) {
    if (ED && (name === 'block' || name === 'para') && arguments[1] && arguments[1].nodeType === 1 && arguments[2] && arguments[2]._i != null) arguments[1].dataset.i = arguments[2]._i;
    const list = HOOKS[name];
    if (!list) return;
    const args = Array.prototype.slice.call(arguments, 1);
    for (const fn of list) {
      try {
        fn.apply(null, args);
      } catch (e) {
        scriptWarn(name, e);
      }
    }
  }
  /** يستدعي بديل البطاقة إن وُجد ونجح، وإلا العمل الافتراضي */
  function over(name, def) {
    const fn = OVER[name];
    if (!fn) return def();
    try {
      const args = Array.prototype.slice.call(arguments, 2);
      args.push(def);
      const v = fn.apply(null, args);
      return v === undefined ? def() : v;
    } catch (e) {
      scriptWarn(name, e);
      return def();
    }
  }
  window.addEventListener('error', (e) => scriptWarn('error', e.message || e.error));
  const W = (window.Warraq = {
    version: 3,
    doc: DOC,
    notes: NOTES,
    settings: S,
    cover: DATA.cover || {},
    MM,
    ar,
    esc,
    fill,
    ordinal,
    on(name, fn) {
      if (typeof fn === 'function') (HOOKS[name] = HOOKS[name] || []).push(fn);
      return W;
    },
    set(name, fn) {
      if (typeof fn === 'function') OVER[name] = fn;
      return W;
    },
    warn: (m) => scriptWarn('warn', m),
    /** أدوات المحرك نفسها، لمن يكتب منطق توزيع خاصاً (W.set('place', …)) */
    engine: {
      makePage: (kind) => makePage(kind),
      newBodyPage: () => newBodyPage(),
      placePara: (block) => placePara(block),
      placeAtomic: (el, reserve) => placeAtomic(el, reserve),
      headingEl: (b) => headingEl(b, headingVars(b)),
      fits: (p, reserve) => fits(p, reserve),
      used: (p) => used(p),
      pageEmpty: (p) => pageEmpty(p),
      get cur() { return cur; },
      get pages() { return pages; },
      get lineHeight() { return LINE_H; },
      get bodyHeight() { return BODY_H; },
    },
  });

  const bodyHmm = S.page.h - S.page.top - S.page.bottom;
  let BODY_H = bodyHmm * MM;
  let LINE_H = 0; // يقاس بعد تحميل الخطوط
  const NOTE_GAP = 2.2 * MM; // مسافة بين آخر المتن وخط الحاشية

  /* ------------------------------------------------------------ صفحات */
  const pages = []; // {el, flow, notes, kind, noteNum:Map, nextNum, headings:[], carry:[]}
  function makePage(kind) {
    const el = document.createElement('section');
    el.className = 'page ' + kind;
    el.innerHTML =
      '<div class="rh"></div><div class="body"><div class="flow"></div>' +
      '<div class="notes' + (SPLIT ? ' sh' : '') + '"><div class="fnsep"></div></div></div><div class="folio"></div>';
    book.appendChild(el);
    const p = {
      el,
      kind,
      flow: el.querySelector('.flow'),
      notes: el.querySelector('.notes'),
      noteNum: new Map(),
      nextNum: 1,
      headings: [],
      carryOut: [],
    };
    pages.push(p);
    emit('page', p);
    return p;
  }

  function usedDefault(p) {
    const f = p.flow.getBoundingClientRect().height;
    const hasNotes = p.notes.childElementCount > 1;
    const n = hasNotes ? p.notes.getBoundingClientRect().height + NOTE_GAP : 0;
    return f + n;
  }
  // used: ما شُغل من الصفحة · capacity: ما تسعه (بدائل البطاقة تجعل لكل صفحة منطق قياسها: أعمدة، مناطق…)
  const used = (p) => (OVER.used ? over('used', () => usedDefault(p), p) : usedDefault(p));
  const capacity = (p) => (OVER.capacity ? over('capacity', () => BODY_H, p) : BODY_H);
  const fits = (p, reserve = 0) => used(p) + reserve <= capacity(p) + 0.5;
  // عدد أسطر عنصر
  const linesOf = (el) => (OVER.lines ? over('lines', () => Math.round(el.getBoundingClientRect().height / LINE_H), el) : Math.round(el.getBoundingClientRect().height / LINE_H));
  const pageEmpty = (p) => p.flow.childElementCount === 0;

  /* ------------------------------------------------------------ تنسيق ما خُصّ من النص (من المحرِّر) */
  // st: { size نسبة، bold، color، font خط، it مائل، ul تحته خط، sk يتوسطه خط، bg تظليل، up رفع (جزء من مئة من em)،
  //       va مرتفع/منخفض، ws تباعد الكلمات (٪ من em)، ks مدّ الكلمة بالكشيدة }
  const HEX = /^#[0-9a-f]{6}$/i;
  const famOf = (f) => "'" + String(f).replace(/['"\\;{}<>]/g, '').slice(0, 80) + "', var(--f-body)";
  function stCss(st) {
    if (!st || typeof st !== 'object') return '';
    let c = '';
    const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null);
    const size = num(st.size, 0.3, 4);
    if (size && size !== 1) c += 'font-size:' + Math.round(size * 1000) / 10 + '%;';
    if (st.bold) c += 'font-weight:700;';
    if (st.bold === 0) c += 'font-weight:400;';
    if (HEX.test(st.color || '')) c += 'color:' + st.color + ';';
    if (st.font) c += 'font-family:' + famOf(st.font) + ';';
    if (st.it) c += 'font-style:italic;';
    const deco = (st.ul ? 'underline ' : '') + (st.sk ? 'line-through' : '');
    if (deco) c += 'text-decoration:' + deco.trim() + ';text-underline-offset:.32em;text-decoration-thickness:.055em;text-decoration-skip-ink:none;';
    if (HEX.test(st.bg || '')) c += 'background-color:' + st.bg + ';-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.12em;';
    if (st.va === 'sup') c += 'font-size:.62em;position:relative;top:-.62em;line-height:0;';
    else if (st.va === 'sub') c += 'font-size:.62em;position:relative;top:.24em;line-height:0;';
    else if (num(st.up, -200, 200)) c += 'position:relative;top:' + -num(st.up, -200, 200) / 100 + 'em;';
    if (num(st.ws, -50, 300)) c += 'word-spacing:' + num(st.ws, -50, 300) / 100 + 'em;';
    return c;
  }
  const SX_KEY = new Map();
  const SX_CSS = [];
  /** صنفٌ لكل تنسيق مختلف (فتتصل الكلمات المتجاورة بالتنسيق نفسه في عنصر واحد) */
  function sxOf(st) {
    const css = stCss(st);
    if (!css) return '';
    let k = SX_KEY.get(css);
    if (k == null) {
      k = SX_CSS.length;
      SX_CSS.push(css);
      SX_KEY.set(css, k);
    }
    return ' sx-' + k;
  }
  /** تنسيق الفقرة: المحاذاة، المسافة البادئة للسطر الأول، البعد عن الحافتين، ما قبلها وما بعدها، ارتفاع السطر */
  function psCss(ps, first, last) {
    if (!ps || typeof ps !== 'object') return '';
    const n = (v, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : null);
    let c = '';
    if (first && n(ps.ind, -60, 120) != null) c += 'text-indent:' + n(ps.ind, -60, 120) + 'mm;';
    if (n(ps.is, -40, 120)) c += 'margin-inline-start:' + n(ps.is, -40, 120) + 'mm;';
    if (n(ps.ie, -40, 120)) c += 'margin-inline-end:' + n(ps.ie, -40, 120) + 'mm;';
    if (first && n(ps.sb, -20, 200) != null) c += 'margin-top:' + n(ps.sb, -20, 200) + 'mm;';
    if (last && n(ps.sa, -20, 200) != null) c += 'margin-bottom:' + n(ps.sa, -20, 200) + 'mm;';
    if (n(ps.lh, 0.8, 5)) c += 'line-height:' + n(ps.lh, 0.8, 5) + ';';
    return c;
  }
  const BOXES = ['box', 'shade', 'side', 'double'];
  // القوائم: نقطة، أو ترقيم (١- أو (١) أو أولاً، ثانياً…)
  const ORDW = ['أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً', 'ثامناً', 'تاسعاً', 'عاشراً', 'حادي عشر', 'ثاني عشر', 'ثالث عشر', 'رابع عشر', 'خامس عشر'];
  function listMark(ls, n) {
    if (ls === 'b') return '•';
    if (ls === 'd') return '◆';
    if (ls === 'p') return '(' + ar(n) + ')';
    if (ls === 'w') return (ORDW[n - 1] || ar(n)) + ':';
    return ar(n) + '-';
  }
  const boxCls = (ps) => (ps && BOXES.includes(ps.bx) ? ' bx bx-' + ps.bx : '');
  /** الهامش الجانبي (من المحرِّر): نصٌّ منسَّق في هامش الصفحة بجانب أول القطعة: الأيمن (r)، والأيسر (l)،
   *  والمتبادل (a: بحسب الصفحة فردية أو زوجية، alt). يوضع بعد التنضيد والترقيم (placeSides) */
  const SIDE_K = ['r', 'l', 'a'];
  const SIDES = [];
  function sidePartOf(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v.trim() ? { runs: [{ k: 't', s: v.trim().slice(0, 1200) }] } : null;
    if (typeof v !== 'object' || !Array.isArray(v.runs)) return null;
    const runs = v.runs.filter((r) => r && r.k !== 'r' && typeof r.s === 'string' && r.s);
    return runs.map((r) => r.s).join('').trim() ? { runs, al: v.al, ps: v.ps, box: sideBoxOf(v.box) } : null;
  }
  /** حدود الهامش التي اختارها المستخدم (مم): العرض، والارتفاع، والبعد عن أول قطعته، والبعد عن حافة الصفحة */
  function sideBoxOf(b) {
    if (!b || typeof b !== 'object') return null;
    const o = {};
    const lim = { w: [6, 160], h: [4, 280], dy: [-250, 300], x: [-20, 200] };
    for (const k in lim) if (b[k] != null && b[k] !== '' && Number.isFinite(+b[k])) o[k] = Math.min(lim[k][1], Math.max(lim[k][0], +b[k]));
    return Object.keys(o).length ? o : null;
  }
  function sideTag(el, b) {
    const sd = b && b.side;
    if (!sd || typeof sd !== 'object') return;
    const parts = {};
    for (const k of SIDE_K) {
      const p = sidePartOf(sd[k]);
      if (p) parts[k] = p;
    }
    if (!Object.keys(parts).length) return;
    // (بياناته في جدولٍ برقمه لا على العنصر: الفقرة المقسومة بين صفحتين يُنسخ عنصرها)
    SIDES.push({ parts, alt: sd.alt === 'ol' || sd.alt === 'out' ? sd.alt : 'or', i: b._i });
    el.dataset.side = String(SIDES.length - 1);
  }
  /** في أي جهةٍ يقع الهامش k في الصفحة n (وleft: أهي يسرى) — والمتبادل «في الطرف الخارجي» (out): يسار اليسرى ويمين اليمنى */
  const sideSlotOf = (k, alt, n, left) =>
    k !== 'a' ? (k === 'l' ? 'l' : 'r') : alt === 'out' ? (left ? 'l' : 'r') : (alt === 'ol') === (Math.abs(Math.round(+n || 1)) % 2 === 1) ? 'l' : 'r';
  /** طولٌ في CSS (مم، سم، نقطة، بكسل) ← بكسل */
  const lenPx = (v) => {
    const m = /^\s*(-?[\d.]+)\s*(mm|cm|pt|px)?\s*$/.exec(String(v || ''));
    if (!m) return 0;
    const n = parseFloat(m[1]) || 0;
    return m[2] === 'cm' ? n * 10 * MM : m[2] === 'pt' ? (n * 96) / 72 : m[2] === 'px' ? n : n * MM;
  };
  const SIDE_AL = { r: 'right', l: 'left', c: 'center', j: 'justify' };
  /** نص الهامش بتنسيق كلماته (وفي المحرِّر: كل مقطعٍ بموضعه من النص، فيُكتب فيه ويُحدَّد كسائر النصوص) */
  function sideHtml(part) {
    let o = 0;
    let h = '';
    for (const r of part.runs) {
      const css = stCss(r.st);
      h += '<i class="ew' + (r.k === 'q' ? ' q' : '') + '" data-o="' + o + '"' + (css ? ' style="' + css.replace(/"/g, '&quot;') + '"' : '') + '>' + esc(r.s) + '</i>';
      o += r.s.length;
    }
    return h;
  }
  /** نصوص الهوامش الجانبية في كل صفحة: في هامشها بإزاء قطعتها، وما تزاحم منها نزل تحت سابقه.
   *  وحدودها من بطاقة الأسلوب (متغيرات على الصفحة، والإطار الجاهز يضعها):
   *    --mside-clear  بُعدٌ عن حافة النص يبقى خالياً (ما بين النص وإطاره)
   *    --mside-edge   بُعدها عن حافة الورق (الأصل: ٥ مم في الهامش الواسع، و١٫٦ مم في غيره) — يُؤخذ حيث يبقى للنص ١٠ مم
   *    --mside-bottom أدنى ما تنزل إليه من أسفل الصفحة (الأصل ٤ مم) */
  function placeSides(list) {
    for (const p of list) {
      // كل هامشٍ مرةً واحدة: في أول موضعٍ من قطعته
      const els = [...p.el.querySelectorAll('[data-side]')].filter((el) => SIDES[+el.dataset.side] && !SIDES[+el.dataset.side].done);
      if (!els.length) continue;
      const body = p.el.querySelector('.body');
      if (!body) continue;
      const pr = p.el.getBoundingClientRect();
      const br = body.getBoundingClientRect();
      const k = pr.width / (p.el.offsetWidth || pr.width) || 1; // (المعاينة المصغّرة)
      const pcs = getComputedStyle(p.el);
      const clear = Math.max(0, lenPx(pcs.getPropertyValue('--mside-clear')));
      const edgeV = Math.max(0, lenPx(pcs.getPropertyValue('--mside-edge')));
      const botV = Math.max(0, lenPx(pcs.getPropertyValue('--mside-bottom'))) || 4 * MM;
      const mR = (pr.right - br.right) / k;
      const mL = (br.left - pr.left) / k;
      const H = p.el.offsetHeight;
      const GAP = 1.6 * MM;
      const BOT = Math.min(botV, H / 2);
      const low = { r: 0, l: 0 };
      const no = p.number != null ? p.number : p.pos;
      const left = p.el.classList.contains('pg-l');
      for (const el of els) {
        const er = el.getBoundingClientRect();
        const S1 = SIDES[+el.dataset.side];
        S1.done = true;
        const { parts, alt, i } = S1;
        for (const key of SIDE_K) {
          const part = parts[key];
          if (!part) continue;
          const sd = sideSlotOf(key, alt, no, left);
          // ما يسعه الهامش: من حافة الصفحة إلى ما قبل حافة النص (أو إطاره)
          const m = Math.max(0, (sd === 'r' ? mR : mL) - clear);
          const bx = part.box;
          // الهامش الضيق لا يسع نصاً، إلا ما اختار له المستخدم عرضه
          if (m < 6 * MM && !(bx && bx.w)) continue;
          const n = document.createElement('div');
          // في خانة: إطارٌ بقدر نصه (يضيق بقصره، ولا يزيد على الهامش)
          const framed = SIDE_FRAMED;
          n.className = 'mside-n ' + sd + (key === 'a' ? ' alt' : '') + (bx ? ' boxed' : '') + (framed ? ' framed' : '');
          n.innerHTML = sideHtml(part);
          if (SIDE_AL[part.al]) n.style.textAlign = SIDE_AL[part.al];
          if (part.ps && Number.isFinite(+part.ps.lh) && +part.ps.lh >= 0.8 && +part.ps.lh <= 5) n.style.lineHeight = String(+part.ps.lh);
          if (ED && i != null) {
            n.dataset.si = i;
            n.dataset.k = key;
          }
          // العرض والموضع: ما اختاره المستخدم (box)، وإلا فالهامش كله وفي وسطه
          // (والهامش الواسع: يبعد عن حافة الورق ٥ مم، فلا يقترب من موضع القصّ)
          // (وبُعدٌ من البطاقة عن حافة الورق، ما دام يبقى بعده للنص ١٠ مم)
          const edge = edgeV && m - edgeV - GAP >= 10 * MM ? edgeV : OM && m >= 24 * MM ? 5 * MM : GAP;
          const w = bx && bx.w ? bx.w * MM : Math.max(10 * MM, m - edge - GAP);
          if (framed && !(bx && bx.w)) {
            n.style.width = 'max-content';
            n.style.maxWidth = w + 'px';
          } else n.style.width = w + 'px';
          if (bx && bx.h) n.style.minHeight = bx.h * MM + 'px';
          // الارتفاع: بإزاء أول القطعة، أو بُعدٌ عنه اختاره المستخدم (فلا يُدفع تحت ما قبله)
          const fixed = !!(bx && bx.dy != null);
          let top = (er.top - pr.top) / k + (fixed ? bx.dy * MM : 0);
          top = fixed ? Math.max(0, top) : Math.max(top, low[sd]);
          n.style.top = top + 'px';
          p.el.appendChild(n);
          const aw = n.offsetWidth || w;
          n.style[sd === 'r' ? 'right' : 'left'] = (bx && bx.x != null ? bx.x * MM : edge === GAP ? Math.max(GAP * 0.6, (m - aw) / 2) : edge + Math.max(0, (m - edge - GAP - aw) / 2)) + 'px';
          const h = n.offsetHeight;
          if (top + h > H - BOT) n.style.top = Math.max(fixed ? 0 : low[sd], H - BOT - h) + 'px';
          low[sd] = Math.max(low[sd], (parseFloat(n.style.top) || top) + h + GAP);
        }
      }
    }
  }

  /* ------------------------------------------------------------ تقطيع الفقرة إلى وحدات قابلة للكسر */
  const BR = { '()': ['(', ')'], '«»': ['«', '»'], '[]': ['[', ']'], '{}': ['{', '}'], none: ['', ''] };

  function tokenize(runs) {
    // وحدة = كلمة (أو مجموعة ملتصقة بلا مسافة) ؛ الجزء = {s, c} أو {ref}
    const units = [];
    let space = true;
    const [bo, bc] = BR[S.matnBrackets] || BR['()'];
    let prevK = null;
    for (let i = 0; i < runs.length; i++) {
      const r = runs[i];
      if (r.k === 'r') {
        if (!units.length) units.push({ parts: [] });
        units[units.length - 1].parts.push({ ref: r.id });
        space = false;
        prevK = 'r';
        continue;
      }
      let s = r.s;
      let c = r.k === 'm' ? (r.q ? 'mq' : 'm') : r.k === 't' ? '' : r.k === 'ht' ? 'ht x-' + r.id : r.k;
      // تنسيق كلمةٍ بعينها (من المحرِّر): الخط ومقاسه ولونه، والعريض والمائل، والتظليل، والرفع، والتباعد
      // خط الملف ومقاسه في كلماته («كما في الملف» وحده: الأسلوب يقرر غيره)، وتحته ما خُصّ به في المحرِّر
      const fst = S.fileFmt && r.k === 'f' && (r.ff || r.fz) ? { ...(r.ff ? { font: r.ff } : {}), ...(+r.fz ? { size: +r.fz } : {}) } : null;
      const rst = r.st && typeof r.st === 'object' ? (fst ? { ...fst, ...r.st } : r.st) : fst;
      const stCls = rst ? sxOf(rst) : '';
      const ks = rst && rst.ks > 0 ? Math.min(9, rst.ks | 0) : 0; // مدّ الكلمة بالكشيدة
      // نص بتنسيق المؤلف (ملف Word): عريض، مسطّر، ملوّن
      if (r.k === 'f') c = 'f' + (r.b ? ' fb' : '') + (r.u ? ' fu' : '') + (/^#[0-9a-f]{6}$/i.test(r.c || '') ? ' fc-' + r.c.slice(1).toLowerCase() : '');
      if (stCls) c = (c ? c + ' ' : 'f ') + 'st' + stCls;
      if (r.k === 'rs') {
        // رقم إحالة ثابت (حاشية داخل الشرح): يلتصق بما قبله
        if (!units.length) units.push({ parts: [] });
        units[units.length - 1].parts.push(ED && r._o != null ? { s: r.s, c: 'rs', o: r._o } : { s: r.s, c: 'rs' });
        space = false;
        continue;
      }
      // موضع كل كلمة من نص القطعة (للمحرِّر): القوسان المضافان للمتن ليسا من النص
      let pre = 0;
      // في المحرِّر: قوسا المتن عنصران مستقلان (ليسا من النص، فلا يدخلان فيما يُكتب)
      let edPre = '';
      let edPost = '';
      if (r.k === 'm') {
        const nextIsM = runs.slice(i + 1).find((x) => x.k !== 'r');
        const lead = s.match(/^\s*/)[0];
        const trail = s.match(/\s*$/)[0];
        let core = s.trim();
        if (ED) {
          if (prevK !== 'm') edPre = bo;
          if (!nextIsM || nextIsM.k !== 'm') edPost = bc;
        } else {
          if (prevK !== 'm') core = bo + core;
          if (!nextIsM || nextIsM.k !== 'm') core = core + bc;
          s = lead + core + trail;
          if (prevK !== 'm') pre = bo.length;
        }
      }
      prevK = r.k;
      let at = (r._o != null ? r._o : -1) - pre;
      let firstPiece = true;
      let lastPart = null;
      for (const piece of s.split(/(\s+)/)) {
        if (!piece) continue;
        const o = at;
        at += piece.length;
        if (/^\s+$/.test(piece)) {
          space = true;
          continue;
        }
        const part = { s: ks && window.WarraqKashida ? window.WarraqKashida.stretch(piece, ks, ks) : piece, c };
        if (ED && r._o != null) {
          part.o = Math.max(r._o, o + (firstPiece ? pre : 0));
          part.x = firstPiece ? pre : 0;
          if (part.s !== piece) part.t = piece; // الكلمة قبل مدّها
          if (firstPiece && edPre) part.pre = edPre;
        }
        firstPiece = false;
        lastPart = part;
        if (!space && units.length) units[units.length - 1].parts.push(part);
        else units.push({ parts: [part] });
        space = false;
      }
      if (lastPart && edPost) lastPart.post = edPost;
    }
    return units.filter((u) => u.parts.length);
  }

  // تحويل مدى من الوحدات إلى HTML مع دمج المقاطع المتجاورة ذات النمط نفسه
  function unitsHtml(units, a, b, refNum) {
    let html = '';
    let open = null;
    const openSpan = (c) => {
      if (open === c) return;
      if (open) html += '</span>';
      open = c || null;
      if (open) {
        const hid = /x-(\S+)/.exec(open);
        const fc = /(?:^| )fc-([0-9a-f]{6})(?: |$)/.exec(open);
        const fs = /(?:^| )fs-(\d{2,3})(?: |$)/.exec(open);
        const sx = /(?:^| )sx-(\d+)(?: |$)/.exec(open);
        const sty = (fc ? 'color:#' + fc[1] + ';' : '') + (fs ? 'font-size:' + fs[1] + '%;' : '') + (sx ? SX_CSS[+sx[1]] || '' : '');
        html += '<span class="' + open + '"' + (hid ? ' id="' + hid[1] + '"' : '') + (sty ? ' style="' + sty + '"' : '') + '>';
      }
    };
    for (let i = a; i < b; i++) {
      const u = units[i];
      // المسافة بين كلمتين لا تدخل في تنسيق المؤلف (عريض، مسطّر) إن انتهى عند الكلمة الأولى
      if (i > a && open && open[0] === 'f' && open[1] !== 'r' && (u.parts[0].ref || (u.parts[0].c || null) !== open)) openSpan(null);
      if (i > a) html += ' ';
      for (const part of u.parts) {
        if (part.ref) {
          openSpan(null);
          const n = refNum(part.ref);
          html += '<span class="fr"' + (ED ? ' data-r="' + esc(part.ref) + '"' : '') + '>(' + ar(n) + ')</span>';
        } else {
          openSpan(part.c);
          // المحرِّر: كل كلمة تعرف موضعها من نص قطعتها
          html += ED && part.o != null
            ? (part.pre ? '<i class="mb">' + esc(part.pre) + '</i>' : '') +
              '<i class="ew" data-o="' + part.o + '"' + (part.x ? ' data-x="' + part.x + '"' : '') + (part.g != null ? ' data-g="' + part.g + '"' : '') + (part.t ? ' data-t="' + esc(part.t) + '"' : '') + '>' + esc(part.s) + '</i>' +
              (part.post ? '<i class="mb">' + esc(part.post) + '</i>' : '')
            : esc(part.s);
        }
      }
    }
    openSpan(null);
    return html;
  }

  function refsIn(units, a, b) {
    const ids = [];
    for (let i = a; i < b; i++) for (const p of units[i].parts) if (p.ref && !ids.includes(p.ref)) ids.push(p.ref);
    return ids;
  }

  /* ------------------------------------------------------------ الحواشي */
  const noteUnitsCache = new Map();
  function noteUnits(id) {
    if (noteUnitsCache.has(id)) return noteUnitsCache.get(id);
    const n = NOTES[id];
    const units = [];
    (n ? n.segs : []).forEach((seg, si) => {
      if (seg.type === 'verse') units.push({ seg: si, verse: seg.parts, sub: seg.sub });
      else for (const u of tokenize(seg.runs)) units.push({ seg: si, parts: ED ? u.parts.map((p) => (p.o != null ? { ...p, g: si } : p)) : u.parts, sub: seg.sub });
    });
    noteUnitsCache.set(id, units);
    return units;
  }

  function noteHtml(id, a, b, num) {
    const units = noteUnits(id);
    const kind = (NOTES[id] && NOTES[id].kind) || 'fn';
    let html = '';
    let buf = [];
    let bufSeg = null;
    let bufSub = false;
    let inline = true; // الجزء الأول يُكتب في سطر الرقم نفسه
    const flush = () => {
      if (!buf.length) return;
      const inner = unitsHtml(buf, 0, buf.length, () => '');
      html += inline && !bufSub ? inner : '<div class="fnp' + (bufSub ? ' sub' : '') + '">' + inner + '</div>';
      inline = false;
      buf = [];
    };
    for (let i = a; i < b; i++) {
      const u = units[i];
      if (u.verse) {
        flush();
        inline = false;
        html += '<div class="fnv' + (u.sub ? ' sub' : '') + '" data-poem="n' + esc(id) + '"' + (ED ? ' data-g="' + u.seg + '"' : '') + '>' + verseInner(u.verse[0], u.verse[1]) + '</div>';
        bufSeg = null;
        continue;
      }
      if (bufSeg !== null && u.seg !== bufSeg) flush();
      bufSeg = u.seg;
      bufSub = !!u.sub;
      buf.push(u);
    }
    flush();
    // الحاشية المقسومة: «=» في آخر جزئها الأول وفي أول تتمتها
    if (kind === 'fn') {
      if (b < units.length) html = /<\/div>$/.test(html) ? html.replace(/<\/div>$/, ' =</div>') : html + ' =';
      if (a > 0) html = /^<div[^>]*>/.test(html) ? html.replace(/^(<div[^>]*>)/, '$1= ') : '= ' + html;
    }
    const numHtml = num ? '<span class="fnn">(' + ar(num) + ')</span>' : '<span class="fnn"></span>';
    const el = document.createElement('div');
    el.className = 'fn k-' + kind + (num ? '' : ' cont') + (b < units.length ? ' brk' : '');
    if (ED) el.dataset.n = id;
    el.innerHTML = numHtml + html;
    if (HOOKS.note) emit('note', el, id, a, b);
    return el;
  }

  /* ------------------------------------------------------------ وضع الفقرة */
  // دور الفقرة في البحث العلمي: الملخص (abs)، والكلمات المفتاحية (kw)، والمراجع (ref)، والنص الإنجليزي (en)…
  const roleCls = (block) => (typeof block.role === 'string' && /^[a-z ]{1,24}$/.test(block.role) ? block.role.trim().split(/\s+/).map((r) => ' r-' + r).join('') : '');
  function paraEl(block, a, b, refNum) {
    const el = document.createElement('p');
    const ps = block.ps;
    const li = ps && /^[bdnpw]$/.test(ps.ls || '') ? ps.ls : '';
    el.className = 'p' + (a === 0 ? ' first' : ' cont') + (b < block.units.length ? ' brk' : '') + (block.mt ? ' mt' : '') + (block.ay ? ' ay' : '') + (block.sh ? ' sh' : '') + (/^[clr]$/.test(block.al || '') ? ' a-' + block.al : '') + boxCls(ps) + (ps && ps.drop && a === 0 ? ' drop' : '') + (li ? ' li li-' + li : '') + (ps && ps.dir === 'ltr' ? ' dir-ltr' : '') + roleCls(block);
    if (a === 0) sideTag(el, block);
    // البداية المميزة: الكلمة الأولى كبيرةً بارزةً في سطرين (كما في المصاحف والكتب المزخرفة)
    el.innerHTML = (li && a === 0 ? '<span class="lmark">' + esc(listMark(li, block.__ln || 1)) + '</span>' : '') + (ps && ps.drop && a === 0 && b > a + 1 ? '<span class="dropw">' + unitsHtml(block.units, a, a + 1, refNum) + '</span> ' + unitsHtml(block.units, a + 1, b, refNum) : unitsHtml(block.units, a, b, refNum));
    const pc = psCss(ps, a === 0, b >= block.units.length);
    if (pc) el.style.cssText = pc;
    if (ED && block._i != null) el.dataset.i = block._i;
    if (HOOKS.para) emit('para', el, block, a, b);
    return el;
  }

  // يضع مقطع الفقرة وحواشيه تجريبياً؛ mode: full | split
  function trial(p, block, a, b, mode, keep) {
    const newIds = refsIn(block.units, a, b).filter((id) => !p.noteNum.has(id));
    const nums = new Map();
    newIds.forEach((id, i) => nums.set(id, p.nextNum + i));
    const refNum = (id) => p.noteNum.get(id) || nums.get(id) || 0;
    const el = paraEl(block, a, b, refNum);
    p.flow.appendChild(el);
    const nels = newIds.map((id, i) => {
      const units = noteUnits(id);
      const last = i === newIds.length - 1;
      const upto = mode === 'split' && last ? Math.min(1, units.length) : units.length;
      const ne = noteHtml(id, 0, upto, nums.get(id));
      p.notes.appendChild(ne);
      return ne;
    });
    const ok = fits(p);
    if (!keep) {
      el.remove();
      nels.forEach((n) => n.remove());
    }
    return { ok, el, nels, newIds, nums };
  }

  function maxK(lo, hi, test) {
    // أكبر k في [lo, hi] يحقق test ، أو lo-1
    let best = lo - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (test(mid)) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best;
  }

  function commitNotes(p, res) {
    res.newIds.forEach((id) => {
      p.noteNum.set(id, res.nums.get(id));
    });
    p.nextNum += res.newIds.length;
  }

  // وضع أكبر قدر من حاشية مقسومة (آخر حاشية) وحمل البقية إلى الصفحة التالية
  function fillSplitNote(p, id, num, fromEl) {
    const units = noteUnits(id);
    fromEl.remove();
    const m = maxK(1, units.length, (k) => {
      const e = noteHtml(id, 0, k, num);
      p.notes.appendChild(e);
      const ok = fits(p);
      e.remove();
      return ok;
    });
    const upto = Math.max(1, m);
    p.notes.appendChild(noteHtml(id, 0, upto, num));
    if (upto < units.length) p.carryOut.push({ id, from: upto });
  }

  let cur = null;
  let muSide = null; // المتون: الجزء الجاري هامشُه بجانبه (كل صفحة من صفحاته)
  function newBodyPage() {
    const prev = cur;
    cur = makePage('content');
    if (muSide) addSide(cur, muSide);
    const carry = prev ? prev.carryOut : [];
    for (const c of carry) placeCarry(cur, c);
    return cur;
  }

  // بقية حاشية من الصفحة السابقة تُوضع أولاً تحت الخط الفاصل
  function placeCarry(p, c) {
    const units = noteUnits(c.id);
    const reserve = SPLIT ? 0 : LINE_H * 3; // اترك للمتن ثلاثة أسطر على الأقل (إلا في قسم الشرح المستقل)
    const test = (k) => {
      const e = noteHtml(c.id, c.from, k, 0);
      p.notes.appendChild(e);
      const ok = fits(p, reserve);
      e.remove();
      return ok;
    };
    if (test(units.length)) {
      p.notes.appendChild(noteHtml(c.id, c.from, units.length, 0));
      return;
    }
    let k = maxK(c.from + 1, units.length, test);
    if (k < c.from + 1) {
      // لا مكان ولو لسطر: تؤجَّل إلى الصفحة التالية ما دامت الصفحة غير فارغة
      if (p.flow.childElementCount || p.notes.childElementCount > 1) {
        p.carryOut.push(c);
        return;
      }
      k = c.from + 1;
    }
    p.notes.appendChild(noteHtml(c.id, c.from, k, 0));
    if (k < units.length) p.carryOut.push({ id: c.id, from: k });
  }

  /* ------------------------------------------------------------ الأقزم والأرمل واليتيم */
  // اليتيم: أول سطرٍ من فقرةٍ وحده في أسفل الصفحة · الأرمل: آخر سطرٍ منها وحده في أعلى التالية
  // الأقزم: كلمةٌ وحدها (أو سطرٌ قصيرٌ جداً) في آخر الفقرة. ويُعالَج الثلاثة وحدها (S.widowOrphan و S.runts، والأصل تشغيلهما)
  const WO = S.widowOrphan !== false;
  const RUNT = S.runts !== false;
  const MINL = 2; // أقل ما يبقى من الفقرة في أسفل الصفحة أو أعلاها
  const TYPO = { orphans: 0, widows: 0, runtTight: 0, runtBind: 0, runtLeft: 0 };
  /** هل تنتهي الفقرة بنقطتين (تمهيدٌ لقائمةٍ أو تقسيمٍ بعدها)؟ */
  function endsWithColon(block) {
    if (block.colon !== undefined) return block.colon;
    const text = (block.runs || []).filter((r) => r.k !== 'r').map((r) => r.s || '').join('');
    return (block.colon = /[:：]\s*$/.test(text));
  }
  /** آخر سطرٍ من الفقرة: موضعه في نصها، وكلماته، وعرضه من عرض السطر */
  function lastLine(el) {
    const nodes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode()); ) if (n.data.length && !(n.parentElement && n.parentElement.closest('.lmark'))) nodes.push(n);
    if (!nodes.length) return null;
    const pos = [];
    let T = 0;
    for (const n of nodes) pos.push((T += n.data.length) - n.data.length);
    const at = (i) => {
      let k = nodes.length - 1;
      while (k > 0 && pos[k] > i) k--;
      return [nodes[k], i - pos[k]];
    };
    const rg = document.createRange();
    const rectOf = (i) => {
      const [n, o] = at(i);
      rg.setStart(n, o);
      rg.setEnd(n, Math.min(n.data.length, o + 1));
      return rg.getBoundingClientRect();
    };
    const text = nodes.map((n) => n.data).join('');
    let end = T - 1;
    while (end > 0 && /\s/.test(text[end])) end--;
    const bottom = rectOf(end).bottom;
    // أول حرفٍ في السطر الأخير (الأسطر متتالية في ترتيب النص)
    let lo = 0;
    let hi = end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rectOf(mid).bottom > bottom - LINE_H * 0.5) hi = mid;
      else lo = mid + 1;
    }
    while (lo < end && /\s/.test(text[lo])) lo++;
    const [n0, o0] = at(lo);
    const [n1, o1] = at(end);
    rg.setStart(n0, o0);
    rg.setEnd(n1, o1 + 1);
    const w = rg.getBoundingClientRect().width;
    const cs = getComputedStyle(el);
    const measure = el.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const words = text.slice(lo, end + 1).split(/\s+/).filter((x) => /[\p{L}\p{N}]/u.test(x));
    return { from: lo, words: words.length, w, measure, runt: lo > 0 && measure > 0 && ((words.length <= 1 && w < measure * 0.5) || w < measure * 0.12), nodes, pos, text };
  }
  /** آخر مسافةٍ بين كلمتين (تُربطان فلا تنفصلان) ← { node, i } */
  function lastGap(el) {
    const L = lastLine(el);
    if (!L) return null;
    let seen = false;
    for (let k = L.nodes.length - 1; k >= 0; k--) {
      const d = L.nodes[k].data;
      for (let i = d.length - 1; i >= 0; i--) {
        if (/[\p{L}\p{N}]/u.test(d[i])) seen = true;
        else if (seen && d[i] === ' ') return { node: L.nodes[k], i };
      }
    }
    return null;
  }
  /** علاج الأقزم في الفقرة الموضوعة: تُشدّ قليلاً فيصعد إلى ما قبله، وإلا ينزل معه كلمةٌ من السطر قبله */
  function fixRunt(el) {
    if (!RUNT || el.classList.contains('a-c') || el.classList.contains('a-l')) return;
    const L0 = linesOf(el);
    if (L0 < 2) return;
    const info = lastLine(el);
    if (!info || !info.runt) return;
    for (const ws of [-0.02, -0.04, -0.06, -0.08]) {
      el.style.wordSpacing = ws + 'em';
      if (linesOf(el) < L0) {
        el.dataset.runt = 'tight';
        TYPO.runtTight++;
        return 'tight';
      }
    }
    el.style.wordSpacing = '';
    const g = lastGap(el);
    if (g) {
      const old = g.node.data;
      g.node.data = old.slice(0, g.i) + '\u00a0' + old.slice(g.i + 1);
      const after = lastLine(el);
      if (linesOf(el) === L0 && after && !after.runt) {
        el.dataset.runt = 'bind';
        TYPO.runtBind++;
        return 'bind';
      }
      g.node.data = old;
    }
    TYPO.runtLeft++;
  }
  /** أكبر حدٍّ للمقطع [a,k) لا يزيد على want سطراً (ينتهي في آخر سطرٍ تام) */
  function kAtLines(p, block, a, hi, want) {
    if (want < 1) return a;
    return Math.max(a, maxK(a + 1, hi, (k) => fragLines(p, block, a, k) <= want));
  }

  // عدد أسطر مقطع الفقرة [a,b) دون حواشٍ
  function fragLines(p, block, a, b) {
    const el = paraEl(block, a, b, () => 0);
    p.flow.appendChild(el);
    const n = linesOf(el);
    el.remove();
    return n;
  }
  // إرجاع حدّ الكسر إلى نهاية آخر سطر مكتمل
  function alignToLineEnd(p, block, a, k) {
    const L = fragLines(p, block, a, k);
    if (fragLines(p, block, a, k + 1) > L) return k; // k ينتهي عند آخر السطر أصلاً
    let lo = a + 1;
    let hi = k;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fragLines(p, block, a, mid) >= L) hi = mid;
      else lo = mid + 1;
    }
    return lo - 1 > a ? lo - 1 : k;
  }

  function placePara(block) {
    block.units = block.units || tokenize(block.runs);
    const n = block.units.length;
    if (!n) return;
    let a = 0;
    let guard = 0;
    while (a < n && guard++ < 5000) {
      const p = cur;
      // ١) الفقرة (أو بقيتها) كاملة مع حواشيها
      let r = trial(p, block, a, n, 'full', true);
      // فقرةٌ تنتهي بنقطتين («والهداية نوعان:») تمهيدٌ لما بعدها: لا تكون آخر ما في الصفحة.
      // إن لم يبقَ تحتها متسعٌ لسطرين انتقلت إلى الصفحة التالية (القصيرة كلها، والطويلة سطراها الأخيران)
      if (r.ok && WO && endsWithColon(block) && !fits(p, LINE_H * 2) && p.flow.childElementCount > 1) {
        const L = linesOf(r.el);
        r.el.remove();
        r.nels.forEach((x) => x.remove());
        if (L <= 3 || a > 0) {
          TYPO.colon = (TYPO.colon || 0) + 1;
          newBodyPage();
          continue;
        }
        const k = kAtLines(p, block, a, n, L - 2);
        if (k > a && k < n) {
          const res = trial(p, block, a, k, 'full', true);
          if (res.ok) {
            commitNotes(p, res);
            TYPO.colon = (TYPO.colon || 0) + 1;
            a = k;
            newBodyPage();
            continue;
          }
          res.el.remove();
          res.nels.forEach((x) => x.remove());
        }
        r = trial(p, block, a, n, 'full', true);
      }
      if (r.ok) {
        commitNotes(p, r);
        // الأقزم: والعلاج لا يُخرجها من الصفحة
        const how = fixRunt(r.el);
        if (how && !fits(p)) {
          r.el.style.wordSpacing = '';
          delete r.el.dataset.runt;
          if (how === 'tight') TYPO.runtTight--;
          else TYPO.runtBind--;
          TYPO.runtLeft++;
          for (const tn of lastLine(r.el)?.nodes || []) if (tn.data.includes('\u00a0')) tn.data = tn.data.replace(/\u00a0/g, ' ');
        }
        return;
      }
      r.el.remove();
      r.nels.forEach((x) => x.remove());
      // ٢) أكبر جزء يسع مع الحواشي كاملة
      const kFull = maxK(a + 1, n - 1, (k) => trial(p, block, a, k, 'full').ok);
      // ٣) أكبر جزء يسع إذا قُسمت الحاشية الأخيرة (سطرها الأول هنا والباقي في التالية)
      let kSplit = trial(p, block, a, n, 'split').ok ? n : maxK(a + 1, n - 1, (k) => trial(p, block, a, k, 'split').ok);
      let useSplit = kSplit > kFull && kSplit > a && refsIn(block.units, a, kSplit).some((id) => !p.noteNum.has(id));
      let k = useSplit ? kSplit : kFull;
      if (k >= a + 1 && k < n) {
        // الكسر يجب أن يقع في نهاية سطر: إن أوقفته حاشيةٌ في وسط السطر نُقل السطر الناقص كله للصفحة التالية
        const k2 = alignToLineEnd(p, block, a, k);
        if (k2 !== k) {
          k = k2;
          if (useSplit && trial(p, block, a, k, 'full').ok) useSplit = false;
        }
      }
      // الأرمل واليتيم: سطران على الأقل من الفقرة في أسفل الصفحة وفي أعلى التالية
      if (WO && k > a && k < n) {
        const L1 = fragLines(p, block, a, k);
        const L2 = n - k > 80 ? MINL : fragLines(p, block, k, n);
        let k3 = k;
        if (L2 < MINL) {
          // الأرمل: ينزل معه سطرٌ (أو ما يلزم) من هذه الصفحة
          k3 = kAtLines(p, block, a, k, L1 - (MINL - L2));
          if (k3 < k) TYPO.widows++;
        }
        const L1b = k3 > a ? fragLines(p, block, a, k3) : 0;
        if (a === 0 && L1b < MINL && !pageEmpty(p)) {
          // اليتيم: لا يبدأ سطرٌ واحد من الفقرة في أسفل الصفحة؛ تبدأ الفقرة كلها في التالية
          if (L1b > 0 || k3 < k) TYPO.orphans++;
          newBodyPage();
          continue;
        }
        if (k3 > a && k3 !== k) {
          k = k3;
          if (useSplit && trial(p, block, a, k, 'full').ok) useSplit = false;
          if (useSplit && !trial(p, block, a, k, 'split').ok) useSplit = false;
        } else if (k3 <= a) {
          // بقية فقرةٍ (من الصفحة السابقة) سطرٌ واحد هنا وسطرٌ هناك: تنتقل كلها
          if (!pageEmpty(p)) {
            newBodyPage();
            continue;
          }
        }
      }
      if (useSplit && k > a) {
        const res = trial(p, block, a, k, 'split', true);
        commitNotes(p, res);
        if (res.newIds.length) {
          const lastId = res.newIds[res.newIds.length - 1];
          fillSplitNote(p, lastId, res.nums.get(lastId), res.nels[res.nels.length - 1]);
        }
        a = k;
      } else if (k >= a + 1) {
        // منع السطر اليتيم: لا نترك سطراً واحداً من فقرة طويلة في أسفل الصفحة
        const res = trial(p, block, a, k, 'full', true);
        const lines = linesOf(res.el);
        if (!WO && a === 0 && lines < 2 && n - a > 12 && !pageEmpty(p) && p.flow.childElementCount > 1) {
          res.el.remove();
          res.nels.forEach((x) => x.remove());
          newBodyPage();
          continue;
        }
        commitNotes(p, res);
        a = k;
      } else if (pageEmpty(p) && p.notes.childElementCount <= 1) {
        // صفحة فارغة ولا يسع شيء: فرض وحدة واحدة لتجنب الحلقة
        const res = trial(p, block, a, a + 1, 'split', true);
        commitNotes(p, res);
        warnings.push('overflow');
        a = a + 1;
      } else {
        newBodyPage();
        continue;
      }
      if (a < n) newBodyPage();
    }
  }

  function placeAtomic(el, reserve = 0) {
    cur.flow.appendChild(el);
    if (fits(cur, reserve) || pageEmpty2(cur, el)) return;
    el.remove();
    newBodyPage();
    cur.flow.appendChild(el);
  }
  const pageEmpty2 = (p, el) => p.flow.childElementCount === 1 && p.flow.firstChild === el;

  /* ------------------------------------------------------------ المتون: موضع التعليق */
  // صفحةٌ (أو صفحات) للتعليق تقابل المتن، أو ما بقي من صفحته بعد فاصل، أو هامشٌ بجانبه؛
  // بعنوانه («التعليقات»…) وسطورٍ للكتابة (أو فراغ أو مربعات)، ورؤوس مسائل إن حُدّدت للجزء.
  // ولكل جزءٍ موضعه: من الإعدادات، أو ما حُدّد لفصله أو له وحده في «المحرِّر» (b.c)
  const MU = DOC.mutun || null;
  let muUnit = null; // الجزء الجاري: { k, ui, c, start }
  const labelOf = (c) => (c && typeof c.label === 'string' ? c.label : (MU && MU.label) || '');
  /** أسطرُ موضع الكتابة ونقطُها: رسمٌ متجهّ (svg واحد بقدر المنطقة) لا تدرّجٌ متكرر.
   *  التدرّج المتكرر يُرمَّز في PDF «تظليلاً» يُرى في كثيرٍ من القرّاء — ومنها قارئ البرنامج — شكلاً خاطئاً أو لا يُرى؛
   *  والمتجهُ يُرى حيثما فُتح الكتاب وطُبع. النقطة: قطرها ١٫٥pt وتباعدها ٢٫٤مم، وعددُها من عرض السطر فيتساوى. */
  function rulesSvg(w, h, gap, rule) {
    if (!rule || rule === 'blank' || !(w > 0) || !(h > 0) || !(gap > 0)) return '';
    const n2 = (x) => String(Math.round(x * 100) / 100);
    const rows = Math.max(1, Math.round(h / gap));
    const out = [];
    for (let k = 1; k <= rows; k++) {
      const y = Math.min(h - 0.5, k * gap);
      if (rule === 'dots') {
        // نقاطٌ متباعدة: pathLength يوحّد التباعد مهما كان العرض (كل دورةٍ = ٢٫٤مم)، والرأس المستدير يجعلها نقطاً
        const count = Math.max(2, Math.round(w / (2.4 * MM)));
        out.push('<line x1="0" y1="' + n2(y) + '" x2="' + n2(w) + '" y2="' + n2(y) + '" pathLength="' + count + '" stroke="currentColor" stroke-dasharray="0.06 0.94" stroke-linecap="round" stroke-width="2" vector-effect="non-scaling-stroke"/>');
      } else {
        out.push('<line x1="0" y1="' + n2(y) + '" x2="' + n2(w) + '" y2="' + n2(y) + '" stroke="currentColor" stroke-width="0.93" vector-effect="non-scaling-stroke"/>');
      }
    }
    if (rule === 'grid') {
      // الشبكة: أسطرٌ عمودية مع الأفقية (وعلى حافة البداية كما كان التدرّج)
      for (let x = 0; x <= w + 0.5; x += gap) out.push('<line x1="' + n2(x) + '" y1="0" x2="' + n2(x) + '" y2="' + n2(h) + '" stroke="currentColor" stroke-width="0.67" vector-effect="non-scaling-stroke"/>');
      out.push('<line x1="0" y1="0" x2="' + n2(w) + '" y2="0" stroke="currentColor" stroke-width="0.67" vector-effect="non-scaling-stroke"/>');
    }
    return '<svg class="mc-rows" aria-hidden="true" width="' + n2(w) + '" height="' + n2(h) + '" viewBox="0 0 ' + n2(w) + ' ' + n2(h) + '" preserveAspectRatio="none">' + out.join('') + '</svg>';
  }
  /** طبقة الأسطر في منطقة الكتابة: تُبنى بقدرها الفعلي (و«blank» بلا أسطر) */
  function paintRules(area, h, gap) {
    const rule = (MU && MU.rule) || 'lines';
    const lay = area.querySelector(':scope > .mc-rows');
    if (rule === 'blank') {
      if (lay) lay.remove();
      return;
    }
    const svg = rulesSvg(area.clientWidth, h, gap, rule);
    if (lay) lay.remove();
    if (svg) area.insertAdjacentHTML('afterbegin', svg);
  }
  function commentBox(kind, c, k, ui) {
    const el = document.createElement('div');
    el.className = 'mc mc-' + ((MU && MU.rule) || 'lines') + ' mc-' + kind;
    if (k != null) el.dataset.mk = k;
    if (ED && ui != null) el.dataset.mi = ui;
    const label = labelOf(c);
    const hints = c && Array.isArray(c.hints) ? c.hints : [];
    el.innerHTML =
      (kind === 'below' ? '<div class="msep"></div>' : '') +
      (label ? '<div class="mc-label"><span>' + esc(label) + '</span></div>' : '') +
      '<div class="mc-area">' + (hints.length ? '<ol class="mc-hints">' + hints.map((h) => '<li>' + esc(h) + '</li>').join('') + '</ol>' : '') + '</div>';
    return el;
  }
  /** يملأ ما بقي من الصفحة بموضع الكتابة (بعددٍ صحيح من السطور، وmax إن حُدّد) */
  function fillComment(p, el, max) {
    const area = el.querySelector('.mc-area');
    area.style.height = '0px';
    const gap = ((MU && MU.gapMm) || 8) * MM;
    const room = capacity(p) - used(p) - 1;
    let n = Math.max(0, Math.floor(room / gap));
    if (max > 0) n = Math.min(n, max);
    area.style.height = (n * gap).toFixed(2) + 'px';
    paintRules(area, n * gap, gap);
    // رؤوس المسائل موزّعةٌ على السطور: بين كلٍّ والتي بعدها سطورٌ للكتابة
    const hs = area.querySelectorAll('.mc-hints > li').length;
    if (hs) el.style.setProperty('--hk', String(Math.max(1, Math.floor(n / hs) - 1)));
    return n;
  }
  function commentPage(c, k, ui, max = 0) {
    const p = newBodyPage();
    p.mComment = true;
    p.el.classList.add('mcom');
    const el = commentBox('page', c, k, ui);
    p.flow.appendChild(el);
    fillComment(p, el, max);
    return p;
  }
  /** الهامش بجانب المتن: عمودٌ في الصفحة (المتن أضيق بقدره) */
  function addSide(p, u) {
    p.el.classList.add('mside', 'mside-' + ((MU && MU.colSide) || 'right'));
    const first = !u.sideDone;
    u.sideDone = true;
    const el = commentBox('side', first ? u.c : { label: '' }, u.k, u.ui);
    p.el.querySelector('.body').appendChild(el);
  }
  /** المتن في وسط صفحته: الجزء الذي تمّ في صفحةٍ واحدة */
  function centerUnit() {
    if (!MU || !MU.center || !muUnit || muUnit.start !== cur || pageEmpty(cur)) return;
    const free = capacity(cur) - used(cur);
    if (free > 4) cur.flow.style.paddingTop = (free / 2).toFixed(2) + 'px';
  }
  function placeComment(b) {
    if (!MU) return;
    const c = b.c || { place: MU.place, n: MU.place === 'page' ? 1 : 0 };
    muSide = null;
    if (c.place === 'none' || c.place === 'side') return;
    if (c.place === 'below') {
      // تحت المتن بعد فاصل، إن بقي من الصفحة ما يكفي (أربعة أسطر للكتابة على الأقل)، وإلا ففي الصفحة التالية
      if (!pageEmpty(cur)) {
        const el = commentBox('below', c, b.k, b.ui);
        cur.flow.appendChild(el);
        if (fillComment(cur, el, c.n || 0) >= Math.min(4, c.n || 4)) return;
        el.remove();
      }
      commentPage(c, b.k, b.ui, c.n || 0);
      return;
    }
    centerUnit();
    const n = Math.max(1, Math.min(4, c.n || 1));
    for (let i = 0; i < n; i++) commentPage(i ? { ...c, label: '', hints: [] } : c, b.k, b.ui);
  }

  // ترقيم العناوين لكل مستوى (رقم الباب، ورقم الفصل داخل بابه…) لقوالب العناوين
  const hCount = [0, 0, 0, 0, 0];
  function headingVars(b) {
    const L = Math.min(Math.max(b.level, 1), 4);
    hCount[L]++;
    for (let i = L + 1; i <= 4; i++) hCount[i] = 0;
    const words = String(b.text).trim().split(/\s+/);
    const up = {};
    for (let i = 1; i <= 4; i++) { up['n' + i] = hCount[i]; up['n' + i + '_ar'] = ar(hCount[i]); }
    return { text: b.text, first: words[0] || '', rest: words.slice(1).join(' '), level: L, ...up, ...numVars(hCount[L]) };
  }
  function headingEl(b, vars) {
    const el = document.createElement('h' + Math.min(b.level, 4)); // وسوم حقيقية ← فهرس جانبي في PDF
    el.className = 'h h' + b.level + (/^[clr]$/.test(b.al || '') ? ' a-' + b.al : '') + (HS && b.hr ? ' hs-' + b.hr + (b.hsFlow ? ' hs-flow' : '') : '');
    el.id = b.id;
    const t = TPL['h' + Math.min(b.level, 4)];
    el.innerHTML = t ? fill(t, vars) : '<span>' + esc(b.text) + '</span>';
    const c = stCss(b.st) + psCss(b.ps, true, true);
    if (c) el.style.cssText = c;
    if (b.ps && BOXES.includes(b.ps.bx)) el.classList.add('bx', 'bx-' + b.ps.bx);
    sideTag(el, b);
    return el;
  }

  /* ------------------------------------------------------------ عناصر ملفات Word: صورة، جدول، صفحة غلاف */
  const IMG_SRC = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
  /** صورة في مجرى النص: بعرضها من عرض السطر (كما في الملف)، ولا تعلو على الصفحة */
  function figureEl(b) {
    if (!IMG_SRC.test(b.src || '') || !(b.w > 0) || !(b.h > 0)) return null;
    const full = cur.flow.clientWidth || 300;
    let w = (full * Math.min(100, Math.max(5, Number(b.wPct) || 60))) / 100;
    let h = (w * b.h) / b.w;
    // شرح الصورة (ما كُتب عليها أو تحتها في الملف) يبقى معها
    const cap = typeof b.cap === 'string' ? b.cap.trim() : '';
    const capLines = cap ? cap.split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 55)), 0) : 0;
    const maxH = capacity(cur) - LINE_H * (1 + capLines);
    if (h > maxH) {
      w *= maxH / h;
      h = maxH;
    }
    const el = document.createElement('div');
    // التفاف النص (كما في Word): أعلى وأسفل (الأصل)، مربع يميناً أو يساراً (يلتف النص حولها)، خلف النص، أمام النص
    const wrap = ['right', 'left', 'behind', 'front'].includes(b.wrap) ? b.wrap : 'block';
    const bd = b.bd === 'line' || b.bd === 'frame' ? ' bd-' + b.bd : '';
    const op = Number(b.op) > 0 && Number(b.op) < 1 ? 'opacity:' + Number(b.op) + ';' : '';
    const rot = Number(b.rot) ? 'transform:rotate(' + Math.max(-180, Math.min(180, Number(b.rot))) + 'deg);' : '';
    el.className = (wrap === 'behind' || wrap === 'front' ? 'fig-abs ' + wrap : wrap === 'block' ? 'fig a-' + (/^[clr]$/.test(b.al || '') ? b.al : 'c') : 'fig fl fl-' + wrap) + bd;
    el.innerHTML = '<img alt="" src="' + b.src + '" style="width:' + w.toFixed(2) + 'px;height:' + h.toFixed(2) + 'px;' + op + rot + '">' + (cap ? '<div class="figcap">' + esc(cap).replace(/\n/g, '<br>') + '</div>' : '');
    if (wrap === 'right' || wrap === 'left') el.style.width = w.toFixed(2) + 'px';
    if (wrap === 'behind' || wrap === 'front') {
      const pc = (v, d) => (Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : d);
      el.style.cssText += 'left:' + pc(b.x, 50) + '%;top:' + pc(b.y, 30) + '%;width:' + w.toFixed(2) + 'px;';
    }
    el.__wrap = wrap;
    return el;
  }
  const cellHtml = (r, c, ri, ci) => {
    const tag = r.hdr ? 'th' : 'td';
    const cls = (c.b ? 'b' : '') + (/^[clrj]$/.test(c.al || '') ? ' a-' + c.al : '');
    // لون الخلية من الملف، وخطها ومقاسها في «كما في الملف»
    const css = (/^#[0-9a-f]{6}$/i.test(c.bg || '') ? 'background:' + c.bg + ';' : '') + (/^#[0-9a-f]{6}$/i.test(c.c || '') ? 'color:' + c.c + ';' : '') + (S.fileFmt ? stCss({ ...(c.ff ? { font: c.ff } : {}), ...(+c.fz ? { size: +c.fz } : {}) }) : '');
    return (
      '<' + tag + (ED ? ' data-r="' + ri + '" data-c="' + ci + '"' : '') + (c.span > 1 ? ' colspan="' + (c.span | 0) + '"' : '') + (c.rs > 1 ? ' rowspan="' + (c.rs | 0) + '"' : '') + (cls.trim() ? ' class="' + cls.trim() + '"' : '') +
      (css ? ' style="' + css.replace(/"/g, "'") + '"' : '') + '>' + esc(c.t || '').replace(/\n/g, '<br>') + '</' + tag + '>'
    );
  };
  function rowEl(r, ri) {
    const tr = document.createElement('tr');
    tr.innerHTML = (r.cells || []).map((c, ci) => (c.skip ? '' : cellHtml(r, c, ri, ci))).join('');
    return tr;
  }
  function tableEl(b) {
    const t = document.createElement('table');
    t.className = 'tbl' + (b.borders ? ' bd' : '');
    t.dir = b.rtl ? 'rtl' : 'ltr';
    const cols = Array.isArray(b.cols) && b.cols.length ? '<colgroup>' + b.cols.map((w) => '<col style="width:' + (Number(w) || 0).toFixed(2) + '%">').join('') + '</colgroup>' : '';
    t.innerHTML = cols + '<tbody></tbody>';
    return t;
  }
  /** جدول: يُقسم بين الصفحات عند حدود الصفوف (ولا يُقسم صف، ولا خلايا مدموجة رأسياً)، ويتكرر صف العنوان */
  function placeTable(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return;
    /** نهاية مجموعة الصفوف التي تبدأ عند i ولا تُفصل: ما دامت خلية مدموجة رأسياً ممتدة */
    const groupEnd = (i) => {
      let j = i + 1;
      for (let k = i; k < j && k < rows.length; k++) for (const c of rows[k].cells || []) if (c.rs > 1) j = Math.max(j, Math.min(rows.length, k + (c.rs | 0)));
      return j;
    };
    // صف العنوان (ومعه ما دُمج به رأسياً) يتكرر أعلى كل صفحة من الجدول، ولا يُحسب من صفوفها
    const hEnd = rows[0].hdr && rows.length > 1 ? groupEnd(0) : 0;
    const hdr = hEnd && hEnd < rows.length ? rows.slice(0, hEnd) : [];
    let t = null;
    let body = null;
    let own = 0; // صفوف الجدول في هذه الصفحة (غير صفوف العنوان)
    const start = () => {
      t = tableEl(b);
      if (ED && b._i != null) t.dataset.i = b._i;
      body = t.tBodies[0];
      cur.flow.appendChild(t);
      own = 0;
      hdr.forEach((r, k) => body.appendChild(rowEl(r, k)));
    };
    start();
    emit('block', t, b);
    let i = hdr.length;
    let guard = 0;
    while (i < rows.length && guard++ < 20000) {
      const j = groupEnd(i);
      const els = rows.slice(i, j).map((r, k) => rowEl(r, i + k));
      els.forEach((e) => body.appendChild(e));
      if (fits(cur)) {
        own += j - i;
        i = j;
        continue;
      }
      if (!own && cur.flow.childElementCount === 1) {
        // صفحة ليس فيها إلا هذا الجدول ولا يسع صفه: يبقى فيها
        warnings.push('overflow');
        own += j - i;
        i = j;
        if (i < rows.length) {
          newBodyPage();
          start();
        }
        continue;
      }
      els.forEach((e) => e.remove());
      if (!own) t.remove();
      newBodyPage();
      start();
    }
  }

  /* ------------------------------------------------------------ الصفحات الافتتاحية */
  /** المتون: خانات صاحب النسخة أسفل الغلاف الداخلي (الاسم، رقم الهاتف، وما زاده المستخدم)، وبعد كلٍّ خطٌّ أو نقاط أو فراغ */
  function ownerHtml(abs) {
    const o = S.mutun && S.mOwner;
    if (!o || !o.on || !Array.isArray(o.fields) || !o.fields.length) return '';
    const colon = (t) => (/[:：]$/.test(t) ? t : t + ':');
    return '<div class="cv-owner' + (abs ? ' abs' : '') + '">' + o.fields
      .map((f) => '<div class="cv-of"><span class="t">' + esc(colon(String(f.t || ''))) + '</span><span class="f f-' + (['line', 'dots', 'blank'].includes(f.f) ? f.f : 'dots') + '"></span></div>')
      .join('') + '</div>';
  }
  function coverPage() {
    const c = DATA.cover || {};
    const p = makePage('cover');
    const own = ownerHtml(false);
    if (own) p.el.classList.add('has-owner');
    if (TPL.cover) {
      // قالب الغلاف من البطاقة: {{#owner}}…{{/owner}} يظهر حين تُفعَّل خانات صاحب النسخة، و{{ownerBox}} موضعها فيه
      // (وإن لم يذكره القالب وُضعت أسفل الصفحة)
      const SLOT = 'wqownerslot';
      const html = fill(TPL.cover, { ...c, ornament: S.ornament, owner: own ? '1' : '', ownerBox: own ? SLOT : '' });
      p.el.querySelector('.body').innerHTML = html.includes(SLOT) ? html.replace(SLOT, () => own).split(SLOT).join('') : html + ownerHtml(true);
      return p;
    }
    p.el.querySelector('.body').innerHTML =
      '<div class="cover-frame"><div class="cover-in">' +
      '<div class="cv-top">' + (c.volLabel ? '<div class="cv-vol">' + esc(c.volLabel) + '</div>' : '') + '</div>' +
      '<div class="cv-mid">' +
      '<div class="cv-title">' + esc(c.title || '') + '</div>' +
      (c.subtitle ? '<div class="cv-sub">' + esc(c.subtitle) + '</div>' : '') +
      '<div class="cv-orn">' + esc(S.ornament) + '</div>' +
      (c.author ? '<div class="cv-label">' + esc(c.authorLabel || 'تأليف') + '</div><div class="cv-author">' + esc(c.author) + '</div>' +
        (c.authorNote ? '<div class="cv-note">' + esc(c.authorNote) + '</div>' : '') : '') +
      (c.editor ? '<div class="cv-gap"></div><div class="cv-label">' + esc(c.editorLabel || 'تحقيق') +
        '</div><div class="cv-editor">' + esc(c.editor) + '</div>' : '') +
      '</div>' +
      ownerHtml(false) +
      '<div class="cv-bottom">' +
      (c.edition ? '<div>' + esc(c.edition) + '</div>' : '') +
      (c.publisher ? '<div>' + esc(c.publisher) + '</div>' : '') +
      '</div></div></div>';
    return p;
  }

  /* ------------------------------------------------------------ الفهرس */
  function buildToc(headingPage) {
    const tocPages = [];
    let tp = makePage('toc');
    tocPages.push(tp);
    tp.flow.innerHTML = TPL.tocHead
      ? '<div class="toc-top">' + fill(TPL.tocHead, { ...(DATA.cover || {}), text: S.tocTitle || DOC.tocTitle || 'فهرس الموضوعات' }) + '</div>'
      : '<div class="toc-title">' + esc(S.tocTitle || DOC.tocTitle || 'فهرس الموضوعات') + '</div><div class="toc-rule"></div>' +
        '<div class="toc-head"><span>الموضوع</span><span>الصفحة</span></div>';
    for (const h of DOC.headings) {
      const e = document.createElement('a');
      e.href = '#' + h.id; // الضغط على العنوان في الفهرس ينقل إليه
      e.className = 'toc-e l' + h.level;
      e.innerHTML =
        '<span class="t">' + esc(h.text) + '</span><span class="ld"></span><span class="n" data-h="' + h.id + '">' +
        ar(headingPage[h.id] || 0) + '</span>';
      tp.flow.appendChild(e);
      if (!fits(tp)) {
        e.remove();
        tp = makePage('toc');
        tocPages.push(tp);
        tp.flow.appendChild(e);
      }
    }
    return tocPages;
  }


  /* ------------------------------------------------------------ ضبط الأبيات */
  function justifyPoems() {
    const K = window.WarraqKashida;
    const groups = new Map();
    for (const el of document.querySelectorAll('.verse, .fnv')) {
      const k = el.dataset.poem || 'x';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(el);
    }
    const natural = (sp) => {
      sp.style.width = 'max-content';
      const w = sp.getBoundingClientRect().width;
      sp.style.width = '';
      return w;
    };
    const result = {};
    for (const [key, els] of groups) {
      const d0 = els[0].dataset;
      const VL = d0.vl || VLAYOUT;
      // البادئة: بُعد القصيدة عن حافتي السطر · فراغ الوسط: ما بين الشطرين (وفي السلّمي: ما بين آخر الأول وأول الثاني، وسالبه تداخل)
      const vi = Number(d0.vi) || 0;
      const vg = d0.vg != null && d0.vg !== '' ? Number(d0.vg) * MM : null;
      if (vi) for (const el of els) el.style.marginInline = vi + 'mm';
      const pair = els.find((e) => !e.classList.contains('vsingle')) || els[0];
      const cs = getComputedStyle(pair);
      const gap = vg != null && VL === 'line' ? Math.max(0, vg) : parseFloat(cs.columnGap) || 0;
      const sepEl = pair.querySelector('.vsep');
      const sepW = sepEl ? sepEl.getBoundingClientRect().width : 0;
      // خانة رقم البيت (المتون) بادئةٌ في البيت: لا تدخل في عرض الشطرين
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const full = pair.clientWidth - padX;
      // أقصى عرض للشطر: نصف السطر في الموازي، وأكثر من نصفه حين ينفرد الشطر بسطره
      // stack: نصف السطر (أو ما يتركه فراغ الوسط) · stagger: أعرض من النصف فيتداخلان · center: كل شطر وحده في وسط سطره
      const colW =
        VL === 'stack' ? (vg != null ? Math.max(full * 0.3, Math.min(full * 0.8, (full - vg) / 2)) : full * 0.485)
        : VL === 'stagger' ? full * 0.6
        : VL === 'center' ? full * 0.78
        : (full - (sepEl ? 2 * gap + sepW : gap)) / 2;
      const spans = els.flatMap((e) => [...e.querySelectorAll(':scope > .hm')]);
      for (const sp of spans) sp.dataset.orig = sp.dataset.orig || sp.textContent;
      let widths = spans.map(natural);
      let maxN = Math.max(...widths);
      let scale = 1;
      if (maxN > colW) {
        // الشطر الأطول لا يسع: تصغير خط القصيدة كلها بنسبة واحدة
        scale = Math.max(0.68, (colW / maxN) * 0.995);
        for (const sp of spans) sp.style.fontSize = (scale * 100).toFixed(2) + '%';
        widths = spans.map(natural);
        maxN = Math.max(...widths);
      }
      const T = Math.min(colW, Math.max(maxN, colW * (VL === 'stagger' ? 0.72 : VL === 'center' ? 0.62 : 0.8)));
      // المتداخل: عرض البيت كله أقل من عرض شطرين · السلّمي بفراغ وسطٍ: شطران وبينهما الفراغ (وسالبه تداخل)
      const blockW = VL === 'stagger' ? Math.min(full, T * 1.74) : VL === 'stack' && vg != null ? Math.max(T, Math.min(full, 2 * T + vg)) : full;
      for (const el of els) {
        const single = el.classList.contains('vsingle');
        if (VL === 'line') {
          el.style.gridTemplateColumns = single ? T.toFixed(2) + 'px' : sepEl ? T.toFixed(2) + 'px auto ' + T.toFixed(2) + 'px' : T.toFixed(2) + 'px ' + T.toFixed(2) + 'px';
          if (vg != null) el.style.columnGap = gap.toFixed(2) + 'px';
          el.style.justifyContent = 'center';
        } else {
          el.style.width = ((VL === 'center' ? full : blockW) + padX).toFixed(2) + 'px';
          el.style.marginInline = vi ? vi + 'mm' : 'auto';
          if (vi && VL !== 'center') el.style.marginInline = 'auto';
          for (const sp of el.querySelectorAll(':scope > .hm')) sp.style.width = T.toFixed(2) + 'px';
        }
      }
      // المدّ بالكشيدة حتى تتساوى الأشطر (إلا إن عُطّل لهذه القصيدة)
      if (d0.vk !== 'off') {
        const probe = spans[0];
        probe.textContent = K.TATWEEL.repeat(40);
        const kw = natural(probe) / 40 || 4;
        hmPaint(probe, probe.dataset.orig);
        spans.forEach((sp, i) => {
          const deficit = T - widths[i];
          if (deficit < 1) return;
          let n = Math.floor(deficit / kw);
          let txt = K.stretch(sp.dataset.orig, n, 9);
          hmPaint(sp, txt);
          let g = 0;
          while (n > 0 && natural(sp) > T - 0.5 && g++ < 60) {
            n--;
            txt = K.stretch(sp.dataset.orig, n, 9);
            hmPaint(sp, txt);
          }
          sp.dataset.k = n;
        });
      }
      const kashida = spans.reduce((a, sp) => a + (+sp.dataset.k > 0 ? 1 : 0), 0);
      const gapMm = VL === 'line' ? (sepEl ? 2 * gap + sepW : gap) / MM : VL === 'center' ? 0 : (blockW - 2 * T) / MM;
      result[key] = { widthMm: +(T / MM).toFixed(2), scale: +scale.toFixed(3), gapMm: +gapMm.toFixed(1), lines: els.length, kashida, ...(VL !== 'line' ? { blockMm: +(blockW / MM).toFixed(2) } : {}) };
    }
    return result;
  }

  /* ------------------------------------------------------------ التشغيل */
  async function run() {
    const fams = [S.fonts.body, S.fonts.heading, S.fonts.cover, S.fonts.names || 'Aref Ruqaa', ...(Array.isArray(OPTS.fonts) ? OPTS.fonts : [])];
    const loads = [];
    for (const f of fams) {
      loads.push(document.fonts.load('400 16px "' + f + '"', 'بسم الله'));
      loads.push(document.fonts.load('700 16px "' + f + '"', 'بسم الله'));
    }
    await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 15000))]);
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 5000))]);

    // قياس ارتفاع سطر المتن
    const probe = makePage('content');
    const pe = document.createElement('p');
    pe.className = 'p';
    pe.textContent = 'بسم الله';
    probe.flow.appendChild(pe);
    LINE_H = pe.getBoundingClientRect().height || 16 * 1.85 * (96 / 72);
    const bodyEl = probe.el.querySelector('.body');
    BODY_H = bodyEl.getBoundingClientRect().height;
    probe.el.remove();
    pages.pop();

    const cover = coverPage();
    // النسخة الجاهزة للطباعة: ما قبل الكتاب وما بعده صفحات يرتّبها المالك في «إعدادات الطباعة» (كلها بلا أرقام):
    // بيضاء · عنوان مختصر · غلاف داخلي · بسملة · نص حر · صورة
    const FRONT = DATA.front || {};
    const blankPage = () => makePage('blank');
    const cvr = DATA.cover || {};
    const frontPage = (cls, html) => {
      const p = makePage('extra');
      p.front = true;
      p.el.classList.add(cls);
      p.el.querySelector('.body').innerHTML = html;
      return p;
    };
    // صورة البسملة قناع (حبر معتم على شفاف) يُلوَّن مرة واحدة بلون البسملة المختار؛ وبلا صورة تُكتب بخط الرقعة
    let bsmTinted = null;
    const basmalaHtml = async () => {
      const bi = FRONT.basmala;
      if (bsmTinted === null) {
        bsmTinted = '';
        if (bi && bi.src) {
          try {
            const im = new Image();
            im.src = bi.src;
            await im.decode();
            const cv = document.createElement('canvas');
            cv.width = im.naturalWidth;
            cv.height = im.naturalHeight;
            const g = cv.getContext('2d');
            g.drawImage(im, 0, 0);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = FRONT.basmalaColor || '#000';
            g.fillRect(0, 0, cv.width, cv.height);
            bsmTinted = cv.toDataURL('image/png');
          } catch (e) {
            warnings.push('basmala-image');
          }
        }
      }
      return '<div class="bsm-wrap">' + (bsmTinted ? '<img class="bsm-img" alt="بسم الله الرحمن الرحيم" src="' + bsmTinted + '">' : '<div class="bsm-text">بسم الله الرحمن الرحيم</div>') + '</div>';
    };
    // نص الصفحة الحرة: نص عادي، وفيه {{title}} {{author}}… من بيانات الكتاب
    const freeText = (t) => esc(String(t || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (cvr[k] == null ? '' : String(cvr[k]))));
    const SAFE_COLOR = /^#[0-9a-f]{6}$/i;
    /** صفحة من صفحات التسلسل (غير الغلاف الداخلي) */
    const seqPage = async (it) => {
      if (it.type === 'half') {
        const h = FRONT.half || {};
        return frontPage(
          'front-half',
          '<div class="ht-box"><div class="ht-title">' + esc(cvr.title || '') + '</div>' +
            (h.showSub !== false && cvr.subtitle ? '<div class="ht-sub">' + esc(cvr.subtitle) + '</div>' : '') +
            (h.showAuthor && cvr.author ? '<div class="ht-author">' + esc(cvr.author) + '</div>' : '') + '</div>',
        );
      }
      if (it.type === 'basmala') return frontPage('front-basmala', await basmalaHtml());
      if (it.type === 'text') {
        // فقرات، ولكل جزء من النص حجمه وخطه وكونه عريضاً ولونه
        const ROLE = { heading: 'var(--f-heading)', body: 'var(--f-body)', cover: 'var(--f-cover)', names: 'var(--f-names)' };
        const fam = (f) => ROLE[f] || "'" + String(f || '').replace(/[^\p{L}\p{N} _-]/gu, '') + "', var(--f-body)";
        const free = [];
        const paras = (it.paras || [])
          .map((p) => {
            // صورة في صفحة النص: في سطرها بين الفقرات، أو حرّة في موضع من الصفحة
            if (p.img) {
              if (!IMG_SRC.test(p.img.src || '')) return '';
              const wp = Math.min(100, Math.max(5, Number(p.widthPct) || 40));
              if (p.free) {
                const pos = (v) => (Number.isFinite(Number(v)) ? Math.min(100, Math.max(0, Number(v))) : 50);
                free.push('<img class="ft-free' + (p.layer === 'behind' ? ' behind' : '') + '" alt="" src="' + p.img.src + '" style="left:' + pos(p.free.xPct) + '%;top:' + pos(p.free.yPct) + '%;width:' + wp + '%">');
                return '';
              }
              return '<div class="ft-p ft-img a-' + (p.align || 'center') + '"><img alt="" src="' + p.img.src + '" style="width:' + wp + '%"></div>';
            }
            const runs = (p.runs || [])
              .map((r) => {
                const st = 'font-size:' + (Number(r.sizePt) || 18) + 'pt;font-weight:' + (r.b === false ? 400 : 700) + ';font-family:' + fam(r.font) + (SAFE_COLOR.test(r.color || '') ? ';color:' + r.color : '');
                return '<span style="' + st + '">' + (freeText(r.t) || '&nbsp;') + '</span>';
              })
              .join('');
            return '<div class="ft-p a-' + (p.align || 'center') + '">' + runs + '</div>';
          })
          .join('');
        return frontPage('front-text', free.join('') + '<div class="ft-wrap v-' + (it.v || 'middle') + '"><div class="ft-text" style="line-height:' + (Number(it.lineHeight) || 1.75) + '">' + paras + '</div></div>');
      }
      if (it.type === 'image') {
        if (!it.src) return blankPage();
        if (it.fit === 'page') return frontPage('front-image', '<img class="fi-full" alt="" src="' + it.src + '">');
        const w = ((S.page.w * (Number(it.widthPct) || 60)) / 100).toFixed(2);
        return frontPage('front-image', '<div class="fi-wrap" style="top:' + (Number(it.yPct) || 50) + '%"><img class="fi-img" alt="" style="width:' + w + 'mm" src="' + it.src + '"></div>');
      }
      return blankPage();
    };
    // تُبنى الآن (قبل صفحات المتن) وتُرتَّب في مواضعها بعد التنضيد. الغلاف الداخلي يبقى موضعَه علامةٌ.
    const frontSeq = [];
    const backSeq = [];
    if (FRONT.printReady) {
      for (const it of FRONT.seq || []) frontSeq.push(it.type === 'cover' ? cover : await seqPage(it));
      for (const it of FRONT.back || []) backSeq.push(await seqPage(it));
      if (!frontSeq.includes(cover)) frontSeq.push(cover);
    }
    // صفحات خاصة من بطاقة الأسلوب (بسملة، إهداء، صفحة زخرفية…): تُبنى الآن وتُرتَّب في مواضعها بعد التنضيد
    const coverVars = { ...(DATA.cover || {}), ornament: S.ornament };
    const xpages = XPAGES.map((x) => {
      const p = makePage('extra');
      p.at = x.at;
      p.folioOn = !!x.folio;
      if (x.name) p.el.classList.add('x-' + x.name);
      p.el.querySelector('.body').innerHTML = fill(x.html, coverVars);
      return p;
    });
    const X = (at) => xpages.filter((p) => p.at === at);

    const contentStart = pages.length;
    newBodyPage();
    // في قسم الشرح المستقل: لا يبدأ متن جديد حتى ينتهي شرح ما قبله (كما في الطبعات)
    const gate = () => {
      let g = 0;
      while (SPLIT && cur.carryOut.length && g++ < 2000) newBodyPage();
    };
    emit('doc', DOC);
    let listRun = null;
    // آخر عنصرٍ غير فاصل صفحة: فاصلٌ بعده لا يصنع صفحةً فارغة في آخر الكتاب
    let lastReal = -1;
    DOC.blocks.forEach((x, i) => x.type !== 'pagebreak' && (lastReal = i));
    let bi = -1;
    for (const b of DOC.blocks) {
      bi++;
      if (listRun && !(b.type === 'para' && b.ps && b.ps.ls)) listRun = null;
      // منطق توزيع خاص من البطاقة: إن عالج العنصر (أعاد true) تُرك له
      if (OVER.place && over('place', () => false, b) === true) continue;
      if (b.type !== 'sharh') gate();
      // متن جديد في أول صفحة جديدة (خيار «نهاية الشرح»)
      if (b.breakBefore && !pageEmpty(cur)) newBodyPage();
      if (b.type === 'sharh') {
        gate();
        placeCarry(cur, { id: b.id, from: 0 });
      } else if (b.type === 'heading') {
        const vars = headingVars(b);
        // (hsFlow: العنوان بشكله في مجرى النص بلا صفحةٍ مستقلة — لوحات المعاينة غير لوحة العناوين)
        const hr = HS && !b.hsFlow ? b.hr : '';
        // نظام العناوين المعتمد: الجزء/الباب في صفحةٍ فردية وحده والزوجية بعده بيضاء، والفصل يبدأ صفحةً فردية
        // (المتون: الأجزاء هي التي تبدأ الصفحات، فيبقى للعنوان شكله وحده)
        if (hr === 'part' && !DOC.mutun) {
          if (pageEmpty(cur) && cur.notes.childElementCount <= 1 && !cur.carryOut.length) {
            pages.splice(pages.indexOf(cur), 1);
            cur.el.remove();
            cur = null;
          }
          const pp = makePage('content');
          pp.el.classList.add('hs-partpg');
          pp.oddStart = true;
          const el = headingEl(b, vars);
          emit('block', el, b);
          pp.flow.appendChild(el);
          pp.headings.push(b);
          b.pageIndex = pages.indexOf(pp);
          makePage('blank').hsBlank = true;
          if (!cur) cur = pp;
          newBodyPage();
          continue;
        }
        if (hr === 'ch' && !DOC.mutun) {
          if (!pageEmpty(cur)) newBodyPage();
          if (DOC.oddChapters !== false) cur.oddStart = true;
        }
        if (b.level === 1 && TPL.chapterPage && !DOC.mutun && !hr) {
          // صفحة فاصلة كاملة للباب (من البطاقة)، ثم يبدأ نصه في الصفحة التالية
          if (pageEmpty(cur) && cur.notes.childElementCount <= 1 && !cur.carryOut.length) {
            pages.splice(pages.indexOf(cur), 1);
            cur.el.remove();
            cur = null;
          }
          const op = makePage('opener');
          op.el.querySelector('.body').innerHTML = '<h1 class="opener-h" id="' + esc(b.id) + '">' + fill(TPL.chapterPage, vars) + '</h1>';
          op.headings.push(b);
          b.pageIndex = pages.indexOf(op);
          newBodyPage();
          continue;
        }
        if (b.level === 1 && S.chapterNewPage && !DOC.mutun && !hr && !pageEmpty(cur)) newBodyPage();
        const el = headingEl(b, vars);
        emit('block', el, b);
        // العنوان لا يبقى وحيداً في أسفل الصفحة: معه سطران مما بعده (والمبحث في النظام المعتمد ثلاثة)
        placeAtomic(el, LINE_H * (hr === 'h2' ? 3 : 2));
        cur.headings.push(b);
        b.pageIndex = pages.indexOf(cur);
      } else if (b.type === 'para') {
        // رقم الفقرة في قائمتها: الفقرات المتتالية من نوع واحد قائمة واحدة
        const ls = b.ps && b.ps.ls;
        if (ls) {
          listRun = listRun && listRun.ls === ls ? { ls, n: listRun.n + 1 } : { ls, n: Number(b.ps.lstart) > 0 ? Number(b.ps.lstart) : 1 };
          b.__ln = listRun.n;
        }
        placePara(b);
      } else if (b.type === 'image') {
        const el = figureEl(b);
        if (!el) continue;
        emit('block', el, b);
        // خلف النص وأمامه: في الصفحة نفسها بموضعها، لا تأخذ من مجرى النص شيئاً
        if (el.__wrap === 'behind' || el.__wrap === 'front') cur.el.querySelector('.body').appendChild(el);
        else placeAtomic(el);
      } else if (b.type === 'pagebreak') {
        // فاصل صفحة: ما بعده في أول الصفحة التالية
        const had = bi < lastReal ? cur.flow.childElementCount : 0;
        if (ED) {
          const el = document.createElement('div');
          el.className = 'pbreak';
          emit('block', el, b);
          cur.flow.appendChild(el);
        }
        if (had) newBodyPage();
      } else if (b.type === 'table') {
        placeTable(b);
      } else if (b.type === 'coverpage') {
        // صورة تملأ الصفحة (غلاف كتاب ثانٍ في الملف): صفحة مستقلة بلا رقم ولا رأس
        if (!IMG_SRC.test(b.src || '')) continue;
        if (pageEmpty(cur) && cur.notes.childElementCount <= 1 && !cur.carryOut.length) {
          pages.splice(pages.indexOf(cur), 1);
          cur.el.remove();
          cur = null;
        }
        const cp = makePage('extra');
        cp.el.classList.add('file-cover');
        cp.filePage = true;
        const near = b.w > 0 && b.h > 0 && Math.abs(b.w / b.h - S.page.w / S.page.h) / (S.page.w / S.page.h) < 0.12;
        cp.el.querySelector('.body').innerHTML = '<img class="fc-img' + (near ? ' fill' : '') + '" alt="" src="' + b.src + '">';
        emit('block', cp.el, b);
        newBodyPage();
        cur.afterCover = true;
      } else if (b.type === 'pagefig') {
        // صفحة صور من الملف (عنوان الكتاب، شعار الدار): صفحة مستقلة، وكل صورة في موضعها ومقاسها من الصفحة
        const parts = (Array.isArray(b.parts) ? b.parts : []).filter((x) => x && (x.k === 'text' || IMG_SRC.test(x.src || '')));
        if (!parts.length) continue;
        if (pageEmpty(cur) && cur.notes.childElementCount <= 1 && !cur.carryOut.length) {
          pages.splice(pages.indexOf(cur), 1);
          cur.el.remove();
          cur = null;
        }
        const fp = makePage('extra');
        fp.el.classList.add('file-page');
        if (b.rtp) fp.el.classList.add('r-title'); // صفحة عنوان البحث
        fp.filePage = true;
        const frac = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);
        const AL = { c: 'c', l: 'l', r: 'r' };
        let flow = '';
        let abs = '';
        for (const x of parts) {
          const gap = (frac(x.gap, 0) * S.page.h).toFixed(2);
          if (x.k === 'text') {
            const fsz = Number(x.sz) >= 6 && Number(x.sz) <= 60 ? 'font-size:' + Number(x.sz) + 'pt;' : '';
            flow += '<div class="fp-i fp-t a-' + (AL[x.al] || 'c') + (x.b ? ' b' : '') + '" style="margin-top:' + gap + 'mm;' + fsz + '">' + esc(x.t || '') + '</div>';
            continue;
          }
          const wmm = (frac(x.wp, 0.4) * S.page.w).toFixed(2);
          const capH = x.cap ? '<div class="figcap">' + esc(x.cap).replace(/\n/g, '<br>') + '</div>' : '';
          if (x.abs && Number.isFinite(Number(x.abs.x)) && Number.isFinite(Number(x.abs.y))) abs += '<img class="fp-abs" alt="" src="' + x.src + '" style="left:' + (frac(x.abs.x, 0) * 100).toFixed(2) + '%;top:' + (frac(x.abs.y, 0) * 100).toFixed(2) + '%;width:' + wmm + 'mm">';
          else flow += '<div class="fp-i a-' + (AL[x.al] || 'c') + '" style="margin-top:' + gap + 'mm"><img alt="" src="' + x.src + '" style="width:' + wmm + 'mm">' + capH + '</div>';
        }
        fp.el.querySelector('.body').innerHTML = abs + '<div class="fp-flow">' + flow + '</div>';
        // ما زاد على الصفحة يُصغَّر ليسعها
        const ff = fp.el.querySelector('.fp-flow');
        if (ff.scrollHeight > ff.clientHeight + 1) {
          ff.style.transformOrigin = 'top center';
          ff.style.transform = 'scale(' + Math.max(0.4, ff.clientHeight / ff.scrollHeight).toFixed(3) + ')';
        }
        emit('block', fp.el, b);
        newBodyPage();
        cur.afterCover = true;
      } else if (b.type === 'hr') {
        const el = document.createElement('div');
        el.className = 'hrule';
        emit('block', el, b);
        if (!pageEmpty(cur)) placeAtomic(el, LINE_H);
      } else if (b.type === 'verse') {
        const el = document.createElement('div');
        const vsep = sepOf(b);
        // شطرٌ وحده (آخر الثلاثي والمخمَّس، أو بيتٌ نُقص شطره): في وسط السطر
        const p0 = String(b.parts[0] || '').trim();
        const p1 = String(b.parts[1] || '').trim();
        const single = b.single || !p0 || !p1;
        const own = b.vl || b.vs || b.vg != null || b.vi != null || b.vk;
        el.className = 'verse' + (b.mt ? ' mt' : '') + (own ? ' vl-' + layoutOf(b) + (vsep ? ' has-sep' : '') : '') + (single ? ' vsingle' : '');
        el.dataset.poem = 'p' + (b.poem || 0);
        if (own) el.dataset.vl = layoutOf(b);
        if (Number.isFinite(Number(b.vg)) && b.vg !== null && b.vg !== '') el.dataset.vg = Number(b.vg);
        if (Number(b.vi)) el.dataset.vi = Number(b.vi);
        if (b.vk === 'off') el.dataset.vk = 'off';
        el.innerHTML = single ? '<span class="hm">' + esc(p0 || p1) + '</span>' : verseInner(b.parts[0], b.parts[1], vsep);
        // كل شطرٍ برقمه (للتحديد في المحرِّر)، وما فيه من آية
        {
          const hms = el.querySelectorAll(':scope > .hm');
          const pidx = single ? [p0 ? 0 : 1] : [0, 1];
          hms.forEach((sp, k) => {
            const p = pidx[k] ?? k;
            sp.dataset.p = p;
            // (النص المعروض قد يكون بلا مسافات طرفي الشطر)
            const raw = String(b.parts[p] || '');
            const lead = raw.startsWith(sp.textContent) ? 0 : Math.max(0, raw.indexOf(sp.textContent.trim()));
            if (lead) sp.dataset.lead = lead;
            const qs = (Array.isArray(b.vq) ? b.vq : []).filter((x) => x[0] === p).map((x) => [x[1], x[2]]);
            if (!qs.length) return;
            sp.dataset.q = JSON.stringify(qs.map(([a, z]) => [a - lead, z - lead]));
            sp.dataset.orig = sp.textContent;
            hmPaint(sp, sp.textContent);
          });
          el.dataset.l0 = String(String(b.parts[0] || '').length);
        }
        // المتون: رقم البيت في المنظومة والعدّ المتسلسل — خانةٌ صغيرة على يمين البيت، أو بين الشطرين
        if (b.vno && typeof b.vno === 'object') {
          if (b.vno.mid != null && !single) {
            const hm = el.querySelectorAll(':scope > .hm');
            for (const x of el.querySelectorAll(':scope > .vsep')) x.remove();
            hm[0].insertAdjacentHTML('afterend', '<span class="vsep vmid">' + esc(ar(b.vno.mid)) + '</span>');
            el.classList.add('vmid-on');
          }
          const side = (Array.isArray(b.vno.side) ? b.vno.side : []).filter((x) => x != null).slice(0, 2);
          if (side.length) {
            el.classList.add('vside', 'vside-' + side.length);
            el.insertAdjacentHTML('afterbegin', side.map((x, i) => '<span class="vno vno' + i + '">' + esc(ar(x)) + '</span>').join(''));
          }
        }
        const vc = stCss(b.st) + psCss(b.ps, true, true);
        if (vc) el.style.cssText = vc;
        sideTag(el, b);
        emit('block', el, b);
        placeAtomic(el);
      } else if (b.type === 'label') {
        // «شرح:» — عريضة بلون الفصول إذا تكررت في الكتاب
        const el = document.createElement('div');
        el.className = 'shlabel' + (b.strong ? ' strong' : '');
        el.textContent = b.text;
        const lc = stCss(b.st) + psCss(b.ps, true, true);
        if (lc) el.style.cssText = lc;
        sideTag(el, b);
        emit('block', el, b);
        placeAtomic(el, LINE_H * 2);
      } else if (b.type === 'rule') {
        // خط بين المتن وشرحه (لا يبقى وحيداً في أسفل الصفحة)
        const el = document.createElement('div');
        el.className = 'shrule';
        emit('block', el, b);
        placeAtomic(el, LINE_H * 2);
      } else if (b.type === 'mstart') {
        // جزءٌ من المتن: في أول صفحة جديدة (وهامشه بجانبه إن كان موضع تعليقه الهامش)
        muUnit = { k: b.k, ui: b.ui, c: b.c || { place: b.place } };
        muSide = (b.c ? b.c.place : b.place) === 'side' ? muUnit : null;
        if (!pageEmpty(cur)) newBodyPage();
        else if (muSide && !cur.el.classList.contains('mside')) addSide(cur, muSide);
        cur.mStart = true;
        cur.mUnit = b.k;
        cur.el.classList.add('mu-start');
        cur.el.dataset.mk = b.k;
        muUnit.start = cur;
      } else if (b.type === 'mintro') {
        // ما قبل المتن («قال الناظم رحمه الله:»): لا يبقى وحده في آخر الصفحة
        const el = document.createElement('div');
        el.className = 'mintro' + (b.own ? ' own' : '');
        if (ED && b.at != null) el.dataset.mx = b.at;
        el.innerHTML = '<span>' + esc(b.text) + '</span>';
        emit('block', el, b);
        placeAtomic(el, LINE_H * 2);
      } else if (b.type === 'mcomment') {
        placeComment(b);
      } else if (b.type === 'ornament') {
        const el = document.createElement('div');
        el.className = 'orn';
        if (TPL.ornament) el.innerHTML = fill(TPL.ornament, { ornament: S.ornament });
        else el.textContent = S.ornament;
        emit('block', el, b);
        // الفاصل لا يُنقل وحده إلى رأس صفحة: إن لم يسعه آخر الصفحة فنهاية الصفحة هي الفاصل
        if (pageEmpty(cur)) continue;
        cur.flow.appendChild(el);
        if (!fits(cur)) {
          el.remove();
          if (b !== DOC.blocks[DOC.blocks.length - 1]) newBodyPage();
        }
      }
    }
    // غلاف في آخر الكتاب: لا صفحة فارغة بعده
    if (cur.afterCover && pageEmpty(cur) && cur.notes.childElementCount <= 1 && !cur.carryOut.length && pages.length > 1) {
      pages.splice(pages.indexOf(cur), 1);
      cur.el.remove();
      cur = pages[pages.length - 1];
    }
    // حواشٍ متبقية بعد آخر فقرة
    let g = 0;
    while (cur.carryOut.length && g++ < 200) newBodyPage();
    const contentPages = pages.slice(contentStart);
    // صفحات الملف في أول الكتاب (غلافه، صفحات عنوانه وشعار الدار): مكانها قبل فهرس البداية لا بعده
    const lead = [];
    while (contentPages.length > 1 && contentPages[0].filePage) lead.push(contentPages.shift());

    // ترقيم نهائي: الغلاف والصفحة البيضاء أولاً ثم الفهرس (إن كان في البداية) ثم المتن
    const headingPage = {};
    const tocAt = S.tocPosition;
    let tocPages = [];
    if (tocAt !== 'none' && DOC.headings.length) {
      tocPages = buildToc({}); // تمريرة أولى لمعرفة عدد صفحات الفهرس
    }
    // ما يسبق المتن. النسخة المعتادة: الغلاف الداخلي ثم الكتاب مباشرة (مع صفحات البطاقة الخاصة إن وُجدت).
    // الجاهزة للطباعة: التسلسل الذي رتّبه المالك (الأصل: بيضاء، عنوان مختصر، بيضاء، غلاف داخلي، بيضاء، بسملة، بيضاء)،
    // وصفحات البطاقة «بعد الغلاف الداخلي» تأتي بعده مباشرة حيثما كان.
    // innerCover=false: الغلاف الداخلي لا يُصنع (ملف Word جاء بصفحات عنوانه)
    // والبحث الذي جاء بصفحة عنوانه (الجامعة والباحث والمشرف): هي غلافه الداخلي
    const noInner = S.innerCover === false || !!DOC.ownCover;
    if (noInner) {
      pages.splice(pages.indexOf(cover), 1);
      cover.el.remove();
    }
    const front = (FRONT.printReady
      ? [...X('start'), ...frontSeq.flatMap((p) => (p === cover ? [cover, ...X('afterCover')] : [p]))]
      : [...X('start'), cover, ...X('afterCover')]
    ).filter((p) => !(noInner && p === cover));
    // الترقيم: تُحسب صفحات ما قبل الكتاب (فيبدأ الكتاب بعدها)، أو يبدأ الكتاب من ١
    const numShift = FRONT.printReady && FRONT.numbering === 'book' ? front.length : 0;
    // المتون: كل جزءٍ يبدأ في جهته (اليمنى زوجية الموضع، واليسرى فردية)؛ وإن لم يقع فيها زيدت قبله صفحةٌ للتعليق (أو بيضاء أول الكتاب)
    if (MU && (MU.side === 'right' || MU.side === 'left')) {
      // (في المحرِّر يُعرض الفصل وحده بلا غلاف: موضع أول صفحاته من رقمها في الكتاب، أو بعد الغلاف الداخلي)
      const edNs = ED && DATA.preview && S.innerCover === false && !front.length ? Math.max(1, Math.floor(Number(DATA.preview.numStart) || 2) - 1) : null;
      const base0 = edNs != null ? edNs : front.length + lead.length + (tocAt === 'start' ? tocPages.length : 0) + X('beforeContent').length;
      // (الصفحة اليمنى زوجية الموضع في الكتاب العربي، وفرديته إن كانت الفردية يمنى)
      const want = (MU.side === 'right') !== ODD_R ? 0 : 1;
      for (let i = 0; i < contentPages.length; i++) {
        const p = contentPages[i];
        if (!p.mStart || (base0 + i + 1) % 2 === want) continue;
        let extra;
        if (contentPages.slice(0, i).some((x) => x.mStart)) {
          extra = makePage('content');
          extra.mComment = true;
          extra.el.classList.add('mcom');
          // تتمة موضع التعليق على الجزء الذي قبلها (بلا عنوان)
          const prevK = [...contentPages.slice(0, i)].reverse().find((x) => x.mUnit != null);
          const el = commentBox('page', { label: '' }, prevK ? prevK.mUnit : null, null);
          extra.flow.appendChild(el);
          fillComment(extra, el);
        } else extra = makePage('blank');
        contentPages.splice(i, 0, extra);
        i++;
      }
    }
    // نظام العناوين المعتمد: صفحة الجزء والفصل فردية الموضع؛ وإن لم تقع فيها زيدت قبلها صفحةٌ بيضاء
    if (HS && !MU) {
      const edNs = ED && DATA.preview && S.innerCover === false && !front.length ? Math.max(1, Math.floor(Number(DATA.preview.numStart) || 2) - 1) : null;
      const base0 = edNs != null ? edNs : front.length + lead.length + (tocAt === 'start' ? tocPages.length : 0) + X('beforeContent').length;
      for (let i = 0; i < contentPages.length; i++) {
        if (!contentPages[i].oddStart || (base0 + i + 1) % 2 === 1) continue;
        const extra = makePage('blank');
        extra.hsBlank = true;
        contentPages.splice(i, 0, extra);
        i++;
      }
    }
    // الهامش في الحافة الخارجية: يساراً في الصفحة اليسرى (الفردية الموضع، أو الزوجية إن كانت الفردية يمنى) ويميناً في اليمنى (والمتن بعرضه نفسه، فلا يتغيّر التنضيد)
    if (MU && MU.colSide === 'outer') {
      const base1 = front.length + lead.length + (tocAt === 'start' ? tocPages.length : 0) + X('beforeContent').length;
      contentPages.forEach((p, i) => {
        if (!p.el.classList.contains('mside')) return;
        const leftPage = leftPos(base1 + i + 1);
        p.el.classList.remove('mside-right', 'mside-left', 'mside-outer');
        p.el.classList.add(leftPage ? 'mside-right' : 'mside-left');
      });
    }
    const offset = front.length - numShift + lead.length + (tocAt === 'start' ? tocPages.length : 0) + X('beforeContent').length;
    contentPages.forEach((p, i) => {
      p.number = offset + i + 1;
      for (const h of p.headings) headingPage[h.id] = p.number;
    });
    // العناوين داخل الجمل: رقم الصفحة التي وقعت فيها
    const pageOf = new Map(pages.map((p) => [p.el, p]));
    for (const h of DOC.headings) {
      if (headingPage[h.id]) continue;
      const el = document.querySelector('.x-' + h.id);
      const pe = el && el.closest('section.page');
      if (pe && pageOf.get(pe)) headingPage[h.id] = pageOf.get(pe).number;
    }
    // تعبئة أرقام الفهرس ثم نقله إلى موضعه
    for (const tp of tocPages) {
      for (const n of tp.el.querySelectorAll('.n')) n.textContent = ar(headingPage[n.dataset.h] || '');
    }
    // نقاط الفهرس: نقاط حقيقية (نص) تملأ المسافة بين العنوان ورقم الصفحة بالضبط
    for (const ld of document.querySelectorAll('.toc-e .ld')) {
      ld.textContent = '';
      const w = ld.clientWidth;
      const dots = (k) => Array(Math.max(k, 1)).fill('.').join(' ');
      ld.textContent = dots(40);
      const unit = ld.scrollWidth / 40 || 4;
      let n = Math.max(1, Math.floor(w / unit));
      ld.textContent = dots(n);
      while (n > 1 && ld.scrollWidth > ld.clientWidth + 0.5) ld.textContent = dots(--n);
    }
    // الترتيب النهائي للصفحات وأرقامها
    const order = [
      ...front,
      ...lead,
      ...(tocAt === 'start' ? tocPages : []),
      ...X('beforeContent'),
      ...contentPages,
      ...X('afterContent'),
      ...(tocAt === 'start' ? [] : tocPages),
      ...X('end'),
      ...backSeq,
    ];
    emit('order', order); // البطاقة قد تعيد ترتيب الصفحات أو تضيف صفحات صنعتها (تعدّل المصفوفة نفسها)
    // إتمام عدد الصفحات إلى مضاعف (ملازم الطباعة): صفحات بيضاء في آخر الكتاب
    const padTo = FRONT.printReady ? Number(FRONT.padTo) || 0 : 0;
    if (padTo > 1) for (let g2 = 0; order.length % padTo && g2 < 64; g2++) order.push(blankPage());
    // pos: موضع الصفحة الفعلي في الكتاب (به تُعرف الفردية من الزوجية) · number: الرقم المطبوع
    order.forEach((p, i) => {
      p.pos = i + 1;
      p.number = i < numShift ? i + 1 : i + 1 - numShift;
      book.appendChild(p.el);
    });
    // المحرِّر يعرض فصلاً من الكتاب: أرقامه أرقام صفحاته في الكتاب كله
    const numStart = ED && DATA.preview && Number(DATA.preview.numStart) > 1 ? Math.floor(Number(DATA.preview.numStart)) : 0;
    if (numStart)
      for (const p of order) {
        p.number += numStart - 1;
        p.pos += numStart - 1;
      }
    const totalVars = { total: order.length, total_ar: ar(order.length) };

    // رأس الصفحة (عنوان الكتاب/الباب) وأرقام الصفحات
    let chapter = '';
    let section = '';
    for (const p of contentPages) {
      const opens = p.flow.firstChild && ((p.headings.some((h) => h.level === 1) && p.flow.firstChild.classList.contains('h1')) || p.flow.firstChild.classList.contains('hs-part') || p.flow.firstChild.classList.contains('hs-ch'));
      const startChapter = chapter;
      for (const h of p.headings) {
        if (h.level === 1) {
          chapter = h.text;
          section = '';
        } else if (h.level === 2) section = h.text;
      }
      // سياق الصفحة لقوالب الرأس والرقم والزخرفة: اسم الكتاب والباب والفصل الجاريين
      p.ctx = { chapter: chapter || startChapter, section };
      if (opens) p.el.classList.add('opens');
      if (S.runningHead && !opens && p.flow.childElementCount) {
        const rh = p.el.querySelector('.rh');
        const even = (p.pos || p.number) % 2 === 0;
        const txt = even ? (DATA.cover.title || '') : (section || chapter || startChapter || DATA.cover.title || '');
        rh.innerHTML = TPL.rh ? fill(TPL.rh, { ...coverVars, text: txt, ...p.ctx, ...numVars(p.number), ...totalVars }) : '<span>' + esc(txt) + '</span>';
        rh.classList.add('on');
      }
    }
    for (const p of pages) {
      // لكل صفحة: رقمها، وهل هي فردية أم زوجية (لتنسيق يتبدل بين الصفحتين المتقابلتين)
      p.el.dataset.n = p.number;
      p.el.classList.add((p.pos || p.number) % 2 ? 'odd' : 'even');
      // وجهها من الكتاب المفتوح: يسرى (pg-l) أو يمنى (pg-r) — به يُعرف طرفها الخارجي (الهامش الواسع) وكعبها (هامش التجليد)
      p.el.classList.add(leftPos(p.pos || p.number) ? 'pg-l' : 'pg-r');
      const ctx = { ...coverVars, chapter: '', section: '', ...(p.ctx || {}), ...numVars(p.number), ...totalVars };
      const body = p.kind === 'content' || p.kind === 'toc';
      if (TPL.page && body) {
        // طبقة زخرفية خلف النص في كل صفحة (زخارف جانبية، لسان باسم الباب…)
        const deco = document.createElement('div');
        deco.className = 'deco';
        deco.innerHTML = fill(TPL.page, ctx);
        p.el.insertBefore(deco, p.el.firstChild);
      }
      if (!(body || (p.kind === 'extra' && p.folioOn))) continue;
      const fo = p.el.querySelector('.folio');
      if (TPL.folio) fo.innerHTML = fill(TPL.folio, ctx);
      else fo.textContent = ar(p.number);
    }
    // خلفيات الصفحات (صورٌ يختارها المستخدم، أو جاءت من ملف Word): صفحات المتن والشرح، وصفحة الباب، وصفحة الفصل، والفهرس.
    // كل صورة تُكتب مرةً واحدة في التنسيق، والصفحة تحمل صنفها (فلا تتكرر الصورة في كل صفحة)
    {
      const BG = S.bgs && typeof S.bgs === 'object' ? S.bgs : null;
      const okBg = (k) => !!BG && typeof BG[k] === 'string' && IMG_SRC.test(BG[k]);
      const kinds = ['body', 'h1', 'h2', 'toc'].filter(okBg);
      if (kinds.length) {
        const css = document.createElement('style');
        css.textContent = kinds.map((k) => `#book>section.page.bg-${k}{background-image:url("${BG[k]}");background-size:100% 100%;background-repeat:no-repeat;background-position:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}`).join('\n');
        document.head.appendChild(css);
        for (const p of pages) {
          let k = '';
          if (p.kind === 'toc') k = okBg('toc') ? 'toc' : '';
          else if (p.kind === 'content' || p.kind === 'opener') {
            const lv = p.headings.length ? Math.min(...p.headings.map((h) => h.level || 9)) : 0;
            k = lv === 1 && okBg('h1') ? 'h1' : lv === 2 && okBg('h2') ? 'h2' : okBg('body') ? 'body' : '';
          }
          if (k) p.el.classList.add('bg-' + k, 'has-bg');
        }
      }
    }
    // الهوامش الجانبية (ما كتبه المستخدم أو المساعد في هامش الصفحة بجانب القطعة)
    placeSides(order);
    // المتون: أسطر موضع التعليق الذي بجانب المتن — بعد استقرار الصفحات، بقدر العمود من سطور
    if (MU && (MU.rule || 'lines') !== 'blank') {
      const gapSide = ((MU && MU.gapMm) || 8) * MM;
      for (const p of order)
        for (const area of p.el.querySelectorAll('.mc-side .mc-area')) {
          area.style.height = '';
          paintRules(area, area.clientHeight, gapSide);
        }
    }
    if (HOOKS.pageDone) for (const p of order) emit('pageDone', p, { ...coverVars, chapter: '', section: '', ...(p.ctx || {}), ...numVars(p.number), ...totalVars });
    // ضبط أشطر كل قصيدة بعرض واحد (تطويل بالكشيدة ثم توزيع المسافات)
    const poems = justifyPoems();
    // حذف الصفحات الفارغة تماماً في آخر المتن
    for (const p of contentPages) {
      if (p.kind === 'content' && !p.flow.childElementCount && p.notes.childElementCount <= 1) warnings.push('empty-page');
    }
    // آخر كلمة لبرنامج الأسلوب (قد يكون غير متزامن)
    for (const fn of HOOKS.done || []) {
      try {
        await fn({ pages: order, contentPages, tocPages, headingPages: headingPage });
      } catch (e) {
        scriptWarn('done', e);
      }
    }
    // الصور (من ملفات Word وصفحات الطباعة) تكتمل قبل الطباعة
    await Promise.race([Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null))), new Promise((r) => setTimeout(r, 20000))]);
    window.__LAYOUT = {
      pageCount: pages.length,
      frontPages: front.length,
      backPages: backSeq.length,
      firstNumber: front.length - numShift + 1,
      contentPages: contentPages.length,
      tocPages: tocPages.length,
      headingPages: headingPage,
      poems,
      warnings,
      typo: { ...TYPO, on: { widowOrphan: WO, runts: RUNT } },
    };
    document.documentElement.classList.add('done');
    window.__LAYOUT_DONE = true;
  }

  /* ------------------------------------------------------------ المعاينة الحية */
  // مستند المعاينة يعمل في إطار معزول (sandbox) لا تصل إليه الصفحة الأم، فيتولى هو عرض اللوحات ويراسلها.
  function previewAgent() {
    const PV = DATA.preview;
    if (!PV || window.parent === window) return;
    const marks = PV.marks || {};
    const all = [...document.querySelectorAll('#book > section.page')];
    const content = all.filter((p) => p.classList.contains('content') || p.classList.contains('opener'));
    const starts = ['heads', 'sharhPage', 'sharhOrn', 'verses']
      .map((k) => {
        const el = marks[k] && document.getElementById(marks[k]);
        return [k, el ? content.indexOf(el.closest('section.page')) : -1];
      })
      .filter((x) => x[1] >= 0)
      .sort((a, b) => a[1] - b[1]);
    // لوحة الغلاف تضم الصفحات الخاصة التي يحملها الأسلوب (بسملة، إهداء…)
    const views = { cover: all.filter((p) => p.classList.contains('cover') || p.classList.contains('extra')), toc: all.filter((p) => p.classList.contains('toc')) };
    // لمحرر إعدادات الطباعة: كل ما قبل الكتاب بترتيبه (ومنه الصفحات البيضاء)، وكل ما بعده
    const isBook = (p) => p.classList.contains('content') || p.classList.contains('opener') || p.classList.contains('toc');
    const b0 = all.findIndex(isBook);
    let b1 = all.length - 1;
    while (b1 >= 0 && !isBook(all[b1])) b1--;
    views.front = b0 < 0 ? all.slice() : all.slice(0, b0);
    views.back = b0 < 0 ? [] : all.slice(b1 + 1);
    views.book = b0 < 0 ? [] : all.slice(b0, b1 + 1);
    // «*first»: الكتاب نفسه من أول صفحاته (والصفحة البيضاء قبلها تبقى، فتقع كل صفحةٍ في جهتها في الصفحتين المتقابلتين)
    if (marks.heads === '*first') {
      const i0 = all.findIndex((p) => p.classList.contains('content'));
      let a = i0;
      while (a > 0 && all[a - 1].classList.contains('blank')) a--;
      let z = all.length - 1;
      while (z >= 0 && !all[z].classList.contains('content')) z--;
      views.heads = i0 < 0 ? [] : all.slice(a, z + 1);
    }
    starts.forEach((x, n) => {
      const end = n + 1 < starts.length ? starts[n + 1][1] : content.length;
      views[x[0]] = content.slice(x[1], Math.max(end, x[1] + 1)).filter((p) => {
        const f = p.querySelector('.flow');
        const nn = p.querySelector('.notes');
        return p.classList.contains('opener') || !f || f.childElementCount || (nn && nn.childElementCount > 1);
      });
    });
    const css = document.createElement('style');
    css.textContent = 'html,body{background:#fff!important;overflow:hidden!important}#book>section.page{display:none!important}#book>section.page.pv-on{display:block!important}a{pointer-events:none}';
    document.head.appendChild(css);
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window.parent || !m || m.warraq !== 'show') return;
      for (const p of document.querySelectorAll('section.page.pv-on')) p.classList.remove('pv-on');
      const t = (views[m.view] || [])[m.page | 0];
      if (t) t.classList.add('pv-on');
      // في الصفحتين المتقابلتين: الصفحة بوجه موضعها من المعاينة (اليمنى ثم اليسرى)، فيقع الهامش الخارجي في طرفه
      if (t) {
        if (!t.dataset.face) t.dataset.face = t.classList.contains('pg-r') ? 'r' : 'l';
        const face = m.face === 'l' || m.face === 'r' ? m.face : t.dataset.face;
        t.classList.remove('pg-l', 'pg-r');
        t.classList.add('pg-' + face);
      }
    });
    const counts = {};
    for (const k in views) counts[k] = views[k].length;
    window.parent.postMessage({ warraq: 'ready', views: counts, error: window.__LAYOUT_ERROR || null, warnings: (window.__LAYOUT && window.__LAYOUT.warnings) || [] }, '*');
  }

  /* ------------------------------------------------------------ المحرِّر */
  // الصفحات المنضَّدة كلها، متتالية كما تخرج. الإطار معزول (sandbox)، فيراسل المحرِّرَ بما تحت المؤشر وما حُدّد،
  // ويتلقى منه ما يُضاء (مرور، تحديد، نتائج بحث)، وعلامات الهامش (تُرسم خارج الصفحة فلا تمسّ النص).
  function editorAgent() {
    if (window.parent === window) return;
    const post = (m) => window.parent.postMessage(Object.assign({ ed: true }, m), '*');
    const css = document.createElement('style');
    css.textContent =
      'html{background:transparent!important}body{background:transparent!important;margin:0}' +
      '#book{display:flex;flex-direction:column;align-items:safe center;gap:28px;padding:28px 120px 120px;position:relative;min-width:max-content}' +
      // أدلة الهوامش (حدود منطقة النص)، والعلامات المخفية (نهاية الفقرة)
      'body.guides #book>section.page .body{outline:1px dashed rgba(173,92,158,.55);outline-offset:0}body.guides #book>section.page .notes{outline:1px dotted rgba(91,107,127,.5)}' +
      'body.invis .flow>p.p:not(.brk)::after{content:"¶";display:inline-block;width:0;color:#C5A059;font-family:serif;opacity:.9}body.invis .flow>p.p.brk::after{content:"↵";display:inline-block;width:0;color:#C5A059;opacity:.5}' +
      // لون الورق وحده (background-color): فخلفية الأسلوب المصوَّرة (slots.pageBg و coverBg وما في تنسيق بطاقته) تبقى كما في المعاينة والإخراج
      '#book>section.page{position:relative!important;box-shadow:0 1px 2px rgba(0,0,0,.12),0 18px 40px -22px rgba(0,0,0,.55);background-color:var(--paper,#fff);flex:none}' +
      'i.ew,i.mb{font-style:inherit}a{pointer-events:none}' +
      '[data-i],.fn[data-n],.mside-n[data-si]{cursor:pointer;transition:background-color .12s,box-shadow .12s}' +
      'body.tool-type [data-i],body.tool-type .fn[data-n],body.tool-type .mside-n[data-si]{cursor:text}' +
      // الهامش الجانبي يُكتب فيه في موضعه (ويظهر حدّه حين يُمرّ عليه)
      '.mside-n[data-si]:hover{outline:1px dashed rgba(107,29,47,.35);outline-offset:2px}' +
      // الهامش يُكتب فيه بالمرور والنقر بأي أداة، وحوله مقابض: يُنقل (المقبض أعلاه)، ويُغيَّر عرضه (حافته الداخلية) وارتفاعه (أسفله)
      '.mside-n[data-si]{cursor:text!important}.mside-n.boxed{outline:1px dotted rgba(107,29,47,.25);outline-offset:1px}' +
      '.ed-sbox{position:absolute;z-index:28;pointer-events:none;box-sizing:border-box;outline:1px dashed rgba(107,29,47,.6);outline-offset:3px}' +
      '.ed-sbox>.sb-mv{position:absolute;top:-21px;left:50%;width:44px;height:15px;margin-left:-22px;pointer-events:auto;cursor:move;border-radius:5px 5px 0 0;background:radial-gradient(circle,rgba(255,255,255,.95) 0 1px,transparent 1.5px) 3px 2.5px/5px 5px,#6B1D2F;box-shadow:0 1px 3px rgba(0,0,0,.3)}' +
      '.ed-sbox>.sb-mv:hover{background-color:#8A2A40}' +
      '.ed-sbox>.sb-w{position:absolute;top:-3px;bottom:-3px;left:-9px;width:9px;pointer-events:auto;cursor:ew-resize;background:linear-gradient(90deg,transparent 3px,rgba(107,29,47,.55) 3px 5px,transparent 5px)}' +
      '.ed-sbox.l>.sb-w{left:auto;right:-9px}' +
      '.ed-sbox>.sb-h{position:absolute;left:-3px;right:-3px;bottom:-9px;height:9px;pointer-events:auto;cursor:ns-resize;background:linear-gradient(transparent 3px,rgba(107,29,47,.55) 3px 5px,transparent 5px)}' +
      '.ed-sbox>.sb-w:hover,.ed-sbox>.sb-h:hover{background-color:rgba(197,160,89,.25)}' +
      '.ed-sbox>.sb-v:empty{display:none}.ed-sbox>.sb-v{position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);font:700 10.5px Tajawal,sans-serif;background:#2A1D14;color:#fff;padding:2px 8px;border-radius:9px;white-space:nowrap}' +
      '.mside-n.ed-sdrag{opacity:.88;outline:1.5px solid #6B1D2F!important;outline-offset:2px;z-index:29;background:rgba(255,253,246,.85)}' +
      'body.tool-typebody.tool-type .fig[data-i],body.tool-type .fig-abs[data-i]{cursor:pointer}' +
      '.ed-hov{background:color-mix(in srgb,var(--edc,#C5A059) 10%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--edc,#C5A059) 10%,transparent)!important;border-radius:2px}' +
      '.ed-sel{background:color-mix(in srgb,var(--edc,#C5A059) 15%,transparent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--edc,#C5A059) 15%,transparent),inset 0 0 0 1px var(--edc,#C5A059)!important;border-radius:2px}' +
      '.ed-dim [data-i]:not(.ed-lens),.ed-dim .fn:not(.ed-lens){opacity:.25}' +
      '::highlight(ed-hov){background-color:rgba(197,160,89,.22)}::highlight(ed-sel){background-color:rgba(197,160,89,.42)}' +
      '::highlight(ed-hit){background-color:rgba(63,143,90,.24)}::highlight(ed-cur){background-color:#3f8f5a;color:#fff}' +
      '#edMarks{position:absolute;inset:0;pointer-events:none}' +
      '.ed-tag{position:absolute;font:700 10.5px/1.3 Tajawal,"Segoe UI",sans-serif;color:var(--tc,#8a7a66);white-space:nowrap;display:flex;align-items:center;gap:5px}' +
      '.ed-tag::before{content:"";width:5px;height:5px;background:currentColor;transform:rotate(45deg)}' +
      '.ed-brk{position:absolute;width:2px;border-radius:1px;background:var(--tc,#c9bca8);opacity:.7}.ed-sbrk{opacity:.85;background:repeating-linear-gradient(to bottom,var(--tc) 0 6px,transparent 6px 9px)}' +
      '.ed-gtag{position:absolute;writing-mode:vertical-rl;font:700 10.5px Tajawal,sans-serif;color:var(--tc,#8a7a66);letter-spacing:.04em}' +
      '.ed-pno{position:absolute;font:700 11px Tajawal,sans-serif;color:#9a8f80}' +
      '.ed-imgchip{position:absolute;pointer-events:auto;cursor:pointer;z-index:6;font:700 10.5px/1 Tajawal,sans-serif;padding:3px 7px;border-radius:7px;background:rgba(42,29,20,.62);color:#fff;opacity:.55;transition:opacity .15s;white-space:nowrap}.ed-imgchip:hover{opacity:1;background:#6B1D2F}' +
      '.ed-memo{position:absolute;pointer-events:auto;cursor:pointer;width:22px;height:20px;display:grid;place-items:center;background:#C5A059;color:#2A1D14;border-radius:6px 6px 6px 1px;font:700 12px/1 Tajawal,sans-serif;box-shadow:0 2px 6px -2px rgba(0,0,0,.35)}.ed-memo:hover{background:#6B1D2F;color:#fff}' +
      // الكتابة في الصفحة
      '.ed-live{outline:1.5px solid rgba(107,29,47,.55)!important;outline-offset:3px;border-radius:1px;cursor:text!important;caret-color:#6B1D2F;white-space:pre-wrap!important;background:none!important;box-shadow:none!important}' +
      '.ed-live::selection,.ed-live *::selection{background:rgba(197,160,89,.45)}' +
      'section.page.ed-editing{overflow:visible!important;z-index:2}' +
      '.pbreak{position:relative;height:0}.pbreak::after{content:"فاصل صفحة";position:absolute;inset-inline:0;top:2px;border-top:1.5px dashed #b9ab95;font:700 10px Tajawal,sans-serif;color:#9a8f80;text-align:center;padding-top:2px}' +
      '.ed-in{position:absolute;z-index:20;border:0;outline:1.5px solid #6B1D2F;outline-offset:2px;background:rgba(255,255,255,.96);color:inherit;padding:0 2px;margin:0;text-align:center;box-sizing:border-box;border-radius:2px}' +
      // مقابض الصورة
      '.ed-ih{position:absolute;z-index:30;border:1.5px solid #C5A059;pointer-events:none;box-sizing:border-box}' +
      '.ed-ih.mv{pointer-events:auto;cursor:move;background:rgba(197,160,89,.06)}' +
      '.ed-ih b{position:absolute;width:11px;height:11px;background:#fff;border:1.5px solid #C5A059;pointer-events:auto;border-radius:2px}' +
      '.ed-ih b.br{right:-7px;bottom:-7px;cursor:nwse-resize}.ed-ih b.bl{left:-7px;bottom:-7px;cursor:nesw-resize}' +
      '.ed-ih b.tr{right:-7px;top:-7px;cursor:nesw-resize}.ed-ih b.tl{left:-7px;top:-7px;cursor:nwse-resize}' +
      '.ed-ih i:empty{display:none}.ed-ih i{position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);font:700 10.5px Tajawal,sans-serif;background:#2A1D14;color:#fff;padding:2px 7px;border-radius:9px;white-space:nowrap;font-style:normal}' +
      '.fig-abs[data-i]{cursor:move}' +
      'body.ed-pickpt,body.ed-pickpt *{cursor:crosshair!important}body.ed-pickpt i.ew:hover{background:rgba(107,29,47,.16);box-shadow:inset 2px 0 0 #6B1D2F;border-radius:2px}' +
      // المسطرة (كما في Word): فوق منطقة النص في الصفحة، بمسافاتها البادئة تُسحب
      '.ed-ruler{position:absolute;z-index:25;height:17px;background:rgba(250,246,236,.97);border:1px solid #d8cdb8;border-radius:3px;box-shadow:0 2px 6px -3px rgba(0,0,0,.3);font:600 8.5px Tajawal,sans-serif;color:#8a7a66;user-select:none}' +
      '.ed-ruler .tk{position:absolute;bottom:0;width:1px;background:#b9ab95}.ed-ruler .tk.l{height:7px}.ed-ruler .tk.s{height:4px}' +
      '.ed-ruler .nm{position:absolute;top:0;transform:translateX(-50%)}' +
      '.ed-ruler .mk{position:absolute;width:11px;height:8px;margin-left:-5.5px;cursor:ew-resize;background:#6B1D2F}' +
      '.ed-ruler .mk.first{top:-1px;clip-path:polygon(0 0,100% 0,50% 100%)}.ed-ruler .mk.start,.ed-ruler .mk.end{bottom:-1px;clip-path:polygon(50% 0,100% 100%,0 100%)}' +
      '.ed-ruler .mk:hover,.ed-ruler .mk.on{background:#C5A059}' +
      '.ed-ruler .val{position:absolute;top:-22px;transform:translateX(-50%);background:#2A1D14;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;white-space:nowrap}' +
      // المتون: موضع التعليق يُحدَّد، وعنوانه يُسحب، والأجزاء علاماتٌ في الهامش
      '.mc[data-mk]{cursor:pointer;transition:background-color .12s,box-shadow .12s}.mc[data-mk]:hover{box-shadow:0 0 0 3px rgba(138,103,39,.12)}' +
      '.mintro>span{cursor:grab}.mintro.ed-drag>span{cursor:grabbing;opacity:.85;outline:1.5px dashed #8A6727;outline-offset:3px}.mintro{position:relative}.mintro.ed-drag::before,.mintro.ed-drag::after{content:"";position:absolute;top:-6px;bottom:-6px;width:0;border-left:1px dashed rgba(138,103,39,.5)}.mintro.ed-drag::before{left:33.3%}.mintro.ed-drag::after{left:66.6%}' +
      '.mc-label>span{cursor:grab}.mc-label.ed-drag>span{cursor:grabbing;opacity:.85;outline:1.5px dashed #8A6727;outline-offset:3px}' +
      '.mc-label.ed-drag::before,.mc-label.ed-drag::after{content:"";position:absolute;top:-6px;bottom:-6px;width:0;border-left:1px dashed rgba(138,103,39,.5)}.mc-label{position:relative}.mc-label.ed-drag::before{left:33.3%}.mc-label.ed-drag::after{left:66.6%}' +
      '.ed-unit{position:absolute;font:700 10.5px/1 Tajawal,sans-serif;color:#fff;background:#6B1D2F;padding:3px 7px 3px 8px;border-radius:0 9px 9px 0;white-space:nowrap}' +
      '.ed-mct{position:absolute;font:700 10.5px/1.3 Tajawal,sans-serif;color:#8A6727;white-space:nowrap;display:flex;align-items:center;gap:5px}.ed-mct::before{content:"";width:9px;height:11px;border:1px solid currentColor;background:repeating-linear-gradient(to bottom,transparent 0 2px,currentColor 2px 3px);opacity:.8}';
    document.head.appendChild(css);
    const book = document.getElementById('book');
    const all = [...book.querySelectorAll(':scope > section.page')];
    const pageW = (all[0] && all[0].offsetWidth) || 600;
    const pageH = (all[0] && all[0].offsetHeight) || 800;
    const fit = () => drawTags();
    /** موضع عنصر داخل الكتاب (بإحداثيات التخطيط) */
    const posIn = (el) => {
      let x = 0;
      let y = 0;
      let n = el;
      while (n && n !== book) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    /** موضع عنصر كما يُرى (مع التحويلات: الصورة المنقولة بوسطها) */
    const rectIn = (el) => {
      const b = book.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
    };
    let tool = 'select';
    // ما تحت المؤشر
    const hitOf = (el) => {
      if (!el || !el.closest) return null;
      // موضع التعليق (المتون)
      const mc = el.closest('.mc[data-mk]');
      if (mc) return { mc: +mc.dataset.mk, mi: mc.dataset.mi != null ? +mc.dataset.mi : null, part: el.closest('.mc-label') ? 'label' : 'area' };
      // ما قبل المتن
      const mx = el.closest('.mintro[data-mx]');
      if (mx) return { mx: +mx.dataset.mx };
      const w = el.closest('i.ew');
      // الهامش الجانبي: نصٌّ منسَّق لقطعته (i) في موضعه (sd)
      const sn = el.closest('.mside-n[data-si]');
      if (sn) return { i: +sn.dataset.si, sd: sn.dataset.k, o: w ? +w.dataset.o : null, cls: '', kind: 'side' };
      const fn = el.closest('.fn[data-n]');
      const blk = el.closest('[data-i]');
      const cls = (w && w.parentElement && w.parentElement.className) || '';
      if (fn) {
        const fv = el.closest('.fnv[data-g]');
        return { n: fn.dataset.n, g: fv ? +fv.dataset.g : w && w.dataset.g != null ? +w.dataset.g : null, o: w ? +w.dataset.o : null, cls };
      }
      if (!blk) return null;
      const cell = el.closest('[data-r][data-c]');
      return { i: +blk.dataset.i, o: w ? +w.dataset.o : null, cls, tag: blk.tagName.toLowerCase(), kind: blk.className.split(' ')[0], ...(cell ? { r: +cell.dataset.r, c: +cell.dataset.c } : {}) };
    };
    let lastHov = '';
    document.addEventListener('mousemove', (e) => {
      if (drag) return;
      const h = ed && ed.host.contains(e.target) ? null : hitOf(e.target);
      const key = JSON.stringify(h);
      if (key === lastHov) return void post({ type: 'move', x: e.clientX, y: e.clientY });
      lastHov = key;
      post({ type: h ? 'hover' : 'leave', hit: h, x: e.clientX, y: e.clientY });
    });
    document.addEventListener('mouseleave', () => {
      lastHov = '';
      post({ type: 'leave' });
    });
    // موضع في نص القطعة من نقطة في المستند
    const offAt = (node, off) => {
      const el = node.nodeType === 3 ? node.parentElement : node;
      // البيت: موضعٌ في نصه «الصدر … العجز» (والكشيدة المزيدة لا تُعدّ)
      const hm = el && el.closest && el.closest('.verse[data-i] > .hm');
      if (hm) {
        const r = document.createRange();
        r.setStart(hm, 0);
        try {
          r.setEnd(node, off);
        } catch {
          return null;
        }
        const d = r.toString().length;
        const shown = hm.textContent;
        const orig = hm.dataset.orig || shown;
        let j = 0;
        for (let i = 0; i < d && i < shown.length; i++) if (j < orig.length && shown[i] === orig[j]) j++;
        const v = hm.parentElement;
        const p = +hm.dataset.p || 0;
        const raw0 = +v.dataset.l0 || 0;
        return { w: hm, o: (p ? raw0 + 3 : 0) + (+hm.dataset.lead || 0) + j };
      }
      const w = el && el.closest && el.closest('i.ew');
      if (w) return { w, o: +w.dataset.o + Math.max(0, (node.nodeType === 3 ? off : 0) - (+w.dataset.x || 0)) };
      const host = el && el.closest && el.closest('.mside-n[data-si], [data-i], .fn[data-n]');
      if (!host) return null;
      const ws = [...host.querySelectorAll('i.ew')];
      const ref = node.nodeType === 3 ? node : node.childNodes[off] || node;
      const next = ws.find((x) => ref.compareDocumentPosition && ref.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING);
      return next ? { w: next, o: +next.dataset.o } : ws.length ? { w: ws[ws.length - 1], o: +ws[ws.length - 1].dataset.o + ws[ws.length - 1].textContent.length } : null;
    };
    const ownerOf = (w) => {
      const sn = w.closest('.mside-n[data-si]');
      if (sn) return { i: +sn.dataset.si, sd: sn.dataset.k };
      const fn = w.closest('.fn[data-n]');
      if (fn) return { n: fn.dataset.n, g: w.dataset.g != null ? +w.dataset.g : 0 };
      const b = w.closest('[data-i]');
      return b ? { i: +b.dataset.i } : null;
    };

    /* ---------------------------------------------------------- الكتابة في الصفحة (كما في Word) */
    // جلسة كتابة: فقرة (أو جزؤها في هذه الصفحة) أو حاشية تصير قابلة للكتابة؛ وعند الخروج يُرسل نصها الجديد
    // فيقارنه المحرِّر بنصها الأول ويحفظ ما تغيّر وحده (فيبقى نوع ما لم يُمسّ وتنسيقه)، ثم يُعاد التنضيد.
    let ed = null;
    const SKIP = '.mb,.fr,.fnn,.ed-ui,.lmark';
    const textNodes = (host) => {
      const out = [];
      const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        // سطرٌ جديد: <br>، أو عنصرُ سطرٍ يصنعه المتصفح (div) حين يُضغط Enter
        acceptNode: (n) => (n.nodeType === 1 ? (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : /^(BR|DIV|P)$/.test(n.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = tw.nextNode(); n; n = tw.nextNode()) out.push(n);
      return out;
    };
    const clean = (s) => s.replace(/\u200b/g, '');
    const nodeText = (n) => (n.nodeType === 1 ? '\n' : clean(n.data));
    const extract = (host) => textNodes(host).map(nodeText).join('').replace(/\n/g, '\u2029');
    /** موضع (عقدة، إزاحة) في النص المستخرج */
    function indexOf(host, node, off) {
      const r = document.createRange();
      r.setStart(host, 0);
      try {
        r.setEnd(node, off);
      } catch {
        return 0;
      }
      let k = 0;
      for (const n of textNodes(host)) {
        if (n === node) {
          k += clean(n.data.slice(0, off)).length;
          break;
        }
        if (r.comparePoint(n, n.nodeType === 3 ? n.data.length : 0) !== 0) break;
        k += nodeText(n).length;
      }
      return k;
    }
    /** العقدة والإزاحة لموضعٍ في النص المستخرج */
    function pointAt(host, idx) {
      let k = 0;
      const ns = textNodes(host).filter((n) => n.nodeType === 3);
      for (const n of ns) {
        const t = n.data;
        let real = 0;
        let seen = 0;
        while (real < t.length && seen < idx - k) {
          if (t[real] !== '\u200b') seen++;
          real++;
        }
        if (k + clean(t).length >= idx) return { node: n, off: real };
        k += clean(t).length;
      }
      const last = ns[ns.length - 1];
      return last ? { node: last, off: last.data.length } : { node: host, off: 0 };
    }
    const wordsOf = (host) => [...host.querySelectorAll('[data-o]')];
    const spanOf = (host) => {
      let a = Infinity;
      let z = -Infinity;
      for (const w of wordsOf(host)) {
        const o = +w.dataset.o;
        const len = (w.dataset.t != null ? w.dataset.t.length : clean(w.textContent).length) - (+w.dataset.x || 0);
        a = Math.min(a, o);
        z = Math.max(z, o + len);
      }
      return a === Infinity ? null : { a, z };
    };
    const HOSTS = 'p.p[data-i], .fn[data-n], .mside-n[data-si]';
    const isSide = (host) => !!(host && host.matches && host.matches('.mside-n[data-si]'));
    function canEdit(host) {
      if (!host) return false;
      if (isSide(host)) return !!spanOf(host);
      if (host.matches('.fn[data-n]')) {
        const gs = new Set(wordsOf(host).map((w) => w.dataset.g));
        return gs.size === 1 && !host.querySelector('.fnv');
      }
      return host.matches('p.p[data-i]') && !!spanOf(host);
    }
    function startEdit(host, at) {
      if (ed && ed.host === host) return true;
      if (!canEdit(host)) return false;
      // الكلمات الممدودة بالكشيدة تعود كما كُتبت
      for (const w of host.querySelectorAll('i.ew[data-t]')) {
        w.textContent = w.dataset.t;
        w.removeAttribute('data-t');
      }
      for (const x of host.querySelectorAll(SKIP)) x.contentEditable = 'false';
      const sp = spanOf(host);
      const isFn = host.matches('.fn');
      const side = isSide(host);
      ed = {
        host,
        i: isFn ? null : side ? +host.dataset.si : +host.dataset.i,
        sd: side ? host.dataset.k : null,
        n: isFn ? host.dataset.n : null,
        g: isFn ? +(host.querySelector('[data-g]') || { dataset: { g: 0 } }).dataset.g : null,
        a: sp.a,
        z: sp.z,
        first: !isFn && !side && host.classList.contains('first'),
        last: !isFn && !side && !host.classList.contains('brk'),
      };
      host.contentEditable = 'plaintext-only';
      host.spellcheck = false;
      host.classList.add('ed-live');
      host.classList.remove('ed-hov', 'ed-sel');
      const pg = host.closest('section.page');
      if (pg) pg.classList.add('ed-editing');
      ed.start = extract(host);
      host.focus({ preventScroll: true });
      if (at) {
        const sel = getSelection();
        if (at.range) {
          sel.removeAllRanges();
          sel.addRange(at.range);
        } else if (at.idx != null) {
          const p = pointAt(host, at.idx);
          const r = document.createRange();
          r.setStart(p.node, p.off);
          if (at.idx2 != null && at.idx2 > at.idx) {
            const q = pointAt(host, at.idx2);
            r.setEnd(q.node, q.off);
          } else r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      post({ type: 'editing', on: true, i: ed.i, sd: ed.sd, n: ed.n, g: ed.g });
      caretInfo();
      return true;
    }
    /** موضع التحديد الحالي في النص المستخرج */
    function selIdx() {
      const sel = getSelection();
      if (!ed || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!ed.host.contains(r.startContainer) && r.startContainer !== ed.host) return null;
      const s = indexOf(ed.host, r.startContainer, r.startOffset);
      const e = r.collapsed ? s : indexOf(ed.host, r.endContainer, r.endOffset);
      return { s: Math.min(s, e), e: Math.max(s, e) };
    }
    /** إنهاء جلسة الكتابة ← يُرسل ما كُتب (opts: keep يبقى المؤشر بعد إعادة التنضيد، merge، next، req، cmd) */
    function endEdit(opts = {}) {
      if (!ed) return false;
      const sel = opts.sel || selIdx() || null;
      const e = ed;
      ed = null;
      const text = extract(e.host);
      e.host.contentEditable = 'false';
      e.host.classList.remove('ed-live');
      const pg = e.host.closest('section.page');
      if (pg) pg.classList.remove('ed-editing');
      const changed = text !== e.start;
      post({ type: 'commit', i: e.i, sd: e.sd, n: e.n, g: e.g, a: e.a, z: e.z, text: changed ? text : null, sel, keep: !!opts.keep, merge: opts.merge || null, next: opts.next || null, req: opts.req || null, cmd: opts.cmd || null });
      return true;
    }
    /** خروجٌ بلا حفظ (لم يتغيّر شيء): يُنتقل إلى فقرة أخرى دون إعادة تنضيد */
    function quietEnd() {
      if (!ed) return;
      const e = ed;
      ed = null;
      e.host.contentEditable = 'false';
      e.host.classList.remove('ed-live');
      const pg = e.host.closest('section.page');
      if (pg) pg.classList.remove('ed-editing');
    }
    const dirty = () => !!ed && extract(ed.host) !== ed.start;
    /** الانتقال إلى فقرة أخرى عند نقطة (x, y): بلا حفظ إن لم يتغيّر شيء، وإلا يُحفظ ويُنقل المؤشر بعد إعادة التنضيد */
    function moveTo(host, x, y) {
      if (!host || !canEdit(host)) return false;
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
      if (dirty()) {
        endEdit({ keep: true, next: pointInfo(x, y) || (host.matches('.fn') ? null : isSide(host) ? { i: +host.dataset.si, sd: host.dataset.k, o: 0 } : { i: +host.dataset.i, o: (spanOf(host) || { a: 0 }).a }) });
        return true;
      }
      quietEnd();
      startEdit(host, r && host.contains(r.startContainer) ? { range: r } : { idx: 0 });
      const hr = host.getBoundingClientRect();
      if (hr.top < 30 || hr.bottom > window.innerHeight - 30) window.scrollBy(0, hr.top < 30 ? hr.top - 60 : hr.bottom - window.innerHeight + 60);
      return true;
    }
    const hostsInOrder = () => [...book.querySelectorAll('.flow > p.p[data-i]')];
    /** نقرةٌ في الصفحة خارج النص (فوقه أو تحته أو في الهامش): المؤشر في أقرب فقرة، كما في Word */
    function nearestText(e) {
      const pgEl = e.target.closest && e.target.closest('section.page');
      if (!pgEl || e.target.closest('[data-i]:not(p), .fn, .mside-n')) return false;
      let best = null;
      let bd = Infinity;
      for (const h of pgEl.querySelectorAll('.flow > p.p[data-i]')) {
        const r = h.getBoundingClientRect();
        const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        if (d < bd) (bd = d), (best = h);
      }
      if (!best || !canEdit(best)) return false;
      e.preventDefault();
      const r = best.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(best).lineHeight) || 24;
      const y = Math.max(r.top + lh / 2, Math.min(r.bottom - lh / 2, e.clientY));
      const x = Math.max(r.left + 1, Math.min(r.right - 1, e.clientX));
      const cr = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
      startEdit(best, cr && best.contains(cr.startContainer) ? { range: cr } : { idx: 0 });
      return true;
    }
    let caretT = 0;
    function caretInfo() {
      if (!ed) return;
      cancelAnimationFrame(caretT);
      caretT = requestAnimationFrame(() => {
        const s = ed && selIdx();
        if (s) post({ type: 'caret', i: ed.i, sd: ed.sd, n: ed.n, g: ed.g, o: ed.a + s.s, o2: ed.a + s.e, len: extract(ed.host).length, a: ed.a });
      });
    }
    document.addEventListener('selectionchange', () => ed && caretInfo());
    /** موضع النقر في نص القطعة (للمؤشر بعد إعادة التنضيد) */
    function pointInfo(x, y) {
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
      if (!r) return null;
      const el = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
      const host = el && el.closest && el.closest(HOSTS);
      if (!host || !canEdit(host)) return null;
      const sp = spanOf(host);
      const idx = indexOf(host, r.startContainer, r.startOffset);
      if (isSide(host)) return { i: +host.dataset.si, sd: host.dataset.k, o: sp.a + idx };
      return host.matches('.fn') ? { n: host.dataset.n, g: +(host.querySelector('[data-g]') || { dataset: { g: 0 } }).dataset.g, o: sp.a + idx } : { i: +host.dataset.i, o: sp.a + idx };
    }
    document.addEventListener(
      'keydown',
      (e) => {
        if (!ed || !ed.host.contains(e.target === document.body ? document.activeElement : e.target)) return;
        const k = e.key;
        const s = selIdx();
        if (k === 'Escape') {
          e.preventDefault();
          return void endEdit({ keep: false });
        }
        if (k === 'Enter') {
          // فقرة جديدة: سطرٌ يُكتب الآن، ويصير فقرةً حين يُعاد التنضيد
          e.preventDefault();
          const sel = getSelection();
          if (!sel.rangeCount) return;
          const r = sel.getRangeAt(0);
          r.deleteContents();
          const nl = document.createTextNode('\n');
          r.insertNode(nl);
          // سطرٌ جديد في آخر النص: لا يُرى ما لم يُكتب بعده، فيقع المؤشر بعد حرفٍ خفيٍّ فيه (يُحذف عند الحفظ)
          const after = document.createRange();
          after.setStartAfter(nl);
          after.setEnd(ed.host, ed.host.childNodes.length);
          if (!clean(after.toString())) {
            const zw = document.createTextNode('\u200b');
            nl.after(zw);
            r.setStartAfter(zw);
          } else r.setStartAfter(nl);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
          caretInfo();
          return;
        }
        if (k === 'Backspace' && s && s.s === 0 && s.e === 0 && ed.first && ed.a === 0 && ed.i != null && !ed.sd) {
          e.preventDefault();
          return void endEdit({ keep: true, merge: 'prev', sel: s });
        }
        if (k === 'Delete' && s && s.s === s.e && ed.last && ed.i != null && !ed.sd && s.s >= extract(ed.host).length) {
          e.preventDefault();
          return void endEdit({ keep: true, merge: 'next', sel: s });
        }
        if (/^Arrow(Up|Down|Left|Right)$/.test(k) && !e.shiftKey && s && s.s === s.e) {
          // الأسهم تتجاوز حدود الفقرة إلى ما قبلها وما بعدها (كما في Word)
          const sel = getSelection();
          const cr = sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
          const hr = ed.host.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(ed.host).lineHeight) || 24;
          const len = extract(ed.host).length;
          const list = hostsInOrder();
          const at = list.indexOf(ed.host);
          let go = 0;
          if (k === 'ArrowDown' && cr && cr.height && cr.bottom > hr.bottom - lh * 0.75) go = 1;
          if (k === 'ArrowUp' && cr && cr.height && cr.top < hr.top + lh * 0.75) go = -1;
          if (k === 'ArrowLeft' && s.s >= len) go = 1;
          if (k === 'ArrowRight' && s.s === 0) go = -1;
          const next = at >= 0 && go ? list[at + go] : null;
          if (next) {
            e.preventDefault();
            e.stopPropagation();
            const nr = next.getBoundingClientRect();
            const x = cr && cr.height && (k === 'ArrowUp' || k === 'ArrowDown') ? cr.left : go > 0 ? nr.right - 2 : nr.left + 2;
            const y = go > 0 ? nr.top + Math.min(lh / 2, nr.height / 2) : nr.bottom - Math.min(lh / 2, nr.height / 2);
            moveTo(next, Math.max(nr.left + 1, Math.min(nr.right - 1, x)), y);
            return;
          }
        }
        if ((e.ctrlKey || e.metaKey) && !/^[zyxcva]$/i.test(k)) {
          // اختصارات التنسيق تعود إلى المحرِّر (يحفظ ما كُتب ثم يطبّق)
          e.preventDefault();
          post({ type: 'key', key: k, ctrl: true, shift: e.shiftKey, alt: e.altKey, editing: true });
        }
        e.stopPropagation();
      },
      true,
    );
    document.addEventListener('click', (e) => {
      const m = e.target.closest && e.target.closest('.ed-memo');
      if (m) post({ type: 'memoOpen', i: +m.dataset.memo });
      const ic = e.target.closest && e.target.closest('.ed-imgchip');
      if (ic) post({ type: 'click', hit: { i: +ic.dataset.img } });
    });
    // الزر الأيمن: قائمة المحرِّر (التنسيق، والنوع، والإدراج، وأوامر القطعة)
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      post({ type: 'ctx', hit: ed && ed.host.contains(e.target) ? null : hitOf(e.target), x: e.clientX, y: e.clientY, editing: !!ed });
    });
    // Ctrl مع عجلة الفأرة: تكبير وتصغير
    document.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      post({ type: 'zoom', d: e.deltaY < 0 ? 1 : -1 });
    }, { passive: false });
    // اللصق نصاً خالصاً
    document.addEventListener('paste', (e) => {
      if (!ed) return;
      e.preventDefault();
      // صورة في الحافظة: تُدرج بعد الفقرة (كما في Word)
      const f = !ed.sd && e.clipboardData && [...e.clipboardData.files].find((x) => /^image\/(png|jpeg|gif|webp)$/.test(x.type));
      if (f) {
        const fr = new FileReader();
        const at = { i: ed.i };
        fr.onload = () => {
          const im = new Image();
          im.onload = () => post({ type: 'pasteImg', ...at, src: fr.result, w: im.naturalWidth, h: im.naturalHeight, size: f.size, mime: f.type });
          im.src = fr.result;
        };
        fr.readAsDataURL(f);
        return;
      }
      const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      document.execCommand('insertText', false, t.replace(/\r\n?/g, '\n'));
    });

    /* ---------------------------------------------------------- المسطرة: المسافات البادئة للفقرة تُسحب */
    const PXMM = 96 / 25.4;
    let ruler = null;
    let rdrag = null;
    function showRuler(i) {
      if (ruler) ruler.remove();
      ruler = null;
      if (i == null) return;
      const frags = [...book.querySelectorAll('p.p[data-i="' + i + '"]')];
      const first = frags.find((f) => f.classList.contains('first')) || frags[0];
      if (!first) return;
      const body = first.closest('.body');
      const br = rectIn(body);
      const cs = getComputedStyle(first);
      const isPx = parseFloat(cs.marginRight) || 0;
      const iePx = parseFloat(cs.marginLeft) || 0;
      const indPx = parseFloat(cs.textIndent) || 0;
      const r = document.createElement('div');
      r.className = 'ed-ruler ed-ui';
      r.style.cssText = 'left:' + br.x + 'px;top:' + (br.y - 22) + 'px;width:' + br.w + 'px';
      const mm = br.w / PXMM;
      let h = '';
      for (let m = 0; m <= mm; m += 1) {
        const x = br.w - m * PXMM;
        if (m % 10 === 0) h += '<i class="tk l" style="left:' + x + 'px"></i>' + (m ? '<b class="nm" style="left:' + x + 'px">' + ar(m / 10) + '</b>' : '');
        else if (m % 5 === 0) h += '<i class="tk s" style="left:' + x + 'px"></i>';
      }
      h += '<i class="mk first" data-mk="first" title="السطر الأول"></i><i class="mk start" data-mk="start" title="بداية الفقرة (يمين)"></i><i class="mk end" data-mk="end" title="نهاية الفقرة (يسار)"></i>';
      r.innerHTML = h;
      book.appendChild(r);
      ruler = r;
      r.__ = { i, frags, first, w: br.w, isPx, iePx, indPx };
      placeMarks();
    }
    function placeMarks() {
      if (!ruler) return;
      const d = ruler.__;
      ruler.querySelector('.mk.start').style.left = d.w - d.isPx + 'px';
      ruler.querySelector('.mk.first').style.left = d.w - d.isPx - d.indPx + 'px';
      ruler.querySelector('.mk.end').style.left = d.iePx + 'px';
    }
    document.addEventListener('mousedown', (e) => {
      const mk = e.target.closest && e.target.closest('.ed-ruler .mk');
      if (!mk || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      rdrag = { mk: mk.dataset.mk, x0: e.clientX, d0: { ...ruler.__ } };
      mk.classList.add('on');
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!rdrag || !ruler) return;
      const d = ruler.__;
      const dx = e.clientX - rdrag.x0;
      const snap = (px) => Math.round(px / PXMM / 0.5) * 0.5 * PXMM; // كل نصف مليمتر
      if (rdrag.mk === 'start') d.isPx = Math.max(-20 * PXMM, Math.min(d.w * 0.7, snap(rdrag.d0.isPx - dx)));
      else if (rdrag.mk === 'first') d.indPx = Math.max(-d.isPx - 20 * PXMM, Math.min(d.w * 0.7, snap(rdrag.d0.indPx - dx)));
      else d.iePx = Math.max(-20 * PXMM, Math.min(d.w * 0.7, snap(rdrag.d0.iePx + dx)));
      // معاينة في الحال
      for (const f of d.frags) {
        f.style.marginRight = d.isPx + 'px';
        f.style.marginLeft = d.iePx + 'px';
      }
      d.first.style.textIndent = d.indPx + 'px';
      placeMarks();
      let v = ruler.querySelector('.val');
      if (!v) {
        v = document.createElement('b');
        v.className = 'val';
        ruler.appendChild(v);
      }
      const mmv = (px) => ar((Math.round((px / PXMM) * 2) / 2).toString()).replace('.', '٫');
      v.textContent = rdrag.mk === 'start' ? 'من اليمين ' + mmv(d.isPx) + ' مم' : rdrag.mk === 'first' ? 'السطر الأول ' + mmv(d.indPx) + ' مم' : 'من اليسار ' + mmv(d.iePx) + ' مم';
      v.style.left = ruler.querySelector('.mk.' + rdrag.mk).style.left;
    });
    document.addEventListener('mouseup', (e) => {
      if (!rdrag) return;
      const k = rdrag.mk;
      rdrag = null;
      e.stopPropagation();
      if (!ruler) return;
      const d = ruler.__;
      const mmr = (px) => Math.round((px / PXMM) * 2) / 2;
      post({ type: 'rulerSet', i: d.i, ps: k === 'start' ? { is: mmr(d.isPx) } : k === 'first' ? { ind: mmr(d.indPx) } : { ie: mmr(d.iePx) } });
    }, true);

    /* ---------------------------------------------------------- خلايا الجداول: تُكتب في مكانها */
    let cellEd = null;
    function startCell(td) {
      if (!td || cellEd) return;
      if (ed) quietEnd();
      td.contentEditable = 'plaintext-only';
      td.classList.add('ed-live');
      const tb = td.closest('table[data-i]');
      cellEd = { td, i: +tb.dataset.i, r: +td.dataset.r, c: +td.dataset.c, start: td.innerText };
      td.focus();
      const r = document.createRange();
      r.selectNodeContents(td);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      post({ type: 'cellOn', i: cellEd.i, r: cellEd.r, c: cellEd.c });
    }
    function endCell(save, next) {
      if (!cellEd) return;
      const x = cellEd;
      cellEd = null;
      x.td.contentEditable = 'false';
      x.td.classList.remove('ed-live');
      const text = x.td.innerText.replace(/\n$/, '');
      if (save && text !== x.start) post({ type: 'cell', i: x.i, r: x.r, c: x.c, text, next: next || null });
      else if (next) {
        const td = book.querySelector('table[data-i="' + x.i + '"] [data-r="' + next.r + '"][data-c="' + next.c + '"]');
        if (td) startCell(td);
      }
    }
    document.addEventListener('keydown', (e) => {
      if (!cellEd) return;
      e.stopPropagation();
      if (e.key === 'Escape') return void (e.preventDefault(), endCell(true));
      if (e.key === 'Enter' && !e.shiftKey) return void (e.preventDefault(), endCell(true));
      if (e.key === 'Tab') {
        // Tab: الخلية التالية (Shift+Tab: السابقة)، كما في Word
        e.preventDefault();
        const cells = [...book.querySelectorAll('table[data-i="' + cellEd.i + '"] [data-r][data-c]')];
        const k = cells.indexOf(cellEd.td);
        const n = cells[k + (e.shiftKey ? -1 : 1)];
        endCell(true, n ? { r: +n.dataset.r, c: +n.dataset.c } : null);
      }
    }, true);
    document.addEventListener('mousedown', (e) => {
      if (cellEd && !cellEd.td.contains(e.target)) endCell(true);
    }, true);

    /* ---------------------------------------------------------- العناوين والأبيات: خانة كتابة فوقها */
    let inl = null;
    function closeInline(save) {
      if (!inl) return;
      const x = inl;
      inl = null;
      const values = x.inputs.map((i) => i.value);
      for (const i of x.inputs) i.remove();
      if (save && JSON.stringify(values) !== JSON.stringify(x.values)) post({ type: 'inlineDone', i: x.i, values });
    }
    function openInline(i, values) {
      closeInline(false);
      const el = book.querySelector('[data-i="' + i + '"]');
      if (!el) return;
      const parts = el.classList.contains('verse') ? [...el.querySelectorAll(':scope > .hm')] : [el];
      const inputs = values.map((v, k) => {
        const target = parts[k] || el;
        const r = posIn(target);
        const cs = getComputedStyle(target.querySelector('span') || target);
        const inp = document.createElement('input');
        inp.className = 'ed-in ed-ui';
        inp.value = v;
        inp.dir = 'rtl';
        inp.style.cssText += 'left:' + (r.x - 4) + 'px;top:' + (r.y - 2) + 'px;width:' + (r.w + 8) + 'px;height:' + (r.h + 4) + 'px;font:' + cs.font + ';color:' + cs.color + ';';
        book.appendChild(inp);
        inp.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            closeInline(true);
          } else if (e.key === 'Escape') closeInline(false);
          else if (e.key === 'Tab' && inputs.length > 1) {
            e.preventDefault();
            inputs[(k + 1) % inputs.length].focus();
          }
        });
        return inp;
      });
      inl = { i, values, inputs };
      inputs[0].focus();
      inputs[0].select();
    }
    document.addEventListener('mousedown', (e) => {
      if (inl && !e.target.closest('.ed-in')) closeInline(true);
    }, true);

    /* ---------------------------------------------------------- الصورة: نقلها وتغيير مقاسها بالفأرة */
    let ih = null;
    let drag = null;
    function imgHandles(i) {
      if (ih) ih.remove();
      ih = null;
      if (i == null) return;
      const el = book.querySelector('.fig[data-i="' + i + '"], .fig-abs[data-i="' + i + '"]');
      if (!el) return;
      const img = el.querySelector('img');
      const r = rectIn(img);
      ih = document.createElement('div');
      ih.className = 'ed-ih ed-ui' + (el.classList.contains('fig-abs') ? ' mv' : '');
      ih.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
      ih.innerHTML = '<b class="tl"></b><b class="tr"></b><b class="bl"></b><b class="br"></b><i></i>';
      ih.__el = el;
      ih.__i = i;
      book.appendChild(ih);
    }
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // الصورة خلف النص أو أمامه تُسحب مباشرة لتُنقل
      // Alt مع النقر: الصورة التي تحت النص
      const under = e.altKey && document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest && x.closest('.fig-abs[data-i], .fig[data-i]')).find(Boolean) : null;
      if (under && !under.classList.contains('fig-abs')) {
        e.preventDefault();
        e.stopPropagation();
        if (ed) endEdit({ keep: false });
        post({ type: 'click', hit: { i: +under.dataset.i } });
        return;
      }
      const fa = under || (!!e.target.closest && !e.target.closest('.ed-ui') && e.target.closest('.fig-abs[data-i]'));
      if (fa) {
        if (ed) endEdit({ keep: false });
        if (!ih || ih.__el !== fa) imgHandles(+fa.dataset.i);
        post({ type: 'click', hit: { i: +fa.dataset.i } });
      }
      if (!ih) return;
      const corner = e.target.closest && e.target.closest('.ed-ih b');
      const mv = (fa || (e.target.closest && e.target.closest('.ed-ih.mv'))) && !corner;
      if (!corner && !mv) return;
      e.preventDefault();
      e.stopPropagation();
      const el = ih.__el;
      const img = el.querySelector('img');
      const body = el.closest('.body');
      const flowW = (body && body.querySelector('.flow') ? body.querySelector('.flow').clientWidth : body.clientWidth) || 1;
      drag = { mode: corner ? 'size' : 'move', corner: corner && corner.className, x0: e.clientX, y0: e.clientY, w0: img.offsetWidth, h0: img.offsetHeight, l0: parseFloat(el.style.left) || 50, t0: parseFloat(el.style.top) || 30, bw: body.clientWidth, bh: body.clientHeight, flowW, el, img, i: ih.__i };
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      const lab = ih && ih.querySelector('i');
      if (drag.mode === 'size') {
        const sign = /l$/.test(drag.corner) ? -1 : 1;
        const w = Math.max(20, drag.w0 + sign * dx * (drag.el.classList.contains('fig-abs') || drag.el.classList.contains('fl') || drag.el.classList.contains('a-c') ? (drag.el.classList.contains('a-c') ? 2 : 1) : 1));
        const h = (w * drag.h0) / drag.w0;
        drag.img.style.width = w + 'px';
        drag.img.style.height = h + 'px';
        if (drag.el.classList.contains('fl') || drag.el.classList.contains('fig-abs')) drag.el.style.width = w + 'px';
        drag.pct = Math.max(5, Math.min(100, Math.round((w / drag.flowW) * 100)));
        if (lab) lab.textContent = drag.pct + '٪ من عرض السطر';
      } else {
        const x = Math.max(0, Math.min(100, drag.l0 + (dx / drag.bw) * 100));
        const y = Math.max(0, Math.min(100, drag.t0 + (dy / drag.bh) * 100));
        drag.el.style.left = x + '%';
        drag.el.style.top = y + '%';
        drag.xy = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      }
      const r = rectIn(drag.img);
      ih.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
    });
    document.addEventListener('mouseup', (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      e.stopPropagation();
      if (d.mode === 'size' && d.pct) post({ type: 'imgset', i: d.i, set: { wPct: d.pct } });
      else if (d.mode === 'move' && d.xy) post({ type: 'imgset', i: d.i, set: { x: d.xy[0], y: d.xy[1] } });
    }, true);

    /* ---------------------------------------------------------- اختيار موضعٍ في النص («اجعله حاشية») */
    let pickPt = false;
    const wordLen = (w) => (w.dataset.t != null ? w.dataset.t.length : w.textContent.replace(/\u200b/g, '').length) - (+w.dataset.x || 0);
    window.addEventListener('mousedown', (e) => {
      if (!pickPt || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      pickPt = false;
      document.body.classList.remove('ed-pickpt');
      const el = document.elementFromPoint(e.clientX, e.clientY);
      let w = el && el.closest && el.closest('i.ew');
      // علامةٌ بعد الكلمة (نقطة، قوس): الكلمة التي قبلها
      if (!w && el && el.closest && el.closest('i.mb')) {
        const mb = el.closest('i.mb');
        w = mb.previousElementSibling && mb.previousElementSibling.matches('i.ew') ? mb.previousElementSibling : null;
      }
      let at = null;
      if (w) {
        const own = ownerOf(w);
        if (own) at = { ...own, o: +w.dataset.o + wordLen(w), word: w.textContent };
      } else at = pointInfo(e.clientX, e.clientY);
      post({ type: 'notePoint', ...(at || {}), none: !at });
    }, true);
    window.addEventListener('keydown', (e) => {
      if (!pickPt || e.key !== 'Escape') return;
      pickPt = false;
      document.body.classList.remove('ed-pickpt');
      post({ type: 'notePoint', none: true, cancel: true });
    }, true);

    /* ---------------------------------------------------------- التحديد بالسحب (أداة التحديد) */
    // السحب فوق الكلمات يحدّد ما مُرّ عليه وحده حرفاً حرفاً (فتُحدَّد الآية أو الحديث داخل السطر بعينه)؛
    // ولا يُحدَّد السطر كله إلا إذا مرّ المؤشر على فراغٍ في السطر (بعد آخره، أو بين الأسطر) أو في الهامش بإزائه،
    // ولا الفقرة كلها إلا إذا مرّ على ما بين الفقرات أو بعيداً عن النص.
    const PICK_HOST = 'p.p[data-i], .fn[data-n], .verse[data-i]';
    const PICK_SKIP = '.ed-ui, .ed-ih, .ed-imgchip, .ed-memo, .fig, .fig-abs, .tbl, table, .mc-label, .mintro, .orn, .hrule, .pbreak, .mside-n, input, textarea';
    let pick = null;
    const unitEls = (host) => [...host.querySelectorAll(host.matches('.verse') ? ':scope > .hm' : 'i.ew')];
    const firstText = (el) => {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      return tw.nextNode();
    };
    const lastText = (el) => {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n = null;
      for (let x = tw.nextNode(); x; x = tw.nextNode()) n = x;
      return n;
    };
    const startOf = (el) => {
      const t = firstText(el);
      return t ? { node: t, off: 0 } : null;
    };
    const endOf = (el) => {
      const t = lastText(el);
      return t ? { node: t, off: t.data.length } : null;
    };
    /** ترتيب نقطتين في المستند: سالبٌ إن كانت الأولى قبل الثانية */
    const cmpPt = (a, b) => {
      if (!a || !b) return 0;
      const r = document.createRange();
      try {
        r.setStart(a.node, a.off);
        return -r.comparePoint(b.node, b.off);
      } catch {
        return 0;
      }
    };
    /** أسطر القطعة: كلماتها مجموعةً بموضعها الرأسي */
    function linesOf(host) {
      const out = [];
      for (const w of unitEls(host)) {
        const rs = [...w.getClientRects()].filter((r) => r.width || r.height);
        for (const r of rs) {
          let ln = out.find((l) => Math.abs(l.mid - (r.top + r.bottom) / 2) < Math.max(4, r.height * 0.45));
          if (!ln) out.push((ln = { mid: (r.top + r.bottom) / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, ws: [] }));
          ln.top = Math.min(ln.top, r.top);
          ln.bottom = Math.max(ln.bottom, r.bottom);
          ln.left = Math.min(ln.left, r.left);
          ln.right = Math.max(ln.right, r.right);
          if (!ln.ws.includes(w)) ln.ws.push(w);
        }
      }
      return out.sort((a, b) => a.mid - b.mid);
    }
    const lineAtY = (host, y) => {
      const ls = linesOf(host);
      let best = null;
      let bd = Infinity;
      for (const l of ls) {
        const d = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0;
        if (d < bd) (bd = d), (best = l);
      }
      return best;
    };
    /** حدّا السطر أو القطعة كلها ← { a, z } */
    const lineSpan = (l) => (l && l.ws.length ? { a: startOf(l.ws[0]), z: endOf(l.ws[l.ws.length - 1]) } : null);
    const hostSpan = (host) => {
      const us = unitEls(host);
      return us.length ? { a: startOf(us[0]), z: endOf(us[us.length - 1]) } : null;
    };
    /** نقطةٌ في النص تحت المؤشر (إن كان المؤشر على كلمةٍ أو بين كلمتين في سطرٍ واحد) */
    function wordPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      if (!el || !el.closest || el.closest(PICK_SKIP)) return null;
      const host = el.closest(PICK_HOST);
      if (!host) return null;
      const onUnit = el.closest('i.ew, i.mb, .fr, .verse > .hm');
      if (!onUnit) {
        // بين كلمتين في السطر نفسه: نصٌّ أيضاً؛ أما بعد آخر السطر وما بين الأسطر ففراغ
        const l = lineAtY(host, y);
        if (!l || y < l.top - 1 || y > l.bottom + 1 || x < l.left - 1 || x > l.right + 1) return null;
      }
      const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
      if (!r || !host.contains(r.startContainer) || r.startContainer.nodeType !== 3) return null;
      const pe = r.startContainer.parentElement;
      if (pe && pe.closest('.vsep,.vno')) return null;
      const bit = pe && pe.closest(SKIP);
      if (bit) {
        // رقم الحاشية أو علامةٌ ملتصقة بالكلمة: أقرب كلمةٍ بعدها (أو قبلها)
        const us = unitEls(host);
        const next = us.find((u) => bit.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING);
        const prev = [...us].reverse().find((u) => bit.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_PRECEDING);
        const pt = next ? startOf(next) : prev ? endOf(prev) : null;
        return pt ? { ...pt, host } : null;
      }
      return { node: r.startContainer, off: r.startOffset, host };
    }
    /** الفراغ تحت المؤشر: سطرٌ (في القطعة أو في الهامش بإزائها) أو قطعة ← { kind, span, host } */
    function blankAt(x, y) {
      const el = document.elementFromPoint(x, y);
      const pg = el && el.closest && el.closest('section.page');
      if (!pg) return null;
      const inHost = el.closest(PICK_HOST);
      if (inHost) {
        const sp = inHost.matches('.verse') ? hostSpan(inHost) : lineSpan(lineAtY(inHost, y));
        return sp ? { kind: inHost.matches('.verse') ? 'block' : 'line', span: sp, host: inHost } : null;
      }
      const hosts = [...pg.querySelectorAll(PICK_HOST)];
      let best = null;
      let bd = Infinity;
      for (const h of hosts) {
        const r = h.getBoundingClientRect();
        const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        if (d < bd) (bd = d), (best = h);
      }
      if (!best) return null;
      const body = pg.querySelector('.body');
      const br = body ? body.getBoundingClientRect() : pg.getBoundingClientRect();
      // في الهامش الأيمن أو الأيسر بإزاء سطرٍ من القطعة: ذلك السطر
      if (bd === 0 && (x > br.right || x < br.left) && !best.matches('.verse')) {
        const sp = lineSpan(lineAtY(best, y));
        if (sp) return { kind: 'line', span: sp, host: best };
      }
      const sp = hostSpan(best);
      return sp ? { kind: 'block', span: sp, host: best } : null;
    }
    function pickTo(x, y) {
      if (!pick) return;
      const w = wordPoint(x, y);
      let focus;
      if (w) focus = w;
      else {
        const b = blankAt(x, y);
        if (!b) return;
        // يُؤخذ من السطر أو القطعة طرفُها الأبعد عن بداية التحديد
        const after = cmpPt(pick.a, b.span.a) <= 0;
        const before = cmpPt(b.span.z, pick.z) <= 0;
        if (after && !before) focus = b.span.z;
        else if (before && !after) focus = b.span.a;
        else focus = x < pick.x0 ? b.span.z : b.span.a; // في السطر نفسه: إلى اليسار فما بعده (الكتابة من اليمين)
      }
      if (!focus) return;
      const sel = getSelection();
      const base = cmpPt(pick.a, focus) >= 0 ? pick.a : pick.z;
      try {
        sel.setBaseAndExtent(base.node, base.off, focus.node, focus.off);
      } catch {}
    }
    function pickScroll() {
      if (!pick || !pick.moved) return;
      const y = pick.y;
      const edge = 36;
      const d = y < edge ? -(edge - y) : y > window.innerHeight - edge ? y - (window.innerHeight - edge) : 0;
      if (d) {
        window.scrollBy(0, Math.max(-40, Math.min(40, d)));
        pickTo(pick.x, pick.y);
      }
      pick.raf = requestAnimationFrame(pickScroll);
    }
    document.addEventListener('mousedown', (e) => {
      pick = null;
      if (e.button !== 0 || tool !== 'select' || ed || drag || ldrag || inl || cellEd || e.defaultPrevented) return;
      if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey || e.detail > 1) return;
      if (!e.target.closest || e.target.closest(PICK_SKIP)) return;
      const w = wordPoint(e.clientX, e.clientY);
      let a;
      let z;
      if (w) a = z = { node: w.node, off: w.off };
      else {
        // من فراغ: السطر (أو القطعة) الذي بدأ منه السحب
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || !el.closest || !el.closest('section.page')) return;
        const b = blankAt(e.clientX, e.clientY);
        if (!b || b.kind !== 'line') return;
        a = b.span.a;
        z = b.span.z;
      }
      if (!a || !z) return;
      e.preventDefault();
      getSelection().removeAllRanges();
      try {
        window.focus();
      } catch {}
      pick = { a, z, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, raf: 0 };
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!pick) return;
      if (!(e.buttons & 1)) {
        cancelAnimationFrame(pick.raf);
        pick = null;
        return;
      }
      pick.x = e.clientX;
      pick.y = e.clientY;
      if (!pick.moved && Math.hypot(e.clientX - pick.x0, e.clientY - pick.y0) < 3) return;
      if (!pick.moved) {
        pick.moved = true;
        pick.raf = requestAnimationFrame(pickScroll);
      }
      e.preventDefault();
      pickTo(e.clientX, e.clientY);
    }, true);
    document.addEventListener('mouseup', () => {
      if (!pick) return;
      cancelAnimationFrame(pick.raf);
      pick = null;
    }, true);

    /* ---------------------------------------------------------- النقر والتحديد */
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || drag || (e.target.closest && e.target.closest('.ed-ui'))) return;
      if (ed && ed.host.contains(e.target)) return; // داخل ما يُكتب: كما في أي محرر
      const host = e.target.closest && e.target.closest(HOSTS);
      // الهامش الجانبي يُكتب فيه بنقرةٍ واحدة بأي أداة (كما يُرى حين يُمرّ عليه)
      const writes = tool === 'type' || isSide(host);
      if (ed) {
        // فقرة أخرى ولم يتغيّر ما قبلها: يُنتقل إليها في الحال
        if (!dirty()) {
          quietEnd();
          if (writes && host && canEdit(host)) return void startEdit(host, null);
          post({ type: 'editing', on: false });
          return;
        }
        if (tool === 'type' && !host && !dirty()) {
          quietEnd();
          if (nearestText(e)) return;
        }
        // وإلا يُحفظ ما كُتب، ويُنقل المؤشر إليها بعد إعادة التنضيد
        const next = writes && host ? pointInfo(e.clientX, e.clientY) : null;
        e.preventDefault();
        endEdit({ keep: !!next, next });
        return;
      }
      if (writes && host && canEdit(host)) {
        // الكتابة: يصير النص قابلاً للكتابة قبل أن يضع المتصفح المؤشر، فيقع حيث نُقر ويُسحب التحديد كما في أي محرر
        startEdit(host, null);
        return;
      }
      if (tool === 'type' && !host && nearestText(e)) return;
      const cellT = e.target.closest && e.target.closest('table[data-i] [data-r][data-c]');
      if (tool === 'type' && cellT) {
        e.preventDefault();
        startCell(cellT);
        return;
      }
      if (tool === 'type') {
        const blk = e.target.closest('[data-i]');
        if (blk && (blk.matches('.h, .verse, .shlabel'))) {
          e.preventDefault();
          post({ type: 'inlineReq', i: +blk.dataset.i });
        }
      }
    });
    document.addEventListener('dblclick', (e) => {
      if (ed || tool === 'type') return;
      const cellT = e.target.closest && e.target.closest('table[data-i] [data-r][data-c]');
      if (cellT) return void startCell(cellT);
      const host = e.target.closest && e.target.closest(HOSTS);
      if (host && canEdit(host)) {
        const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        getSelection().removeAllRanges();
        startEdit(host, r ? { range: r } : null);
        return;
      }
      const blk = e.target.closest('[data-i]');
      if (blk && blk.matches('.h, .verse, .shlabel')) post({ type: 'inlineReq', i: +blk.dataset.i });
    });
    /* ---------------------------------------------------------- الهامش الجانبي: مقابضه حين يُمرّ عليه */
    // يُنقل بالمقبض أعلاه إلى أي موضع: يميناً أو يساراً (فيصير هامشاً أيسر أو أيمن)، وبإزاء فقرةٍ أخرى (فيتبعها)،
    // ويُغيَّر عرضه من حافته الداخلية وارتفاعه من أسفله؛ وما يُختار يُرسل إلى المحرِّر بالمليمتر (sideBox)
    let sbox = null;
    let sdrag = null;
    let sHideT = 0;
    const toMM = (px) => Math.round((px / MM) * 2) / 2;
    const mmTxt = (v) => ar(String(v)).replace('.', '٫');
    function showSbox(note) {
      clearTimeout(sHideT);
      if (!sbox) {
        const o = document.createElement('div');
        o.className = 'ed-sbox ed-ui';
        o.innerHTML = '<b class="sb-mv" title="اسحبه إلى حيث شئت: أعلى أو أسفل، أو إلى الهامش الآخر، أو بإزاء فقرةٍ أخرى"></b><i class="sb-w" title="اسحب لتغيير عرضه"></i><i class="sb-h" title="اسحب لتغيير ارتفاعه (الحيّز الذي يشغله)"></i><span class="sb-v"></span>';
        o.addEventListener('mouseenter', () => clearTimeout(sHideT));
        o.addEventListener('mouseleave', () => hideSbox());
        book.appendChild(o);
        sbox = { el: o, note };
      }
      sbox.note = note;
      placeSbox();
    }
    function placeSbox() {
      if (!sbox || !sbox.note.isConnected) return hideSbox(true);
      const r = rectIn(sbox.note);
      sbox.el.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
      sbox.el.classList.toggle('l', sbox.note.classList.contains('l'));
    }
    function hideSbox(now) {
      clearTimeout(sHideT);
      const go = () => {
        if (sdrag || !sbox) return;
        sbox.el.remove();
        sbox = null;
      };
      if (now) go();
      else sHideT = setTimeout(go, 400);
    }
    document.addEventListener('mouseover', (e) => {
      const n = e.target.closest && e.target.closest('.mside-n[data-si]');
      if (n && !sdrag && !pickPt) showSbox(n);
    });
    document.addEventListener('mouseout', (e) => {
      const n = e.target.closest && e.target.closest('.mside-n[data-si]');
      if (!n || sdrag) return;
      const to = e.relatedTarget;
      if (to && to.closest && (to.closest('.ed-sbox') || to.closest('.mside-n[data-si]') === n)) return;
      hideSbox();
    });
    document.addEventListener('mousedown', (e) => {
      const h = e.button === 0 && e.target.closest && e.target.closest('.ed-sbox > .sb-mv, .ed-sbox > .sb-w, .ed-sbox > .sb-h');
      if (!h || !sbox) return;
      e.preventDefault();
      e.stopPropagation();
      if (ed) {
        // ما كُتب فيه يُحفظ أولاً (ثم يُسحب بعد إعادة التنضيد)
        if (dirty()) return void (endEdit({ keep: false }), hideSbox(true));
        quietEnd();
        post({ type: 'editing', on: false });
      }
      const note = sbox.note;
      const pg = note.closest('section.page');
      if (!pg) return;
      sdrag = {
        mode: h.classList.contains('sb-mv') ? 'mv' : h.classList.contains('sb-w') ? 'w' : 'h',
        note, pg, x0: e.clientX, y0: e.clientY, moved: false,
        top0: note.offsetTop, left0: note.offsetLeft, w0: note.offsetWidth, h0: note.offsetHeight,
        slot: note.classList.contains('l') ? 'l' : 'r',
      };
      note.classList.add('ed-sdrag');
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!sdrag) return;
      const d = sdrag;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) < 3) return;
      d.moved = true;
      e.preventDefault();
      const n = d.note;
      const val = sbox && sbox.el.querySelector('.sb-v');
      if (d.mode === 'mv') {
        n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        const pw = d.pg.offsetWidth;
        const left = d.left0 + dx;
        const side = d.note.dataset.k === 'a' ? '' : left + d.w0 / 2 < pw / 2 ? ' · الهامش الأيسر' : ' · الهامش الأيمن';
        if (val) val.textContent = 'انقله' + side;
      } else if (d.mode === 'w') {
        const w = Math.max(6 * MM, Math.min(d.pg.offsetWidth - 4 * MM, d.w0 + (d.slot === 'r' ? -dx : dx)));
        n.style.width = w + 'px';
        if (val) val.textContent = 'العرض ' + mmTxt(toMM(w)) + ' مم';
      } else {
        const hh = Math.max(4 * MM, d.h0 + dy);
        n.style.minHeight = hh + 'px';
        if (val) val.textContent = 'الارتفاع ' + mmTxt(toMM(hh)) + ' مم';
      }
      placeSbox();
    }, true);
    document.addEventListener('mouseup', (e) => {
      if (!sdrag) return;
      const d = sdrag;
      sdrag = null;
      d.note.classList.remove('ed-sdrag');
      const val = sbox && sbox.el.querySelector('.sb-v');
      if (val) val.textContent = '';
      if (!d.moved) return;
      e.stopImmediatePropagation();
      const i = +d.note.dataset.si;
      const k = d.note.dataset.k;
      if (d.mode === 'w') return post({ type: 'sideBox', i, sd: k, box: { w: toMM(d.note.offsetWidth) } });
      if (d.mode === 'h') return post({ type: 'sideBox', i, sd: k, box: { h: toMM(parseFloat(d.note.style.minHeight) || d.note.offsetHeight) } });
      // النقل: موضعه الجديد في الصفحة
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(d.note.style.transform || '') || [0, 0, 0];
      const pw = d.pg.offsetWidth;
      const ph = d.pg.offsetHeight;
      const left = Math.max(0, Math.min(pw - d.w0, d.left0 + +m[1]));
      const top = Math.max(0, Math.min(ph - Math.min(d.h0, ph), d.top0 + +m[2]));
      // يُعبَر به وسط الصفحة: يصير في الهامش الآخر (والمتبادل يبقى متبادلاً)
      const slot = k === 'a' ? d.slot : left + d.w0 / 2 < pw / 2 ? 'l' : 'r';
      const x = slot === 'r' ? pw - (left + d.w0) : left;
      // القطعة التي هو بإزائها الآن: ما يقع أعلاه عندها (وإلا فأقرب قطعةٍ فوقه)
      const pr = d.pg.getBoundingClientRect();
      const kk = pr.height / (ph || pr.height) || 1;
      const topOf = (el) => (el.getBoundingClientRect().top - pr.top) / kk;
      const own = [...d.pg.querySelectorAll('[data-side]')].find((el) => SIDES[+el.dataset.side] && SIDES[+el.dataset.side].i === i) || d.pg.querySelector('[data-i="' + i + '"]');
      const ownTop = own ? topOf(own) : d.top0;
      let to = null;
      let toTop = null;
      let above = null;
      for (const el of d.pg.querySelectorAll('.body [data-i]')) {
        if (!el.offsetHeight || el.closest('.mside-n, .fn, table')) continue;
        if (!el.matches('p.p, .h, .verse, .shlabel')) continue;
        const r = el.getBoundingClientRect();
        const t = (r.top - pr.top) / kk;
        const b = (r.bottom - pr.top) / kk;
        if (t <= top + 1 && b >= top - 1) {
          to = +el.dataset.i;
          break;
        }
        if (t <= top && (!above || t >= above.t)) above = { i: +el.dataset.i, t };
      }
      if (to == null && above) to = above.i;
      if (to != null) {
        const first = d.pg.querySelector('[data-i="' + to + '"]');
        toTop = first ? topOf(first) : null;
      }
      post({
        type: 'sideBox', i, sd: k,
        slot: slot !== d.slot ? slot : null,
        x: toMM(x),
        dy: toMM(top - ownTop),
        ...(to != null && to !== i && toTop != null ? { to, dyTo: toMM(top - toTop) } : {}),
      });
    }, true);

    // عنوان التعليق يُسحب يميناً أو وسطاً أو يساراً (ثلاثة مواضع)
    let ldrag = null;
    document.addEventListener('mousedown', (e) => {
      const sp = e.button === 0 && !ed && e.target.closest && e.target.closest('.mc-label > span, .mintro > span');
      if (!sp) return;
      e.preventDefault();
      ldrag = { sp, lab: sp.parentElement, x0: e.clientX, moved: false };
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!ldrag) return;
      const dx = e.clientX - ldrag.x0;
      if (!ldrag.moved && Math.abs(dx) < 5) return;
      ldrag.moved = true;
      ldrag.lab.classList.add('ed-drag');
      ldrag.sp.style.transform = 'translateX(' + dx + 'px)';
    }, true);
    document.addEventListener('mouseup', (e) => {
      if (!ldrag) return;
      const d = ldrag;
      ldrag = null;
      if (!d.moved) return;
      e.stopImmediatePropagation();
      const lr = d.lab.getBoundingClientRect();
      const sr = d.sp.getBoundingClientRect();
      const c = (sr.left + sr.right) / 2 - lr.left;
      const al = c < lr.width / 3 ? 'l' : c > (lr.width * 2) / 3 ? 'r' : 'c';
      d.lab.classList.remove('ed-drag');
      if (d.lab.classList.contains('mintro')) return post({ type: 'mintro', al, mx: d.lab.dataset.mx != null ? +d.lab.dataset.mx : null });
      const mc = d.lab.closest('.mc[data-mk]');
      post({ type: 'mlabel', al, mk: mc ? +mc.dataset.mk : null });
    }, true);
    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || ed || drag || (e.target.closest && e.target.closest('.ed-ui'))) return;
      if (tool === 'type') {
        // أداة الكتابة: ما ليس نصاً (صورة، فاصل) يُحدَّد بالنقر
        const obj = e.target.closest && e.target.closest('.fig[data-i], .fig-abs[data-i], .orn[data-i], .hrule[data-i], .pbreak[data-i], .tbl[data-i]');
        if (obj) post({ type: 'click', hit: { i: +obj.dataset.i } });
        return;
      }
      const sel = getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        const r = sel.getRangeAt(0);
        const a = offAt(r.startContainer, r.startOffset);
        const z = offAt(r.endContainer, r.endOffset);
        sel.removeAllRanges();
        if (a && z) {
          const oa = ownerOf(a.w);
          const oz = ownerOf(z.w);
          if (oa && oz && JSON.stringify(oa) === JSON.stringify(oz)) return post({ type: 'select', at: oa, a: Math.min(a.o, z.o), z: Math.max(a.o, z.o) });
          if (oa && oz && oa.i != null && oz.i != null) return post({ type: 'select', multi: [Math.min(oa.i, oz.i), Math.max(oa.i, oz.i)] });
        }
      }
      post({ type: 'click', hit: hitOf(e.target), alt: e.altKey, shift: e.shiftKey });
    });
    // اختصارات لوحة المفاتيح تعود إلى المحرِّر (الإطار يأخذ التركيز حين يُنقر)
    document.addEventListener('keydown', (e) => {
      if (ed || inl || cellEd) return;
      if (e.ctrlKey || e.metaKey || e.key === 'Escape' || e.key === 'Delete' || e.key === 'Enter' || /^(Arrow|Page)/.test(e.key) || /^[1-9]$/.test(e.key)) {
        if (!(e.ctrlKey && e.key.toLowerCase() === 'c')) e.preventDefault();
        post({ type: 'key', key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
      }
    });
    // ما يُضاء
    const elsOf = (it) =>
      it.sd != null ? [...book.querySelectorAll('.mside-n[data-si="' + it.i + '"][data-k="' + CSS.escape(it.sd) + '"]')] : it.mx != null ? [...book.querySelectorAll('.mintro[data-mx="' + it.mx + '"]')] : it.mc != null ? [...book.querySelectorAll('.mc[data-mk="' + it.mc + '"]')] : it.i != null ? [...book.querySelectorAll('[data-i="' + it.i + '"]')] : it.n != null ? [...book.querySelectorAll('.fn[data-n="' + CSS.escape(it.n) + '"]')] : [];
    /** موضعٌ معروض في الشطر ← (عقدة نص، إزاحة) */
    const pointIn = (hm, d) => {
      const tw = document.createTreeWalker(hm, NodeFilter.SHOW_TEXT);
      let n;
      let last = null;
      while ((n = tw.nextNode())) {
        if (d <= n.length) return [n, d];
        d -= n.length;
        last = n;
      }
      return last ? [last, last.length] : null;
    };
    /** موضع الحرف الأصلي k في الشطر المعروض (والكشيدة المزيدة بين حروفه) */
    const shownAt = (hm, k) => {
      const shown = hm.textContent;
      const orig = hm.dataset.orig || shown;
      let j = 0;
      for (let i = 0; i < shown.length; i++) {
        if (j === k) return i;
        if (j < orig.length && shown[i] === orig[j]) j++;
      }
      return shown.length;
    };
    const verseRanges = (v, it) => {
      const out = [];
      const l0 = +v.dataset.l0 || 0;
      for (const hm of v.querySelectorAll(':scope > .hm')) {
        const p = +hm.dataset.p || 0;
        const base = (p ? l0 + 3 : 0) + (+hm.dataset.lead || 0);
        const len = (hm.dataset.orig || hm.textContent).length;
        const a = Math.max(0, it.a - base);
        const z = Math.min(len, it.z - base);
        if (z <= a) continue;
        const A = pointIn(hm, shownAt(hm, a));
        const Z = pointIn(hm, shownAt(hm, z));
        if (!A || !Z) continue;
        const r = document.createRange();
        r.setStart(A[0], A[1]);
        r.setEnd(Z[0], Z[1]);
        out.push(r);
      }
      return out;
    };
    const rangesOf = (it) => {
      const out = [];
      for (const host of elsOf(it)) {
        if (host.classList.contains('verse')) {
          out.push(...verseRanges(host, it));
          continue;
        }
        for (const w of host.querySelectorAll('i.ew')) {
          if (it.n != null && it.g != null && +w.dataset.g !== it.g) continue;
          const o = +w.dataset.o;
          const len = w.textContent.length - (+w.dataset.x || 0);
          if (o + len <= it.a || o >= it.z) continue;
          const t = w.firstChild;
          if (!t) continue;
          const r = document.createRange();
          const x = +w.dataset.x || 0;
          r.setStart(t, Math.max(0, Math.min(t.length, it.a - o + x)));
          r.setEnd(t, Math.max(0, Math.min(t.length, it.z - o + x)));
          out.push(r);
        }
      }
      return out;
    };
    const layers = { hov: [], sel: [] };
    function mark(layer, items, color) {
      for (const el of layers[layer] || []) {
        el.classList.remove('ed-' + layer);
        el.style.removeProperty('--edc');
      }
      layers[layer] = [];
      const ranges = [];
      for (const it of items || []) {
        if (it.a != null && it.z != null) ranges.push(...rangesOf(it));
        else
          for (const el of elsOf(it)) {
            el.classList.add('ed-' + layer);
            if (color) el.style.setProperty('--edc', color);
            layers[layer].push(el);
          }
      }
      if (window.CSS && CSS.highlights) {
        if (ranges.length) CSS.highlights.set('ed-' + layer, new Highlight(...ranges));
        else CSS.highlights.delete('ed-' + layer);
      }
      if (layer === 'sel') {
        const one = items && items.length === 1 && items[0].i != null && items[0].a == null ? items[0].i : null;
        imgHandles(one != null && book.querySelector('.fig[data-i="' + one + '"], .fig-abs[data-i="' + one + '"]') ? one : null);
      }
    }
    // علامات الهامش: خارج الصفحة (يساراً)، فلا تمسّ تنضيد النص
    let tagsOn = true;
    let tagMap = {};
    const marks = document.createElement('div');
    marks.id = 'edMarks';
    book.appendChild(marks);
    function drawTags() {
      marks.innerHTML = '';
      // علامات الهامش تُطفأ وتُضاء، وملاحظات المراجع تبقى
      const T = tagsOn;
      const html = [];
      const memoDone = new Set();
      const bookW = book.offsetWidth;
      all.forEach((pg, pi) => {
        const pp = posIn(pg);
        const x = pp.x;
        html.push('<span class="ed-pno" style="left:' + (pp.x + pp.w + 10) + 'px;top:' + (pp.y + 4) + 'px">' + ar(pg.dataset.n || pi + 1) + '</span>');
        let run = null;
        const flush = () => {
          if (T && run && run.role) {
            html.push('<i class="ed-brk" style="--tc:' + run.color + ';left:' + (x - 14) + 'px;top:' + run.top + 'px;height:' + Math.max(8, run.bottom - run.top) + 'px"></i>');
            if (run.bottom - run.top > 40) html.push('<b class="ed-gtag" style="--tc:' + run.color + ';left:' + (x - 32) + 'px;top:' + run.top + 'px">' + esc(run.name) + '</b>');
          }
          run = null;
        };
        for (const el of pg.querySelectorAll('.flow > [data-i]')) {
          const t = tagMap[el.dataset.i];
          if (!t) continue;
          const r = posIn(el);
          const top = r.y;
          const bottom = r.y + r.h;
          if (T && t.tag) html.push('<span class="ed-tag" style="--tc:' + t.color + ';right:' + (bookW - x + 40) + 'px;top:' + (top + 2) + 'px">' + esc(t.tag) + '</span>');
          // المتون: أول الجزء علامةٌ في الهامش الأيمن
          if (T && t.unit) html.push('<span class="ed-unit" style="left:' + (pp.x + pp.w + 4) + 'px;top:' + (top + 22) + 'px">' + esc(t.unit) + '</span>');
          // ملاحظة المراجع: علامة في الهامش الأيمن خارج الصفحة
          if (t.memo && !memoDone.has(el.dataset.i) && memoDone.add(el.dataset.i)) html.push('<b class="ed-memo" data-memo="' + el.dataset.i + '" style="left:' + (pp.x + pp.w + 30) + 'px;top:' + (top + 2) + 'px" title="' + esc(t.memo) + '">✎</b>');
          if (run && run.role === t.role) run.bottom = bottom;
          else {
            flush();
            run = t.role ? { role: t.role, name: t.roleName, color: t.roleColor || t.color, top, bottom } : null;
          }
        }
        flush();
        // الهامش: خطٌّ له بجانب خط ما هو بإزائه (المتن أو الشرح)، يساره، بطول ما كُتب في الهامش؛ وكذلك موضع التعليق الذي بجانب المتن
        if (T) {
          const sides = [...pg.querySelectorAll(':scope > .mside-n'), ...pg.querySelectorAll('.mc-side')];
          let lastLab = -Infinity;
          for (const sn of sides) {
            const r = posIn(sn);
            if (r.h < 2) continue;
            const alt = sn.classList.contains('alt');
            const col = '#4F7A8C';
            html.push('<i class="ed-brk ed-sbrk" style="--tc:' + col + ';left:' + (x - 40) + 'px;top:' + r.y + 'px;height:' + Math.max(8, r.h) + 'px"></i>');
            if (r.y > lastLab + 46) {
              html.push('<b class="ed-gtag" style="--tc:' + col + ';left:' + (x - 58) + 'px;top:' + r.y + 'px">' + (sn.classList.contains('mc-side') ? 'هامش التعليق' : 'الهامش' + (sn.classList.contains('l') ? ' الأيسر' : ' الأيمن') + (alt ? ' (متبادل)' : '')) + '</b>');
              lastLab = r.y;
            }
          }
        }
        // الصورة خلف النص أو أمامه أو يلتف حولها: لها علامة تُنقر لتُحدَّد (فلا يحجبها النص)
        for (const fig of pg.querySelectorAll('.fig-abs[data-i], .fig.fl[data-i]')) {
          const im = fig.querySelector('img');
          if (!im) continue;
          const r = rectIn(im);
          html.push('<b class="ed-imgchip ed-ui" data-img="' + fig.dataset.i + '" style="left:' + (r.x + 4) + 'px;top:' + (r.y + 4) + 'px" title="حدّد الصورة (أو Alt مع النقر عليها)">▣ صورة</b>');
        }
        // المتون: موضع التعليق
        if (T)
          for (const mc of pg.querySelectorAll('.mc[data-mk]')) {
            const r = posIn(mc);
            html.push('<span class="ed-mct" style="right:' + (bookW - x + 40) + 'px;top:' + (r.y + 2) + 'px">التعليق · ' + esc(ar(+mc.dataset.mk + 1)) + '</span>');
          }
        if (T)
          for (const mi of pg.querySelectorAll('.mintro')) {
            const r = posIn(mi);
            html.push('<span class="ed-tag" style="--tc:#8A6727;right:' + (bookW - x + 40) + 'px;top:' + (r.y + 2) + 'px">قبل المتن</span>');
          }
        if (T && pg.querySelector('.notes .fn')) {
          const nr = posIn(pg.querySelector('.notes'));
          html.push('<span class="ed-tag" style="--tc:#5B6B7F;right:' + (bookW - x + 40) + 'px;top:' + (nr.y + 2) + 'px">الحواشي</span>');
        }
      });
      marks.innerHTML = html.join('');
    }
    // الصفحة الظاهرة، وموضع التمرير (ليبقى كما هو بعد إعادة التنضيد)
    let curPage = -1;
    let scrollT = 0;
    const onScroll = () => {
      const mid = window.innerHeight / 2;
      let k = 0;
      for (let i = 0; i < all.length; i++) if (all[i].getBoundingClientRect().top <= mid) k = i;
      if (k !== curPage) {
        curPage = k;
        post({ type: 'page', page: k, total: all.length });
      }
      cancelAnimationFrame(scrollT);
      scrollT = requestAnimationFrame(() => post({ type: 'scrollY', y: window.scrollY }));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', fit);
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== window.parent || !m || !m.ed) return;
      if (m.type === 'mark') mark(m.layer, m.items, m.color);
      else if (m.type === 'tags') {
        tagsOn = !!m.on;
        tagMap = m.map || tagMap;
        drawTags();
      } else if (m.type === 'lens') {
        book.classList.toggle('ed-dim', !!m.items);
        for (const el of book.querySelectorAll('.ed-lens')) el.classList.remove('ed-lens');
        for (const it of m.items || []) for (const el of elsOf(it)) el.classList.add('ed-lens');
      } else if (m.type === 'scroll') {
        const el = m.page != null ? all[m.page] : elsOf(m)[0];
        if (el) el.scrollIntoView({ block: m.page != null ? 'start' : 'center', behavior: m.smooth ? 'smooth' : 'auto' });
      } else if (m.type === 'scrollTo') window.scrollTo(0, m.y || 0);
      else if (m.type === 'pickPoint') {
        // «اجعله حاشية»: النقرة التالية تختار موضع الإحالة (آخر الكلمة المنقورة)
        pickPt = !!m.on;
        document.body.classList.toggle('ed-pickpt', pickPt);
        if (pickPt && ed) endEdit({ keep: false });
      } else if (m.type === 'tool') {
        tool = m.tool === 'type' ? 'type' : 'select';
        document.body.classList.toggle('tool-type', tool === 'type');
        if (tool !== 'type' && ed) endEdit({ keep: false });
      } else if (m.type === 'flush') {
        // المحرِّر يريد ما كُتب الآن (قبل أن يطبّق تنسيقاً أو يدرج شيئاً)
        if (!ed) post({ type: 'commit', none: true, req: m.req });
        else endEdit({ keep: true, req: m.req });
      } else if (m.type === 'caretTo') {
        // المؤشر بعد إعادة التنضيد: في القطعة وموضعه من نصها
        const hosts = m.sd != null ? [...book.querySelectorAll('.mside-n[data-si="' + m.i + '"][data-k="' + CSS.escape(m.sd) + '"]')] : m.n != null ? [...book.querySelectorAll('.fn[data-n="' + CSS.escape(m.n) + '"]')] : [...book.querySelectorAll('p.p[data-i="' + m.i + '"]')];
        const host = hosts.find((h) => {
          const sp = spanOf(h);
          return sp && m.o >= sp.a && m.o <= sp.z;
        }) || (m.o <= 0 ? hosts[0] : hosts[hosts.length - 1]);
        if (!host) return;
        const sp = spanOf(host) || { a: 0 };
        if (startEdit(host, { idx: Math.max(0, m.o - sp.a), idx2: m.o2 != null ? Math.max(0, m.o2 - sp.a) : null })) {
          const r = host.getBoundingClientRect();
          if (r.top < 40 || r.bottom > window.innerHeight - 40) host.scrollIntoView({ block: 'center' });
        }
      } else if (m.type === 'view') {
        document.body.classList.toggle('guides', !!m.guides);
        document.body.classList.toggle('invis', !!m.invis);
      } else if (m.type === 'ruler') {
        showRuler(m.i);
      } else if (m.type === 'refit') {
        drawTags();
        if (ih) imgHandles(ih.__i);
        if (sbox) placeSbox();
      } else if (m.type === 'insertText') {
        if (ed) document.execCommand('insertText', false, String(m.s || ''));
      } else if (m.type === 'inline') openInline(m.i, m.values || []);
      else if (m.type === 'cellTo') {
        const td = book.querySelector('table[data-i="' + m.i + '"] [data-r="' + m.r + '"][data-c="' + m.c + '"]');
        if (td) startCell(td);
      }
      else if (m.type === 'endEdit') {
        if (ed) endEdit({ keep: false });
      }
    });
    fit();
    onScroll();
    // رقم الصفحة التي تبدأ فيها كل قطعة (لترقيم الفصول بأرقام الكتاب)
    const pmap = {};
    for (const el of book.querySelectorAll('section.page [data-i]')) {
      const k = el.dataset.i;
      if (pmap[k] == null) pmap[k] = +(el.closest('section.page').dataset.n || 0);
    }
    const pnums = all.map((pg) => +(pg.dataset.n || 0));
    // قياس كل قصيدة (لجامع أنماط الشعر: العرض، وفراغ الوسط، والأسطر، والكشيدة)
    const poems = {};
    const PL = (window.__LAYOUT && window.__LAYOUT.poems) || {};
    for (const el of book.querySelectorAll('.verse[data-i]')) if (PL[el.dataset.poem] && poems[el.dataset.i] == null) poems[el.dataset.i] = PL[el.dataset.poem];
    post({ type: 'ready', pages: all.length, pageW, pageH, pmap, pnums, poems, error: window.__LAYOUT_ERROR || null, warnings: (window.__LAYOUT && window.__LAYOUT.warnings) || [] });
  }

  // التنضيد يبدأ بعد اكتمال قراءة المستند، ليسجّل برنامج الأسلوب (إن وُجد) دواله أولاً
  function start() {
    run()
      .catch((e) => {
        window.__LAYOUT_ERROR = String((e && e.stack) || e);
        window.__LAYOUT_DONE = true;
      })
      .then(() => {
        try {
          if (ED) editorAgent();
          else previewAgent();
        } catch (e) {
          if (window.parent !== window) window.parent.postMessage({ warraq: 'ready', views: {}, error: String(e) }, '*');
        }
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
