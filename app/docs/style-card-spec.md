# مرجع «بطاقة الأسلوب» — ورّاق

هذا المرجع يكفي وحده لصنع أسلوب إخراج جديد **دون تعديل الموقع**: يُكتب الأسلوب في مجلد، يُبنى منه ملف بطاقة، وتُسحب البطاقة إلى الخانة في `/admin/styles/`.

إصدار البطاقات الحالي: **3** (`CARD_VERSION` في `lib/styles.js`). أمثلة كاملة تعمل في `docs/examples/`:

| المثال | ما يثبته | فيه كود؟ |
|---|---|---|
| `nafais` «النفائس» | الباب في خانة برقمه، رقم الصفحة يتبدل موضعه، صفحة خاصة، إطار وزخرفة جانبية، خط يسافر مع البطاقة | لا |
| `frames` «المبروز» | خلفية منقوشة، ترويسة في مستطيل، النص في مستطيل، المتن والشرح والحاشية كلٌّ في خانته | ١٢ سطراً |
| `columns` «الموسوعي» | **منطق توزيع جديد**: النص في عمودين، والعناوين والحواشي بعرض الصفحة | ٥٠ سطراً |

---

## ١) ما الذي تحمله البطاقة

| الجزء | ما يفعله | يحتاج تعديل الموقع؟ |
|---|---|---|
| `settings` | الإعدادات التي يعرفها الموقع: ألوان، خطوط، مقاسات، هوامش، خيارات المتن والشرح | لا |
| `extras.css` | أي تنسيق: إطارات، خانات، خلفيات، مواضع، ما يتبدل بين الصفحة الفردية والزوجية | لا |
| `extras.images` | صور مضمّنة (زخارف، إطارات، شعارات) تُذكر في CSS والقوالب بـ`asset(اسم)` | لا |
| `extras.templates` | **بنية** عناصر الصفحة: عنوان الباب، رقم الصفحة، الترويسة، طبقة زخرفية، الغلاف الداخلي، رأس الفهرس… | لا |
| `extras.pages` | صفحات كاملة خاصة في مواضع من الكتاب (بسملة، إهداء، صفحة عنوان مختصر، خاتمة) | لا |
| `extras.script` | **برنامج الأسلوب**: كود يتحكم في آلية التنضيد نفسها (القياس، التوزيع، بناء الصفحة، ترتيب الصفحات) | لا |
| `fonts` | ملفات خطوط تدخل مكتبة خطوط الموقع عند التركيب | لا |

**القاعدة**: الشكل بـCSS، والبنية بالقوالب، وما يحتاج **منطقاً** (كيف يُقاس النص، أين يوضع، ما الذي يُعدّ شرحاً) فبالكود. والكود يعمل داخل مستند التنضيد وله المستند كله، فما يرسمه المتصفح يمكن أن تصنعه بطاقة.

**ما يبقى خارج البطاقة**:
- ملف **Word**: القوالب والتنسيق الخاص والصور والكود تعمل في PDF والمعاينة فقط. Word يأخذ من البطاقة الإعدادات (`settings`) وحدها.
- ما يسبق التنضيد: جلب الكتاب من «تراث» وتحليل صفحاته. الكود يستلم الكتاب بعد تحليله (ويستطيع إعادة تصنيف عناصره، انظر `W.on('doc')`).
- الشبكة: كود البطاقة لا يتصل بشيء (انظر «الأمان»).

---

## ٢) بنية المجلد والبناء

```
my-style/
  style.json              البيانات والإعدادات (المطلوب الوحيد)
  style.css               التنسيق الخاص
  script.js               برنامج الأسلوب (كود) — اختياري
  templates/<key>.html    قوالب العناصر
  pages/<file>.html       الصفحات الخاصة
  images/<name>.png|jpg|webp|svg
  fonts/<file>.woff|woff2|ttf|otf
```

```bash
node scripts/make-card.mjs my-style --out "أسلوب كذا.warraq.json" --pdf check.pdf
```

- الناتج `.warraq.json` يُقبل في خانة التركيب كما هو. بعد تركيبه يُنزَّل من الموقع بزر «تنزيل البطاقة» صورةً PNG مرسومة (المربع دائري الزوايا).
- `--pdf`: يركّب البطاقة في مخزن مؤقت **بالمسار نفسه الذي يسلكه الموقع**، وينضّد بها صفحات المعاينة الست في PDF. هذا هو التحقق قبل التسليم.
- `--book test/fixtures/book.json` مع `--pdf`: ينضّد كتاباً حقيقياً بدل صفحات المعاينة. المتاح: `book.json` (شرح فيه متن مضمَّن وحواشٍ وشعر) · `book-star.json` (متن ثم «شرح:») · `book-split.json` (متن أعلى الصفحة وشرح تحته).
- الأداة تطبع `⚠` لكل ما سيحذفه المنقّي أو يتجاهله (قالب مجهول، صورة غير موجودة، إعداد مجهول، رابط خارجي).
- `--png صورة.png`: يضمّن البيانات في صورة جاهزة بدل ملف JSON.
- بلا الموقع: `python3 scripts/embed-card.py card.warraq.json picture.png out.warraq.png` (بلا مكتبات).

### `style.json`

```json
{
  "name": "النفائس",
  "desc": "وصف قصير يظهر للمستخدم",
  "settings": { "headingColors": { "1": "#1F4E5F" }, "page": { "w": 170, "h": 240, "side": 23, "top": 27, "bottom": 17 } },
  "slots": { "pageBg": "frame" },
  "pages": [ { "file": "basmala.html", "at": "afterCover", "name": "basmala", "folio": false } ],
  "print": { "front": ["half", "blank", "cover", "blank", "basmala", "blank"], "numbering": "book", "gutterMm": 6 },
  "fonts": [ { "file": "Katibeh-Regular.woff", "family": "Katibeh", "label": "كاتبة", "weight": "all" } ]
}
```

### صيغة ملف البطاقة

```json
{ "format": "warraq-style", "version": 2, "name": "…", "desc": "…",
  "settings": { }, 
  "extras": { "css": "", "images": { "frame": "data:image/png;base64,…" }, "slots": { },
              "h1OrnamentMm": 7, "separatorMm": 8,
              "templates": { "h1": "<div>…</div>" },
              "pages": [ { "at": "afterCover", "name": "basmala", "folio": false, "html": "…" } ],
              "script": "W.on('pageDone', (page, info) => { … });", "scriptOn": true },
  "print": { "front": ["blank", "half", "blank", "cover", "blank", "basmala", "blank"], "back": [], "numbering": "count", "gutterMm": 0, "padTo": 0 },
  "fonts": [ { "family": "Katibeh", "label": "كاتبة", "weight": "all", "name": "Katibeh-Regular.woff", "data": "<base64>" } ] }
```

بطاقة PNG = صورة PNG فيها مقطع `iTXt` قبل `IEND`: المفتاح `warraq-style` ثم خمسة أصفار ثم JSON بترميز UTF-8 غير مضغوط.

الحدود: الصور ٢٤ صورة و١٢ م.ب · CSS ‏٨٠ ألف حرف · القالب ٣٠ ألف حرف · الصفحة الخاصة ٨٠ ألف حرف · ١٢ صفحة خاصة · الكود ٣٠٠ ألف حرف · خطوط البطاقة ١٦ م.ب · الملف كله ٤٠ م.ب.

الإصدار: بطاقة بلا كود تُكتب `version: 2`، وبكود `version: 3` (الأداة تفعل ذلك وحدها).

---

### البطاقة النصية (ما يكتبه ذكاء اصطناعي)

بديل عن المجلد لمن لا يملك الموقع ولا يشغّل الأدوات: **نص واحد** فيه كل ملف من ملفات الأسلوب في مربع كود، وقبله سطر باسمه.

````
### style.json
```json
{ "name": "…", "settings": { }, "pages": [ { "file": "ded.html", "at": "start", "name": "ded" } ] }
```
### style.css
```css
…
```
### templates/h1.html
### pages/ded.html
### images/frame.svg        ← SVG نصاً (لا base64)
### script.js
````

