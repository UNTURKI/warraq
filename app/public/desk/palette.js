// القلم (Ctrl+K): خانة واحدة يُكتب فيها ما يريده المستخدم، كما في «ورّاق البرنامج».
// يبحث في: الأوامر والأبواب، وكتب الخزانة، والأساليب (يطبّقها على الكتاب المفتوح أو يفتحها في محررها)،
// والأغلفة (غلافاً خارجياً للكتاب المفتوح)، وفي «تراث» (Ctrl+Enter).
const shell = window.WarraqShell;
const desk = window.warraqDesktop || null;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase().trim();

const box = document.createElement('div');
box.className = 'pal';
box.hidden = true;
box.innerHTML = `<div class="pal-card" role="dialog" aria-label="القلم">
  <div class="pal-in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l3.5-1 11-11a1.8 1.8 0 0 0-2.5-2.5l-11 11z"/><path d="M14.5 6.5l3 3"/></svg><input type="text" id="palQ" placeholder="اكتب ما تريد: كتاباً، أو أسلوباً، أو غلافاً، أو أمراً…" autocomplete="off" spellcheck="false" aria-label="القلم"><span class="kbd">Esc</span></div>
  <div class="pal-list" id="palList" role="listbox"></div>
  <div class="pal-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> تنقّل</span><span><span class="kbd">Enter</span> نفّذ</span><span><span class="kbd">Ctrl+Enter</span> ابحث في «تراث»</span></div>
</div>`;
document.body.appendChild(box);
const q = $('#palQ', box);
const list = $('#palList', box);

let data = { styles: [], covers: [], books: [] };
let items = [];
let sel = 0;

const benchWin = () => shell.win('bench');
const DOORS = [
  ['khizana', 'الخزانة', 'Ctrl+1'],
  ['bench', 'المِنضدة', 'Ctrl+2'],
  ['muharrir', 'المحرِّر', 'Ctrl+3'],
  ['rahl', 'الرَّحل', 'Ctrl+4'],
  ['styles', 'الأساليب', 'Ctrl+5'],
  ['covers', 'المجلِّد', 'Ctrl+6'],
  ['tiraz', 'الطِّراز (المودات)', 'Ctrl+7'],
];
const COMMANDS = () => [
  { t: 'كتاب جديد', k: 'Ctrl+N', run: () => shell.newBook() },
  { t: 'افتح كتاباً أو مشروعاً…', k: 'Ctrl+O', run: () => desk && desk.openDialog('bench') },
  { t: 'ضع كتاباً على الرَّحل…', run: () => desk && desk.openDialog('rahl') },
  { t: 'أخرِج الكتاب الذي على المنضدة', k: 'Ctrl+E', run: () => benchWin().then((w) => w && w.WarraqBench && (shell.go('bench'), w.WarraqBench.exportBook())) },
  { t: 'احفظ الكتاب باسم (وَرَق)…', k: 'Ctrl+Shift+S', run: () => benchWin().then((w) => w && w.WarraqBench && w.WarraqBench.saveAs()) },
  { t: document.documentElement.classList.contains('night') ? 'أطفئ السِّراج' : 'أوقد السِّراج', k: 'Ctrl+L', run: () => $('.side [data-lamp]').click() },
  { t: 'الإعدادات', k: 'Ctrl+,', run: () => desk && desk.openWindow('settings') },
  { t: 'إعدادات الطباعة', run: () => shell.go('styles').then((w) => w && (w.location.hash = '#/print')) },
  { t: 'جولة البداية', run: () => shell.firstRun && shell.firstRun(true) },
  { t: 'أصلح البرنامج: أعده إلى حاله الطبيعي', h: 'إن علِق شيءٌ أو اضطربت الواجهة', k: 'Ctrl+Shift+R', run: () => desk && desk.repair && desk.repair() },
  ...DOORS.map(([d, t, k]) => ({ t: 'اذهب إلى ' + t, k, run: () => shell.go(d) })),
  { t: 'أوقف المودات كلها (الوضع الآمن)', k: 'Ctrl+Alt+Shift+M', run: () => desk && desk.mods && desk.mods.safe(true) },
  // أوامر المودات («الطِّراز»)
  ...(shell.commands ? shell.commands.list() : []),
];

