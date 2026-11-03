// تحديث البرنامج: يسأل GitHub عن آخر إصدار، وينزّل مثبّته في الخلفية ويتحقق من بصمته، ثم يثبّته بإذن المستخدم.
// نسخة المتجر يحدّثها المتجر، والتشغيل من مجلد المشروع لا يُحدَّث.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const API = 'https://api.github.com/repos/UNTURKI/warraq/releases/latest';
const ASSET = 'Alwarraq-Setup.exe';
const RELEASES = 'https://github.com/UNTURKI/warraq/releases/latest';

/** ١ إن كان a أحدث من b («1.0.10» بعد «1.0.9») */
function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const sha256 = (file) =>
  new Promise((ok, no) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', no).on('end', () => ok(h.digest('hex')));
  });

function setupUpdater({ app, net, dialog, shell, getWin, isBusy, prefs }) {
  const DIR = path.join(app.getPath('userData'), 'updates');
  let running = false;

  async function latest() {
    const res = await net.fetch(API, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Alwarraq/' + app.getVersion() } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const a = (j.assets || []).find((x) => x.name === ASSET);
    const m = a && /^sha256:([0-9a-f]{64})$/i.exec(a.digest || '');
    if (!m) throw new Error('الإصدار بلا مثبّت');
    return { version: String(j.tag_name || '').replace(/^v/i, ''), notes: String(j.body || '').slice(0, 900), url: a.browser_download_url, size: a.size, sha: m[1].toLowerCase() };
  }

  async function download(rel) {
    fs.mkdirSync(DIR, { recursive: true });
    const file = path.join(DIR, `Alwarraq-Setup-${rel.version}.exe`);
    if (fs.existsSync(file) && (await sha256(file)) === rel.sha) return file;
    // إصدارات نُزّلت قبله لا حاجة إليها
    for (const n of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, n), { force: true });
    const res = await net.fetch(rel.url);
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const part = file + '.part';
    const out = fs.createWriteStream(part);
    const hash = crypto.createHash('sha256');
    const win = getWin();
    let done = 0;
    try {
      for await (const chunk of res.body) {
        hash.update(chunk);
        done += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (win && !win.isDestroyed()) win.setProgressBar(rel.size ? done / rel.size : 2);
      }
    } finally {
      await new Promise((r) => out.end(r));
      if (win && !win.isDestroyed() && !isBusy()) win.setProgressBar(-1);
    }
    if (hash.digest('hex') !== rel.sha) {
      fs.rmSync(part, { force: true });
      throw new Error('الملف المنزَّل لا يطابق بصمة الإصدار');
    }
    fs.renameSync(part, file);
    return file;
  }

  /** يشغّل المثبّت بصلاحية المدير (نافذة إذن ويندوز)، ويغلق البرنامج إن وافق المستخدم */
  function install(file) {
    const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const dir = path.dirname(process.execPath);
    const script = `Start-Process -FilePath ${quote(file)} -ArgumentList ${quote(`--update "${dir}"`)} -Verb RunAs`;
    return new Promise((ok, no) => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true }, (e) => (e ? no(e) : ok()));
    });
  }

  const ask = (o) => {
    const win = getWin();
    return win && !win.isDestroyed() ? dialog.showMessageBox(win, { title: 'تحديث ورّاق', noLink: true, ...o }) : dialog.showMessageBox({ title: 'تحديث ورّاق', noLink: true, ...o });
  };

  /** { manual: true } من زر «تحقّق الآن»: يخبر بكل نتيجة. وعند التشغيل: لا يتكلم إلا إن وُجد جديد */
  async function check({ manual = false } = {}) {
    if (running) return { state: 'busy' };
    running = true;
    try {
      const rel = await latest();
      if (compareVersions(rel.version, app.getVersion()) <= 0) {
        if (manual) await ask({ type: 'info', message: 'عندك أحدث إصدار', detail: `الإصدار ${app.getVersion()}`, buttons: ['حسناً'] });
        return { state: 'latest', version: app.getVersion() };
      }
      const size = rel.size ? ` (نحو ${Math.round(rel.size / 1048576)} م.ب)` : '';
      const first = await ask({ type: 'info', message: `إصدار جديد من ورّاق: ${rel.version}`, detail: `${rel.notes ? rel.notes + '\n\n' : ''}يُنزَّل في الخلفية${size} وتكمل عملك، وكتبك وإعداداتك باقية كما هي.`, buttons: ['نزّله', 'لاحقاً'], defaultId: 0, cancelId: 1 });
      if (first.response !== 0) return { state: 'later', version: rel.version };
      const file = await download(rel);
      for (;;) {
        const busy = isBusy();
        const r = await ask({ type: 'info', message: `الإصدار ${rel.version} جاهز للتثبيت`, detail: busy ? 'هناك إخراج جارٍ: انتظر حتى يفرغ ثم ثبّت. يُغلق البرنامج أثناء التثبيت ثم يعود وحده.' : 'يطلب ويندوز إذنك، ويُغلق البرنامج أثناء التثبيت ثم يعود وحده.', buttons: ['ثبّت الآن', 'لاحقاً'], defaultId: 0, cancelId: 1 });
        if (r.response !== 0) return { state: 'ready', version: rel.version };
        if (isBusy()) continue;
        try {
          await install(file);
        } catch {
          return { state: 'declined', version: rel.version }; // رفض إذن ويندوز
        }
        app.quit();
        return { state: 'installing', version: rel.version };
      }
    } catch (e) {
      if (manual) {
        const r = await ask({ type: 'warning', message: 'تعذّر التحقق من التحديثات', detail: `${e.message}\n\nتستطيع تنزيل آخر إصدار من صفحته.`, buttons: ['افتح الصفحة', 'إغلاق'], defaultId: 0, cancelId: 1 });
        if (r.response === 0) shell.openExternal(RELEASES);
      }
      return { state: 'error', error: e.message };
    } finally {
      running = false;
    }
  }

  /** بعد التشغيل بقليل، مرةً كل تشغيل، ما لم يُطفئه المستخدم */
  function start() {
    setTimeout(() => {
      if (prefs().autoUpdate !== false) check().catch(() => {});
    }, 15000);
  }
  return { check, start };
}

module.exports = { setupUpdater, compareVersions };
