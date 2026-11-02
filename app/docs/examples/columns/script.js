// برنامج أسلوب «الموسوعي»: توزيع النص على عمودين.
// المحرك يسأل عن كل محاولة «كم شُغل من الصفحة؟»، وهذا البرنامج يجيب بمنطق العمودين:
// ارتفاع العمودين = ارتفاع منطقة النص ناقص الحواشي، والصفحة ممتلئة إذا فاض النص إلى عمود ثالث.
const E = W.engine;
const GAP = 2.2 * W.MM; // بين آخر النص وخط الحواشي

W.on('page', (p) => {
  if (p.kind === 'content') p.flow.classList.add('cols');
});

// ارتفاع الحواشي (مع الفاصل)، وما يبقى للعمودين
const notesOf = (p) => (p.notes.childElementCount > 1 ? p.notes.getBoundingClientRect().height + GAP : 0);
const roomOf = (p) => Math.max(E.bodyHeight - notesOf(p), E.lineHeight);

W.set('used', (p, def) => {
  if (!p.flow.classList.contains('cols')) return def();
  const notes = notesOf(p);
  const room = roomOf(p);
  p.flow.style.height = room + 'px';
  if (p.flow.scrollWidth > p.flow.clientWidth + 1) return Infinity; // فاض إلى عمود ثالث
  const last = p.flow.lastElementChild;
  if (!last) return notes;
  // ما دام آخر النص في العمود الأول (الأيمن) فالعمود الثاني كله متاح
  const box = p.flow.getBoundingClientRect();
  const rects = last.getClientRects();
  const r = rects[rects.length - 1];
  const second = r.left < box.left + box.width / 2 - 1;
  return notes + (second ? r.bottom - box.top : 0);
});

// الفقرة قد تنقسم بين العمودين: أسطرها مجموع أسطر قطعتيها
W.set('lines', (el) => {
  let h = 0;
  for (const r of el.getClientRects()) h += r.height;
  return Math.round(h / E.lineHeight);
});

// بعد اكتمال التوزيع: يتوازن العمودان في الصفحات غير الممتلئة (آخر الباب مثلاً) بدل أن يبقى الثاني فارغاً
W.on('done', (r) => {
  for (const p of r.contentPages) {
    if (!p.flow.classList.contains('cols')) continue;
    const room = roomOf(p);
    p.flow.style.height = 'auto';
    p.flow.style.columnFill = 'balance';
    // الموازنة قد تزيد الارتفاع سطراً في صفحة ممتلئة: عندها تبقى الصفحة كما وُزّعت
    if (p.flow.getBoundingClientRect().height > room + 0.5) {
      p.flow.style.height = room + 'px';
      p.flow.style.columnFill = 'auto';
    }
  }
});
