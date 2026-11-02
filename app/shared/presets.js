// أساليب الإخراج المجهزة: أسماؤها من ألوانها (لا تحمل اسم أي دار نشر)
// Publisher-style presets: margins, fonts, colors.

// خط الكتاب الافتراضي: «أضواء السلف» (ملفا الخط في public/fonts)، واسمه الداخلي في Word: _adwa-assalaf_1444
export const BOOK_FONT = 'Adwa Assalaf';
/**
 * لون الورق: الأبيض، أو الأصفر كورق الكتب الشرعية (الشاموا، ٧٠ غراماً): عاجيٌّ مصفرّ دافئ، ليس ليمونياً.
 * زرقته (C4) أعلى بكثير من زرقة أقلام التظليل الصفراء (٦٦) فيبقى التظليل ظاهراً عليه (المزج «تغميقاً»)، والحبر الأسود أسود.
 */
export const PAPER = { white: '#FFFFFF', yellow: '#F3E7C4' };
export const NAMES_FONT = 'Aref Ruqaa'; // لاسم المؤلف والمحقق في الغلاف
// خط التنضيد القياسي (المتن والعناوين في الكتب والأبحاث والمتون): أميري، وملفاته في البرنامج (public/covers/fonts)
export const DEFAULT_FONT = 'Amiri';

export const FONTS = {
  'Adwa Assalaf': { label: 'أضواء السلف (خط الكتاب)', local: true, docx: '_adwa-assalaf_1444' },
  'Amiri': { label: 'أميري (نسخ كلاسيكي)', google: 'Amiri:wght@400;700' },
  'Scheherazade New': { label: 'شهرزاد (نسخ تراثي)', google: 'Scheherazade+New:wght@400;700' },
  'Noto Naskh Arabic': { label: 'نوتو نسخ', google: 'Noto+Naskh+Arabic:wght@400;700' },
  'Markazi Text': { label: 'مركزي', google: 'Markazi+Text:wght@400;700' },
  'Lateef': { label: 'لطيف', google: 'Lateef:wght@400;700' },
  'Aref Ruqaa': { label: 'عارف رقعة (للغلاف)', google: 'Aref+Ruqaa:wght@400;700' },
  'Reem Kufi': { label: 'ريم كوفي (للعناوين)', google: 'Reem+Kufi:wght@400;700' },
  'El Messiri': { label: 'المسيري', google: 'El+Messiri:wght@400;700' },
};

const BASE = {
  template: 'full',
  footnotes: true,
  tocPosition: 'end',
  tocLevels: 3,
  matnColor: '#8B1A1A',
  matnBold: true,
  // الآية داخل المتن: بلون المتن (لا بلون القرآن)
  quranInMatn: false,
  matnBrackets: '()',
  quranColor: '#1F5E3B',
  hadithBold: false,
  headingColors: { 1: '#6B1D2F', 2: '#3D2314', 3: '#6B1D2F', 4: '#3D2314' },
  textColor: '#1d1712',
  ornament: '۞ ۞ ۞',
  ornamentColor: '#C5A059',
  ornaments: true,
  fonts: { body: DEFAULT_FONT, heading: DEFAULT_FONT, cover: BOOK_FONT, names: NAMES_FONT },
  sizes: { body: 16, note: 13.5, h1: 24, h2: 19, h3: 17, h4: 16 },
  lineHeight: 1.85,
  noteLineHeight: 1.6,
  page: { w: 170, h: 240, side: 20, top: 18, bottom: 14 },
  indentMm: 4,
  chapterNewPage: true,
  runningHead: true,
  widowOrphan: true, // لا يبقى سطرٌ من فقرةٍ وحده في أسفل الصفحة (اليتيم) ولا في أعلاها (الأرمل)
  runts: true, // لا تبقى كلمةٌ وحدها في آخر الفقرة (الأقزم)
  ruleColor: '#C5A059',
  frame: false,
  tocInclude: [1, 2, 3], // مستويات العناوين في الفهرس
  quotedColor: '', // لون المتن المقتبس في الشرح (فارغ = لون المتن)
  verseLayout: 'line', // وضع الشطرين: line = في سطر واحد · stack = الأول يميناً والثاني في السطر التالي يساراً · stagger = كذلك ويبدأ الثاني قبل نهاية الأول
  verseSep: 'none', // بين الشطرين (في السطر الواحد): none | one | three
  verseSepSymbol: '✽',
  verseColor: '', // لون الأبيات (فارغ = لون النص)
  sharhEnd: 'page', // نهاية الشرح: page = المتن الجديد في أول صفحة جديدة · ornament = ثلاثة رموز بعد الشرح
  docxLineSpacing: 1, // تباعد الأسطر في Word
  printReady: false, // نسخة جاهزة للطباعة: صفحات بيضاء وصفحة عنوان مختصر وصفحة بسملة قبل الكتاب
  basmalaColor: '', // لون البسملة في صفحتها (فارغ = لون الأبواب)
  basmalaId: '', // صورة البسملة المختارة من مكتبة الموقع (فارغ = الافتراضية · text = نصاً بخط الرقعة)
  design: {}, // أجزاء التصميم الجاهزة المختارة (shared/style-parts.js): { h1: 'box', frame: 'double', … }
  // قواعد التنضيد الأساسية (shared/typo-rules.js):
  typoRules: true, // المسافات حول علامات الترقيم والأقواس وإحالة الحاشية وواو العطف: في الكتب والمتون من المحرك نفسه دائماً (لا خيار)، وفي البحث بقرار المستخدم
  spaceCollapse: false, // البحث وحده: توحيد المسافات المتتالية مسافةً واحدة فقط (دون سائر القواعد)
  nabawiBold: true, // قول النبي ﷺ بعد «قال ﷺ» ونحوها: بخط عريض حتى نهاية جملته
  ayahCite: '', // عزو الآيات: '' كما في الأصل · matn بعد الآية «[البقرة: ٢٥٥]» · note في الحاشية «سورة البقرة، الآية ٢٥٥»
  headScheme: 'pro', // نظام العناوين: pro الباب والفصل والمبحث والمطلب والفرع (انظر typo-rules.js) · style كما صمّمه الأسلوب
};

