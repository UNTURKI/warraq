// مسارات لوحة التحكم (/api/admin/*) والمسارات العامة المرتبطة بها
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, setConfig } from './store.js';
import { adminLook, setLook, addCustom, deleteCustom } from './look.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { passwordConfigured, checkPassword, setPassword, issueSession, clearSession, isAuthed, rateLimited, clientIp, isLocal } from './auth.js';
import { providerKinds, publicProviders, addProvider, updateProvider, deleteProvider, reorderProviders, resolvedProviders, draftProvider, testProvider, probeKey, listModels, aiExtractTrace, aiLog, aiSummary, resetAiState, detectKind, SCOPES, scopeOf, reusableProviders, setScopeEnabled, scopeEnabled, aiChat } from './ai.js';
import { editorPresets, saveEditorPresets, resetEditorPresets, editorNote, setEditorNote, systemFor, RUN_KINDS, jsonKind, KINDS as EDITOR_KINDS, targetsOf, PROMPT_SCOPES } from './ai-editor.js';
import { publicFonts, addFontFile, updateFont, deleteFont, inspectFont, WEIGHTS } from './fonts.js';
import { listBrushes, addBrushSet, updateBrushSet, deleteBrushSet } from './brushes.js';
import { sttPublic, setStt, testStt, STT_DELAYS } from './stt.js';
import { listBasmalas, addBasmala, updateBasmala, deleteBasmala, MAX_BASMALAS } from './basmala.js';
import { getPrint, setPrint, resetPrint, cleanPrint, isDefaultPrint, PAGE_TYPES, HALF_POS, PAD_TO, PRINT_DEFAULT, listPrintPresets, getPrintPreset, addPrintPreset, deletePrintPreset, MAX_PRINT_PRESETS } from './print.js';
import { listDownloads, saveUpload, updateDownload, deleteDownload, MAX_BYTES } from './downloads.js';
import { listStyles, getStyle, createStyle, saveStyle, deleteStyle, orderStyles, styleCard, importCard, extrasFor, cleanRenderSettings, SLOTS, TEMPLATE_KEYS, PAGE_AT } from './styles.js';
import { buildBookHtml } from './book-html.js';
import { FONTS } from '../shared/presets.js';
import { listFeedback, addFeedback, updateFeedback, deleteFeedback, TYPES, STATUSES } from './feedback.js';
import { hasGate, clearGate, isDoor, doorBook, doorOpens, issueGate, getDoor, adminDoor, setDoor } from './door.js';
import { getBook, extractBookId, DEFAULT_API } from './turath.js';
import { listSources, sourceUnits, hasTurath, addSource, updateSource, deleteSource, orderSources, restoreTurath, testSource, getSource, SOURCE_KINDS, MAX_SOURCES } from './sources.js';
import { DEFAULT_DATA_URL } from './catalog.js';
import { DESKTOP, isDesktopOwner } from './desktop.js';
import { handleKnow, gather, knowSystem, knowBrief } from './knowledge.js';
import { catalogBook } from './catalog.js';
import { sniff as sniffMedia, imageSize } from './covers.js';

const httpErr = (status, message) => Object.assign(new Error(message), { status });

/** هل يُسمح برؤية اللوحة؟ (دخلت من الباب الخفي، أو لك جلسة قائمة، أو فُعّل الدخول المباشر على الخادم) */
// في البرنامج: المالك نافذة البرنامج وحدها (لا باب خفي ولا جلسات)
export const adminVisible = (req) => (DESKTOP ? isDesktopOwner(req) : process.env.WARRAQ_ADMIN_DIRECT === '1' || isAuthed(req) || hasGate(req));
/**
 * هل الطالب مالك داخل؟ بجلسة قائمة؛ أو، إن أوقف المالك كلمة السر، بمجرد أن يرى اللوحة (دخل من الباب الخفي).
 * res: إن مُرّر صدرت له جلسة فيبقى داخلاً بعد انتهاء مهلة تصريح الباب.
 */
export function adminAuthed(req, res) {
  if (DESKTOP) return isDesktopOwner(req);
  if (isAuthed(req)) return true;
  if (!getConfig().passwordOff || !adminVisible(req)) return false;
  if (res && !res.headersSent && !req._sessionIssued) {
    req._sessionIssued = true;
    issueSession(res);
  }
  return true;
}

/**
 * @returns {Promise<boolean>} true إن عولج الطلب
 */
