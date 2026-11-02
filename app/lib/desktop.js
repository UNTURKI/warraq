// وضع البرنامج: يُفعَّل حين يشغّل برنامجُ سطح المكتب (electron/main.cjs) الخادمَ بـ WARRAQ_DESKTOP=1.
// المجلد app واحد للموقع وللبرنامج: بلا هذا المتغير يعمل الموقع كما هو تماماً.
//   · كل صفحة تُعلَّم <html data-desktop> وتُربط بها /css/desktop.css و /js/desktop.js
//     (ما يخص الموقع وحده يُعلَّم في الصفحات بالصنف site-only فيُخفى في البرنامج).
//   · المالك هو صاحب الجهاز: نافذة البرنامج تحمل في كل طلب ترويسة سرية (WARRAQ_DESKTOP_KEY) تُغني عن الباب الخفي وكلمة السر.
//   · لا يُجاب إلا طلبٌ عنوانه 127.0.0.1، فلا تصل إلى الخادم صفحةُ ويب بحيلة إعادة ربط النطاق (DNS rebinding).
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

export const DESKTOP = process.env.WARRAQ_DESKTOP === '1';
const KEY = DESKTOP ? String(process.env.WARRAQ_DESKTOP_KEY || '') : '';

/** طلب من نافذة البرنامج نفسها (فصاحبه مالك البرنامج) */
export function isDesktopOwner(req) {
  if (!DESKTOP || KEY.length < 16) return false;
  const got = Buffer.from(String(req.headers['x-warraq-desk'] || ''));
  const ref = Buffer.from(KEY);
  return got.length === ref.length && crypto.timingSafeEqual(got, ref);
}

/** في البرنامج: لا يُخدم إلا ما طُلب باسم الجهاز نفسه */
export function hostAllowed(req) {
  if (!DESKTOP) return true;
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(req.headers.host || ''));
}

/** صفحات الموقع التي لا مكان لها في البرنامج: تُحوَّل إلى واجهة الإخراج */
const SITE_ONLY = new Set(['/', '/index.html', '/download/', '/download/index.html']);
export const desktopRedirect = (pathname) => (DESKTOP && SITE_ONLY.has(pathname) ? '/app/' : null);

/** صفحات البرنامج وحده (الهيكل بأبوابه، والخزانة): لا وجود لها في الموقع */
export const desktopOnly = (pathname) => !DESKTOP && /^\/(desk|khizana|muharrir|tiraz|mods)(\/|$)/.test(pathname);

/** «الطِّراز»: جزء البرنامج من مسار الصفحة (null: «الطِّراز» نفسه، لا يدخله مود) */
const PART_BY_PATH = [
  ['/desk/', 'shell'],
  ['/tiraz/', null],
  ['/khizana/', 'khizana'],
  ['/app/', 'bench'],
  ['/muharrir/', 'muharrir'],
  ['/rahl/', 'rahl'],
  ['/studio/', 'styles'],
  ['/admin/covers/', 'covers'],
  ['/admin/', 'settings'],
];
export function partOf(pathname) {
  const hit = PART_BY_PATH.find(([p]) => String(pathname || '').startsWith(p));
  return hit ? hit[1] : 'other';
}
const attr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
/** المودات المفعّلة في صفحة: أوراق أنماطها في رأسها (فلا يومض شكلها الأول)، ومشغّل نصوصها */
function modsHead(pathname) {
  const part = partOf(pathname);
  const H = globalThis.__warraqMods;
  if (!part || !H) return '';
  let links = '';
  try {
    const a = H.active(part);
    for (const m of a.mods) for (const c of m.css) links += `  <link rel="stylesheet" href="${attr(m.base + c + '?v=' + encodeURIComponent(m.rev))}" data-mod="${attr(m.id)}">\n`;
  } catch {}
  return links + '  <script type="module" src="/js/mods-runtime.js"></script>\n';
}

/** علامة البرنامج وملفاه في رأس كل صفحة (ومودات «الطِّراز» لجزئها) */
export function desktopHtml(html, pathname = '') {
  if (!DESKTOP) return html;
  html = String(html);
  // صفحة الإخراج: تصير «المِنضدة» (الخطوات في عمود، والكتاب بجانبها) حين تكون باباً في الهيكل
  const bench = html.includes('/js/app.js') ? '  <link rel="stylesheet" href="/css/bench.css">\n  <script src="/js/bench-desk.js" defer></script>\n' : '';
  // لوحة المالك: تصير نافذة «الإعدادات» (تبويبات عمودية وصفوف)
  // «الأساليب» و«المجلِّد» (وما بُني على واجهة استوديو الأغلفة): أدوات برنامج، والسِّراج
  const doors = html.includes('/covers/ui.css') ? '  <link rel="stylesheet" href="/css/doors-desk.css">\n' : '';
  const settings = html.includes('/admin/admin.js') ? '  <link rel="stylesheet" href="/admin/settings-desk.css">\n  <script src="/admin/settings-desk.js" defer></script>\n' : '';
  return html
    .replace(/<html\b/i, '<html data-desktop')
    .replace(/<\/head>/i, () => '  <link rel="stylesheet" href="/css/desktop.css">\n  <script src="/js/desktop.js" defer></script>\n' + bench + settings + doors + modsHead(pathname) + '</head>');
}

/**
 * خطوط الجهاز (البرنامج وحده): يقرؤها برنامج سطح المكتب (electron/system-fonts.cjs) قبل تشغيل الخادم.
 * تُعرض مع خطوط ورّاق في كل مكان يُختار فيه خط، ولا ملفات لها: Chromium (المعاينة و PDF) و Word يعرفانها بأسمائها.
 */
let sysCache = null;
export function systemFonts() {
  if (!DESKTOP) return [];
  if (sysCache) return sysCache;
  let list = globalThis.__warraqSystemFonts;
  // تجربة الخادم وحده بوضع البرنامج: WARRAQ_SCAN_FONTS=1
  if (!list && process.env.WARRAQ_SCAN_FONTS === '1') {
    try {
      list = createRequire(import.meta.url)('../../electron/system-fonts.cjs').scan(path.join(process.env.WARRAQ_DATA_DIR || '.', 'system-fonts.json'));
    } catch {
      list = [];
    }
  }
  sysCache = (Array.isArray(list) ? list : []).map((f) => ({ id: 'sys:' + f.family, family: f.family, label: f.label || f.family, docx: f.docx || f.family, weights: f.weights || [400], files: [], system: true, arabic: !!f.arabic }));
  return sysCache;
}