- يُلصق في الموقع من زر «بطاقة نصية» في `/admin/styles/`، أو يُسحب ملفه النصي إلى خانة التركيب، أو يُبنى بـ`node scripts/make-card.mjs الملف.md --pdf check.pdf`.
- القارئ `shared/card-text.js` متسامح: اسم الملف في عنوان أو سطر عريض أو جملة قبل المربع، أو في سطر فتح المربع، أو تعليقاً في أوله. و JSON يُقبل بتعليقات وفاصلة زائدة.
- بعد التركيب يرجع الموقع **ملاحظاته** (`lintCard` في `lib/styles.js`): كل ما تُجوهل أو حُذف، لتُصلح البطاقة.
- التوجيه الجاهز لأي ذكاء اصطناعي، لكل قسمٍ توجيهه: **`docs/ai-style-prompt-books.md`** للكتب والمتون (أسلوبٌ واحد) و**`docs/ai-style-prompt-research.md`** للأبحاث (زرّا «نسخ التوجيه» في الصفحة نفسها، و`/api/styles/ai-prompt?kind=books|research`).

## ٣) الإعدادات (`settings`)

تُحفظ المفاتيح المعروفة فقط، وما غاب يأخذ الافتراضي. الألوان `#RRGGBB`.

| المفتاح | القيم | الافتراضي |
|---|---|---|
| `headingColors` | `{ "1","2","3","4" }` ألوان مستويات العناوين | `#6B1D2F #3D2314 #6B1D2F #3D2314` |
| `textColor` `matnColor` `quranColor` `ornamentColor` `ruleColor` | لون | `#1d1712` `#8B1A1A` `#1F5E3B` `#C5A059` `#C5A059` |
| `quotedColor` `verseColor` | لون أو `""` (= يتبع المتن / النص) | `""` |
| `fonts` | `{ body, heading, cover, names }` أسماء خطوط الموقع | `Amiri` للنص والعناوين، و`Adwa Assalaf` لعنوان الغلاف، و`Aref Ruqaa` للأسماء (والبحث: `Amiri` للأربعة) |
| `sizes` | `{ body 9–26, note 7–22, h1 12–44, h2 11–38, h3 10–32, h4 9–30 }` بالنقطة | `16 13.5 24 19 17 16` |
| `lineHeight` `noteLineHeight` | ١٫٢–٢٫٨ · ١٫١–٢٫٦ | `1.85` `1.6` |
| `page` | `{ w 100–300, h 140–420, side 6–45, top 6–50, bottom 6–50 }` بالمليمتر | `170 240 20 18 14` |
| `outerMargin` | **الهامش الخارجي الواسع**: `{ on: true|false, w 22–90, odd: l|r }` — النص أضيق والهامش في طرف الكتاب أوسع (`w` عرضه بالمليمتر، والداخلي عند الكعب `page.side` كما هو؛ ويبقى للنص ٤٠ مم على الأقل). `odd`: الصفحة الفردية يسرى (`l`، الكتاب العربي) أو يمنى (`r`). وغياب `on`: اختيار المستخدم (المنضدة والمحرِّر) | `w 40` (في صفحة ١٧٠: النص ١١٠ والهامش الخارجي ٤٠)، `odd l` |
| `indentMm` | ٠–١٥ | `4` |
| `matnBold` `hadithBold` `footnotes` `chapterNewPage` `runningHead` `ornaments` `frame` `matnQawluhu` `mergeBroken` | منطقي | |
| `matnBrackets` | `()` `«»` `[]` `{}` `none` | `()` |
| `headScheme` | **نظام العناوين**: `pro` التقسيم العلمي — المحرك يضع لكل عنوانٍ دوره (`b.hr`) ومقاسه ونزوله وصفحته، ويعلو مقاسات الأسلوب ومسافاته ومحاذاته وقوالب العناوين و`chapterNewPage` و`chapterPage` (ويبقى للأسلوب خطوطه وألوانه): الباب `.hs-part` ٣٦/٤٤ ينزل ٦٠ مم في صفحةٍ فردية وحده (`.page.hs-partpg`) والزوجية بعده بيضاء · الفصل `.hs-ch` ٢٨/٣٦ ينزل ٣٢ مم يبدأ صفحةً فردية · المبحث `.hs-h2` ٢٠/٢٨ ٩/٣ مم ومعه ٣ أسطر · المطلب `.hs-h3` ١٧/٢٤ ٦/٢ مم · الفرع والمسألة `.ht` في أول فقرته بعده «:» (`shared/typo-rules.js`، `headSchemeCss` في `lib/book-html.js`) · `style` عناوين الأسلوب كما صمّمها. **بطاقةٌ تصمّم العناوين تكتب `style`** | `pro` (والبحث `style`) |
| `ayahCite` | عزو الآيات: `""` كما في الأصل · `matn` «[البقرة: ٢٥٥]» بعد الآية (`.qref`) · `note` في الحاشية «سورة البقرة، الآية ٢٥٥» | `""` |
| `nabawiBold` | قول النبي ﷺ بعد «قال ﷺ» ونحوها عريضاً حتى نهاية جملته | `true` (والبحث `false`) |
| `typoRules` · `spaceCollapse` | قواعد المسافات حول علامات الترقيم: في الكتب والمتون من المحرك دائماً (لا يُقرأ المفتاح)؛ وفي البحث `false` ما لم يختره المستخدم · `spaceCollapse` في البحث: توحيد المسافات المزدوجة وحده | `false` · `false` (البحث) |
| `tocPosition` | `start` `end` `none` | `end` |
| `tocInclude` | مستويات الفهرس من `[1,2,3]` | `[1,2,3]` |
| `verseLayout` | وضع شطري البيت: `line` في سطر واحد · `stack` الأول في يمين سطره والثاني في يسار السطر التالي · `stagger` كذلك، والبيت أضيق فيبدأ الثاني قبل نهاية الأول · `center` كل شطر في وسط سطره · `khams` تخميس · `tri` ثلاثي | `line` |
| `printReady` | نسخة جاهزة للطباعة: قبل الكتاب صفحات يرتّبها المالك في «إعدادات الطباعة» (الأصل: بيضاء، عنوان مختصر، بيضاء، غلاف داخلي، بيضاء، بسملة، بيضاء)، أو ما تحمله البطاقة في `print` (القسم ٦) | `false` |
| `basmalaColor` | لون البسملة في صفحتها، أو `""` (= لون الأبواب) | `""` |
| `basmalaId` | صورة البسملة من مكتبة الموقع: معرّفها، أو `""` (الأولى في المكتبة)، أو `"text"` (تُكتب بخط الرقعة). المعرّف يخص الموقع الذي رُفعت فيه | `""` |
| `verseSep` · `verseSepSymbol` | بين الشطرين في السطر الواحد: `none` `one` `three` · رمز حتى ٤ أحرف | `none` · `✽` |
| `sharhEnd` | `page` (المتن التالي في صفحة جديدة) · `ornament` (ثلاثة رموز ثم المتن) | `page` |
| `ornament` | نص الفاصل حتى ٢٤ حرفاً | `۞ ۞ ۞` |

