// «الطِّراز»: يشغّل المودات المفعّلة في هذه الصفحة (في البرنامج وحده؛ يضعه الخادم في كل صفحة إلا «الطِّراز» نفسه).
// أوراق أنماط المودات يضعها الخادم في رأس الصفحة (فلا يومض شكلها الأول)، وهنا تُشغَّل نصوصها (ES modules):
//   export default function (wq) { …; return () => { /* ما يُفعل حين يُطفأ */ } }
// و wq أدواتُ المود (انظر «دليل الصانع»): كل ما يضيفه بها (عناصر، وأنماط، ومستمعون، ومؤقّتات، وأصوات) يزول وحده حين يُطفأ،
// فيُطفأ ويُشعل ويُعاد بلا إعادة تحميل. وكل خطأٍ منه يُكتب في «الطِّراز» باسمه.
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
const hit = PART_BY_PATH.find(([p]) => location.pathname.startsWith(p));
const PART = hit ? hit[1] : 'other';
const sameTop = (() => {
  try {
    return window.top.location.origin === location.origin;
  } catch {
    return false;
  }
})();
const TOP = sameTop ? window.top : window;
const desk = window.warraqDesktop || (sameTop ? TOP.warraqDesktop : null) || null;
const isTop = window.top === window;

if (PART && !window.__warraqMods) start();

