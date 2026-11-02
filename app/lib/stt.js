// التفريغ المباشر لدرس «مجلس الدرس»: صوت المقطع نفسه (لا المايكروفون) يُبثّ إلى خدمة تفريغٍ لحظي،
// ويعود النص وهو يُقال: جزئياً يتبدّل، ثم نهائياً لا يتغير.
// الخدمات (بمفتاح المستخدم): ElevenLabs Scribe v2 Realtime، و Soniox stt-rt-v5، و OpenAI gpt-live-transcribe،
// و Google Gemini (gemini-3.5-transcribe-live). كلها WebSocket من هنا (العملية الرئيسية)، فلا يخرج المفتاح إلى الصفحات.
// الجلسة الواحدة: open → push(صوت PCM16) … → flush (عند الإيقاف والقفز) → close.
// وفيها: إعادة الاتصال وحدها إن انقطع (والصوت في أثنائها محفوظ)، وتقدير وقت كل مقطع من موجة الصوت نفسها.
import { getConfig, setConfig, encrypt, decrypt } from './store.js';
import { resolvedProviders } from './ai.js';

export const STT_ENGINES = {
  elevenlabs: {
    label: 'ElevenLabs Scribe',
    model: 'scribe_v2_realtime',
    rate: 16000,
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
    note: 'تفريغٌ لحظي قوي في العربية، يكتب وهو يسمع.',
    url: (o) => `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=${encodeURIComponent(o.model)}&language_code=ar&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=0.9`,
  },
  soniox: {
    label: 'Soniox',
    model: 'stt-rt-v5',
    rate: 16000,
    keyUrl: 'https://console.soniox.com',
    note: 'كلمةً كلمة بأقل تأخير، ويقبل مفردات الدرس (أسماء الأعلام والكتب).',
    url: () => 'wss://stt-rt.soniox.com/transcribe-websocket',
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-live-transcribe',
    rate: 24000,
    reuse: 'openai',
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'نموذج التفريغ الحي من OpenAI؛ يستعمل مفتاح OpenAI الذي في إعدادات الذكاء الاصطناعي إن وُجد.',
    url: () => 'wss://api.openai.com/v1/realtime?intent=transcription',
  },
  gemini: {
    label: 'Google Gemini',
    model: 'gemini-3.5-transcribe-live',
    rate: 16000,
    reuse: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'التفريغ الحي من Google؛ يستعمل مفتاح Gemini الذي في إعدادات الذكاء الاصطناعي إن وُجد.',
    url: (o) => `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(o.key)}`,
  },
};
export const STT_DELAYS = ['minimal', 'low', 'medium', 'high'];
// (للاختبار: خادمٌ واحد يحاكي الخدمات كلها، كلٌّ بمساره)
const TEST_BASE = process.env.WARRAQ_STT_BASE || '';
const urlOf = (engine, o) => {
  const real = STT_ENGINES[engine].url(o);
  return TEST_BASE ? `${TEST_BASE.replace(/\/$/, '')}/${engine}${new URL(real).search}` : real;
};