| `kind` · `forKind` | نوع الأسلوب: `books` · `research` · `mutun` · `all` (بطاقةٌ واحدة للثلاثة)؛ وفي `all`: `forKind: { books, research, mutun }` ما يخص كل نوعٍ بالمفاتيح نفسها (يُضم إلى الإعدادات حين يُختار الأسلوب لذلك النوع: `styleSettings(style, kind)` في `shared/presets.js`) | `books` |
| `paper` | لون الورق مع الأسلوب: `white` · `yellow` (وغيابه: اختيار المستخدم) | — |
| `sideNote` | الهامش الجانبي (المحرِّر): `{ size 6–22, color, font, al: r|c|l|j, rule, box }` — `box: true` نص الهامش في خانةٍ (إطارٍ بقدر نصه، بدل الخط الفاصل؛ وللمستخدم أن يغيّرها في المحرِّر) | مقاس الحاشية، وسط، بخط، بلا خانة |
| `ustyles` | أنماط فقرةٍ وحرف جاهزة في المحرِّر: `{ id: { name, kind: p|c, st, ps, al } }` — وأنماط الكتاب نفسه باسمها تعلوها | — |
| `mutunLook` | شكل المتون مع الأسلوب: مفاتيح `m…` من `shared/mutun.js` — موضع التعليق وجهته ومساحته `mPlace mSide mCenter mPages mBelow mSideW mBelowLines mLead` · سطور الكتابة `mRule mRuleColor mGap` · **عنوان التعليق** بكل إعداداته: نصه `mLabel` وموضعه في السطر `mLabelAl` وزينته `mLabelDeco` وخطه `mLabelFont` ومقاسه `mLabelSize` ولونه `mLabelColor` وعريضه `mLabelBold` · **قبل المتن** («قال الناظم رحمه الله:») بكل إعداداته: نصه `mIntro` ومتى يوضع `mIntroAt` (`first` أول المتن · `heads` بعد كل بابٍ وفصل · `units` أول كل جزء) ومحاذاته `mIntroAl` وزينته `mIntroDeco` وخطه `mIntroFont` ومقاسه `mIntroSize` ولونه `mIntroColor` وعريضه `mIntroBold` · أرقام الأبيات والتقسيم `mNum mSeq mSeqFrom mStrip mDivide mHead mCount` · خانات صاحب النسخة `mOwner`. (بلا `mRange` و`mKind` فهما لكل كتابٍ وحده، ولا يُحمل منه `mPlace: "none"` ولا `mDivide: "manual"`) | — |
| `design` | أشكال جاهزة للعناصر بلا CSS (`DESIGN_PARTS` في `shared/style-parts.js`) | `{}` |

| `tocTitle` | عنوان الفهرس مع الأسلوب (حتى ٦٠ حرفاً) | «فهرس الموضوعات» |

**أسلوب الكتب أسلوبٌ للمتون أيضاً** (`styleFits` في `shared/presets.js`): المتن يُنضَّد كالكتاب، وشكل موضع التعليق فيه من `mutunLook`، وما يخص المتن وحده في `forKind.mutun` (يُضم حين يُختار الأسلوب لمتن، أياً كان نوعه). و`mutun` نوعٌ باقٍ لبطاقاتٍ صُنعت للمتون وحدها.

والتوجيه الذي يُعطى لأي ذكاء اصطناعي ليكتب البطاقة لكل قسمٍ توجيهه: `docs/ai-style-prompt-books.md` للكتب والمتون، و`docs/ai-style-prompt-research.md` للأبحاث (في «الأساليب» ← «نسخ التوجيه»).

خطوط الموقع المضمّنة: Adwa Assalaf · Amiri · Scheherazade New · Noto Naskh Arabic · Markazi Text · Lateef · Aref Ruqaa · Reem Kufi · El Messiri. وغيرها يأتي في `fonts` البطاقة.

---

## ٤) بنية الصفحة (ما يستهدفه CSS)

```html
<main id="book">
  <section class="page content odd opens" data-n="3">   <!-- content | cover | blank | toc | extra | opener -->
    <div class="deco">…قالب page…</div>                 <!-- إن وُجد القالب: طبقة خلف النص بمساحة الصفحة كلها -->
    <div class="rh on">…الترويسة…</div>                 <!-- on: حين تظهر -->
    <div class="body">                                   <!-- منطقة النص: الهوامش من settings.page -->
      <div class="flow">…الفقرات والعناوين…</div>
      <div class="notes"><div class="fnsep"></div><div class="fn">…</div></div>
    </div>
    <div class="folio">…رقم الصفحة…</div>
  </section>
</main>
```

أصناف الصفحة: `odd` / `even` بحسب موضعها في الملف · `pg-l` / `pg-r` وجهها من الكتاب المفتوح (يسرى أو يمنى) · `opens` صفحة تبدأ بباب · `x-<name>` للصفحة الخاصة · `data-n` رقمها المطبوع.
في الكتاب العربي الصفحة **الفردية يسارية** (`pg-l`): طرفها الخارجي اليسار، وطرف التجليد اليمين. والزوجية بالعكس (`pg-r`). وإن اختير `outerMargin.odd: "r"` صارت الفردية يمنى؛ فما يتبع الطرف الخارجي أو الكعب يُكتب تحت `.pg-l` و`.pg-r` لا `.odd` و`.even`.

### الهامش الخارجي الواسع وحدود منطقة النص

مع `outerMargin` (أو اختيار المستخدم) تضيق منطقة النص ويتّسع الهامش الذي في **طرف الكتاب**: يسار الصفحة اليسرى ويمين اليمنى، في صفحات المتن والفهرس (لا الغلاف الداخلي ولا صفحات ما قبل الكتاب). والحواشي داخل `.body` فتضيق معه، وما يكتبه المستخدم في الهامش (`.mside-n`) يقع فيه.
فلا تكتب أرقاماً ثابتة لحدود النص؛ بل:

| المتغير | المعنى (على `.page`) |
|---|---|
| `--t-l` `--t-r` | بُعد حافة النص اليسرى عن يسار الصفحة، واليمنى عن يمينها (الهامش + التجليد + الهامش الواسع؛ يتبدّلان بين الصفحتين) |
| `--x-l` `--x-r` | ما زيد للهامش الواسع في يسار الصفحة ويمينها (أحدهما صفر) |
| `--m-in` `--m-out` `--text-w` `--wide` | الهامش الداخلي، والخارجي، وعرض النص، وما زيد للواسع (ثابتة في الكتاب) |
| `--mside-clear` | بُعدٌ عن حافة النص **لا تدخله خانات الهامش** (الأصل ٠). من رسم إطاراً حول النص فليجعله بُعدَ الإطار عن النص وسمكه وزيادة مليمتر |
| `--mside-edge` | بُعدٌ عن **حافة الورق** لا تدخله (الأصل ٥ مم في الهامش الواسع و١٫٦ مم في غيره). يُؤخذ ما دام يبقى بعده للنص ١٠ مم |
| `--mside-bottom` | أدنى ما تنزل إليه من أسفل الصفحة (الأصل ٤ مم): اجعله فوق إطارك ورقم الصفحة |

- **الإطار حول النص** (البرواز): `left: calc(var(--t-l) - 6mm); right: calc(var(--t-r) - 6mm);` ثم `.page.content, .page.toc { --mside-clear: 7.5mm; }` فتوضع نصوص الهامش وخاناتها **خارج** الإطار لا عليه. وإطار الصفحة في الأشكال الجاهزة (`design.frame`) يفعل ذلك وحده.
- **إطارٌ يضم الهامش أيضاً** (حول النص والهامش الواسع معاً): `left: calc(var(--t-l) - var(--x-l) - 6mm)` ونظيره، و`--mside-clear` صفر، و`--mside-edge` بُعدُ الإطار عن حافة الورق وسمكُه وفسحة (فالأصل ٥ مم يضع النصوص على الإطار).
- الهامش يسع ما يُكتب فيه ما دام (الهامش − `--mside-clear`) ≥ ٦ مم، **وإلا لم يظهر فيه شيء**.
- **لا تغيّر `left` و`right` لـ`.body` بأرقام ثابتة** (يبطل بها الهامش الواسع)؛ وإن احتجت فبالمتغيرات: `left: var(--t-l)`. ولهوامش أوسع غيّر `settings.page`.
- حالته على `#book`: `om-wide` (واسع) ومعه `om-odd-l` أو `om-odd-r`، و`side-box` (نص الهامش في خانة). مثال: `#book.om-wide .rh { font-size: 9.5pt; }`.
- **خانة الهامش** (`sideNote.box`، أو اختيار المستخدم): `.mside-n.framed` خانةٌ **بقدر ما كُتب فيها**: عرضها أطول سطوره (لا تزيد على الهامش)، وارتفاعها ارتفاعه، ولا تظهر إلا حيث كُتب. أصلها إطار `0.6pt` بلون `--c-rule` وخلفية `var(--paper)`، وشكلها من البطاقة: `border` `border-radius` `background` `box-shadow` `padding` (يُقاس معها)، و`::before` `::after` بموضعٍ مطلق لزخرفة الحواف والزوايا ولسانٍ إلى النص (`.l` في هامش اليسار والنص عن يمينها، `.r` عكسها). ولا تغيّر `width` ولا `left`/`right`/`top` ولا `position` ولا `margin` (يحسبها البرنامج لكل خانة). وصفةٌ في القسم ١٠.
- **لا ترسم خانةً ثابتة بطول الهامش**: ما يُكتب يقع حيث فقرته، فتتراكب عليه. وما ترسمه في الهامش بجانب عنوانٍ (رقم الباب في ترنجة) أخفه في الصفحة التي في هامشها كتابة: `.page.pg-l:has(> .mside-n.l) .x { display: none; }`.

