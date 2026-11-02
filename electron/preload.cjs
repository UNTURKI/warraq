// جسر البرنامج: ما تحتاجه صفحات ورّاق من Windows، ولا شيء غيره.
// الصفحات تراه باسم window.warraqDesktop (وأبواب الهيكل تأخذه من نافذته)، والعملية الرئيسية (main.cjs) تتحقق من كل طلب ومن مصدره.
const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');

const invoke = (ch, arg) => ipcRenderer.invoke(ch, arg);

contextBridge.exposeInMainWorld('warraqDesktop', {
  /* ---- ملفات الكتب ---- */
  /** حفظ ملف في مجلد الكتاب داخل مجلد الكتب: ← { path, dir } */
  saveFile: (folder, name, data, opts) => invoke('warraq:save', { folder, name, data, unique: !!(opts && opts.unique) }),
  /** فتح ملف محفوظ في برنامجه (قارئ PDF، Word) */
  openPath: (p) => invoke('warraq:open', p),
  /** فتح مجلد في مستكشف الملفات */
  showFolder: (dir) => invoke('warraq:folder', dir),
  /** مسار ملفٍ اختاره المستخدم أو سحبه (ليُعاد فتحه منه) */
  pathOf: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  /** قراءة كتاب Word أو PDF أو مشروع من الجهاز ← بايتاته */
  readFile: (p) => invoke('warraq:read', p),
  /** نافذة «فتح» (bench: كتاب أو مشروع، rahl: كتاب PDF للقراءة) */
  openDialog: (mode) => invoke('warraq:open-dialog', mode),

  /* ---- المنضدة ومشروعها ---- */
  loadCurrent: () => invoke('warraq:current-load'),
  saveCurrent: (project) => invoke('warraq:current-save', project),
  saveProjectAs: (project, name) => invoke('warraq:project-save-as', { project, name }),
  /** حفظ «كتاب ورق» في ملفه */
  writeBook: (file, data) => invoke('warraq:book-write', { file, data }),

  /* ---- الخزانة ---- */
  library: () => invoke('warraq:library'),
  libraryAdd: (rec) => invoke('warraq:library-add', rec),
  libraryRemove: (id) => invoke('warraq:library-remove', id),
  /** نقل كتاب إلى خزانة أو مجموعة: patch = { cabinet, group, subject } */
  libraryUpdate: (id, patch) => invoke('warraq:library-update', { id, patch }),
  /** نقل كل كتب خزانة أو مجموعة (حين تُحذف): field = cabinet | group */
  libraryMove: (field, from, to) => invoke('warraq:library-move', { field, from, to }),
  libraryOrder: (ids) => invoke('warraq:library-order', { ids }),

  /* ---- النسّاخ ---- */
  queueLoad: () => invoke('warraq:queue-load'),
  queueSave: (q) => invoke('warraq:queue-save', q),
  /** تقدّم العمل في الخلفية (شريط المهام ومنع السكون): source = bench | scribes، info = { pct, title } أو null */
  progress: (info, source = 'bench') => ipcRenderer.send('warraq:progress', { source, info }),
  notify: (n) => invoke('warraq:notify', n),

  /* ---- البرنامج ---- */
  info: () => invoke('warraq:info'),
  setPrefs: (patch) => invoke('warraq:prefs', patch),
  chooseOutDir: () => invoke('warraq:choose-out-dir'),
  /** إرسال ملاحظة إلى موقع ورّاق (أو رسالة بريد إن تعذّر) */
  sendFeedback: (body) => invoke('warraq:feedback', body),
  /** قائمة البرنامج من الألف في شريط العنوان */
  menu: (x, y) => ipcRenderer.send('warraq:menu-popup', { x, y }),
  /** لون أزرار النافذة في شريط العنوان: يتبع السِّراج */
  titlebar: (dark) => ipcRenderer.send('warraq:titlebar', !!dark),
  /** «أصلح البرنامج»: يسأل ثم يعيده إلى حاله الطبيعي (بلا مسّ المحفوظ) */
  repair: () => ipcRenderer.send('warraq:repair'),
  /** نوافذ البرنامج: settings · about · identity */
  openWindow: (name) => invoke('warraq:window', name),
  /** أوامر قائمة البرنامج (كتاب جديد، أرسل ملاحظة، باب…) */
  onMenu: (fn) => ipcRenderer.on('warraq:menu', (_e, cmd) => fn(cmd)),
  /** ملفات يُطلب فتحها (من المستكشف، أو «فتح»، أو سطر الأوامر) */
  onOpen: (fn) => ipcRenderer.on('warraq:open-file', (_e, job) => fn(job)),
  /** الهيكل جاهز لاستقبال الملفات */
  ready: () => ipcRenderer.send('warraq:shell-ready'),

  /* ---- «مجلس الدرس»: درسٌ من الجهاز ---- */
  lesson: {
    /** اختيار صوتٍ أو مقطع من الجهاز ← { url, name, path, video } */
    pick: () => invoke('warraq:lesson-pick'),
    /** مقطعٌ سُحب أو حُفظ مساره من قبل ← { url, name, path, video } */
    media: (p) => invoke('warraq:lesson-media', p),
  },
  /* ---- التفريغ المباشر: صوت الدرس إلى خدمة التفريغ (app/lib/stt.js في العملية الرئيسية) ---- */
  stt: {
    /** ← { ok, engine, label, model, rate } أو خطأ */
    start: (o) => invoke('warraq:stt-start', o || {}),
    /** صوت PCM16 أحادي بمعدّل الجلسة */
    push: (pcm) => ipcRenderer.send('warraq:stt-audio', pcm),
    /** الإيقاف أو القفز: يُتمّ ما سُمع */
    flush: () => ipcRenderer.send('warraq:stt-flush'),
    stop: () => invoke('warraq:stt-stop'),
    /** ready | status | partial | final | error */
    onEvent: (fn) => {
      const h = (_e, m) => fn(m);
      ipcRenderer.on('warraq:stt', h);
      return () => ipcRenderer.removeListener('warraq:stt', h);
    },
  },
  /* ---- «الطِّراز»: المودات (electron/mods.cjs) ---- */
  mods: {
    /** ← { safe, safeReason, needsReload, mods:[…], gallery:[…], parts } */
    list: () => invoke('warraq:mods', { op: 'list' }),
    /** اختيار ملف ‎.wqmod‎ وفحصه ← ملخّصه ورمز تثبيته (أو null) */
    pick: () => invoke('warraq:mods', { op: 'pick' }),
    /** فحص ملفٍ أو مجلدٍ سُحب ← ملخّصه ورمز تثبيته */
    inspect: (path) => invoke('warraq:mods', { op: 'inspect', path }),
    /** ردّ الذكاء الاصطناعي (ملفاتٌ نصية) وما أُرفق معه [{ name, data: Uint8Array }] ← ملخّصه ورمز تثبيته */
    fromText: (text, files) => invoke('warraq:mods', { op: 'fromText', text, files }),
    install: (token) => invoke('warraq:mods', { op: 'install', token }),
    cancel: (token) => invoke('warraq:mods', { op: 'cancel', token }),
    /** «قيد الصنع»: ربط مجلد مود (يُختار، أو يُعطى مساره) */
    link: (path) => invoke('warraq:mods', { op: 'link', path }),
    enable: (id, on) => invoke('warraq:mods', { op: 'enable', id, on: !!on }),
    settings: (id, values) => invoke('warraq:mods', { op: 'settings', id, values }),
    resetSettings: (id) => invoke('warraq:mods', { op: 'resetSettings', id }),
    order: (ids) => invoke('warraq:mods', { op: 'order', ids }),
    remove: (id) => invoke('warraq:mods', { op: 'remove', id }),
    gallery: (id) => invoke('warraq:mods', { op: 'gallery', id }),
    reveal: (id) => invoke('warraq:mods', { op: 'reveal', id }),
    /** حفظه ملف ‎.wqmod‎ للمشاركة ← { path } أو null */
    exportMod: (id) => invoke('warraq:mods', { op: 'export', id }),
    create: (o) => invoke('warraq:mods', { op: 'create', ...(o || {}) }),
    reload: (id) => invoke('warraq:mods', { op: 'reload', id }),
    /** الوضع الآمن: المودات كلها موقوفة */
    safe: (on) => invoke('warraq:mods', { op: 'safe', on: !!on }),
    /** خطأٌ من مود (يُكتب في «الطِّراز» باسمه) */
    report: (e) => invoke('warraq:mods', { op: 'report', ...(e || {}) }).catch(() => {}),
    clearErrors: (id) => invoke('warraq:mods', { op: 'clearErrors', id }),
    /** إعادة تحميل الواجهة كلها */
    reloadUi: () => invoke('warraq:mods', { op: 'reloadUi' }),
    showItem: (p) => invoke('warraq:mods', { op: 'showItem', path: p }),
    onChange: (fn) => {
      const h = (_e, m) => fn(m);
      ipcRenderer.on('warraq:mods', h);
      return () => ipcRenderer.removeListener('warraq:mods', h);
    },
  },
  /* ---- متصفح الدرس المدمج: الدخول إلى حساب Google ---- */
  lessonWeb: {
    /** ← { signedIn, youtube, google, strategy, strategyName, browsers:[{id,name}], trying } */
    account: () => invoke('warraq:lesson-account'),
    /** «سجّل دخولك» ← { url } (صفحة الدخول، تُفتح في صفحة الدرس) */
    signIn: () => invoke('warraq:lesson-signin'),
    signOut: () => invoke('warraq:lesson-signout'),
    /** الدخول في نافذة كروم أو إيدج ثم نقله إلى البرنامج */
    viaBrowser: (id) => invoke('warraq:lesson-via-browser', id),
    cancelBrowser: () => invoke('warraq:lesson-cancel-browser'),
    home: () => invoke('warraq:lesson-home'),
    /** سجلّ التشخيص (ويُكتب فيه سطرٌ إن أُعطي) */
    log: (line) => invoke('warraq:lesson-log', line || ''),
    onEvent: (fn) => {
      const h = (_e, m) => fn(m);
      ipcRenderer.on('warraq:lesson-web', h);
      return () => ipcRenderer.removeListener('warraq:lesson-web', h);
    },
  },
});

/* ---- prompt(): Electron لا يعرفه (يرمي «prompt() is not supported»)، فيُسأل في نافذةٍ صغيرة من العملية الرئيسية ----
   يُوضع مكان window.prompt في الصفحة وفي إطاراتها (أبواب الهيكل) وما يُفتح فيها بعدُ. */
contextBridge.exposeInMainWorld('__warraqPrompt', (m, v) => {
  const r = ipcRenderer.sendSync('warraq:prompt-sync', { message: m == null ? '' : String(m), value: v == null ? '' : String(v) });
  return r == null ? null : String(r);
});
webFrame.executeJavaScript(`(() => {
  const ask = window.__warraqPrompt;
  if (!ask) return;
  const fix = (w) => {
    try {
      if (!w || w.__warraqPromptFixed) return;
      w.__warraqPromptFixed = true;
      w.prompt = (m, v) => ask(m, v);
      const d = w.document;
      d.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IFRAME') fix(e.target.contentWindow); }, true);
      for (const f of d.querySelectorAll('iframe')) fix(f.contentWindow);
    } catch {}
  };
  fix(window);
})();`).catch(() => {});
