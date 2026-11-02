// اختبارات «البحث العلمي»: فهم البنية (researchify)، وأن نص الباحث لا يُغيَّر إلا بقراره
import { researchify, sectionOf, unitOf } from '../shared/research.js';
import { composeVolume } from '../shared/compose.js';
import { PRESETS, STYLE_DEFAULTS, researchSettings } from '../shared/presets.js';
import { cleanSettings } from '../lib/styles.js';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); };
const P = (s, o = {}) => ({ type: 'para', runs: [{ k: 't', s }], ...o });
const C = (s) => P(s, { al: 'c' });
const vol = (blocks) => ({ blocks, notes: {}, layout: 'plain', stats: {} });
const text = (b) => (b.type === 'heading' ? b.text : (b.runs || []).map((r) => r.s || '').join(''));
const find = (out, s) => out.blocks.find((b) => text(b).includes(s));

// ١) صفحة العنوان بوجودها وغيابها
const TITLE = [C('جامعة الإمام محمد بن سعود الإسلامية'), C('كلية الشريعة'), C('أحكام المسح على الخفين'), C('بحث مقدم لنيل درجة الماجستير'), C('إعداد الطالب: محمد بن عبد الله'), C('إشراف: د. أحمد بن صالح'), C('العام الجامعي ١٤٤٧هـ')];
let r = researchify(vol([...TITLE, P('المقدمة'), P('الحمد لله رب العالمين، أما بعد: فهذا بحث في المسح.')]));
ok('صفحة العنوان تصير صفحة عنوانٍ رسمية', r.blocks[0].type === 'pagefig' && r.blocks[0].rtp === true && r.ownCover === true && r.stats.research.titlePage === true);
ok('وأسطرها كلها فيها بترتيبها', r.blocks[0].parts.map((p) => p.t).join('|') === TITLE.map(text).join('|'));
ok('والمقدمة بعدها قسمٌ في المستوى الأول', r.blocks[1].type === 'heading' && r.blocks[1].level === 1 && r.blocks[1].rs === 'intro');
r = researchify(vol([P('المقدمة'), P('الحمد لله رب العالمين، أما بعد: فهذا بحث في المسح.')]));
ok('بلا صفحة عنوان: لا صفحة ولا غلاف من الملف', r.blocks[0].type === 'heading' && !r.ownCover && r.stats.research.titlePage === false);
r = researchify(vol([C('سطرٌ في الوسط'), C('وسطرٌ آخر'), C('وثالث بلا جهة ولا باحث'), P('المقدمة')]));
ok('أسطرٌ في الوسط بلا جهةٍ ولا باحث ليست صفحة عنوان', r.blocks[0].type !== 'pagefig');

// ٢) مستويات المباحث والمطالب بلا باب ولا فصل، ومعهما
r = researchify(vol([P('المقدمة'), P('نص.'), P('المبحث الأول: تعريف المسح'), P('نص المبحث.'), P('المطلب الأول: التعريف اللغوي'), P('نص المطلب.'), P('المطلب الثاني: التعريف الاصطلاحي'), P('الخاتمة')]));
const lv = (s) => (find(r, s) || {}).level;
ok('بلا باب ولا فصل: المبحث ثانٍ والمطلب ثالث', lv('المبحث الأول') === 2 && lv('المطلب الأول') === 3 && lv('المطلب الثاني') === 3 && lv('الخاتمة') === 1, [lv('المبحث الأول'), lv('المطلب الأول'), lv('الخاتمة')].join(','));
r = researchify(vol([P('المقدمة'), P('الباب الأول: الطهارة'), P('الفصل الأول: المياه'), P('المبحث الأول: الماء الطهور'), P('المطلب الأول: تعريفه'), P('نص.')]));
ok('مع الباب والفصل: ١ ثم ٢ ثم ٣ ثم ٤', lv('الباب الأول') === 1 && lv('الفصل الأول') === 2 && lv('المبحث الأول') === 3 && lv('المطلب الأول') === 4, [lv('الباب الأول'), lv('الفصل الأول'), lv('المبحث الأول'), lv('المطلب الأول')].join(','));
ok('عدّ الوحدات', r.stats.research.units['باب'] === 1 && r.stats.research.units['مبحث'] === 1);
ok('فقرة طويلة تنتهي بنقطة ليست عنواناً ولو بدأت بـ«المبحث الأول»', unitOf('المبحث الأول') === 'مبحث' && researchify(vol([P('المبحث الأول في هذا البحث يتناول التعريفات كلها مفصلةً ومشروحةً ومدللاً لها بالأدلة.')])).blocks[0].type === 'para');