داخل `.flow`:

| العنصر | الصنف |
|---|---|
| العناوين | `h1.h.h1` … `h4.h.h4` (وفي داخلها `<span>` أو قالبك) |
| الفقرة | `p.p` مع `first` (أول الفقرة، لها إزاحة) أو `cont` (تتمة من صفحة سابقة) · `brk` تنكسر إلى الصفحة التالية · `mt` فقرة متن · `sh` فقرة شرح |
| داخل الفقرة | `.m` متن مضمَّن · `.mq` متن فيه آية · `.q` آية · `.qm` متن مقتبس في الشرح · `.ht` عنوان داخل الجملة · `.fr` رقم الحاشية · `.sn` رقم الشرح المرتبط بالمتن · `.h` نص الحديث |
| البيت | `div.verse` فيه `span.hm` لكل شطر و`span.vsep` للفاصل |
| الفاصل الزخرفي | `div.orn` |
| «شرح:» وخطه | `div.shlabel` · `div.shrule` |
| من ملفات Word | `div.fig` وفيه `img` (صورة في مجرى النص؛ `a-c` `a-l` `a-r` محاذاتها) · `table.tbl` (و`bd` إن كان بحدود؛ `th` صف العنوان، `.b` خلية عريضة) · `div.hrule` خط زخرفي · `section.page.file-cover` صفحة غلاف من الملف (صورة `img.fc-img` تملأ الصفحة، بلا رقم) |
| تنسيق المؤلف (ملفات Word) | على الفقرة والعنوان: `a-c` وسط · `a-l` يسار · `a-r` يمين. داخل الفقرة: `.f` ومعها `.fb` عريض · `.fu` مسطّر (واللون على العنصر نفسه). وبيت المتن `div.verse.mt` |
| الحاشية | `div.fn` فيها `span.fnn` الرقم · `div.fnp` فقرة · `div.fnv` بيت · `.fnsep` الخط فوق الحواشي |

الغلاف الداخلي: `.cover-frame > .cover-in > .cv-top(.cv-vol) · .cv-mid(.cv-title .cv-sub .cv-orn .cv-label .cv-author .cv-note .cv-gap .cv-editor) · .cv-bottom`.
الفهرس: `.toc-title .toc-rule .toc-head` ثم `a.toc-e.l1…l4` وفيه `.t` العنوان · `.ld` النقاط · `.n` الرقم.

### القيم الافتراضية التي تُغيَّر كثيراً

```css
.body  { top: <top>mm; bottom: <bottom>mm; left: <side>mm; right: <side>mm; }
.rh    { position: absolute; top: max(top − 10.5, 3)mm; left/right: <side>mm; text-align: center; font-size: 10.5pt; border-bottom: .5pt solid <rule>; }
.folio { position: absolute; left: 0; right: 0; bottom: max(bottom × .4, 3)mm; text-align: center; font-weight: 700; font-size: 15pt; }
.h1    { text-align: center; margin: 7mm 0 5mm; }   .h1::after { خط تحته بعرض 32mm }
.h2    { text-align: center; margin: 5mm 0 3.6mm; } .h3, .h4 { text-align: start; }
.orn   { text-align: center; margin: 2.5mm 0 3.5mm; }
.flow > :first-child { margin-top: 0 !important; }   /* أول عنصر في الصفحة بلا هامش علوي */
.page.extra .body, .page.opener .body { top: 0; bottom: 0; left: 0; right: 0; }   /* الصفحة الخاصة: المساحة كلها لك */
```

### حالة الإعدادات (أصنافٌ على `#book`)

ما اختاره المستخدم أو ثبّته الأسلوب يُكتب أصنافاً على `<main id="book">` **قبل** التوزيع (فيجوز تحتها ما يغيّر ارتفاع النص)، ليتبع تنسيق البطاقة كل خيارٍ يُفعَّل أو يُطفأ (`typeset/engine.js` أوله):

| الصنف | المعنى |
|---|---|
| `w-books` `w-research` `w-mutun` | نوع المعروض |
| `tpl-<template>` | قالب الكتاب: `matn` `matn_sharh` `matn_hashia` `full` `tafsir` `research` |
| `toc-start` `toc-end` `toc-none` · `paper-white` `paper-yellow` · `vlay-<verseLayout>` | موضع الفهرس · لون الورق · وضع الشطرين |
| `no-fn` `no-rh` `no-newpage` `no-orn` `has-frame` `print-ready` `no-cover` `has-bgs` | الحواشي · الترويسة · الأبواب في صفحة جديدة · الزخارف · الإطار · النسخة الجاهزة للطباعة · لا غلاف داخلي · خلفيات صور من المستخدم |
| `hs-pro` | نظام العناوين «التقسيم العلمي» (`.h.hs-part` `.hs-ch` `.hs-h2` `.hs-h3`، و`.page.hs-partpg` صفحة الباب) |
| `om-wide` · `om-odd-l` `om-odd-r` · `side-box` | الهامش الخارجي الواسع · الصفحة الفردية يسرى أو يمنى · نص الهامش في خانة |
| `r-uni` `r-journal` `r-thesis` | قالب البحث |
| `mu-page` `mu-below` `mu-side` · `mu-side-right|left|free` · `mu-col-right|left|outer` | المتون: موضع التعليق · جهة المتن في المقابلة · جهة الهامش بجانبه |
| `mu-rule-<rule>` · `mu-label` `mu-intro` `mu-center` `mu-keep` · `mu-poem` `mu-prose` · `mu-num-<mNum>` `mu-seq-<mSeq>` | سطور الكتابة · للتعليق عنوان · قبل المتن نص · المتن في الوسط · الترتيب ثابت · نوع المتن · أرقام الأبيات |
| `mu-owner` | خانات صاحب النسخة تظهر (ومعها `.page.cover.has-owner`) |

**خانات صاحب النسخة** (`mutunLook.mOwner`): `.cv-owner` وفيه `.cv-of` لكل خانة (`.t` نصها · `.f.f-line|f-dots|f-blank` موضع الكتابة)، لونها `var(--c-h2)` وخطوطها `var(--c-owner-ink)`. في قالب `cover`: `{{#owner}}…{{/owner}}` و`{{^owner}}…{{/owner}}` و`{{ownerBox}}` موضعها (وبغيره تُوضع أسفل الصفحة: `.cv-owner.abs`).
### متغيرات الإعدادات (تتبع ما يختاره المالك والمستخدم)

`--c-text` `--c-h1` `--c-h2` `--c-h3` `--c-h4` `--c-matn` `--c-quran` `--c-orn` `--c-rule` · `--f-body` `--f-heading` `--f-cover` `--f-names` · `--page-w` `--page-h` `--m-top` `--m-bottom` `--m-side` · `--s-body` `--s-note` `--s-h1` … `--s-h4` · `--gutter` هامش التجليد، و`--g-r` `--g-l` ما زيد منه في يمين الصفحة ويسارها (صفر ما لم يُضبط في إعدادات الطباعة) · `--t-l` `--t-r` حافتا النص، و`--x-l` `--x-r` الهامش الواسع، و`--m-in` `--m-out` `--text-w` `--wide`، و`--mside-clear` (القسم ٤: «الهامش الخارجي الواسع»).

