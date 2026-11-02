// حفظ القارئ في متصفح المستخدم (IndexedDB): ملاحظات كل كتاب وعلاماته وموضع القراءة، وكتب «الرَّحل».
// لا يغادر شيءٌ منها الجهاز. وإن تعذّرت قاعدة المتصفح (تصفّح خاص…) بقيت في الذاكرة ما دامت الصفحة مفتوحة.

const DB = 'warraq-reader';
const mem = { notes: new Map(), shelf: new Map() };
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes');
        if (!d.objectStoreNames.contains('shelf')) d.createObjectStore('shelf');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch {
      res(null);
    }
  });
  return dbP;
}
function run(store, mode, fn) {
  return db().then(
    (d) =>
      new Promise((res) => {
        if (!d) return res(fn(null));
        try {
          const tx = d.transaction(store, mode);
          const st = tx.objectStore(store);
          let out;
          const r = fn(st);
          if (r && 'onsuccess' in r) r.onsuccess = () => (out = r.result);
          tx.oncomplete = () => res(out);
          tx.onerror = tx.onabort = () => res(undefined);
        } catch {
          res(undefined);
        }
      }),
  );
}

export async function getItem(store, key) {
  const v = await run(store, 'readonly', (st) => (st ? st.get(key) : null));
  return v === undefined || v === null ? mem[store].get(key) ?? null : v;
}
export async function setItem(store, key, value) {
  mem[store].set(key, value);
  await run(store, 'readwrite', (st) => st && st.put(value, key));
}
export async function delItem(store, key) {
  mem[store].delete(key);
  await run(store, 'readwrite', (st) => st && st.delete(key));
}
export async function allItems(store) {
  const d = await db();
  if (!d) return [...mem[store].entries()].map(([key, value]) => ({ key, value }));
  return new Promise((res) => {
    const out = [];
    try {
      const rq = d.transaction(store, 'readonly').objectStore(store).openCursor();
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) return res(out);
        out.push({ key: c.key, value: c.value });
        c.continue();
      };
      rq.onerror = () => res(out);
    } catch {
      res(out);
    }
  });
}
