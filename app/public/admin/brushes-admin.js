// الإعدادات ← الخطوط ← «فُرَش الرسم»: تُقرأ ملفات الفُرَش هنا في المتصفح (shared/brush-import.js)،
// وتُرسل أشكالها صوراً إلى البرنامج، فتصير أشكالاً لأقلام الرَّحل.
import { readBrushFile } from '/shared/brush-import.js';
import { preview, tipThumb, brushSets } from '/js/brush-engine.js';

const $ = (s) => document.querySelector(s);
const AR = '٠١٢٣٤٥٦٧٨٩';
const ar = (n) => String(n).replace(/[0-9]/g, (d) => AR[+d]);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const count = (n) => (n === 1 ? 'شكلٌ واحد' : n === 2 ? 'شكلان' : n % 100 >= 3 && n % 100 <= 10 ? `${ar(n)} أشكال` : `${ar(n)} شكلاً`);
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-warraq': '1' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  let d = {};
  try {
    d = await r.json();
  } catch {}
  if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  return d;
}
const toast = (m) => (window.adminToast ? window.adminToast(m) : null);

/* ---------------- ما يحتاجه القارئ في المتصفح: فكّ الضغط، والصور */
const inflate = async (b, fmt) => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer());
async function decodeImage(b, mime) {
  let src;
  if (/svg/.test(mime)) {
    const url = URL.createObjectURL(new Blob([b], { type: mime }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const k = Math.min(1, 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512));
      src = { img, w: Math.round((img.naturalWidth || 512) * k), h: Math.round((img.naturalHeight || 512) * k) };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } else {
    const bmp = await createImageBitmap(new Blob([b], { type: mime }));
    src = { img: bmp, w: bmp.width, h: bmp.height };
  }
  const c = document.createElement('canvas');
  c.width = src.w;
  c.height = src.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src.img, 0, 0, src.w, src.h);
  return { w: src.w, h: src.h, data: g.getImageData(0, 0, src.w, src.h).data };
}
const ENV = { inflateRaw: (b) => inflate(b, 'deflate-raw'), inflate: (b) => inflate(b, 'deflate'), decodeImage };
/** القناع ← صورة PNG (حبرٌ أسود في قناة الشفافية) */
function maskPng(t) {
  const c = document.createElement('canvas');
  c.width = t.w;
  c.height = t.h;
  const g = c.getContext('2d');
  const im = g.createImageData(t.w, t.h);
  for (let i = 0; i < t.w * t.h; i++) im.data[i * 4 + 3] = t.mask[i];
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}

/* ---------------- الإضافة */
const ACCEPT = '.abr,.gbr,.gih,.vbr,.kpp,.bundle,.brush,.brushset,.myb,.zip,.png,.jpg,.jpeg,.webp,.svg,.gif,.bmp,.tif,.tiff,.sut,.tpl,.brushes';
async function addFiles(files) {
  const msg = $('#brushMsg');
  const lines = [];
  const show = () => {
    msg.hidden = !lines.length;
    msg.innerHTML = lines.join('');
  };
  for (const f of files) {
    const k = lines.push(`<div class="res"><span class="spin"></span> تُقرأ «${esc(f.name)}»…</div>`) - 1;
    show();
    try {
      if (f.size > 300 * 1024 * 1024) throw new Error('الملف كبير جداً (٣٠٠ م.ب على الأكثر)');
      const r = await readBrushFile(f.name, new Uint8Array(await f.arrayBuffer()), ENV);
      lines[k] = `<div class="res"><span class="spin"></span> «${esc(f.name)}»: ${count(r.tips.length)} — تُحفظ…</div>`;
      show();
      const name = f.name.replace(/\.[a-z0-9]+$/i, '');
      // دفعاتٌ لا تزيد على ٦٠ م.ب
      const set = await api('/api/admin/brushes', { method: 'POST', body: { name, file: f.name, format: r.format, tips: r.tips.map((t) => ({ name: t.name, w: t.w, h: t.h, sp: t.spacing, ang: t.angle || 0, png: maskPng(t) })) } });
      lines[k] = `<div class="res ok"><b>✓ أُضيفت «${esc(set.name)}»</b> — ${count(set.tips.length)} · ${esc(r.format)}${r.warnings.length ? `<div class="tip">${r.warnings.map(esc).join('<br>')}</div>` : ''}</div>`;
    } catch (e) {
      lines[k] = `<div class="res err"><b>✗ «${esc(f.name)}»</b>: ${esc(e.message || e)}</div>`;
    }
    show();
  }
  await brushSets(true);
  load();
}

