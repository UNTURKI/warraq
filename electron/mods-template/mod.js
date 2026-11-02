// مودي الأول. عدّل هذا الملف واحفظه: يُعاد المود في البرنامج في الحال («قيد الصنع»).
// wq: أدوات المود — كل ما يُضاف بها يزول وحده حين يُطفأ المود (انظر «دليل الصانع.md» بجانب هذا الملف).
export default function (wq) {
  // جزء البرنامج الذي يعمل فيه الآن: shell (الهيكل) أو khizana أو bench أو muharrir أو rahl أو styles أو covers أو settings
  if (wq.part !== 'shell') return;

  // ١) زرٌّ في الشريط الجانبي، قبل السِّراج
  const btn = wq.add(
    `<button type="button" class="door tool" title="${wq.name}">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>
       <span>مودي</span>
     </button>`,
    '.side',
    document.querySelector('.side .sp'),
  );
  wq.on(btn, 'click', () => wq.toast(wq.settings.message));

  // ٢) لونٌ من الإعدادات (يتغيّر في الحال حين يُغيَّر في «الطِّراز»)
  const paint = () => document.documentElement.style.setProperty('--my-mod-color', wq.settings.color);
  paint();
  wq.onSettings(paint);
  wq.cleanup(() => document.documentElement.style.removeProperty('--my-mod-color'));

  // ٣) أحداث البرنامج
  wq.on('door', ({ door }) => wq.log('الباب الآن:', door));

  // ٤) أمرٌ في «القلم» (Ctrl+K)
  wq.command({ title: 'سلّم عليّ (مودي)', run: () => wq.toast(wq.settings.message) });
}