/** الأسلوب الذي يُستعمل حين لا يُعرف أسلوب الكتاب: أول الأساليب المضمّنة */
export const DEFAULT_BOOK_STYLE = 'mothhab';

export const PRESETS = {
  mothhab: {
    name: 'المُذهَّب',
    desc: 'إخراج على هيئة المخطوطات السلطانية المذهّبة: جدول مذهّب حول النص، سرلوح لازوردي لكل باب بذؤابة وترنجة في الهامش، عناوين بالحمرة، ورقم الصفحة في نجمة على الجدول، وتعقيبة في ذيل الصفحة، وبسملة في شمسة،',
    ...BASE,
    matnColor: '#9A2A1E',
    quranColor: '#1E5A44',
    textColor: '#1C1915',
    ornamentColor: '#B08A3A',
    ruleColor: '#B08A3A',
    headingColors: {
      1: '#1B3768',
      2: '#9A2A1E',
      3: '#1B3768',
      4: '#9A2A1E',
    },
    headScheme: 'style',
    verseSep: 'one',
    sharhEnd: 'ornament',
    ornament: '❁ ❁ ❁',
    verseSepSymbol: '❁',
    fonts: {
      body: 'Adwa Assalaf',
      heading: 'Amiri',
      cover: 'Amiri',
      names: 'Aref Ruqaa',
    },
    sizes: {
      body: 16,
      note: 13.5,
      h1: 22,
      h2: 18.5,
      h3: 16.5,
      h4: 16,
    },
    lineHeight: 1.9,
    noteLineHeight: 1.65,
    page: {
      w: 170,
      h: 240,
      side: 21,
      top: 27,
      bottom: 26,
    },
    indentMm: 5,
    kind: 'books',
    sideNote: {
      size: 10.5,
      color: '#3A2A1C',
      al: 'c',
      rule: true,
      box: true,
    },
    mutunLook: {
      mPlace: 'page',
      mSide: 'right',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelColor: '#9A2A1E',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: 'قال المصنف رحمه الله تعالى:',
      mIntroAt: 'first',
      mIntroAl: 'r',
      mIntroColor: '#9A2A1E',
      mIntroDeco: 'plain',
      mIntroBold: true,
      mRule: 'lines',
      mRuleColor: '#CDB98A',
      mGap: 8,
      mNum: 'side',
    },
    forKind: {
      mutun: {
        sizes: {
          body: 17,
        },
        lineHeight: 2.05,
      },
    },
  },
  zomorrodi: {
    name: 'الزمرّدي',
    desc: 'زمرّدٌ وذهبٌ وعقيق من جلود المصاحف: إطارٌ ذهبي مزدوج بين شريطي سلسلة ووردات في زواياه، الباب على لوحٍ زمرّدي مشطوف الطرفين تعلوه وردة، ورقم الصفحة في دارة. خانة الهامش بقدر ما يُكتب فيها، وفي المتون «',
    ...BASE,
    matnColor: '#8A1F24',
    quranColor: '#13694B',
    textColor: '#1C231F',
    ornamentColor: '#B38B3F',
    ruleColor: '#B38B3F',
    headingColors: {
      1: '#0E5640',
      2: '#8A1F24',
      3: '#0E5640',
      4: '#8A1F24',
    },
    headScheme: 'style',
    fonts: {
      body: 'Amiri',
      heading: 'Amiri',
      cover: 'Adwa Assalaf',
      names: 'Aref Ruqaa',
      h1: 'Aref Ruqaa',
    },
    sizes: {
      body: 15.5,
      note: 12.5,
      h1: 22,
      h2: 18,
      h3: 16,
      h4: 15,
    },
    lineHeight: 1.9,
    page: {
      w: 170,
      h: 240,
      side: 24,
      top: 30,
      bottom: 26,
    },
    kind: 'books',
    sideNote: {
      size: 10,
      color: '#123F31',
      al: 'c',
      box: true,
    },
    ustyles: {
      tanbih: {
        name: 'تنبيه',
        kind: 'p',
        st: {
          bold: true,
          color: '#8A1F24',
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'side',
        },
      },
      faida: {
        name: 'فائدة',
        kind: 'p',
        st: {
          color: '#0E5640',
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'shade',
        },
      },
      mustalah: {
        name: 'مصطلح',
        kind: 'c',
        st: {
          bold: true,
          color: '#0E5640',
        },
      },
    },
    mutunLook: {
      mPlace: 'page',
      mSide: 'right',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelFont: 'Aref Ruqaa',
      mLabelColor: '#0E5640',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: 'قال المصنف رحمه الله تعالى:',
      mIntroAt: 'first',
      mIntroAl: 'r',
      mIntroColor: '#8A1F24',
      mIntroDeco: 'plain',
      mIntroBold: true,
      mRule: 'lines',
      mRuleColor: '#A9C2B5',
      mGap: 8,
      mNum: 'side',
    },
    forKind: {
      mutun: {
        sizes: {
          body: 16.5,
        },
        lineHeight: 2.1,
      },
    },
  },
  bustan: {
    name: 'البستان',
    desc: 'عقيقٌ وذهبٌ على حبرٍ أخضر داكن من جلود المصاحف: إطارٌ مربّع بشريطٍ من المعيّنات وكوشاتٌ في زواياه، الباب في خرطوشةٍ مقوّسة الأطراف تعلوها ترنجة وتحفّها أغصانٌ ذهبية، ورقم الصفحة في لوحٍ مدبّب. خانة ال',
    ...BASE,
    matnColor: '#8A1C22',
    quranColor: '#1E5B3F',
    textColor: '#1E241F',
    ornamentColor: '#B39048',
    ruleColor: '#B39048',
    headingColors: {
      1: '#8A1C22',
      2: '#24443A',
      3: '#8A1C22',
      4: '#24443A',
    },
    matnQawluhu: true,
    mergeBroken: true,
    headScheme: 'style',
    ornament: '❁ ❁ ❁',
    fonts: {
      body: 'Amiri',
      heading: 'Amiri',
      cover: 'Aref Ruqaa',
      names: 'Aref Ruqaa',
      h1: 'Aref Ruqaa',
    },
    sizes: {
      body: 15.5,
      note: 12.5,
      h1: 21,
      h2: 17.5,
      h3: 16,
      h4: 15,
    },
    lineHeight: 1.9,
    page: {
      w: 170,
      h: 240,
      side: 24,
      top: 30,
      bottom: 28,
    },
    kind: 'books',
    sideNote: {
      size: 10,
      color: '#24443A',
      al: 'c',
      box: true,
    },
    ustyles: {
      tanbih: {
        name: 'تنبيه',
        kind: 'p',
        st: {
          bold: true,
          color: '#8A1C22',
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'double',
        },
      },
      faida: {
        name: 'فائدة',
        kind: 'p',
        st: {
          color: '#24443A',
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'shade',
        },
      },
      mustalah: {
        name: 'مصطلح',
        kind: 'c',
        st: {
          bold: true,
          color: '#8A1C22',
        },
      },
    },
    mutunLook: {
      mPlace: 'page',
      mSide: 'right',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelFont: 'Aref Ruqaa',
      mLabelColor: '#8A1C22',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: 'قال المصنف رحمه الله تعالى:',
      mIntroAt: 'first',
      mIntroAl: 'r',
      mIntroColor: '#24443A',
      mIntroDeco: 'plain',
      mIntroBold: true,
      mRule: 'lines',
      mRuleColor: '#C9B48A',
      mGap: 8,
      mNum: 'side',
    },
    forKind: {
      mutun: {
        sizes: {
          body: 16.5,
        },
        lineHeight: 2.1,
      },
    },
  },
  hibr: {
    name: 'حِبر',
    desc: 'أسلوب الكتب القديمة السادة: أسود خالص على الورق — لا زخارف ولا صور ولا إطارات صفحات ولا خطوط زينة ولا ألوان، وإنما ما كان البرنامجُ يرسمه أصلاً نُفِيَ عنه إلا ما لا بدَّ منه (خطٌّ فوق الحواشي وفواصل ا',
    ...BASE,
    matnColor: '#000000',
    quranColor: '#000000',
    textColor: '#000000',
    ornamentColor: '#000000',
    ruleColor: '#000000',
    headingColors: {
      1: '#000000',
      2: '#000000',
      3: '#000000',
      4: '#000000',
    },
    ornaments: false,
    basmalaId: 'text',
    tocTitle: 'فهرس الموضوعات',
    fonts: {
      body: 'Amiri',
      heading: 'Amiri',
      cover: 'Amiri',
      names: 'Amiri',
      matn: 'Amiri',
    },
    kind: 'books',
    mutunLook: {
      mPlace: 'below',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelSize: 14,
      mLabelColor: '#000000',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: '',
      mRule: 'lines',
      mRuleColor: '#000000',
      mGap: 8,
      mNum: 'side',
      mSeq: 'off',
      mOwner: {
        on: true,
        fields: [{
          t: 'الاسم',
          f: 'dots',
        }, {
          t: 'الرقم',
          f: 'dots',
        }],
      },
    },
  },
  najd: {
    name: 'نجد',
    desc: 'إخراج من عمارة نجد ونقوشها: جدارٌ بخطين تعلوه الشُّرَف ولوحة جصّية للترويسة، ولكل باب عارضةٌ من خشب الأثل بالمسامير والقيطان ودوّار الشمس، والسدو بجوار الفصول، والمثلثات فاصلاً. الغلاف الداخلي لوحةٌ ج',
    ...BASE,
    matnColor: '#A23B26',
    quranColor: '#3F6B45',
    textColor: '#231B15',
    ornamentColor: '#B28659',
    ruleColor: '#7A5536',
    headingColors: {
      1: '#3B2A1E',
      2: '#A23B26',
      3: '#7A5536',
      4: '#3B2A1E',
    },
    headScheme: 'style',
    verseSep: 'one',
    sharhEnd: 'ornament',
    ornament: '▲ ▼ ▲',
    verseSepSymbol: '✺',
    fonts: {
      body: 'Adwa Assalaf',
      heading: 'Amiri',
      cover: 'Reem Kufi',
      names: 'Aref Ruqaa',
    },
    sizes: {
      body: 16,
      note: 13.5,
      h1: 20,
      h2: 18,
      h3: 16.5,
      h4: 16,
    },
    lineHeight: 1.9,
    noteLineHeight: 1.65,
    page: {
      w: 170,
      h: 240,
      side: 25,
      top: 30,
      bottom: 25,
    },
    indentMm: 5,
    kind: 'books',
    sideNote: {
      size: 10,
      color: '#3B2A1E',
      al: 'c',
      box: true,
    },
    mutunLook: {
      mPlace: 'page',
      mSide: 'right',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelFont: 'Reem Kufi',
      mLabelColor: '#3B2A1E',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: 'قال المصنف رحمه الله تعالى:',
      mIntroAt: 'first',
      mIntroAl: 'r',
      mIntroColor: '#A23B26',
      mIntroDeco: 'plain',
      mIntroBold: true,
      mRule: 'lines',
      mRuleColor: '#C9AE88',
      mGap: 8,
      mNum: 'side',
    },
    forKind: {
      mutun: {
        sizes: {
          body: 17,
        },
        lineHeight: 2.05,
      },
    },
  },
  samarqand: {
    name: 'سمرقند',
    desc: 'الزخرفة التيمورية: لازوردٌ وذهبٌ وفيروز على عاجٍ. بلاطٌ نجميٌّ ثمانيٌّ دقيقُ الهندسة يطوّق كل صفحة بشرائط ذهبية ولقطاتٍ بوردّاتٍ في الزوايا، ورقم الصفحة في قوسٍ محرابيٍّ لازورديّ بحبره الذهبي، وزخرفةٌ',
    ...BASE,
    matnColor: '#16305F',
    quranColor: '#9C2B2E',
    textColor: '#241C10',
    ornamentColor: '#C9A035',
    ruleColor: '#C9A035',
    basmalaColor: '#16305F',
    headingColors: {
      1: '#16305F',
      2: '#16305F',
      3: '#1E4480',
      4: '#6B5210',
    },
    basmalaId: 'text',
    ornament: '❁ ❁ ❁',
    tocTitle: 'فهرس الموضوعات',
    fonts: {
      body: 'Amiri',
      heading: 'Amiri',
      cover: 'Reem Kufi',
      names: 'Aref Ruqaa',
      matn: 'Amiri',
    },
    page: {
      w: 170,
      h: 240,
      side: 20,
      top: 18,
      bottom: 20,
    },
    kind: 'books',
    mutunLook: {
      mPlace: 'below',
      mLabel: 'التعليقات',
      mLabelAl: 'c',
      mLabelSize: 14,
      mLabelColor: '#F3E3AC',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: '',
      mRule: 'lines',
      mRuleColor: '#C9A035',
      mGap: 8,
      mNum: 'side',
      mSeq: 'off',
      mOwner: {
        on: true,
        fields: [{
          t: 'الاسم',
          f: 'dots',
        }, {
          t: 'الرقم',
          f: 'dots',
        }],
      },
    },
    forKind: {
      mutun: {
        lineHeight: 2,
      },
    },
  },
  thurayya: {
    name: 'الثُّريّا',
    desc: 'لازوردٌ وذهب: نجمةٌ ثمانية (ربع الحزب) تتكرّر في الباب والصفحة والزوايا والفاصل، وإطارٌ مزدوج بنجومٍ في زواياه، وبسملةٌ في وردةٍ هندسية؛ وللمتون تعليقٌ مقابل بعنوانٍ مزيَّن وتمهيدٌ «قال المصنِّف…».',
    ...BASE,
    matnColor: '#9B2335',
    quranColor: '#0F6B54',
    textColor: '#1B1A17',
    ornamentColor: '#B8913F',
    ruleColor: '#B8913F',
    headingColors: {
      1: '#17325C',
      2: '#8A5A1C',
      3: '#17325C',
      4: '#8A5A1C',
    },
    headScheme: 'style',
    verseSep: 'one',
    sharhEnd: 'ornament',
    verseSepSymbol: '*',
    fonts: {
      body: 'Amiri',
      heading: 'Amiri',
      cover: 'Reem Kufi',
      names: 'Aref Ruqaa',
      matn: 'Amiri',
      quran: 'Scheherazade New',
      h1: 'Reem Kufi',
      h2: 'Amiri',
      h3: 'Amiri',
    },
    sizes: {
      body: 16,
      note: 13,
      h1: 23,
      h2: 18.5,
      h3: 16.5,
      h4: 15.5,
    },
    lineHeight: 1.9,
    page: {
      w: 170,
      h: 240,
      side: 27,
      top: 28,
      bottom: 27,
    },
    kind: 'books',
    sideNote: {
      size: 10.5,
      color: '#17325C',
      al: 'r',
      box: true,
    },
    ustyles: {
      tanbih: {
        name: 'تنبيه',
        kind: 'p',
        st: {
          bold: true,
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'shade',
        },
      },
      faida: {
        name: 'فائدة',
        kind: 'p',
        st: {
          color: '#17325C',
        },
        ps: {
          sb: 2,
          sa: 2,
          bx: 'side',
        },
      },
      mustalah: {
        name: 'مصطلح',
        kind: 'c',
        st: {
          bold: true,
          color: '#9B2335',
        },
      },
    },
    mutunLook: {
      mPlace: 'page',
      mSide: 'right',
      mLabel: 'تعليقاتي وفوائد الدرس',
      mLabelAl: 'c',
      mLabelFont: 'Reem Kufi',
      mLabelColor: '#17325C',
      mLabelDeco: 'plain',
      mLabelBold: true,
      mIntro: 'قال المصنِّف رحمه الله تعالى:',
      mIntroAt: 'first',
      mIntroAl: 'r',
      mIntroColor: '#8A5A1C',
      mIntroDeco: 'plain',
      mIntroBold: true,
      mRule: 'lines',
      mRuleColor: '#B9C3D3',
      mGap: 9,
    },
    forKind: {
      mutun: {
        sizes: {
          body: 17,
        },
        lineHeight: 2.2,
      },
    },
  },
};