/* ================================================================ الإعدادات */
const DEF = { engine: 'elevenlabs', keys: {}, words: '', delay: 'low', quran: true, save: true };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f<>]/g, '').slice(0, n);
export function sttConfig(c = getConfig()) {
  const s = c.stt && typeof c.stt === 'object' ? c.stt : {};
  return {
    engine: STT_ENGINES[s.engine] ? s.engine : DEF.engine,
    keys: s.keys && typeof s.keys === 'object' ? s.keys : {},
    words: typeof s.words === 'string' ? s.words : '',
    delay: STT_DELAYS.includes(s.delay) ? s.delay : DEF.delay,
    quran: s.quran !== false,
    save: s.save !== false,
  };
}
const mask = (k) => (k ? (k.length > 12 ? k.slice(0, 4) : '') + '••••' + k.slice(-4) : '');
/** مفتاح الخدمة: ما كُتب لها هنا، وإلا (OpenAI و Gemini) مفتاحٌ من إعدادات الذكاء الاصطناعي */
export function sttKey(engine, c = getConfig()) {
  const s = sttConfig(c);
  const own = s.keys[engine] ? decrypt(s.keys[engine]) : '';
  if (own) return { key: own, from: '' };
  const kind = STT_ENGINES[engine] && STT_ENGINES[engine].reuse;
  if (kind) {
    for (const sc of ['rahl', 'editor', 'typeset']) {
      const p = resolvedProviders(sc).find((x) => x.kind === kind && x.key && x.enabled !== false && (kind !== 'openai' || /api\.openai\.com/.test(x.baseUrl || '')));
      if (p) return { key: p.key, from: p.label || p.kindLabel || kind };
    }
  }
  return { key: '', from: '' };
}
/** ما يُعرض في الإعدادات (لا مفاتيح) */
export function sttPublic() {
  const c = getConfig();
  const s = sttConfig(c);
  return {
    engine: s.engine,
    words: s.words,
    delay: s.delay,
    quran: s.quran,
    save: s.save,
    engines: Object.entries(STT_ENGINES).map(([id, e]) => {
      const k = sttKey(id, c);
      const own = s.keys[id] ? decrypt(s.keys[id]) : '';
      return { id, label: e.label, model: e.model, note: e.note, keyUrl: e.keyUrl, reuse: !!e.reuse, hasKey: !!k.key, ownKey: !!own, keyMasked: mask(own || k.key), from: own ? '' : k.from };
    }),
  };
}
export async function setStt(b = {}) {
  const c = getConfig();
  const s = sttConfig(c);
  const next = { ...s, keys: { ...s.keys } };
  if (b.engine !== undefined && STT_ENGINES[b.engine]) next.engine = b.engine;
  if (typeof b.words === 'string') next.words = clean(b.words, 2000);
  if (STT_DELAYS.includes(b.delay)) next.delay = b.delay;
  if (typeof b.quran === 'boolean') next.quran = b.quran;
  if (typeof b.save === 'boolean') next.save = b.save;
  if (b.keys && typeof b.keys === 'object') {
    for (const [id, v] of Object.entries(b.keys)) {
      if (!STT_ENGINES[id] || typeof v !== 'string') continue;
      const k = v.replace(/\s+/g, '').slice(0, 400);
      if (k) next.keys[id] = encrypt(k);
      else delete next.keys[id];
    }
  }
  await setConfig({ stt: next });
  return sttPublic();
}

/* ================================================================ السياق: ما يُعين التفريغ */
/**
 * وصف الدرس وكلماته: عنوان المقطع، والكتاب الذي على الرَّحل وبابه، ومفردات المستخدم.
 * ← { prompt, terms }
 */
export function contextOf({ title = '', book = '', heading = '', words = '' } = {}) {
  const terms = [...new Set([...String(words).split(/[\n،,;؛]+/), ...[book, heading].filter(Boolean)].map((x) => x.replace(/[<>\r\n]/g, ' ').trim()).filter((x) => x && x.length <= 60))].slice(0, 80);
  const prompt = [
    'درسٌ علميٌّ مسموع باللغة العربية (الفصحى غالباً، وقد تخالطها العامية)، فيه آياتٌ من القرآن الكريم تُتلى، وأحاديث نبوية، وأسماء أعلامٍ وكتب، ومصطلحات في العلوم الشرعية والعربية.',
    title ? `عنوان الدرس: ${clean(title, 200)}.` : '',
    book ? `الكتاب الذي يُشرح: ${clean(book, 200)}${heading ? '، في «' + clean(heading, 120) + '»' : ''}.` : '',
    'اكتب الكلام كما قيل بالعربية الفصحى المعتادة في الكتابة، بعلامات الترقيم، والآيات بنصها.',
  ]
    .filter(Boolean)
    .join(' ');
  return { prompt, terms };
}