اكتب `border-color: var(--c-h1)` بدل لون ثابت، فإذا غيّر المستخدم لون الأبواب تبعه الشكل.

---

## ٥) القوالب (`templates/<key>.html`)

القالب HTML يحلّ محل البناء الافتراضي للعنصر. القيم بين قوسين مزدوجين، وتدخل **نصاً مهرَّباً**.

- `{{key}}` القيمة · `{{#key}}…{{/key}}` يظهر إن وُجدت · `{{^key}}…{{/key}}` يظهر إن غابت.
- الصورة: `<img src="asset(rosette)">` أو في `style`: `background: asset(frame)`.

| المفتاح | العنصر | القيم المتاحة |
|---|---|---|
| `h1` `h2` `h3` `h4` | العنوان بمستواه (يبقى داخل `<h1 class="h h1">`) | `text` النص · `first` أول كلمة · `rest` الباقي · `n` `n_ar` `n_word` رقم العنوان في مستواه (لاتيني · مشرقي · «الأول») · `n1`…`n4` و`n1_ar`…`n4_ar` عدّادات المستويات كلها · `level` |
| `folio` | رقم الصفحة (داخل `.folio`) | `n` `n_ar` `n_word` رقم الصفحة · `total` `total_ar` عدد الصفحات · `chapter` `section` الباب والفصل الجاريان · بيانات الكتاب |
| `rh` | الترويسة (داخل `.rh`) | ما في `folio` + `text` (النص الافتراضي: اسم الكتاب في الزوجية، والباب أو الفصل في الفردية) |
| `page` | طبقة `.deco` خلف النص في كل صفحة متن وفهرس | ما في `folio` |
| `cover` | الغلاف الداخلي كله (داخل `.body` لصفحة الغلاف) | بيانات الكتاب + `ornament` · `owner` (خانات صاحب النسخة تظهر) · `ownerBox` موضعها |
| `chapterPage` | صفحة فاصلة كاملة لكل باب، ونصه يبدأ في الصفحة التالية | ما في `h1` |
| `ornament` | الفاصل الزخرفي (داخل `.orn`) | `ornament` |
| `tocHead` | رأس الفهرس (بدل العنوان والخط وسطر «الموضوع/الصفحة») | `text` عنوان الفهرس + بيانات الكتاب |

**بيانات الكتاب**: `title` `subtitle` `author` `authorLabel` `authorNote` `editor` `editorLabel` `edition` `publisher` `volLabel` (`authorLabel` و`editorLabel` فارغان إلا أن يأتي بهما الكتاب؛ والغلاف الافتراضي يكتب «تأليف» و«تحقيق»).

مفتاح غير معروف يُتجاهل. وما لا يغطيه قالب يُصنع بالكود (القسم ١١).

## ٦) الصفحات الخاصة (`pages`)

`{ "file": "basmala.html", "at": "afterCover", "name": "basmala", "folio": false }`

| `at` | الموضع |
|---|---|
| `start` | أول الكتاب، قبل الغلاف الداخلي (صفحة العنوان المختصر) |
| `afterCover` | بعد الغلاف الداخلي |
| `beforeContent` | قبل أول المتن (بعد الفهرس إن كان في البداية) |
| `afterContent` | بعد آخر المتن |
| `end` | آخر الكتاب |

- الصفحة تأخذ الصنف `x-<name>` و`extra`، ومنطقة النص فيها الصفحة كلها. نسّقها بـ`.page.x-<name>`.
- تدخل في عدّ الصفحات دائماً. `folio: true` يُظهر رقمها.
- قيمها: بيانات الكتاب + `ornament`. فتُكتب مرة وتعمل لكل كتاب.
- النسخة المعتادة بلا صفحة بيضاء بعد الغلاف الداخلي. والصفحات البيضاء وصفحة العنوان المختصر والبسملة من شأن «النسخة الجاهزة للطباعة» (`printReady`)، وتسلسلها في إعداد الطباعة الآتي.

### إعداد الطباعة (`print`) — اختياري

ما يسبق الكتاب ويلحقه في «النسخة الجاهزة للطباعة» (`settings.printReady`) له إعداد عام في الموقع يضبطه المالك من «أساليب دور النشر ← إعدادات الطباعة». وللبطاقة أن تحمل إعداداً **خاصاً بها** في المفتاح `print` (في `style.json`، وفي ملف البطاقة بجانب `settings`)، فيتقدم على إعداد الموقع ما دام الأسلوب مختاراً. بلا `print` يتبع الأسلوب إعداد الموقع.

```json
"print": {
  "front": ["blank", "half", "blank", "cover", "blank", "basmala", "blank"],
  "back":  [ { "type": "text", "text": "تم بحمد الله", "sizePt": 20 } ],
  "half":    { "pos": "bl", "titlePt": 24, "subPt": 17, "showSub": true, "showAuthor": false, "color": "", "subColor": "" },
  "basmala": { "widthPct": 62, "yPct": 44, "color": "" },
  "numbering": "count", "gutterMm": 0, "padTo": 0
}
```

| المفتاح | المعنى |
|---|---|
| `front` | صفحات ما قبل الكتاب بالترتيب (حتى ٢٤). كل عنصر اسم نوع، أو كائن `{ "type": … }`. الأنواع: `blank` بيضاء · `half` العنوان المختصر · `cover` الغلاف الداخلي (واحد دائماً: إن غاب أُضيف آخراً) · `basmala` البسملة · `text` صفحة نص · `image` صفحة صورة |
| `back` | صفحات ما بعد الكتاب (حتى ١٢): `blank` `text` `image` |
| صفحة `text` | `v`: `top` `middle` `bottom` موضع النص في الصفحة · `lineHeight` ١–٣ · `paras`: الفقرات (حتى ٨٠)، كل فقرة `{ "align": "center" \| "start" \| "end" \| "justify", "runs": [ … ] }`، وكل جزء من نصها `{ "t": "النص", "b": true, "sizePt": 8–72, "font": …, "color": "#RRGGBB" أو "" }`. `font`: دور من خطوط الأسلوب `heading` `body` `cover` `names`، أو اسم خط من خطوط الموقع. في النص: `{{title}}` `{{author}}` `{{publisher}}` `{{edition}}`…. **والصورة فقرة** (حتى ٨ في الصفحة): `{ "align": "center" \| "start" \| "end", "img": { "src": "data:image/png;base64,…" أو jpeg, "w": عرضها بالبكسل, "h": ارتفاعها }, "widthPct": 5–100, "free": null }` في سطرها بين الفقرات وعرضها من عرض النص؛ أو `"free": { "xPct": 0–100, "yPct": 0–100 }` حرّة: وسطها عند هذا الموضع من الصفحة (من يسارها وأعلاها) وعرضها من عرض الصفحة. **الصيغة المختصرة** تُقبل أيضاً: `text` (كل سطر فقرة) مع `sizePt` `align` `font` `bold` `color` للنص كله |
| صفحة `image` | `src` صورة PNG أو JPEG مضمّنة (`data:image/…;base64,…`) مع `w` و`h` بالبكسل · `fit`: `contain` في موضعها أو `page` تملأ الصفحة · `widthPct` ١٠–١٠٠ · `yPct` ١٠–٩٠ |
| `half` | العنوان المختصر: `pos` الموضع `bl` أسفل اليسار · `br` · `tl` · `tr` · `c` الوسط · `titlePt` ١٠–٧٢ · `subPt` ٨–٤٨ · `showSub` · `showAuthor` · `color` · `subColor` (فارغ = الافتراضي) |
| `basmala` | `widthPct` عرضها من عرض الصفحة ٢٠–١٠٠ · `yPct` موضع وسطها من أعلى الصفحة ١٥–٨٥ · `color` لونها الافتراضي (يتقدم عليه `settings.basmalaColor`) |
| `numbering` | `count`: صفحات ما قبل الكتاب تدخل في العد (بلا رقم مطبوع) · `book`: أول صفحة في الكتاب رقمها ١ |
| `gutterMm` | هامش التجليد ٠–٢٥: يُزاد جهة الكعب (يمين الفردية، يسار الزوجية) وعرض النص ثابت |
| `padTo` | إتمام عدد صفحات الملف إلى مضاعف `2` `4` `8` `16` `32` بصفحات بيضاء في آخره (`0` بلا إتمام) |

