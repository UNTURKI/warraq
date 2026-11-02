// عامل خلفي (Web Worker): يجلب صفحات المجلدات من «تراث» بالتوازي ويحللها دون تجميد الواجهة
import { parseVolume } from '/shared/parser.js';
import { loadQuranIndex } from '/shared/quran.js';
import { trimPage } from '/shared/split.js';

let cancelled = false;
const controllers = new Set();

async function fetchPage(bookId, pg, src, wo, attempt = 0) {
  const ac = new AbortController();
  controllers.add(ac);
  try {
    const r = await fetch(`/api/page?book_id=${encodeURIComponent(bookId)}&pg=${pg}${src ? '&src=' + encodeURIComponent(src) : ''}${wo ? '&wo=' + encodeURIComponent(wo) : ''}`, { signal: ac.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (cancelled) throw e;
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
      return fetchPage(bookId, pg, src, wo, attempt + 1);
    }
    return { page_id: pg, text: '', meta: {}, failed: true };
  } finally {
    controllers.delete(ac);
  }
}

/** صفحات متتالية دفعة واحدة من ملف الكتاب الكامل عبر الخادم. { pages } أو { direct } (عناوين «تراث» ليجرّبها المتصفح) أو null */
async function fetchRange(bookId, from, to, src) {
  const ac = new AbortController();
  controllers.add(ac);
  try {
    const r = await fetch(`/api/pages?book_id=${encodeURIComponent(bookId)}&from=${from}&to=${to}${src ? '&src=' + encodeURIComponent(src) : ''}`, { signal: ac.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j.pages) && j.pages.length === to - from + 1) return { pages: j.pages };
    return j.direct ? { direct: j.direct } : null;
  } catch (e) {
    if (cancelled) throw e;
    return null;
  } finally {
    controllers.delete(ac);
  }
}

/* ------------------------------------------------------------------
   الجلب من المتصفح مباشرة (إن تعذّر ملف الكتاب على الخادم): من جهاز المستخدم نفسه، فلا يشارك غيرَه حدَّ الطلبات.
   ١) ملف الكتاب الكامل من «تراث» طلباً واحداً. ٢) وإلا فصفحةً صفحة من واجهة «تراث» مباشرة.
   (إن منع المتصفحُ الطلب — سياسة المصدر — عاد الجلب إلى الخادم) */
const directFiles = new Map(); // رقم الكتاب ← وعد بالصفحات
function directBook(direct, bookId, totalPages) {
  if (directFiles.has(bookId)) return directFiles.get(bookId);
  const pr = (async () => {
    const ac = new AbortController();
    controllers.add(ac);
    const t = setTimeout(() => ac.abort(), 240000);
    try {
      // books-v3 هو المنشور اليوم (books القديم يردّ 404). والصفحات فيه بأسمائها (pages: text, vol, page) فلا فكّ
      let r = await fetch(`${direct.files}/books-v3/${encodeURIComponent(bookId)}.json`, { signal: ac.signal, mode: 'cors' });
      if (r.status === 404) r = await fetch(`${direct.files}/books/${encodeURIComponent(bookId)}.json`, { signal: ac.signal, mode: 'cors' });
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Array.isArray(j.pages) || (totalPages && j.pages.length !== totalPages)) return null;
      const all = j.pages.map((p, i) => ({ page_id: i + 1, text: (p && p.text) || '', meta: { page_id: i + 1, page: p && p.page != null ? p.page : null, vol: p && p.vol != null ? String(p.vol) : null } }));
      // تحقق من الملف بصفحة من الـAPI: صفحاتٌ فارغة فيه وهي في الـAPI ذات نص، أو صفحةٌ في غير موضعها ← لا يُعتمد
      const norm = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/[\s\u064B-\u0652\u0640]+/g, '').slice(0, 160);
      // (العددان متساويان والملف من «تراث» نفسه: لا يُقابَل نصُّه بالـAPI إلا إن كثرت صفحاته الفارغة؛ فالصيغتان تختلفان في الوسوم أحياناً)
      const blank = all.filter((p) => !p.text.trim());
      if (blank.length > all.length * 0.3) {
        const api = await directPage(direct, bookId, blank[Math.floor(blank.length / 2)].page_id);
        if (api && norm(api.text).length >= 20) return null;
      }
      return all;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
      controllers.delete(ac);
    }
  })();
  directFiles.set(bookId, pr);
  return pr;
}
let directApi = null; // null: لم يُجرَّب، true: يعمل، false: ممنوع
let pausedUntil = 0;
async function directPage(direct, bookId, pg, attempt = 0) {
  const wait = pausedUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
  const ac = new AbortController();
  controllers.add(ac);
  try {
    const r = await fetch(`${direct.api}/page?book_id=${encodeURIComponent(bookId)}&pg=${pg}&ver=3`, { signal: ac.signal, mode: 'cors' });
    if (r.status === 429 && attempt < 6) {
      pausedUntil = Math.max(pausedUntil, Date.now() + Math.min(30, Number(r.headers.get('retry-after')) || 5) * 1000);
      return directPage(direct, bookId, pg, attempt + 1);
    }
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { http: true });
    const j = await r.json();
    let meta = j.meta;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    directApi = true;
    return { page_id: pg, text: j.text || '', meta: meta || {} };
  } catch (e) {
    if (cancelled) throw e;
    // خطأ شبكة قبل أي نجاح: المتصفح منع الطلب، فيعود الجلب إلى الخادم
    if (!e.http && directApi !== true) directApi = false;
    return null;
  } finally {
    controllers.delete(ac);
  }
}
const BULK = 1000; // صفحات كل دفعة: الملف كله على الخادم من طلب واحد، والدفعات تقطيعٌ منه فقط
let bulkOff = new Set(); // كتب لا تُجلب دفعة واحدة من الخادم
const directFor = new Map(); // ← عناوين الجلب المباشر لها

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancelled = true;
    for (const c of controllers) c.abort();
    return;
  }
  if (msg.type !== 'start') return;
  cancelled = false;
  // local: صفحات كتاب المستخدم «كتابي» حاضرة في الذاكرة (ملف Word قُرئ في المتصفح)، فلا جلب
  // wo: خيارات قراءة ملف Word لكتب مجلد المالك (الصفحات تتبعها)
  const { bookId, src = '', wo = '', pages: local = null, book, volumes, concurrency = 6, parseOpts = {}, totalPages = 0 } = msg;
  const quranIndex = loadQuranIndex().catch(() => null);
  const overallTotal = volumes.reduce((a, v) => a + (v.end - v.start + 1), 0);
  let overallDone = 0;
  try {
    for (const v of volumes) {
      if (cancelled) return;
      // كتاب من عدة كتب (ملفات Word صارت مجلدات): لكل مجلد كتابه ومصدره وصفحاته وتعليمات تحليله
      const vId = v.bookId ?? bookId;
      const vSrc = v.src ?? src;
      const vWo = v.wo ?? wo;
      const vLocal = v.pages || local;
      const vTotal = v.totalPages ?? totalPages;
      let direct = null;
      const total = v.end - v.start + 1;
      const pages = new Array(total);
      let next = v.start;
      let done = 0;
      let failed = 0;
      let lastTick = 0;
      const tick = (current, force) => {
        const now = Date.now();
        if (!force && now - lastTick < 80) return;
        lastTick = now;
        self.postMessage({ type: 'progress', vol: v.vol, done, total, current, failed, overallDone, overallTotal });
      };
      tick(v.start, true);
      // أولاً: دفعات من ملف الكتاب الكامل (طلب واحد لكل ${BULK} صفحة بدل طلب لكل صفحة)
      const bulkKey = vSrc + '|' + vId;
      if (!vLocal && !vWo && !bulkOff.has(bulkKey)) {
        while (!cancelled && next <= v.end) {
          const to = Math.min(v.end, next + BULK - 1);
          const res = await fetchRange(vId, next, to, vSrc);
          if (!res || !res.pages) {
            bulkOff.add(bulkKey);
            direct = res && res.direct;
            break;
          }
          for (const p of res.pages) {
            pages[p.page_id - v.start] = { page_id: p.page_id, text: p.text, meta: p.meta };
            done++;
            overallDone++;
          }
          next = to + 1;
          tick(to, true);
        }
      }
      // ثانياً: من المتصفح مباشرة (ملف الكتاب، ثم صفحةً صفحة)
      if (!direct && !vLocal && !vWo && bulkOff.has(bulkKey) && directFor.has(bulkKey)) direct = directFor.get(bulkKey);
      if (direct) directFor.set(bulkKey, direct);
      if (direct && !cancelled && next <= v.end) {
        const all = await directBook(direct, vId, vTotal);
        if (all) {
          for (let pg = next; pg <= v.end; pg++) {
            const p = all[pg - 1] || { page_id: pg, text: '', meta: {} };
            pages[pg - v.start] = { page_id: pg, text: p.text, meta: p.meta };
            done++;
            overallDone++;
          }
          next = v.end + 1;
          tick(v.end, true);
        }
      }
      const workerLoop = async () => {
        while (!cancelled && next <= v.end) {
          const pg = next++;
          let p = null;
          if (vLocal) p = vLocal[pg - 1] || { text: '', meta: {}, failed: true };
          else {
            if (direct && directApi !== false) p = await directPage(direct, vId, pg);
            if (!p) p = await fetchPage(vId, pg, vSrc, vWo);
          }
          if (p.failed) failed++;
          pages[pg - v.start] = { page_id: pg, text: p.text, meta: p.meta };
          done++;
          overallDone++;
          tick(pg);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, workerLoop));
      if (cancelled) return;
      tick(v.end, true);
      // كتابٌ قُسِّم: بابٌ يبدأ في وسط صفحته — يبدأ المجلد من العنوان، وينتهي ما قبله عنده
      if (v.head && pages[0]) pages[0] = { ...pages[0], text: trimPage(pages[0].text, v.head.title, 'head') };
      if (v.tail && pages.length && pages[pages.length - 1]) pages[pages.length - 1] = { ...pages[pages.length - 1], text: trimPage(pages[pages.length - 1].text, v.tail.title, 'tail') };
      self.postMessage({ type: 'parsing', vol: v.vol });
      // نص القرآن للتعرف على الآيات التي لم تُعلَّم في المصدر (يُحمَّل مرة واحدة؛ إن تعذّر مضى التحليل بدونه)
      const popts = v.parseOpts || parseOpts;
      const quran = popts.quranDetect === false ? null : await quranIndex;
      const parsed = parseVolume(v.book || book, pages, quran ? { ...popts, quran } : popts);
      parsed.failedPages = failed;
      self.postMessage({ type: 'volume', vol: v.vol, parsed });
    }
    self.postMessage({ type: 'done' });
  } catch (e) {
    if (!cancelled) self.postMessage({ type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