// ٣) الأقسام الناقصة سابقاً
ok('«التوصيات» وحدها قسم', sectionOf('التوصيات') === 'recs' && sectionOf('أهم التوصيات') === 'recs');
ok('«الهوامش» قسم', sectionOf('الهوامش') === 'endnotes');
ok('«قائمة المصادر» و«قائمة المصادر والمراجع» قسم المصادر', sectionOf('قائمة المصادر') === 'refs' && sectionOf('قائمة المصادر والمراجع') === 'refs' && sectionOf('المراجع') === 'refs');
ok('«النتائج والتوصيات» كما كانت', sectionOf('النتائج والتوصيات') === 'results');

// ٤) المراجع ومجموعاتها
r = researchify(vol([P('المصادر والمراجع'), P('أولاً: الكتب'), P('ابن قدامة، عبد الله بن أحمد، المغني، ط٣ (الرياض: دار عالم الكتب، ١٤١٧هـ).'), P('ثانياً الرسائل العلمية'), P('العتيبي، المسح على الخفين، رسالة ماجستير، جامعة الإمام، ١٤٣٠هـ.'), P('ثالثاً: المجلات:'), P('مجلة البحوث الإسلامية، العدد ٤٠.')]));
const role = (s) => (find(r, s) || {}).role;
ok('«أولاً: الكتب» عنوان مجموعة (بالترتيب العربي)', role('أولاً: الكتب') === 'refh');
ok('«ثانياً الرسائل العلمية» بلا «:» عنوان مجموعة', role('ثانياً الرسائل') === 'refh');
ok('«ثالثاً: المجلات:» عنوان مجموعة', role('ثالثاً: المجلات') === 'refh');
ok('المراجع نفسها مراجع', role('ابن قدامة') === 'ref' && role('العتيبي') === 'ref' && role('مجلة البحوث') === 'ref' && r.stats.research.refs === 3);
r = researchify(vol([P('المصادر والمراجع'), P('أولاً، كتاب في الطهارة طويل العنوان جداً بحيث يتجاوز سبعين حرفاً من غير شك ولا ريب فيه أبداً.')]));
ok('سطرٌ يبدأ بالترتيب ويتجاوز ٧٠ حرفاً مرجعٌ لا عنوان', r.blocks[1].role === 'ref');

// ٥) النص الإنجليزي والكلمات المفتاحية
r = researchify(vol([P('ملخص البحث'), P('يتناول هذا البحث مسألة المسح.'), P('الكلمات المفتاحية: الطهارة، المسح، الفقه.'), P('Abstract'), P('This research examines a juristic question in purification and its evidence.'), P('Keywords: purification, wiping.')]));
ok('الملخص', role('يتناول هذا البحث') === 'abs');
ok('الكلمات المفتاحية بـ«:» (وعنوانها عريض)', role('الكلمات المفتاحية') === 'abs kw' && find(r, 'الكلمات المفتاحية').runs[0].b === 1);
ok('النص الإنجليزي من اليسار', /\ben\b/.test(role('This research')) && /\babs\b/.test(role('This research')));
ok('Keywords الإنجليزية', /kw/.test(role('Keywords:')) && /en/.test(role('Keywords:')));
r = researchify(vol([P('ملخص البحث'), P('يتناول هذا البحث مسألة المسح.'), P('الكلمات المفتاحية'), P('الطهارة، المسح، الفقه المقارن'), P('المقدمة'), P('الحمد لله.')]));
ok('«الكلمات المفتاحية» وحدها وكلماتها في السطر التالي', role('الكلمات المفتاحية') === 'abs kw' && role('الطهارة، المسح') === 'abs kw' && r.stats.research.keywords === 1);
r = researchify(vol([P('الكلمات المفتاحية:'), P('الطهارة - المسح - الخفان')]));
ok('وبـ«:» في آخر سطرها وكلماتها بشرطات', r.blocks[0].role === 'kw' && r.blocks[1].role === 'kw');
r = researchify(vol([P('الكلمات المفتاحية'), P('هذه فقرةٌ عادية طويلة لا فواصل فيها تتحدث عن موضوعٍ آخر تماماً وتنتهي بنقطة.')]));
ok('ولا يُعدّ ما بعدها كلماتٍ مفتاحية إن لم يكن سطر كلمات', r.blocks[1].role !== 'kw');

