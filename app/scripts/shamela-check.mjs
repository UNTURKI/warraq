// فحص مصدر «الشاملة» على مكتبة حقيقية (للقراءة فقط):
//   node app/scripts/shamela-check.mjs "G:\shamela4\database" [رقم كتاب ...] [--all]
// لكل كتاب: عدد صفحاته في ملفه، وكم منها بلا نص، وعدد الحروف، وعدد العناوين.
// و--all يمر على كل كتب المكتبة (يأخذ دقائق) ويعدّ الصفحات الفارغة وأي مقطع لا يُقرأ.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeShamela, resolveRoot } from '../lib/shamela/source.js';
import { ShamelaPages } from '../lib/shamela/lucene.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || 'G:\\shamela4\\database';
const ids = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!ids.length) ids.push(11257);
const log = [];
const say = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };

const src = makeShamela({ dir });
let t = Date.now();
const ping = await src.ping();
say('books in master.db:', ping.books, ' with text:', ping.withText, ' opened in', Date.now() - t, 'ms', ping.errors.length ? ' ERRORS: ' + ping.errors.join(' | ') : '');

for (const id of ids) {
  t = Date.now();
  try {
    const b = await src.getBook(id);
    const pages = await src.getPages(id, 1, b.totalPages);
    const empty = pages.filter((p) => !p.text.trim());
    const chars = pages.reduce((a, p) => a + p.text.length, 0);
    say('');
    say(`book ${id} «${b.name}»: pages ${b.totalPages}, empty ${empty.length}, characters ${chars}, headings ${b.book.indexes.headings.length}, volumes ${b.volumes.length}  (${Date.now() - t} ms)`);
    if (empty.length) say('  empty pages (index:printed):', empty.slice(0, 30).map((p) => p.page_id + ':' + (p.meta.page ?? '')).join(' '));
    for (const h of b.book.indexes.headings.slice(0, 8)) say('  heading', '  '.repeat(h.level - 1) + h.title, '→ page', h.page);
    const show = pages.find((p) => p.meta.page === 41) || pages[Math.min(40, pages.length - 1)];
    if (show) say('  page', show.page_id, '(printed ' + show.meta.page + '):', show.text.replace(/\s+/g, ' ').slice(0, 300));
  } catch (e) {
    say('book', id, 'FAILED:', e.message);
  }
}

if (args.includes('--all')) {
  say('');
  t = Date.now();
  const lib = new ShamelaPages(path.join(resolveRoot(dir) || dir, 'store', 'page'), { onSegmentError: (n, e) => say('segment', n, 'FAILED:', e.message) });
  let pages = 0, empty = 0, badChunks = 0;
  for (const seg of lib.segments) {
    for (let c = 0; c < seg.index.chunks; c++) {
      try {
        for (const doc of seg.readChunk(c).docs) {
          pages++;
          if (!doc.some(([n, v]) => (n === 'body' || n === 'foot') && String(v).trim())) empty++;
        }
      } catch (e) {
        badChunks++;
        if (badChunks <= 10) say('  segment', seg.info.name, 'chunk', c, 'FAILED:', e.message);
      }
      seg.cache.clear();
    }
  }
  say(`all pages: ${pages}, without text: ${empty}, unreadable chunks: ${badChunks}  (${Math.round((Date.now() - t) / 1000)} s)`);
}

const out = path.join(os.homedir(), 'Documents', 'shamela-check.txt');
try {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, log.join('\n'), 'utf8');
  console.log('\nReport saved to', out);
} catch {}
