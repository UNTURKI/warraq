function wqGuest(win, send, root) {
  // ما يوضع في صفحة الدرس (يوتيوب، تيليجرام، أي موقع، أو مقطعٌ من الجهاز) — يحقنه البرنامج في المتصفح:
  // يجد المقطع الذي يُشغَّل، ويخبر بحاله، وينفّذ الأوامر (التشغيل، والقفز، والسرعة)، ويملأ به الصفحة بدل ملء الشاشة،
  // ويقيس صوته (موجاتٌ حقيقية)، ويبثّ صوته للتفريغ المباشر حين يُطلب.
  // مكتفٍ بنفسه: لا يعتمد على شيء خارجه، ويُكتب كما هو في الصفحة.
  if (win !== win.top && !win.__wqAllowFrame) return null;
  const doc = root.ownerDocument || root;
  const isDoc = root.nodeType === 9; // صفحةٌ كاملة (لا مقطعاً في الهيكل نفسه)
  let active = null;

  /* ---------------- المقطع */
  const area = (el) => {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  };
  function pick() {
    const list = [...root.querySelectorAll('video,audio')].filter((m) => m.isConnected);
    return (
      list.find((m) => !m.paused && !m.ended && m.readyState > 2) ||
      list.filter((m) => m.tagName === 'VIDEO' && m.duration > 0).sort((a, b) => area(b) - area(a))[0] ||
      list.find((m) => m.duration > 0) ||
      null
    );
  }
  const EVS = ['play', 'pause', 'seeked', 'ratechange', 'loadedmetadata', 'emptied'];
  function report() {
    const el = pick();
    if (el !== active) {
      if (active) for (const ev of EVS) active.removeEventListener(ev, report);
      active = el;
      if (el) for (const ev of EVS) el.addEventListener(ev, report);
    }
    syncFill();
    syncMeter();
    syncTap();
    send(
      'state',
      el
        ? { has: true, t: el.currentTime, d: isFinite(el.duration) ? el.duration : 0, paused: el.paused, rate: el.playbackRate, muted: el.muted || el.volume === 0, video: el.tagName === 'VIDEO' && el.videoWidth > 0, title: String(doc.title || '').slice(0, 300), fill: !!fillEl, tap: tapInfo(el) }
        : { has: false, title: String(doc.title || '').slice(0, 300), fill: false },
    );
  }
  /** صوت المقطع (يُلتقط مرة لكل مقطع، ولا يمسّ تشغيله) */
  function streamOf(el, fresh) {
    try {
      if (fresh || !el.__wqStream) {
        el.__wqStream = el.captureStream ? el.captureStream() : el.mozCaptureStream ? el.mozCaptureStream() : null;
        el.__wqStreamAt = Date.now();
      }
      return el.__wqStream;
    } catch {
      return null;
    }
  }
  const trackOf = (s) => (s ? s.getAudioTracks().find((t) => t.readyState === 'live') || null : null);
  /** صوت المقطع الحيّ؛ وإن انقطع (تغيّر مصدره ولم يُعطِ الالتقاطُ القديم صوتاً جديداً) يُلتقط من جديد */
  const liveTrack = (el) => {
    let tr = trackOf(streamOf(el));
    if (!tr && !el.paused && el.readyState > 2 && Date.now() - (el.__wqStreamAt || 0) > 3000) tr = trackOf(streamOf(el, true));
    return tr;
  };

  /* ---------------- ملء المجلس (بدل ملء الشاشة): زرّ ملء الشاشة في الموقع يملأ الصفحة وحدها */
  const css = doc.createElement('style');
  css.textContent =
    'html.__wq-filled,html.__wq-filled body{overflow:hidden!important}' +
    '.__wq-fill{position:fixed!important;inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;z-index:2147483646!important;background:#000!important;transform:none!important;border-radius:0!important}' +
    'video.__wq-fill{object-fit:contain!important}';
  const addCss = () => isDoc && (doc.head || doc.documentElement) && !css.isConnected && (doc.head || doc.documentElement).appendChild(css);
  addCss();
  let fsEl = null; // ما طلب «ملء الشاشة»
  let fillEl = null; // ما ملأه البرنامج
  let wantFill = false;
  const relayout = () => {
    if (!isDoc) return;
    doc.documentElement.classList.toggle('__wq-filled', !!(fsEl || fillEl));
    try {
      win.dispatchEvent(new Event('resize'));
    } catch {}
  };
  const fsChange = () => {
    relayout();
    for (const n of ['fullscreenchange', 'webkitfullscreenchange']) {
      try {
        doc.dispatchEvent(new Event(n, { bubbles: true }));
      } catch {}
    }
  };
  function enterFs() {
    addCss();
    fsEl = this;
    this.classList.add('__wq-fill');
    fsChange();
    return Promise.resolve();
  }
  function exitFs() {
    if (fsEl) {
      if (fsEl !== fillEl) fsEl.classList.remove('__wq-fill');
      fsEl = null;
      fsChange();
    }
    return Promise.resolve();
  }
  if (isDoc) try {
    const EP = win.Element.prototype;
    const DP = win.Document.prototype;
    EP.requestFullscreen = EP.webkitRequestFullscreen = EP.webkitRequestFullScreen = enterFs;
    DP.exitFullscreen = DP.webkitExitFullscreen = DP.webkitCancelFullScreen = exitFs;
    for (const k of ['fullscreenElement', 'webkitFullscreenElement', 'webkitCurrentFullScreenElement']) Object.defineProperty(DP, k, { get: () => fsEl, configurable: true });
    for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(DP, k, { get: () => true, configurable: true });
    for (const k of ['fullscreen', 'webkitIsFullScreen']) Object.defineProperty(DP, k, { get: () => !!fsEl, configurable: true });
  } catch {}
  if (isDoc) win.addEventListener('keydown', (e) => e.key === 'Escape' && fsEl && exitFs(), true);
  /** ما يُملأ: مشغّل يوتيوب كله (بأزراره وترجمته)، وإلا المقطع نفسه */
  function fillTarget(el) {
    if (!el) return null;
    const yt = el.closest('#movie_player, .html5-video-player');
    if (yt && !/\/shorts\//.test(win.location.pathname)) return yt;
    if (el.tagName !== 'VIDEO' || /\/shorts\//.test(win.location.pathname)) return null;
    return el;
  }
  function syncFill() {
    const t = wantFill && isDoc ? fillTarget(active) : null;
    if (t === fillEl) return;
    if (fillEl && fillEl !== fsEl) fillEl.classList.remove('__wq-fill');
    fillEl = t;
    if (t) {
      addCss();
      t.classList.add('__wq-fill');
    }
    relayout();
  }
  function fill(on) {
    wantFill = !!on;
    syncFill();
    report();
  }

  /* ---------------- مستوى الصوت: موجاتٌ من صوت المقطع نفسه */
  let meterOn = false;
  let M = null; // { el, ac, an, src, buf }
  let meterT = 0;
  function syncMeter() {
    const el = active;
    if (!meterOn || !el) return;
    const tr = liveTrack(el);
    if (M && M.el === el && M.track === tr) return;
    stopMeter();
    if (!tr) return;
    try {
      const ac = new (win.AudioContext || win.webkitAudioContext)();
      const src = ac.createMediaStreamSource(new MediaStream([tr]));
      const an = ac.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.55;
      src.connect(an);
      if (ac.state === 'suspended') ac.resume();
      M = { el, track: tr, ac, an, buf: new Uint8Array(an.frequencyBinCount) };
    } catch {}
  }
  function stopMeter() {
    if (!M) return;
    try {
      M.ac.close();
    } catch {}
    M = null;
  }
  // ٢٤ حزمة (لوغاريتمية) من ٨٠ إلى ٦٠٠٠ هرتز، ٠–٢٥٥
  function bands() {
    M.an.getByteFrequencyData(M.buf);
    const n = M.buf.length;
    const hz = M.ac.sampleRate / 2 / n;
    const out = [];
    for (let b = 0; b < 24; b++) {
      const f0 = 80 * Math.pow(6000 / 80, b / 24);
      const f1 = 80 * Math.pow(6000 / 80, (b + 1) / 24);
      const i0 = Math.max(1, Math.floor(f0 / hz));
      const i1 = Math.max(i0 + 1, Math.ceil(f1 / hz));
      let m = 0;
      for (let i = i0; i < i1 && i < n; i++) m = Math.max(m, M.buf[i]);
      out.push(m);
    }
    return out;
  }
  function meter(on) {
    meterOn = !!on;
    clearInterval(meterT);
    if (!meterOn) return stopMeter();
    syncMeter();
    meterT = setInterval(() => {
      if (!M || !active || active.paused) return;
      send('lvl', bands());
    }, 85);
  }

  /* ---------------- التفريغ المباشر: صوت المقطع نفسه (لا المايكروفون) ← PCM16 أحادي بمعدّل الخدمة */
  // يُلتقط من المقطع (captureStream) فلا يتأثر بأصوات الجهاز الأخرى، ولا يمسّ ما يسمعه المستعمل.
  // يُرشَّح (مرشّحا تمريرٍ منخفض) ثم يُخفَّض معدّله، ويُرسل كل ~٨٥ ملّي ثانية ومعه وقت المقطع وسرعته.
  // لا يُرسل شيء والمقطع متوقف، فالسكوت المُرسل سكوتٌ في الدرس نفسه.
  let tapOn = false;
  let tapRate = 16000;
  let TP = null; // { el, track, ac, sp }
  function syncTap() {
    const el = active;
    if (!tapOn || !el) return;
    let tr = liveTrack(el);
    if (TP && TP.el === el && TP.track === tr) {
      // (سياق الصوت معلَّقٌ: يُستأنف؛ وصوتٌ صفرٌ محض طويلاً والمقطع يعمل: التقاطٌ ميت، فيُلتقط من جديد)
      if (TP.ac.state === 'suspended') TP.ac.resume().catch(() => {});
      if (!(TP.zero && !el.paused && Date.now() - TP.zero > 10000 && Date.now() - TP.born > 10000)) return;
      TP.re = (TP.re || 0) + 1;
      tr = trackOf(streamOf(el, true));
    }
    const re = TP && TP.el === el ? TP.re || 0 : 0;
    stopTap();
    if (!tr) return;
    try {
      const ac = new (win.AudioContext || win.webkitAudioContext)();
      const src = ac.createMediaStreamSource(new MediaStream([tr]));
      const lp = [0, 1].map(() => {
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = Math.min(tapRate * 0.45, ac.sampleRate * 0.45);
        f.Q.value = 0.707;
        return f;
      });
      const sp = ac.createScriptProcessor(4096, 1, 1);
      const mute = ac.createGain();
      mute.gain.value = 0;
      src.connect(lp[0]);
      lp[0].connect(lp[1]);
      lp[1].connect(sp);
      sp.connect(mute);
      mute.connect(ac.destination);
      const step = ac.sampleRate / tapRate;
      let pos = 0; // موضع العيّنة التالية (بعيّنات الدخل) من أول الكتلة
      let prev = 0;
      sp.onaudioprocess = (e) => {
        if (!tapOn || !TP || TP.sp !== sp || el.paused || el.seeking || el.ended) return void (pos = 0);
        const x = e.inputBuffer.getChannelData(0);
        const n = x.length;
        const out = new Int16Array(Math.ceil((n - pos) / step) + 1);
        let k = 0;
        let pk = 0;
        for (let j = 0; j < n; j += 8) {
          const a = x[j] < 0 ? -x[j] : x[j];
          if (a > pk) pk = a;
        }
        const T0 = TP;
        T0.n++;
        if (pk > 1e-6) T0.zero = 0;
        else if (!T0.zero) T0.zero = Date.now();
        for (; pos < n; pos += step) {
          const i = Math.floor(pos);
          const fr = pos - i;
          const a = i === 0 && fr < 0 ? prev : x[i];
          const b = i + 1 < n ? x[i + 1] : x[i];
          let v = a + (b - a) * fr;
          v = v < -1 ? -1 : v > 1 ? 1 : v;
          out[k++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        pos -= n;
        prev = x[n - 1];
        if (!k) return;
        const pcm = out.slice(0, k);
        // وقت أول عيّنة في المقطع: الآن ناقص طول الكتلة (بسرعة التشغيل)
        send('pcm', { b: pcm.buffer, t: Math.max(0, el.currentTime - (n / ac.sampleRate) * (el.playbackRate || 1)), r: el.playbackRate || 1, n: k });
      };
      if (ac.state === 'suspended') ac.resume();
      TP = { el, track: tr, ac, sp, n: 0, zero: 0, born: Date.now(), re };
    } catch {}
  }
  /** حال التقاط الصوت (ليعرف المجلس أن الصوت مطلوبٌ هنا، ويعرف سبب انقطاعه إن انقطع) */
  function tapInfo(el) {
    if (!tapOn) return null;
    return { on: true, ok: !!TP, ac: TP ? TP.ac.state : '', track: !!trackOf(el.__wqStream), n: TP ? TP.n : 0, zero: TP && TP.zero ? Date.now() - TP.zero : 0, re: TP ? TP.re || 0 : 0 };
  }
  function stopTap() {
    if (!TP) return;
    try {
      TP.sp.onaudioprocess = null;
      TP.ac.close();
    } catch {}
    TP = null;
  }
  function tap(on, rate) {
    tapOn = !!on;
    if (+rate >= 8000 && +rate <= 48000) tapRate = +rate;
    if (!tapOn) return stopTap();
    stopTap();
    syncTap();
  }

  /* ---------------- الأوامر */
  const api = {
    cmd(name, arg) {
      const el = active || pick();
      if (!el) return false;
      if (name === 'toggle') el.paused ? el.play() : el.pause();
      else if (name === 'play') el.play();
      else if (name === 'pause') el.pause();
      else if (name === 'seekBy') el.currentTime = Math.max(0, Math.min((el.duration || 1e9) - 0.2, el.currentTime + (+arg || 0)));
      else if (name === 'seek') el.currentTime = Math.max(0, Math.min((el.duration || 1e9) - 0.2, +arg || 0));
      else if (name === 'rate') el.playbackRate = +arg || 1;
      setTimeout(report, 60);
      return true;
    },
    fill,
    meter,
    tap,
    report,
    stop() {
      clearInterval(timer);
      clearInterval(meterT);
      stopMeter();
      tapOn = false;
      stopTap();
    },
  };
  const timer = setInterval(report, 400);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => (addCss(), report()));
  report();
  return api;
}