async function loadData() {
  const [st, cv, bk] = await Promise.all([
    fetch('/api/styles', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/api/covers', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    desk ? desk.library().catch(() => []) : [],
  ]);
  data.styles = (st && st.styles) || [];
  const cl = cv && (cv.designs || cv.covers || cv.items || (Array.isArray(cv) ? cv : []));
  data.covers = (cl || []).filter((c) => (c.kind || 'front') === 'front').map((c) => ({ id: c.id, name: c.name || c.title || '' })).filter((c) => c.id && c.name);
  data.books = bk || [];
}

function build() {
  const s = q.value.trim();
  const n = norm(s);
  const hit = (t) => !n || norm(t).includes(n);
  const groups = [];
  const has = shell.benchInfo() && shell.benchInfo().title;
  const books = data.books.filter((b) => hit(b.title + ' ' + (b.author || ''))).slice(0, n ? 5 : 3);
  if (books.length) groups.push(['في خزانتك', books.map((b) => ({ t: `«${b.title}»`, h: b.author || '', run: () => shell.go('khizana').then((w) => w && w.WarraqKhizana && w.WarraqKhizana.open(b.id)) }))]);
  const styles = data.styles.filter((x) => hit(x.name)).slice(0, n ? 4 : 2);
  if (styles.length)
    groups.push([
      'الأساليب',
      styles.flatMap((x) => [
        ...(has ? [{ t: `طبّق أسلوب «${x.name}» على الكتاب المفتوح`, run: () => benchWin().then((w) => w && w.WarraqBench && (shell.go('bench'), w.WarraqBench.applyStyle(x.id))) }] : []),
        { t: `افتح «${x.name}» في محرر الأساليب`, run: () => shell.go('styles').then((w) => w && (w.location.hash = '#/edit/' + x.id)) },
      ]),
    ]);
  const covers = data.covers.filter((x) => hit(x.name)).slice(0, n ? 4 : 2);
  if (covers.length && has) groups.push(['الأغلفة', covers.map((x) => ({ t: `«${x.name}» غلافاً خارجياً`, run: () => benchWin().then((w) => w && w.WarraqBench && (shell.go('bench'), w.WarraqBench.applyCover(x.id, x.name))) }))]);
  const cmds = COMMANDS().filter((c) => hit(c.t)).slice(0, n ? 6 : 5);
  if (cmds.length) groups.push(['أوامر', cmds]);
  if (s.length > 1) groups.push(['في «تراث»', [{ t: `ابحث عن «${s}» في الكتب`, k: 'Ctrl+↵', turath: true, run: () => turath(s) }]]);
  items = [];
  list.innerHTML = groups
    .map(([g, arr]) => `<div class="pal-g">${esc(g)}</div>${arr.map((it) => { items.push(it); const i = items.length - 1; return `<div class="pal-it" role="option" data-i="${i}"><span class="pal-t">${esc(it.t)}</span>${it.h ? `<small>${esc(it.h)}</small>` : ''}${it.k ? `<span class="kbd">${esc(it.k)}</span>` : ''}</div>`; }).join('')}`)
    .join('') || `<p class="pal-none">لا شيء بهذا الاسم. اضغط Ctrl+Enter لتبحث عنه في «تراث».</p>`;
  sel = Math.min(sel, Math.max(items.length - 1, 0));
  paintSel();
}
function paintSel() {
  list.querySelectorAll('.pal-it').forEach((el) => el.setAttribute('aria-selected', String(+el.dataset.i === sel)));
  const cur = list.querySelector(`.pal-it[data-i="${sel}"]`);
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}
function turath(s) {
  close();
  shell.go('bench').then((w) => w && w.WarraqBench && w.WarraqBench.search(s));
}
function run(i) {
  const it = items[i];
  if (!it) return;
  close();
  try {
    it.run();
  } catch {}
}

let last = null;
async function open() {
  if (!box.hidden) return q.select();
  last = document.activeElement;
  box.hidden = false;
  q.value = '';
  sel = 0;
  build();
  q.focus();
  await loadData();
  if (!box.hidden) build();
}
function close() {
  box.hidden = true;
  if (last && last.focus) last.focus();
}
q.addEventListener('input', () => {
  sel = 0;
  build();
});
q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!items.length) return;
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    paintSel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) return q.value.trim().length > 1 && turath(q.value.trim());
    run(sel);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
});
list.addEventListener('mousemove', (e) => {
  const it = e.target.closest('.pal-it');
  if (it && +it.dataset.i !== sel) {
    sel = +it.dataset.i;
    paintSel();
  }
});
list.addEventListener('click', (e) => {
  const it = e.target.closest('.pal-it');
  if (it) run(+it.dataset.i);
});
box.addEventListener('mousedown', (e) => e.target === box && close());
// خارج البرنامج (التجربة في متصفح): Ctrl+K في الهيكل نفسه
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    open();
  }
});

shell.palette = { open, close };
