// «مجلس الدرس» في العملية الرئيسية: صفحة الدرس متصفحٌ مدمج في البرنامج (webview) بجلسةٍ مستقلة تُحفظ،
// وقيودها، والدخول إلى حساب Google فيها (lesson-signin.cjs)، ومقاطع الجهاز، وسجلّ تشخيصٍ صغير.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSignin } = require('./lesson-signin.cjs');

const PARTITION = 'persist:lesson';
const GUEST_PRELOAD = path.join(__dirname, 'lesson-guest.cjs');
const MEDIA_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm|mp4|m4v|mkv|mov|3gp)$/i;
const MEDIA_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm', webm: 'video/webm', mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime', '3gp': 'video/3gpp' };

function setupLesson({ app, session, ipcMain, dialog, shell, Menu, clipboard, guard, getWin, log: logOut = () => {} }) {
  /* ---------------------------------------------------------------- سجلّ التشخيص (userData/logs/lesson.log) */
  const LOG = path.join(app.getPath('userData'), 'logs', 'lesson.log');
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 400_000) fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-150_000));
  } catch {}
  const log = (...a) => {
    const line = `${new Date().toISOString()} ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`;
    logOut(line);
    try {
      fs.appendFileSync(LOG, line + '\n');
    } catch {}
  };
  log('start', `electron ${process.versions.electron}`, `chrome ${process.versions.chrome}`, process.platform, process.arch);
  // ما تركته الإصدارات السابقة: ملفات متصفح الدرس الملتصق (١٣)، ونماذج التفريغ (١٢، مئات الميغابايتات)
  setTimeout(() => {
    for (const d of ['lesson-browser', 'whisper']) {
      const p = path.join(app.getPath('userData'), d);
      if (!fs.existsSync(p)) continue;
      fs.rm(p, { recursive: true, force: true, maxRetries: 3 }, (e) => log('cleanup', d, e ? e.message : 'removed'));
    }
  }, 4000);

  /* ---------------------------------------------------------------- الجلسة: تُحفظ (الدخول إلى يوتيوب وتيليجرام يبقى) */
  const ses = session.fromPartition(PARTITION);
  const ALLOW = new Set(['fullscreen', 'clipboard-sanitized-write', 'speaker-selection', 'storage-access', 'top-level-storage-access']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOW.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => ALLOW.has(perm));
  const send = (m) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send('warraq:lesson-web', m);
  };
  const signin = createSignin({ app, ses, emit: send, log });
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, signin.onHeaders);

  // هوية المتصفح لكل صفحة (يطلبها جسر صفحة الدرس قبل نصوصها)
  ipcMain.on('warraq:lesson-shim', (e, href) => {
    try {
      e.returnValue = e.sender.session === ses ? signin.shimFor(String(href || '')) : null;
    } catch {
      e.returnValue = null;
    }
  });

  /** يُربط بالنافذة الرئيسية: لا تُلحق صفحة درس إلا بقيودها */
  function wireHost(win) {
    const wc = win.webContents;
    wc.on('will-attach-webview', (e, wp, params) => {
      const src = String(params.src || '');
      if (!/^https?:\/\//i.test(src) && src !== 'about:blank') return e.preventDefault();
      delete wp.preloadURL;
      wp.preload = GUEST_PRELOAD;
      wp.nodeIntegration = false;
      wp.nodeIntegrationInSubFrames = true; // (الجسر وحده، بلا Node: هوية المتصفح في الإطارات أيضاً)
      wp.contextIsolation = true;
      wp.sandbox = true;
      wp.webSecurity = true;
      wp.allowRunningInsecureContent = false;
      wp.backgroundThrottling = false; // يبقى الصوت حين تُخفى الصورة («صوت فقط»)
      params.partition = PARTITION;
      delete params.allowpopups;
    });
    wc.on('did-attach-webview', (_e, guest) => {
      log('webview attached');
      signin.attachGuest(guest);
      // روابط «نافذة جديدة» تُفتح في الصفحة نفسها
      guest.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) guest.loadURL(url).catch(() => {});
        return { action: 'deny' };
      });
      guest.on('will-navigate', (e, url) => {
        if (!/^https?:/i.test(url)) e.preventDefault();
      });
      guest.on('render-process-gone', (_ev, d) => {
        log('webview gone', d.reason, d.exitCode, guest.isDestroyed() ? '' : guest.getURL().slice(0, 120));
        send({ type: 'gone', reason: d.reason });
      });
      guest.on('unresponsive', () => log('webview unresponsive', guest.getURL().slice(0, 120)));
      guest.on('did-fail-load', (_ev, code, desc, url, isMain) => isMain && code !== -3 && log('load failed', code, desc, String(url).slice(0, 120)));
      guest.on('destroyed', () => log('webview destroyed'));
      guest.on('context-menu', (_ev, p) => {
        const items = [];
        if (p.isEditable) items.push({ role: 'cut', label: 'قص' }, { role: 'copy', label: 'نسخ' }, { role: 'paste', label: 'لصق' });
        else if (p.selectionText && p.selectionText.trim()) items.push({ role: 'copy', label: 'نسخ' });
        if (p.linkURL && /^https?:/i.test(p.linkURL)) {
          if (items.length) items.push({ type: 'separator' });
          items.push({ label: 'افتح الرابط هنا', click: () => guest.loadURL(p.linkURL).catch(() => {}) });
          items.push({ label: 'نسخ الرابط', click: () => clipboard.writeText(p.linkURL) });
        }
        if (items.length) items.push({ type: 'separator' });
        items.push({ label: 'رجوع', enabled: guest.navigationHistory.canGoBack(), click: () => guest.navigationHistory.goBack() });
        items.push({ label: 'تحديث', click: () => guest.reload() });
        items.push({ label: 'افتح الصفحة في متصفحك', click: () => shell.openExternal(guest.getURL()) });
        Menu.buildFromTemplate(items).popup({ window: win });
      });
    });
  }

  /* ---------------------------------------------------------------- الحساب */
  ipcMain.handle('warraq:lesson-account', guard(() => signin.account()));
  ipcMain.handle('warraq:lesson-signin', guard(() => ({ url: signin.begin() })));
  ipcMain.handle('warraq:lesson-signout', guard(() => signin.signOut()));
  ipcMain.handle('warraq:lesson-via-browser', guard((id) => signin.viaBrowser(String(id || ''))));
  ipcMain.handle('warraq:lesson-cancel-browser', guard(() => signin.cancelBrowser()));
  ipcMain.handle('warraq:lesson-home', guard(() => signin.HOME_URL));
  ipcMain.handle(
    'warraq:lesson-log',
    guard((line) => {
      if (typeof line === 'string' && line) log('ui', line.slice(0, 300));
      try {
        return fs.readFileSync(LOG, 'utf8').slice(-30_000);
      } catch {
        return '';
      }
    }),
  );

  /* ---------------------------------------------------------------- مقاطع الجهاز: تُخدم من الخادم الداخلي بعنوانٍ مؤقت (مع التقديم والتأخير) */
  const tokens = new Map(); // الرمز ← المسار
  const byPath = new Map();
  function register(p) {
    if (typeof p !== 'string' || !path.isAbsolute(p) || !MEDIA_EXT.test(p) || !fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error('ليس ملف صوتٍ أو مقطعاً');
    let t = byPath.get(p);
    if (!t) {
      t = crypto.randomBytes(12).toString('hex');
      tokens.set(t, p);
      byPath.set(p, t);
    }
    const name = path.basename(p);
    const ext = path.extname(p).slice(1).toLowerCase();
    return { url: `/lesson-media/${t}/${encodeURIComponent(name)}`, name, path: p, video: /^(webm|mp4|m4v|mkv|mov|3gp)$/.test(ext), type: MEDIA_TYPES[ext] || '' };
  }
  globalThis.__warraqLessonMedia = (token) => {
    const p = tokens.get(token);
    return p ? { path: p, type: MEDIA_TYPES[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream' } : null;
  };
  ipcMain.handle(
    'warraq:lesson-pick',
    guard(async () => {
      const r = await dialog.showOpenDialog(getWin() || undefined, {
        title: 'درسٌ من جهازك',
        buttonLabel: 'ضعه بجانب الكتاب',
        properties: ['openFile'],
        filters: [{ name: 'صوت أو مقطع', extensions: Object.keys(MEDIA_TYPES) }],
      });
      if (r.canceled || !r.filePaths.length) return null;
      return register(r.filePaths[0]);
    }),
  );
  ipcMain.handle('warraq:lesson-media', guard((p) => register(String(p || ''))));

  app.on('will-quit', () => signin.close());
  return { wireHost, session: ses, signin, log };
}

module.exports = { setupLesson, PARTITION };