/* ====================================================================== */
/* أساليب الأبحاث: لا تظهر مع أساليب الكتب، بل حين يكون المعروض بحثاً        */
/* (من «دليل إعداد وتنسيق البحوث الشرعية الأكاديمية»: A4، هوامش ٢٫٥ سم،      */
/*  Traditional Arabic: المتن ١٦ والحواشي ١٢ والمصادر ١٤ والإنجليزي ١٢       */
/*  بـTimes New Roman، أسود خالص، ٦ نقاط بعد الفقرة، بادئة ٠٫٥ سم، بلا زخرفة)  */
/* ====================================================================== */
export const RESEARCH_FONT = 'Traditional Arabic';
const RBASE = {
  ...BASE,
  kind: 'research',
  research: true,
  template: 'research',
  rlayout: 'uni',
  footnotes: true,
  tocPosition: 'end',
  tocInclude: [1, 2, 3],
  tocTitle: 'فهرس الموضوعات',
  matnColor: '#000000',
  matnBold: false,
  quranInMatn: false,
  matnBrackets: 'none',
  quranColor: '#000000',
  hadithBold: false,
  headingColors: { 1: '#000000', 2: '#000000', 3: '#000000', 4: '#000000' },
  textColor: '#000000',
  ornament: '* * *',
  ornamentColor: '#000000',
  ornaments: false,
  ruleColor: '#000000',
  frame: false,
  // أميري (مرفقٌ بترخيص OFL) للنص وصفحة العنوان والأسماء؛ و Traditional Arabic يُختار إن كان مثبتاً في الجهاز (وإلا فأميري مكانه)
  fonts: { body: DEFAULT_FONT, heading: DEFAULT_FONT, cover: DEFAULT_FONT, names: DEFAULT_FONT },
  sizes: { body: 16, note: 12, h1: 18, h2: 17, h3: 16, h4: 16 },
  lineHeight: 1.6,
  noteLineHeight: 1.45,
  page: { w: 210, h: 297, side: 25, top: 25, bottom: 25 },
  indentMm: 5,
  chapterNewPage: true,
  runningHead: false,
  widowOrphan: true,
  runts: true,
  quotedColor: '',
  verseLayout: 'line',
  verseSep: 'none',
  verseColor: '',
  sharhEnd: 'page',
  docxLineSpacing: 1.15,
  printReady: false,
  design: {},
  // البحث: لا يُغيَّر نص الباحث إلا بقراره (المسافات والعريض مطفأة)، والعناوين كما يضعها قالب البحث
  typoRules: false,
  spaceCollapse: false,
  nabawiBold: false,
  ayahCite: '',
  headScheme: 'style',
  // ما يخص البحث: المسافة بعد الفقرة (نقطة)، وحجم الملخص والمصادر والنص الإنجليزي ورقم الصفحة
  paraAfter: 6,
  abstractSize: 15,
  refSize: 14,
  enSize: 12,
  folioSize: 12,
};
// أساليب الأبحاث (kind: research) مع الأساليب المضمّنة، ولا تظهر إلا مع الأبحاث. ويُضاف إليها أساليب الجامعات ومراكز البحث
PRESETS['r-academic'] = {
  name: 'الأكاديمي',
  desc: 'من «دليل إعداد وتنسيق البحوث الشرعية»: A4 بهوامش ٢٫٥ سم، بخط أميري (و Traditional Arabic إن كان مثبتاً واختير): المتن ١٦ والحواشي ١٢ والمصادر ١٤، والإنجليزي Times New Roman ١٢، أسود خالص بلا زخرفة.',
  ...RBASE,
};

