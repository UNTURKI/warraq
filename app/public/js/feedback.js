// زر «ملاحظاتك» العائم ونافذته: شكوى أو اقتراح أو خلل، من أي صفحة للمستخدم (الرئيسية، الإخراج، التنزيل، تصميم الغلاف).
// يُضمَّن بسطر واحد: <script src="/js/feedback.js" defer></script> — ويحمل تنسيقه معه، فلا يحتاج ملف أنماط.
// الصفحة التي فيها كتاب مفتوح تعرّف به: window.WarraqFeedback.book = () => ({ id, name })
(function () {
  if (window.WarraqFeedback && window.WarraqFeedback.ready) return;
  // صفحة مضمَّنة في إطار داخل صفحة أخرى (استوديو الأغلفة داخل واجهة الإخراج): الزر في الصفحة الأم يكفي
  if (window.top !== window) return;
  const PAGES = { '/': 'الصفحة الرئيسية', '/app/': 'واجهة الإخراج', '/download/': 'صفحة التنزيل', '/covers/': 'تصميم الغلاف' };
  const api = (window.WarraqFeedback = Object.assign(window.WarraqFeedback || {}, { ready: true }));

  const css = document.createElement('style');
  css.id = 'fb-style';
  css.textContent = `
.fb-open, .fb-dialog, .fb-toast { --fb-rubric: var(--l-btn, #6B1D2F); --fb-rubric-d: var(--l-btn-d, #551625); --fb-head: var(--l-rubric, #6B1D2F); --fb-on: var(--l-on, #fff); --fb-gold: var(--l-gold, #C5A059); --fb-paper: var(--l-paper, #FBF8F1); --fb-ink: var(--l-ink, #2A1D14); --fb-line: var(--l-line, #E4DCCB); --fb-muted: var(--l-muted, #6C5949); --fb-field: var(--l-sheet, #FFFDF8);
  font-family: 'Tajawal', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, sans-serif; font-size: 16px; line-height: 1.7; direction: rtl; box-sizing: border-box; }
.night .fb-open, .night .fb-dialog { --fb-rubric: #E2C27A; --fb-rubric-d: #F0D79C; --fb-head: #E2C27A; --fb-on: #0F1A2B; --fb-gold: #D6B36A; --fb-paper: #16243B; --fb-ink: #EDE3CB; --fb-line: #2A3B57; --fb-muted: #A9B4C6; --fb-field: #0F1A2B; }
.fb-dialog *, .fb-dialog *::before { box-sizing: border-box; }
/* لسان في حافة الصفحة، لا حبّة عائمة فوق المحتوى: ينفتح عند المرور عليه */
.fb-open { position: fixed; left: 0; bottom: 22%; z-index: 60; display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14.5px; background: var(--fb-rubric); color: var(--fb-on); border: 0; border-radius: 0 3px 3px 0; padding: 10px 16px 10px 14px; cursor: pointer; box-shadow: 0 10px 20px -12px rgba(42, 29, 20, .7); }
.fb-open:hover { background: var(--fb-rubric-d); }
.fb-open i { width: 8px; height: 8px; background: var(--fb-gold); transform: rotate(45deg); flex: none; }
.night .fb-open i { background: #0F1A2B; }
.fb-open em { font-style: normal; font-weight: 400; max-width: 0; overflow: hidden; white-space: nowrap; transition: max-width .4s cubic-bezier(.2, .8, .2, 1); }
.fb-open:hover em, .fb-open:focus-visible em { max-width: 14em; }
.fb-open:focus-visible { outline: 2px solid var(--fb-gold); outline-offset: 3px; }
.fb-dialog { border: 1px solid var(--fb-gold); border-radius: 3px; padding: 22px 24px; width: min(480px, calc(100% - 32px)); background: var(--fb-paper); color: var(--fb-ink); text-align: start; box-shadow: 0 30px 60px -30px rgba(0, 0, 0, .7); }
.fb-dialog::backdrop { background: rgba(20, 14, 9, .5); }
.fb-dialog h3 { margin: 0 0 8px; color: var(--fb-head); font-family: 'Adwa Assalaf', 'Amiri', 'Noto Naskh Arabic', serif; font-size: 26px; line-height: 1.5; display: flex; align-items: center; gap: 12px; }
.fb-dialog h3::before { content: ''; width: 10px; height: 10px; background: var(--fb-gold); transform: rotate(45deg); flex: none; }
.fb-dialog .fb-field { display: flex; flex-direction: column; gap: 2px; margin: 12px 0; font-size: 13px; color: var(--fb-muted); }
.fb-dialog textarea, .fb-dialog input, .fb-dialog select { font: inherit; font-size: 16px; padding: 6px 2px; border: 0; border-bottom: 1px solid var(--fb-muted); border-radius: 0; background: transparent; color: var(--fb-ink); width: 100%; height: auto; }
.fb-dialog textarea { resize: vertical; min-height: 110px; border: 1px solid var(--fb-line); background: var(--fb-field); padding: 8px 10px; border-radius: 2px; }
.fb-dialog textarea:focus, .fb-dialog input:focus, .fb-dialog select:focus { outline: none; border-color: var(--fb-gold); box-shadow: 0 1px 0 var(--fb-gold); }
.fb-dialog select option { background: var(--fb-paper); color: var(--fb-ink); }
.fb-dialog .fb-hp { position: absolute; inset-inline-start: -9999px; width: 1px; height: 1px; opacity: 0; }
.fb-dialog .fb-book { display: block; color: var(--fb-muted); font-size: 13.5px; }
.fb-dialog .fb-status { margin: 10px 0 0; padding: 8px 12px; border-radius: 2px; border-inline-start: 3px solid #9b2a2a; background: var(--fb-field); color: #9b2a2a; font-size: 14px; }
.night .fb-dialog .fb-status { color: #F0A0A0; border-color: #F0A0A0; }
.fb-dialog .fb-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-start; margin-top: 18px; }
.fb-dialog .fb-btn { font: inherit; font-weight: 700; border-radius: 3px; border: 1px solid var(--fb-line); background: transparent; color: var(--fb-ink); padding: 9px 22px; cursor: pointer; height: auto; }
.fb-dialog .fb-btn:hover { border-color: var(--fb-gold); }
.fb-dialog .fb-btn.primary { background: var(--fb-rubric); color: var(--fb-on); border-color: var(--fb-rubric); }
.fb-dialog .fb-btn.primary:hover:not(:disabled) { background: var(--fb-rubric-d); }
.fb-dialog .fb-btn:disabled { opacity: .5; cursor: not-allowed; }
.fb-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; background: #2A1D14; color: #FBF8F1; padding: 10px 18px; border-radius: 2px; z-index: 70; max-width: calc(100% - 32px); box-shadow: 0 14px 26px -14px rgba(0, 0, 0, .6); }
.fb-toast::before { content: 'بلغ'; font-family: 'Adwa Assalaf', 'Amiri', serif; font-weight: 700; font-size: 16px; line-height: 1; width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid #E3C77A; color: #E3C77A; display: grid; place-items: center; transform: rotate(-12deg); flex: none; }
.fb-open[hidden], .fb-toast[hidden], .fb-dialog [hidden] { display: none !important; }
@media (max-width: 640px) { .fb-open { bottom: 14px; padding: 8px 12px 8px 10px; font-size: 13.5px; } .fb-open em { display: none; } }
@media (prefers-reduced-motion: reduce) { .fb-open em { transition: none; } }
@media print { .fb-open, .fb-toast { display: none !important; } }`;
  document.head.appendChild(css);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <button type="button" class="fb-open" title="أرسل ملاحظة أو شكوى أو اقتراحاً"><i></i>ملاحظاتك<em>شكوى، اقتراح، خلل، طلب كتاب</em></button>
  <dialog class="fb-dialog" aria-label="ملاحظاتك">
    <form>
      <h3>ملاحظاتك تهمّنا</h3>
      <label class="fb-field">النوع
        <select name="type"><option value="suggestion">اقتراح</option><option value="complaint">شكوى</option><option value="bug">خلل تقني</option><option value="book">مشكلة في كتاب</option><option value="other">أخرى</option></select>
      </label>
      <label class="fb-field">الرسالة<textarea name="message" rows="5" required minlength="3" maxlength="4000"></textarea></label>
      <label class="fb-field">وسيلة التواصل (اختياري)<input name="contact" maxlength="200" placeholder="بريد أو رقم"></label>
      <input name="website" class="fb-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <small class="fb-book"></small>
      <p class="fb-status" hidden></p>
      <div class="fb-actions"><button type="button" class="fb-btn" data-cancel>إلغاء</button><button class="fb-btn primary" type="submit">إرسال</button></div>
    </form>
  </dialog>
  <div class="fb-toast" hidden></div>`;
  const add = () => document.body.append(...wrap.children);
  if (document.body) add();
  else document.addEventListener('DOMContentLoaded', add);

  const $ = (s) => document.querySelector(s);
  const book = () => {
    try {
      return typeof api.book === 'function' ? api.book() : null;
    } catch {
      return null;
    }
  };
  let toastT = 0;
  function toast(msg) {
    const t = $('.fb-toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), 3200);
  }

  function openDialog() {
    const d = $('.fb-dialog');
    d.querySelector('form').reset();
    d.querySelector('.fb-status').hidden = true;
    const b = book();
    d.querySelector('.fb-book').textContent = b && b.name ? `سيُرفق بها الكتاب الحالي: ${b.name}` : '';
    d.showModal();
  }
  // برنامج سطح المكتب: تُفتح من قائمة «مساعدة ← أرسل ملاحظة» (والزر العائم للموقع وحده)
  api.open = () => (document.body ? openDialog() : document.addEventListener('DOMContentLoaded', openDialog, { once: true }));
  document.addEventListener('click', (e) => {
    if (e.target.closest('.fb-open')) openDialog();
    else if (e.target.closest('.fb-dialog [data-cancel]')) $('.fb-dialog').close();
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.fb-dialog form');
    if (!form) return;
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    const b = book();
    if (b && b.id) Object.assign(body, { bookId: b.id, bookName: b.name });
    body.page = PAGES[location.pathname] || location.pathname.slice(0, 60);
    const msg = form.querySelector('.fb-status');
    const send = form.querySelector('button[type=submit]');
    send.disabled = true;
    try {
      // في البرنامج تُرسل إلى موقع ورّاق (صندوق ملاحظات المالك)، لا إلى الخادم الداخلي في جهاز المستخدم
      const desk = window.warraqDesktop;
      if (desk) {
        const d = await desk.sendFeedback(body);
        if (!d || !d.ok) throw new Error((d && d.error) || 'تعذّر الإرسال');
        $('.fb-dialog').close();
        toast(d.via === 'mail' ? 'فُتحت رسالة بريد فيها ملاحظتك: أرسلها من برنامج البريد' : 'وصلت رسالتك، شكراً لك');
        return;
      }
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'تعذّر الإرسال');
      $('.fb-dialog').close();
      toast('وصلت رسالتك، شكراً لك');
    } catch (err) {
      msg.hidden = false;
      msg.textContent = err.message;
    } finally {
      send.disabled = false;
    }
  });
})();