/* ================================================================ موجة الصوت: أين يبدأ الكلام */
/** VAD بسيط من طاقة الصوت (لتقدير وقت كل مقطع، وللتسليم في OpenAI) */
function makeVad(rate) {
  const FR = Math.round(rate * 0.02); // ٢٠ م.ث
  let floor = 300;
  let rest = new Int16Array(0);
  return {
    /** ← [{ speech, n }] لكل إطار */
    frames(pcm) {
      const all = rest.length ? concat(rest, pcm) : pcm;
      const out = [];
      let i = 0;
      for (; i + FR <= all.length; i += FR) {
        let e = 0;
        for (let k = i; k < i + FR; k++) e += all[k] * all[k];
        const rms = Math.sqrt(e / FR);
        floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.999 + rms * 0.001;
        out.push({ speech: rms > Math.max(floor * 2.6, 260), n: FR });
      }
      rest = all.slice(i);
      return out;
    },
  };
}
function concat(a, b) {
  const o = new Int16Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
}
const b64 = (pcm) => Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
const toPcm = (x) => {
  if (x instanceof Int16Array) return x;
  if (ArrayBuffer.isView(x)) return new Int16Array(x.buffer.slice(x.byteOffset, x.byteOffset + (x.byteLength & ~1)));
  if (x instanceof ArrayBuffer) return new Int16Array(x.slice(0, x.byteLength & ~1));
  return new Int16Array(0);
};
// رسائل الأخطاء بالعربية
function arError(engine, msg, code) {
  const m = String(msg || '');
  if (code === 401 || code === 403 || /unauthori|invalid.*(key|api)|auth|permission|forbidden|api key/i.test(m)) return { message: `مفتاح ${STT_ENGINES[engine].label} غير صالح أو لا يملك هذه الخدمة`, fatal: true };
  if (code === 429 || /quota|rate.?limit|insufficient|billing|credits|exceeded/i.test(m)) return { message: `رصيد ${STT_ENGINES[engine].label} نفد أو كثرت الطلبات`, fatal: true };
  if (/model.*(not|does not) (exist|found)|unknown model|not supported/i.test(m)) return { message: `النموذج غير متاح في حسابك (${m.slice(0, 120)})`, fatal: true };
  return { message: m.slice(0, 300) || 'خطأ في خدمة التفريغ', fatal: false };
}

/* ================================================================ الجلسة */
/**
 * @param {object} o
 * @param {string} [o.engine]   الخدمة (الأصل: ما في الإعدادات)
 * @param {object} [o.context]  { title, book, heading }
 * @param {(ev:object)=>void} o.onEvent  ready | status | partial | final | error
 * ← { engine, model, rate, push(pcm), flush(), close() }
 */