// ٦) الحتمية: الناتج نفسه في كل مرة
const V = vol([...TITLE, P('المقدمة'), P('المبحث الأول: كذا'), P('نص.')]);
ok('researchify حتمي', JSON.stringify(researchify(V)) === JSON.stringify(researchify(V)));

// ٧) لا يُغيَّر نص الباحث في البحث، والكتاب كما كان
ok('في البحث: typoRules و nabawiBold مطفآن', PRESETS['r-academic'].typoRules === false && PRESETS['r-academic'].nabawiBold === false && researchSettings('uni').typoRules === false && researchSettings('thesis').nabawiBold === false);
ok('وفي الكتاب: مفعّلان كما كانا', STYLE_DEFAULTS.typoRules === true && STYLE_DEFAULTS.nabawiBold === true && PRESETS.mothhab.nabawiBold === true);
ok('cleanSettings: الغائب منهما مطفأ في البحث، ومفعّل في الكتاب', cleanSettings({ template: 'research' }).typoRules === false && cleanSettings({ kind: 'research' }).nabawiBold === false && cleanSettings({}).typoRules === true && cleanSettings({}).nabawiBold === true);
ok('ويُفعَّلان في البحث بقرارٍ صريح', cleanSettings({ template: 'research', typoRules: true, nabawiBold: true }).typoRules === true);
ok('نظام العناوين: التقسيم العلمي في الكتاب، وعناوين القالب في البحث', cleanSettings({}).headScheme === 'pro' && cleanSettings({ template: 'research' }).headScheme === 'style' && STYLE_DEFAULTS.headScheme === 'pro' && PRESETS['r-academic'].headScheme === 'style');

const RAW = 'قال رسول الله ﷺ: إنما الأعمال بالنيات. وقال الباحث  ( كذا ) ، و الكتاب.';
const runsOf = (doc) => doc.blocks.filter((b) => b.type === 'para').flatMap((b) => b.runs);
const plain = (doc) => runsOf(doc).map((r) => r.s || '').join('');
const rdoc = composeVolume(vol([P('المقدمة'), P(RAW)]), researchSettings('uni'));
ok('البحث: النص كما كتبه الباحث حرفاً بحرف', plain(rdoc) === RAW, plain(rdoc));
ok('البحث: لا عريض في قول النبي ﷺ', !runsOf(rdoc).some((r) => r.st && r.st.bold));
const cdoc = composeVolume(vol([P('المقدمة'), P(RAW)]), { ...researchSettings('uni'), spaceCollapse: true });
ok('البحث + توحيد المسافات: المزدوجة وحدها', plain(cdoc) === RAW.replace(/ {2,}/g, ' '), plain(cdoc));
const tdoc = composeVolume(vol([P('المقدمة'), P(RAW)]), { ...researchSettings('uni'), typoRules: true, nabawiBold: true });
ok('البحث + تصحيح المسافات صراحةً: يُصحَّح', plain(tdoc).includes('(كذا)، والكتاب') && runsOf(tdoc).some((r) => r.st && r.st.bold));
const bdoc = composeVolume(vol([P(RAW)]), { ...JSON.parse(JSON.stringify(STYLE_DEFAULTS)), template: 'full' });
ok('الكتاب: المسافات تُصحَّح دائماً (ولو كان typoRules مطفأً)', plain(bdoc).includes('(كذا)، والكتاب') && plain(composeVolume(vol([P(RAW)]), { ...JSON.parse(JSON.stringify(STYLE_DEFAULTS)), template: 'full', typoRules: false })).includes('(كذا)، والكتاب'));
ok('الكتاب: قول النبي ﷺ عريض', runsOf(bdoc).some((r) => r.st && r.st.bold && r.s.includes('إنما الأعمال')));

console.log(`\n${pass} نجح، ${fail} أخفق`);
process.exit(fail ? 1 : 0);
