// «ورّاق» لسطح المكتب — العملية الرئيسية للبرنامج
// يشغّل خادم ورّاق داخل البرنامج نفسه (لا يُرى ولا يصل إليه غير هذا الجهاز) ويعرض واجهته في نافذة البرنامج.
// الخادم يعمل في «وضع البرنامج» (WARRAQ_DESKTOP=1): بلا صفحة رئيسية ولا صفحة تنزيل ولا باب خفي،
// والمالك هو نافذة البرنامج نفسها (ترويسة سرية في كل طلب)، انظر app/lib/desktop.js.
const { app, BrowserWindow, Menu, shell, dialog, session, ipcMain, nativeTheme, net, Notification, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createStore } = require('./desk-store.cjs');
const { setupLesson } = require('./lesson.cjs');
const { createMods } = require('./mods.cjs');

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
// أيقونة البرنامج: في Windows ملف ‎.ico‎ بمقاساته كلها (16 إلى 256)، فلا يُصغَّر الشعار ولا يُستبدل به شعار Electron
const ICON_PNG = path.join(__dirname, 'icon.png');
const ICON = process.platform === 'win32' ? path.join(__dirname, 'icon.ico') : ICON_PNG;
// أيقونة السِّراج: إذا أُوقد السِّراج صارت أيقونة البرنامج ذهباً على لازورد
const ICON_NIGHT = path.join(__dirname, process.platform === 'win32' ? 'icon-night.ico' : 'icon-night.png');
const PRELOAD = path.join(__dirname, 'preload.cjs');
const OWN_FILES = pathToFileURL(__dirname).href + '/'; // صفحات البرنامج نفسه (الافتتاح، عن ورّاق)
const PKG = require('../package.json');
// عنوان موقع ورّاق: إليه تُرسل الملاحظات من «مساعدة ← أرسل ملاحظة» (يُضبط في package.json ← warraq.siteUrl)
const SITE_URL = String((PKG.warraq && PKG.warraq.siteUrl) || '').trim().replace(/\/+$/, '');
const CONTACT_MAIL = String((PKG.warraq && PKG.warraq.mail) || 'faqeeh.university@gmail.com');
const FEEDBACK_TYPES = { complaint: 'شكوى', suggestion: 'اقتراح', bug: 'خلل تقني', book: 'مشكلة في كتاب', other: 'أخرى' };
// منفذ ثابت: بيانات المتصفح المحفوظة (أساليبي، ملاحظات الكتب...) مرتبطة بعنوان الصفحة، فيجب أن يبقى ثابتاً
const PREFERRED_PORT = 43117;
// مفتاح هذه الجلسة: تحمله نوافذ البرنامج وحدها، فلا تفتح «الإعدادات» صفحةُ ويب من متصفح آخر على الجهاز
const DESK_KEY = crypto.randomBytes(24).toString('hex');

// السِّراج كما تركه المستخدم آخر مرة (يُحفظ حين يتغيّر)، وإلا وضع ويندوز
let lampOn = () => nativeTheme.shouldUseDarkColors;
const bg = () => (lampOn() ? '#0F1A2B' : '#FBF8F1');
// شريط العنوان الخاص بالبرنامج: أزرار النافذة يرسمها ويندوز فوقه بلونه (الكاغد، أو السِّراج)
const TITLEBAR = { height: 38, light: { color: '#F3EFE6', symbolColor: '#2A1D14' }, dark: { color: '#16243B', symbolColor: '#EDE3CB' } };

