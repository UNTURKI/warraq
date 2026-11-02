// تنزيل الخطوط العربية المفتوحة (رخصة OFL) إلى public/fonts ليستعملها محرك PDF محلياً دون إنترنت
// الاستعمال: npm run fonts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');
const RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl/';

// [المسار في مستودع Google Fonts، اسم الملف المحلي (أو أسماء لنفس الملف المتغير)]
const FILES = [
  ['amiri/Amiri-Regular.ttf', ['Amiri-Regular.ttf']],
  ['amiri/Amiri-Bold.ttf', ['Amiri-Bold.ttf']],
  ['scheherazadenew/ScheherazadeNew-Regular.ttf', ['ScheherazadeNew-Regular.ttf']],
  ['scheherazadenew/ScheherazadeNew-Bold.ttf', ['ScheherazadeNew-Bold.ttf']],
  ['lateef/Lateef-Regular.ttf', ['Lateef-Regular.ttf']],
  ['lateef/Lateef-Bold.ttf', ['Lateef-Bold.ttf']],
  ['arefruqaa/ArefRuqaa-Regular.ttf', ['ArefRuqaa-Regular.ttf']],
  ['arefruqaa/ArefRuqaa-Bold.ttf', ['ArefRuqaa-Bold.ttf']],
  ['notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf', ['NotoNaskhArabic-Regular.ttf', 'NotoNaskhArabic-Bold.ttf']],
  ['markazitext/MarkaziText%5Bwght%5D.ttf', ['MarkaziText-Regular.ttf', 'MarkaziText-Bold.ttf']],
  ['reemkufi/ReemKufi%5Bwght%5D.ttf', ['ReemKufi-Regular.ttf', 'ReemKufi-Bold.ttf']],
  ['elmessiri/ElMessiri%5Bwght%5D.ttf', ['ElMessiri-Regular.ttf', 'ElMessiri-Bold.ttf']],
];

fs.mkdirSync(DIR, { recursive: true });
let ok = 0;
for (const [src, names] of FILES) {
  if (names.every((n) => fs.existsSync(path.join(DIR, n)))) {
    ok++;
    continue;
  }
  try {
    const r = await fetch(RAW + src);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    for (const n of names) fs.writeFileSync(path.join(DIR, n), buf);
    console.log('✓', names.join(', '));
    ok++;
  } catch (e) {
    console.warn('✗', src, e.message);
  }
}
console.log(`تم: ${ok}/${FILES.length}. الخطوط غير المنزّلة تُحمَّل من Google Fonts وقت التنضيد.`);
