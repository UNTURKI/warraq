// وحدة الذكاء الاصطناعي — ميزة مساندة فقط، ولا تختص بمزوّد واحد.
// تقبل أي مفتاح (Gemini، Claude، OpenAI، DeepSeek، OpenRouter، Groq، Mistral، xAI… أو أي خدمة متوافقة مع OpenAI بعنوان مخصص).
// المزوّدون سلسلة مرتبة: يُجرَّب الأول، فإن تعذّر فالتالي، ثم الخوارزمية الثابتة. المستخدم لا يرى أي خطأ أبداً.
// Isolated: this is the ONLY module that talks to AI services, and only when the owner enables it.
import crypto from 'node:crypto';
import { getConfig, setConfig, encrypt, decrypt } from './store.js';

const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS || 20000);
const CHAIN_BUDGET_MS = Number(process.env.AI_CHAIN_BUDGET_MS || 45000);
export const BOOK_TYPES = ['matn', 'sharh', 'hashiya', 'sharh_and_hashiya', 'tafsir'];

/* ================================================================ المزوّدون */
// api: صيغة الطلب — gemini | anthropic | openai (أي خدمة متوافقة مع OpenAI)
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    api: 'gemini',
    baseUrl: process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    // AIza: المفاتيح القديمة — AQ.: صيغة Google AI Studio الجديدة (تعمل على الواجهة الأصلية فقط)
    prefixes: ['AIza', 'AQ.'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    label: 'Anthropic Claude',
    api: 'anthropic',
    baseUrl: process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com',
    model: 'claude-haiku-4-5',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
    prefixes: ['sk-ant-'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    label: 'OpenAI',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini', 'gpt-5-mini'],
    prefixes: ['sk-proj-', 'sk-svcacct-', 'sk-admin-'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  openrouter: { label: 'OpenRouter', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', models: ['google/gemini-2.5-flash', 'openai/gpt-4.1-mini', 'anthropic/claude-haiku-4.5', 'deepseek/deepseek-chat'], prefixes: ['sk-or-'], keyUrl: 'https://openrouter.ai/keys' },
  deepseek: { label: 'DeepSeek', api: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'], prefixes: [], keyUrl: 'https://platform.deepseek.com/api_keys' },
  groq: { label: 'Groq', api: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'], prefixes: ['gsk_'], keyUrl: 'https://console.groq.com/keys' },
  xai: { label: 'xAI Grok', api: 'openai', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini', models: ['grok-3-mini', 'grok-4'], prefixes: ['xai-'], keyUrl: 'https://console.x.ai' },
  mistral: { label: 'Mistral', api: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-large-latest'], prefixes: [], keyUrl: 'https://console.mistral.ai/api-keys' },
  cohere: { label: 'Cohere', api: 'openai', baseUrl: 'https://api.cohere.ai/compatibility/v1', model: 'command-a-03-2025', models: ['command-a-03-2025', 'command-r-plus'], prefixes: [], keyUrl: 'https://dashboard.cohere.com/api-keys' },
  together: { label: 'Together AI', api: 'openai', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', models: [], prefixes: ['tgp_'], keyUrl: 'https://api.together.ai/settings/api-keys' },
  fireworks: { label: 'Fireworks', api: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', models: [], prefixes: ['fw_'], keyUrl: 'https://fireworks.ai/account/api-keys' },
  cerebras: { label: 'Cerebras', api: 'openai', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', models: [], prefixes: ['csk-'], keyUrl: 'https://cloud.cerebras.ai' },
  perplexity: { label: 'Perplexity', api: 'openai', baseUrl: 'https://api.perplexity.ai', model: 'sonar', models: ['sonar', 'sonar-pro'], prefixes: ['pplx-'], keyUrl: 'https://www.perplexity.ai/settings/api' },
  huggingface: { label: 'Hugging Face', api: 'openai', baseUrl: 'https://router.huggingface.co/v1', model: 'meta-llama/Llama-3.3-70B-Instruct', models: [], prefixes: ['hf_'], keyUrl: 'https://huggingface.co/settings/tokens' },
  nvidia: { label: 'NVIDIA NIM', api: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.3-70b-instruct', models: [], prefixes: ['nvapi-'], keyUrl: 'https://build.nvidia.com' },
  custom: { label: 'خدمة متوافقة مع OpenAI (عنوان مخصص)', api: 'openai', baseUrl: '', model: '', models: [], prefixes: [], custom: true },
};
// المفاتيح المبدوءة بـ sk- فقط قد تكون لأكثر من مزوّد
const SK_CANDIDATES = ['openai', 'deepseek'];
// مزوّدون بلا بادئة مميزة: يُفحصون عند طلب «جرّب كل المزوّدين»
const NO_PREFIX = ['gemini', 'anthropic', 'openai', 'deepseek', 'mistral', 'cohere', 'together'];

/** وصف المزوّدين للوحة التحكم */
export function providerKinds() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, api: p.api, baseUrl: p.baseUrl, model: p.model, models: p.models, prefixes: p.prefixes, keyUrl: p.keyUrl || '', custom: !!p.custom }));
}

/** التعرّف على المزوّد من بداية المفتاح */
export function detectKind(key) {
  const k = String(key || '');
  let best = null;
  for (const [id, p] of Object.entries(PROVIDERS)) for (const pre of p.prefixes) if (k.startsWith(pre) && (!best || pre.length > best.pre.length)) best = { id, pre };
  if (best) return { kind: best.id, candidates: [best.id], ambiguous: false };
  if (k.startsWith('sk-')) return { kind: 'openai', candidates: SK_CANDIDATES, ambiguous: true };
  return { kind: '', candidates: [], ambiguous: true };
}

/* ================================================================ تنظيف المدخلات */
const httpErr = (status, message) => Object.assign(new Error(message), { status });

/** أي مفتاح مقبول مهما كانت بدايته: تُحذف المسافات والأسطر وعلامات التنصيص وكلمة Bearer إن لُصقت معه */
export function cleanKey(raw) {
  let k = String(raw ?? '').trim().replace(/^(bearer|authorization:)\s+/i, '').replace(/^["'`]+|["'`]+$/g, '');
  k = k.replace(/\s+/g, '');
  if (k.length > 4000) throw httpErr(400, 'المفتاح طويل جداً');
  if (k && !/^[\x21-\x7e]+$/.test(k)) throw httpErr(400, 'المفتاح يحتوي أحرفاً غير صالحة (تأكد أنك نسخته كاملاً دون أحرف عربية)');
  return k;
}
export function cleanBaseUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    throw httpErr(400, 'عنوان الخدمة غير صالح (مثال: https://example.com/v1)');
  }
  if (!/^https?:$/.test(u.protocol)) throw httpErr(400, 'عنوان الخدمة يجب أن يبدأ بـ http أو https');
  return u.toString().replace(/\/+$/, '');
}
export function cleanModel(raw) {
  const m = String(raw ?? '').trim().replace(/^models\//, '');
  if (!m) return '';
  if (!/^[\w.\-:/@+]{1,160}$/.test(m)) throw httpErr(400, 'اسم النموذج غير صالح');
  return m;
}
const cleanLabel = (s) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);

/* ================================================================ حالة كل مزوّد (في الذاكرة) */
const states = new Map();
const today = () => new Date().toISOString().slice(0, 10);
function st(id) {
  let s = states.get(id);
  if (!s || s.day !== today()) {
    s = { day: today(), calls: 0, ok: 0, fails: 0, pausedUntil: s?.pausedUntil || 0, pauseReason: s?.pauseReason || '', consecutiveFails: 0, lastError: s?.lastError || '', lastDetail: s?.lastDetail || '', lastErrorAt: s?.lastErrorAt || null, lastOkAt: s?.lastOkAt || null, lastMs: s?.lastMs || 0 };
    states.set(id, s);
  }
  return s;
}
const log = []; // آخر الأحداث
function addLog(e) {
  log.unshift({ at: new Date().toISOString(), ...e });
  if (log.length > 60) log.length = 60;
}
export const aiLog = (scope) => (scope ? log.filter((e) => (e.scope || 'typeset') === scope) : log.slice());
const cache = new Map(); // bookId → { at, data, provider }
const CACHE_TTL = 24 * 3600e3;

function nextPacificMidnight() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date())
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, +p.value]),
  );
  const since = (((parts.hour % 24) * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Date.now() + 24 * 3600e3 - since + 60e3;
}

/* ================================================================ الأقسام: لكلٍّ سلسلته */
// التنضيد (استخراج بيانات الكتاب، كما كان)، والمحرِّر (المساعد)، والرَّحل. والمفتاح يُكتب في قسمٍ ويُستعمل في غيره بالإشارة إليه (ref).
export const SCOPES = {
  typeset: { key: 'aiProviders', label: 'التنضيد' },
  editor: { key: 'aiEditorProviders', label: 'المحرِّر' },
  rahl: { key: 'aiRahlProviders', label: 'الرَّحل' },
};
export const scopeOf = (s) => (SCOPES[s] ? s : 'typeset');
const rawList = (scope) => getConfig()[SCOPES[scope].key] || [];
/** مزوّدٌ بمفتاحه (لا إشارة) في أي قسم */
function findRaw(id) {
  for (const sc of Object.keys(SCOPES)) {
    const p = rawList(sc).find((x) => x.id === id && !x.ref);
    if (p) return { p, scope: sc };
  }
  return null;
}

/* ================================================================ المزوّدون المحفوظون */
const newId = () => crypto.randomBytes(6).toString('hex');

/** المزوّدون بمفاتيحهم (للخادم فقط) — بالترتيب */
export function resolvedProviders(scope = 'typeset') {
  scope = scopeOf(scope);
  const c = getConfig();
  const list = rawList(scope).map((e) => {
    // مفتاحٌ من قسمٍ آخر: بياناته من هناك، ونموذجه وتفعيله واسمه من هنا
    let p = e;
    let refScope = '';
    if (e.ref) {
      const f = findRaw(e.ref);
      if (!f) return null;
      refScope = f.scope;
      p = { ...f.p, id: e.id, enabled: e.enabled, model: e.model || f.p.model, label: e.label || f.p.label };
    }
    const def = PROVIDERS[p.kind] || PROVIDERS.custom;
    const host = (() => {
      try {
        return new URL(p.baseUrl).host;
      } catch {
        return '';
      }
    })();
    return { ...p, ref: e.ref || '', refScope, api: def.api, label: p.label || (def.custom && host) || def.label, kindLabel: def.label, baseUrl: p.baseUrl || def.baseUrl, model: p.model || def.model, key: p.keyEnc ? decrypt(p.keyEnc) : '' };
  }).filter(Boolean);
  // مفاتيح من متغيرات البيئة (للخوادم): AI_API_KEY [+ AI_PROVIDER, AI_BASE_URL, AI_MODEL] أو GEMINI_API_KEY
  const envKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
  if (envKey && scope === 'typeset') {
    const kind = process.env.AI_API_KEY ? process.env.AI_PROVIDER || detectKind(envKey).kind || 'custom' : 'gemini';
    const def = PROVIDERS[kind] || PROVIDERS.custom;
    list.push({
      id: 'env',
      kind,
      api: def.api,
      label: 'من متغيرات البيئة',
      kindLabel: def.label,
      baseUrl: (process.env.AI_API_KEY && process.env.AI_BASE_URL) || def.baseUrl,
      model: (process.env.AI_API_KEY && process.env.AI_MODEL) || (!process.env.AI_API_KEY && c.aiModel) || def.model,
      key: envKey,
      enabled: true,
      fromEnv: true,
    });
  }
  return list;
}

const mask = (k) => (k ? (k.length > 12 ? k.slice(0, Math.min(6, k.indexOf('-') > 0 ? k.indexOf('-') + 1 : 4)) : '') + '••••' + k.slice(-4) : '');

/** ما يُعرض في اللوحة (لا مفاتيح) */
export function publicProviders(scope = 'typeset') {
  scope = scopeOf(scope);
  return resolvedProviders(scope).map((p) => {
    const s = st(p.id);
    return {
      id: p.id,
      kind: p.kind,
      kindLabel: p.kindLabel,
      label: p.label,
      customLabel: !!rawList(scope).find((x) => x.id === p.id && x.label),
      ref: p.ref || '',
      refScope: p.refScope || '',
      refScopeLabel: p.refScope ? SCOPES[p.refScope].label : '',
      usedIn: p.ref ? [] : Object.keys(SCOPES).filter((sc) => sc !== scope && rawList(sc).some((x) => x.ref === p.id)).map((sc) => SCOPES[sc].label),
      baseUrl: p.baseUrl,
      model: p.model,
      enabled: p.enabled !== false,
      hasKey: !!p.key,
      keyMasked: mask(p.key),
      fromEnv: !!p.fromEnv,
      state: { ...s, pausedUntil: s.pausedUntil > Date.now() ? new Date(s.pausedUntil).toISOString() : null },
    };
  });
}

async function saveProviders(fn, scope = 'typeset') {
  scope = scopeOf(scope);
  const cur = rawList(scope);
  const next = fn(cur.map((p) => ({ ...p })));
  await setConfig({ [SCOPES[scope].key]: next, ...(scope === 'typeset' ? { geminiKeyEnc: '' } : {}) });
  return next;
}

/** مفاتيح الأقسام الأخرى (ليُستعمل أحدها هنا دون نسخه) */
export function reusableProviders(scope) {
  scope = scopeOf(scope);
  const here = new Set(rawList(scope).map((x) => x.ref || x.id));
  const out = [];
  for (const sc of Object.keys(SCOPES)) {
    if (sc === scope) continue;
    for (const p of resolvedProviders(sc)) if (!p.ref && !p.fromEnv && !here.has(p.id)) out.push({ id: p.id, label: p.label, kindLabel: p.kindLabel, model: p.model, scope: sc, scopeLabel: SCOPES[sc].label, keyMasked: mask(p.key) });
  }
  return out;
}

export async function addProvider(input, scope = 'typeset') {
  scope = scopeOf(scope);
  if (input.ref) {
    const f = findRaw(String(input.ref));
    if (!f) throw httpErr(404, 'المفتاح المختار غير موجود');
    if (rawList(scope).some((x) => x.ref === f.p.id || x.id === f.p.id)) throw httpErr(409, 'هذا المفتاح في هذا القسم من قبل');
    const e = { id: newId(), ref: f.p.id, model: cleanModel(input.model), label: cleanLabel(input.label), enabled: true, createdAt: new Date().toISOString() };
    await saveProviders((l) => [...l, e], scope);
    return publicProviders(scope).find((x) => x.id === e.id);
  }
  const key = cleanKey(input.key);
  let kind = String(input.kind || '');
  if (kind && !PROVIDERS[kind]) throw httpErr(400, 'مزوّد غير معروف');
  const baseUrl = cleanBaseUrl(input.baseUrl);
  if (!kind) kind = detectKind(key).kind || (baseUrl ? 'custom' : '');
  if (!kind) throw httpErr(400, 'لم نتعرف على المزوّد من بداية المفتاح. اختر المزوّد من «خيارات متقدمة»، أو اضغط «تعرّف تلقائياً»، أو ضع عنوان الخدمة.');
  if (PROVIDERS[kind].custom && !baseUrl) throw httpErr(400, 'ضع عنوان الخدمة (Base URL) للمزوّد المخصص');
  if (!key && !PROVIDERS[kind].custom) throw httpErr(400, 'الصق المفتاح أولاً');
  const p = { id: newId(), kind, label: cleanLabel(input.label), baseUrl: baseUrl && baseUrl !== PROVIDERS[kind].baseUrl ? baseUrl : '', model: cleanModel(input.model), keyEnc: key ? encrypt(key) : '', enabled: true, createdAt: new Date().toISOString() };
  await saveProviders((l) => [...l, p], scope);
  return publicProviders(scope).find((x) => x.id === p.id);
}

export async function updateProvider(id, b, scope = 'typeset') {
  scope = scopeOf(scope);
  let found = false;
  await saveProviders((l) =>
    l.map((p) => {
      if (p.id !== id) return p;
      found = true;
      const q = { ...p };
      if (typeof b.enabled === 'boolean') q.enabled = b.enabled;
      if (b.model !== undefined) q.model = cleanModel(b.model);
      if (b.label !== undefined) q.label = cleanLabel(b.label);
      if (q.ref) {
        // (المفتاح المشار إليه يُعدَّل في قسمه)
        if ((typeof b.key === 'string' && b.key.trim()) || b.baseUrl !== undefined || b.kind !== undefined) throw httpErr(400, 'هذا المفتاح من قسمٍ آخر: غيّر مفتاحه أو عنوانه هناك');
        return q;
      }
      if (b.baseUrl !== undefined) {
        const u = cleanBaseUrl(b.baseUrl);
        if (!u && PROVIDERS[q.kind]?.custom) throw httpErr(400, 'عنوان الخدمة مطلوب للمزوّد المخصص');
        q.baseUrl = u === PROVIDERS[q.kind]?.baseUrl ? '' : u;
      }
      if (b.kind !== undefined) {
        if (!PROVIDERS[b.kind]) throw httpErr(400, 'مزوّد غير معروف');
        q.kind = b.kind;
      }
      if (typeof b.key === 'string' && b.key.trim()) q.keyEnc = encrypt(cleanKey(b.key));
      return q;
    }),
  scope);
  if (!found) throw httpErr(404, 'المزوّد غير موجود');
  resetAiState(id);
  return publicProviders(scope).find((x) => x.id === id);
}

export async function deleteProvider(id, scope = 'typeset') {
  scope = scopeOf(scope);
  const own = rawList(scope).find((x) => x.id === id);
  // مفتاحٌ يُستعمل في قسمٍ آخر: يبقى هناك نسخةً منه (لا تنقطع السلسلة)
  if (own && !own.ref) {
    for (const sc of Object.keys(SCOPES)) {
      if (sc === scope || !rawList(sc).some((x) => x.ref === id)) continue;
      await saveProviders((l) => l.map((x) => (x.ref === id ? { ...own, id: x.id, enabled: x.enabled, model: x.model || own.model, label: x.label || own.label } : x)), sc);
    }
  }
  await saveProviders((l) => l.filter((p) => p.id !== id), scope);
  states.delete(id);
}

export async function reorderProviders(ids, scope = 'typeset') {
  await saveProviders((l) => {
    const pos = new Map(ids.map((id, i) => [id, i]));
    return [...l].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
  }, scope);
}

/* ================================================================ الاتصال */
/** طلب Gemini: بالترويسة x-goog-api-key أولاً، فإن رُفض (401/403) أُعيد بالمعامل ?key= (بعض المفاتيح تقبل إحداهما فقط) */
async function gemJson(p, url, opts = {}) {
  try {
    return await httpJson(url, { ...opts, headers: authHeaders(p) });
  } catch (e) {
    if (e.status !== 401 && e.status !== 403) throw e;
    try {
      return await httpJson(url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(p.key), opts);
    } catch (e2) {
      throw e2.status === 401 || e2.status === 403 || e2.status === 404 || e2.status === 400 ? e : e2;
    }
  }
}

async function httpJson(url, { method = 'GET', headers = {}, body, timeout = TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await fetch(url, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    const err = new Error(e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout' : 'network');
    err.kind = err.message;
    err.detail = e.cause?.code || e.cause?.message || e.message || '';
    throw err;
  }
  const text = await res.text();
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const e = new Error('HTTP ' + res.status);
    e.status = res.status;
    const er = j && (j.error || j);
    e.detail = String((er && (er.message || er.msg || er.detail || (typeof er === 'string' ? er : ''))) || (j && j.message) || text || '').slice(0, 500);
    e.retryAfter = +res.headers.get('retry-after') || 0;
    throw e;
  }
  if (j === null) {
    const e = new Error('non-json');
    e.kind = 'bad';
    e.detail = text.slice(0, 200);
    throw e;
  }
  return j;
}

const authHeaders = (p) =>
  p.api === 'gemini'
    ? { 'x-goog-api-key': p.key }
    : p.api === 'anthropic'
      ? { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' }
      : { ...(p.key ? { authorization: 'Bearer ' + p.key } : {}), ...(p.kind === 'openrouter' ? { 'x-title': 'Al-Warraq' } : {}) };

/** قائمة النماذج المتاحة للمفتاح (تُستعمل أيضاً للتحقق من صحة المفتاح بسرعة) */
export async function listModels(p, timeout = 12000) {
  const base = p.baseUrl.replace(/\/+$/, '');
  if (p.api === 'gemini') {
    const j = await gemJson(p, `${base}/v1beta/models?pageSize=1000`, { timeout });
    return (j.models || [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  if (p.api === 'anthropic') {
    const j = await httpJson(`${base}/v1/models?limit=1000`, { headers: authHeaders(p), timeout });
    return (j.data || []).map((m) => m.id).filter(Boolean);
  }
  const j = await httpJson(`${base}/models`, { headers: authHeaders(p), timeout });
  const arr = Array.isArray(j) ? j : j.data || j.models || [];
  return arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean).slice(0, 600);
}

/* ---------------- الطلب ---------------- */
const FIELDS = {
  main_title: 'العنوان الرئيسي للكتاب دون العنوان الفرعي ودون الطبعة أو الدار',
  sub_title: 'العنوان الفرعي إن وجد، وإلا نص فارغ',
  book_type: 'واحد من: matn (متن أصلي) أو sharh (شرح) أو hashiya (حاشية) أو sharh_and_hashiya (شرح عليه حاشية) أو tafsir (تفسير للقرآن: آيات ثم تفسيرها)',
  author_title: 'لقب التكريم في كلمة أو كلمتين مثل: شيخ الإسلام، الإمام، الحافظ، العلامة — أو نص فارغ',
  author_short: 'اسم الشهرة المختصر للمؤلف في كلمتين بدقة مثل: ابن تيمية، ابن عثيمين، النووي',
  editor_name: 'اسم المحقق أو المعتني إن وجد، وإلا نص فارغ',
};
const SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(Object.entries(FIELDS).map(([k, d]) => [k, k === 'book_type' ? { type: 'STRING', enum: BOOK_TYPES, description: d } : { type: 'STRING', description: d }])),
  required: Object.keys(FIELDS),
  propertyOrdering: Object.keys(FIELDS),
};
const SYSTEM = [
  'أنت مفهرس خبير في كتب التراث العربي والإسلامي.',
  'استخرج بيانات الغلاف من بطاقة الكتاب المعطاة فقط، ولا تخترع معلومة غير موجودة أو غير مشهورة.',
  'main_title: العنوان بلا طبعة ولا اسم دار. sub_title: ما بعد «=» أو الشرطة إن كان عنواناً فرعياً.',
  'author_short: كلمتان فقط (مثل «ابن تيمية»، «ابن حجر»). «الإمام النووي» غير مقبول لأن اللقب منفصل؛ الصحيح «النووي».',
  'author_title: لقب واحد مختصر أو نص فارغ. editor_name: اسم المحقق كما في البطاقة أو نص فارغ.',
  'أعد كائن JSON واحداً فقط بهذه المفاتيح بالضبط، دون أي شرح أو علامات Markdown:',
  JSON.stringify(Object.fromEntries(Object.entries(FIELDS).map(([k, d]) => [k, d])), null, 0),
].join('\n');

function cardPrompt(card) {
  return [`اسم الكتاب في المكتبة: ${card.name || ''}`, card.authorName ? `اسم المؤلف المختصر في المكتبة: ${card.authorName}` : '', 'بطاقة الكتاب:', String(card.info || '').slice(0, 3000)]
    .filter(Boolean)
    .join('\n');
}

/** طلب واحد إلى مزوّد. minimal: أبسط صيغة (عند رفض المعاملات الإضافية ببعض النماذج) */
async function callOnce(p, prompt, timeout, minimal) {
  const base = p.baseUrl.replace(/\/+$/, '');
  if (!base) throw Object.assign(new Error('no base url'), { kind: 'config', detail: 'عنوان الخدمة غير مضبوط' });
  if (p.api === 'gemini') {
    const gc = { responseMimeType: 'application/json', maxOutputTokens: 4096 };
    if (!minimal) {
      gc.temperature = 0.1;
      gc.responseSchema = SCHEMA;
      if (/flash/i.test(p.model)) gc.thinkingConfig = { thinkingBudget: 0 };
    }
    const j = await gemJson(p, `${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: 'POST',
      body: { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: gc },
      timeout,
    });
    if (j.promptFeedback?.blockReason) throw Object.assign(new Error('blocked'), { kind: 'bad', detail: 'blocked: ' + j.promptFeedback.blockReason });
    return (j.candidates?.[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
  }
  if (p.api === 'anthropic') {
    const body = { model: p.model, max_tokens: 1024, system: SYSTEM, messages: [{ role: 'user', content: prompt }] };
    if (!minimal) body.temperature = 0.1;
    const j = await httpJson(`${base}/v1/messages`, { method: 'POST', headers: authHeaders(p), body, timeout });
    return (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  }
  const body = { model: p.model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] };
  if (!minimal) {
    body.response_format = { type: 'json_object' };
    body.temperature = 0.1;
  }
  const j = await httpJson(`${base}/chat/completions`, { method: 'POST', headers: authHeaders(p), body, timeout });
  const c = j.choices?.[0]?.message?.content;
  return Array.isArray(c) ? c.map((x) => x.text || '').join('') : String(c || '');
}

async function call(p, prompt, timeout) {
  if (!p.model) throw Object.assign(new Error('no model'), { kind: 'config', detail: 'اسم النموذج غير مضبوط' });
  const t0 = Date.now();
  try {
    return await callOnce(p, prompt, timeout, false);
  } catch (e) {
    // بعض النماذج ترفض معاملات مثل temperature أو response_format أو thinkingConfig: نعيد بأبسط صيغة
    if ((e.status === 400 || e.status === 422) && Date.now() - t0 < timeout - 1000) return callOnce(p, prompt, timeout - (Date.now() - t0), true);
    throw e;
  }
}

/* ================================================================ المحادثة (المحرِّر والرَّحل): نصٌّ حرّ أو JSON */
/** طلبٌ واحد بتوجيه نظامٍ ورسائل ← نص الرد */
async function chatOnce(p, o, timeout, minimal) {
  const base = p.baseUrl.replace(/\/+$/, '');
  if (!base) throw Object.assign(new Error('no base url'), { kind: 'config', detail: 'عنوان الخدمة غير مضبوط' });
  const msgs = o.messages && o.messages.length ? o.messages : [{ role: 'user', content: o.user || '' }];
  const max = o.max || 4096;
  if (p.api === 'gemini') {
    const gc = { maxOutputTokens: max };
    if (!minimal) {
      gc.temperature = o.temperature ?? 0.2;
      if (o.json) gc.responseMimeType = 'application/json';
      if (/flash/i.test(p.model) && !/pro/i.test(p.model)) gc.thinkingConfig = { thinkingBudget: 0 };
    }
    const j = await gemJson(p, `${base}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
      method: 'POST',
      body: { ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}), contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: gc },
      timeout,
    });
    if (j.promptFeedback?.blockReason) throw Object.assign(new Error('blocked'), { kind: 'bad', detail: 'blocked: ' + j.promptFeedback.blockReason });
    const cand = j.candidates?.[0];
    const out = (cand?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
    if (!out && cand?.finishReason) throw Object.assign(new Error('empty'), { kind: 'bad', detail: 'finishReason: ' + cand.finishReason });
    return out;
  }
  if (p.api === 'anthropic') {
    const body = { model: p.model, max_tokens: max, ...(o.system ? { system: o.system } : {}), messages: msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) };
    if (!minimal) body.temperature = o.temperature ?? 0.2;
    const j = await httpJson(`${base}/v1/messages`, { method: 'POST', headers: authHeaders(p), body, timeout });
    return (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
  }
  const body = { model: p.model, messages: [...(o.system ? [{ role: 'system', content: o.system }] : []), ...msgs.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))] };
  if (!minimal) {
    if (o.json) body.response_format = { type: 'json_object' };
    body.temperature = o.temperature ?? 0.2;
    body.max_tokens = max;
  }
  const j = await httpJson(`${base}/chat/completions`, { method: 'POST', headers: authHeaders(p), body, timeout });
  const c = j.choices?.[0]?.message?.content;
  return Array.isArray(c) ? c.map((x) => x.text || '').join('') : String(c || '');
}
async function chatCall(p, o, timeout) {
  if (!p.model) throw Object.assign(new Error('no model'), { kind: 'config', detail: 'اسم النموذج غير مضبوط' });
  const t0 = Date.now();
  try {
    return await chatOnce(p, o, timeout, false);
  } catch (e) {
    if ((e.status === 400 || e.status === 422) && Date.now() - t0 < timeout - 1000) return chatOnce(p, o, timeout - (Date.now() - t0), true);
    throw e;
  }
}
/** ما يُرسل في السجل من طلب المحادثة */
const chatTag = (o) => String(o.tag || 'محادثة').slice(0, 40);
/**
 * محادثةٌ عبر سلسلة القسم: يُجرَّب الأول، فإن تعذّر فالتالي.
 * o: { system, user | messages:[{role,content}], json, max, temperature, timeout, only, tag }
 * ← { text, data (إن json), provider, model, ms, trail } أو خطأ فيه trail
 */
export async function aiChat(scope, o = {}) {
  scope = scopeOf(scope);
  const trail = [];
  let list = resolvedProviders(scope).filter((p) => (o.only ? p.id === o.only : p.enabled !== false));
  // مصادر المعرفة: الذكاء الاصطناعي المختار لهذه المهمة أولاً (من أي قسم)، ثم سلسلة القسم احتياطاً
  const pref = preferredProvider(o.prefer);
  if (pref && !o.only) list = [pref, ...list.filter((p) => p.id !== pref.id && (p.ref || p.id) !== (pref.ref || pref.id))];
  if (!list.length) throw Object.assign(httpErr(409, 'لا مفاتيح في قسم ' + SCOPES[scope].label + ': أضف مفتاحاً من الإعدادات ← الذكاء الاصطناعي'), { reason: 'no-key', trail });
  const timeout = Math.min(Math.max(+o.timeout || 90000, 5000), 300000);
  for (const p of list) {
    const s = st(p.id);
    if (!o.only && s.pausedUntil > Date.now()) {
      trail.push({ id: p.id, label: p.label, skipped: true, error: 'متوقف مؤقتاً: ' + s.pauseReason });
      continue;
    }
    s.calls++;
    const t0 = Date.now();
    try {
      const text = await chatCall(p, o, timeout);
      if (!String(text || '').trim()) throw Object.assign(new Error('empty'), { kind: 'bad', detail: 'رد فارغ' });
      let data;
      if (o.json) {
        data = parseJsonLoose(text);
        if (data == null) throw Object.assign(new Error('bad'), { kind: 'bad', detail: 'لم يُعد JSON: ' + String(text).slice(0, 200) });
      }
      const ms = Date.now() - t0;
      Object.assign(s, { ok: s.ok + 1, consecutiveFails: 0, lastOkAt: new Date().toISOString(), lastMs: ms, pausedUntil: 0, pauseReason: '' });
      trail.push({ id: p.id, label: p.label, ok: true, ms });
      addLog({ scope, provider: p.label, model: p.model, task: chatTag(o), ok: true, ms });
      return { text: String(text), ...(o.json ? { data } : {}), provider: p.label, model: p.model, ms, trail };
    } catch (e) {
      const ms = Date.now() - t0;
      const c = classify(e, p);
      s.fails++;
      s.consecutiveFails++;
      s.lastError = c.msg;
      s.lastDetail = e.detail || '';
      s.lastErrorAt = new Date().toISOString();
      if (c.pauseUntil) {
        s.pausedUntil = c.pauseUntil;
        s.pauseReason = c.msg;
      } else if (c.breaker && s.consecutiveFails >= 3) {
        s.pausedUntil = Date.now() + 5 * 60e3;
        s.pauseReason = 'أخطاء متتالية';
      }
      trail.push({ id: p.id, label: p.label, ok: false, ms, error: c.msg, detail: e.detail || '' });
      addLog({ scope, provider: p.label, model: p.model, task: chatTag(o), ok: false, ms, error: c.msg, detail: e.detail || '' });
    }
  }
  const last = trail.filter((t) => !t.ok).pop();
  throw Object.assign(httpErr(502, last ? last.error : 'كل المزوّدين متوقفون مؤقتاً'), { reason: 'all-failed', trail });
}

/** «القسم:المعرّف» (أو {scope, id}) ← المزوّد بمفتاحه إن كان مفعّلاً، وإلا null */
export function preferredProvider(ref) {
  if (!ref) return null;
  let scope;
  let id;
  if (typeof ref === 'string') [scope, id] = ref.split(':');
  else ({ scope, id } = ref);
  if (!SCOPES[scope] || !id) return null;
  const p = resolvedProviders(scope).find((x) => x.id === id);
  return p && p.enabled !== false ? p : null;
}
/** كل مزوّدي الذكاء الاصطناعي في الأقسام كلها (لاختيار واحدٍ لمهمة): بلا مفاتيح */
export function allProvidersBrief() {
  const out = [];
  for (const sc of Object.keys(SCOPES))
    for (const p of resolvedProviders(sc)) if (!p.fromEnv) out.push({ value: sc + ':' + p.id, scope: sc, scopeLabel: SCOPES[sc].label, label: p.label, kindLabel: p.kindLabel, model: p.model, enabled: p.enabled !== false, ref: !!p.ref });
  return out;
}

/** استخراج JSON من رد قد يحوي تفكيراً أو علامات Markdown */
export function parseJsonLoose(text) {
  let s = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(s);
  } catch {}
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {}
  }
  return null;
}

const cleanStr = (v, max = 200) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/^[\s"'«»()[\]]+|[\s"'«»()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, max);
const words = (s) => s.split(' ').filter(Boolean).length;

/** التحقق الصارم من الرد: أي حقل غير صالح يُترك فارغاً لتملأه الخوارزمية */
export function validateAi(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const bt = String(obj.book_type || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const out = {
    main_title: cleanStr(obj.main_title, 250),
    sub_title: cleanStr(obj.sub_title, 250),
    book_type: BOOK_TYPES.includes(bt) ? bt : bt === 'hashia' || bt === 'hashiyah' ? 'hashiya' : '',
    author_title: cleanStr(obj.author_title, 40),
    author_short: cleanStr(obj.author_short, 60),
    editor_name: cleanStr(obj.editor_name, 200),
  };
  if (!out.main_title) return null;
  if (words(out.author_title) > 3) out.author_title = '';
  if (words(out.author_short) > 3) out.author_short = '';
  return out;
}

/* ---------------- تصنيف الأخطاء ---------------- */
const DAILY = /per.?day|perday|daily|RPD|requests per day/i;
function classify(e, p) {
  const d = e.detail || '';
  const s = e.status;
  if (s === 429) {
    if (DAILY.test(d)) return { msg: 'انتهت الحصة اليومية (429)', pauseUntil: p.api === 'gemini' ? nextPacificMidnight() : Date.now() + 3 * 3600e3 };
    if (/insufficient|billing|credit|balance|exceeded your current quota/i.test(d)) return { msg: 'نفد الرصيد أو الحصة (429)', pauseUntil: Date.now() + 3600e3 };
    return { msg: 'تجاوز عدد الطلبات المسموح (429)', pauseUntil: Date.now() + Math.min(Math.max(e.retryAfter || 60, 20), 3600) * 1000 };
  }
  if (/ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(d)) return { msg: 'Google لم يقبل المفتاح بهذه الصيغة (ACCESS_TOKEN_TYPE_UNSUPPORTED) — أنشئ مفتاحاً جديداً من Google AI Studio', pauseUntil: Date.now() + 10 * 60e3 };
  if (/SERVICE_DISABLED|has not been used in project|API_KEY_SERVICE_BLOCKED/i.test(d)) return { msg: 'واجهة Gemini غير مفعّلة لمشروع هذا المفتاح، أو المفتاح مقيّد بخدمات أخرى', pauseUntil: Date.now() + 10 * 60e3 };
  if (/API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|referer|referrer/i.test(d)) return { msg: 'المفتاح مقيّد بموقع أو عنوان IP آخر في إعدادات Google Cloud', pauseUntil: Date.now() + 10 * 60e3 };
  if (s === 401) return { msg: 'المفتاح غير صالح أو منتهٍ (401)', pauseUntil: Date.now() + 10 * 60e3 };
  if (s === 403) return { msg: 'المفتاح مرفوض أو لا يملك صلاحية لهذا النموذج (403)', pauseUntil: Date.now() + 10 * 60e3 };
  if (s === 402) return { msg: 'نفد الرصيد (402)', pauseUntil: Date.now() + 3600e3 };
  if (s === 404) return { msg: 'النموذج أو عنوان الخدمة غير موجود (404)', pauseUntil: Date.now() + 10 * 60e3 };
  if (s === 400 || s === 422) return { msg: `رفض المزوّد الطلب (${s})`, pauseUntil: Date.now() + 2 * 60e3 };
  if (s >= 500) return { msg: `خطأ في خوادم المزوّد (${s})`, breaker: true };
  if (e.kind === 'timeout') return { msg: 'انتهت المهلة دون رد', breaker: true };
  if (e.kind === 'network') return { msg: 'تعذّر الاتصال بالمزوّد', breaker: true };
  if (e.kind === 'config') return { msg: 'إعداد ناقص', pauseUntil: Date.now() + 10 * 60e3 };
  if (e.kind === 'bad') return { msg: 'ردّ غير صالح من النموذج', breaker: true };
  return { msg: 'خطأ غير متوقع', breaker: true };
}

/* ================================================================ الاستخراج عبر السلسلة */
/** هل توجد سلسلة جاهزة الآن؟ */
export function aiAvailable(scope = 'typeset') {
  scope = scopeOf(scope);
  const c = getConfig();
  if (!scopeEnabled(scope, c)) return { ok: false, reason: 'disabled' };
  const list = resolvedProviders(scope).filter((p) => p.enabled !== false);
  if (!list.length) return { ok: false, reason: 'no-key' };
  if (list.every((p) => st(p.id).pausedUntil > Date.now())) return { ok: false, reason: 'paused' };
  return { ok: true };
}

/**
 * يجرّب المزوّدين بالترتيب. لا يرمي خطأً أبداً.
 * @returns {{data: object|null, provider?: string, trail: object[], reason?: string}}
 */
export async function aiExtractTrace(card, { force = false, noCache = false, only } = {}) {
  const trail = [];
  if (!force && !getConfig().aiEnabled) return { data: null, trail, reason: 'disabled' };
  let list = resolvedProviders().filter((p) => (only ? p.id === only : p.enabled !== false));
  if (!list.length) return { data: null, trail, reason: 'no-key' };
  if (!noCache) {
    const hit = cache.get(card.id);
    if (hit && Date.now() - hit.at < CACHE_TTL) return { data: hit.data, provider: hit.provider, trail, cached: true };
  }
  const prompt = cardPrompt(card);
  const deadline = Date.now() + CHAIN_BUDGET_MS;
  for (const p of list) {
    const s = st(p.id);
    if (!force && s.pausedUntil > Date.now()) {
      trail.push({ id: p.id, label: p.label, skipped: true, error: 'متوقف مؤقتاً: ' + s.pauseReason });
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining < 1500) break;
    s.calls++;
    const t0 = Date.now();
    try {
      const text = await call(p, prompt, Math.min(TIMEOUT_MS, remaining));
      const data = validateAi(parseJsonLoose(text));
      if (!data) throw Object.assign(new Error('bad'), { kind: 'bad', detail: String(text).slice(0, 200) });
      const ms = Date.now() - t0;
      Object.assign(s, { ok: s.ok + 1, consecutiveFails: 0, lastOkAt: new Date().toISOString(), lastMs: ms, pausedUntil: 0, pauseReason: '' });
      trail.push({ id: p.id, label: p.label, ok: true, ms });
      addLog({ provider: p.label, model: p.model, bookId: card.id, ok: true, ms });
      if (card.id) {
        cache.set(card.id, { at: Date.now(), data, provider: p.label });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
      }
      return { data, provider: p.label, trail };
    } catch (e) {
      const ms = Date.now() - t0;
      const c = classify(e, p);
      s.fails++;
      s.consecutiveFails++;
      s.lastError = c.msg;
      s.lastDetail = e.detail || '';
      s.lastErrorAt = new Date().toISOString();
      if (c.pauseUntil) {
        s.pausedUntil = c.pauseUntil;
        s.pauseReason = c.msg;
      } else if (c.breaker && s.consecutiveFails >= 3) {
        s.pausedUntil = Date.now() + 5 * 60e3;
        s.pauseReason = 'أخطاء متتالية';
      }
      trail.push({ id: p.id, label: p.label, ok: false, ms, error: c.msg, detail: e.detail || '' });
      addLog({ provider: p.label, model: p.model, bookId: card.id, ok: false, ms, error: c.msg, detail: e.detail || '' });
    }
  }
  return { data: null, trail, reason: 'all-failed' };
}

/** للاستعمال العام: البيانات أو null */
export async function aiExtract(card) {
  try {
    return (await aiExtractTrace(card)).data;
  } catch {
    return null;
  }
}

/* ================================================================ أدوات اللوحة */
const SAMPLE = { id: 0, name: 'الأربعون النووية', info: 'الكتاب: الأربعون النووية\nالمؤلف: محيي الدين يحيى بن شرف النووي (ت ٦٧٦هـ)\nالمحقق: قصي محمد نورس الحلاق' };

/** بناء مزوّد مؤقت من مدخلات اللوحة (قبل الحفظ) */
export function draftProvider({ key, kind, baseUrl, model }) {
  const k = cleanKey(key);
  const kd = kind || detectKind(k).kind || (baseUrl ? 'custom' : '');
  if (!kd || !PROVIDERS[kd]) throw httpErr(400, 'لم نتعرف على المزوّد من بداية المفتاح. اختر المزوّد أو اضغط «تعرّف تلقائياً».');
  const def = PROVIDERS[kd];
  const u = cleanBaseUrl(baseUrl) || def.baseUrl;
  if (!u) throw httpErr(400, 'ضع عنوان الخدمة (Base URL)');
  return { id: 'draft', kind: kd, api: def.api, label: def.label, kindLabel: def.label, baseUrl: u, model: cleanModel(model) || def.model, key: k };
}

/** اختبار مزوّد: استخراج فعلي لكتاب نموذجي (التنضيد)، أو سؤالٌ قصير (المحرِّر والرَّحل)، مع السبب الحقيقي عند الفشل */
export async function testProvider(p, scope = 'typeset') {
  const t0 = Date.now();
  if (scopeOf(scope) !== 'typeset') {
    try {
      const text = await chatCall(p, { system: 'أنت مساعدٌ موجز.', user: 'صحّح الخطأ الإملائي في هذه الجملة وأعدها وحدها: «ذهب الطالب الي المدرسه»', max: 200 }, TIMEOUT_MS);
      if (!String(text).trim()) return { ok: false, ms: Date.now() - t0, error: 'ردّ النموذج برد فارغ' };
      if (p.id !== 'draft') Object.assign(st(p.id), { pausedUntil: 0, pauseReason: '', consecutiveFails: 0, lastMs: Date.now() - t0 });
      return { ok: true, ms: Date.now() - t0, reply: String(text).trim().slice(0, 300), model: p.model };
    } catch (e) {
      const c = classify(e, p);
      return { ok: false, ms: Date.now() - t0, error: c.msg, detail: e.detail || '', status: e.status || 0 };
    }
  }
  try {
    const text = await call(p, cardPrompt(SAMPLE), TIMEOUT_MS);
    const data = validateAi(parseJsonLoose(text));
    if (!data) return { ok: false, ms: Date.now() - t0, error: 'ردّ النموذج لكنه لم يُعد JSON صالحاً', detail: String(text).slice(0, 300) };
    if (p.id !== 'draft') Object.assign(st(p.id), { pausedUntil: 0, pauseReason: '', consecutiveFails: 0, lastMs: Date.now() - t0 });
    return { ok: true, ms: Date.now() - t0, sample: data, model: p.model };
  } catch (e) {
    const c = classify(e, p);
    return { ok: false, ms: Date.now() - t0, error: c.msg, detail: e.detail || '', status: e.status || 0 };
  }
}

/** التعرّف على المزوّد: بالبادئة، ثم بفحص المرشحين (أو كل المعروفين عند الطلب) عبر قائمة النماذج */
export async function probeKey({ key, kind, baseUrl, all = false }) {
  const k = cleanKey(key);
  const u = cleanBaseUrl(baseUrl);
  let candidates;
  if (kind) candidates = [kind];
  else if (u) candidates = ['custom'];
  else {
    const d = detectKind(k);
    candidates = d.candidates.length ? d.candidates : all ? NO_PREFIX : [];
  }
  if (!candidates.length) return { ok: false, unknown: true, error: 'لم نتعرف على المزوّد من بداية المفتاح.' };
  const tried = [];
  for (const kd of candidates) {
    const def = PROVIDERS[kd];
    if (!def) continue;
    const p = { id: 'draft', kind: kd, api: def.api, baseUrl: u || def.baseUrl, key: k };
    if (!p.baseUrl) return { ok: false, error: 'ضع عنوان الخدمة (Base URL)' };
    try {
      const models = await listModels(p);
      const pick = def.model && models.includes(def.model) ? def.model : def.model || models[0] || '';
      return { ok: true, kind: kd, label: def.label, baseUrl: p.baseUrl, models: models.sort(), model: pick, tried };
    } catch (e) {
      const c = classify(e, p);
      tried.push({ kind: kd, label: def.label, error: c.msg, detail: e.detail || '' });
    }
  }
  return { ok: false, tried, error: tried.length === 1 ? tried[0].error : 'لم يقبل أيٌّ من المزوّدين المرشحين هذا المفتاح' };
}

/** رفع الإيقاف المؤقت (لمزوّد أو للجميع) وتفريغ الذاكرة */
export function resetAiState(id) {
  for (const [k, s] of states) if (!id || k === id) Object.assign(s, { pausedUntil: 0, pauseReason: '', consecutiveFails: 0 });
  if (!id) cache.clear();
}

/** ملخص اليوم للّوحة */
/** القسم مفعّل؟ (التنضيد بمفتاحه القديم aiEnabled؛ والمحرِّر والرَّحل مفعّلان ما لم يُطفآ) */
export function scopeEnabled(scope, c = getConfig()) {
  scope = scopeOf(scope);
  if (scope === 'typeset') return !!c.aiEnabled;
  return c[scope === 'editor' ? 'aiEditorEnabled' : 'aiRahlEnabled'] !== false;
}
export async function setScopeEnabled(scope, on) {
  scope = scopeOf(scope);
  await setConfig({ [scope === 'typeset' ? 'aiEnabled' : scope === 'editor' ? 'aiEditorEnabled' : 'aiRahlEnabled']: !!on });
}
export function aiSummary(scope = 'typeset') {
  scope = scopeOf(scope);
  const list = resolvedProviders(scope);
  let calls = 0,
    ok = 0,
    fails = 0;
  for (const p of list) {
    const s = st(p.id);
    calls += s.calls;
    ok += s.ok;
    fails += s.fails;
  }
  return { scope, enabled: scopeEnabled(scope), available: aiAvailable(scope), calls, ok, fails, providers: list.length, active: list.filter((p) => p.enabled !== false).length };
}
