// المحرِّر في «المتون»: يفهم أجزاء المتن ومواضع التعليق عليها كما يفهم المتن والشرح والعناوين.
//   · بطاقة «المتن والتعليق»: خريطة الأجزاء (يُنقر الجزء فيُنتقل إليه)، وإعدادات المتون كلها (اللوحة نفسها التي في المنضدة).
//   · ما يُحدَّد من النص: «اجعله جزءاً وحده» (فيليه تعليقه تحته أو في الصفحة المقابلة)، و«ابدأ جزءاً من هنا»،
//     و«ضمّه إلى الجزء السابق» أو «التالي»، و«بلا تعليق بعده».
//   · موضع التعليق في الصفحة يُحدَّد كالنص: موضعه ومساحته وعنوانه ورؤوس مسائل فيه — لهذا الجزء، أو لفصله، أو للكتاب كله.
//   · عنوان التعليق («التعليقات») يُسحب في الصفحة يميناً أو وسطاً أو يساراً.
//   · ما قبل المتن («قال الناظم رحمه الله:»): يُحدَّد في الصفحة فيُغيَّر نصه لموضعه أو للكتاب كله، أو يُرفع منه، ويُسحب يميناً ويساراً؛
//     ويُوضع قبل أي بيتٍ أو فقرةٍ تحدّدها.
//   · «لا تمسّ ترتيب الكتاب»: الأجزاء ثابتة، ويُقسمها المستخدم هنا وحده.
// كل ما يُحدَّد هنا عمليةٌ من عمليات المحرِّر (op: 'mu' في shared/edits.js)، فيُرجع عنه ويُحفظ مع الكتاب ويدخل الإخراج.
import { createMutunPanel, N } from '/js/mutun-panel.js';
import { INTRO_PICKS } from '/shared/mutun.js';

