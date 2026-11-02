/* ضبط الأبيات بالكشيدة (التطويل) — خوارزمية محلية
 * تجعل أشطر القصيدة بعرض واحد: الشطر الأقصر يُمدّ بالتطويل «ـ» في مواضعه الصحيحة
 * ثم يُستكمل الفرق بتوزيع المسافات بين الكلمات (text-align-last: justify).
 * قواعد مواضع الكشيدة تعتمد على قواعد الاتصال في الكتابة العربية.
 */
(function (root) {
  'use strict';
  // حروف تتصل بما بعدها (ثنائية الاتصال)
  const DUAL = new Set('بتثجحخسشصضطظعغفقكلمنهيئـ');
  // كل الحروف العربية التي تتصل بما قبلها
  const LETTERS = new Set('ابتثجحخدذرزسشصضطظعغفقكلمنهوىيأإآؤئةٱ');
  const ALEFS = new Set('اأإآٱ');
  const isMark = (c) => /[ؐ-ًؚ-ٰٟۖ-ۭ]/.test(c);
  const TATWEEL = 'ـ';

  // أولوية الموضع (الأصغر أفضل)، على نهج قواعد التطويل في المطابع
  function priority(prev, next, nextIsFinal) {
    if ('سشصض'.includes(prev)) return 1;
    if (nextIsFinal && 'هةدذ'.includes(next)) return 2;
    if (nextIsFinal && 'اأإآلكطظ'.includes(next)) return 3;
    if (nextIsFinal && 'رزوؤن'.includes(next)) return 4;
    if (nextIsFinal && 'يىئ'.includes(next)) return 5;
    if (nextIsFinal) return 6;
    return 7;
  }

  /** مواضع الكشيدة الممكنة في كلمة: [{at, p}] حيث at موضع الإدراج (بعد الحرف وحركاته) */
  function wordCandidates(word) {
    const letters = [];
    for (let i = 0; i < word.length; i++) if (!isMark(word[i])) letters.push(i);
    const out = [];
    for (let k = 0; k < letters.length - 1; k++) {
      const i = letters[k];
      const j = letters[k + 1];
      const prev = word[i];
      const next = word[j];
      if (!DUAL.has(prev) || !LETTERS.has(next)) continue;
      if (prev === 'ل' && ALEFS.has(next)) continue; // لا تُكسر «لا»
      if (prev === TATWEEL) continue;
      let at = i + 1;
      while (at < word.length && isMark(word[at])) at++;
      out.push({ at, p: priority(prev, next, k + 1 === letters.length - 1) });
    }
    return out;
  }

  /** إدراج n كشيدة موزعة على الكلمات حسب الأولوية (موضع واحد لكل كلمة ما أمكن) */
  function stretch(text, n, maxPerSlot) {
    if (n <= 0) return text;
    const words = text.split(/(\s+)/);
    const slots = [];
    words.forEach((w, wi) => {
      if (/^\s*$/.test(w)) return;
      // لا تُمدّ لفظ الجلالة
      if (/لله/.test(w.replace(/[\u064B-\u065F\u0670]/g, ''))) return;
      const c = wordCandidates(w);
      if (!c.length) return;
      c.sort((a, b) => a.p - b.p || b.at - a.at);
      slots.push({ wi, at: c[0].at, p: c[0].p, n: 0 });
    });
    if (!slots.length) return text;
    // ترتيب الكلمات: الأعلى أولوية أولاً، ثم التوزيع بالتناوب
    const order = slots.slice().sort((a, b) => a.p - b.p);
    let left = n;
    const cap = maxPerSlot || 6;
    let guard = 0;
    while (left > 0 && guard++ < 1000) {
      let placed = false;
      for (const s of order) {
        if (left <= 0) break;
        if (s.n >= cap) continue;
        s.n++;
        left--;
        placed = true;
      }
      if (!placed) break;
    }
    for (const s of slots) {
      if (!s.n) continue;
      const w = words[s.wi];
      words[s.wi] = w.slice(0, s.at) + TATWEEL.repeat(s.n) + w.slice(s.at);
    }
    return words.join('');
  }

  root.WarraqKashida = { wordCandidates, stretch, TATWEEL };
})(typeof window !== 'undefined' ? window : globalThis);
