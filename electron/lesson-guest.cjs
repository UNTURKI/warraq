// صفحة الدرس (يوتيوب، تيليجرام، أي موقع) في «مجلس الدرس»: لا يصلها من البرنامج شيء إلا:
// ١) جسرٌ صغير يرسل حال المقطع ومستوى صوته إلى الهيكل (والهيكل يعامل ما يصله معاملة ما لا يُوثق به)
// ٢) «هوية المتصفح» قبل نصوص الصفحة (lesson-signin.cjs): كروم كاملاً، أو هويةٌ أخرى في صفحات حساب Google وحدها
const { contextBridge, ipcRenderer } = require('electron');

let cfg = null;
try {
  cfg = ipcRenderer.sendSync('warraq:lesson-shim', location.href);
} catch {}

// (صفحات حساب Google لا ترى شيئاً من البرنامج)
if (window === window.top && !(cfg && cfg.bridge === false)) {
  contextBridge.exposeInMainWorld('__warraqLessonSend', (ch, data) => {
    // pcm: صوت المقطع للتفريغ المباشر (حين يطلبه المجلس)
    if (ch !== 'state' && ch !== 'lvl' && ch !== 'pcm') return;
    ipcRenderer.sendToHost('lesson', ch, data);
  });
}

/** يعمل في الصفحة نفسها (main world) قبل نصوصها */
function shim(c) {
  try {
    const def = (o, k, get) => {
      try {
        Object.defineProperty(o, k, { get, configurable: true, enumerable: true });
      } catch {}
    };
    const N = Navigator.prototype;
    if (c.kind === 'chrome') {
      // علامة Google Chrome مع Chromium (كما في كروم نفسه)
      const uad = navigator.userAgentData;
      if (uad) {
        const P = Object.getPrototypeOf(uad);
        const add = (list, ver) => {
          const out = list.map((b) => ({ brand: b.brand, version: (b.brand === 'Chromium' || b.brand === 'Google Chrome') && ver ? ver : b.version }));
          if (!out.some((b) => b.brand === 'Google Chrome')) {
            const cr = out.find((b) => b.brand === 'Chromium');
            out.push({ brand: 'Google Chrome', version: cr ? cr.version : ver });
          }
          return out;
        };
        const brands = Object.freeze(add(uad.brands, c.brandVer).map((b) => Object.freeze(b)));
        def(P, 'brands', () => brands);
        const ghev = P.getHighEntropyValues;
        if (ghev) {
          const fn = {
            getHighEntropyValues(hints) {
              return ghev.call(this, hints).then((v) => {
                if (v.brands) v.brands = add(v.brands, c.brandVer);
                if (v.fullVersionList) v.fullVersionList = add(v.fullVersionList, c.fullVer);
                if (v.uaFullVersion && c.fullVer) v.uaFullVersion = c.fullVer;
                return v;
              });
            },
          }.getHighEntropyValues;
          Object.defineProperty(P, 'getHighEntropyValues', { value: fn, configurable: true, writable: true });
        }
        const tj = P.toJSON;
        if (tj) Object.defineProperty(P, 'toJSON', { value: { toJSON() { const o = tj.call(this); o.brands = brands; return o; } }.toJSON, configurable: true, writable: true });
      }
      // window.chrome كما في كروم (في المتصفحات المضمَّنة يكون ناقصاً)
      if (!window.chrome) window.chrome = {};
      const ch = window.chrome;
      if (!ch.app)
        ch.app = {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
          getDetails() {
            return null;
          },
          getIsInstalled() {
            return false;
          },
          runningState() {
            return 'cannot_run';
          },
        };
      if (!ch.csi)
        ch.csi = function csi() {
          const t = performance.timing;
          return { startE: t.navigationStart, onloadT: t.loadEventEnd || Date.now(), pageT: performance.now(), tran: 15 };
        };
      if (!ch.loadTimes)
        ch.loadTimes = function loadTimes() {
          const t = performance.timing;
          const nav = performance.getEntriesByType('navigation')[0] || {};
          return {
            requestTime: t.navigationStart / 1000,
            startLoadTime: t.navigationStart / 1000,
            commitLoadTime: t.responseStart / 1000,
            finishDocumentLoadTime: t.domContentLoadedEventEnd / 1000,
            finishLoadTime: t.loadEventEnd / 1000,
            firstPaintTime: (t.responseStart + 30) / 1000,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other',
            wasFetchedViaSpdy: nav.nextHopProtocol === 'h2' || nav.nextHopProtocol === 'h3',
            wasNpnNegotiated: true,
            npnNegotiatedProtocol: nav.nextHopProtocol || 'h2',
            wasAlternateProtocolAvailable: false,
            connectionInfo: nav.nextHopProtocol || 'h2',
          };
        };
    } else if (c.kind === 'ua') {
      // صفحات حساب Google وحدها: هوية أخرى متّسقة بين الطلبات والصفحة
      def(N, 'userAgent', () => c.ua);
      def(N, 'appVersion', () => c.appVersion);
      def(N, 'platform', () => c.platform);
      def(N, 'vendor', () => '');
      def(N, 'userAgentData', () => undefined);
      if (c.firefox) {
        def(N, 'oscpu', () => c.oscpu);
        def(N, 'buildID', () => '20181001000000');
        def(N, 'productSub', () => '20100101');
      }
      try {
        delete window.chrome;
      } catch {}
      try {
        Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true });
      } catch {}
    }
  } catch {}
}

if (cfg) {
  try {
    contextBridge.executeInMainWorld({ func: shim, args: [cfg] });
  } catch {}
}