export async function handleAdmin(req, res, url, { json, readBody }) {
  const p = url.pathname;
  const m = req.method;
  if (!p.startsWith('/api/admin/')) return false;
  res.setHeader('x-frame-options', 'DENY');
  // بلا تصريح من الباب الخفي ولا جلسة: اللوحة غير موجودة أصلاً
  if (!adminVisible(req)) throw httpErr(404, 'not found');

  // حماية من الطلبات العابرة للمواقع: كل تعديل يتطلب ترويسة خاصة (لا تُرسل عبر النطاقات دون إذن CORS)
  if (m !== 'GET' && req.headers['x-warraq'] !== '1') throw httpErr(403, 'طلب مرفوض');

  /* ---------- الدخول ---------- */
  if (p === '/api/admin/status' && m === 'GET') {
    return json(res, 200, { authed: adminAuthed(req, res), configured: passwordConfigured(), canSetup: !passwordConfigured() && isLocal(req), passwordOff: !!getConfig().passwordOff, panel: DESKTOP ? 'الإعدادات' : getDoor().panel }), true;
  }
  if (p === '/api/admin/setup' && m === 'POST') {
    if (passwordConfigured()) throw httpErr(409, 'كلمة السر مضبوطة مسبقاً');
    if (!isLocal(req)) throw httpErr(403, 'الإعداد الأول مسموح من الجهاز نفسه فقط، أو اضبط ADMIN_PASSWORD');
    const { password } = await readBody(req, 16 * 1024);
    await setPassword(password);
    issueSession(res);
    clearGate(res);
    return json(res, 200, { ok: true }), true;
  }
  if (p === '/api/admin/login' && m === 'POST') {
    if (rateLimited('login:' + clientIp(req), 5, 15 * 60e3)) throw httpErr(429, 'محاولات كثيرة، حاول بعد ربع ساعة');
    const { password } = await readBody(req, 16 * 1024);
    if (!passwordConfigured() || !checkPassword(password || '')) {
      await new Promise((r) => setTimeout(r, 400));
      throw httpErr(401, 'كلمة السر غير صحيحة');
    }
    issueSession(res);
    clearGate(res);
    return json(res, 200, { ok: true }), true;
  }
  if (p === '/api/admin/logout' && m === 'POST') {
    clearSession(res);
    clearGate(res);
    return json(res, 200, { ok: true }), true;
  }

  // ما بعد هذا يتطلب الدخول
  if (!adminAuthed(req, res)) throw httpErr(401, 'يلزم تسجيل الدخول');

  /* ---------- الحساب: كلمة السر (تشغيلها وإيقافها)، والباب الخفي (الكتاب الوهمي، واسم اللوحة، والتركيبة) ---------- */
  if (p === '/api/admin/account' && m === 'GET') {
    return json(res, 200, { passwordOff: !!getConfig().passwordOff, configured: passwordConfigured(), envPassword: !!process.env.ADMIN_PASSWORD, ...adminDoor() }), true;
  }
  if (p === '/api/admin/account/password-off' && m === 'PUT') {
    const b = await readBody(req, 16 * 1024);
    const off = !!b.off;
    // إعادة تشغيلها بلا كلمة سر مضبوطة: تُكتب معها
    if (!off && !passwordConfigured()) await setPassword(b.password || '');
    await setConfig({ passwordOff: off });
    if (!off) issueSession(res);
    return json(res, 200, { passwordOff: off, configured: passwordConfigured() }), true;
  }
  if (p === '/api/admin/door' && m === 'PUT') return json(res, 200, await setDoor(await readBody(req, 16 * 1024))), true;

  if (p === '/api/admin/password' && m === 'POST') {
    if (process.env.ADMIN_PASSWORD) throw httpErr(409, 'كلمة السر مضبوطة من متغير البيئة ADMIN_PASSWORD');
    const { current, next } = await readBody(req, 16 * 1024);
    if (!checkPassword(current || '')) throw httpErr(401, 'كلمة السر الحالية غير صحيحة');
    await setPassword(next);
    issueSession(res);
    return json(res, 200, { ok: true }), true;
  }

  /* ---------- مظهر الموقع: ألوانه، وحركة النَّقْط عند الضغط ---------- */
  if (p === '/api/admin/look' && m === 'GET') return json(res, 200, adminLook()), true;
  if (p === '/api/admin/look' && m === 'PUT') return json(res, 200, await setLook(await readBody(req, 16 * 1024))), true;
  if (p === '/api/admin/look/custom' && m === 'POST') return json(res, 201, await addCustom(await readBody(req, 16 * 1024))), true;
  if (/^\/api\/admin\/look\/custom\/c-[a-z0-9]{1,12}$/.test(p) && m === 'DELETE') return json(res, 200, await deleteCustom(p.split('/').pop())), true;

  let mm;
  /* ---------- الذكاء الاصطناعي (أي مزوّد): ثلاثة أقسام لكلٍّ سلسلته — التنضيد، والمحرِّر، والرَّحل ---------- */
  if (p.startsWith('/api/admin/ai')) {
    const qs = url.searchParams.get('scope');
    // القسم: من الرابط (?scope=) أو من جسم الطلب؛ وبلا قسمٍ فالتنضيد (كما كان)
    let body = null;
    const getBody = async (max = 16 * 1024) => (body ??= await readBody(req, max));
    const scopeFrom = async () => scopeOf(qs || (m !== 'GET' && m !== 'DELETE' ? (await getBody()).scope : '') || 'typeset');
    const scopesInfo = () => Object.entries(SCOPES).map(([id, x]) => ({ id, label: x.label, enabled: scopeEnabled(id), providers: resolvedProviders(id).length }));

    if (p === '/api/admin/ai' && m === 'GET') {
      const sc = scopeOf(qs || 'typeset');
      return json(res, 200, { scope: sc, scopes: scopesInfo(), summary: aiSummary(sc), providers: publicProviders(sc), reusable: reusableProviders(sc), kinds: providerKinds(), log: aiLog(sc) }), true;
    }
    if (p === '/api/admin/ai' && m === 'PUT') {
      const b = await getBody();
      const sc = await scopeFrom();
      if (typeof b.enabled === 'boolean') await setScopeEnabled(sc, b.enabled);
      return json(res, 200, { ok: true, summary: aiSummary(sc) }), true;
    }
    if (p === '/api/admin/ai/detect' && m === 'POST') {
      // تعرّف فوري بالبادئة (بلا اتصال) أو فحص عبر قائمة النماذج (probe)
      const b = await getBody();
      if (!b.probe) return json(res, 200, detectKind(String(b.key || '').trim())), true;
      return json(res, 200, await probeKey({ key: b.key, kind: b.kind || '', baseUrl: b.baseUrl || '', all: !!b.all })), true;
    }
    if (p === '/api/admin/ai/test' && m === 'POST') {
      // اختبار قبل الحفظ
      const b = await getBody();
      return json(res, 200, await testProvider(draftProvider(b), await scopeFrom())), true;
    }
    if (p === '/api/admin/ai/providers' && m === 'POST') {
      const b = await getBody();
      const sc = await scopeFrom();
      const created = await addProvider(b, sc);
      // أول مفتاح يُضاف للتنضيد يفعّله تلقائياً (ويمكن إيقافه)
      if (sc === 'typeset' && resolvedProviders('typeset').length === 1 && !getConfig().aiEnabled && b.autoEnable !== false) await setConfig({ aiEnabled: true });
      return json(res, 201, created), true;
    }
    if (p === '/api/admin/ai/order' && m === 'POST') {
      const b = await getBody();
      await reorderProviders(Array.isArray(b.ids) ? b.ids.map(String) : [], await scopeFrom());
      return json(res, 200, { ok: true }), true;
    }
    if (p === '/api/admin/ai/reset' && m === 'POST') {
      resetAiState();
      return json(res, 200, { ok: true }), true;
    }
    if (p === '/api/admin/ai/try' && m === 'POST') {
      // مختبر الاستخراج (التنضيد): يشغّل السلسلة على كتاب حقيقي ويعرض مسار المحاولات
      const b = await getBody();
      const id = extractBookId(String(b.book || '')) || +b.book;
      if (!id) throw httpErr(400, 'اكتب رقم الكتاب أو رابطه');
      const book = isDoor(id) ? doorBook() : await getBook(id);
      const cat = catalogBook(id);
      const card = { id, name: book.name, info: book.info, authorName: (cat && cat.author) || '' };
      const r = await aiExtractTrace(card, { force: true, noCache: true, only: b.only || undefined });
      return json(res, 200, { book: { id, name: book.name }, ...r }), true;
    }

    /* —— مساعد المحرِّر ومساعد الرَّحل: توجيهاتهما الجاهزة وتوجيههما العام (?scope=editor|rahl) —— */
    const PROMPTS = /^\/api\/admin\/ai\/(editor|prompts)(\/reset)?$/.exec(p);
    if (PROMPTS) {
      const sc = PROMPT_SCOPES.includes(qs) ? qs : 'editor';
      if (!PROMPTS[2] && m === 'GET') {
        const list = resolvedProviders(sc).filter((x) => x.enabled !== false);
        return json(res, 200, {
          scope: sc,
          enabled: scopeEnabled(sc),
          ready: scopeEnabled(sc) && list.length > 0,
          first: list[0] ? { label: list[0].label, model: list[0].model } : null,
          providers: list.length,
          presets: editorPresets({ all: url.searchParams.get('all') === '1', scope: sc }),
          note: editorNote(sc),
          kinds: sc === 'rahl' ? { answer: EDITOR_KINDS.answer } : EDITOR_KINDS,
          targets: targetsOf(sc),
          know: knowBrief(),
        }), true;
      }
      if (!PROMPTS[2] && m === 'PUT') {
        const b = await getBody(256 * 1024);
        const out = {};
        if (Array.isArray(b.presets)) out.presets = await saveEditorPresets(b.presets, sc);
        if (typeof b.note === 'string') out.note = await setEditorNote(b.note, sc);
        return json(res, 200, { ok: true, ...out }), true;
      }
      if (PROMPTS[2] && m === 'POST') {
        const b = await getBody();
        return json(res, 200, { ok: true, presets: await resetEditorPresets(b.id ? String(b.id) : '', sc) }), true;
      }
    }
    /* —— صورةٌ من الشبكة يقترحها المساعد في المحرِّر: تُجلب هنا (لا يمنعها المتصفح) وتعود data URL —— */
    if (p === '/api/admin/ai/image' && m === 'POST') {
      const b = await getBody();
      const u = String(b.url || '').trim();
      if (!/^https?:\/\/[^\s]{4,2000}$/i.test(u)) throw httpErr(400, 'رابط الصورة غير صحيح');
      let host = '';
      try {
        host = new URL(u).hostname;
      } catch {
        throw httpErr(400, 'رابط الصورة غير صحيح');
      }
      if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw httpErr(400, 'لا تُجلب صورٌ من الشبكة المحلية');
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 25000);
      let buf;
      try {
        const r = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (Alwarraq)', accept: 'image/*' } });
        if (!r.ok) throw httpErr(502, 'لم تُجلب الصورة (HTTP ' + r.status + ')');
        const len = +r.headers.get('content-length') || 0;
        if (len > 12 * 1024 * 1024) throw httpErr(413, 'الصورة كبيرة');
        buf = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        throw e.status ? e : httpErr(502, e.name === 'AbortError' ? 'انتهت مهلة جلب الصورة' : 'لم تُجلب الصورة: ' + (e.message || e));
      } finally {
        clearTimeout(tm);
      }
      if (buf.length > 12 * 1024 * 1024) throw httpErr(413, 'الصورة كبيرة');
      const t = sniffMedia(buf);
      if (!t || t.kind !== 'image') throw httpErr(415, 'الرابط ليس صورة (PNG أو JPG أو WEBP أو GIF أو SVG)');
      const sz = imageSize(buf, t.ext) || { w: 0, h: 0 };
      return json(res, 200, { ok: true, src: `data:${t.type};base64,${buf.toString('base64')}`, w: sz.w || 0, h: sz.h || 0, type: t.type }), true;
    }
    /* —— تشغيل طلبٍ من المحرِّر (أو الرَّحل لاحقاً): يُبنى توجيه النظام هنا، وتُجرَّب السلسلة —— */
    if (p === '/api/admin/ai/run' && m === 'POST') {
      const b = await getBody(600 * 1024);
      const sc = scopeOf(b.scope || 'editor');
      if (sc === 'typeset') throw httpErr(400, 'قسم التنضيد لا يُحادَث');
      if (!scopeEnabled(sc)) return json(res, 409, { error: `الذكاء الاصطناعي في ${SCOPES[sc].label} موقوف: شغّله من الإعدادات ← الذكاء الاصطناعي`, reason: 'disabled', trail: [] }), true;
      const kind = RUN_KINDS.has(b.kind) ? b.kind : 'answer';
      const user = String(b.user || '').slice(0, 120_000);
      if (!user.trim()) throw httpErr(400, 'اكتب ما تريد');
      // ما سبق من المحادثة (للمتابعة): آخر الرسائل فقط
      const hist = (Array.isArray(b.history) ? b.history : [])
        .filter((x) => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.trim())
        .slice(-8)
        .map((x) => ({ role: x.role, content: x.content.slice(0, 20_000) }));
      const messages = [...hist, { role: 'user', content: user }];
      // (الرسائل تبدأ بالمستخدم وتتناوب: يُدمج المتتالي من نوعٍ واحد)
      const msgs = [];
      for (const x of messages) {
        if (msgs.length && msgs[msgs.length - 1].role === x.role) msgs[msgs.length - 1].content += '\n\n' + x.content;
        else msgs.push({ ...x });
      }
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const max = Math.min(Math.max(+b.max || (jsonKind(kind) || kind === 'edit' ? 8192 : 4096), 256), 16384);
      // مصادر المعرفة: يُبحث في مصادر العلم بحسب النص (أو ما اختير)، وتُلحق نتائجها بآخر الرسالة مرقّمةً
      let know = null;
      if (b.know && typeof b.know === 'object' && ['answer', 'plain', 'edit', 'fix', 'review'].includes(kind)) {
        try {
          know = await gather({ cats: Array.isArray(b.know.cats) ? b.know.cats.slice(0, 12) : [], q: String(b.know.q || '').slice(0, 200), text: String(b.know.text || '').slice(0, 8000), prompt: String(b.know.prompt || '').slice(0, 1500) });
        } catch {
          know = null;
        }
        if (know && know.block) msgs[msgs.length - 1].content += '\n\n' + know.block;
      }
      const system = systemFor(kind, sc) + (know && know.block ? '\n\n' + knowSystem(kind) : '');
      const knowOut = know ? { sources: know.sources, know: { used: know.used, how: know.how, errors: know.errors.slice(0, 6) } } : {};
      try {
        const r = await aiChat(sc, { system, messages: msgs, json: jsonKind(kind), max, temperature: kind === 'answer' || kind === 'plain' ? 0.4 : kind === 'edit' ? 0.2 : 0.1, timeout: 180000, tag: String(b.tag || kind).slice(0, 40), prefer: (know && know.prefer) || undefined });
        return json(res, 200, { ok: true, kind, text: r.text, ...(r.data !== undefined ? { data: r.data } : {}), provider: r.provider, model: r.model, ms: r.ms, trail: r.trail, ...knowOut }), true;
      } catch (e) {
        return json(res, e.status || 500, { error: e.message, reason: e.reason || '', trail: e.trail || [] }), true;
      }
    }

    mm = /^\/api\/admin\/ai\/providers\/([\w-]{1,40})(\/(test|models))?$/.exec(p);
    if (mm) {
      const id = mm[1];
      const sc = scopeOf(qs || 'typeset');
      if (!mm[2] && m === 'PATCH') return json(res, 200, await updateProvider(id, await getBody(), sc)), true;
      if (!mm[2] && m === 'DELETE') {
        await deleteProvider(id, sc);
        return json(res, 200, { ok: true }), true;
      }
      const prov = resolvedProviders(sc).find((x) => x.id === id);
      if (!prov) throw httpErr(404, 'المزوّد غير موجود');
      if (mm[3] === 'test' && m === 'POST') return json(res, 200, await testProvider(prov, sc)), true;
      if (mm[3] === 'models' && m === 'POST') {
        try {
          return json(res, 200, { ok: true, models: (await listModels(prov)).sort() }), true;
        } catch (e) {
          return json(res, 200, { ok: false, error: e.status ? `HTTP ${e.status}` : e.message, detail: e.detail || '' }), true;
        }
      }
    }
  }

  /* ---------- مصادر المعرفة: مصادر العلم (الدرر، سِوار…) ومصادر الترجمة ---------- */
  if (p.startsWith('/api/admin/know') && (await handleKnow(req, res, url, { json, readBody }))) return true;

/* ---------- فُرَش الرسم: أشكال أقلام الرَّحل (يقرؤها المتصفح من ملف الفرشاة، وتُحفظ صورها هنا) ---------- */
  // التفريغ المباشر (مجلس الدرس): الخدمة ومفاتيحها ومفردات الدرس
  if (p === '/api/admin/stt' && m === 'GET') return json(res, 200, { ...sttPublic(), delays: STT_DELAYS }), true;
  if (p === '/api/admin/stt' && m === 'PUT') return json(res, 200, await setStt(await readBody(req, 16 * 1024))), true;
  if (p === '/api/admin/stt/test' && m === 'POST') {
    const b = await readBody(req, 4 * 1024);
    return json(res, 200, await testStt(String(b.engine || ''))), true;
  }
  if (p === '/api/admin/brushes' && m === 'GET') return json(res, 200, { sets: listBrushes() }), true;
  if (p === '/api/admin/brushes' && m === 'POST') return json(res, 201, await addBrushSet(await readBody(req, 80 * 1024 * 1024))), true;
  {
    const bm = /^\/api\/admin\/brushes\/([a-f0-9]{12})$/.exec(p);
    if (bm && m === 'PATCH') return json(res, 200, { ok: true, set: await updateBrushSet(bm[1], await readBody(req, 64 * 1024)) }), true;
    if (bm && m === 'DELETE') {
      await deleteBrushSet(bm[1]);
      return json(res, 200, { ok: true }), true;
    }
  }

/* ---------- الخطوط (تدخل في كل الموقع: الكتاب والأساليب والأغلفة) ---------- */
  if (p === '/api/admin/fonts' && m === 'GET') {
    const builtin = Object.entries(FONTS).filter(([, f]) => !f.uploaded).map(([family, f]) => ({ family, label: f.label }));
    return json(res, 200, { weights: WEIGHTS, fonts: publicFonts(), builtin }), true;
  }
  if (p === '/api/admin/fonts/inspect' && m === 'POST') {
    // قراءة اسم الخط ووزنه من داخل الملف قبل إضافته
    const b = await readBody(req, 30 * 1024 * 1024);
    const info = inspectFont(Buffer.from(String(b.data || '').replace(/^data:[^,]*,/, ''), 'base64'));
    if (!info) throw httpErr(415, 'الصيغ المقبولة: TTF وOTF وWOFF وWOFF2');
    return json(res, 200, info), true;
  }
  if (p === '/api/admin/fonts' && m === 'POST') {
    return json(res, 201, await addFontFile(await readBody(req, 30 * 1024 * 1024))), true;
  }
  mm = /^\/api\/admin\/fonts\/([a-f0-9]{12})(?:\/(400|700|all))?$/.exec(p);
  if (mm && m === 'PATCH' && !mm[2]) return json(res, 200, await updateFont(mm[1], await readBody(req, 16 * 1024))), true;
  if (mm && m === 'DELETE') {
    await deleteFont(mm[1], mm[2]);
    return json(res, 200, { ok: true }), true;
  }

  /* ---------- أساليب دور النشر ---------- */
  if (p === '/api/admin/styles' && m === 'GET') return json(res, 200, { styles: listStyles(), slots: SLOTS, templates: TEMPLATE_KEYS, pageAt: PAGE_AT }), true;
  if (p === '/api/admin/styles' && m === 'POST') {
    // أسلوب جديد: نسخة من أسلوب موجود (from) أو من بيانات كاملة (style)
    const b = await readBody(req, 20 * 1024 * 1024);
    const base = b.from ? getStyle(String(b.from)) : null;
    if (b.from && !base) throw httpErr(404, 'الأسلوب الأصل غير موجود');
    const src = base ? { ...base, name: b.name || base.name + ' (نسخة)', hidden: false } : { ...(b.style || {}), name: (b.style && b.style.name) || b.name };
    return json(res, 201, await createStyle(src)), true;
  }
  if (p === '/api/admin/styles/ai-prompt' && m === 'GET') {
    // التوجيه الجاهز الذي يُعطى لأي ذكاء اصطناعي ليكتب بطاقة نصية: للكتب والمتون، أو للأبحاث (?kind=research)
    const k = url.searchParams.get('kind') === 'research' ? 'research' : 'books';
    const file = path.join(ROOT, 'docs', `ai-style-prompt-${k}.md`);
    res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(k === 'research' ? 'توجيه بطاقة أسلوب البحث.md' : 'توجيه بطاقة أسلوب الكتب والمتون.md') });
    res.end(fs.readFileSync(file, 'utf8'));
    return true;
  }
  if (p === '/api/admin/styles/import' && m === 'POST') {
    const b = await readBody(req, 48 * 1024 * 1024);
    try {
      return json(res, 201, await importCard(b.card, { allowScript: b.allowScript === true })), true;
    } catch (e) {
      // بطاقة فيها كود: تُسأل الواجهة المالكَ ثم تعيد الطلب بموافقته
      if (e.code === 'script-consent') return json(res, 409, { error: e.message, code: e.code, name: String((b.card && b.card.name) || '').slice(0, 60) }), true;
      throw e;
    }
  }
  if (p === '/api/admin/styles/order' && m === 'POST') {
    const b = await readBody(req, 64 * 1024);
    await orderStyles(Array.isArray(b.ids) ? b.ids.map(String) : []);
    return json(res, 200, { ok: true }), true;
  }
  if (p === '/api/admin/styles/preview' && m === 'POST') {
    // معاينة المحرر: الإضافات غير المحفوظة تأتي مع الطلب (للمالك فقط)
    const b = await readBody(req, 24 * 1024 * 1024);
    if (!b.doc || !Array.isArray(b.doc.blocks)) throw httpErr(400, 'بيانات المعاينة ناقصة');
    // print: إعداد طباعة غير محفوظ (كائن)، أو null = إعداد الموقع، أو غائب = ما يخص الأسلوب المحفوظ
    const settings = cleanRenderSettings(b.settings);
    const print = 'print' in b ? (b.print && typeof b.print === 'object' ? cleanPrint(b.print) : getPrint()) : null;
    const html = buildBookHtml({ doc: b.doc, settings, cover: b.cover || {}, extra: extrasFor(b.extras), preview: true, origin: b.origin, marks: b.marks, print });
    return json(res, 200, { html }), true;
  }
  mm = /^\/api\/admin\/styles\/([\w-]{1,40})(\/card)?$/.exec(p);
  if (mm) {
    if (mm[2] && m === 'GET') return json(res, 200, styleCard(mm[1])), true;
    if (!mm[2] && m === 'PUT') {
      const b = await readBody(req, 20 * 1024 * 1024);
      return json(res, 200, await saveStyle(mm[1], b.style || b)), true;
    }
    if (!mm[2] && m === 'DELETE') return json(res, 200, await deleteStyle(mm[1])), true;
  }

  /* ---------- مصادر الكتب: «تراث» افتراضياً، وأي API بصيغته، ومجلد كتب Word على الجهاز ---------- */
  if (p === '/api/admin/sources' && m === 'GET') {
    return json(res, 200, { sources: listSources(), units: sourceUnits(), hasTurath: hasTurath(), kinds: SOURCE_KINDS, max: MAX_SOURCES, defaults: { api: DEFAULT_API, data: DEFAULT_DATA_URL } }), true;
  }
  if (p === '/api/admin/sources' && m === 'POST') return json(res, 201, { source: await addSource(await readBody(req, 16 * 1024)), sources: listSources(), units: sourceUnits() }), true;
  if (p === '/api/admin/sources/order' && m === 'POST') {
    const b = await readBody(req, 16 * 1024);
    await orderSources(Array.isArray(b.ids) ? b.ids.map(String) : []);
    return json(res, 200, { sources: listSources(), units: sourceUnits() }), true;
  }
  if (p === '/api/admin/sources/restore' && m === 'POST') {
    await restoreTurath();
    return json(res, 200, { sources: listSources(), units: sourceUnits(), hasTurath: true }), true;
  }
  if (p === '/api/admin/sources/test' && m === 'POST') return json(res, 200, await testSource(await readBody(req, 16 * 1024))), true; // قبل الحفظ
  mm = /^\/api\/admin\/sources\/([\w-]{1,40})(\/test)?$/.exec(p);
  if (mm && mm[2] && m === 'POST') {
    const src = getSource(mm[1]);
    if (!src) throw httpErr(404, 'المصدر غير موجود');
    return json(res, 200, await testSource({}, src)), true;
  }
  if (mm && !mm[2] && m === 'PATCH') return json(res, 200, { source: await updateSource(mm[1], await readBody(req, 16 * 1024)), sources: listSources(), units: sourceUnits() }), true;
  if (mm && !mm[2] && m === 'DELETE') {
    await deleteSource(mm[1]);
    return json(res, 200, { sources: listSources(), units: sourceUnits(), hasTurath: hasTurath() }), true;
  }

  /* ---------- إعدادات الطباعة (النسخة الجاهزة للطباعة): تُحرَّر من «أساليب دور النشر» ---------- */
  if (p === '/api/admin/print' && m === 'GET') {
    const print = getPrint();
    return json(res, 200, { print, isDefault: isDefaultPrint(print), defaults: PRINT_DEFAULT, types: PAGE_TYPES, halfPos: HALF_POS, padTo: PAD_TO }), true;
  }
  if (p === '/api/admin/print' && m === 'PUT') {
    const b = await readBody(req, 12 * 1024 * 1024);
    const print = await setPrint(b.print || b);
    return json(res, 200, { print, isDefault: isDefaultPrint(print) }), true;
  }
  if (p === '/api/admin/print' && m === 'DELETE') return json(res, 200, { print: await resetPrint(), isDefault: true }), true;
  // التنسيقات المحفوظة: تُحفظ بأسمائها، ثم تُعمَّم للموقع كله أو تُربط بأسلوب، وتُنزَّل ملفاً يفهمه الموقع
  if (p === '/api/admin/print/presets' && m === 'GET') return json(res, 200, { items: listPrintPresets(), max: MAX_PRINT_PRESETS }), true;
  if (p === '/api/admin/print/presets' && m === 'POST') {
    const item = await addPrintPreset(await readBody(req, 12 * 1024 * 1024));
    return json(res, 201, { item, items: listPrintPresets() }), true;
  }
  mm = /^\/api\/admin\/print\/presets\/(pp\d{1,4})(\/apply)?$/.exec(p);
  if (mm && !mm[2] && m === 'GET') return json(res, 200, getPrintPreset(mm[1])), true;
  if (mm && !mm[2] && m === 'DELETE') return json(res, 200, { items: await deletePrintPreset(mm[1]) }), true;
  if (mm && mm[2] && m === 'POST') {
    const b = await readBody(req, 16 * 1024);
    const preset = getPrintPreset(mm[1]);
    // target: site = الموقع كله · وإلا معرّف الأسلوب الذي يُربط به
    if (b.target === 'site') {
      const print = await setPrint(preset.print);
      return json(res, 200, { target: 'site', print, isDefault: isDefaultPrint(print) }), true;
    }
    const cur = getStyle(String(b.target || ''));
    if (!cur) throw httpErr(404, 'الأسلوب غير موجود');
    const style = await saveStyle(cur.id, { ...cur, print: preset.print });
    return json(res, 200, { target: cur.id, style }), true;
  }

  /* ---------- صور البسملة: مكتبة يختار منها المستخدم (الأولى هي الافتراضية) ---------- */
  if (p === '/api/admin/basmala' && m === 'GET') return json(res, 200, { items: listBasmalas(), max: MAX_BASMALAS }), true;
  if (p === '/api/admin/basmala' && m === 'POST') {
    const item = await addBasmala(await readBody(req, 6 * 1024 * 1024));
    return json(res, 201, { item, items: listBasmalas() }), true;
  }
  mm = /^\/api\/admin\/basmala\/([\w-]{1,24})$/.exec(p);
  if (mm && m === 'PATCH') return json(res, 200, { items: await updateBasmala(mm[1], await readBody(req, 16 * 1024)) }), true;
  if (mm && m === 'DELETE') return json(res, 200, { items: await deleteBasmala(mm[1]) }), true;

  /* ---------- تنزيل البرنامج: ملفات النسختين ---------- */
  if (p === '/api/admin/downloads' && m === 'GET') return json(res, 200, { editions: listDownloads(), maxMb: Math.round(MAX_BYTES / 1024 / 1024) }), true;
  if (p === '/api/admin/downloads/upload' && m === 'PUT') {
    // جسم الطلب هو الملف نفسه (قد يكون مئات الميغابايتات): يُكتب إلى القرص تدفّقاً
    const q = url.searchParams;
    return json(res, 201, await saveUpload(req, { edition: q.get('edition'), version: q.get('version'), notes: q.get('notes'), name: q.get('name') })), true;
  }
  mm = /^\/api\/admin\/downloads\/([a-f0-9]{16})$/.exec(p);
  if (mm && m === 'PATCH') return json(res, 200, await updateDownload(mm[1], await readBody(req, 16 * 1024))), true;
  if (mm && m === 'DELETE') {
    await deleteDownload(mm[1]);
    return json(res, 200, { ok: true }), true;
  }

  /* ---------- الشكاوى والملاحظات ---------- */
  if (p === '/api/admin/feedback' && m === 'GET') return json(res, 200, { types: TYPES, statuses: STATUSES, items: listFeedback() }), true;
  if (p === '/api/admin/feedback' && m === 'DELETE') {
    const b = await readBody(req, 256 * 1024);
    return json(res, 200, { deleted: await deleteFeedback(Array.isArray(b.ids) ? b.ids.map(String) : []) }), true;
  }
  mm = /^\/api\/admin\/feedback\/([a-f0-9]{12})$/.exec(p);
  if (mm && m === 'PATCH') return json(res, 200, await updateFeedback(mm[1], await readBody(req, 16 * 1024))), true;

  throw httpErr(404, 'غير موجود');
}

