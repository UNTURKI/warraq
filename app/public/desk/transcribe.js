// «التفريغ المباشر» في مجلس الدرس: كلام الشيخ يُكتب وهو يقوله.
// الصوت من المقطع نفسه (لا المايكروفون: lesson-guest-page.js ← tap)، يمرّ بالبرنامج إلى خدمة تفريغٍ لحظي بمفتاح المستعمل
// (app/lib/stt.js في العملية الرئيسية: المفتاح لا يصل الصفحة). وهنا:
//   • النص الجزئي يظهر كلمةً كلمة، والنهائي سطراً بوقته من الدرس (الضغط على الوقت يعيدك إليه)
//   • الآيات تُطابَق بالمصحف وتُكتب بنصّه ومعها سورتها وآيتها (shared/quran-align.js)
//   • القفز في المقطع يُتمّ ما سُمع قبله، والرجوع لسماع ما سبق لا يكرّر سطوره
//   • يتوقف مع الدرس، ويُغلق الاتصال إذا طال التوقف (فلا يُحسب على المستعمل سكوت)، ويعود حين يُشغَّل
//   • يُحفظ مع الدرس (في الجهاز) ويعود حين يُفتح، ويُنسخ أو يُحفظ نصاً أو ترجمةً للمقطع (srt)، أو يصير ملاحظةً في الكتاب
//   • ومساعد الرَّحل يقرؤه (clip.transcript)
import { getItem, setItem, delItem } from '/js/reader-store.js';
import { loadQuranText, alignQuran } from '/shared/quran-align.js';