- صفحات البطاقة الخاصة (القسم ٦) تبقى في مواضعها: `start` قبل التسلسل كله، و`afterCover` بعد الغلاف الداخلي مباشرة حيثما وُضع.
- كل صفحات التسلسل بلا أرقام. أصنافها: `.page.blank` · `.page.front-half` (`.ht-box` `.ht-title` `.ht-sub` `.ht-author`) · `.page.front-basmala` (`.bsm-wrap` `.bsm-img` `.bsm-text`) · `.page.front-text` (`.ft-wrap` `.ft-text` · `.ft-img` صورة في سطرها · `img.ft-free` صورة حرّة) · `.page.front-image` (`.fi-wrap` `.fi-img` أو `.fi-full`).
- صورة البسملة نفسها ليست في البطاقة: هي من مكتبة صور البسملة في الموقع، يختارها المستخدم، وللأسلوب أن يسمّي إحداها في `settings.basmalaId`.
- مع هامش التجليد: المتغير `--gutter` مقداره، و`--g-r` و`--g-l` ما زيد في يمين هذه الصفحة ويسارها. من وضع عنصراً بمحاذاة النص فليكتب `left: var(--t-l)` (وفيه التجليد والهامش الواسع معاً).
- `odd` / `even` تتبعان **موضع الصفحة الفعلي** في الملف (وبه يُعرف الكعب)، و`data-n` الرقم المطبوع. يختلفان حين يبدأ الكتاب من ١ بعد عدد فردي من الصفحات.

## ٧) الخانات الجاهزة (`slots`)

اختصار لأكثر ما يُطلب، بلا CSS: `coverBg` خلفية الغلاف الداخلي · `pageBg` خلفية صفحات المتن والفهرس · `h1Ornament` زخرفة تحت عناوين الأبواب (`h1OrnamentMm` ارتفاعها) · `separator` فاصل مرسوم بدل الرموز (`separatorMm`). القيمة اسم صورة من `images`.

## ٨) الخطوط

- `fonts` في `style.json`: `weight` هو `400` (طبيعي) أو `700` (عريض) أو `all` (ملف واحد لكل الأوزان).
- عند التركيب يدخل الخط مكتبة خطوط الموقع، فيظهر في قوائم الكتاب والغلاف. خط موجود بالاسم والوزن نفسه لا يُستبدل.
- يُستعمل في `settings.fonts` باسمه، أو في CSS: `font-family: 'Katibeh', var(--f-heading)`. أي خط من خطوط الموقع يُذكر اسمه في CSS أو القوالب يُحمَّل في المستند تلقائياً.
- عند تنزيل البطاقة من الموقع تسافر معها الخطوط المرفوعة التي يستعملها الأسلوب.

---

## ٩) القاعدة التي لا تُخالَف: ما يُقاس وما لا يُقاس

المحرك يوزّع النص على الصفحات **ثم** يرقّمها. فعند التوزيع:
- CSS البطاقة كله مطبَّق: غيّر أحجام العناوين وهوامشها وأشكالها كما تشاء، والتوزيع يحسبها.
- لكن `odd` / `even` / `pg-l` / `pg-r` / `opens` و`.deco` ومحتوى `.rh` و`.folio` ونصوص الهامش (`.mside-n`) تُضاف **بعد** التوزيع.

فما يُكتب تحت `.page.odd` أو `.page.even` أو `.page.pg-l` أو `.page.pg-r` أو `.page.opens` (أو `:has(.mside-n)`) يجوز أن يغيّر: المواضع، الخلفيات، الألوان، ما هو خارج `.body`، وإزاحة `.body` يميناً ويساراً **بعرض ثابت**. ولا يجوز أن يغيّر ارتفاع النص: عرض `.body`، حجم الخط، هوامش عناصر `.flow`. وإلا خرج النص من الصفحة.

ولأن أول عنصر في الصفحة يُصفَّر هامشه العلوي، فإنزال عنوان الباب عن رأس الصفحة يكون بـ`padding-top` على `.h1` لا بـ`margin-top`.

### وما يصير في PDF صورةً نقطية

Chromium يحوّل عند صنع PDF هذه **صورةً نقطية بدقة ٧٢ نقطة في البوصة** (تظهر مشوّشة في الطباعة): الخلفية المكرّرة (`repeat` `repeat-x` `repeat-y` `space` `round`) إن كانت صورة **SVG** أو تدرّجاً بـ`background-size` (أما PNG وJPEG فتبقى بدقتها هي)، والتدرّج الدائري المكرَّر، وطبقتا تدرّجٍ مكرَّرتان في عنصرٍ واحد، و`<pattern>` في SVG (صورةً أو داخل القالب). **وكل تدرّجٍ متكرر (ومعه `mask-image`) يُرمَّز «تظليلاً» من نوع ShadingType-1: متجهٌ اسمه، لكن كثيراً من القرّاء — ومنها قارئ البرنامج المبنيّ على pdf.js — يرسمه شكلاً خاطئاً (شريطاً مموّهاً) أو لا يرسمه؛ فلا تُبنَ عليه نقاطٌ ولا خطوطٌ لا بدّ من ظهورها.** وتبقى خطوطاً حادة: صورة SVG بلا تكرار (`100% 100% no-repeat`) والتكرار داخلها بـ`<use>` · `<img>` · الحدود (`border` المنقّطة والصلبة) والعناصر الحقيقية. وللتحقق: `pdfimages -list` لا يرى ما داخل الأنماط؛ افتح الملف بمكبّر أو افحص كائنات `/Shading` و`/Pattern` فيه.

## ١٠) وصفات

**الباب داخل خانة برقمه** — `templates/h1.html`:
```html
<div class="bab"><span class="bab-n"><small>الباب</small><b>{{n_ar}}</b></span><span class="bab-t">{{text}}</span></div>
```
```css
.h1::after { display: none; }
.bab { display: flex; border: 1.2pt solid var(--c-h1); border-radius: 2.5mm; overflow: hidden; }
.bab-n { width: 21mm; background: var(--c-h1); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.bab-t { flex: 1; display: flex; align-items: center; justify-content: center; }
```

**رقم الصفحة في الأعلى، في الطرف الخارجي**:
```css
.folio { top: 9.5mm; bottom: auto; left: auto; right: auto; width: auto; }
.page.pg-l .folio { left: 13mm; }
.page.pg-r .folio { right: 13mm; }
```

**إطار وزخرفة جانبية** — `templates/page.html`: `<div class="side"></div>`
```css
.page.content, .page.toc { background: asset(frame) center/100% 100% no-repeat #fff; }
.side { position: absolute; top: 36mm; bottom: 36mm; width: 5mm; background: asset(band) center top/100% auto repeat-y; }   /* band صورة PNG؛ ولو كانت SVG لصارت مكرّرةً صورةً نقطية (القسم ٩) */
.page.pg-l .side { left: 7mm; }   .page.pg-r .side { right: 7mm; }
```
(مع الهامش الواسع يقع الشريط في الهامش الذي يُكتب فيه: فاجعله أرفع، أو اكتب `#book.om-wide .side { display: none; }`.)

**هامش تجليد** (الداخلي أعرض، والعرض ثابت) — والأولى `gutterMm` في إعدادات الطباعة، أو `outerMargin` للهامش الخارجي الواسع:
```css
.page .body, .page .rh { left: var(--t-l); right: calc(var(--t-r) + 6mm); }              /* الأصل (قبل الترقيم) كاليسرى */
.page.pg-r .body, .page.pg-r .rh { left: calc(var(--t-l) + 6mm); right: var(--t-r); }    /* اليمنى: العرض نفسه */
```

