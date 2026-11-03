// اختبارات عدّ الصفحات: الصفحة المطبوعة المقطوعة مدخلاتٍ تُعدّ صفحةً واحدة، والجلب يبقى بالمدخلات
// node app/test/pages-tests.mjs
import { countPrinted, entryOfPrinted, volumesFrom } from '../shared/split.js';
import { groupVolumes } from '../lib/turath.js';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => {
  c ? pass++ : fail++;
  console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`);
};

const map = ['1,1', '1,1', '1,1', '1,2', '1,2', '1,3', '2,1', '2,1', '2,2'];
ok('المتتالية بالرقم نفسه صفحة واحدة', countPrinted(map, 1, 9) === 5);
ok('العدّ داخل نطاق', countPrinted(map, 4, 7) === 3);
ok('الأرقام العربية كاللاتينية', countPrinted(['١,١', '1,1', '١,٢'], 1, 3) === 2);
ok('بلا ترقيم: عدد المدخلات', countPrinted(undefined, 3, 10) === 8);
ok('ترقيم أقصر من النطاق: عدد المدخلات', countPrinted(['1,1'], 1, 4) === 4);
ok('مدخلات بلا رقم تبقى صفحات', countPrinted([null, null, '', '1,1'], 1, 4) === 4);
ok('رقم عاد بعد غيره لا يُدمج', countPrinted(['1', '2', '1'], 1, 3) === 3);

ok('الصفحة ← أول مدخل لها', entryOfPrinted(map, 2) === 4 && entryOfPrinted(map, 4) === 7 && entryOfPrinted(map, 1) === 1);
ok('بعد آخر صفحة: آخر مدخل', entryOfPrinted(map, 99) === 9);
ok('بلا ترقيم: الرقم نفسه', entryOfPrinted(undefined, 42) === 42);

const single = groupVolumes(null, map, map.length);
ok('مجلد واحد: الحدود مدخلات والعدد صفحات', single[0].start === 1 && single[0].end === 9 && single[0].pages === 5);
const two = groupVolumes({ 1: [1, 6], 2: [7, 9] }, map, map.length);
ok('مجلدان: لكلٍّ صفحاته', two.length === 2 && two[0].pages === 3 && two[1].pages === 2 && two[1].start === 7 && two[1].end === 9);

const cut = volumesFrom({ totalPages: 9, pageMap: map }, [1, 7], { cutAtHeads: false });
ok('التقسيم: الحدود مدخلات والعدد صفحات', cut[0].end === 6 && cut[0].pages === 3 && cut[1].pages === 2);

// «مجموع رسائل ابن رجب»: مقدمة كل مجلد منه، والمجلدان الأول والثاني متصلا الترقيم
const rajabMap = ['مقدمة جـ 1,1', 'مقدمة جـ 1,2', '1,1', '1,2', '1,3', '2,4', '2,5', 'مقدمة جـ 3,1', '3,1', '3,2'];
const rajab = groupVolumes({ 'مقدمة جـ 1': [1, 2], 1: [3, 5], 2: [6, 7], 'مقدمة جـ 3': [8, 8], 3: [9, 10] }, rajabMap, rajabMap.length);
ok('المقدمة في مجلدها، والمجلدان رقماهما مختلفان منفصلان', rajab.map((v) => v.vol).join() === '1,2,3' && rajab[0].pages === 5 && rajab[1].pages === 2 && rajab[2].pages === 3);
// قسمٌ باسمٍ يكمل ترقيم ما قبله: يبقى مجلداً واحداً معه
const sec = groupVolumes({ 'الباب الأول': [1, 2], 'الباب الثاني': [3, 4] }, ['الباب الأول,10', 'الباب الأول,11', 'الباب الثاني,12', 'الباب الثاني,13'], 4);
ok('الأقسام متصلة الترقيم مجلدٌ واحد', sec.length === 1 && sec[0].pages === 4);

console.log(`\n${pass} نجح، ${fail} أخفق`);
process.exit(fail ? 1 : 0);