export function openStt(o = {}) {
  const c = getConfig();
  const cfg = sttConfig(c);
  const engine = STT_ENGINES[o.engine] ? o.engine : cfg.engine;
  const E = STT_ENGINES[engine];
  const { key } = sttKey(engine, c);
  const emit = (ev) => {
    try {
      o.onEvent && o.onEvent(ev);
    } catch {}
  };
  if (!key) throw Object.assign(new Error(`لا مفتاح لـ${E.label}: أضفه من الإعدادات ← الذكاء الاصطناعي ← الرَّحل ← التفريغ`), { status: 400 });
  const ctx = contextOf({ ...(o.context || {}), words: cfg.words });
  const rate = E.rate;
  const vad = makeVad(rate);
  let ws = null;
  let ready = false;
  let closed = false;
  let retries = 0;
  let sent = 0; // عيّنات الصوت المُرسلة (منذ بدء الجلسة)
  let backlog = []; // صوتٌ ينتظر الاتصال (٢٠ ثانية على الأكثر)
  let seg = 1; // رقم المقطع الجاري
  let speechAt = null; // أول كلامٍ في المقطع الجاري (بالثواني من بدء الجلسة)
  let idleT = 0;
  let keepT = 0;
  let lastAudio = Date.now();
  // OpenAI: التسليم عند السكوت (لا يقبل هذا النموذج اكتشاف الدور في الخادم)
  const oa = { speech: 0, silence: 0, buffered: 0, items: new Map(), order: [], partial: new Map() };
  // Soniox: الرموز النهائية للمقطع الجاري
  const sx = { finals: '', firstMs: null };

  const status = (state, msg = '') => emit({ type: 'status', state, msg, engine });
  const final = (text, at, s = seg) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (s === seg) seg++;
    const start = at != null ? at : speechAt;
    speechAt = null;
    if (t) emit({ type: 'final', seg: s, text: t, at: start != null ? Math.max(0, start) : null });
  };
  const partial = (text, s = seg) => emit({ type: 'partial', seg: s, text: String(text || '') });
  const fail = (msg, code) => {
    const e = arError(engine, msg, code);
    emit({ type: 'error', ...e, engine });
    if (e.fatal) close(true);
  };

  function connect() {
    if (closed) return;
    ready = false;
    status(retries ? 'reconnecting' : 'connecting');
    const url = urlOf(engine, { key, model: E.model });
    const headers = engine === 'elevenlabs' ? { 'xi-api-key': key } : engine === 'gemini' ? {} : { Authorization: `Bearer ${key}` };
    try {
      ws = new WebSocket(url, { headers });
    } catch (e) {
      return fail(e.message);
    }
    ws.binaryType = 'arraybuffer';
    const me = ws;
    ws.onopen = () => {
      if (me !== ws) return;
      hello();
    };
    ws.onmessage = (m) => {
      if (me !== ws) return;
      let j = null;
      try {
        j = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8'));
      } catch {
        return;
      }
      try {
        onMessage(j);
      } catch (e) {
        emit({ type: 'error', message: 'رسالة غير متوقعة من الخدمة: ' + e.message, fatal: false, engine });
      }
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (me !== ws) return;
      ready = false;
      clearInterval(keepT);
      if (closed) return status('closed');
      // انقطع: يُعاد الاتصال (وما يُرسل في أثنائه محفوظ)
      const code = ev && ev.code;
      if (code === 1008 || code === 4001 || code === 4003 || /auth|key|unauthori/i.test(String(ev && ev.reason))) return fail(String(ev.reason || 'رُفض الاتصال'), 401);
      if (retries >= 6) return fail('انقطع الاتصال بخدمة التفريغ مراراً: ' + String((ev && ev.reason) || code || ''), 0), close(true);
      retries++;
      setTimeout(connect, Math.min(8000, 600 * 2 ** (retries - 1)));
    };
  }
  /** أول رسالة: إعداد الجلسة */
  function hello() {
    if (engine === 'openai') {
      const tr = { model: E.model, languages: ['ar'], delay: cfg.delay, ...(ctx.prompt ? { prompt: ctx.prompt } : {}) };
      const kw = ctx.terms.filter((t) => !/[<>\r\n]/.test(t)).slice(0, 50);
      if (kw.length) tr.keywords = kw;
      send({ type: 'session.update', session: { type: 'transcription', audio: { input: { format: { type: 'audio/pcm', rate }, transcription: tr, turn_detection: null } } } });
      return goLive();
    }
    if (engine === 'soniox') {
      send({
        api_key: key,
        model: E.model,
        audio_format: 'pcm_s16le',
        sample_rate: rate,
        num_channels: 1,
        language_hints: ['ar'],
        enable_endpoint_detection: true,
        context: { general: [{ key: 'domain', value: 'درس علمي شرعي باللغة العربية' }], text: ctx.prompt, terms: ctx.terms },
      });
      keepT = setInterval(() => ready && Date.now() - lastAudio > 12000 && send({ type: 'keepalive' }), 10000);
      return goLive();
    }
    if (engine === 'gemini') {
      // اللغة: [] تكشفها الخدمة وحدها (رموزها إقليمية مثل ar-EG، والدروس من كل بلد)؛ والمفردات: customVocabulary («تحيّز الكلام»)
      const vocab = ctx.terms.filter((t) => t.length <= 60).slice(0, 100);
      send({ setup: { model: `models/${E.model}`, generationConfig: { responseModalities: ['TEXT'] }, inputAudioTranscription: { languageCodes: [], mode: 'VERBATIM', ...(vocab.length ? { customVocabulary: vocab } : {}) } } });
      return; // ← setupComplete
    }
    // elevenlabs: ← session_started
  }
  function goLive() {
    sxBase = (sent - backlog.reduce((a, x) => a + x.length, 0)) / rate;
    ready = true;
    retries = 0;
    status('live');
    emit({ type: 'ready', engine, model: E.model, rate });
    // ما انتظر الاتصال
    const b = backlog;
    backlog = [];
    for (const pcm of b) sendAudio(pcm);
  }
  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  function sendAudio(pcm) {
    if (engine === 'openai') send({ type: 'input_audio_buffer.append', audio: b64(pcm) });
    else if (engine === 'soniox') ws && ws.readyState === 1 && ws.send(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    else if (engine === 'elevenlabs') send({ message_type: 'input_audio_chunk', audio_base_64: b64(pcm), commit: false, sample_rate: rate });
    else if (engine === 'gemini') send({ realtimeInput: { audio: { data: b64(pcm), mimeType: `audio/pcm;rate=${rate}` } } });
  }

  function onMessage(j) {
    if (engine === 'openai') {
      const t = j.type || '';
      if (t === 'error') return fail((j.error && (j.error.message || j.error.code)) || 'خطأ', j.error && /invalid_api_key|authentication/.test(j.error.code || '') ? 401 : 0);
      if (t === 'input_audio_buffer.committed') {
        // المقطع يُعرف برقمه، وقد تصل نتائجه بغير ترتيب
        const s = oa.order.shift();
        if (s) oa.items.set(j.item_id, s);
        return;
      }
      if (t === 'conversation.item.input_audio_transcription.delta') {
        const s = oa.items.get(j.item_id) || seg;
        const txt = (oa.partial.get(j.item_id) || '') + (j.delta || '');
        oa.partial.set(j.item_id, txt);
        return partial(txt, s.seg || s);
      }
      if (t === 'conversation.item.input_audio_transcription.completed') {
        const s = oa.items.get(j.item_id);
        oa.items.delete(j.item_id);
        oa.partial.delete(j.item_id);
        const text = String(j.transcript || '').trim();
        if (s) emit(text ? { type: 'final', seg: s.seg, text, at: s.at } : { type: 'partial', seg: s.seg, text: '' });
        else final(text);
        return;
      }
      return;
    }
    if (engine === 'soniox') {
      if (j.error_code || j.error_message) return fail(j.error_message || j.error_type || 'خطأ', j.error_code);
      let nonFinal = '';
      let ended = false;
      for (const tk of j.tokens || []) {
        const tx = String(tk.text || '');
        if (/^<\w+>$/.test(tx.trim())) {
          if (tk.is_final) ended = true;
          continue;
        }
        if (tk.is_final) {
          if (sx.firstMs == null && tk.start_ms != null && tx.trim()) sx.firstMs = tk.start_ms;
          sx.finals += tx;
        } else nonFinal += tx;
      }
      if (ended || (j.finished && sx.finals)) {
        final(sx.finals, sx.firstMs != null ? sxBase + sx.firstMs / 1000 : null);
        sx.finals = '';
        sx.firstMs = null;
        partial(nonFinal);
      } else if (sx.finals || nonFinal) partial(sx.finals + nonFinal);
      return;
    }
    if (engine === 'elevenlabs') {
      const t = String(j.message_type || '');
      if (t === 'session_started') return goLive();
      if (/error|rate_limited|throttl|overflow|exhausted/i.test(t)) {
        const msg = String(j.error || j.message || j.detail || t);
        // انتهى وقت الجلسة، أو طال السكوت، أو ازدحمت الخدمة لحظة: اتصالٌ جديد بلا إزعاج (وما يُرسل في أثنائه محفوظ)
        if (/time.?limit|session.?time|insufficient.?audio|queue.?overflow|transcriber/i.test(t + ' ' + msg)) return reopen();
        return fail(msg, /auth|unaccepted/i.test(t) ? 401 : /quota|rate.?limit|throttl|exhausted/i.test(t + ' ' + msg) ? 429 : 0);
      }
      if (t === 'partial_transcript') return partial(j.text || '');
      if (t === 'committed_transcript') return final(j.text || '');
      return;
    }
    if (engine === 'gemini') {
      if (j.setupComplete) return goLive();
      if (j.error) return fail(j.error.message || 'خطأ', j.error.code);
      if (j.goAway) return reopen();
      const sc = j.serverContent;
      if (!sc) return;
      if (sc.interimInputTranscription && sc.interimInputTranscription.text != null) partial(sc.interimInputTranscription.text);
      if (sc.inputTranscription && sc.inputTranscription.text) final(sc.inputTranscription.text);
    }
  }
  // بداية الاتصال الجاري بالثواني من بدء الجلسة (Soniox يعدّ الوقت من اتصاله)
  let sxBase = 0;
  /** جلسة Gemini محدودة (١٠ دقائق): يُفتح اتصالٌ جديد قبلها والنص متصل */
  let geminiT = 0;
  function reopen() {
    if (closed) return;
    const old = ws;
    ws = null;
    try {
      old && old.close(1000, 'renew');
    } catch {}
    connect();
  }

  /* ---------------- الصوت */
  function push(x) {
    if (closed) return;
    const pcm = toPcm(x);
    if (!pcm.length) return;
    lastAudio = Date.now();
    // موجة الصوت: أين بدأ الكلام في المقطع الجاري (وتسليم OpenAI عند السكوت)
    let at = sent;
    for (const f of vad.frames(pcm)) {
      if (f.speech && speechAt == null) speechAt = at / rate;
      if (engine === 'openai') {
        if (f.speech) {
          oa.speech += f.n;
          oa.silence = 0;
          if (oa.at == null) oa.at = at / rate;
        } else if (oa.speech) oa.silence += f.n;
      }
      at += f.n;
    }
    if (engine === 'openai') oa.buffered += pcm.length;
    sent += pcm.length;
    if (!ready) {
      backlog.push(pcm);
      let total = 0;
      for (let i = backlog.length - 1; i >= 0; i--) {
        total += backlog[i].length;
        if (total > rate * 20) {
          backlog = backlog.slice(i + 1);
          break;
        }
      }
      return;
    }
    sendAudio(pcm);
    if (engine === 'openai') {
      // سكوتٌ بعد كلام (٠٫٦ ثانية)، أو مقطعٌ طال (١٤ ثانية): يُسلَّم
      if ((oa.speech > rate * 0.8 && oa.silence > rate * 0.6) || oa.buffered > rate * 14) commitOpenAi();
      else if (!oa.speech && oa.buffered > rate * 6) {
        send({ type: 'input_audio_buffer.clear' });
        oa.buffered = 0;
      }
    }
  }
  function commitOpenAi() {
    if (!oa.buffered) return;
    if (!oa.speech) {
      send({ type: 'input_audio_buffer.clear' });
      oa.buffered = 0;
      return;
    }
    oa.order.push({ seg, at: oa.at != null ? oa.at : speechAt });
    seg++;
    speechAt = null;
    send({ type: 'input_audio_buffer.commit' });
    oa.speech = 0;
    oa.silence = 0;
    oa.buffered = 0;
    oa.at = null;
  }
  /** الإيقاف أو القفز: يُتمّ ما سُمع */
  function flush() {
    if (closed || !ready) return;
    if (engine === 'openai') return commitOpenAi();
    if (engine === 'soniox') return send({ type: 'finalize' });
    if (engine === 'elevenlabs') return send({ message_type: 'input_audio_chunk', audio_base_64: '', commit: true, sample_rate: rate });
    if (engine === 'gemini') return send({ realtimeInput: { audioStreamEnd: true } });
  }
  function close(silent = false) {
    if (closed) return;
    if (!silent) flush();
    closed = true;
    clearInterval(keepT);
    clearInterval(idleT);
    clearTimeout(geminiT);
    const w = ws;
    setTimeout(() => {
      try {
        if (w && w.readyState === 1) {
          if (engine === 'soniox') w.send('');
          w.close(1000, 'done');
        }
      } catch {}
      status('closed');
    }, silent ? 0 : 1500);
  }
  connect();
  if (engine === 'gemini') {
    const renew = () => {
      geminiT = setTimeout(() => {
        flush();
        setTimeout(reopen, 900);
        renew();
      }, 9 * 60 * 1000);
    };
    renew();
  }
  return {
    engine,
    model: E.model,
    rate,
    label: E.label,
    quran: cfg.quran !== false,
    save: cfg.save !== false,
    push,
    flush,
    close: () => close(false),
  };
}

/** فحص المفتاح: اتصالٌ قصير يُرسل فيه نصف ثانية من الصمت ← { ok, message } */
export function testStt(engine) {
  return new Promise((resolve) => {
    let s = null;
    const done = (r) => {
      clearTimeout(t);
      try {
        s && s.close();
      } catch {}
      resolve(r);
    };
    const t = setTimeout(() => done({ ok: false, message: 'لم تُجب الخدمة في ١٢ ثانية' }), 12000);
    try {
      s = openStt({
        engine,
        onEvent: (ev) => {
          if (ev.type === 'ready') {
            s.push(new Int16Array(s.rate / 2));
            setTimeout(() => done({ ok: true, message: `تمّ الاتصال بـ${STT_ENGINES[s.engine].label} (${s.model})` }), 700);
          }
          if (ev.type === 'error') done({ ok: false, message: ev.message });
        },
      });
    } catch (e) {
      done({ ok: false, message: e.message });
    }
  });
}
