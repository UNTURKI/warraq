// النسّاخ: طابور يُخرج الكتب في الخلفية، والمنضدة الظاهرة فارغةٌ لكتاب آخر.
// الناسخ منضدةٌ خفية (/app/?scribe=1) في الهيكل: يأخذ مشروعاً من الطابور، فيعيده ويُخرجه ويسجّله في الخزانة، ثم التالي.
// الطابور محفوظ في مجلد بيانات البرنامج: يُستأنف بعد إعادة التشغيل (من أول الكتاب الذي كان يُنسخ).
const desk = window.warraqDesktop || null;
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);

export function initScribes(shell, render) {
  let queue = [];
  let frame = null;
  let busy = false;
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const save = () => desk && desk.queueSave(queue.map(({ pct, ...j }) => j)).catch(() => {});
  const changed = () => {
    save();
    shell.scribesChanged();
  };

  /** الناسخ: منضدة خفية، تُنشأ أول مرة */
  function scribe() {
    if (frame) return frame.ready;
    frame = hiddenBench('النسّاخ');
    return frame.ready;
  }
  function hiddenBench(title) {
    const el = document.createElement('iframe');
    el.src = '/app/?scribe=1';
    el.title = title;
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    // ثابتٌ خلف الأبواب وغير مرئي (لا خارج الصفحة: في صفحة من اليمين إلى اليسار يوسّع ذلك التمرير)
    el.style.cssText = 'position:fixed;inset:0 auto auto 0;width:1200px;height:900px;visibility:hidden;pointer-events:none;border:0;z-index:-1';
    document.body.appendChild(el);
    const ready = new Promise((resolve) =>
      el.addEventListener(
        'load',
        () => {
          // المنضدة تجهز بعد تحميل أساليبها: ينتظرها الناسخ
          const w = el.contentWindow;
          const wait = () => (w.WarraqBench ? resolve(w) : setTimeout(wait, 100));
          wait();
        },
        { once: true },
      ),
    );
    return { el, ready };
  }
  // منضدة خفية ثانية لـ«حوّله إلى وَرَق» (لا تنتظر طابور النسّاخ ولا تمسّه)
  let conv = null;
  let convBusy = Promise.resolve();

  async function next() {
    if (busy) return;
    const job = queue.find((j) => j.state === 'waiting');
    if (!job) return;
    busy = true;
    job.state = 'running';
    job.pct = 0;
    job.error = '';
    changed();
    let ok = false;
    try {
      const w = await scribe();
      w.WarraqBench.onProgress = (info) => {
        job.pct = info ? info.pct || 0 : 0;
        if (info && info.title) job.title = info.title;
        render();
        if (desk) desk.progress(info && info.running ? { pct: job.pct, title: job.title, phase: info.phase || 1 } : null, 'scribes');
      };
      ok = job.files ? await w.WarraqBench.runFiles(job.files, job.rahl ? { pdf: true } : {}) : await w.WarraqBench.run(job.project);
      // «ضعه على الرَّحل» لكتاب «وَرَق»: نُضِّد، فيوضع مجلده الأول على الرَّحل
      if (ok && job.rahl && desk) {
        const out = w.WarraqBench.outputFiles();
        const v = out.volumes.find((x) => x.pdf);
        if (v) {
          const bytes = await desk.readFile(v.pdf);
          shell.openOnRahl(new File([bytes], v.pdf.split(/[\\/]/).pop(), { type: 'application/pdf' }), { waraq: out.waraq || job.files[0], title: out.title + (v.label ? ' — ' + v.label : '') });
        }
      }
      if (!ok && !job.error) job.error = 'لم يتمّ إخراج كل المجلدات';
    } catch (err) {
      job.error = (err && err.message) || String(err);
    }
    // تمّ: الألف بنقطه الخمس ذهباً في شريط المهام (وإشعار التمام يرسله الناسخ بعد تسجيل الكتاب في الخزانة)
    if (desk) desk.progress(ok && !queue.some((j) => j !== job && j.state === 'waiting') ? { done: true, title: job.title } : null, 'scribes');
    if (job.state === 'running') {
      if (ok) {
        queue = queue.filter((j) => j !== job);
        shell.libraryChanged();
      } else job.state = 'failed';
    }
    busy = false;
    changed();
    next();
  }

  const api = {
    list: () => queue.map((j) => ({ id: j.id, title: j.title, state: j.state, pct: j.pct || 0, error: j.error || '', added: j.added })),
    /** مشروع من المنضدة إلى الطابور */
    add(project) {
      if (!project || project.format !== 'warraq-project') return false;
      queue.push({ id: id(), title: project.title || 'كتاب', project, state: 'waiting', added: Date.now() });
      changed();
      next();
      return true;
    },
    /** ملفات Word أو PDF (من «أضفه إلى طابور النسّاخ» في المستكشف): تُخرج بأسلوب ورّاق الأصلي */
    addFiles(paths, opts = {}) {
      const list = (paths || []).filter(Boolean);
      if (!list.length) return false;
      const name = list[0].split(/[\\/]/).pop().replace(/\.(docx|pdf|waraq|warraq)$/i, '');
      queue.push({ id: id(), title: name, files: list, ...(opts.rahl ? { rahl: true } : {}), state: 'waiting', added: Date.now() });
      changed();
      next();
      return true;
    },
    /** «حوّله إلى وَرَق»: ملف PDF أو Word يصير كتاب «وَرَق» في مجلد الكتب ← { path, title } */
    toWaraq(file, onProgress) {
      const run = convBusy.then(async () => {
        if (!conv) conv = hiddenBench('صانع الوَرَق');
        const w = await conv.ready;
        return w.WarraqBench.makeWaraq(file, onProgress);
      });
      convBusy = run.catch(() => {});
      return run;
    },
    remove(jid) {
      const j = queue.find((x) => x.id === jid);
      if (!j) return;
      if (j.state === 'running') {
        j.state = 'cancelled';
        if (frame) frame.ready.then((w) => w.WarraqBench.cancel());
      }
      queue = queue.filter((x) => x !== j);
      changed();
    },
    retry(jid) {
      const j = queue.find((x) => x.id === jid);
      if (!j || j.state !== 'failed') return;
      j.state = 'waiting';
      j.error = '';
      changed();
      next();
    },
  };
  window.WarraqScribes = api;

  // الطابور المحفوظ: ما كان يُنسخ حين أُغلق البرنامج يعود إلى الانتظار
  if (desk)
    desk
      .queueLoad()
      .then((q) => {
        queue = (q || []).map((j) => ({ ...j, state: j.state === 'failed' ? 'failed' : 'waiting', pct: 0 }));
        shell.scribesChanged();
        next();
      })
      .catch(() => {});
  return api;
}