// نسخة المتجر: هويتها وروابطها وملفاتها من بيان الحزمة، ولا تُكتب في السجل
const STORE = !!process.windowsStore;
if (!STORE) app.setAppUserModelId('com.alwarraq.app');
// «مجلس الدرس»: المقطع يعمل حين يُطلب من أزرار البرنامج (لا ينتظر نقرةً في صفحته)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// روابط warraq:// (زرّا إشعار التمام: افتح المجلد، ضعه على الرَّحل) تصل إلى البرنامج نفسه
if (STORE) {
  /* من بيان الحزمة */
} else if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('warraq', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('warraq');

// نسخة واحدة من البرنامج: فتحه مرة ثانية يُظهر النافذة القائمة
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  let port = null;
  let mainWin = null;
  const store = createStore(app.getPath('userData'));
  lampOn = () => {
    const l = store.prefs().lamp;
    return typeof l === 'boolean' ? l : nativeTheme.shouldUseDarkColors;
  };
  let lesson = null; // «مجلس الدرس»: صفحة الدرس (متصفحٌ مدمج والدخول إلى Google فيه)، ومقاطع الجهاز
  // «الطِّراز»: المودات (electron/mods.cjs). كل تغيّرٍ فيها يُبلَّغ إلى كل النوافذ فتطابقه صفحاتها بلا إعادة تحميل
  const mods = createMods({
    userData: app.getPath('userData'),
    galleryDir: path.join(__dirname, 'mods-gallery'),
    templateDir: path.join(__dirname, 'mods-template'),
    onChange: (ev) => {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('warraq:mods', ev);
    },
  });
  // البدء في الوضع الآمن (بلا مودات): --safe-mode
  if (process.argv.includes('--safe-mode')) mods.setSafe(true, 'start');
  globalThis.__warraqMods = mods.serverHooks();
  const singles = new Map(); // نوافذ لا تُفتح إلا مرة: الإعدادات، عن ورّاق، الهوية
  const openedBooks = new Set(); // كتب ورّاق فتحها المستخدم (تُحفظ فيها تعديلاته)

  /* ---------------------------------------------------------------- إعدادات البرنامج وحالة النافذة */
  const userFile = (n) => path.join(app.getPath('userData'), n);
  const readJson = (n, def) => {
    try {
      return JSON.parse(fs.readFileSync(userFile(n), 'utf8'));
    } catch {
      return def;
    }
  };
  const writeJson = (n, v) => {
    try {
      fs.writeFileSync(userFile(n), JSON.stringify(v, null, 1));
    } catch {}
  };
  const readState = () => readJson('window-state.json', { width: 1360, height: 880, maximized: true });
  const saveState = (win) => {
    try {
      writeJson('window-state.json', { ...win.getNormalBounds(), maximized: win.isMaximized() });
    } catch {}
  };
  /** مجلد الكتب: فيه مجلد لكل كتاب يُخرَج (الأصل: المستندات\الورّاق) */
  const outRoot = () => {
    const s = store.prefs();
    return s.outDir && path.isAbsolute(s.outDir) ? s.outDir : path.join(app.getPath('documents'), 'الورّاق');
  };
  const inside = (p, dir) => {
    const rel = path.relative(dir, p);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  };

  const isLocal = (u) => {
    try {
      const x = new URL(u);
      return x.hostname === '127.0.0.1' && x.port === String(port);
    } catch {
      return false;
    }
  };
  const openOutside = (u) => {
    if (/^(https?|mailto):/i.test(u)) shell.openExternal(u);
  };
  const webPrefs = () => ({ preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false });

  async function startServer() {
    process.env.WARRAQ_DATA_DIR = path.join(app.getPath('userData'), 'data');
    process.env.HOST = '127.0.0.1';
    process.env.PORT = String(PREFERRED_PORT);
    process.env.WARRAQ_DESKTOP = '1';
    process.env.WARRAQ_DESKTOP_KEY = DESK_KEY;
    // عدد النسّاخ (المجلدات التي تُنضَّد معاً) من الإعدادات: يسري من بدء البرنامج
    const sc = Math.round(+store.prefs().scribes);
    process.env.WARRAQ_RENDER_PARALLEL = String(sc >= 1 && sc <= 8 ? sc : 2);
    delete process.env.WARRAQ_OPEN;
    delete process.env.WARRAQ_ADMIN_DIRECT;
    globalThis.__warraqPdfEngine = require('./pdf-engine.cjs').render;
    // تنزيل ملفات الكتب الكاملة («تراث») بشبكة Chromium نفسها: وكيل ويندوز وشهاداته، كما يتصفّح البرنامج (app/lib/turath.js)
    globalThis.__warraqNetFetch = (url, init) => require('electron').net.fetch(url, init);
    // خطوط الجهاز: تُعرض في البرنامج مع خطوطه (الكتاب، الأساليب، الأغلفة)
    try {
      globalThis.__warraqSystemFonts = require('./system-fonts.cjs').scan(path.join(app.getPath('userData'), 'system-fonts.json'));
    } catch {
      globalThis.__warraqSystemFonts = [];
    }
    const listening = new Promise((resolve) => process.once('warraq:listening', resolve));
    await import(pathToFileURL(path.join(APP_DIR, 'server.js')).href);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('لم يبدأ الخادم الداخلي خلال المهلة')), 30_000));
    port = await Promise.race([listening, timeout]);
  }

  /* ---------------------------------------------------------------- النوافذ */
  // كل نوافذ البرنامج (الرئيسية وما يُفتح منها) تتبع القواعد نفسها
  function wireWindow(win) {
    const wc = win.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (isLocal(url) || url === 'about:blank' || url.startsWith('blob:')) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON, backgroundColor: bg(), width: 1200, height: 860, webPreferences: webPrefs() },
        };
      }
      openOutside(url);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child) => wireWindow(child));
    wc.on('will-navigate', (e, url) => {
      if (!isLocal(url) && !url.startsWith(OWN_FILES)) {
        e.preventDefault();
        openOutside(url);
      }
    });
    // صفحة فيها عمل لم يُحفظ (محرر الأساليب، أو إخراج جارٍ): السؤال قبل المغادرة أو الإغلاق.
    // (بلا هذا يمنع Electron المغادرة صامتاً، فلا يُغلق البرنامج ولا يعمل الرابط)
    wc.on('will-prevent-unload', (e) => {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'question',
        buttons: ['البقاء في الصفحة', 'المغادرة'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'ورّاق',
        message: 'في هذه الصفحة عمل لم يكتمل أو لم يُحفظ',
        detail: 'إن غادرتها الآن ضاع ما لم يُحفظ.',
      });
      if (choice === 1) e.preventDefault();
    });
    // قائمة الزر الأيمن بالعربية
    wc.on('context-menu', (_e, p) => {
      const items = [];
      if (p.isEditable) {
        items.push(
          { role: 'undo', label: 'تراجع' },
          { role: 'redo', label: 'إعادة' },
          { type: 'separator' },
          { role: 'cut', label: 'قص' },
          { role: 'copy', label: 'نسخ' },
          { role: 'paste', label: 'لصق' },
          { type: 'separator' },
          { role: 'selectAll', label: 'تحديد الكل' },
        );
      } else if (p.selectionText && p.selectionText.trim()) {
        items.push({ role: 'copy', label: 'نسخ' });
      }
      if (p.linkURL && !isLocal(p.linkURL) && /^https?:/i.test(p.linkURL)) {
        if (items.length) items.push({ type: 'separator' });
        items.push({ label: 'فتح الرابط في المتصفح', click: () => shell.openExternal(p.linkURL) });
        items.push({ label: 'نسخ الرابط', click: () => require('electron').clipboard.writeText(p.linkURL) });
      }
      if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
    });
    // أزرار الرجوع والتقدم في الفأرة
    win.on('app-command', (_e, cmd) => {
      const h = wc.navigationHistory;
      if (cmd === 'browser-backward' && h.canGoBack()) h.goBack();
      if (cmd === 'browser-forward' && h.canGoForward()) h.goForward();
    });
  }

  /** نافذة لا تُفتح إلا مرة: إن كانت مفتوحة ظهرت */
  function single(name, make) {
    const old = singles.get(name);
    if (old && !old.isDestroyed()) {
      if (old.isMinimized()) old.restore();
      old.show();
      old.focus();
      return old;
    }
    const win = make();
    singles.set(name, win);
    win.on('closed', () => singles.delete(name));
    return win;
  }
  function pageWindow(name, url, opts = {}) {
    if (!port) return null;
    return single(name, () => {
      const win = new BrowserWindow({ width: 1180, height: 860, minWidth: 720, minHeight: 520, icon: ICON, backgroundColor: bg(), autoHideMenuBar: true, show: false, webPreferences: webPrefs(), ...opts });
      wireWindow(win);
      win.once('ready-to-show', () => win.show());
      win.loadURL(`http://127.0.0.1:${port}${url}`);
      return win;
    });
  }
  const WINDOWS = {
    // الإعدادات في نافذتها: فلا يضيع الكتاب المفتوح في النافذة الرئيسية
    settings: () => {
      // نافذة برنامج كما في الملف: شريط عنوانها منها (يرسمه settings-desk.js) وأزرار النافذة يرسمها ويندوز
      const win = pageWindow('settings', '/admin/', {
        title: 'الإعدادات — ورّاق',
        width: 1000,
        height: 700,
        minWidth: 760,
        minHeight: 480,
        titleBarStyle: 'hidden',
        titleBarOverlay: { ...(nativeTheme.shouldUseDarkColors ? TITLEBAR.dark : TITLEBAR.light), height: TITLEBAR.height },
      });
      // ما تغيّر في الإعدادات (المظهر، الخطوط…) يصل إلى النوافذ المفتوحة حين تُغلق
      if (win && !win.__warraqWired) {
        win.__warraqWired = true;
        win.on('closed', () => {
          for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('warraq:menu', 'settings-changed');
        });
      }
      return win;
    },
    identity: () => pageWindow('identity', '/identity/', { title: 'هوية ورّاق' }),
    // الرَّحل والخزانة أبواب في النافذة الرئيسية (الهيكل)
    rahl: () => toDoor('rahl'),
    // إعدادات الطباعة: في باب «الأساليب»
    print: () => toDoor('styles#/print'),
    // جولة البداية (من الإعدادات ← عام)
    onboard: () => toShell('onboard'),
    khizana: () => toDoor('khizana'),
    card: () => pageWindow('card', '/card/', { title: 'اصنع بطاقتك — ورّاق' }),
    about: () =>
      single('about', () => {
        const win = new BrowserWindow({
          width: 540,
          height: 700,
          resizable: false,
          minimizable: false,
          maximizable: false,
          parent: mainWin || undefined,
          title: 'عن ورّاق',
          icon: ICON,
          backgroundColor: bg(),
          autoHideMenuBar: true,
          show: false,
          webPreferences: webPrefs(),
        });
        win.setMenu(null);
        wireWindow(win);
        win.once('ready-to-show', () => win.show());
        win.loadFile(path.join(__dirname, 'about.html'), { query: { v: app.getVersion() } });
        return win;
      }),
  };

  /** النافذة التي يُوجَّه إليها أمر القائمة: المركّزة إن لم تكن من النوافذ المفردة، وإلا الرئيسية */
  const target = () => {
    const f = BrowserWindow.getFocusedWindow();
    return f && !f.isDestroyed() && ![...singles.values()].includes(f) ? f : mainWin;
  };
  const onApp = (w) => {
    try {
      return new URL(w.webContents.getURL()).pathname === '/app/';
    } catch {
      return false;
    }
  };
  /** أمرٌ إلى الهيكل في النافذة الرئيسية (فتح باب، كتاب جديد، حفظ المشروع…) */
  function toShell(cmd) {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
    mainWin.webContents.send('warraq:menu', cmd);
  }
  const toDoor = (door) => toShell('door:' + door);
  /** كتاب جديد: في نافذة إخراج مستقلة إن كانت هي المركّزة، وإلا على المنضدة في الهيكل */
  function newBook() {
    const f = BrowserWindow.getFocusedWindow();
    if (f && !f.isDestroyed() && f !== mainWin && onApp(f)) return f.webContents.send('warraq:menu', 'new-book');
    toShell('new-book');
  }

  /* ---------------------------------------------------------------- فتح الملفات: من مستكشف الملفات، و«فتح»، وسطر الأوامر */
  // ما يُطلب قبل أن يجهز الهيكل يُحفظ حتى يجهز
  const pending = [];
  let shellReady = false;
  function openJob(job) {
    if (!shellReady || !mainWin) return void pending.push(job);
    // «أضفه إلى طابور النسّاخ»: يُخرج في الخلفية دون أن تُفتح النافذة
    if (job.mode !== 'queue') {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
    mainWin.webContents.send('warraq:open-file', job);
    if (job.paths && job.paths[0] && /\.(waraq|warraq)$/i.test(job.paths[0])) app.addRecentDocument(job.paths[0]);
  }
  /** طلبٌ لا يحتاج النافذة: «أضفه إلى طابور النسّاخ» وحده، أو رابط «افتح المجلد» من الإشعار */
  function quietArgs(argv) {
    const args = argv.slice(app.isPackaged ? 1 : 2).filter((a) => a && a !== '.');
    if (!args.length) return false;
    const queue = args.includes('--queue') && args.every((a) => a === '--queue' || !a.startsWith('-'));
    const folder = args.every((a) => /^warraq:\/\/folder\b/i.test(a));
    return queue || folder;
  }
  /** سطر الأوامر ← طلبات فتح: --output و --queue و --rahl والملف وحده، و --new و --door=… */
  function handleArgs(argv) {
    const args = argv.slice(app.isPackaged ? 1 : 2);
    let mode = '';
    for (const a of args) {
      if (/^warraq:/i.test(a)) openLink(a);
      else if (a === '--new') toShell('new-book');
      else if (/^--door=(khizana|bench|muharrir|rahl|styles|covers|tiraz)$/.test(a)) toDoor(a.slice(7));
      else if (a === '--output' || a === '--queue' || a === '--rahl') mode = a.slice(2);
      else if (!a.startsWith('-')) {
        const p = path.resolve(a);
        const ext = path.extname(p).toLowerCase();
        // مود (‎.wqmod‎): يُفحص في «الطِّراز» ويُسأل المستخدم قبل تثبيته
        if (ext === '.wqmod' && fs.existsSync(p)) {
          openJob({ mode: 'mod', path: p, paths: [p], name: path.basename(p) });
          continue;
        }
        if (!['.waraq', '.warraq', '.docx', '.pdf'].includes(ext) || !fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
        // ملف PDF وحده (فُتح بالبرنامج، أو سُحب على أيقونته): للقراءة على الرَّحل
        const m = mode || (ext === '.pdf' ? 'rahl' : 'output');
        if (m === 'output' && ext !== '.warraq' && ext !== '.waraq') batchOutput(p);
        else openJob({ mode: m === 'output' ? 'bench' : m, path: p, paths: [p], name: path.basename(p) });
        mode = '';
      }
    }
  }
  // عدة ملفات حُددت معاً ثم «أخرِجه بورّاق»: يفتح Windows البرنامج لكل ملف؛ تُجمع فتصير مجلدات كتاب واحد (كالسحب)
  let batch = [];
  let batchT = null;
  function batchOutput(p) {
    batch.push(p);
    clearTimeout(batchT);
    batchT = setTimeout(() => {
      const paths = batch.splice(0);
      openJob({ mode: 'bench', path: paths[0], paths, name: path.basename(paths[0]) });
    }, 700);
  }
  async function openDialogFor(mode) {
    const r = await dialog.showOpenDialog(mainWin || undefined, {
      title: mode === 'rahl' ? 'ضع كتاباً على الرَّحل' : 'فتح كتاب أو مشروع',
      defaultPath: mode === 'rahl' ? outRoot() : app.getPath('documents'),
      buttonLabel: 'فتح',
      properties: mode === 'rahl' ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: mode === 'rahl' ? [{ name: 'كتاب PDF أو وَرَق', extensions: ['pdf', 'waraq', 'warraq'] }] : [{ name: 'وَرَق، أو Word أو PDF', extensions: ['waraq', 'warraq', 'docx', 'pdf'] }],
    });
    if (r.canceled || !r.filePaths.length) return;
    const proj = r.filePaths.find((p) => /\.(waraq|warraq)$/i.test(p));
    if (proj && mode !== 'rahl') return openJob({ mode: 'bench', path: proj, paths: [proj], name: path.basename(proj) });
    openJob({ mode: mode === 'rahl' ? 'rahl' : 'bench', path: r.filePaths[0], paths: r.filePaths, name: path.basename(r.filePaths[0]) });
  }

  /* ---------------------------------------------------------------- العمل في الخلفية: أيقونة شريط المهام، ومنع السكون، والإشعار */
  const busy = new Map(); // المصدر (المنضدة، النسّاخ) ← { pct, title, phase }
  let blocker = null;
  // «الأيقونة تتنفّس»: نقط الألف في أيقونة شريط المهام تمتلئ ذهباً مع كل مرحلة:
  // ١ الجلب، ٢ التنضيد، ٣ الغلاف، ٤ الكتابة، ٥ التمام (يبقى حتى يعود المستخدم إلى النافذة)
  // وفي السِّراج: البلاطة اللازوردية والألف الذهبي (stage-N-night)
  const STAGE_ICON = (n) => path.join(__dirname, 'stages', `stage-${n}${nightIcon ? '-night' : ''}.${process.platform === 'win32' ? 'ico' : 'png'}`);
  let shownStage = 0;
  let doneStage = false;
  let nightIcon = lampOn();
  function paintStage() {
    if (!mainWin || mainWin.isDestroyed()) return;
    const phases = [...busy.values()].map((b) => b.phase || 1);
    const n = phases.length ? Math.max(1, Math.min(5, Math.max(...phases))) : doneStage ? 5 : 0;
    if (n === shownStage) return;
    shownStage = n;
    try {
      mainWin.setIcon(n ? STAGE_ICON(n) : nightIcon ? ICON_NIGHT : ICON);
    } catch {}
  }
  function setBusy(source, info) {
    if (info && info.done) {
      busy.delete(source);
      // تمّ والنافذة في غير المقدّمة: الألف بنقطه الخمس ذهباً حتى يعود إليها
      doneStage = !(mainWin && mainWin.isFocused() && !mainWin.isMinimized());
      if (!doneStage && mainWin) {
        doneStage = true;
        setTimeout(() => ((doneStage = false), paintStage()), 4000);
      }
    } else if (info && Number.isFinite(+info.pct)) {
      busy.set(source, { pct: Math.max(0, Math.min(100, +info.pct)), title: String(info.title || ''), phase: Math.max(1, Math.min(5, +info.phase || 1)) });
      doneStage = false;
    } else busy.delete(source);
    paintStage();
    const any = [...busy.values()];
    if (mainWin && !mainWin.isDestroyed()) mainWin.setProgressBar(any.length ? Math.max(0.02, any[0].pct / 100) : -1);
    // «امنع الجهاز من السكون» في الإعدادات (مفعّل ما لم يُطفأ)
    const awake = store.prefs().keepAwake !== false;
    if (any.length && awake && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if ((!any.length || !awake) && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
  }
  // «إشعار بالتمام»: إشعار ويندوز حقيقي يبقى في مركز الإشعارات، وزرّاه يفتحان المجلد أو القارئ (روابط warraq://)
  const xmlEsc = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
  const notes = new Set(); // يُحفظ الإشعار ما دام ظاهراً (وإلا جمعه المنظِّف فلا يستجيب للنقر)
  function notify({ title, body, door, book, source }) {
    // «أشعرني إذا فرغ النسّاخ» في الإعدادات (مفعّل ما لم يُطفأ)
    if (!Notification.isSupported() || store.prefs().notify === false) return;
    const away = !mainWin || !mainWin.isFocused() || mainWin.isMinimized();
    // إخراجٌ على المنضدة والمستخدم أمامها: يرى التمام بعينه
    if (source === 'bench' && !away) return;
    const rec = book ? store.listBooks().find((b) => b.id === book) : null;
    const opts = { title: String(title || 'ورّاق'), body: String(body || ''), icon: ICON_PNG, silent: false };
    if (process.platform === 'win32') {
      const id = rec ? encodeURIComponent(rec.id) : '';
      const pdfAt = rec ? rec.volumes.findIndex((v) => v.pdf) : -1;
      opts.toastXml = `<toast activationType="protocol" launch="warraq://door/${xmlEsc(door || 'khizana')}">
  <visual><binding template="ToastGeneric"><text>${xmlEsc(opts.title)}</text><text>${xmlEsc(opts.body)}</text></binding></visual>
  ${rec ? `<actions><action content="افتح المجلد" activationType="protocol" arguments="warraq://folder?book=${id}"/>${pdfAt >= 0 ? `<action content="ضعه على الرَّحل" activationType="protocol" arguments="warraq://rahl?book=${id}&amp;v=${pdfAt}"/>` : ''}</actions>` : ''}
</toast>`;
    }
    const n = new Notification(opts);
    notes.add(n);
    n.on('click', () => toDoor(door || 'khizana'));
    n.on('close', () => notes.delete(n));
    n.show();
    // يومض زر البرنامج في شريط المهام إن كانت نافذته مصغّرة أو في الخلف
    if (mainWin && away) mainWin.flashFrame(true);
  }
  /** روابط warraq:// من الإشعار: المجلد، أو المجلد الأول على الرَّحل، أو باب */
  function openLink(u) {
    let url;
    try {
      url = new URL(u);
    } catch {
      return;
    }
    if (url.protocol !== 'warraq:') return;
    const what = url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0];
    if (what === 'door') return toDoor((url.pathname.replace(/^\/+/, '') || 'khizana').replace(/[^a-z]/g, '') || 'khizana');
    const rec = store.listBooks().find((b) => b.id === url.searchParams.get('book'));
    if (!rec) return toDoor('khizana');
    if (what === 'folder' && rec.dir && fs.existsSync(rec.dir)) return void shell.openPath(rec.dir);
    if (what === 'rahl') {
      const v = rec.volumes[+url.searchParams.get('v') || 0];
      if (v && v.pdf && fs.existsSync(v.pdf)) return openJob({ mode: 'rahl', path: v.pdf, paths: [v.pdf], name: path.basename(v.pdf) });
    }
    toDoor('khizana');
  }

  function buildMenu() {
    const template = [
      {
        label: 'ملف',
        submenu: [
          { label: 'كتاب جديد', accelerator: 'CommandOrControl+N', click: newBook },
          { label: 'فتح كتاب أو مشروع…', accelerator: 'CommandOrControl+O', click: () => openDialogFor('bench') },
          { label: 'حفظ الكتاب باسم (وَرَق)…', accelerator: 'CommandOrControl+Shift+S', click: () => toShell('save-project') },
          { label: 'حفظ المشروع', accelerator: 'CommandOrControl+S', visible: false, click: () => toShell('save-project') },
          { label: 'أخرِج الكتاب', accelerator: 'CommandOrControl+E', click: () => toShell('export') },
          { type: 'separator' },
          { label: 'ضع كتاباً على الرَّحل…', click: () => openDialogFor('rahl') },
          { type: 'separator' },
          {
            label: 'فتح مجلد الكتب',
            click: () => {
              fs.mkdirSync(outRoot(), { recursive: true });
              shell.openPath(outRoot());
            },
          },
          {
            label: 'تغيير مجلد الكتب…',
            click: async () => {
              const r = await dialog.showOpenDialog(target() || undefined, {
                title: 'اختر المجلد الذي تُحفظ فيه الكتب',
                defaultPath: outRoot(),
                buttonLabel: 'اختيار هذا المجلد',
                properties: ['openDirectory', 'createDirectory'],
              });
              if (r.canceled || !r.filePaths[0]) return;
              store.setPrefs({ outDir: r.filePaths[0] });
              dialog.showMessageBox(target() || undefined, { type: 'info', title: 'ورّاق', message: 'تُحفظ الكتب من الآن في:', detail: r.filePaths[0] });
            },
          },
          { label: 'فتح مجلد بيانات البرنامج', click: () => shell.openPath(app.getPath('userData')) },
          { type: 'separator' },
          { label: 'الإعدادات', accelerator: 'CommandOrControl+,', click: () => WINDOWS.settings() },
          { type: 'separator' },
          { role: 'quit', label: 'خروج' },
        ],
      },
      {
        label: 'تحرير',
        submenu: [
          { role: 'undo', label: 'تراجع' },
          { role: 'redo', label: 'إعادة' },
          { type: 'separator' },
          { role: 'cut', label: 'قص' },
          { role: 'copy', label: 'نسخ' },
          { role: 'paste', label: 'لصق' },
          { role: 'selectAll', label: 'تحديد الكل' },
        ],
      },
      {
        label: 'عرض',
        submenu: [
          { label: 'القلم: اكتب ما تريد…', accelerator: 'CommandOrControl+K', click: () => toShell('palette') },
          { label: 'السِّراج (الوضع الليلي)', accelerator: 'CommandOrControl+L', click: () => toShell('lamp') },
          { type: 'separator' },
          { label: 'الخزانة', accelerator: 'CommandOrControl+1', click: () => toDoor('khizana') },
          { label: 'المِنضدة', accelerator: 'CommandOrControl+2', click: () => toDoor('bench') },
          { label: 'المحرِّر', accelerator: 'CommandOrControl+3', click: () => toDoor('muharrir') },
          { label: 'الرَّحل', accelerator: 'CommandOrControl+4', click: () => toDoor('rahl') },
          { label: 'الأساليب', accelerator: 'CommandOrControl+5', click: () => toDoor('styles') },
          { label: 'المجلِّد', accelerator: 'CommandOrControl+6', click: () => toDoor('covers') },
          { label: 'الطِّراز (المودات)', accelerator: 'CommandOrControl+7', click: () => toDoor('tiraz') },
          // مخرجٌ لا يتوقف على الواجهة: مودٌ أفسدها يُوقف من هنا (أو بالاختصار) فتعود كما كانت
          { label: 'أوقف المودات كلها (الوضع الآمن)', accelerator: 'CommandOrControl+Alt+Shift+M', click: () => safeMode('key') },
          { type: 'separator' },
          { label: 'رجوع', accelerator: 'Alt+Left', click: () => target()?.webContents.navigationHistory.goBack() },
          { label: 'تقدم', accelerator: 'Alt+Right', click: () => target()?.webContents.navigationHistory.goForward() },
          { role: 'reload', label: 'إعادة التحميل' },
          { label: 'أصلح البرنامج (أعده إلى حاله الطبيعي)…', accelerator: 'CommandOrControl+Shift+R', click: () => repair() },
          { type: 'separator' },
          { role: 'zoomIn', label: 'تكبير', accelerator: 'CommandOrControl+=' },
          { role: 'zoomOut', label: 'تصغير' },
          { role: 'resetZoom', label: 'الحجم الأصلي' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'ملء الشاشة' },
          { role: 'toggleDevTools', label: 'أدوات المطوّر' },
        ],
      },
      {
        label: 'مساعدة',
        submenu: [
          {
            label: 'أرسل ملاحظة أو شكوى…',
            click: () => {
              const w = BrowserWindow.getFocusedWindow() || mainWin;
              if (w && !w.isDestroyed() && w !== singles.get('about')) w.webContents.send('warraq:menu', 'feedback');
            },
          },
          { label: 'جولة البداية', click: () => toShell('onboard') },
          { type: 'separator' },
          { label: 'عن ورّاق', click: () => WINDOWS.about() },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  /* ---------------------------------------------------------------- الجسر (preload.cjs) */
  // لا يُقبل طلب إلا من صفحات ورّاق نفسها: الخادم الداخلي، أو صفحات البرنامج
  const fromUs = (e) => {
    const u = (e.senderFrame && e.senderFrame.url) || '';
    return isLocal(u) || u.startsWith(OWN_FILES);
  };
  const guard = (fn) => async (e, arg) => {
    if (!fromUs(e)) throw new Error('طلب مرفوض');
    return fn(arg, e);
  };
  /** اسم صالح لمجلد أو ملف في Windows */
  const safeName = (s, def = 'كتاب') => {
    let n = String(s || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .replace(/[. ]+$/, '')
      .slice(0, 120);
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(n)) n = '_' + n;
    return n || def;
  };

  function wireBridge() {
    ipcMain.handle(
      'warraq:save',
      guard(({ folder, name, data, unique }) => {
        const parts = String(name || '').split('/');
        if (parts.length > 2 || !(data instanceof Uint8Array)) throw new Error('ملف غير صالح');
        const root = outRoot();
        const dir = path.join(root, safeName(folder));
        let file = path.join(dir, ...parts.map((x) => safeName(x, 'ملف')));
        // ملفٌ جديد لا يُكتب فوق ملفٍ بالاسم نفسه (كتاب «وَرَق» آخر بالعنوان نفسه): «الاسم (٢)»
        if (unique) {
          const ext = path.extname(file);
          const base = file.slice(0, file.length - ext.length);
          for (let k = 2; fs.existsSync(file) && k < 1000; k++) file = `${base} (${String(k).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d])})${ext}`;
        }
        if (!inside(file, root)) throw new Error('مسار غير صالح');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        return { path: file, dir };
      }),
    );
    // الفتح والمجلد: داخل مجلد الكتب، أو ما سجّلته الخزانة
    const reachable = (p) => typeof p === 'string' && path.isAbsolute(p) && (inside(p, outRoot()) || store.knownPath(p)) && fs.existsSync(p);
    ipcMain.handle(
      'warraq:open',
      guard(async (p) => {
        if (!reachable(p)) throw new Error('الملف غير موجود');
        const err = await shell.openPath(p);
        if (err) throw new Error(err);
        return true;
      }),
    );
    ipcMain.handle(
      'warraq:folder',
      guard(async (dir) => {
        const own = typeof dir === 'string' && [outRoot(), app.getPath('userData')].some((d) => path.resolve(dir) === path.resolve(d));
        if (!reachable(dir) && !own) throw new Error('المجلد غير موجود');
        fs.mkdirSync(dir, { recursive: true });
        const err = await shell.openPath(dir);
        if (err) throw new Error(err);
        return true;
      }),
    );
    // قراءة ملف من الجهاز: كتب Word و PDF ومشاريع ورّاق وحدها (ما فتحه المستخدم، وما سجّله مشروعه)
    ipcMain.handle(
      'warraq:read',
      guard(async (p) => {
        if (typeof p !== 'string' || !path.isAbsolute(p) || !/\.(docx|pdf|waraq|warraq)$/i.test(p)) throw new Error('ملف غير مقبول');
        const st = await fs.promises.stat(p).catch(() => null);
        if (!st || !st.isFile()) throw new Error('الملف غير موجود');
        if (st.size > 300 * 1024 * 1024) throw new Error('الملف أكبر من ٣٠٠ م.ب');
        if (/\.(waraq|warraq)$/i.test(p)) openedBooks.add(path.resolve(p));
        return new Uint8Array(await fs.promises.readFile(p));
      }),
    );
    // حفظ «كتاب ورق» في ملفه: ما فُتح منه، أو ما في مجلد الكتب
    ipcMain.handle(
      'warraq:book-write',
      guard(async ({ file, data }) => {
        if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.(waraq|warraq)$/i.test(file) || !(data instanceof Uint8Array)) throw new Error('ملف غير صالح');
        const full = path.resolve(file);
        if (!openedBooks.has(full) && !inside(full, outRoot())) throw new Error('لا يُكتب في هذا المكان');
        // كتابة آمنة: ملفٌ مؤقت ثم استبدال (فلا يفسد الكتاب إن انقطع الحفظ)
        const tmp = full + '.tmp';
        await fs.promises.writeFile(tmp, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
        await fs.promises.rename(tmp, full);
        openedBooks.add(full);
        return { path: full };
      }),
    );
    // الخزانة
    ipcMain.handle('warraq:library', guard(() => store.listBooks()));
    ipcMain.handle('warraq:library-add', guard((rec) => store.addBook(rec)));
    ipcMain.handle('warraq:library-remove', guard((id) => store.removeBook(String(id || ''))));
    ipcMain.handle('warraq:library-update', guard((a) => store.updateBook(String((a && a.id) || ''), a && a.patch)));
    ipcMain.handle('warraq:library-move', guard((a) => store.moveBooks(String((a && a.field) || ''), String((a && a.from) || ''), String((a && a.to) || ''))));
    ipcMain.handle('warraq:library-order', guard((a) => store.orderBooks(a && Array.isArray(a.ids) ? a.ids.map(String) : null)));
    // الكتاب الذي على المنضدة، والمشروع ملفاً
    ipcMain.handle('warraq:current-load', guard(() => store.loadCurrent()));
    ipcMain.handle('warraq:current-save', guard((p) => store.saveCurrent(p)));
    ipcMain.handle(
      'warraq:project-save-as',
      guard(async ({ project, name }) => {
        // «كتاب ورق» (ملف ZIP بنصه وأسلوبه)، أو مشروعٌ قديم (JSON)
        const bytes = project instanceof Uint8Array ? project : null;
        if (!bytes && (!project || project.format !== 'warraq-project')) throw new Error('لا مشروع');
        fs.mkdirSync(outRoot(), { recursive: true });
        const r = await dialog.showSaveDialog(mainWin || undefined, {
          title: 'حفظ الكتاب',
          defaultPath: path.join(outRoot(), safeName(String(name || 'كتاب').replace(/\.(waraq|warraq)$/i, ''), 'كتاب') + '.waraq'),
          buttonLabel: 'حفظ',
          filters: [{ name: 'وَرَق', extensions: ['waraq'] }],
        });
        if (r.canceled || !r.filePath) return null;
        if (bytes) await fs.promises.writeFile(r.filePath, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        else await fs.promises.writeFile(r.filePath, JSON.stringify(project, null, 1), 'utf8');
        openedBooks.add(path.resolve(r.filePath));
        app.addRecentDocument(r.filePath);
        return { path: r.filePath };
      }),
    );
    // طابور النسّاخ
    ipcMain.handle('warraq:queue-load', guard(() => store.loadQueue()));
    ipcMain.handle('warraq:queue-save', guard((q) => store.saveQueue(q)));
    // تفضيلات البرنامج وما يعرفه الهيكل عنه
    ipcMain.handle(
      'warraq:info',
      guard(() => ({ version: app.getVersion(), outDir: outRoot(), dataDir: app.getPath('userData'), cores: require('node:os').cpus().length, scribes: +process.env.WARRAQ_RENDER_PARALLEL || 2, prefs: store.prefs() })),
    );
    ipcMain.handle('warraq:prefs', guard((patch) => store.setPrefs(patch)));
    ipcMain.handle(
      'warraq:choose-out-dir',
      guard(async () => {
        const r = await dialog.showOpenDialog(mainWin || undefined, { title: 'اختر المجلد الذي تُحفظ فيه الكتب', defaultPath: outRoot(), buttonLabel: 'اختيار هذا المجلد', properties: ['openDirectory', 'createDirectory'] });
        if (r.canceled || !r.filePaths[0]) return null;
        store.setPrefs({ outDir: r.filePaths[0] });
        return r.filePaths[0];
      }),
    );
    ipcMain.handle('warraq:open-dialog', guard((mode) => openDialogFor(mode === 'rahl' ? 'rahl' : 'bench')));
    // العمل في الخلفية والإشعار
    ipcMain.on('warraq:progress', (e, arg) => fromUs(e) && setBusy(arg && arg.source === 'scribes' ? 'scribes' : 'bench', arg && arg.info));
    ipcMain.handle('warraq:notify', guard((n) => notify(n || {})));
    // التفريغ المباشر: جلسةٌ واحدة لكل نافذة (app/lib/stt.js)، والصوت يصل من «مجلس الدرس»
    const sttSessions = new Map(); // webContents.id ← الجلسة
    let sttSeq = 0;
    const sttMod = () => import(pathToFileURL(path.join(APP_DIR, 'lib', 'stt.js')).href);
    ipcMain.handle(
      'warraq:stt-start',
      guard(async (o, e) => {
        const wc = e.sender;
        const old = sttSessions.get(wc.id);
        if (old) old.close();
        sttSessions.delete(wc.id);
        const { openStt } = await sttMod();
        const sid = ++sttSeq; // ما يصل من جلسةٍ سابقة (بعد إيقافها) يُعرف فلا يختلط بالجديدة
        const ses = openStt({
          engine: o && typeof o.engine === 'string' ? o.engine : '',
          context: o && o.context && typeof o.context === 'object' ? { title: String(o.context.title || '').slice(0, 300), book: String(o.context.book || '').slice(0, 300), heading: String(o.context.heading || '').slice(0, 200) } : {},
          onEvent: (ev) => !wc.isDestroyed() && wc.send('warraq:stt', { ...ev, sid }),
        });
        sttSessions.set(wc.id, ses);
        if (!wc.__warraqStt) (wc.__warraqStt = true), wc.once('destroyed', () => {
          const s = sttSessions.get(wc.id);
          if (s) s.close();
          sttSessions.delete(wc.id);
        });
        return { ok: true, sid, engine: ses.engine, label: ses.label, model: ses.model, rate: ses.rate, quran: ses.quran, save: ses.save };
      }),
    );
    ipcMain.on('warraq:stt-audio', (e, pcm) => {
      if (!fromUs(e)) return;
      const s = sttSessions.get(e.sender.id);
      if (s && pcm && pcm.byteLength && pcm.byteLength <= 512 * 1024) s.push(pcm);
    });
    ipcMain.on('warraq:stt-flush', (e) => {
      const s = fromUs(e) && sttSessions.get(e.sender.id);
      if (s) s.flush();
    });
    ipcMain.handle(
      'warraq:stt-stop',
      guard(async (_o, e) => {
        const s = sttSessions.get(e.sender.id);
        if (s) s.close();
        sttSessions.delete(e.sender.id);
        return true;
      }),
    );
    // prompt() في صفحات ورّاق: Electron لا يعرفه (يرمي خطأ)، فنافذةٌ صغيرة مشروطة بالنافذة التي سألت،
    // والصفحة تنتظر الجواب كما تنتظر prompt() في المتصفح (preload.cjs يضعه مكان window.prompt)
    const prompts = new Map();
    ipcMain.on('warraq:prompt-sync', (e, a) => {
      if (!fromUs(e)) return void (e.returnValue = null);
      const parent = BrowserWindow.fromWebContents(e.sender) || undefined;
      let answered = false;
      const answer = (v) => {
        if (answered) return;
        answered = true;
        e.returnValue = v == null ? null : String(v);
      };
      const win = new BrowserWindow({
        width: 470,
        height: 214,
        parent,
        modal: !!parent,
        show: false,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        title: 'ورّاق',
        icon: ICON,
        backgroundColor: bg(),
        webPreferences: { preload: path.join(__dirname, 'prompt-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
      });
      const id = win.webContents.id;
      prompts.set(id, (v) => {
        answer(v);
        if (!win.isDestroyed()) win.close();
      });
      win.webContents.on('will-navigate', (ev) => ev.preventDefault());
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.on('closed', () => {
        prompts.delete(id);
        answer(null);
      });
      win.once('ready-to-show', () => win.show());
      win.loadFile(path.join(__dirname, 'prompt.html'), { query: { m: String((a && a.message) || '').slice(0, 2000), v: String((a && a.value) || '').slice(0, 8000), night: lampOn() ? '1' : '0' } });
    });
    ipcMain.on('warraq:prompt-done', (e, v) => {
      const f = prompts.get(e.sender.id);
      if (f) f(v);
    });
    // شريط العنوان: قائمة البرنامج من الألف، ولون أزرار النافذة
    ipcMain.on('warraq:menu-popup', (e, p) => {
      if (!fromUs(e) || !mainWin) return;
      const m = Menu.getApplicationMenu();
      if (m) m.popup({ window: mainWin, x: Math.round((p && p.x) || 0), y: Math.round((p && p.y) || 38) });
    });
    // زرّ «إصلاح» في الشريط الجانبي
    ipcMain.on('warraq:repair', (e) => fromUs(e) && repair());
    ipcMain.on('warraq:titlebar', (e, dark) => {
      // النافذة التي طلبت (الرئيسية أو الإعدادات)
      const w = fromUs(e) ? BrowserWindow.fromWebContents(e.sender) : null;
      // السِّراج في النافذة الرئيسية: أيقونة البرنامج ليلية أو نهارية (ما لم تكن تُظهر مرحلة إخراج)
      if (w && w === mainWin && nightIcon !== !!dark) {
        nightIcon = !!dark;
        shownStage = -1;
        paintStage();
        // يُذكر للتشغيل التالي: شاشة الافتتاح وأيقونة البرنامج من أول لحظة
        try {
          store.setPrefs({ lamp: nightIcon });
        } catch {}
      }
      if (!w || !w.setTitleBarOverlay) return;
      try {
        w.setTitleBarOverlay({ ...(dark ? TITLEBAR.dark : TITLEBAR.light), height: TITLEBAR.height });
      } catch {}
    });
    // الهيكل جاهز: ما طُلب فتحه قبله يُفتح الآن
    ipcMain.on('warraq:shell-ready', (e) => {
      if (!fromUs(e)) return;
      shellReady = true;
      for (const job of pending.splice(0)) openJob(job);
    });
    ipcMain.handle(
      'warraq:window',
      guard((name) => {
        if (!Object.prototype.hasOwnProperty.call(WINDOWS, name)) throw new Error('نافذة غير معروفة');
        WINDOWS[name]();
        return true;
      }),
    );
    // الملاحظات: إلى صندوق الملاحظات في موقع ورّاق (يراها المالك في لوحته)، وإلا رسالة بريد جاهزة
    ipcMain.handle(
      'warraq:feedback',
      guard(async (body) => {
        const b = body && typeof body === 'object' ? body : {};
        const message = String(b.message || '').trim().slice(0, 4000);
        if (message.length < 3) return { ok: false, error: 'اكتب رسالتك' };
        const info = `البرنامج ${app.getVersion()} · Windows ${os.release()}`;
        const item = {
          type: FEEDBACK_TYPES[b.type] ? b.type : 'other',
          message,
          contact: String(b.contact || '').slice(0, 200),
          bookId: /^\d{1,8}$/.test(String(b.bookId || '')) ? +b.bookId : undefined,
          bookName: String(b.bookName || '').slice(0, 200),
          page: `${info} · ${String(b.page || '')}`.slice(0, 60),
        };
        if (SITE_URL) {
          try {
            const r = await net.fetch(SITE_URL + '/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(item) });
            if (r.ok) return { ok: true, via: 'site' };
            const d = await r.json().catch(() => ({}));
            if (r.status === 400 || r.status === 429) return { ok: false, error: d.error || 'تعذّر الإرسال' };
          } catch {}
        }
        const subject = `ملاحظة على ورّاق: ${FEEDBACK_TYPES[item.type]}`;
        const text = [message, '', '— ' + info, item.bookName ? `الكتاب: ${item.bookName}${item.bookId ? ` (${item.bookId})` : ''}` : '', item.contact ? `للتواصل: ${item.contact}` : ''].filter((x, i) => x || i < 2).join('\n');
        await shell.openExternal(`mailto:${CONTACT_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`);
        return { ok: true, via: 'mail' };
      }),
    );
  }

  // نوافذ البرنامج وحدها تحمل مفتاح الجلسة إلى الخادم الداخلي، في طلبات المالك وحدها:
  // لوحة الإعدادات وواجهاتها، ووصف الاستوديو. (ترويسة خاصة على كل طلب تجعل طلبات إطار المعاينة المعزول
  // — الخطوط مثلاً — طلباتٍ عابرة تحتاج إذناً مسبقاً فتُرفض)
  const OWNER_PATHS = /^\/(admin\/|api\/admin\/|api\/styles\/meta(\?|$))/;
  function wireOwnerHeader() {
    session.defaultSession.webRequest.onBeforeSendHeaders((d, cb) => {
      if (port && d.url.startsWith(`http://127.0.0.1:${port}/`) && OWNER_PATHS.test(d.url.slice(`http://127.0.0.1:${port}`.length))) {
        d.requestHeaders['x-warraq-desk'] = DESK_KEY;
      }
      cb({ requestHeaders: d.requestHeaders });
    });
  }

  // حفظ ما يُنزَّل من الصفحات (بطاقة أسلوب، تصميم غلاف…): نافذة الحفظ المعتادة في Windows، تبدأ من مجلد المستندات
  function wireDownloads() {
    session.defaultSession.on('will-download', (_e, item) => {
      item.setSaveDialogOptions({
        title: 'حفظ الملف',
        defaultPath: path.join(app.getPath('documents'), item.getFilename()),
      });
    });
  }

  async function createWindow() {
    const st = readState();
    mainWin = new BrowserWindow({
      width: st.width || 1360,
      height: st.height || 880,
      x: st.x,
      y: st.y,
      minWidth: 820,
      minHeight: 560,
      show: false,
      title: 'ورّاق',
      icon: nightIcon ? ICON_NIGHT : ICON,
      backgroundColor: bg(),
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { ...(lampOn() ? TITLEBAR.dark : TITLEBAR.light), height: TITLEBAR.height },
      // الهيكل وحده يحمل صفحة الدرس (webview) بجانب الكتاب، بقيودها في lesson.cjs
      webPreferences: { ...webPrefs(), webviewTag: true },
    });
    wireWindow(mainWin);
    appDetails(mainWin);
    if (lesson) lesson.wireHost(mainWin);
    mainWin.once('ready-to-show', () => {
      if (st.maximized) mainWin.maximize();
      // فُتح البرنامج لـ«أضفه إلى طابور النسّاخ» وحده: يعمل مصغّراً، وأيقونته في شريط المهام تُخبر بالتقدّم
      if (quietArgs(process.argv)) {
        mainWin.showInactive();
        mainWin.minimize();
      } else mainWin.show();
    });
    // عاد المستخدم إلى النافذة: تعود الأيقونة إلى هيئتها
    mainWin.on('focus', () => {
      if (!doneStage || busy.size) return;
      doneStage = false;
      paintStage();
    });
    // مودٌ أوقع الواجهة أو علّقها: تُوقف المودات (الوضع الآمن) وتعود الواجهة، و«الطِّراز» يقول السبب
    mainWin.webContents.on('render-process-gone', (_e, d) => {
      if (!d || d.reason === 'clean-exit' || !mods.anyActive()) return;
      mods.setSafe(true, 'crash');
      setTimeout(() => mainWin && !mainWin.isDestroyed() && mainWin.webContents.reload(), 400);
    });
    let asking = false;
    mainWin.on('unresponsive', async () => {
      if (asking || !mods.anyActive()) return;
      asking = true;
      const r = await dialog.showMessageBox(mainWin, {
        type: 'warning',
        buttons: ['أوقف المودات وأعد التحميل', 'انتظر'],
        defaultId: 0,
        cancelId: 1,
        title: 'ورّاق لا يستجيب',
        message: 'واجهة البرنامج لا تستجيب',
        detail: 'قد يكون السبب مودًا من «الطِّراز». أوقف المودات كلها (الوضع الآمن) وأعد تحميل الواجهة؟ وتشغّلها بعدُ من «الطِّراز».',
      });
      asking = false;
      if (r.response === 0 && mainWin && !mainWin.isDestroyed()) {
        mods.setSafe(true, 'hang');
        try {
          mainWin.webContents.forcefullyCrashRenderer();
        } catch {}
        mainWin.webContents.reload();
      }
    });
    mainWin.on('close', () => saveState(mainWin));
    mainWin.on('closed', () => {
      mainWin = null;
      // إغلاق النافذة الرئيسية يُغلق البرنامج كله (ومعه نوافذ الإعدادات والرحل)
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.destroy();
    });
    const started = Date.now();
    await mainWin.loadFile(path.join(__dirname, 'splash.html'), { hash: lampOn() ? 'lamp1' : 'lamp0' }); // السِّراج كما تُرك (بلا سكربت: :target)
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox('ورّاق', 'تعذّر تشغيل البرنامج:\n' + (e && e.message ? e.message : e));
      app.quit();
      return;
    }
    // شاشة الافتتاح تُتمّ رسم الألف (ثانية ونصف) ولو كان الخادم أسرع
    const wait = 1500 - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (mainWin) {
      // صفحة جديدة (إعادة تحميل): ينتظر الفتحُ أن يجهز الهيكل من جديد
      mainWin.webContents.on('did-start-navigation', (_e, _u, inPlace, isMain) => isMain && !inPlace && (shellReady = false));
      mainWin.loadURL(`http://127.0.0.1:${port}/desk/`);
    }
  }

  // فتح البرنامج مرة ثانية (ملف من المستكشف، أو مهمة من قائمة القفز): يصل طلبه إلى النسخة القائمة
  app.on('second-instance', (_e, argv) => {
    if (!mainWin) return;
    if (!quietArgs(argv)) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
    handleArgs(argv);
  });

  /**
   * أيقونة زرّ البرنامج في شريط المهام وما يُثبَّت فيه: من أيقونة ورّاق نفسها (appIconPath)، لا من الملف الذي يشغّله.
   * فحين يُشغَّل من مجلده (run-dev.bat، والملف Electron) لا يظهر شعار Electron (الإلكترونات التي تدور)، ولا بعد تثبيته في الشريط.
   */
  function appDetails(win) {
    if (process.platform !== 'win32' || !win || STORE) return;
    try {
      const cmd = process.defaultApp ? `"${process.execPath}" "${path.resolve(process.argv[1] || '.')}"` : `"${process.execPath}"`;
      win.setAppDetails({ appId: 'com.alwarraq.app', appIconPath: ICON, appIconIndex: 0, relaunchCommand: cmd, relaunchDisplayName: 'ورّاق' });
    } catch {}
  }
  /** قائمة القفز في شريط المهام: مهام سريعة، وآخر المشاريع */
  function jumpList() {
    if (process.platform !== 'win32' || STORE) return;
    const pre = app.isPackaged ? '' : `"${app.getAppPath()}" `;
    const task = (title, args, description) => ({ type: 'task', title, description, program: process.execPath, args: pre + args, iconPath: ICON, iconIndex: 0 });
    try {
      app.setJumpList([
        { type: 'recent' },
        { type: 'tasks', items: [task('كتاب جديد', '--new', 'ابدأ كتاباً جديداً على المنضدة'), task('الخزانة', '--door=khizana', 'ما أخرجتَه من الكتب'), task('الرَّحل', '--door=rahl', 'قراءة كتاب PDF والكتابة عليه')] },
      ]);
    } catch {}
  }
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => mods.close());

  /** الوضع الآمن: المودات كلها موقوفة، والواجهة تُعاد (من القائمة أو Ctrl+Alt+Shift+M، ولو أفسد مودٌ الواجهة) */
  function safeMode(reason) {
    mods.setSafe(true, reason);
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.reload();
    try {
      new Notification({ title: 'ورّاق', body: 'أُوقفت المودات كلها (الوضع الآمن). تشغّلها من «الطِّراز».', icon: ICON_PNG }).show();
    } catch {}
  }

  /**
   * «أصلح البرنامج»: إذا علِق شيءٌ أو اضطربت الواجهة، يعود كل شيء إلى حاله الطبيعي بضغطة:
   * يُوقف ما يعمل على المنضدة، وتُفرغ ذاكرة الواجهة المؤقتة وحالُ الجلسة، وتُغلق النوافذ الأخرى، وتُعاد الواجهة من أولها.
   * ولا يُمسّ شيءٌ محفوظ: الكتب والإعدادات والخزانة وطابور النسّاخ (يُستأنف بعد الإعادة).
   */
  async function repair() {
    if (!mainWin || mainWin.isDestroyed()) return;
    const r = await dialog.showMessageBox(mainWin, {
      type: 'question',
      buttons: ['أصلح الآن', 'إلغاء'],
      defaultId: 0,
      cancelId: 1,
      title: 'ورّاق',
      message: 'إصلاح البرنامج: إعادته إلى حاله الطبيعي',
      detail: 'يُوقف ما يعمل الآن على المنضدة، ويُفرغ ذاكرة الواجهة المؤقتة، ويغلق النوافذ الأخرى، ويعيد تحميل البرنامج من أوله.\nكتبك وإعداداتك وخزانتك وطابور النسّاخ تبقى كما هي.',
      checkboxLabel: mods.anyActive() ? 'وأوقف المودات أيضاً (الوضع الآمن) — إن كان الخلل منها' : undefined,
      checkboxChecked: false,
    });
    if (r.response !== 0 || !mainWin || mainWin.isDestroyed()) return;
    if (r.checkboxChecked && mods.anyActive()) mods.setSafe(true, 'repair');
    for (const w of BrowserWindow.getAllWindows()) if (w !== mainWin && !w.isDestroyed()) w.destroy();
    const wc = mainWin.webContents;
    // حال الجلسة (sessionStorage: الغلاف المختار وما يشبهه) تبقى بعد إعادة التحميل، فتُمحى قبلها
    try {
      await wc.executeJavaScript('try { sessionStorage.clear() } catch (e) {}', true);
    } catch {}
    try {
      await wc.session.clearCache();
      await wc.session.clearStorageData({ storages: ['serviceworkers', 'cachestorage', 'shadercache'] });
    } catch {}
    // شريط المهام: لا عمل (والنسّاخ يُبلغ عن نفسه من جديد حين يستأنف بعد الإعادة)
    for (const s of [...busy.keys()]) setBusy(s, null);
    // واجهةٌ علِقت تماماً: تُنهى ثم تُعاد
    if (wc.isCrashed && wc.isCrashed()) wc.reload();
    else wc.reloadIgnoringCache();
  }

  /* ---------------------------------------------------------------- «الطِّراز»: ما تطلبه صفحته من المودات */
  function wireMods() {
    const winOf = (e) => BrowserWindow.fromWebContents(e.sender) || mainWin || undefined;
    const id = (a) => String((a && a.id) || '');
    ipcMain.handle(
      'warraq:mods',
      guard(async (a, e) => {
        const op = a && a.op;
        if (op === 'list') return mods.list();
        if (op === 'pick') {
          const r = await dialog.showOpenDialog(winOf(e), { title: 'أضف مودًا', buttonLabel: 'افحصه', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'مود ورّاق', extensions: ['wqmod', 'zip'] }] });
          return r.canceled || !r.filePaths[0] ? null : mods.inspect(r.filePaths[0]);
        }
        if (op === 'inspect') return mods.inspect(String(a.path || ''));
        // «اصنعه بالذكاء الاصطناعي»: ردّه نصاً، وما أُرفق معه
        if (op === 'fromText') return mods.fromText(String(a.text || '').slice(0, 8 * 1024 * 1024), Array.isArray(a.files) ? a.files.filter((f) => f && typeof f.name === 'string' && f.data instanceof Uint8Array).map((f) => ({ name: f.name.slice(0, 200), data: f.data })) : []);
        if (op === 'install') return mods.install(String(a.token || ''));
        if (op === 'cancel') return mods.cancel(String(a.token || '')), true;
        if (op === 'link') {
          let dir = String(a.path || '');
          if (!dir) {
            const r = await dialog.showOpenDialog(winOf(e), { title: 'اربط مجلد مودٍ «قيد الصنع»', buttonLabel: 'اربطه', defaultPath: path.join(outRoot(), 'مودات'), properties: ['openDirectory'] });
            if (r.canceled || !r.filePaths[0]) return null;
            dir = r.filePaths[0];
          }
          return mods.link(dir);
        }
        if (op === 'enable') return mods.setEnabled(id(a), !!a.on);
        if (op === 'settings') return mods.setSettings(id(a), a.values && typeof a.values === 'object' ? a.values : {});
        if (op === 'resetSettings') return mods.resetSettings(id(a));
        if (op === 'order') return mods.setOrder(Array.isArray(a.ids) ? a.ids.map(String) : []);
        if (op === 'remove') return mods.remove(id(a));
        if (op === 'gallery') return mods.addGallery(id(a));
        if (op === 'reveal') {
          const m = mods.list().mods.find((x) => x.id === id(a));
          if (m && m.path) await shell.openPath(m.path);
          return !!m;
        }
        if (op === 'export') {
          const m = mods.list().mods.find((x) => x.id === id(a));
          if (!m || m.broken) throw new Error('المود غير موجود');
          const r = await dialog.showSaveDialog(winOf(e), { title: 'صدّر المود للمشاركة', buttonLabel: 'احفظ', defaultPath: path.join(app.getPath('documents'), safeName(m.name, 'مود') + '.wqmod'), filters: [{ name: 'مود ورّاق', extensions: ['wqmod'] }] });
          if (r.canceled || !r.filePath) return null;
          return mods.exportMod(m.id, r.filePath);
        }
        if (op === 'create') {
          const parent = path.join(outRoot(), 'مودات');
          fs.mkdirSync(parent, { recursive: true });
          const r = mods.create({ name: String(a.name || ''), parts: Array.isArray(a.parts) ? a.parts.map(String) : [], parent });
          if (a.open !== false) shell.openPath(r.dir);
          return r;
        }
        if (op === 'reload') return mods.reload(id(a));
        if (op === 'safe') return mods.setSafe(!!a.on, a.on ? 'user' : '');
        if (op === 'report') return mods.report(id(a), String(a.part || ''), String(a.message || '')), true;
        if (op === 'clearErrors') return mods.clearErrors(id(a));
        if (op === 'reloadUi') {
          mods.reloaded();
          if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.reload();
          return true;
        }
        if (op === 'showItem') {
          const p = String(a.path || '');
          if (p && path.isAbsolute(p) && fs.existsSync(p)) shell.showItemInFolder(p);
          return true;
        }
        throw new Error('أمرٌ غير معروف');
      }),
    );
  }

  /**
   * ملفات «ورق» (‎.waraq‎، وملفات ‎.warraq‎ القديمة) تُربط بالبرنامج وأيقونتها لحساب المستخدم، في كل تشغيلٍ تغيّر فيه مكان البرنامج أو إصداره:
   * يعمل ولو شُغّل البرنامج من مجلده دون مثبّت، ويُصلح ما أفسده برنامج آخر، ثم يُنبَّه المستكشف فيعيد رسم الأيقونات.
   */
  function registerFileType() {
    if (process.platform !== 'win32' || STORE) return;
    const { execFile } = require('node:child_process');
    const icon = path.join(__dirname, 'waraq-file.ico');
    const cmd = process.defaultApp ? `"${process.execPath}" "${path.resolve(process.argv[1] || '.')}" "%1"` : `"${process.execPath}" "%1"`;
    const TYPE = 'وَرَق'; // اسم النوع في المستكشف (عمود «النوع» وخصائص الملف)
    // وعلى ملف «وَرَق» بالزر الأيمن (كما على PDF و Word): «ضعه على الرَّحل» و«أضفه إلى طابور النسّاخ»
    const exe = process.defaultApp ? `"${process.execPath}" "${path.resolve(process.argv[1] || '.')}"` : `"${process.execPath}"`;
    const verbs = [
      ['Alwarraq.Rahl', 'ضعه على الرَّحل', `${exe} --rahl "%1"`],
      ['Alwarraq.Queue', 'أضفه إلى طابور النسّاخ', `${exe} --queue "%1"`],
    ];
    const key = [app.getVersion(), process.execPath, icon, cmd, TYPE, verbs.length, 'wqmod', ICON].join('|');
    const mark = path.join(app.getPath('userData'), 'file-type.json');
    try {
      if (JSON.parse(fs.readFileSync(mark, 'utf8')).key === key) return;
    } catch {}
    const C = 'HKCU\\Software\\Classes\\';
    const sets = [
      [C + '.waraq', 'Alwarraq.Book'],
      [C + '.warraq', 'Alwarraq.Book'],
      [C + 'Alwarraq.Book', TYPE],
      [C + 'Alwarraq.Book\\DefaultIcon', `"${icon}",0`],
      [C + 'Alwarraq.Book\\shell\\open\\command', cmd],
      // مودات «الطِّراز» (‎.wqmod‎): فتحها يعرضها في «الطِّراز» للتثبيت
      [C + '.wqmod', 'Alwarraq.Mod'],
      [C + 'Alwarraq.Mod', 'مود ورّاق'],
      [C + 'Alwarraq.Mod\\DefaultIcon', `"${ICON}",0`],
      [C + 'Alwarraq.Mod\\shell\\open\\command', cmd],
      ...verbs.map(([k, , c]) => [C + 'Alwarraq.Book\\shell\\' + k + '\\command', c]),
    ];
    let left = sets.length;
    for (const [k, v] of sets)
      execFile('reg', ['add', k, '/ve', '/t', 'REG_SZ', '/d', v, '/f'], { windowsHide: true }, () => {
        if (--left) return;
        execFile('reg', ['add', C + 'Alwarraq.Book', '/v', 'FriendlyTypeName', '/t', 'REG_SZ', '/d', TYPE, '/f'], { windowsHide: true }, () => {});
        for (const [k, label] of verbs) {
          execFile('reg', ['add', C + 'Alwarraq.Book\\shell\\' + k, '/v', 'MUIVerb', '/t', 'REG_SZ', '/d', label, '/f'], { windowsHide: true }, () => {});
          execFile('reg', ['add', C + 'Alwarraq.Book\\shell\\' + k, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${process.execPath}",0`, '/f'], { windowsHide: true }, () => {});
        }
        // المستكشف يعيد رسم الأيقونات (SHChangeNotify)، ثم تُحدَّث ذاكرة الأيقونات
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', "Add-Type -Namespace W -Name S -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int e, int f, IntPtr a, IntPtr b);'; [W.S]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)"], { windowsHide: true }, () => {
          execFile('ie4uinit.exe', ['-show'], { windowsHide: true }, () => {});
        });
        try {
          fs.writeFileSync(mark, JSON.stringify({ key }));
        } catch {}
      });
  }

  app.whenReady().then(() => {
    registerFileType();
    lesson = setupLesson({ app, session, ipcMain, dialog, shell, Menu, clipboard: require('electron').clipboard, guard, getWin: () => mainWin, log: (...a) => console.log('[lesson]', ...a) });
    buildMenu();
    wireBridge();
    wireMods();
    wireOwnerHeader();
    wireDownloads();
    jumpList();
    createWindow();
    handleArgs(process.argv);
  });
}