/** المسارات العامة: تجهيز الجلب (ومنه الباب الخفي)، وإرسال الملاحظات */
export async function handlePublic(req, res, url, { json, readBody }) {
  const p = url.pathname;
  if (p === '/api/prepare' && req.method === 'POST') {
    // تجهيز مهمة الجلب (فحص مسبق خفيف لكل الكتب) — ومنه الباب الخفي للوحة التحكم
    const b = await readBody(req, 16 * 1024);
    if (!isDoor(b.bookId)) return json(res, 200, { ok: true }), true;
    if (rateLimited('door:' + clientIp(req), 12, 10 * 60e3)) return json(res, 200, { ok: false, error: 'تعذّر تجهيز الكتاب الآن، حاول لاحقاً.' }), true;
    if (!doorOpens(b)) return json(res, 200, { ok: false, error: 'هذا الكتاب غير متاح للتنزيل حالياً.' }), true;
    issueGate(res);
    return json(res, 200, { ok: true, go: '/admin/' }), true;
  }
  if (p === '/api/print-info' && req.method === 'GET') {
    // ما يحتاجه المستخدم عند «النسخة الجاهزة للطباعة»: صور البسملة التي يختار بينها،
    // وتسلسل الصفحات (أنواعها فقط) للموقع، ولكل أسلوب له تسلسل خاص
    const seq = (pr) => ({ front: pr.front.map((x) => x.type), back: pr.back.map((x) => x.type) });
    const styles = {};
    for (const s of listStyles()) if (s.print && !s.hidden) styles[s.id] = seq(cleanPrint(s.print));
    // التنسيقات المحفوظة (أسماؤها وتسلسلها): يختار منها المستخدم أو تحملها حزمة غلاف
    const presets = listPrintPresets().map((x) => {
      try {
        return { id: x.id, name: x.name, ...seq(getPrintPreset(x.id).print) };
      } catch {
        return null;
      }
    }).filter(Boolean);
    return json(res, 200, { basmalas: listBasmalas(), ...seq(getPrint()), styles, presets }), true;
  }
  if (p === '/api/feedback' && req.method === 'POST') {
    if (rateLimited('fb:' + clientIp(req), 5, 10 * 60e3)) throw httpErr(429, 'أرسلت ملاحظات كثيرة، شكراً لك — حاول لاحقاً');
    const b = await readBody(req, 32 * 1024);
    if (b.website) return json(res, 200, { ok: true }), true; // فخ للبرامج الآلية
    return json(res, 201, { ok: true, ...(await addFeedback(b)) }), true;
  }
  return false;
}
