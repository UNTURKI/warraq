// المتصفحات المثبّتة على الجهاز (كروم، إيدج، بريف)، وعميل Chrome DevTools Protocol صغير.
// يُستعمل لشيءٍ واحد: «سجّل الدخول عبر متصفحك» — نافذة دخولٍ عادية في متصفحٍ حقيقي بملفٍّ مؤقت،
// يُقرأ منها الدخول (الكعكات) حين يتمّ، ثم تُغلق ويُحذف ملفها (lesson-signin.cjs).
const fs = require('node:fs');
const path = require('node:path');

const BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', win: ['%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe', '%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe', '%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe'], other: ['/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
  { id: 'edge', name: 'Microsoft Edge', win: ['%PROGRAMFILES(X86)%\\Microsoft\\Edge\\Application\\msedge.exe', '%PROGRAMFILES%\\Microsoft\\Edge\\Application\\msedge.exe', '%LOCALAPPDATA%\\Microsoft\\Edge\\Application\\msedge.exe'], other: ['/usr/bin/microsoft-edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
  { id: 'brave', name: 'Brave', win: ['%PROGRAMFILES%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%PROGRAMFILES(X86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'], other: ['/usr/bin/brave-browser', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
];
const env = (p) => p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || process.env[k.toUpperCase()] || '');

/** المتصفحات المثبّتة ← [{ id, name, path }] (وللاختبار WARRAQ_LESSON_BROWSER) */
function findBrowsers() {
  const out = [];
  if (process.env.WARRAQ_LESSON_BROWSER && fs.existsSync(process.env.WARRAQ_LESSON_BROWSER)) out.push({ id: 'test', name: 'Chromium', path: process.env.WARRAQ_LESSON_BROWSER });
  for (const b of BROWSERS) {
    const list = process.platform === 'win32' ? b.win.map(env) : b.other;
    const p = list.find((x) => x && fs.existsSync(x));
    if (p) out.push({ id: b.id, name: b.name, path: p });
  }
  return out;
}

/** عميل CDP صغير (WebSocket في Node) */
function cdpClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const handlers = new Set();
    const c = {
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          if (c.closed) return rej(new Error('أُغلق المتصفح'));
          const n = ++id;
          pending.set(n, { res, rej, method });
          ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
      },
      on: (f) => handlers.add(f),
      close: () => {
        try {
          ws.close();
        } catch {}
      },
      closed: false,
    };
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error('تعذّر الاتصال بالمتصفح'));
    ws.onclose = (ev) => {
      c.closed = true;
      c.closeCode = ev && ev.code;
      for (const p of pending.values()) p.rej(new Error('أُغلق المتصفح'));
      pending.clear();
      handlers.forEach((f) => f({ method: '__closed' }));
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      } catch {
        return;
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`));
        else p.res(m.result);
      } else if (m.method) handlers.forEach((f) => f(m));
    };
  });
}

/** عنوان CDP من ملف DevToolsActivePort الذي يكتبه المتصفح في مجلد ملفه */
async function devtoolsPort(dir, child, ms = 30000) {
  const f = path.join(dir, 'DevToolsActivePort');
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child && child.exitCode != null) throw new Error(`خرج المتصفح قبل أن يبدأ (الرمز ${child.exitCode})`);
    try {
      const [port, p] = fs.readFileSync(f, 'utf8').split('\n');
      if (+port) return `ws://127.0.0.1:${+port}${p.trim()}`;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('لم يستجب المتصفح');
}

module.exports = { findBrowsers, cdpClient, devtoolsPort };