/**
 * قوالب الأبحاث: بنية البحث بحسب نوعه (تُختار في «القالب»)، والأسلوب (الخط والألوان والمقاسات والهوامش) من «الأسلوب».
 * set: ما يضبطه القالب من الإعدادات (يبقى إذا تغيّر الأسلوب)
 * تباعد الأسطر يختلف بين PDF و Word عمداً: lineHeight مضاعفُ حجم الخط (CSS)، و docxLineSpacing مضاعفُ «السطر المفرد» في Word،
 * وهو يُحسب من مقاييس الخط نفسه فيكون في الخطوط العربية أوسع من حجم الخط؛ فالرقمان متقاربان في الشكل وإن اختلفا.
 */
export const RESEARCH_LAYOUTS = {
  uni: {
    name: 'البحث الجامعي',
    desc: 'بحث تخرّج أو مقرّر: كل قسمٍ رئيس في صفحة جديدة، وتباعد الأسطر ١٫٦ في PDF و١٫١٥ في Word، وفهرس الموضوعات في آخره.',
    set: { chapterNewPage: true, tocPosition: 'end', lineHeight: 1.6, docxLineSpacing: 1.15, abstractSize: 15 },
  },
  journal: {
    name: 'البحث المحكَّم',
    desc: 'للنشر في مجلة علمية: الأقسام متصلة بلا صفحات جديدة، وتباعد الأسطر ١٫٥ في PDF ومفرد في Word، ولا فهرس.',
    set: { chapterNewPage: false, tocPosition: 'none', lineHeight: 1.5, docxLineSpacing: 1, abstractSize: 14 },
  },
  thesis: {
    name: 'الرسالة العلمية',
    desc: 'ماجستير أو دكتوراه: كل بابٍ وفصل في صفحة جديدة، وتباعد الأسطر ١٫٨٥ في PDF و١٫٥ في Word، وفهرس الموضوعات في آخرها.',
    set: { chapterNewPage: true, tocPosition: 'end', lineHeight: 1.85, docxLineSpacing: 1.5, abstractSize: 15 },
  },
};
/** يطبّق قالب البحث على الإعدادات (اسمه في rlayout) */
export function applyResearchLayout(s, id) {
  const k = RESEARCH_LAYOUTS[id] ? id : 'uni';
  return { ...s, ...JSON.parse(JSON.stringify(RESEARCH_LAYOUTS[k].set)), template: 'research', rlayout: k };
}
/** نوع الأسلوب: للكتب، أو للأبحاث، أو للمتون (المتن وصفحةٌ للتعليق عليه) */
export const STYLE_KINDS = { books: 'الكتب', research: 'الأبحاث', mutun: 'المتون' };
/** الأسلوب الشامل: يصلح للكتب والأبحاث والمتون معاً، وما يخص كلّاً منها في settings.forKind */
export const ALL_KIND = 'all';
export const kindOf = (s) => {
  const x = (s && s.settings) || s || {};
  if (x.kind === ALL_KIND) return ALL_KIND;
  return STYLE_KINDS[x.kind] ? x.kind : x.research ? 'research' : 'books';
};
/**
 * هل يصلح الأسلوب لهذا النوع؟ (أسلوب نوعه، أو أسلوبٌ شامل)
 * وأسلوب الكتب أسلوبٌ للمتون أيضاً: المتن يُنضَّد كالكتاب، وشكل موضع التعليق فيه من mutunLook (أو forKind.mutun)
 */
