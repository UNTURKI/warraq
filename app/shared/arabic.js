// أدوات عربية مشتركة بين المتصفح (Web Worker) والخادم
// Shared Arabic text utilities (browser + Node, no dependencies)

const EAST = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** تحويل الأرقام الغربية إلى أرقام عربية مشرقية (١، ٢، ٣) */
export function toArabicDigits(v) {
  return String(v).replace(/[0-9]/g, (d) => EAST[+d]);
}

/** تحويل الأرقام المشرقية (والفارسية) إلى غربية لأغراض الحساب */
export function toLatinDigits(v) {
  return String(v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** تطبيع النص العربي للمطابقة السريعة: حذف التشكيل والتطويل وتوحيد الهمزات والياء والتاء المربوطة */
export function normalizeArabic(s) {
  return String(s || '')
    .replace(DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** جذع خفيف للكلمة: حذف السوابق (ال، و، ب، ل، ف، ك) واللواحق الشائعة (ون، ين، ات، ان، ية، ة، ه، ي) */
export function lightStem(w) {
  let x = normalizeArabic(w);
  x = x.replace(/^(وال|بال|فال|كال|لل|ال|و|ف|ب)(?=.{3,})/, '');
  x = x.replace(/(يات|يه|ون|ين|ات|ان|ها|ه|ي)$/, (m) => (x.length - m.length >= 3 ? '' : m));
  return x;
}

/** درجة تشابه بسيطة بين الاستعلام والعنوان (0..1) تعتمد على تطابق الكلمات والبادئات */
export function matchScore(query, title) {
  const q = normalizeArabic(query).split(' ').filter(Boolean);
  const t = normalizeArabic(title);
  if (!q.length || !t) return 0;
  const tw = t.split(' ');
  let hit = 0;
  for (const w of q) {
    const bare = w.replace(/^ال/, '');
    if (tw.includes(w)) hit += 1;
    else if (tw.some((x) => x.replace(/^ال/, '') === bare)) hit += 0.9;
    else if (tw.some((x) => x.startsWith(w) || x.replace(/^ال/, '').startsWith(bare))) hit += 0.6;
    else if (t.includes(bare)) hit += 0.4;
    else if (lightStem(w).length >= 3 && tw.some((x) => lightStem(x) === lightStem(w))) hit += 0.7;
  }
  let score = hit / q.length;
  if (t.startsWith(normalizeArabic(query))) score += 0.25;
  if (t === normalizeArabic(query)) score += 0.5;
  return score;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ORDINALS = [
  '', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر',
  'الثامن عشر', 'التاسع عشر', 'العشرون',
];

/** اسم المجلد: «الجزء الأول» أو «المقدمة» */
export function volumeLabel(vol) {
  const n = parseInt(toLatinDigits(vol), 10);
  if (String(n) === toLatinDigits(vol).trim()) {
    return 'الجزء ' + (ORDINALS[n] || toArabicDigits(n));
  }
  return String(vol);
}

/**
 * سطر «شرح» وحده: الكلمة (أو «الشرح») بلا شيء معها إلا علامات تحيط بها، كالقوسين «(شرح)» و«[الشرح]»
 * والتنصيص «"شرح"» والشرطات «ـ شرح ـ» والنجوم والنقطتين «شرح:». ما قبله متن وما بعده شرح.
 * (علامات العناوين الداخلية \u0001…\u0002…\u0003 تُنزع أولاً.)
 */
export function isSharhLabel(s) {
  const raw = String(s || '');
  if (raw.length > 48) return false;
  const t = raw
    .replace(/\u0001\d?\u0002?|\u0002|\u0003/g, ' ')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
  return /^(?:ال)?شرح$/.test(t);
}