**إطار حول النص وخانات الهامش خارجه** (مع الهامش الواسع أو بدونه):
```css
.page.content::before, .page.toc::before { content: ''; position: absolute; pointer-events: none;
  top: calc(var(--m-top) - 8mm); bottom: calc(var(--m-bottom) - 3mm);
  left: calc(var(--t-l) - 5mm); right: calc(var(--t-r) - 5mm); border: 1.6pt double var(--c-rule); }
.page.content, .page.toc { --mside-clear: 6.5mm; }   /* بُعد الإطار عن النص + سمكه + فسحة */
```

**ترويسة تختلف بين الصفحتين** — `templates/rh.html`:
```html
<span class="rh-book">{{title}}</span><span class="rh-chap">{{chapter}}</span>
```
```css
.page.odd .rh-book, .page.even .rh-chap { display: none; }
```

**صفحة فاصلة لكل باب** — `templates/chapterPage.html`:
```html
<div class="op"><div class="op-n">الباب {{n_word}}</div><div class="op-t">{{text}}</div></div>
```
```css
.page.opener { background: asset(frame) center/100% 100% no-repeat; }
.op { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
```

**إنزال عنوان الباب إلى ثلث الصفحة**: `.h1 { padding-top: 40mm; }`

**«صفحة ٥ من ٢٠٠»** — `templates/folio.html`: `{{n_ar}} / {{total_ar}}`

---

## ١١) برنامج الأسلوب (`script.js`)

كود JavaScript يعمل **داخل مستند التنضيد قبل أن يبدأ المحرك**. يستلم كائناً واحداً اسمه `W`، يسجّل فيه دواله، ثم يستدعيها المحرك في مواضعها. بهذا تغيّر البطاقة **آلية** التنضيد لا شكله فقط.

```js
// script.js — W متاح مباشرة، والملف كله يعمل في الوضع الصارم
W.on('page', (p) => { if (p.kind === 'content') p.flow.classList.add('cols'); });
W.set('used', (p, def) => { /* كم شُغل من الصفحة؟ */ return def(); });
```

### ما في `W`

| | |
|---|---|
| `W.doc` | الكتاب بعد تحليله: `blocks` العناصر بترتيبها · `notes` الحواشي · `headings` العناوين |
| `W.settings` · `W.cover` | الإعدادات الكاملة · بيانات الكتاب (`title` `author` …) |
| `W.MM` | عدد البكسلات في المليمتر · `W.ar(n)` أرقام مشرقية · `W.ordinal(n)` «الأول» · `W.esc(s)` · `W.fill(قالب, قيم)` |
| `W.on(حدث, دالة)` | يسجّل دالة تُستدعى عند الحدث (يجوز أكثر من دالة) |
| `W.set(اسم, دالة)` | يستبدل جزءاً من المحرك |
| `W.engine` | أدوات المحرك نفسها (أدناه) |
| `W.warn(نص)` | يسجّل تنبيهاً يظهر في المعاينة وفي ناتج `--pdf` |

### الأحداث — `W.on`

| الحدث | متى | ما يصل الدالة | يُستعمل لـ |
|---|---|---|---|
| `doc` | قبل توزيع أول عنصر | `(doc)` | إعادة تصنيف العناصر، إضافة عناصر أو حذفها، إضافة نوع عنصر جديد |
| `page` | عند إنشاء كل صفحة، قبل أن يدخلها شيء | `(page)` | تغيير هيكل الصفحة: أصناف، مناطق، عناصر ثابتة. **يُقاس** |
| `para` | عند بناء كل قطعة فقرة، قبل قياسها | `(el, block, a, b)` | تعديل عنصر الفقرة. يُستدعى كثيراً (مع كل محاولة قياس): اجعله خفيفاً وثابت النتيجة |
| `note` | عند بناء كل حاشية، قبل قياسها | `(el, id, a, b)` | تعديل عنصر الحاشية |
| `block` | عند بناء عنوان أو بيت أو فاصل أو «شرح:»، قبل وضعه | `(el, block)` | تعديل العنصر. **يُقاس** |
| `order` | بعد التوزيع وقبل الترقيم | `(pages)` مصفوفة تُعدَّل في مكانها | إعادة ترتيب الصفحات، إدراج صفحات صنعها الكود |
| `pageDone` | بعد ترقيم كل صفحة ووضع ترويستها ورقمها | `(page, info)` | ما يعتمد على رقم الصفحة أو الباب الجاري. `info`: `n` `n_ar` `total` `chapter` `section` + بيانات الكتاب |
| `done` | آخر شيء، قبل إعلان الاكتمال | `({ pages, contentPages, tocPages, headingPages })` | لمسات أخيرة على الكتاب كله. تجوز `async` ويُنتظر اكتمالها |

### البدائل — `W.set`

الدالة تستلم معطياتها، ثم `def` آخراً: دالة تعيد جواب المحرك الافتراضي. إن أعادت الدالة `undefined` أُخذ الافتراضي.

| الاسم | السؤال الذي يجيب عنه | التوقيع | الافتراضي |
|---|---|---|---|
| `used` | كم شُغل من ارتفاع هذه الصفحة؟ (بالبكسل) | `(page, def)` | ارتفاع `.flow` + ارتفاع الحواشي. أعد `Infinity` لتقول «ممتلئة» |
| `capacity` | كم تسع هذه الصفحة؟ | `(page, def)` | ارتفاع منطقة النص. يصلح لصفحات تختلف مساحتها (أول الباب مثلاً) |
| `lines` | كم سطراً في هذا العنصر؟ | `(el, def)` | ارتفاعه ÷ ارتفاع السطر. يلزم تغييره إن انقسم العنصر على أعمدة |
| `place` | هل تتولى وضع هذا العنصر؟ | `(block, def)` | `false`. أعد `true` بعد أن تضعه بنفسك بأدوات `W.engine` |

المحرك يملأ الصفحة بتجربة «أضف، ثم اسأل: هل تسع؟» ويبحث ثنائياً عن أكبر قدر يسع. فتغيير جواب `used` وحده يكفي لمنطق توزيع جديد (كالعمودين)، ما دام الجواب **مطّرداً**: كلما زاد المحتوى لم ينقص.

### أدوات المحرك — `W.engine`

`makePage(kind)` صفحة جديدة · `newBodyPage()` صفحة متن جديدة تصير الحالية (وتنتقل إليها بقايا الحواشي) · `placePara(block)` يوزّع فقرة على الصفحات بحواشيها · `placeAtomic(el, reserve)` يضع عنصراً لا ينقسم (وينقله للصفحة التالية إن لم يسع) · `headingEl(block)` · `fits(page, reserve)` · `used(page)` · `pageEmpty(page)` · `cur` الصفحة الحالية · `pages` · `lineHeight` · `bodyHeight`.

### الصفحة والعناصر

الصفحة: `{ el, flow, notes, kind, number, headings }` — `el` هو `section.page`، و`flow` و`notes` منطقتا النص والحواشي فيه (القسم ٤).

أنواع العناصر في `doc.blocks`:

| `type` | حقوله |
|---|---|
| `heading` | `level` `text` `id` · `al` محاذاة المؤلف (`c` `l` `r`) · `nt` خارج فهرس الملف |
| `para` | `runs` (قطع النص بأصنافها؛ `k: 'f'` نص بتنسيق المؤلف: `b` `u` `c`) · `mt` فقرة متن · `sh` فقرة شرح · `al` محاذاة المؤلف · `breakBefore` تبدأ صفحة جديدة |
| `verse` | `parts` (الشطران) · `poem` رقم القصيدة · `mt` بيت متن |
| `label` | `text` («شرح:») · `strong` |
| `rule` · `ornament` · `hr` | — |
| `image` | (من ملف Word) `src` · `w` `h` مقاسها · `wPct` عرضها من عرض السطر · `al` |
| `table` | (من ملف Word) `rows`: `[{ hdr, cells: [{ t, b, al, span, rs, skip, bg }] }]` · `cols` نسب الأعمدة · `rtl` · `borders` |
| `coverpage` | (من ملف Word) صورة تملأ صفحة مستقلة: `src` `w` `h` |

