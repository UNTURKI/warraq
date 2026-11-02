// الدخول إلى حساب Google (يوتيوب) في متصفح «مجلس الدرس» المدمج.
//
// Google يرفض الدخول في المتصفحات «المضمَّنة» في البرامج («قد لا يكون هذا المتصفح أو التطبيق آمنًا»)، ويعرفها من:
// هوية المتصفح (User-Agent) وتلميحاته (Sec-CH-UA)، و navigator.userAgentData، و window.chrome، وغيرها.
// فللمتصفح المدمج ثلاث «هويات» تُجرَّب بالترتيب، ويُعرف الرفض من صفحته فتُجرَّب التالية وحدها، وتُحفظ التي نجحت:
//   chrome   كروم نفسه بإصداره (لا «Electron» ولا اسم البرنامج، وعلامة Google Chrome في التلميحات، و window.chrome كاملاً)
//   firefox  صفحات الحساب وحدها ترى فايرفوكس (هويته وخصائصه، بلا تلميحات كروم)
//   classic  صفحات الحساب وحدها بلا هوية معروفة
// وإن رفضها Google كلها: «سجّل الدخول عبر متصفحك» — نافذة دخول في كروم أو إيدج المثبّت بملفٍّ مؤقت نظيف،
// فإذا تمّ الدخول نُقلت كعكاته إلى المتصفح المدمج، وأُغلقت النافذة وحُذف ملفها.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { findBrowsers, cdpClient, devtoolsPort } = require('./lesson-browser.cjs');

// للاختبار: مواقع محلية بدل Google ويوتيوب { accounts:[], google:[], youtube:[], signin, home }
const TEST = (() => {
  try {
    return JSON.parse(process.env.WARRAQ_SIGNIN_TEST || 'null');
  } catch {
    return null;
  }
})();
const SIGNIN_URL =
  (TEST && TEST.signin) ||
  'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&hl=ar&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Dar%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F';
const HOME_URL = (TEST && TEST.home) || 'https://www.youtube.com/';
const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};
const bare = (d) => String(d || '').replace(/^\./, '');
const isAccounts = (h) => h === 'accounts.google.com' || h === 'accounts.youtube.com' || !!(TEST && TEST.accounts.includes(h));
const isGoogle = (h) => /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h) || !!(TEST && TEST.google.includes(h));
const isYouTube = (h) => /(^|\.)youtube\.com$/.test(h) || !!(TEST && TEST.youtube.includes(h));

const STRATS = [
  { id: 'chrome', name: 'هوية كروم' },
  { id: 'firefox', name: 'هوية فايرفوكس' },
  { id: 'classic', name: 'بلا هوية' },
];
const OS = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
const FF_OS = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : 'X11; Linux x86_64';
const CLASSIC_UA = 'https://accounts.google.com/';
/** إصدار فايرفوكس الحالي تقديراً (يصدر كل أربعة أسابيع، و١٤٠ في ٢٤ يونيو ٢٠٢٥) */
const firefoxVersion = () => Math.max(140, 140 + Math.floor((Date.now() - Date.UTC(2025, 5, 24)) / 864e5 / 28) - 1);
// أسطر الرفض في صفحة Google (بالعربية والإنجليزية)، وعناوينها
const REJECT_URL = /\/(v3\/)?signin\/(v2\/)?(rejected|disallowed)|deniedsigninrejected|\/signin\/rejected/i;
const REJECT_TEXT_JS = `(() => { const t = ((document.body && document.body.innerText) || '').slice(0, 6000); return /may not be secure|couldn.t sign you in|browser or app may not be secure|قد لا يكون (هذا )?المتصفح|المتصفح أو التطبيق (قد )?لا يكون? آمن|تعذّ?ر تسجيل (الدخول|دخولك)|لا يمكنك تسجيل الدخول/i.test(t); })()`;
const SIGNED = new Set(['SAPISID', '__Secure-3PAPISID', 'LOGIN_INFO']);