export function setupMutunEditor(x) {
  const { st, $, esc, ar, editor, commit, select, goBlock, toast, nodeOf, sigOf, blockText, renderSel, sectionOf } = x;
  st.mu = { on: false, doc: null, scope: 'part', open: false };
  let api = null; // المنضدة: ed.mutun
  let panel = null;

  /** هل الكتاب متن؟ (يُسأل عنه بعد كل تحديثٍ من المنضدة) */
  async function sync() {
    const ed = await editor();
    api = ed && ed.mutun ? ed.mutun : null;
    st.mu.on = !!(api && api.on());
    document.body.classList.toggle('mu-on', st.mu.on);
    renderCard();
  }
  const on = () => st.mu.on;
  const list = () => (st.mu.doc && st.mu.doc.list) || [];
  /** الجزء الذي فيه القطعة i */
  function unitOf(i) {
    let u = null;
    for (const x2 of list()) if (x2.ui != null && x2.ui <= i) u = x2;
    return u || list()[0] || null;
  }
  const unitName = (u) => (u ? `الجزء ${ar(u.k + 1)}` : '');
  const unitSpan = (u) => (u && u.verses ? (u.verses[0] === u.verses[1] ? `البيت ${ar(u.verses[0])}` : `البيت ${ar(u.verses[0])}–${ar(u.verses[1])}`) : '');
  const placeName = (c) => (!c ? '' : c.place === 'none' ? 'بلا تعليق' : c.place === 'below' ? (c.n ? `تحته ${N(c.n, 'سطر')}` : 'تحته') : c.place === 'side' ? 'هامشٌ بجانبه' : c.n > 1 ? `${N(c.n, 'صفحة')} تقابله` : 'صفحةٌ تقابله');

  /* ------------------------------------------------ التركيب: الفصل الظاهر بأجزائه كاملة (ومواضع تعليقها) */
  // الفصل قطعٌ من المجلد؛ والجزء الذي يمتد فيه يُؤخذ كله: من بدايته إلى موضع تعليقه
  function slice(docAll, sec) {
    st.mu.doc = docAll.mutun || null;
    const bl = docAll.blocks;
    let first = bl.findIndex((b) => b._i != null && b._i >= sec.a);
    let last = -1;
    bl.forEach((b, j) => b._i != null && b._i <= sec.b && (last = j));
    if (first < 0 || last < first) return [];
    while (first > 0 && bl[first].type !== 'mstart') {
      if (bl[first - 1].type === 'mcomment') break;
      first--;
    }
    while (last < bl.length - 1 && bl[last].type !== 'mcomment') last++;
    return bl.slice(first, last + 1);
  }

  /* ------------------------------------------------ ما تحت المؤشر: موضع التعليق */
  const target = (h) => (h && h.mc != null ? { level: 'mc', k: h.mc, ui: h.mi, part: h.part } : h && h.mx != null ? { level: 'mx', at: h.mx } : null);
  const items = (sel) => (sel && sel.level === 'mc' ? [{ mc: sel.k }] : sel && sel.level === 'mx' ? [{ mx: sel.at }] : null);
  function describe(sel) {
    if (sel && sel.level === 'mx') return { name: 'قبل المتن', cls: 'k-mc' };
    if (!sel || sel.level !== 'mc') return null;
    const u = list()[sel.k];
    return { name: `موضع التعليق${u ? ' · ' + unitName(u) : ''}`, cls: 'k-mc' };
  }

  /* ------------------------------------------------ العمليات */
  const blockAt = (i) => st.view && st.view.blocks[i];
  const opOn = (i, set, extra = {}) => ({ op: 'mu', t: { vol: st.vol, b: i }, sig: sigOf(blockAt(i)), set, ...extra });
  /** القطع المحدَّدة: [أولها، آخرها] */
  function spanOf(sel) {
    if (!sel) return null;
    if (sel.level === 'group' || sel.level === 'multi') return [Math.min(...sel.blocks), Math.max(...sel.blocks)];
    if (sel.t && sel.t.b != null) return [sel.t.b, sel.t.b];
    return null;
  }
  function act(a) {
    const sel = st.sel;
    const r = spanOf(sel);
    if (!r) return;
    const [i, j] = r;
    const next = blockAt(j + 1) ? j + 1 : null;
    const cfg = api ? api.get() : {};
    const where = cfg.mPlace === 'below' ? 'وتعليقه تحته' : cfg.mPlace === 'side' ? 'وتعليقه في هامشه' : 'وتعليقه في الصفحة المقابلة';
    const text = blockText(blockAt(i));
    const note = (to) => ({ kind: 'style', to, text });
    const inPara = (sel.level === 'span' || sel.level === 'run') && !!(nodeOf(sel.t) || {}).runs;
    if (a === 'intro') {
      const t = (cfg.mIntro || '').trim() || INTRO_PICKS[0];
      // (على البيت أو الفقرة: العنوان يُتخطّى إلى ما بعده)
      let k = i;
      while (blockAt(k) && blockAt(k).type === 'heading' && blockAt(k + 1)) k++;
      return commit(opOn(k, { in: { t } }), note(`«${t}» قبله`));
    }
    if (a === 'nointro') return commit(opOn(i, { in: { off: 1 } }), note('بلا نصٍّ قبله'));
    // دور القطعة: متن، أو «قال …» قبل المتن، أو عنوان التعليق (يختم جزءه)
    // (في «النص كله» المحدَّد بنقرة: القطعة التي نُقرت)
    const one = sel.level === 'group' && sel.at != null ? sel.at : i;
    if (a === 'as-in') return commit(opOn(one, { as: 'in' }), note('«قال …» قبل المتن'));
    if (a === 'as-lab') return commit(opOn(one, { as: 'lab' }), note('عنوان التعليق (يختم جزءه)'));
    if (a === 'as-matn') return commit(opOn(one, { as: 'matn' }), note('متن'));
    if (a === 'clearintro') return commit(opOn(i, { in: null }), note('ما قبله كإعدادات الكتاب'));
    if (a === 'unit') {
      // المحدَّد من فقرةٍ يُقسم عنده فيصير جزءاً وحده
      if (inPara) {
        const node = nodeOf(sel.t);
        const len = (node.runs || []).reduce((n, x2) => n + (x2.k === 'r' ? 0 : (x2.s || '').length), 0);
        return commit(opOn(i, { cut: 1, join: null }, { split: [sel.from, sel.to], ...(sel.to < len || next != null ? { next: { cut: 1, join: null } } : {}) }), note('جزءٌ وحده ' + where));
      }
      const ops = [opOn(i, { cut: 1, join: null })];
      if (next != null) ops.push(opOn(next, { cut: 1, join: null }));
      return commit({ op: 'batch', vol: st.vol, ops }, note('جزءٌ وحده ' + where));
    }
    if (a === 'start') {
      if (inPara) return commit(opOn(i, { cut: 1, join: null }, { split: [sel.from, 1e9] }), note('يبدأ جزءٌ من هنا'));
      return commit(opOn(i, { cut: 1, join: null }), note('يبدأ جزءٌ من هنا'));
    }
    if (a === 'prev') {
      const ops = [opOn(i, { join: 1, cut: null })];
      if (next != null) ops.push(opOn(next, { cut: 1, join: null }));
      return commit({ op: 'batch', vol: st.vol, ops }, note('ضُمّ إلى الجزء السابق'));
    }
    if (a === 'next') {
      const ops = [opOn(i, { cut: 1, join: null })];
      if (next != null) ops.push(opOn(next, { join: 1, cut: null }));
      return commit({ op: 'batch', vol: st.vol, ops }, note('ضُمّ إلى الجزء التالي'));
    }
    if (a === 'none') {
      const u = unitOf(i);
      if (u && u.ui != null) return commit(opOn(u.ui, { c: { ...ownC(u.ui), place: 'none' } }), note('بلا تعليق بعد هذا الجزء'));
    }
    if (a === 'clear') {
      const ops = [opOn(i, { cut: null, join: null })];
      if (next != null && blockAt(next).mu) ops.push(opOn(next, { cut: null, join: null }));
      return commit({ op: 'batch', vol: st.vol, ops }, note('كما يقسمه التقسيم'));
    }
  }
  const ownC = (i) => ((blockAt(i) || {}).mu || {}).c || {};
  const ownSec = (i) => ((blockAt(i) || {}).mu || {}).sec || {};
  /** عنوان الفصل الذي فيه القطعة i (باب أو فصل): عليه يُحفظ ما يُختار للفصل */
  function chapterHead(i) {
    for (let j = i; j >= 0; j--) {
      const b = blockAt(j);
      if (b && b.type === 'heading' && (b.level || 1) <= 2) return j;
    }
    const s = st.sections[sectionOf(i)];
    return s ? s.a : 0;
  }
  /** موضع التعليق لهذا الجزء، أو لفصله، أو للكتاب كله */
  function setCfg(sel, patch, label) {
    const u = list()[sel.k];
    if (!u || u.ui == null) return;
    const scope = st.mu.scope;
    if (scope === 'book') {
      const g = {};
      if (patch.place && patch.place !== 'none') g.mPlace = patch.place;
      if (patch.n != null) {
        const pl = patch.place || u.c.place;
        if (pl === 'below') g.mBelow = patch.n;
        if (pl === 'page') g.mPages = Math.max(1, patch.n);
      }
      if (patch.label != null) g.mLabel = patch.label;
      if (api) api.set(g);
      toast('تغيّر للكتاب كله' + (label ? ': ' + label : ''));
      return;
    }
    if (scope === 'chapter') {
      const h = chapterHead(u.ui);
      return commit(opOn(h, { sec: { ...ownSec(h), ...patch } }), { kind: 'style', to: (label || 'موضع التعليق') + ' للفصل', text: blockText(blockAt(h)) });
    }
    return commit(opOn(u.ui, { c: { ...ownC(u.ui), ...patch } }), { kind: 'style', to: (label || 'موضع التعليق') + ' لهذا الجزء', text: blockText(blockAt(u.ui)) });
  }
  function resetCfg(sel) {
    const u = list()[sel.k];
    if (!u || u.ui == null) return;
    const ops = [];
    if (blockAt(u.ui) && (blockAt(u.ui).mu || {}).c) ops.push(opOn(u.ui, { c: null }));
    const h = chapterHead(u.ui);
    if (st.mu.scope === 'chapter' && (blockAt(h).mu || {}).sec) ops.push(opOn(h, { sec: null }));
    if (!ops.length) return toast('هذا الجزء كإعدادات الكتاب');
    commit({ op: 'batch', vol: st.vol, ops }, { kind: 'style', to: 'كإعدادات الكتاب', text: blockText(blockAt(u.ui)) });
  }

  /* ------------------------------------------------ بطاقة المحدَّد */
  // ما يظهر تحت المحدَّد من النص: أجزاء المتن
  function selSection(sel) {
    if (!on() || !sel || !spanOf(sel) || (sel.t && sel.t.n != null)) return '';
    const [i] = spanOf(sel);
    const u = unitOf(i);
    const mu = (blockAt(i) || {}).mu || {};
    const cfg = api ? api.get() : {};
    const where = cfg.mPlace === 'below' ? 'ويليه موضع التعليق تحته' : cfg.mPlace === 'side' ? 'وبجانبه هامشٌ للتعليق' : cfg.mSide === 'free' ? 'ويليه تعليقه في صفحته' : 'وتعليقه في الصفحة المقابلة';
    const b = (a, label, title, cls = '') => `<button type="button" class="kc mu-act ${cls}" data-mu="${a}" title="${esc(title)}">${label}</button>`;
    return `<div class="sc-sec mu-sel"><h4>المتن والتعليق${u ? ` <small>${esc(unitName(u))}${unitSpan(u) ? ' · ' + unitSpan(u) : ''}${u.c ? ' · ' + esc(placeName(u.c)) : ''}</small>` : ''}</h4>
      ${cfg.mDivide === 'manual' ? '<p class="sc-note mu-keepnote">الترتيب ثابت: لا يتغيّر من الأجزاء إلا ما تحدّده هنا.</p>' : ''}
      <div class="kinds">${b('unit', 'اجعله جزءاً وحده', 'المحدَّد وحده جزءٌ من المتن، ' + where, 'pri')}${b('start', 'ابدأ جزءاً من هنا', 'يبدأ جزءٌ جديد من أول المحدَّد')}${b('prev', 'ضمّه إلى الجزء السابق', 'يبقى مع ما قبله، ويبدأ بعده جزءٌ جديد')}${b('next', 'ضمّه إلى الجزء التالي', 'يبدأ به الجزء الذي بعده')}${b('none', 'بلا تعليق بعد جزئه', 'لا موضع تعليقٍ بعد هذا الجزء (كالمقدمة)')}${mu.cut === 1 || mu.join ? b('clear', 'كما يقسمه التقسيم', 'أزل ما حدّدته هنا') : ''}</div>
      <div class="sc-sec mu-roles"><h4>هذه القطعة</h4><div class="kinds mu-in">${b('as-matn', 'متن', 'من المتن نفسه', mu.as === 'matn' ? 'on' : '')}${b('as-in', '«قال …» قبل المتن', 'سطرٌ يسبق المتن: يُنضَّد كـ«قبل المتن» بخطه ولونه')}${b('as-lab', 'عنوان التعليق', 'عنوان موضع التعليق («التعليقات»): يختم الجزء الذي قبله، ويُكتب عنواناً لتعليقه')}</div></div>
      <div class="kinds mu-in">${b('intro', mu.in && mu.in.t ? 'غيّر ما قبله' : `ضع قبله «${esc(((cfg.mIntro || INTRO_PICKS[0]).length > 18 ? (cfg.mIntro || INTRO_PICKS[0]).slice(0, 17) + '…' : cfg.mIntro || INTRO_PICKS[0]))}»`, 'نصٌّ قبل المتن في هذا الموضع (بعد العنوان إن كان)')}${mu.in ? b('clearintro', 'ما قبله كالإعدادات', 'أزل ما حدّدته هنا') : ''}</div>
      <p class="sc-note">${esc(where.replace(/^و/, ''))} — بحسب «موضع التعليق» في إعدادات المتون.</p></div>`;
  }
  // بطاقة موضع التعليق إذا حُدّد في الصفحة
  function mcCard(sel) {
    const u = list()[sel.k];
    if (!u) return `<div class="sc-hint"><b>موضع التعليق</b></div>`;
    const c = u.c || {};
    const g = api ? api.get() : {};
    const scope = st.mu.scope;
    const tile = (v, label) => `<button type="button" class="kc${c.place === v ? ' on' : ''}" data-mc-place="${v}" aria-pressed="${c.place === v}">${label}</button>`;
    const amount =
      c.place === 'below'
        ? `<div class="sc-sec"><h4>مساحته</h4><div class="mu-ed-row"><button type="button" class="kc${!c.n ? ' on' : ''}" data-mc-n="0">ما بقي من الصفحة</button><span class="mu-ed-n"><button type="button" data-mc-step="-1">−</button><b>${c.n ? ar(c.n) : '—'}</b><button type="button" data-mc-step="1">+</button><small>سطراً</small></span></div></div>`
        : c.place === 'page'
          ? `<div class="sc-sec"><h4>صفحاته</h4><div class="mu-ed-row"><span class="mu-ed-n"><button type="button" data-mc-step="-1">−</button><b>${ar(c.n || 1)}</b><button type="button" data-mc-step="1">+</button><small>${(c.n || 1) === 1 ? 'صفحة' : (c.n || 1) === 2 ? 'صفحتان' : 'صفحات'}</small></span></div></div>`
          : '';
    const hints = (ownC(u.ui).hints || []).join('\n');
    return `<div class="sc-head"><span class="badge k-mc"><i class="dot k-mc"></i>موضع التعليق</span><small class="mu-ed-u">${esc(unitName(u))}${unitSpan(u) ? ' · ' + unitSpan(u) : ''}</small><button type="button" class="x" data-act="clear" title="إلغاء التحديد (Esc)" aria-label="إلغاء التحديد">✕</button></div>
      ${u.gist ? `<blockquote class="sc-text k-mc">${esc(u.head ? u.head + ' — ' : '')}${esc(u.gist)}</blockquote>` : ''}
      <div class="sc-sec"><h4>ما تختاره هنا يكون</h4><div class="mu-ed-scope" role="radiogroup">${[['part', 'لهذا الجزء'], ['chapter', 'لفصله كله'], ['book', 'للكتاب كله']].map(([v, l]) => `<button type="button" role="radio" data-mc-scope="${v}" aria-checked="${scope === v}">${l}</button>`).join('')}</div></div>
      <div class="sc-sec"><h4>موضعه</h4><div class="kinds">${tile('page', 'صفحةٌ تقابله')}${tile('below', 'تحته')}${tile('side', 'بجانبه')}</div></div>
      ${amount}
      <div class="sc-sec"><h4>عنوانه <small>${scope === 'book' ? 'للكتاب كله' : 'وما لم يُكتب فعنوان الكتاب: «' + esc(g.mLabel || 'بلا عنوان') + '»'}</small></h4><div class="fix"><input type="text" id="mcLabel" dir="auto" value="${esc(typeof ownC(u.ui).label === 'string' && scope === 'part' ? ownC(u.ui).label : scope === 'book' ? g.mLabel || '' : '')}" placeholder="${esc(g.mLabel || 'بلا عنوان')}"><button type="button" class="btn sm" data-mc-act="label">اعتمد</button></div>
        <div class="mu-ed-row">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']].map(([v, l]) => `<button type="button" class="kc${g.mLabelAl === v ? ' on' : ''}" data-mc-al="${v}">${l}</button>`).join('')}<button type="button" class="tl quiet" data-mc-act="look">خطه ولونه وزينته…</button></div>
        <p class="sc-note">واسحب العنوان في الصفحة يميناً أو يساراً لتنقله.</p></div>
      ${scope === 'part' ? `<div class="sc-sec"><h4>رؤوس مسائل للطالب <small>سطرٌ لكل مسألة، تُكتب خفيفةً على سطور التعليق</small></h4><textarea id="mcHints" rows="3" dir="auto" placeholder="مثلاً: عرّف الكلام لغةً واصطلاحاً">${esc(hints)}</textarea><div class="mu-ed-row"><button type="button" class="btn sm" data-mc-act="hints">اعتمدها</button><button type="button" class="btn sm quiet" data-mc-act="ai-hints">اقترحها بالمساعد</button></div></div>` : ''}
      ${u.labAt != null ? `<p class="sc-note">عنوان هذا الموضع من الملف نفسه («${esc(blockText(blockAt(u.labAt) || {}))}»). <button type="button" class="tl quiet" data-mc-act="lab-matn">ليس عنوان تعليق: اجعله متناً</button></p>` : ''}
      <div class="mu-ed-row end"><button type="button" class="tl quiet" data-mc-act="reset">أعده كإعدادات الكتاب</button><button type="button" class="tl quiet" data-mc-act="go">انتقل إلى متنه</button></div>`;
  }
  // بطاقة ما قبل المتن إذا حُدّد في الصفحة
  function mxCard(sel) {
    const b = blockAt(sel.at);
    const src = !!(b && b.mu && b.mu.as === 'in');
    if (src) {
      const now = blockText(b);
      return `<div class="sc-head"><span class="badge k-mc"><i class="dot k-mc"></i>قبل المتن</span><small class="mu-ed-u">من الملف نفسه</small><button type="button" class="x" data-act="clear" title="إلغاء التحديد (Esc)" aria-label="إلغاء التحديد">✕</button></div>
      <blockquote class="sc-text k-mc">${esc(now)}</blockquote>
      <div class="sc-sec"><h4>نصه</h4><div class="fix"><input type="text" id="mxText" dir="auto" value="${esc(now)}"></div>
        <div class="mu-ed-row"><button type="button" class="btn sm" data-mx-act="src-edit">اعتمد</button><button type="button" class="btn sm quiet" data-mx-act="all">اجعله للكتاب كله</button></div></div>
      <div class="sc-sec"><h4>موضعه في السطر</h4><div class="mu-ed-row">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']].map(([v, l]) => `<button type="button" class="kc${(api ? api.get().mIntroAl : '') === v ? ' on' : ''}" data-mx-al="${v}">${l}</button>`).join('')}<button type="button" class="tl quiet" data-mx-act="look">خطه ولونه وزينته…</button></div></div>
      <div class="mu-ed-row end"><button type="button" class="tl quiet" data-mx-act="src-matn">ليس «قال …»: اجعله متناً</button><button type="button" class="tl quiet" data-mx-act="src-del">احذفه</button></div>`;
    }
    const own = b && b.mu && b.mu.in && b.mu.in.t ? b.mu.in.t : '';
    const g = api ? api.get() : {};
    const now = own || g.mIntro || '';
    const at = { first: 'في أول المتن', heads: 'بعد كل بابٍ وفصل', units: 'في أول كل جزء' }[g.mIntroAt] || '';
    return `<div class="sc-head"><span class="badge k-mc"><i class="dot k-mc"></i>قبل المتن</span><small class="mu-ed-u">${own ? 'خاصٌّ بهذا الموضع' : g.mIntro ? esc(at) : ''}</small><button type="button" class="x" data-act="clear" title="إلغاء التحديد (Esc)" aria-label="إلغاء التحديد">✕</button></div>
      ${b ? `<blockquote class="sc-text k-mc">${esc(now)} <small>${esc(blockText(b).slice(0, 60))}</small></blockquote>` : ''}
      <div class="sc-sec"><h4>نصه</h4><div class="fix"><input type="text" id="mxText" dir="auto" value="${esc(now)}" placeholder="${esc(INTRO_PICKS[0])}"></div>
        <div class="mu-ed-row">${INTRO_PICKS.slice(0, 4).map((t) => `<button type="button" class="kc${t === now ? ' on' : ''}" data-mx-pick="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="mu-ed-row"><button type="button" class="btn sm" data-mx-act="here">لهذا الموضع وحده</button><button type="button" class="btn sm quiet" data-mx-act="all">للكتاب كله</button></div></div>
      <div class="sc-sec"><h4>موضعه في السطر</h4><div class="mu-ed-row">${[['r', 'يمين'], ['c', 'وسط'], ['l', 'يسار']].map(([v, l]) => `<button type="button" class="kc${g.mIntroAl === v ? ' on' : ''}" data-mx-al="${v}">${l}</button>`).join('')}<button type="button" class="tl quiet" data-mx-act="look">خطه ولونه وزينته…</button></div><p class="sc-note">واسحبه في الصفحة يميناً أو يساراً لتنقله.</p></div>
      <div class="mu-ed-row end"><button type="button" class="tl quiet" data-mx-act="off">ارفعه من هنا</button>${own || (b && b.mu && b.mu.in) ? '<button type="button" class="tl quiet" data-mx-act="reset">كإعدادات الكتاب</button>' : ''}<button type="button" class="tl quiet" data-mx-act="go">انتقل إلى ما بعده</button></div>`;
  }
  function mxClick(sel, b) {
    const i = sel.at;
    const blk = blockAt(i);
    if (!blk) return true;
    const note = (to) => ({ kind: 'style', to, text: blockText(blk) });
    if (b.dataset.mxPick) {
      $('#mxText').value = b.dataset.mxPick;
      return true;
    }
    if (b.dataset.mxAl) {
      if (api) api.set({ mIntroAl: b.dataset.mxAl });
      return true;
    }
    const a = b.dataset.mxAct;
    const v = ($('#mxText') || {}).value ? $('#mxText').value.trim() : '';
    if (a === 'src-edit') {
      const old = blockText(blk);
      if (!v || v === old) return true;
      commit({ op: 'edit', t: { vol: st.vol, b: i }, sig: sigOf(blk), ch: [{ a: 0, z: old.length, s: v }] }, { kind: 'parts', old, new: v });
      return true;
    }
    if (a === 'src-matn') {
      commit(opOn(i, { as: 'matn' }), note('متن'));
      st.sel = null;
      return true;
    }
    if (a === 'src-del') {
      commit({ op: 'remove', t: { vol: st.vol, b: i }, sig: sigOf(blk) }, note('حُذف'));
      st.sel = null;
      return true;
    }
    if (a === 'here') {
      if (!v) return toast('اكتب النص أولاً'), true;
      commit(opOn(i, { in: { t: v } }), note(`«${v}» قبله`));
      st.sel = { level: 'mx', at: i };
      return true;
    }
    if (a === 'all') {
      if (api) api.set({ mIntro: v });
      toast(v ? 'تغيّر للكتاب كله' : 'بلا نصٍّ قبل المتن');
      return true;
    }
    if (a === 'off') {
      commit(opOn(i, { in: { off: 1 } }), note('بلا نصٍّ قبله'));
      st.sel = null;
      return true;
    }
    if (a === 'reset') {
      commit(opOn(i, { in: null }), note('ما قبله كإعدادات الكتاب'));
      return true;
    }
    if (a === 'go') {
      select({ level: 'block', t: { vol: st.vol, b: i } });
      goBlock(i, 'sel');
      return true;
    }
    if (a === 'look') {
      openCard('intro');
      return true;
    }
    return false;
  }
  function selClick(b) {
    const sel = st.sel;
    if (!sel) return false;
    if (b.dataset.mu) {
      act(b.dataset.mu);
      return true;
    }
    if (sel.level === 'mx') return mxClick(sel, b);
    if (sel.level !== 'mc') return false;
    const u = list()[sel.k];
    if (!u) return true;
    if (b.dataset.mcScope) {
      st.mu.scope = b.dataset.mcScope;
      renderSel();
      return true;
    }
    if (b.dataset.mcPlace) {
      const p = b.dataset.mcPlace;
      setCfg(sel, { place: p, n: p === 'page' ? 1 : p === 'below' ? 0 : 0 }, { page: 'صفحةٌ تقابله', below: 'تحته', side: 'بجانبه' }[p]);
      return true;
    }
    if (b.dataset.mcN != null) {
      setCfg(sel, { place: u.c.place, n: +b.dataset.mcN }, 'ما بقي من الصفحة');
      return true;
    }
    if (b.dataset.mcStep) {
      const c = u.c || {};
      const n = Math.max(c.place === 'page' ? 1 : 1, Math.min(c.place === 'page' ? 4 : 60, (c.n || (c.place === 'below' ? 7 : 1)) + +b.dataset.mcStep));
      setCfg(sel, { place: c.place, n }, c.place === 'page' ? N(n, 'صفحة') : N(n, 'سطر'));
      return true;
    }
    if (b.dataset.mcAl) {
      if (api) api.set({ mLabelAl: b.dataset.mcAl });
      return true;
    }
    const a = b.dataset.mcAct;
    if (a === 'label') {
      const v = $('#mcLabel').value.trim();
      setCfg(sel, { label: v }, v ? `العنوان «${v}»` : 'بلا عنوان');
      return true;
    }
    if (a === 'hints') {
      const hs = $('#mcHints').value.split('\n').map((t) => t.trim()).filter(Boolean);
      commit(opOn(u.ui, { c: { ...ownC(u.ui), hints: hs.length ? hs : undefined } }), { kind: 'style', to: hs.length ? `${N(hs.length, 'سطر')} من رؤوس المسائل` : 'بلا رؤوس مسائل', text: blockText(blockAt(u.ui)) });
      return true;
    }
    if (a === 'ai-hints') {
      if (x.ai && x.ai().mutunHints) x.ai().mutunHints(u);
      else toast('المساعد غير متاح الآن');
      return true;
    }
    if (a === 'reset') {
      resetCfg(sel);
      return true;
    }
    if (a === 'lab-matn' && u.labAt != null) {
      commit(opOn(u.labAt, { as: 'matn' }), { kind: 'style', to: 'متن', text: blockText(blockAt(u.labAt)) });
      st.sel = null;
      return true;
    }
    if (a === 'go') {
      select({ level: 'block', t: { vol: st.vol, b: u.ui } });
      goBlock(u.ui, 'sel');
      return true;
    }
    if (a === 'look') {
      openCard('label');
      return true;
    }
    return false;
  }

  /* ------------------------------------------------ بطاقة «المتن والتعليق» */
  function renderCard() {
    const card = $('#muCard');
    if (!card) return;
    card.hidden = !on();
    if (!on()) return;
    const L = list();
    const g = api ? api.get() : {};
    const cur = st.sel && spanOf(st.sel) ? unitOf(spanOf(st.sel)[0]) : st.sel && st.sel.level === 'mc' ? L[st.sel.k] : null;
    const own = L.filter((u) => u.ui != null && blockAt(u.ui) && (blockAt(u.ui).mu || {}).c).length;
    const est = st.mu.doc;
    card.innerHTML = `<h3>المتن والتعليق <small>${est ? `${N(est.units, 'جزء')}${est.poem ? '، ' + N(est.verses, 'بيت') : ''}` : ''}</small></h3>
      <label class="mu-ed-keep${g.mDivide === 'manual' ? ' on' : ''}"><input type="checkbox" data-mu-keep ${g.mDivide === 'manual' ? 'checked' : ''}><i aria-hidden="true"></i><span><b>لا تمسّ ترتيب الكتاب</b><small>${g.mDivide === 'manual' ? 'الأجزاء ثابتة: لا يعيد ورّاق تقسيمها إذا عدّلت المتن' : 'يثبّت الأجزاء كما تراها الآن'}</small></span></label>
      <div class="mu-map" role="list">${L.map((u) => `<button type="button" role="listitem" class="mu-u${cur && cur.k === u.k ? ' cur' : ''}${u.ui != null && blockAt(u.ui) && (blockAt(u.ui).mu || {}).c ? ' own' : ''}" data-unit="${u.k}" title="${esc((u.head ? u.head + ' — ' : '') + u.gist)}"><b>${ar(u.k + 1)}</b><span>${esc(u.verses ? unitSpan(u) : u.head || u.gist)}</span><i class="pl-${u.c.place}" title="${esc(placeName(u.c))}"></i></button>`).join('')}</div>
      <p class="sc-note">انقر جزءاً لتنتقل إليه، أو موضعَ تعليقٍ في الصفحة لتختار له. ${own ? `${N(own, 'جزء')} ${own > 2 && own < 11 ? 'خُصّت' : 'خُصّ'} بموضعٍ غير الذي في الإعدادات.` : ''}</p>
      <details class="mu-ed-set" ${st.mu.open ? 'open' : ''}><summary>إعدادات المتون <small>${esc([g.mPlace === 'below' ? 'تحت المتن' : g.mPlace === 'side' ? 'هامشٌ بجانبه' : 'صفحةٌ تقابله', g.mLabel ? '«' + g.mLabel + '»' : ''].filter(Boolean).join('، '))}</small></summary><div id="muEdPanel"></div><button type="button" class="tl quiet" data-mu-bench>وسائر التنضيد (الأسلوب والخطوط والقالب) في المنضدة</button></details>`;
    if (st.mu.open) mountPanel();
  }
  function mountPanel() {
    const host = $('#muEdPanel');
    if (!host || !api) return;
    panel = createMutunPanel(host, { get: () => api.get(), set: (p) => api.set(p), ctx: () => api.ctx() });
    panel.render();
  }
  function openCard(group) {
    st.mu.open = true;
    renderCard();
    if (panel && group) panel.open(group);
    const c = $('#muCard');
    if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  document.addEventListener('click', (e) => {
    const u = e.target.closest('#muCard [data-unit]');
    if (u) {
      const it = list()[+u.dataset.unit];
      if (it && it.ui != null) {
        select({ level: 'block', t: { vol: st.vol, b: it.ui } });
        goBlock(it.ui, 'sel');
      }
      return;
    }
    if (e.target.closest('#muCard [data-mu-bench]')) {
      const sh = window.top && window.top.WarraqShell;
      if (sh) sh.go('bench');
      Promise.resolve(x.bench && x.bench())
        .then((w) => w && w.WarraqBenchView && w.WarraqBenchView.open('s3'))
        .catch(() => {});
    }
  });
  document.addEventListener('change', (e) => {
    const k = e.target.closest && e.target.closest('#muCard [data-mu-keep]');
    if (!k || !api) return;
    api.set({ mDivide: k.checked ? 'manual' : 'auto' });
    toast(k.checked ? 'ثُبّت ترتيب الكتاب: الأجزاء كما هي' : 'يقسم ورّاق المتن بحسب الإعدادات');
  });
  document.addEventListener(
    'toggle',
    (e) => {
      if (e.target.matches && e.target.matches('#muCard details.mu-ed-set')) {
        st.mu.open = e.target.open;
        if (st.mu.open && !$('#muEdPanel').childElementCount) mountPanel();
      }
    },
    true,
  );

  /* ------------------------------------------------ علامات الهامش */
  function tags(map) {
    if (!on()) return;
    for (const u of list()) {
      if (u.ui == null || !map[u.ui]) continue;
      map[u.ui].unit = unitName(u);
    }
  }

  /* ------------------------------------------------ قائمة الزر الأيمن */
  function ctxItems(sel, item) {
    if (!on() || !sel) return '';
    if (sel.level === 'mc') return `<div class="cm-h">موضع التعليق</div>` + item('mu-mc-below', 'تحت المتن') + item('mu-mc-page', 'صفحةٌ تقابله');
    if (!spanOf(sel) || (sel.t && sel.t.n != null)) return '';
    return `<div class="cm-h">المتن والتعليق</div>` + item('mu-unit', 'اجعله جزءاً وحده') + item('mu-start', 'ابدأ جزءاً من هنا') + item('mu-prev', 'ضمّه إلى الجزء السابق') + item('mu-next', 'ضمّه إلى الجزء التالي');
  }
  function ctxAct(a) {
    if (!a.startsWith('mu-')) return false;
    if (a.startsWith('mu-mc-')) {
      const p = a.slice(6);
      setCfg(st.sel, { place: p, n: p === 'page' ? 1 : 0 });
    } else act(a.slice(3));
    return true;
  }

  /* ------------------------------------------------ عنوان التعليق يُسحب في الصفحة */
  function labelMoved(m) {
    if (!api || !['r', 'c', 'l'].includes(m.al)) return;
    api.set({ mLabelAl: m.al });
    toast(`عنوان التعليق: ${{ r: 'يميناً', c: 'في الوسط', l: 'يساراً' }[m.al]}`);
  }

  function introMoved(m) {
    if (!api || !['r', 'c', 'l'].includes(m.al)) return;
    api.set({ mIntroAl: m.al });
    toast(`ما قبل المتن: ${{ r: 'يميناً', c: 'في الوسط', l: 'يساراً' }[m.al]}`);
  }

  return { sync, on, slice, target, items, describe, selSection, mcCard, mxCard, selClick, renderCard, tags, ctxItems, ctxAct, labelMoved, introMoved, openCard, unitOf };
}