function start() {
  const live = new Map(); // id ← { info, scope }
  const R = (window.__warraqMods = { part: PART, live, sync: () => sync('manual') });

  /* ---------------- الأخطاء تُنسب إلى مودها */
  const modOf = (s) => {
    const m = /\/mods\/([^/?#]+)\//.exec(String(s || ''));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const report = (id, message) => {
    try {
      console.warn(`[الطِّراز: ${id}]`, message);
      if (desk && desk.mods) desk.mods.report({ id, part: PART, message: String(message || '').slice(0, 600) });
    } catch {}
  };
  window.addEventListener('error', (e) => {
    const id = modOf(e.filename) || modOf(e.error && e.error.stack);
    if (id && live.has(id)) report(id, e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const id = modOf(r && r.stack);
    if (id && live.has(id)) report(id, (r && r.message) || String(r));
  });

  /* ---------------- أدوات المود */
  const shellWin = () => {
    try {
      return TOP.WarraqShell ? TOP : null;
    } catch {
      return null;
    }
  };
  const bus = new EventTarget(); // أحداث البرنامج لهذه الصفحة: door و bench و night
  if (sameTop) {
    const relay = (e) => bus.dispatchEvent(new CustomEvent(e.type.slice(7), { detail: e.detail }));
    for (const t of ['door', 'bench']) TOP.addEventListener('warraq:' + t, relay);
    // (إطار بابٍ يُعاد تحميله: لا يبقى مستمعه في الهيكل)
    if (TOP !== window) window.addEventListener('pagehide', () => ['door', 'bench'].forEach((t) => TOP.removeEventListener('warraq:' + t, relay)), { once: true });
  }
  let night = document.documentElement.classList.contains('night');
  new MutationObserver(() => {
    const n = document.documentElement.classList.contains('night');
    if (n !== night) {
      night = n;
      bus.dispatchEvent(new CustomEvent('night', { detail: n }));
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  function makeScope(info) {
    const disposers = [];
    const settingsFns = [];
    let dead = false;
    let ctx = null;
    const track = (fn) => (disposers.push(fn), fn);
    const url = (rel = '') => new URL(String(rel).replace(/^\/+/, ''), new URL(info.base, location.origin)).href;
    const storeKey = 'warraq.mod.' + info.id;
    const readStore = () => {
      try {
        return JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
      } catch {
        return {};
      }
    };
    let toastEl = null;
    let toastT = 0;
    const wq = {
      id: info.id,
      name: info.name,
      version: info.version,
      part: PART,
      base: url(''),
      settings: { ...info.settings },
      /** عنوان ملفٍ من ملفات المود */
      url,
      /** أوراق أنماطٍ تُضاف (وتزول حين يُطفأ) ← عنصرها */
      css(text) {
        const s = document.createElement('style');
        s.dataset.mod = info.id;
        s.textContent = String(text);
        document.head.appendChild(s);
        track(() => s.remove());
        return s;
      },
      /** عنصرٌ من HTML */
      html(markup) {
        const t = document.createElement('template');
        t.innerHTML = String(markup).trim();
        return t.content.firstElementChild;
      },
      /** يضيف عنصراً (أو HTML) إلى مكانٍ (الأصل: body) ← العنصر */
      add(node, parent = document.body, before = null) {
        const el = typeof node === 'string' ? wq.html(node) : node;
        (typeof parent === 'string' ? document.querySelector(parent) : parent).insertBefore(el, before);
        track(() => el.remove());
        return el;
      },
      /**
       * مستمع: on(عنصر، حدث، دالة[، خيارات]) — أو أحداث البرنامج: on('door'|'bench'|'night'|'settings', دالة)
       * ← دالة تُلغيه
       */
      on(a, b, c, d) {
        if (typeof a === 'string') {
          if (a === 'settings') {
            settingsFns.push(b);
            return () => settingsFns.splice(settingsFns.indexOf(b), 1);
          }
          const h = (e) => {
            try {
              b(e.detail);
            } catch (err) {
              report(info.id, err && err.message);
            }
          };
          bus.addEventListener(a, h);
          return track(() => bus.removeEventListener(a, h));
        }
        const h = (e) => {
          try {
            return c(e);
          } catch (err) {
            report(info.id, err && err.message);
          }
        };
        a.addEventListener(b, h, d);
        return track(() => a.removeEventListener(b, h, d));
      },
      /** حين تتغيّر إعداداته (وإن لم يُطلب هذا أُعيد المود كله بإعداداته الجديدة) */
      onSettings(fn) {
        settingsFns.push(fn);
      },
      timeout(fn, ms) {
        const t = setTimeout(fn, ms);
        track(() => clearTimeout(t));
        return t;
      },
      interval(fn, ms) {
        const t = setInterval(fn, ms);
        track(() => clearInterval(t));
        return t;
      },
      /** حلقة رسم: fn(الوقت، الفرق) كل إطار، حتى تُرجع false أو يُطفأ المود ← دالة توقفها */
      frame(fn) {
        let id = 0;
        let last = performance.now();
        let on = true;
        const step = (t) => {
          if (!on || dead) return;
          const dt = t - last;
          last = t;
          let r;
          try {
            r = fn(t, dt);
          } catch (err) {
            report(info.id, err && err.message);
            r = false;
          }
          if (r === false) on = false;
          else id = requestAnimationFrame(step);
        };
        id = requestAnimationFrame(step);
        const stop = () => ((on = false), cancelAnimationFrame(id));
        track(stop);
        return stop;
      },
      /** مراقبة تغيّر الصفحة (MutationObserver) */
      observe(target, fn, opts = { childList: true, subtree: true }) {
        const mo = new MutationObserver((list) => {
          try {
            fn(list);
          } catch (err) {
            report(info.id, err && err.message);
          }
        });
        mo.observe(typeof target === 'string' ? document.querySelector(target) : target, opts);
        track(() => mo.disconnect());
        return mo;
      },
      /** أول عنصرٍ يطابق (الآن أو حين يظهر) ← وعدٌ به */
      when(selector, root = document) {
        const now = root.querySelector(selector);
        if (now) return Promise.resolve(now);
        return new Promise((resolve) => {
          const mo = new MutationObserver(() => {
            const el = root.querySelector(selector);
            if (el) mo.disconnect(), resolve(el);
          });
          mo.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
          track(() => mo.disconnect());
        });
      },
      /** كل عنصرٍ يطابق، الآن وكلما ظهر عنصرٌ جديد: fn(عنصر) مرةً لكلٍّ منها (الصفحات التي تُعاد رسمها) */
      each(selector, fn, root = document) {
        const seen = new WeakSet();
        const run = () => {
          for (const el of root.querySelectorAll(selector)) {
            if (seen.has(el)) continue;
            seen.add(el);
            try {
              const undo = fn(el);
              if (typeof undo === 'function') track(undo);
            } catch (err) {
              report(info.id, err && err.message);
            }
          }
        };
        run();
        wq.observe(root === document ? document.documentElement : root, run);
      },
      /** صوتٌ من ملفات المود ← عنصر الصوت (يتوقف حين يُطفأ) */
      sound(rel, opts = {}) {
        const a = new Audio(url(rel));
        a.volume = Math.max(0, Math.min(1, opts.volume == null ? 1 : +opts.volume));
        a.loop = !!opts.loop;
        if (opts.rate) a.playbackRate = +opts.rate;
        if (opts.play !== false) a.play().catch(() => {});
        track(() => {
          a.pause();
          a.removeAttribute('src');
        });
        return a;
      },
      /** AudioContext مشترك للمود (يُغلق حين يُطفأ) */
      get audio() {
        if (!ctx) {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
          track(() => ctx.close().catch(() => {}));
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
      },
      /** صوتٌ من ملفات المود مفكوكاً (AudioBuffer) لتشغيلٍ بلا تأخير */
      async buffer(rel) {
        const b = await (await fetch(url(rel))).arrayBuffer();
        return wq.audio.decodeAudioData(b);
      },
      /** يشغّل AudioBuffer ← مصدره */
      play(buf, { volume = 1, rate = 1, loop = false } = {}) {
        const ac = wq.audio;
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = loop;
        src.playbackRate.value = rate;
        const g = ac.createGain();
        g.gain.value = volume;
        src.connect(g).connect(ac.destination);
        src.start();
        return src;
      },
      /** حفظٌ صغيرٌ للمود (في هذا الجهاز) */
      store: {
        get: (k, def) => {
          const v = readStore()[k];
          return v === undefined ? def : v;
        },
        set: (k, v) => {
          const s = readStore();
          s[k] = v;
          try {
            localStorage.setItem(storeKey, JSON.stringify(s));
          } catch {}
        },
        remove: (k) => {
          const s = readStore();
          delete s[k];
          try {
            localStorage.setItem(storeKey, JSON.stringify(s));
          } catch {}
        },
      },
      /** رسالةٌ قصيرة أسفل الصفحة */
      toast(msg, ms = 3200) {
        if (!toastEl) {
          toastEl = wq.add(`<div role="status" data-mod-toast style="position:fixed;bottom:22px;left:50%;translate:-50% 0;z-index:2147483000;background:#2A1D14;color:#FBF8F1;padding:9px 18px;border-radius:3px;font:700 14px/1.6 Tajawal,'Segoe UI',Tahoma,sans-serif;box-shadow:0 14px 30px -14px #000;max-width:min(90vw,560px);text-align:center" hidden></div>`);
        }
        toastEl.textContent = String(msg);
        toastEl.hidden = false;
        clearTimeout(toastT);
        toastT = setTimeout(() => toastEl && (toastEl.hidden = true), ms);
      },
      /* ---- البرنامج */
      /** الباب الظاهر */
      get door() {
        const w = shellWin();
        return w ? w.WarraqShell.door : null;
      },
      /** الأبواب: [{ id, name }] */
      get doors() {
        const w = shellWin();
        return w && w.WarraqShell.doors ? w.WarraqShell.doors() : [];
      },
      /** افتح باباً ← وعدٌ بنافذته */
      go(door) {
        const w = shellWin();
        return w ? w.WarraqShell.go(door) : Promise.resolve(null);
      },
      /** نافذة باب (يُنشأ خفياً إن لم يُفتح بعد) */
      win(door) {
        const w = shellWin();
        return w ? w.WarraqShell.frameOf(door) : Promise.resolve(null);
      },
      /** السِّراج */
      get night() {
        return document.documentElement.classList.contains('night');
      },
      setNight(on) {
        if (!!on === wq.night) return;
        const b = (sameTop ? TOP.document : document).querySelector('.side [data-lamp], [data-lamp]');
        if (b) b.click();
      },
      /** أمرٌ في «القلم» (Ctrl+K) ← دالة تزيله */
      command(c) {
        const w = shellWin();
        if (!w || !w.WarraqShell.commands) return () => {};
        const off = w.WarraqShell.commands.add({ t: String(c.title || c.t || ''), h: c.hint || info.name, k: c.keys || c.k || '', run: () => c.run && c.run() });
        return track(off);
      },
      /** طلبٌ إلى الخادم الداخلي (JSON) */
      async api(p, opts = {}) {
        const r = await fetch(p, { ...opts, headers: { 'content-type': 'application/json', 'x-warraq': '1', ...(opts.headers || {}) }, body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body });
        const t = await r.text();
        try {
          return JSON.parse(t);
        } catch {
          return t;
        }
      },
      /** واجهة الهيكل كما هي (WarraqShell) وجسر البرنامج (warraqDesktop): لمن أراد كل شيء */
      get shell() {
        const w = shellWin();
        return w ? w.WarraqShell : null;
      },
      desk,
      /** ما يُفعل حين يُطفأ المود */
      cleanup: (fn) => track(fn),
      log: (...a) => console.log(`[${info.id}]`, ...a),
      /** يُكتب في «الطِّراز» تحت اسم المود */
      error: (msg) => report(info.id, msg),
      get disposed() {
        return dead;
      },
    };
    return {
      wq,
      settingsFns,
      dispose() {
        dead = true;
        for (const fn of disposers.splice(0).reverse()) {
          try {
            fn();
          } catch (err) {
            report(info.id, 'عند الإطفاء: ' + (err && err.message));
          }
        }
        toastEl = null;
      },
    };
  }

  /* ---------------- الإشعال والإطفاء */
  const cssLinks = (id) => [...document.querySelectorAll(`link[data-mod="${CSS.escape(id)}"]`)];
  function putCss(info) {
    const want = info.css.map((c) => info.base + c + '?v=' + encodeURIComponent(info.rev));
    const have = cssLinks(info.id);
    for (const l of have) if (!want.includes(l.getAttribute('href'))) l.remove();
    for (const href of want) {
      if (have.some((l) => l.getAttribute('href') === href && l.isConnected)) continue;
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.dataset.mod = info.id;
      document.head.appendChild(l);
    }
  }
  let gen = 0;
  async function startMod(info, fresh) {
    putCss(info);
    const scope = makeScope(info);
    const L = { info, scope, mods: [] };
    live.set(info.id, L);
    for (const js of info.js) {
      try {
        const mod = await import(info.base + js + '?v=' + encodeURIComponent(info.rev) + (fresh ? '&g=' + ++gen : ''));
        if (scope.wq.disposed) return;
        const fn = typeof mod.default === 'function' ? mod.default : typeof mod.activate === 'function' ? mod.activate : null;
        L.mods.push(mod);
        if (!fn) continue;
        const r = await fn(scope.wq);
        if (typeof r === 'function') scope.wq.cleanup(r);
        else if (r && typeof r.dispose === 'function') scope.wq.cleanup(() => r.dispose());
      } catch (err) {
        report(info.id, `${js}: ${(err && err.message) || err}`);
      }
    }
  }
  function stopMod(id) {
    const L = live.get(id);
    if (!L) return;
    live.delete(id);
    L.scope.dispose();
    for (const l of cssLinks(id)) l.remove();
  }

  /* ---------------- مطابقة ما يجب أن يعمل */
  let busy = null;
  let again = false;
  async function sync() {
    if (busy) return void (again = true);
    busy = (async () => {
      let r = null;
      try {
        r = await (await fetch('/api/mods?part=' + PART, { cache: 'no-store' })).json();
      } catch {}
      if (!r) return;
      const want = new Map(r.mods.map((m) => [m.id, m]));
      let reloadPage = false;
      for (const [id, L] of [...live]) {
        if (!want.has(id)) {
          stopMod(id);
          if (L.info.reload) reloadPage = true;
        }
      }
      // ما لم تجهز نصوصه بعد (وما لا نص له): أوراق أنماطه وحدها
      for (const l of document.querySelectorAll('link[data-mod]')) if (!want.has(l.dataset.mod)) l.remove();
      for (const m of r.mods) {
        const L = live.get(m.id);
        if (!L) {
          await startMod(m, false);
          continue;
        }
        if (L.info.rev !== m.rev) {
          stopMod(m.id);
          await startMod(m, true);
          continue;
        }
        if (JSON.stringify(L.info.settings) !== JSON.stringify(m.settings)) {
          if (L.scope.settingsFns.length) {
            L.info = m;
            Object.assign(L.scope.wq.settings, m.settings);
            for (const fn of L.scope.settingsFns) {
              try {
                fn(L.scope.wq.settings);
              } catch (err) {
                report(m.id, err && err.message);
              }
            }
          } else {
            stopMod(m.id);
            await startMod(m, false);
          }
        }
      }
      // ترتيب الأنماط: الأخير في القائمة يعلو
      for (const m of r.mods) for (const l of cssLinks(m.id)) document.head.appendChild(l);
      if (reloadPage) location.reload();
    })();
    try {
      await busy;
    } finally {
      busy = null;
      if (again) {
        again = false;
        sync();
      }
    }
  }

  /* ---------------- التبليغ: البرنامج ← النوافذ العليا ← الأبواب (BroadcastChannel) */
  let bc = null;
  try {
    bc = new BroadcastChannel('warraq-mods');
    bc.onmessage = () => sync();
  } catch {}
  if (isTop && desk && desk.mods && desk.mods.onChange)
    desk.mods.onChange((ev) => {
      try {
        bc && bc.postMessage(ev);
      } catch {}
      sync();
    });

  // الهيكل: تنتظر المودات واجهته (WarraqShell) — نصّه يعمل بعد هذا
  const ready = async () => {
    if (PART === 'shell') for (let i = 0; i < 300 && !window.WarraqShell; i++) await new Promise((r) => setTimeout(r, 20));
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
  return R;
}