export const styleFits = (s, kind) => {
  const k = kindOf(s);
  return k === kind || k === ALL_KIND || (k === 'books' && kind === 'mutun');
};
export const isResearchSettings = (s) => !!(s && (s.template === 'research' || kindOf(s) === 'research'));
/** إعدادات بحث كاملة: أسلوبٌ للأبحاث (الأكاديمي أصلاً) بقالب البحث */
export function researchSettings(layout = 'uni', styleId = 'r-academic') {
  const st = PRESETS[styleId] && kindOf(PRESETS[styleId]) === 'research' ? styleId : 'r-academic';
  return applyResearchLayout(JSON.parse(JSON.stringify({ ...PRESETS[st], preset: st, styleId: '' })), layout);
}

export const MATN_COLORS = [
  { v: '#8B1A1A', label: 'أحمر دمي' },
  { v: '#1B2A5A', label: 'أزرق داكن' },
  { v: '#111111', label: 'أسود' },
  { v: '#0F5132', label: 'أخضر زيتي' },
  { v: '#6B1D2F', label: 'عنابي' },
];

export const VERSE_SEPS = ['✽', '*', '۞', '❁', '❖', '•', '◆', '~'];

export const ORNAMENTS = ['۞ ۞ ۞', '۝ ۝ ۝', '❁ ❁ ❁', '✽ ✽ ✽', '❖ ❖ ❖', '* * *'];