/* ---------------- المجموعات */
let sets = [];
async function load() {
  try {
    sets = (await api('/api/admin/brushes')).sets || [];
  } catch (e) {
    $('#brushSets').innerHTML = `<p class="empty">${esc(e.message)}</p>`;
    return;
  }
  render();
}
function render() {
  const box = $('#brushSets');
  if (!sets.length) {
    box.innerHTML = '<p class="empty">لا فُرَش بعد. أقلام الرَّحل تعمل بأشكالها المضمّنة (مستدير، قلم القصب، رصاص، فحم، فرشاة حبر…)، وما تضيفه هنا يُضاف إليها.</p>';
    return;
  }
  box.innerHTML = sets
    .map(
      (s) => `<div class="br-set" data-id="${esc(s.id)}">
      <div class="br-h">
        <canvas class="br-prev" width="280" height="56" data-ref="s:${esc(s.id)}:${s.tips[0].n}" aria-hidden="true"></canvas>
        <div class="br-name"><b title="انقر لتسميتها">${esc(s.name)}</b><input class="br-rn" type="text" maxlength="80" dir="auto" value="${esc(s.name)}" aria-label="اسم المجموعة" hidden><small>${count(s.tips.length)} · ${esc(s.format || '')}${s.file ? ` · <span dir="ltr">${esc(s.file)}</span>` : ''}</small></div>
        <span class="spacer"></span>
        <button type="button" class="btn small" data-act="rename">تسمية</button>
        <button type="button" class="btn small danger" data-act="del">حذف</button>
      </div>
      <div class="br-tips">${s.tips
        .slice(0, 120)
        .map((t) => `<button type="button" class="br-tip" data-n="${t.n}" title="${esc(t.name)} — انقر لمعاينته وتسميته"><canvas width="64" height="64" data-ref="s:${esc(s.id)}:${t.n}"></canvas><small>${esc(t.name)}</small></button>`)
        .join('')}${s.tips.length > 120 ? `<span class="br-more">و${ar(s.tips.length - 120)} غيرها</span>` : ''}</div>
      <div class="br-tipbar" hidden><span>الشكل المحدَّد</span><input type="text" class="br-tn" maxlength="80" dir="auto" aria-label="اسم الشكل"><button type="button" class="btn small" data-act="tipname">احفظ الاسم</button><button type="button" class="btn small danger" data-act="tipdel">احذف الشكل</button></div>
    </div>`,
    )
    .join('');
  for (const c of box.querySelectorAll('canvas[data-ref]')) (c.classList.contains('br-prev') ? preview(c, c.dataset.ref, '#2A1D14', { size: 26 }) : tipThumb(c, c.dataset.ref, '#2A1D14')).catch(() => {});
}
$('#brushSets').addEventListener('click', async (e) => {
  const card = e.target.closest('.br-set');
  if (!card) return;
  const id = card.dataset.id;
  const s = sets.find((x) => x.id === id);
  const tip = e.target.closest('.br-tip');
  try {
    if (tip && e.shiftKey) {
      if (!confirm('حذف هذا الشكل من المجموعة؟')) return;
      await api('/api/admin/brushes/' + id, { method: 'PATCH', body: { remove: [+tip.dataset.n] } });
      await brushSets(true);
      return load();
    }
    if (tip) {
      const c = card.querySelector('.br-prev');
      c.dataset.ref = `s:${id}:${tip.dataset.n}`;
      for (const x of card.querySelectorAll('.br-tip')) x.classList.toggle('on', x === tip);
      // شريط الشكل المحدَّد: اسمه، وحذفه
      const bar = card.querySelector('.br-tipbar');
      const t = s.tips.find((x) => String(x.n) === tip.dataset.n);
      bar.hidden = false;
      bar.dataset.n = tip.dataset.n;
      const inp = bar.querySelector('.br-tn');
      inp.value = t ? t.name : '';
      return preview(c, c.dataset.ref, '#2A1D14', { size: 26 });
    }
    if (e.target.closest('.br-name b')) return startRename(card);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'rename') return startRename(card);
    if (b.dataset.act === 'tipname') return saveTipName(card);
    if (b.dataset.act === 'tipdel') {
      const n = +card.querySelector('.br-tipbar').dataset.n;
      const t = s.tips.find((x) => x.n === n);
      if (!confirm(`حذف الشكل «${t ? t.name : ''}» من المجموعة؟`)) return;
      await api('/api/admin/brushes/' + id, { method: 'PATCH', body: { remove: [n] } });
      await brushSets(true);
      return load();
    }
    if (b.dataset.act === 'del') {
      if (!confirm(`حذف «${s.name}» وأشكالها؟ (الأقلام التي تستعملها في الرَّحل تعود إلى الشكل المستدير)`)) return;
      await api('/api/admin/brushes/' + id, { method: 'DELETE' });
      await brushSets(true);
      return load();
    }
  } catch (err) {
    alert(err.message);
  }
});

