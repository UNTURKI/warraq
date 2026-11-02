// صفحة تنزيل البرنامج: نسختان (المستخدم، المبرمج). الضغط على صورة النسخة أو زرها ينزّل أحدث ما رفعه المالك.
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const size = (b) => (b >= 1024 ** 3 ? ar((b / 1024 ** 3).toFixed(2)) + ' غ.ب' : b >= 1024 ** 2 ? ar((b / 1024 ** 2).toFixed(1)) + ' م.ب' : ar(Math.max(1, Math.round(b / 1024))) + ' ك.ب');
const date = (iso) => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
};
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M6 11l6 6 6-6M5 21h14"/></svg>';

function card(e) {
  const v = e.latest;
  const shot = v
    ? `<a class="dl-shot" href="${esc(v.url)}" download title="تنزيل ${esc(e.title)}"><span class="dl-ribbon">الإصدار <bdi>${esc(v.version)}</bdi></span><img src="${esc(e.image)}" alt="${esc(e.title)}" width="480" height="320"></a>`
    : `<div class="dl-shot soon"><span class="dl-ribbon soon">قريباً</span><img src="${esc(e.image)}" alt="${esc(e.title)}" width="480" height="320"></div>`;
  const older = v && e.older.length
    ? `<details class="dl-older"><summary>إصدارات سابقة (${ar(e.older.length)})</summary><ul>${e.older.map((o) => `<li><a href="${esc(o.url)}" download>الإصدار <bdi>${esc(o.version)}</bdi></a><small>${size(o.size)} · ${date(o.date)}</small></li>`).join('')}</ul></details>`
    : '';
  return `<article class="dl-card" data-edition="${esc(e.key)}">
    ${shot}
    <div class="dl-body">
      <h2>${esc(e.title)}</h2>
      <p>${esc(e.desc)}</p>
      ${v ? `<div class="dl-meta"><span>الإصدار <bdi>${esc(v.version)}</bdi></span><span>${size(v.size)}</span><span>${date(v.date)}</span></div>` : ''}
      ${v && v.notes ? `<div class="dl-notes"><b>الجديد: </b>${esc(v.notes)}</div>` : ''}
      ${v ? `<a class="btn primary big dl-go" href="${esc(v.url)}" download>${ARROW}<span>تنزيل ${esc(e.title)}</span></a><div class="dl-file" title="${esc(v.name)}">${esc(v.name)}</div>` : `<span class="btn big dl-go" aria-disabled="true">لم تُرفع هذه النسخة بعد</span>`}
      ${older}
    </div>
  </article>`;
}

try {
  const r = await fetch('/api/downloads', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const { editions } = await r.json();
  document.getElementById('editions').innerHTML = editions.map(card).join('');
} catch (e) {
  document.getElementById('editions').innerHTML = '';
  const err = document.getElementById('dlErr');
  err.hidden = false;
  err.textContent = 'تعذّر تحميل صفحة التنزيل. حدّث الصفحة.';
}