export const TEMPLATES = {
  matn: 'متن فقط',
  matn_sharh: 'متن وشرح',
  matn_hashia: 'متن وحاشية',
  full: 'متن وشرح وحاشية',
  tafsir: 'تفسير',
};

/** القيم الافتراضية لكل أسلوب (ما لم يحدده الأسلوب يؤخذ من هنا) */
export const STYLE_DEFAULTS = BASE;

/**
 * الخطوط التي رفعها المالك (من /api/fonts): تُضاف إلى FONTS فتظهر في كل القوائم،
 * ويُعرف اسمها الداخلي في Word. تُستدعى في المتصفح وفي الخادم.
 */
const uploadedKeys = new Set();
/**
 * خط «اللوتس» (Lotus Linotype، خط دور النشر في الكتب العربية): تجاري لا يُوزَّع مع ورّاق،
 * فإذا وُجد مثبّتاً في الجهاز (أو رفعه المالك) صار في مقدّمة خطوط ورّاق باسمه «اللوتس».
 */
export const LOTUS = { family: 'Lotus Linotype', label: 'اللوتس' };
const lotusScore = (f) => {
  const fam = String(f.family || '');
  if (!/lotus|لوتس/i.test(fam + ' ' + (f.label || ''))) return 0;
  return (/^lotus linotype$/i.test(fam) ? 30 : /^lotus linotype/i.test(fam) ? 20 : 10) + (f.system ? 0 : 5) + (f.arabic === false ? -8 : 0);
};
export function registerFonts(list) {
  for (const k of uploadedKeys) delete FONTS[k];
  uploadedKeys.clear();
  const ok = (list || []).filter((f) => f && f.family && !(FONTS[f.family] && !FONTS[f.family].uploaded));
  // أفضل «لوتس» موجود: يُثبَّت ثانياً بعد خط الكتاب
  const lotus = ok.reduce((best, f) => (lotusScore(f) > (best ? lotusScore(best) : 0) ? f : best), null);
  if (lotus) {
    const entries = Object.entries(FONTS);
    for (const [k] of entries) delete FONTS[k];
    entries.forEach(([k, v], i) => {
      FONTS[k] = v;
      if (i === 0) {
        FONTS[lotus.family] = { label: `${LOTUS.label} (${lotus.family})`, uploaded: true, pinned: true, docx: lotus.docx || lotus.family, ...(lotus.system ? { system: true, arabic: true } : {}) };
        uploadedKeys.add(lotus.family);
      }
    });
  }
  for (const f of ok) {
    if (f === lotus) continue;
    FONTS[f.family] = { label: f.label || f.family, uploaded: true, docx: f.docx || f.family, ...(f.system ? { system: true, arabic: !!f.arabic } : {}) };
    uploadedKeys.add(f.family);
  }
}