function createSignin({ app, ses, emit, log }) {
  const FILE = path.join(app.getPath('userData'), 'lesson-signin.json');
  let S = { strategy: 'chrome', worked: '', major: '', full: '' };
  try {
    S = { ...S, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {}
  if (!STRATS.some((x) => x.id === S.strategy)) S.strategy = 'chrome';
  const save = () => {
    try {
      fs.writeFileSync(FILE, JSON.stringify(S));
    } catch {}
  };
  const engine = process.versions.chrome || '138.0.0.0';
  const major = () => S.major || engine.split('.')[0];
  const full = () => S.full || engine;
  const chromeUA = () => `Mozilla/5.0 (${OS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major()}.0.0.0 Safari/537.36`;
  const firefoxUA = () => `Mozilla/5.0 (${FF_OS}; rv:${firefoxVersion()}.0) Gecko/20100101 Firefox/${firefoxVersion()}.0`;
  let guest = null;
  const applyUA = () => {
    ses.setUserAgent(chromeUA());
    if (guest && !guest.isDestroyed()) guest.setUserAgent(chromeUA());
  };
  applyUA();

  /* ---------------------------------------------------------------- الهوية في كل طلب */
  /** قائمة العلامات في تلميحات كروم: تُضاف «Google Chrome» (وإصدار كروم الذي دُخل منه إن نُقل الدخول) */
  function brands(v, ver) {
    const items = [...String(v).matchAll(/"([^"]*)";v="([^"]*)"/g)].map((m) => ({ b: m[1], v: m[2] }));
    if (!items.length) return v;
    for (const x of items) if ((x.b === 'Chromium' || x.b === 'Google Chrome') && ver) x.v = ver;
    const chromium = items.find((x) => x.b === 'Chromium');
    if (!items.some((x) => x.b === 'Google Chrome')) items.push({ b: 'Google Chrome', v: ver || (chromium ? chromium.v : major()) });
    return items.map((x) => `"${x.b}";v="${x.v}"`).join(', ');
  }
  function onHeaders(d, cb) {
    try {
      const h = d.requestHeaders;
      const host = hostOf(d.url);
      const st = S.strategy;
      const keys = Object.keys(h);
      const del = (re) => keys.forEach((k) => re.test(k) && delete h[k]);
      del(/^user-agent$/i);
      if (isAccounts(host) && st !== 'chrome') {
        h['User-Agent'] = st === 'firefox' ? firefoxUA() : CLASSIC_UA;
        del(/^sec-ch-/i);
      } else {
        h['User-Agent'] = chromeUA();
        for (const k of keys) {
          const lk = k.toLowerCase();
          if (lk === 'sec-ch-ua') h[k] = brands(h[k], S.major ? major() : '');
          else if (lk === 'sec-ch-ua-full-version-list') h[k] = brands(h[k], S.full ? full() : '');
          else if (lk === 'sec-ch-ua-full-version') h[k] = `"${full()}"`;
        }
      }
    } catch (e) {
      log('headers', e.message);
    }
    cb({ requestHeaders: d.requestHeaders });
  }

  /** ما يوضع في الصفحة قبل نصوصها (يقرؤه جسر صفحة الدرس عند كل تحميل) */
  function shimFor(href) {
    const host = hostOf(href);
    const st = S.strategy;
    if (isAccounts(host) && st !== 'chrome') {
      const ua = st === 'firefox' ? firefoxUA() : CLASSIC_UA;
      return { kind: 'ua', bridge: false, ua, firefox: st === 'firefox', appVersion: st === 'firefox' ? '5.0 (Windows)' : ua.replace(/^Mozilla\//, ''), platform: process.platform === 'win32' ? 'Win32' : process.platform === 'darwin' ? 'MacIntel' : 'Linux x86_64', oscpu: FF_OS };
    }
    return { kind: 'chrome', bridge: !isAccounts(host), major: major(), full: full(), brandVer: S.major ? major() : '', fullVer: S.full ? full() : '' };
  }

  /* ---------------------------------------------------------------- حال الحساب */
  async function cookies() {
    try {
      return await ses.cookies.get({});
    } catch {
      return [];
    }
  }
  const stateOf = (list) => ({
    youtube: list.some((c) => SIGNED.has(c.name) && isYouTube(bare(c.domain))),
    google: list.some((c) => SIGNED.has(c.name) && isGoogle(bare(c.domain))),
  });
  let last = null;
  async function account() {
    const a = stateOf(await cookies());
    const st = STRATS.find((x) => x.id === S.strategy);
    return { ...a, accountsHosts: TEST ? TEST.accounts : ['accounts.google.com', 'accounts.youtube.com'], signedIn: a.youtube || a.google, strategy: S.strategy, strategyName: st ? st.name : '', worked: S.worked, transferred: !!S.major, browsers: findBrowsers().map(({ id, name }) => ({ id, name })), trying: !!trying };
  }
  async function check() {
    const a = await account();
    const k = `${a.youtube}|${a.google}`;
    if (k !== last) {
      last = k;
      emit({ type: 'account', ...a });
    }
    if (a.signedIn && trying) {
      log('signin ok with', S.strategy);
      S.worked = S.strategy;
      save();
      trying = null;
      emit({ type: 'signin', status: 'ok', strategy: S.strategy });
    }
    return a;
  }
  let checkT = 0;
  const checkSoon = (ms = 700) => {
    clearTimeout(checkT);
    checkT = setTimeout(check, ms);
  };
  ses.cookies.on('changed', (_e, c) => {
    if (SIGNED.has(c.name)) checkSoon(400);
  });

  /* ---------------------------------------------------------------- الدخول في المتصفح المدمج: الهويات بالترتيب */
  // المحاولة الجارية: الهويات بترتيبها (تبدأ بالتي نجحت من قبل)، وموضعها فيه
  let trying = null; // { order:[id], pos, seen:Set }
  const orderFrom = (id) => {
    const i = Math.max(0, STRATS.findIndex((x) => x.id === id));
    return [...STRATS.slice(i), ...STRATS.slice(0, i)].map((x) => x.id);
  };
  const nameOf = (id) => (STRATS.find((x) => x.id === id) || {}).name || id;
  function setStrategy(id) {
    S.strategy = id;
    save();
    log('strategy', id);
  }
  /** «سجّل دخولك»: يبدأ بالهوية التي نجحت من قبل (أو الأولى) ← عنوان صفحة الدخول */
  let failedAt = 0; // (رفض Google الهويات كلها: لا يُعاد تلقائياً حتى يطلبه المستخدم)
  function begin() {
    failedAt = 0;
    const first = STRATS.some((x) => x.id === S.worked) ? S.worked : 'chrome';
    trying = { order: orderFrom(first), pos: 0, seen: new Set() };
    setStrategy(first);
    emit({ type: 'signin', status: 'start', step: 1, of: STRATS.length, name: nameOf(first) });
    return SIGNIN_URL;
  }
  async function rejected(url) {
    if (!trying) return; // (فحصٌ متأخر بعد أن انتهت المحاولة)
    const key = trying.pos;
    if (trying.seen.has(key)) return;
    trying.seen.add(key);
    log('google rejected', S.strategy, url.slice(0, 160));
    const next = trying.pos + 1;
    if (next >= trying.order.length) {
      trying = null;
      failedAt = Date.now();
      setStrategy(STRATS.some((x) => x.id === S.worked) ? S.worked : 'chrome');
      emit({ type: 'signin', status: 'failed', browsers: findBrowsers().map(({ id, name }) => ({ id, name })) });
      return;
    }
    trying.pos = next;
    setStrategy(trying.order[next]);
    emit({ type: 'signin', status: 'retry', step: next + 1, of: trying.order.length, name: nameOf(trying.order[next]) });
    // صفحة دخولٍ جديدة بلا ما تركته المحاولة السابقة
    try {
      await ses.clearStorageData({ origins: TEST ? TEST.accounts.map((h) => 'http://' + h) : ['https://accounts.google.com', 'https://accounts.youtube.com'] });
    } catch {}
    setTimeout(() => guest && !guest.isDestroyed() && guest.loadURL(SIGNIN_URL).catch(() => {}), 350);
  }
  function inspect(url) {
    const host = hostOf(url);
    // صفحة الرفض: أثناء محاولة الدخول تُجرَّب الهوية التالية؛ ودخولٌ بدأه المستخدم من يوتيوب نفسه يبدأ المحاولة (ما لم تُرفض كلها قريباً)
    if (isAccounts(host) && REJECT_URL.test(url)) {
      if (!trying && Date.now() - failedAt > 120000) trying = { order: orderFrom(S.strategy), pos: 0, seen: new Set() };
      if (trying) rejected(url);
    }
    checkSoon();
  }
  /** صفحة الدرس (webview) لُحقت بالهيكل */
  function attachGuest(wc) {
    guest = wc;
    wc.setUserAgent(chromeUA());
    wc.on('did-navigate', (_e, url) => inspect(url));
    wc.on('did-navigate-in-page', (_e, url, isMain) => isMain && inspect(url));
    wc.on('did-finish-load', () => {
      const url = wc.getURL();
      if (!isAccounts(hostOf(url)) || !trying) return checkSoon();
      // (بعض صفحات الرفض بلا عنوانٍ خاص: يُقرأ نصها)
      setTimeout(() => {
        if (wc.isDestroyed()) return;
        wc.executeJavaScript(REJECT_TEXT_JS, true)
          .then((r) => r && rejected(wc.getURL()))
          .catch(() => {});
      }, 600);
    });
    wc.once('destroyed', () => guest === wc && (guest = null));
  }

  /** الخروج من الحساب: كعكات Google ويوتيوب وتخزينهما */
  async function signOut() {
    for (const c of await cookies()) {
      const h = bare(c.domain);
      if (!isGoogle(h) && !isYouTube(h) && !isAccounts(h)) continue;
      try {
        await ses.cookies.remove(`${c.secure ? 'https' : 'http'}://${h}${c.path || '/'}`, c.name);
      } catch {}
    }
    try {
      await ses.clearStorageData({ origins: TEST ? [...TEST.youtube, ...TEST.accounts].map((h) => 'http://' + h) : ['https://www.youtube.com', 'https://m.youtube.com', 'https://accounts.google.com', 'https://accounts.youtube.com', 'https://myaccount.google.com'] });
    } catch {}
    log('signed out');
    return check();
  }

  /* ---------------------------------------------------------------- «سجّل الدخول عبر متصفحك» */
  let X = null; // { child, cdp, dir, cancel }
  const rmrf = (d) => {
    try {
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
    } catch {}
  };
  const waitExit = (child, ms) =>
    new Promise((res) => {
      if (!child || child.exitCode != null || child.signalCode != null) return res();
      const t = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        res();
      }, ms);
      child.once('exit', () => (clearTimeout(t), res()));
    });
  const SAME = { Strict: 'strict', Lax: 'lax', None: 'no_restriction' };
  async function importCookies(list) {
    let n = 0;
    for (const c of list) {
      if (c.partitionKey) continue; // (كعكات مقسَّمة لمواقع داخل مواقع: لا تلزم)
      const h = bare(c.domain);
      try {
        await ses.cookies.set({
          url: `${c.secure ? 'https' : 'http'}://${h}${c.path || '/'}`,
          name: c.name,
          value: c.value,
          path: c.path || '/',
          secure: !!c.secure,
          httpOnly: !!c.httpOnly,
          ...(String(c.domain).startsWith('.') ? { domain: c.domain } : {}),
          ...(c.expires > 0 && !c.session ? { expirationDate: c.expires } : {}),
          ...(SAME[c.sameSite] ? { sameSite: SAME[c.sameSite] } : {}),
        });
        n++;
      } catch (e) {
        log('cookie', c.name, e.message);
      }
    }
    try {
      await ses.cookies.flushStore();
    } catch {}
    return n;
  }
  async function viaBrowser(prefer) {
    if (X) throw new Error('نافذة الدخول مفتوحة');
    const list = findBrowsers();
    const b = list.find((x) => x.id === prefer) || list.find((x) => x.id !== 'brave') || list[0];
    if (!b) throw new Error('لم يُعثر على كروم ولا إيدج في جهازك');
    const dir = path.join(app.getPath('userData'), 'signin-browser');
    rmrf(dir);
    fs.mkdirSync(dir, { recursive: true });
    const args = [
      `--user-data-dir=${dir}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-sync',
      // دخولٌ غير مربوطٍ بهذا الملف المؤقت (ليصلح نقله)
      '--disable-features=EnableBoundSessionCredentials,DeviceBoundSessions,DeviceBoundSessionCredentials',
      '--lang=ar',
      '--new-window',
      ...(process.platform === 'linux' && process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []),
      SIGNIN_URL,
    ];
    log('transfer: launch', b.name, b.path);
    const child = spawn(b.path, args, { stdio: 'ignore', windowsHide: false });
    child.on('error', (e) => log('transfer spawn', e.message));
    child.on('exit', (code, sig) => log('transfer browser exit', code, sig));
    X = { child, cdp: null, dir, cancel: false };
    const done = async (status, extra = {}) => {
      const x = X;
      X = null;
      if (x && x.cdp && !x.cdp.closed) await x.cdp.send('Browser.close').catch(() => {});
      if (x) await waitExit(x.child, 6000);
      rmrf(dir);
      emit({ type: 'transfer', status, browser: b.name, ...extra });
    };
    try {
      const ws = await devtoolsPort(dir, child, 40000);
      X.cdp = await cdpClient(ws);
      const ver = await X.cdp.send('Browser.getVersion').catch(() => ({}));
      emit({ type: 'transfer', status: 'open', browser: b.name });
      const t0 = Date.now();
      let got = null;
      let seenAt = 0;
      while (Date.now() - t0 < 20 * 60 * 1000) {
        if (!X || X.cancel) return await done('cancel');
        if (X.cdp.closed || child.exitCode != null) return await done('closed');
        let list = [];
        try {
          list = (await X.cdp.send('Storage.getCookies')).cookies || [];
        } catch {
          if (X.cdp.closed) return await done('closed');
        }
        const a = stateOf(list);
        if (a.youtube || a.google) {
          // (الدخول يكتب كعكاته على عدة مواقع: تُنتظر قليلاً لتكتمل)
          if (!seenAt) seenAt = Date.now();
          if (a.youtube || Date.now() - seenAt > 6000) {
            await new Promise((r) => setTimeout(r, 1500));
            got = (await X.cdp.send('Storage.getCookies').catch(() => ({ cookies: list }))).cookies || list;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (!got) return await done('timeout');
      const m = /Chrome\/(\d+)\.([\d.]+)/.exec(ver.product || ver.userAgent || '');
      if (m) {
        S.major = m[1];
        S.full = `${m[1]}.${m[2]}`;
      }
      setStrategy('chrome');
      S.worked = 'browser';
      save();
      applyUA();
      const n = await importCookies(got);
      log('transfer: imported', n, 'cookies; as Chrome', S.full || '-');
      await done('done', { count: n });
      checkSoon(100);
      return { ok: true, count: n };
    } catch (e) {
      log('transfer error', e.message);
      await done('error', { message: e.message });
      throw e;
    }
  }
  function cancelBrowser() {
    if (X) X.cancel = true;
    if (X && X.cdp && !X.cdp.closed) X.cdp.send('Browser.close').catch(() => {});
  }
  function close() {
    cancelBrowser();
  }

  setTimeout(check, 800);
  return { onHeaders, shimFor, attachGuest, begin, account, signOut, viaBrowser, cancelBrowser, close, SIGNIN_URL, HOME_URL, isAccounts };
}

module.exports = { createSignin, STRATS };
