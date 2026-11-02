// اسم لوحة المالك (الدار): يضبطه المالك من «الحساب». الأصل «دار ابن فقيه»، وهو المكتوب في الصفحات؛
// فإن غيّره استُبدل به هنا في العنوان والنصوص، ما كان منها وما يُكتب لاحقاً.
(function () {
  const DEF = 'دار ابن فقيه';
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  let name = DEF;
  let watching = false;
  const seen = new WeakMap();   // العقدة ← { src: نصها الأصلي، out: ما كُتب فيها }
  const aseen = new WeakMap();  // العنصر ← { الخاصية: { src, out } }
  let titleRec = null;

  /** يردّ النص بعد الاستبدال، حافظاً أصله ليُعاد استبداله إن تغيّر الاسم ثانية */
  function render(cur, rec) {
    const src = rec && cur === rec.out ? rec.src : cur;
    if (!src || !src.includes(DEF)) return null;
    // اسم جديد يحوي الاسم الأصلي ومكتوب أصلاً في النص: لا يُستبدل ثانية
    if (name !== DEF && name.includes(DEF) && src.includes(name)) return null;
    return { src, out: src.split(DEF).join(name) };
  }
  function walk(node) {
    if (node.nodeType === 3) {
      const r = render(node.nodeValue, seen.get(node));
      if (!r) return;
      seen.set(node, r);
      if (node.nodeValue !== r.out) node.nodeValue = r.out;
      return;
    }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(node.tagName)) return;
    for (const a of ATTRS) {
      if (!node.hasAttribute(a)) continue;
      const m = aseen.get(node) || {};
      const r = render(node.getAttribute(a), m[a]);
      if (!r) continue;
      m[a] = r; aseen.set(node, m);
      if (node.getAttribute(a) !== r.out) node.setAttribute(a, r.out);
    }
    for (const c of node.childNodes) walk(c);
  }
  function title() {
    const r = render(document.title, titleRec);
    if (!r) return;
    titleRec = r;
    if (document.title !== r.out) document.title = r.out;
  }
  function apply() {
    title();
    if (document.body) walk(document.body);
    if (watching || name === DEF) return;
    watching = true;
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === 'characterData') walk(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
      title();
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
  window.WarraqPanel = {
    get name() { return name; },
    set(n) { name = String(n || DEF).trim() || DEF; apply(); },
  };
  fetch('/api/admin/status', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((st) => { if (st && st.panel && st.panel !== DEF) window.WarraqPanel.set(st.panel); })
    .catch(() => {});
})();