ومع فهرس ملف Word: `doc.fileToc` و`doc.tocTitle` (عنوان الفهرس كما في الملف).

نوع جديد: أضفه في `doc` وضعه في `place`:
```js
W.on('doc', (doc) => doc.blocks.splice(1, 0, { type: 'x-box', text: 'تنبيه' }));
W.set('place', (b) => {
  if (b.type !== 'x-box') return false;
  const el = document.createElement('div');
  el.className = 'x-box';
  el.textContent = b.text;
  W.engine.placeAtomic(el);
  return true;
});
```

### قواعده

1. **ما يغيّر الحجم يكون قبل القياس**: في `doc` و`page` و`para` و`note` و`block`. أما `pageDone` و`done` فللذي لا يغيّر ارتفاع النص، أو يتحقق بنفسه أنه ما زال يسع (كما يفعل مثال العمودين عند الموازنة).
2. **خطأ في الكود لا يوقف التنضيد**: يُسجَّل تنبيهاً يبدأ بـ`script:` ويكمل المحرك عمله الافتراضي. يظهر في المعاينة («خطأ في برنامج الأسلوب») وفي محرر الأسلوب بنصه، وفي ناتج `--pdf`.
3. **النتيجة ثابتة**: الكود نفسه على الكتاب نفسه يعطي الصفحات نفسها. لا وقت ولا عشوائية.
4. **الحلقة التي لا تنتهي** توقف التنضيد حتى تنتهي مهلته. تحقق بـ`--pdf` قبل التسليم.
5. الكود يعمل في المعاينة وفي PDF كما هو، فما يُرى في المعاينة هو ما يخرج.

### مثالان

**تعليم فقرات الشرح** (من `frames`): في كتب «متن ثم شرح:» لا تحمل فقرات الشرح علامة، فيعلّمها الكود ليبروزها CSS.
```js
W.on('doc', (doc) => {
  let sharh = false;
  for (const b of doc.blocks) {
    if (b.type === 'label') sharh = true;
    else if (b.type === 'heading' || b.type === 'ornament' || (b.type === 'para' && b.mt)) sharh = false;
    else if (b.type === 'para' && sharh) b.sh = true;   // ← تأخذ الصنف ‎.sh
  }
});
```

**عمودان** (من `columns`): `style.css` يجعل `.flow.cols` عمودين، والكود يجيب المحرك: الصفحة ممتلئة إذا فاض النص إلى عمود ثالث.
```js
const E = W.engine, GAP = 2.2 * W.MM;
const notesOf = (p) => (p.notes.childElementCount > 1 ? p.notes.getBoundingClientRect().height + GAP : 0);
W.on('page', (p) => { if (p.kind === 'content') p.flow.classList.add('cols'); });
W.set('used', (p, def) => {
  if (!p.flow.classList.contains('cols')) return def();
  const notes = notesOf(p);
  p.flow.style.height = Math.max(E.bodyHeight - notes, E.lineHeight) + 'px';
  if (p.flow.scrollWidth > p.flow.clientWidth + 1) return Infinity;
  const last = p.flow.lastElementChild;
  if (!last) return notes;
  const box = p.flow.getBoundingClientRect(), rs = last.getClientRects(), r = rs[rs.length - 1];
  return notes + (r.left < box.left + box.width / 2 - 1 ? r.bottom - box.top : 0);
});
W.set('lines', (el) => { let h = 0; for (const r of el.getClientRects()) h += r.height; return Math.round(h / E.lineHeight); });
```

**خانات تضم فقرات متتالية بلا كود** (من `frames`): الخانة تُرسم بحدود الفقرات نفسها، فتُقاس مع النص.
```css
.p.mt { padding: 0 3.5mm; border-inline: .8pt solid #C2185B; background: #fdf3f7; }
.p.mt:not(.p.mt + .p.mt):not(.cont) { border-top: .8pt solid #C2185B; padding-top: 1.6mm; margin-top: 2.4mm; }   /* أول الخانة */
.p.mt:not(:has(+ .p.mt)):not(.brk)  { border-bottom: .8pt solid #C2185B; padding-bottom: 1.6mm; margin-bottom: 2.4mm; } /* آخرها */
.notes:has(.fn) { border: .8pt solid var(--c-rule); padding: 1.6mm 3mm; }   /* الحاشية في خانة */
```

---

## ١٢) الأمان

- **القوالب و CSS والصور** تُنقّى في الخادم عند التركيب وعند كل تنضيد: تُحذف `script` و`style` و`iframe` و`object` والنماذج، ومعالجات الأحداث `on…=`، و`javascript:`، وكل رابط خارجي. المسموح: صور مضمّنة `data:image/…`، و`asset(اسم)`، ومراجع داخلية `#id`. ونصوص الكتاب تدخل القوالب نصاً لا وسوماً.
- **الكود** (`script`) لا يُنقّى، بل يُعزل حيث يعمل:
  - بطاقة فيها كود لا تُركَّب إلا **بموافقة المالك الصريحة** (نافذة تسأله). ويستطيع قراءة الكود وتعطيله من المحرر («تشغيل البرنامج»).
  - في **PDF**: يعمل داخل مستند الطباعة في Chromium بلا واجهة، وكل اتصال بالشبكة مقطوع من المتصفح نفسه ومن سياسة المستند.
  - في **المعاينة**: يعمل في إطار معزول (`sandbox`) لا أصل له، فلا يصل إلى الموقع ولا إلى جلسة المالك أو المستخدم ولا إلى ملفات تعريف الارتباط.
  - الكود لا يُرسل ضمن قائمة الأساليب العامة.
- مستند الطباعة يحمل `Content-Security-Policy` لا تسمح إلا بمحرك التنضيد وبرنامج الأسلوب.

## ١٣) التحقق قبل التسليم

1. `node scripts/make-card.mjs <المجلد> --out x.warraq.json --pdf check.pdf` بلا أي `⚠` وبلا «تنبيهات التنضيد» (أخطاء الكود تظهر هناك بـ`script:`). ومع الكود: جرّب أيضاً `--book` على كتاب حقيقي.
2. افتح `check.pdf`: الغلاف، صفحة فردية وزوجية متقابلتان، بداية باب، صفحة فيها حواشٍ، الفهرس.
3. لا صورة نقطية غير مقصودة: كبّر الـPDF على الإطار والزخارف (القسم ٩)، ومع الهامش الواسع ونصوصٍ في الهامش بخانتها وبدونها (`outerMargin`، `sideNote.box`).
4. في الموقع: اسحب البطاقة إلى الخانة، افتحها في المحرر، وقلّب اللوحات الست.

## ١٤) متى يُحدَّث الموقع

- لملف **Word**: ما يتجاوز الإعدادات يحتاج تعديل `lib/docx.js`.
- إن احتاج كودُ بطاقة موضعاً في المحرك لا حدث له ولا بديل: يُضاف الحدث أو البديل في `typeset/engine.js`، ويُرفع `CARD_VERSION`، ويُكتب هنا. البطاقات القديمة تبقى تعمل، والبطاقة الأحدث من الموقع تُرفض برسالة «حدّث الموقع ثم ركّبها».

المواضع في الشيفرة: `lib/styles.js` (`TEMPLATE_KEYS` · `PAGE_AT` · `cleanExtras` · `extrasFor` · `importCard`) · `typeset/engine.js` (`TPL` · `XPAGES` · `OPTS` · `fill` · `HOOKS` · `OVER` · `window.Warraq`) · `lib/book-html.js` (الأنماط الأساسية والمتغيرات و CSP وإدراج الكود) · `public/js/preview.js` (الإطار المعزول).
