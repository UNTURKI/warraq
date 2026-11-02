// توحيد بيانات الغلاف ونوع الكتاب: الذكاء الاصطناعي إن توفر، وإلا (أو لما نقص منه) الخوارزمية الثابتة
import { parseCover } from '../shared/parser.js';
import { normalizeArabic } from '../shared/arabic.js';
import { aiExtract } from './ai.js';
import { catalogBook } from './catalog.js';

const TITLES = ['شيخ الإسلام', 'حجة الإسلام', 'الإمام', 'الحافظ', 'العلامة', 'المحدث', 'الفقيه', 'القاضي', 'الشيخ'];

// كتب التفسير المشهورة بأسمائها (لا تذكر «تفسير» في عنوانها)
const TAFSIR_NAMES = /^(جامع البيان|الجامع لاحكام القران|احكام القران|معالم التنزيل|الكشاف|مفاتيح الغيب|انوار التنزيل|مدارك التنزيل|لباب التاويل|البحر المحيط|المحرر الوجيز|زاد المسير|الدر المنثور|فتح القدير|روح المعاني|التحرير والتنوير|اضواء البيان|في ظلال القران|تيسير الكريم الرحمن|النكت والعيون|معاني القران|اعراب القران|الكشف والبيان|ارشاد العقل السليم|محاسن التاويل|فتح البيان في مقاصد القران|التسهيل لعلوم التنزيل|الوسيط في تفسير|البيان في تفسير|ايسر التفاسير|صفوه التفاسير|المنتخب في تفسير|زهره التفاسير|التفسير المنير|التفسير الوسيط|التفسير الميسر)( |$)/;

/** نوع الكتاب من عنوانه (خوارزمية ثابتة)، ومن تصنيفه في فهرس المصدر إن عُرف */
export function algoBookType(title, cat = '') {
  const n = normalizeArabic(title);
  const hashiya = /(^| )(حاشيه|حواشي|الحاشيه)( |$)/.test(n);
  // تفسير القرآن: «تفسير…» في العنوان، أو اسم تفسير مشهور، أو تصنيف «التفسير» (لا علوم القرآن ولا أصول التفسير)
  const tafsir =
    !/(^| )(اصول|مقدمه في اصول|قواعد|مناهج|منهج|طبقات|التفسير والمفسرون)( |$)/.test(n) &&
    (/(^| )(تفسير|التفسير|تفاسير|التفاسير)( |$)/.test(n) || TAFSIR_NAMES.test(n) || /(^| )التفسير( |$)/.test(normalizeArabic(cat)));
  const sharh = /(^| )(شرح|بشرح|الشرح|تعليق|التعليق|تعليقات)( |$)/.test(n) || /^(فتح|تيسير|اعانه|منحه|تحفه|كشف|اضاءه)/.test(n) && /(على|ب)/.test(n);
  if (tafsir && !hashiya && !/(^| )(شرح|بشرح)( |$)/.test(n)) return 'tafsir';
  if (hashiya && sharh) return 'sharh_and_hashiya';
  if (hashiya) return 'hashiya';
  if (sharh) return 'sharh';
  return 'matn';
}

/** الاستخراج الخوارزمي (المرجع الدائم) */
export function algoExtract(card) {
  const c = parseCover({ name: card.name, info: card.info }, card.authorName || '');
  const authorLine = (String(card.info || '').match(/^\s*المؤلف\s*[:：]\s*(.*)$/m) || [])[1] || c.author || '';
  const author_title = TITLES.find((t) => authorLine.includes(t)) || '';
  let author_short = (card.authorName || '').trim();
  if (author_short.split(/\s+/).length > 3) author_short = author_short.split(/\s+/).slice(0, 2).join(' ');
  return {
    main_title: c.title || card.name || '',
    sub_title: c.subtitle || '',
    book_type: algoBookType((c.title || '') + ' ' + (card.name || ''), card.cat || ''),
    author_title,
    author_short,
    editor_name: c.editor || '',
  };
}

/**
 * يعيد { source: 'ai'|'algo', fields } — لا يرمي خطأً أبداً.
 * الحقول الفارغة في رد الذكاء الاصطناعي تُكمَّل من الخوارزمية.
 */
export async function enrichBook(book) {
  // اسم شهرة المؤلف: ما مرّره المستدعي من فهرس مصدر الكتاب، وإلا من فهرس «تراث»
  const cat = book.authorShort !== undefined ? null : catalogBook(book.id);
  const card = { id: book.id, name: book.name, info: book.info, authorName: (cat && cat.author) || book.authorShort || '', cat: (cat && cat.cat) || book.cat || '' };
  const algo = algoExtract(card);
  let ai = null;
  try {
    ai = await aiExtract(card);
  } catch {
    ai = null;
  }
  if (!ai) return { source: 'algo', fields: algo };
  const fields = {};
  for (const k of Object.keys(algo)) fields[k] = ai[k] || algo[k];
  // التفسير يُعرف من عنوانه وتصنيفه يقيناً، فلا يُستبدل به «متن»
  if (algo.book_type === 'tafsir' && (fields.book_type === 'matn' || !fields.book_type)) fields.book_type = 'tafsir';
  return { source: 'ai', fields };
}