/** إعدادات كاملة من أسلوب (مضمّن أو من صنع المالك): الافتراضيات ثم قيم الأسلوب */
/**
 * إعدادات الأسلوب كاملة. kind: النوع الذي يُختار له (books | research | mutun):
 * الأسلوب الشامل يأخذ نوعه، ويُضم إليه ما يخص ذلك النوع (settings.forKind[kind])
 */
export function styleSettings(style, kind) {
  const d = JSON.parse(JSON.stringify(BASE));
  const t = JSON.parse(JSON.stringify((style && style.settings) || {}));
  const fk = t.forKind && typeof t.forKind === 'object' ? t.forKind : null;
  delete t.forKind;
  const want = STYLE_KINDS[kind] ? kind : t.kind === ALL_KIND ? 'books' : null;
  const extra = fk && want && fk[want] && typeof fk[want] === 'object' ? fk[want] : null;
  for (const k of ['fonts', 'sizes', 'page', 'headingColors']) if (t[k] || (extra && extra[k])) t[k] = { ...d[k], ...(t[k] || {}), ...((extra && extra[k]) || {}) };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (['fonts', 'sizes', 'page', 'headingColors'].includes(k)) continue;
      // (شكل المتون والأنماط: يُضم إلى ما في الأسلوب)
      if ((k === 'mutunLook' || k === 'ustyles' || k === 'sideNote') && v && typeof v === 'object') t[k] = { ...(t[k] || {}), ...v };
      else t[k] = v;
    }
  }
  // الشامل يصير من النوع الذي اختير له (فيعامَل البحث بحثاً)
  if (t.kind === ALL_KIND) {
    t.kind = want || 'books';
    if (t.kind === 'research') t.research = true;
    else delete t.research;
  }
  const id = (style && style.id) || DEFAULT_BOOK_STYLE;
  return { ...d, ...t, preset: id, styleId: id };
}

/** اسم الخط كما يعرفه Word (الاسم الداخلي للملف) */
export const docxFontName = (fam) => (FONTS[fam] && FONTS[fam].docx) || fam;

export function presetSettings(id) {
  const p = PRESETS[id] || PRESETS[DEFAULT_BOOK_STYLE];
  return JSON.parse(JSON.stringify({ ...p, preset: id }));
}
