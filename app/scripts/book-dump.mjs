// نص كتاب كما يصل إلى المحلّل من «تراث» ومن «الشاملة»، في ملف واحد لدراسة بنيته (للقراءة فقط):
//   node app/scripts/book-dump.mjs "G:\shamela4\database" 11257 [رقم آخر ...]
// يكتب في المستندات: book-dump-<الأرقام>.json  — { "<رقم>": { turath: [صفحات], shamela: [صفحات] } }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeShamela } from '../lib/shamela/source.js';
import { decodeBookFile } from '../lib/turath.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !/^\d+$/.test(a));
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!ids.length) ids.push(11257);
const out = {};

for (const id of ids) {
  out[id] = {};
  // «تراث»: ملف الكتاب الكامل
  try {
    const res = await fetch(`https://files.turath.io/books-v3/${id}.json`, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = decodeBookFile(await res.json());
    out[id].turath = (j.pages || []).map((p, i) => ({ i: i + 1, vol: p.vol ?? null, page: p.page ?? null, text: p.text || '' }));
    out[id].turathMeta = j.meta || null;
    out[id].turathHeadings = (j.indexes && j.indexes.headings) || null;
    console.log(id, 'turath pages:', out[id].turath.length);
  } catch (e) {
    out[id].turathError = e.message;
    console.log(id, 'turath failed:', e.message);
  }
  // «الشاملة»: الصفحات كما يعطيها مصدرها للبرنامج
  if (dir) {
    try {
      const s = makeShamela({ dir });
      const b = await s.getBook(id);
      const pages = await s.getPages(id, 1, b.totalPages);
      out[id].shamela = pages.map((p) => ({ i: p.page_id, vol: p.meta.vol, page: p.meta.page, text: p.text }));
      out[id].shamelaHeadings = b.book.indexes.headings;
      console.log(id, 'shamela pages:', out[id].shamela.length);
    } catch (e) {
      out[id].shamelaError = e.message;
      console.log(id, 'shamela failed:', e.message);
    }
  }
}

const file = path.join(os.homedir(), 'Documents', `book-dump-${ids.join('-')}.json`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
console.log('saved', file);
