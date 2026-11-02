// توليد PDF حقيقي عبر Chromium بلا واجهة (Playwright) من مستند HTML مبني من البيانات
import { buildBookHtml } from './book-html.js';

let browserPromise = null;
let active = 0;
const queue = [];
const MAX_PARALLEL = Number(process.env.WARRAQ_RENDER_PARALLEL || 2);

async function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      const m = await import(name);
      return m.chromium || m.default?.chromium;
    } catch {}
  }
  throw new Error('Playwright غير مثبت: شغّل npm install ثم npx playwright install chromium');
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const chromium = await loadPlaywright();
      const opts = { args: ['--no-sandbox', '--font-render-hinting=none', '--disable-dev-shm-usage'] };
      if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
      const b = await chromium.launch(opts);
      b.on('disconnected', () => (browserPromise = null));
      return b;
    })().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

function slot() {
  return new Promise((resolve) => {
    const go = () => {
      active++;
      resolve(() => {
        active--;
        const n = queue.shift();
        if (n) n();
      });
    };
    if (active < MAX_PARALLEL) go();
    else queue.push(go);
  });
}

/**
 * @returns {Promise<{pdf: Buffer, layout: object, probe?: any}>}
 */
export async function renderPdf({ doc, settings, cover, baseUrl, debugHtml, extra, probe, print }) {
  const release = await slot();
  let page;
  try {
    // برنامج سطح المكتب (Electron): التنضيد بمحرك البرنامج نفسه، فلا يحتاج متصفحاً خارجياً
    const engine = globalThis.__warraqPdfEngine;
    if (engine) {
      const { outerImage, backImage, ...innerCover } = cover || {};
      const html = buildBookHtml({ doc, settings, cover: innerCover, baseUrl, extra, print });
      if (debugHtml) debugHtml(html);
      return await engine({ html, outer: validOuterImage(outerImage), back: validOuterImage(backImage), probe });
    }
    const browser = await getBrowser();
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });
    // مستند الطباعة لا يتصل بشيء (ولو طلب ذلك كودُ بطاقة أسلوب): لا يُسمح إلا بخطوط Google حين يغيب الخط محلياً
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      return /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u) ? route.continue() : route.abort();
    });
    page = await ctx.newPage();
    // الغلاف الخارجي (صورة من استوديو الأغلفة) لا يدخل مستند التنضيد؛ يُضاف صفحةً أولى بعد اكتماله
    const { outerImage, backImage, ...innerCover } = cover || {};
    const outer = validOuterImage(outerImage);
    const back = validOuterImage(backImage);
    const html = buildBookHtml({ doc, settings, cover: innerCover, baseUrl, extra, print });
    if (debugHtml) debugHtml(html);
    await page.setContent(html, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForFunction(() => window.__LAYOUT_DONE === true, null, { timeout: 45 * 60_000, polling: 400 });
    const err = await page.evaluate(() => window.__LAYOUT_ERROR || null);
    if (err) throw new Error('خطأ في التنضيد: ' + err);
    const layout = await page.evaluate(() => window.__LAYOUT);
    // probe: دالة تُنفَّذ داخل المستند المنضَّد وتعيد ما تقيسه (للاختبارات)
    const probed = probe ? await page.evaluate(probe) : undefined;
    if (outer || back) await page.evaluate(insertCovers, { outer, back });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 45 * 60_000 });
    await ctx.close();
    return { pdf, layout, probe: probed };
  } finally {
    release();
  }
}

/** الغلاف الخارجي صفحةً أولى، والخلفي صفحةً أخيرة (بعد اكتمال التنضيد) */
function insertCovers({ outer, back }) {
  const book = document.getElementById('book');
  const make = (src, cls) => {
    const pg = document.createElement('div');
    pg.className = 'page ' + cls;
    pg.style.cssText = 'background:#fff';
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block';
    pg.appendChild(img);
    return [pg, img];
  };
  const waits = [];
  if (outer) { const [pg, img] = make(outer, 'outer-cover'); book.insertBefore(pg, book.firstChild); waits.push(img.decode().catch(() => {})); }
  if (back) { const [pg, img] = make(back, 'outer-cover back-cover'); book.appendChild(pg); waits.push(img.decode().catch(() => {})); }
  return Promise.all(waits);
}

/** صورة الغلاف الخارجي: data URL لصورة PNG/JPEG/WEBP فقط (حتى ٤٠ م.ب) */
export function validOuterImage(v) {
  if (typeof v !== 'string' || v.length > 40 * 1024 * 1024) return null;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close();
  }
}