/* ---------------- التسمية في مكانها (Electron لا يعرف prompt، والكتابة في الموضع أيسر) */
function startRename(card) {
  const b = card.querySelector('.br-name b');
  const inp = card.querySelector('.br-rn');
  b.hidden = true;
  inp.hidden = false;
  inp.focus();
  inp.select();
}
async function saveSetName(card, keep = true) {
  const inp = card.querySelector('.br-rn');
  if (inp.hidden) return;
  const s = sets.find((x) => x.id === card.dataset.id);
  const v = inp.value.trim();
  inp.hidden = true;
  card.querySelector('.br-name b').hidden = false;
  if (!keep || !v || !s || v === s.name) return;
  try {
    await api('/api/admin/brushes/' + s.id, { method: 'PATCH', body: { name: v } });
    toast('سُمّيت المجموعة «' + v + '»');
    await brushSets(true);
    load();
  } catch (e) {
    alert(e.message);
  }
}
async function saveTipName(card) {
  const bar = card.querySelector('.br-tipbar');
  const v = bar.querySelector('.br-tn').value.trim();
  const s = sets.find((x) => x.id === card.dataset.id);
  if (!v || !s) return;
  try {
    await api('/api/admin/brushes/' + s.id, { method: 'PATCH', body: { tipNames: { [bar.dataset.n]: v } } });
    toast('سُمّي الشكل «' + v + '»');
    await brushSets(true);
    await load();
    const c2 = document.querySelector(`.br-set[data-id="${CSS.escape(s.id)}"] .br-tip[data-n="${bar.dataset.n}"]`);
    if (c2) c2.click();
  } catch (e) {
    alert(e.message);
  }
}
$('#brushSets').addEventListener('keydown', (e) => {
  const card = e.target.closest('.br-set');
  if (!card) return;
  if (e.target.matches('.br-rn')) {
    if (e.key === 'Enter') (e.preventDefault(), saveSetName(card));
    if (e.key === 'Escape') (e.preventDefault(), saveSetName(card, false));
  }
  if (e.target.matches('.br-tn') && e.key === 'Enter') (e.preventDefault(), saveTipName(card));
});
$('#brushSets').addEventListener('focusout', (e) => {
  const card = e.target.closest('.br-set');
  if (card && e.target.matches('.br-rn')) saveSetName(card);
});

/* ---------------- الإفلات والاختيار */
const drop = $('#brushDrop');
const input = $('#brushFile');
input.setAttribute('accept', ACCEPT);
drop.addEventListener('click', () => input.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), input.click()));
input.addEventListener('change', () => {
  const files = [...input.files];
  input.value = '';
  if (files.length) addFiles(files);
});
for (const t of ['dragenter', 'dragover'])
  drop.addEventListener(t, (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.add('over');
  });
for (const t of ['dragleave', 'drop']) drop.addEventListener(t, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]);
});
document.querySelector('button[data-tab="fonts"]')?.addEventListener('click', () => load());
if (!$('#tab-fonts').hidden) load();
window.WarraqBrushes = { load, addFiles };