const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function clock(t) {
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return ar(h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`);
}
function srtTime(t) {
  t = Math.max(0, t || 0);
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}
/** كلمات السطر (لمعرفة المكرَّر حين يُعاد سماع ما سبق) */
const words = (s) => new Set(String(s).replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').split(/[^ء-ي]+/).filter((w) => w.length > 1));
function similar(a, b) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let k = 0;
  for (const w of A) if (B.has(w)) k++;
  return k / Math.min(A.size, B.size) >= 0.6;
}
const IDLE_STOP = 75 * 1000; // توقّف الدرس أكثر من هذا: يُغلق الاتصال (ويعود حين يُشغَّل)

export const TR_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M4 11h6M4 15h8M4 19h5"/><rect x="15.5" y="4" width="4" height="8.5" rx="2"/><path d="M14 10.5a3.5 3.5 0 0 0 7 0M17.5 14v3"/></svg>';

/**
 * @param {object} o
 * @param {HTMLElement} o.box        المجلس
 * @param {object|null} o.desk       جسر البرنامج (desk.stt)
 * @param {() => object} o.state     حال المجلس: { src, st, guest, book }
 * @param {() => string} o.lessonKey هوية الدرس (لحفظ تفريغه)
 * @param {() => string} o.title     عنوان الدرس
 * @param {(t:number) => void} o.seek
 * @param {(msg:string) => void} o.toast
 * @param {() => Promise<object|null>} o.reader  الكتاب المفتوح على الرَّحل (WarraqReader)
 */
export function createTranscriber(o) {
  const { box, desk } = o;
  const can = !!(desk && desk.stt);
  const pane = document.createElement('section');
  pane.className = 'lsn-tr';
  pane.id = 'lsnTr';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'تفريغ الدرس');
  pane.innerHTML = `
    <div class="tr-grip" title="اسحب لتغيير الارتفاع" aria-hidden="true"></div>
    <header class="tr-h">
      <span class="tr-dot" aria-hidden="true"></span>
      <b>التفريغ</b>
      <small class="tr-st" id="trSt" role="status"></small>
      <small class="tr-bk" id="trBk" hidden></small>
      <span class="tr-sp"></span>
      <button type="button" class="tr-b" data-t="book" title="إلى الكتاب: ما حدّدتَه من التفريغ، وإلا السطر الذي يُسمع الآن، ملاحظةً عند وقته">إلى الكتاب</button>
      <span class="tr-mw">
        <button type="button" class="tr-ib" data-t="menu" title="المزيد" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg></button>
        <span class="tr-menu" id="trMenu" role="menu" hidden>
          <button type="button" role="menuitemcheckbox" data-t="bookFollow" class="chk" aria-checked="false">تتبّع الشارح في الكتاب <small>ما يقرؤه مظلَّلاً في الكتاب المفتوح على الرَّحل</small></button>
          <button type="button" role="menuitemcheckbox" data-t="bookAuto" class="chk sub" aria-checked="false">وانتقل إلى صفحته وحده <small>بدل أن يُقترح الانتقال</small></button>
          <button type="button" role="menuitem" data-t="copy">انسخ التفريغ</button>
          <button type="button" role="menuitem" data-t="txt">احفظه نصاً <small>(.txt)</small></button>
          <button type="button" role="menuitem" data-t="srt">احفظه ترجمةً للمقطع <small>(.srt)</small></button>
          <button type="button" role="menuitem" data-t="settings">خدمة التفريغ ومفتاحها…</button>
          <button type="button" role="menuitem" data-t="report">انسخ تقرير التفريغ <small>إن لم يُكتب شيء: ما جرى، لتُرسله</small></button>
          <button type="button" role="menuitem" data-t="clear" class="danger">امسح تفريغ هذا الدرس</button>
        </span>
      </span>
      <button type="button" class="tr-ib" data-t="close" title="أغلق التفريغ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </header>
    <div class="tr-err" id="trErr" hidden></div>
    <div class="tr-body" id="trBody" tabindex="0">
      <div class="tr-lines" id="trLines"></div>
      <p class="tr-live" id="trLive" hidden></p>
      <div class="tr-empty" id="trEmpty"></div>
    </div>
    <button type="button" class="tr-follow" data-t="follow" hidden>↓ إلى آخر ما قيل</button>`;
  const P = (s) => pane.querySelector(s);

  const T = {
    open: false,
    key: '', // هوية الدرس الذي هذا تفريغه
    lines: [], // [{ t, text, q? }] بترتيب وقتها في الدرس
    live: null, // { k, text }
    ses: null, // { sid, rate, label, engine, quran, save }
    starting: null,
    state: 'idle', // idle | connecting | live | reconnecting | paused | error
    err: '',
    fatal: false,
    maps: new Map(), // sid ← { rate, map:[{s,t,r}], sent }
    sidKey: new Map(), // sid ← هوية الدرس (ما يصل متأخراً من جلسة درسٍ سابق لا يدخل تفريغ غيره)
    lastT: null,
    idleT: 0,
    saveT: 0,
    follow: true,
    quran: true,
    save: true,
    Q: null,
    now: -1,
  };
  // الحارس: إن انقطع صوت المقطع عن التفريغ، أو وصل الصوتُ الخدمةَ ولم تُرجع شيئاً، أو علق الاتصال — يُصلَح وحده ويُقال ما جرى
  const WD = { pcmAt: 0, liveAt: 0, textAt: 0, playAt: 0, playing: false, speech: 0, stateAt: Date.now(), tapAt: 0, restarts: [], log: [], warn: '', pcmN: 0, loudN: 0, events: 0, finals: new Set(), timer: 0 };
  const note = (m) => {
    WD.log.push(`${new Date().toLocaleTimeString('en-GB')} ${m}`);
    if (WD.log.length > 160) WD.log.splice(0, 60);
  };
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem('warraq.transcribe') || '{}') || {};
  } catch {}
  const savePrefs = () => {
    try {
      localStorage.setItem('warraq.transcribe', JSON.stringify({ h: prefs.h, book: !!prefs.book, bookAuto: !!prefs.bookAuto }));
    } catch {}
  };
  if (prefs.h) box.style.setProperty('--trh', prefs.h + 'px');

  /* ---------------------------------------------------------------- الجلسة */
  function context() {
    const S = o.state();
    return { title: o.title() || '', book: (S.book && S.book.title) || '', heading: S.heading || '' };
  }
  async function start() {
    if (!can || T.ses || T.starting || T.fatal) return;
    note('بدء جلسة');
    setState('connecting');
    const ctx = context();
    try {
      const R = await o.reader().catch(() => null);
      if (R && R.heading) ctx.heading = R.heading;
    } catch {}
    T.starting = desk.stt
      .start({ context: ctx })
      .then((r) => {
        if (!T.open) return void desk.stt.stop().catch(() => {});
        T.ses = { sid: r.sid, rate: r.rate, label: r.label, engine: r.engine };
        T.quran = r.quran !== false;
        T.save = r.save !== false;
        T.maps.set(r.sid, { rate: r.rate, map: [], sent: 0 });
        T.sidKey.set(r.sid, T.key);
        // (لا يُبقى إلا ما يلزم لجلستين)
        for (const k of [...T.maps.keys()]) if (k < r.sid - 1) T.maps.delete(k), T.sidKey.delete(k);
        T.lastT = null;
        T.err = '';
        paintErr();
        ensureQ();
        tap();
      })
      .catch((e) => {
        T.fatal = true;
        note('تعذّر البدء: ' + cleanErr(e));
        error(cleanErr(e));
      })
      .finally(() => (T.starting = null));
    await T.starting;
  }
  const cleanErr = (e) => String((e && e.message) || e || '').replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
  function stop() {
    clearTimeout(T.idleT);
    T.idleT = 0;
    const had = !!T.ses;
    if (had) note('إيقاف الجلسة');
    keepLive();
    T.ses = null;
    tap();
    if (had && can) desk.stt.stop().catch(() => {});
    T.live = null;
    paintLive();
    if (T.state !== 'error') setState('idle');
  }
  /** الصوت من صفحة الدرس: يُطلب حين تكون جلسةٌ (ويُعاد بعد كل تنقّل) */
  function tap() {
    const S = o.state();
    if (S.guest) S.guest.call('tap', !!T.ses, T.ses ? T.ses.rate : 16000);
  }

  /** ما يجري في الدرس (كل حالٍ تصل من صفحته) */
  function sync() {
    const S = o.state();
    const key = S.src ? o.lessonKey() : '';
    if (key !== T.key) switchLesson(key);
    if (!T.open || !can) return paintEmpty();
    const st = S.st || {};
    if (!st.has) return paintEmpty();
    if (!st.paused) {
      if (!WD.playing) (WD.playing = true), (WD.playAt = Date.now());
      // صفحة الدرس لا تعرف أن صوتها مطلوب (صفحةٌ جديدة بعد تنقّل، أو ضاع الطلب): يُطلب ثانية
      if (T.ses && !st.tap && Date.now() - WD.tapAt > 2500) {
        WD.tapAt = Date.now();
        note('الصفحة لا تعرف أن الصوت مطلوب: يُطلب ثانية');
        tap();
      }
      clearTimeout(T.idleT);
      T.idleT = 0;
      if (!T.ses && !T.starting && !T.fatal) start();
      else if (T.ses && T.state === 'paused') setState('live');
    } else if (st.paused && WD.playing) WD.playing = false;
    if (st.paused && T.ses && !T.idleT) {
      // توقّف الدرس: يُتمّ ما سُمع، ثم يُغلق الاتصال إن طال التوقف
      desk.stt.flush();
      if (T.state === 'live') setState('paused');
      T.idleT = setTimeout(() => {
        T.idleT = 0;
        if (o.state().st.paused) stop();
      }, IDLE_STOP);
    }
    markNow(st.t);
    paintEmpty();
  }

  /* ---------------------------------------------------------------- الصوت */
  function onPcm(d) {
    if (!T.ses || !d || typeof d !== 'object') return;
    let pcm = null;
    const b = d.b;
    if (b instanceof ArrayBuffer) pcm = new Int16Array(b.slice(0, b.byteLength & ~1));
    else if (b && ArrayBuffer.isView(b)) pcm = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.byteLength & ~1)));
    if (!pcm || !pcm.length || pcm.length > 48000) return;
    const M = T.maps.get(T.ses.sid);
    if (!M) return;
    const t = Math.max(0, +d.t || 0);
    const r = Math.min(4, Math.max(0.25, +d.r || 1));
    const last = M.map[M.map.length - 1];
    // قفزٌ في المقطع: ما سُمع قبله يُتمّ (فلا يختلط بما بعده)
    if (T.lastT != null && Math.abs(t - T.lastT) > 1.5) {
      desk.stt.flush();
      M.map.push({ s: M.sent, t, r });
    } else if (!last || last.r !== r || M.sent - last.s > M.rate * 4) M.map.push({ s: M.sent, t, r });
    if (M.map.length > 6000) M.map.splice(0, 2000);
    T.lastT = t + (pcm.length / M.rate) * r;
    desk.stt.push(pcm);
    M.sent += pcm.length;
    // (للحارس: وصل صوت، وفيه كلامٌ أو لا)
    WD.pcmAt = Date.now();
    WD.pcmN++;
    let pk = 0;
    for (let i = 0; i < pcm.length; i += 4) {
      const a = pcm[i] < 0 ? -pcm[i] : pcm[i];
      if (a > pk) pk = a;
    }
    if (pk > 1500) (WD.speech += (pcm.length / M.rate) * 1000), WD.loudN++;
  }
  /** وقت الجلسة (ثوانٍ من صوتها) ← وقت الدرس */
  function mediaAt(sid, at) {
    const M = T.maps.get(sid);
    if (!M || at == null || !M.map.length) return null;
    const s = at * M.rate;
    let e = M.map[0];
    for (let i = M.map.length - 1; i >= 0; i--)
      if (M.map[i].s <= s) {
        e = M.map[i];
        break;
      }
    return Math.max(0, e.t + ((s - e.s) / M.rate) * e.r);
  }

  /* ---------------------------------------------------------------- ما يصل من خدمة التفريغ */
  function onEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    const mine = T.ses && ev.sid === T.ses.sid;
    WD.events++;
    if (ev.type === 'status' || ev.type === 'error') note(`${ev.type}: ${ev.state || ''}${ev.message ? ' ' + ev.message : ''}${mine ? '' : ' (جلسة سابقة)'}`);
    if (ev.type === 'status') {
      if (!mine) return;
      if (ev.state === 'live') {
        WD.liveAt = Date.now();
        WD.speech = 0;
        T.err = '';
        paintErr();
        return setState(o.state().st.paused ? 'paused' : 'live');
      }
      if (ev.state === 'connecting' || ev.state === 'reconnecting') return setState(ev.state);
      if (ev.state === 'closed') {
        T.ses = null;
        tap();
        if (T.state !== 'error') setState('idle');
      }
      return;
    }
    if (ev.type === 'partial') {
      if (!mine) return;
      const text = String(ev.text || '').trim();
      const k = ev.sid + ':' + ev.seg;
      if (text) (WD.textAt = Date.now()), (WD.speech = 0), clearWarn();
      // (وقت أول ما سُمع من هذا المقطع: إن لم يأتِ نصّه التامّ حُفظ الجزئي به)
      T.live = text ? { k, text, t: T.live && T.live.k === k ? T.live.t : Math.max(0, (o.state().st.t || 0) - 2) } : null;
      paintLive();
      if (text && prefs.book) followSoon();
      return;
    }
    if (ev.type === 'final') {
      if (T.sidKey.get(ev.sid) !== T.key) return;
      const k = ev.sid + ':' + ev.seg;
      WD.finals.add(k);
      if (WD.finals.size > 400) WD.finals = new Set([...WD.finals].slice(-200));
      if (T.live && T.live.k === k) T.live = null;
      paintLive();
      const text = String(ev.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      WD.textAt = Date.now();
      WD.speech = 0;
      clearWarn();
      let t = mediaAt(ev.sid, ev.at);
      if (t == null) t = Math.max(0, (o.state().st.t || 0) - 3);
      return addLine(t, text);
    }
    if (ev.type === 'error') {
      if (!mine && !T.starting) return;
      if (ev.fatal) {
        T.fatal = true;
        error(ev.message);
        stop();
        return setState('error');
      }
      // (خطأ عابر: الاتصال يُعاد وحده)
      T.err = ev.message || '';
      paintErr(true);
    }
  }
  function error(msg) {
    T.err = msg || 'تعذّر التفريغ';
    WD.warn = '';
    paintErr();
    setState('error');
  }

  /* ---------------------------------------------------------------- الحارس */
  /** جزئيٌّ لم يأتِ نصّه التامّ (أُغلقت الجلسة أو أُعيدت): لا يضيع، يُحفظ كما سُمع */
  function keepLive() {
    const L = T.live;
    if (!L || !L.text || L.text.split(' ').length < 2) return;
    setTimeout(() => {
      if (WD.finals.has(L.k) || T.sidKey.get(+L.k.split(':')[0]) !== T.key) return;
      note('حُفظ ما سُمع ولم يتمّ');
      if (T.live && T.live.k === L.k) (T.live = null), paintLive();
      addLine(L.t, L.text);
    }, 2500);
  }
  function setWarn(msg) {
    if (T.state === 'error' || (T.err && T.err !== WD.warn)) return;
    if (msg === WD.warn) return;
    if (msg) note('تنبيه: ' + msg);
    WD.warn = msg;
    T.err = msg;
    paintErr(true);
  }
  function clearWarn() {
    if (!WD.warn) return;
    if (T.err === WD.warn) T.err = '';
    WD.warn = '';
    paintErr(true);
  }
  function noAudioWhy(tp) {
    const why = !tp
      ? 'صفحة الدرس لم تستجب لطلب الصوت'
      : tp.ac === 'suspended'
        ? 'أوقف المتصفحُ الصوتَ عن البرنامج (انقر في صفحة الدرس مرة)'
        : !tp.track
          ? 'المقطع لا يُعطي صوته للالتقاط (قد يكون في إطارٍ داخل الصفحة أو محمياً)'
          : tp.zero > 8000
            ? 'الصوت الملتقط صامت تماماً'
            : 'لا يصل صوته';
    return `لا يصل صوت المقطع إلى التفريغ: ${why}. يُعاد الالتقاط وحده.`;
  }
  /** جلسةٌ جديدة (والقديمة عالقة أو لا تُرجع شيئاً) */
  function restart(why) {
    const now = Date.now();
    WD.restarts = WD.restarts.filter((x) => now - x < 5 * 60 * 1000);
    if (WD.restarts.length >= 3) {
      const label = (T.ses && T.ses.label) || 'خدمة التفريغ';
      return setWarn(`${label} لا تُرجع نصاً منذ دقائق والصوت يصلها. تحقّق من رصيدك فيها، أو اختر خدمةً أخرى من «خدمة التفريغ ومفتاحها».`);
    }
    WD.restarts.push(now);
    note('جلسةٌ جديدة: ' + why);
    stop();
    T.fatal = false;
    WD.speech = 0;
    WD.liveAt = WD.textAt = now;
    start();
  }
  function guard() {
    if (!T.open || !can) return;
    const st = o.state().st || {};
    const now = Date.now();
    if (!st.has || st.paused || !T.ses) return WD.warn && !/لا تُرجع/.test(WD.warn) ? clearWarn() : undefined;
    const quiet = now - Math.max(WD.pcmAt, WD.liveAt, WD.playAt);
    if (T.state === 'live' && quiet > 6000) {
      // لا يصل صوت: يُطلب الالتقاط من جديد، ثم يُقال السبب
      if (now - WD.tapAt > 5000) {
        WD.tapAt = now;
        note('لا يصل صوت: يُطلب الالتقاط ثانية ' + JSON.stringify(st.tap));
        tap();
      }
      if (now - Math.max(WD.pcmAt, WD.playAt) > 14000) setWarn(noAudioWhy(st.tap));
    } else if (/لا يصل صوت/.test(WD.warn)) clearWarn();
    // الصوت يصل الخدمة وفيه كلامٌ كثير، ولا نصّ: اتصالٌ جديد
    if (T.state === 'live' && WD.speech > 18000 && now - Math.max(WD.textAt, WD.liveAt) > 25000) restart('الخدمة لم تُرجع نصاً والكلام يصلها');
    // عالقٌ في الاتصال
    else if ((T.state === 'connecting' || T.state === 'reconnecting') && now - WD.stateAt > 25000) restart('طال الاتصال');
  }
  /** تقريرٌ بما جرى (لمن لم يُكتب له شيء: يُرسله) */
  function report() {
    const S = o.state();
    const st = S.st || {};
    const ago = (t) => (t ? Math.round((Date.now() - t) / 1000) + ' ث' : '—');
    let host = '';
    try {
      host = S.src && S.src.kind === 'web' ? new URL(S.src.url).hostname : S.src ? 'ملف' : '';
    } catch {}
    return [
      'تقرير التفريغ — ورّاق',
      `الوقت: ${new Date().toISOString()}`,
      `الخدمة: ${(T.ses && T.ses.label) || '—'} · الحال: ${T.state}${T.err ? ' · ' + T.err : ''}`,
      `الدرس: ${host || '—'} · يعمل: ${st.has && !st.paused ? 'نعم' : 'لا'} · الوقت ${Math.round(st.t || 0)} ث · مكتوم: ${st.muted ? 'نعم' : 'لا'}`,
      `الالتقاط في الصفحة: ${JSON.stringify(st.tap)}`,
      `صوتٌ وصل: ${WD.pcmN} حزمة (فيها كلام ${WD.loudN})، آخرها قبل ${ago(WD.pcmAt)} · رسائل الخدمة: ${WD.events} · آخر نص قبل ${ago(WD.textAt)} · كلامٌ بلا نص: ${Math.round(WD.speech / 1000)} ث`,
      `سطور: ${T.lines.length} · إعادات: ${WD.restarts.length}`,
      '',
      ...WD.log.slice(-80),
    ].join('\n');
  }

  /* ---------------------------------------------------------------- السطور */
  function addLine(t, text) {
    // إعادة سماع ما سبق: لا يُكرَّر سطرٌ قيل في الوقت نفسه
    for (const L of T.lines) if (Math.abs(L.t - t) < 4 && similar(L.text, text)) return;
    const L = { t: Math.round(t * 10) / 10, text };
    let i = T.lines.length;
    while (i > 0 && T.lines[i - 1].t > L.t) i--;
    T.lines.splice(i, 0, L);
    if (T.lines.length > 6000) T.lines.splice(0, T.lines.length - 6000);
    renderLines();
    persist();
    if (T.follow) scrollEnd(i === T.lines.length - 1 ? null : i);
    if (prefs.book) followSoon(L);
  }

  /* ---------------------------------------------------------------- تتبّع الشارح في الكتاب (اختياري) */
  // كل سطرٍ يُفرَّغ يُطابَق بالكتاب المفتوح على الرَّحل (في البرنامج، لا بالذكاء الاصطناعي: shared/book-follow.js):
  // أول مطابقة من سطرٍ ممتلئ، ثم يُتبع ما يقرؤه؛ فيُظلَّل في الكتاب، ويُقترح الانتقال إلى صفحته (أو يُنتقل وحده)، ويُكتب رقمها على السطر
  function paintBook(msg, kind = '') {
    const el = P('#trBk');
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'tr-bk ' + kind;
  }
  // مباشرةً: مع كل كلمةٍ تُفرَّغ (الجزئي) يُطابَق آخر ما قيل بالكتاب (بعد عشر كلماتٍ أول مرة)، ومع كل سطرٍ تمّ
  const FL = { busy: false, again: false, t: 0, final: null };
  function followSoon(L) {
    if (!prefs.book) return;
    if (L) FL.final = L;
    if (FL.busy) return void (FL.again = true);
    clearTimeout(FL.t);
    FL.t = setTimeout(followNow, L ? 0 : 90);
  }
  async function followNow() {
    FL.busy = true;
    try {
      if (!prefs.book) return;
      const R = await o.reader().catch(() => null);
      if (!R || !R.followLive) return paintBook('افتح الكتاب على الرَّحل ليُتتبَّع', 'warn');
      const F = FL.final;
      FL.final = null;
      // الجاري: ما يُقال الآن كلمةً كلمة، أو السطر الذي تمّ لتوّه؛ وقبله آخر السطور
      const Ln = F || (T.live && T.live.text ? null : T.lines[T.lines.length - 1]);
      const now = Ln ? Ln.text : T.live ? T.live.text : '';
      const k = Ln ? T.lines.indexOf(Ln) : T.lines.length;
      const before = T.lines
        .slice(Math.max(0, k - 3), k < 0 ? T.lines.length : k)
        .map((x) => x.text)
        .join(' ');
      if (!now) return;
      const r = await R.followLive(before, now, { auto: !!prefs.bookAuto });
      if (!r) return;
      const idx = r.indexed < r.N ? ` · فُهرس ${ar(Math.round((r.indexed / r.N) * 100))}٪` : '';
      if (r.page) {
        if (r.found && r.inNow && Ln && Ln.pg !== r.page) {
          Ln.pg = r.page;
          renderLines();
          persist();
        }
        // (بعد آخر ما طابق أربع كلماتٍ ذات معنى فأكثر: يشرح، والموضع باقٍ)
        const reading = r.found && !(r.miss >= 4);
        paintBook(reading ? `يقرأ في ص ${ar(r.page)}${idx}` : `يشرح · وقف عند ص ${ar(r.page)}${idx}`, reading ? 'ok' : '');
      } else paintBook(`${(before + ' ' + now).trim().split(/\s+/).length < 10 ? 'يبدأ التتبّع بعد عشر كلمات' : 'يبحث في الكتاب عمّا يقرؤه'}${idx}`);
    } catch {
    } finally {
      FL.busy = false;
      if (FL.again) (FL.again = false), followSoon();
    }
  }
  function partsOf(L) {
    if (!T.quran || !T.Q) return [{ text: L.text }];
    if (!L.parts || L.parts.Q !== T.Q) {
      L.parts = alignQuran(L.text, T.Q);
      L.parts.Q = T.Q;
    }
    return L.parts;
  }
  const reAlign = () => T.lines.length && renderLines();
  /** نص المصحف (مرةً واحدة، حين يلزم) */
  function ensureQ() {
    if (!T.quran || T.Q || T.qLoading) return;
    T.qLoading = true;
    loadQuranText()
      .then((Q) => Q && ((T.Q = Q), reAlign()))
      .finally(() => (T.qLoading = false));
  }
  function lineHtml(L, i) {
    const body = partsOf(L)
      .map((p) => (p.quran ? `<span class="tr-q" title="${esc('سُمعت: ' + p.heard)}">﴿${esc(p.quran.text)}﴾<small>[${esc(p.quran.ref)}]</small></span>` : esc(p.text)))
      .join('');
    const pg = L.pg ? `<button type="button" class="tr-pg" data-pg="${L.pg}" title="في الكتاب: الصفحة ${ar(L.pg)}">ص ${ar(L.pg)}</button>` : '';
    return `<p class="tr-line${i === T.now ? ' now' : ''}" data-i="${i}"><button type="button" class="tr-at" data-seek="${L.t}" title="اسمعه من هنا">${clock(L.t)}</button><span class="tr-x">${body}${pg}</span><button type="button" class="tr-add" data-add="${i}" title="إلى الكتاب: ملاحظةٌ عند هذا الوقت">＋</button></p>`;
  }
  function renderLines() {
    P('#trLines').innerHTML = T.lines.map(lineHtml).join('');
    paintEmpty();
  }
  function paintLive() {
    const el = P('#trLive');
    el.hidden = !T.live;
    el.textContent = T.live ? T.live.text : '';
    if (T.live && T.follow) scrollEnd();
    paintEmpty();
  }
  function markNow(t) {
    if (!T.lines.length) return;
    let k = -1;
    for (let i = 0; i < T.lines.length; i++) if (T.lines[i].t <= t + 0.3) k = i;
    if (k === T.now) return;
    const prev = P(`.tr-line[data-i="${T.now}"]`);
    if (prev) prev.classList.remove('now');
    T.now = k;
    const el = P(`.tr-line[data-i="${k}"]`);
    if (el) el.classList.add('now');
  }
  let autoScroll = false;
  function scrollEnd(i = null) {
    const body = P('#trBody');
    autoScroll = true;
    if (i != null) {
      const el = P(`.tr-line[data-i="${i}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else body.scrollTop = body.scrollHeight;
    requestAnimationFrame(() => (autoScroll = false));
  }
  P('#trBody').addEventListener('scroll', () => {
    if (autoScroll) return;
    const b = P('#trBody');
    T.follow = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    P('.tr-follow').hidden = T.follow || !T.lines.length;
  });

  /* ---------------------------------------------------------------- الحفظ مع الدرس */
  async function switchLesson(key) {
    if (T.ses) stop();
    clearTimeout(T.saveT);
    T.key = key;
    T.lines = [];
    T.live = null;
    T.now = -1;
    T.fatal = false;
    T.err = '';
    paintErr();
    renderLines();
    paintLive();
    paintCount();
    if (!key) return;
    try {
      const v = await getItem('notes', 'tr:' + key);
      if (T.key !== key || !v || !Array.isArray(v.lines)) return;
      // (ما وصل في أثناء القراءة يُبقى)
      const seen = T.lines;
      T.lines = v.lines.filter((L) => L && typeof L.text === 'string' && isFinite(L.t)).map((L) => ({ t: +L.t, text: L.text, ...(+L.pg > 0 ? { pg: +L.pg } : {}) }));
      for (const L of seen) addLine(L.t, L.text);
      renderLines();
      paintCount();
      if (T.open) scrollEnd(), ensureQ();
    } catch {}
  }
  function persist() {
    paintCount();
    if (!T.key || !T.save) return;
    clearTimeout(T.saveT);
    const key = T.key;
    T.saveT = setTimeout(() => {
      setItem('notes', 'tr:' + key, { v: 1, title: o.title() || '', at: Date.now(), lines: T.lines.map((L) => ({ t: L.t, text: L.text, ...(L.pg ? { pg: L.pg } : {}) })) }).catch(() => {});
    }, 1200);
  }
  function paintCount() {
    const b = box.querySelector('[data-a="tr"]');
    if (b) b.dataset.n = T.lines.length ? (T.lines.length > 999 ? '+' : ar(T.lines.length)) : '';
  }

  /* ---------------------------------------------------------------- الحال */
  function setState(s) {
    if (s !== T.state) (WD.stateAt = Date.now()), note('الحال: ' + s);
    T.state = s;
    pane.dataset.state = s;
    const label = (T.ses && T.ses.label) || '';
    const msg = {
      idle: can ? 'يبدأ حين يُشغَّل الدرس' : '',
      connecting: `يتصل${label ? ' بـ' + label : ''}…`,
      live: `يُكتب مباشرةً${label ? ' · ' + label : ''}`,
      reconnecting: 'انقطع الاتصال؛ يُعاد…',
      paused: 'متوقفٌ مع الدرس',
      error: 'متوقف',
    }[s];
    P('#trSt').textContent = msg || '';
    const b = box.querySelector('[data-a="tr"]');
    if (b) b.classList.toggle('live', s === 'live');
  }
  function paintErr(soft = false) {
    const el = P('#trErr');
    el.hidden = !T.err;
    el.classList.toggle('soft', soft);
    el.innerHTML = T.err ? `<span>${esc(T.err)}</span>${soft ? '' : `<button type="button" class="tr-b" data-t="retry">أعد المحاولة</button>${/مفتاح|الإعدادات/.test(T.err) ? '<button type="button" class="tr-b" data-t="settings">الإعدادات</button>' : ''}`}` : '';
  }
  function paintEmpty() {
    const el = P('#trEmpty');
    const S = o.state();
    const empty = !T.lines.length && !T.live;
    el.hidden = !empty;
    if (!empty) return;
    el.innerHTML = !can
      ? '<b>التفريغ المباشر في البرنامج وحده</b><span>في برنامج ورّاق على الحاسوب يُكتب كلام الدرس وهو يُقال.</span>'
      : !(S.st && S.st.has)
        ? '<b>شغّل الدرس يُكتب كلامه هنا</b><span>من يوتيوب أو تيليجرام أو أي رابط، أو مقطعٍ من جهازك. يُسمع صوت المقطع نفسه، لا المايكروفون.</span>'
        : T.state === 'error'
          ? '<b>لم يبدأ التفريغ</b><span>انظر السبب أعلاه.</span>'
          : S.st.paused
            ? '<b>شغّل الدرس يبدأ التفريغ</b><span>يُكتب الكلام بعد لحظاتٍ من قوله، والآيات بنص المصحف ومعها سورتها وآيتها.</span>'
            : '<b>يُصغي…</b><span>يظهر الكلام هنا حين يبدأ الشيخ.</span>';
  }

  /* ---------------------------------------------------------------- الأزرار */
  function paintMenu() {
    P('[data-t="bookFollow"]').setAttribute('aria-checked', String(!!prefs.book));
    P('[data-t="bookAuto"]').setAttribute('aria-checked', String(!!prefs.bookAuto));
    P('[data-t="bookAuto"]').hidden = !prefs.book;
  }
  function menu(on) {
    const m = P('#trMenu');
    on = on ?? m.hidden;
    m.hidden = !on;
    P('[data-t="menu"]').setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('pointerdown', (e) => !e.target.closest('.tr-mw') && menu(false), true);
  pane.addEventListener('click', async (e) => {
    const sk = e.target.closest('[data-seek]');
    if (sk) return o.seek(Math.max(0, +sk.dataset.seek - 0.4));
    const pg = e.target.closest('[data-pg]');
    if (pg) {
      const R = await o.reader().catch(() => null);
      if (R && R.goto) return R.goto(+pg.dataset.pg);
      return o.toast('افتح الكتاب على الرَّحل');
    }
    const ad = e.target.closest('[data-add]');
    if (ad) {
      const L = T.lines[+ad.dataset.add];
      return L && toBook(plain(L), L.t);
    }
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const a = b.dataset.t;
    if (a !== 'menu' && a !== 'bookFollow' && a !== 'bookAuto') menu(false);
    if (a === 'menu') return menu();
    if (a === 'close') return setOpen(false);
    if (a === 'follow') {
      T.follow = true;
      b.hidden = true;
      return scrollEnd();
    }
    if (a === 'retry') {
      T.fatal = false;
      T.err = '';
      paintErr();
      setState('idle');
      return sync();
    }
    if (a === 'settings') return openSettings();
    if (a === 'bookFollow' || a === 'bookAuto') {
      if (a === 'bookFollow') prefs.book = !prefs.book;
      else prefs.bookAuto = !prefs.bookAuto, (prefs.book = prefs.book || prefs.bookAuto);
      savePrefs();
      paintMenu();
      if (!prefs.book) {
        paintBook('');
        const R = await o.reader().catch(() => null);
        if (R && R.followClear) R.followClear();
        return;
      }
      paintBook('يبحث في الكتاب عمّا يقرؤه');
      // يبدأ بآخر سطرٍ قيل (فلا ينتظر السطر التالي)
      const last = T.lines[T.lines.length - 1];
      if (last) followSoon(last);
      return;
    }
    if (a === 'report') {
      try {
        await navigator.clipboard.writeText(report());
        o.toast('نُسخ تقرير التفريغ: ألصقه في رسالة');
      } catch {
        o.toast('تعذّر النسخ');
      }
      return;
    }
    if (a === 'copy') {
      if (!T.lines.length) return o.toast('لا تفريغ بعد');
      try {
        await navigator.clipboard.writeText(asText());
        o.toast('نُسخ التفريغ');
      } catch {
        o.toast('تعذّر النسخ');
      }
      return;
    }
    if (a === 'txt' || a === 'srt') {
      if (!T.lines.length) return o.toast('لا تفريغ بعد');
      return download(a);
    }
    if (a === 'clear') {
      if (!T.lines.length) return;
      if (!confirm('يُمسح تفريغ هذا الدرس كله؟')) return;
      T.lines = [];
      T.now = -1;
      renderLines();
      paintCount();
      if (T.key) delItem('notes', 'tr:' + T.key).catch(() => {});
      return;
    }
    if (a === 'book') {
      const sel = String(getSelection() || '').trim();
      if (sel && pane.contains(getSelection().anchorNode)) {
        const p = getSelection().anchorNode.parentElement && getSelection().anchorNode.parentElement.closest('.tr-line');
        const L = p ? T.lines[+p.dataset.i] : null;
        return toBook(sel, L ? L.t : o.state().st.t);
      }
      const L = T.lines[T.now >= 0 ? T.now : T.lines.length - 1];
      if (!L) return o.toast('لا تفريغ بعد');
      return toBook(plain(L), L.t);
    }
  });
  function openSettings() {
    try {
      localStorage.setItem('warraq.adminGo', JSON.stringify({ tab: 'ai', scope: 'rahl', panel: 'sttPanel' }));
    } catch {}
    if (desk && desk.openWindow) desk.openWindow('settings');
  }
  /** السطر نصاً: الآيات بقوسيها ومرجعها */
  const plain = (L) => partsOf(L).map((p) => (p.quran ? `﴿${p.quran.text}﴾ [${p.quran.ref}]` : p.text)).join('');
  const asText = () => {
    const h = o.title() ? `تفريغ: ${o.title()}\n\n` : '';
    return h + T.lines.map((L) => `[${clock(L.t)}] ${plain(L)}`).join('\n');
  };
  function download(kind) {
    let body;
    if (kind === 'srt') {
      const end = (i) => {
        const nx = T.lines[i + 1];
        const guess = T.lines[i].t + Math.min(12, Math.max(2, T.lines[i].text.split(' ').length * 0.42));
        return nx ? Math.min(nx.t - 0.05, guess) : guess;
      };
      body = T.lines.map((L, i) => `${i + 1}\n${srtTime(L.t)} --> ${srtTime(Math.max(L.t + 0.8, end(i)))}\n${plain(L)}\n`).join('\n');
    } else body = asText() + '\n';
    const name = (String(o.title() || 'الدرس').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'الدرس') + ' — تفريغ.' + kind;
    // في البرنامج: في مجلد «تفريغ الدروس» داخل مجلد ورّاق (لا يُكتب فوق ملفٍ سابق)
    if (desk && desk.saveFile) {
      desk
        .saveFile('تفريغ الدروس', name, new TextEncoder().encode('\ufeff' + body), { unique: true })
        .then((r) => o.toast(`حُفظ في «تفريغ الدروس»: ${String(r && r.path ? r.path.split(/[\\/]/).pop() : name)}`))
        .catch((e) => o.toast(cleanErr(e) || 'تعذّر الحفظ'));
      return;
    }
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: kind === 'srt' ? 'application/x-subrip' : 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function toBook(text, t) {
    const R = await o.reader().catch(() => null);
    if (!R) return o.toast('افتح الكتاب على الرَّحل أولاً، ثم أرسل إليه من التفريغ');
    const S = o.state();
    R.addNote(text, { kind: 'lesson', t, title: o.title() || '', url: S.src && S.src.kind === 'web' ? S.src.url : '' });
  }
  // تغيير ارتفاع التفريغ
  P('.tr-grip').addEventListener('pointerdown', (e) => {
    const el = e.currentTarget;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('lsn-dragging');
    const y0 = e.clientY;
    const h0 = pane.getBoundingClientRect().height;
    const mv = (ev) => {
      const max = box.getBoundingClientRect().height - 220;
      prefs.h = Math.round(Math.max(110, Math.min(max, h0 + (y0 - ev.clientY))));
      box.style.setProperty('--trh', prefs.h + 'px');
    };
    const up = () => {
      el.removeEventListener('pointermove', mv);
      document.body.classList.remove('lsn-dragging');
      savePrefs();
    };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up, { once: true });
    el.addEventListener('pointercancel', up, { once: true });
  });

  function setOpen(on) {
    T.open = !!on;
    pane.hidden = !T.open;
    box.classList.toggle('with-tr', T.open);
    const b = box.querySelector('[data-a="tr"]');
    if (b) b.setAttribute('aria-pressed', String(T.open));
    clearInterval(WD.timer);
    WD.timer = T.open ? setInterval(guard, 2000) : 0;
    if (!T.open) stop();
    else {
      T.fatal = false;
      if (T.state === 'error') (T.err = ''), paintErr(), setState('idle');
      setState(T.state);
      sync();
      if (T.lines.length) ensureQ();
      if (T.follow) scrollEnd();
    }
  }
  if (can) desk.stt.onEvent(onEvent);
  setState('idle');
  paintMenu();
  paintEmpty();

  return {
    pane,
    toggle: () => setOpen(!T.open),
    setOpen,
    get isOpen() {
      return T.open;
    },
    sync,
    onPcm,
    /** صفحة الدرس الجديدة (بعد تنقّل) لا تعرف أن الصوت مطلوب */
    apply: tap,
    stop,
    /** للمساعد: التفريغ بأوقاته */
    text: () => (T.lines.length ? T.lines.map((L) => `[${clock(L.t)}] ${plain(L)}`).join('\n') : ''),
    /** للاختبار */
    report,
    get state() {
      return { warn: WD.warn, open: T.open, state: T.state, err: T.err, key: T.key, lines: T.lines.map((L) => ({ t: L.t, text: L.text, ...(L.pg ? { pg: L.pg } : {}) })), live: T.live && T.live.text, ses: T.ses, quran: !!T.Q };
    },
  };
}
