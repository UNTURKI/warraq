// محرك PDF داخل البرنامج: يُنضَّد الكتاب في نافذة مخفية بمحرك البرنامج نفسه (Chromium المدمج في Electron)
// ثم يُطبع PDF — بديل Playwright في نسخة الموقع، فلا يحتاج البرنامج أي متصفح خارجي.
const { BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const LAYOUT_TIMEOUT = 45 * 60_000;
const POLL_MS = 400;
let printSession = null;

// مستند الطباعة لا يتصل بشيء: لا يُسمح إلا بملف المستند نفسه وخطوط Google حين يغيب الخط محلياً
function getSession() {
  if (printSession) return printSession;
  printSession = session.fromPartition('warraq-print'); // في الذاكرة فقط
  printSession.webRequest.onBeforeRequest((details, cb) => {
    const u = details.url;
    if (u.startsWith('file:') && u.includes('warraq-print-')) return cb({});
    if (/^(data|blob|about|devtools|chrome-error):/.test(u)) return cb({});
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return cb({});
    cb({ cancel: true });
  });
  return printSession;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// الغلاف الخارجي (صورة من استوديو الأغلفة) يُضاف صفحةً أولى، والخلفي صفحةً أخيرة، بعد اكتمال التنضيد
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

/**
 * @param {{html: string, outer: string|null, back?: string|null, probe?: Function}} job
 * @returns {Promise<{pdf: Buffer, layout: object, probe?: any}>}
 */
async function render({ html, outer, back, probe }) {
  const file = path.join(os.tmpdir(), `warraq-print-${crypto.randomBytes(8).toString('hex')}.html`);
  fs.writeFileSync(file, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      session: getSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  const wc = win.webContents;
  let crashed = null;
  wc.on('render-process-gone', (_e, d) => (crashed = new Error('توقّف محرك التنضيد: ' + d.reason)));
  try {
    await win.loadURL(pathToFileURL(file).href);
    const deadline = Date.now() + LAYOUT_TIMEOUT;
    for (;;) {
      if (crashed) throw crashed;
      if (await wc.executeJavaScript('window.__LAYOUT_DONE === true')) break;
      if (Date.now() > deadline) throw new Error('انتهت مهلة التنضيد');
      await sleep(POLL_MS);
    }
    const err = await wc.executeJavaScript('window.__LAYOUT_ERROR || null');
    if (err) throw new Error('خطأ في التنضيد: ' + err);
    const layout = await wc.executeJavaScript('JSON.parse(JSON.stringify(window.__LAYOUT ?? null))');
    const probed = probe ? await wc.executeJavaScript(`(${probe.toString()})()`) : undefined;
    if (outer || back) await wc.executeJavaScript(`(${insertCovers.toString()})(${JSON.stringify({ outer: outer || null, back: back || null })})`);
    const pdf = await wc.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return { pdf: Buffer.from(pdf), layout, probe: probed };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    fs.rm(file, { force: true }, () => {});
  }
}

module.exports = { render };
