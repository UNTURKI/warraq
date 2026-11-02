// اختبارات «مصادر المعرفة»: مصادر العلم (الدرر، سِوار) والترجمة (ذكاء اصطناعي، محرك، الاثنان) — بخادمٍ وهميّ محلي
// node app/test/knowledge-tests.mjs
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'warraq-know-'));
process.env.WARRAQ_DATA_DIR = DATA;
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => {
  c ? pass++ : fail++;
  console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`);
};

/* ---- خادمٌ وهمي: الدرر، وسِوار، وذكاءٌ متوافق مع OpenAI، و LibreTranslate ---- */
const seen = [];
const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = '';
  for await (const c of req) body += c;
  seen.push({ p: u.pathname, q: Object.fromEntries(u.searchParams), auth: req.headers.authorization || '', apikey: req.headers.apikey || '', body });
  let m;
  if ((m = /^\/api\/v1\/(\w+)\/search$/.exec(u.pathname))) {
    if (req.headers.authorization !== 'Bearer TOKEN') return send(res, 401, { error: { code: 'token_invalid' } });
    if (m[1] === 'history') return send(res, 403, { error: { code: 'encyclopedia_not_allowed' } });
    if (m[1] === 'hadith') return send(res, 200, { meta: { returned: 1 }, data: [{ text: 'إنما الأعمال بالنيات', narrator: 'عمر بن الخطاب', muhaddith: 'البخاري', source: 'صحيح البخاري', page_or_number: '1', grade: '[صحيح]', url: 'https://dorar.net/h/x' }] });
    return send(res, 200, { data: [{ title: 'عنوان ' + m[1], text: 'نص ' + u.searchParams.get('q'), url: 'https://dorar.net/' + m[1] }] });
  }
  if (u.pathname.startsWith('/api/v1/external/public/')) {
    if (req.headers.apikey !== 'f0000000-1111-2222-3333-444444444444') return send(res, 401, { message: 'no' });
    if (u.pathname.endsWith('/lexicons')) return send(res, 200, [{ _id: 'l1', name: 'معجم' }]);
    const q = u.searchParams.get('query');
    return send(res, 200, [{ lexiconName: 'معجم', lemma: q, senses: [{ definition: 'معنى ' + q, translations: [{ word: 'meaning-of-' + q.length, language: 'en', languageLabel: 'الإنجليزية' }] }] }]);
  }
  if (u.pathname === '/v1/chat/completions') {
    const j = JSON.parse(body || '{}');
    const sys = j.messages[0].content;
    const user = j.messages[j.messages.length - 1].content;
    let content;
    if (/مخطِّط بحث/.test(sys)) content = JSON.stringify({ cats: ['hadith'], queries: { hadith: ['إنما الأعمال بالنيات'] } });
    else if (/مترجمٌ محترف/.test(sys)) {
      const items = JSON.parse(user.slice(user.indexOf('[الفقرات]') + 9).trim());
      content = JSON.stringify({ items: items.map((x) => ({ id: x.id, text: (x.draft ? 'R:' + x.draft : 'AI:' + x.text.length) + (/\[المسرد\]/.test(user) ? '+g' : '') })) });
    } else content = (/\[مصادر العلم\]/.test(user) ? 'بمصادر [١]' : 'بلا مصادر') + (/مصادر العلم:/.test(sys) ? ' +نظام' : '');
    return send(res, 200, { choices: [{ message: { content } }] });
  }
  if (u.pathname === '/libre/translate') {
    const j = JSON.parse(body);
    return send(res, 200, { translatedText: j.q.map((x) => 'LT:' + j.target + ':' + x.length) });
  }
  send(res, 404, { error: 'nf' });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + mock.address().port;
process.env.KNOW_DORAR_BASE = BASE;
process.env.KNOW_SIWAR_BASE = BASE;

const { addProvider } = await import('../lib/ai.js');
const K = await import('../lib/knowledge.js');

try {
  await addProvider({ kind: 'custom', baseUrl: BASE + '/v1', model: 'm', key: 'k' }, 'editor');

  // ١) المفاتيح: الدرر يُربط بأقسامه السبعة، وسِوار بقسم اللغة والترجمة
  const d = await K.addKey({ kind: 'dorar', key: 'TOKEN', link: 'auto', for: 'sci' });
  ok('توكن الدرر يُربط بأقسامه السبعة', d.usedIn.length === 7, d.usedIn.join('، '));
  const sw = await K.addKey({ key: 'f0000000-1111-2222-3333-444444444444', link: 'auto', for: 'trans' });
  ok('مفتاح سِوار يُعرف من شكله ويُربط باللغة والترجمة', sw.kind === 'siwar' && sw.usedIn.includes('اللغة') && sw.usedIn.includes('الترجمة'), sw.usedIn.join('، '));
  ok('المفتاح لا يخرج إلا مقنّعاً', !JSON.stringify(K.getKnow().keys).includes('TOKEN') && d.keyMasked.includes('••••'));
  const lt = await K.addKey({ kind: 'libre', base: BASE + '/libre', for: 'trans' });
  ok('LibreTranslate محركٌ للترجمة', lt.engine && K.getKnow().trans.engine === lt.id);

  // ٢) الاختبار: كل موسوعة، وما لا يملكه التوكن
  const t = await K.testKey({ kind: 'dorar', key: 'TOKEN' });
  ok('اختبار الدرر في كل موسوعة', t.ok && t.services.length === 7 && t.services.find((x) => x.id === 'history').ok === false, t.services.filter((x) => !x.ok).map((x) => x.error).join(' | '));
  const bad = await K.testKey({ kind: 'dorar', key: 'WRONG' });
  ok('توكن خاطئ: سببه بالعربية', !bad.ok && /401/.test(bad.error), bad.error);

  // ٣) الجمع: تلقائي (بتخطيط الذكاء)، وأقسامٌ مختارة، و«عام»
  const g = await K.gather({ cats: ['auto'], text: 'قال رسول الله ﷺ: «إنما الأعمال بالنيات»', prompt: 'خرّجه' });
  ok('تلقائي: يختار الحديث ويبحث بمتنه', g.how === 'ai' && g.used[0].id === 'hadith' && g.sources.length === 1 && g.sources[0].grade === '[صحيح]', g.used.map((u) => u.name + ':' + u.queries).join(' '));
  ok('النتائج مرقّمةٌ في كتلةٍ تُرسل', /\[مصادر العلم\]/.test(g.block) && /\[١\]/.test(g.block) && /خلاصة حكم المحدث/.test(g.block));
  const dorarCall = seen.filter((x) => /hadith\/search/.test(x.p)).pop();
  ok('طلب الدرر: التوكن في الترويسة، ومعاملات البحث', dorarCall.auth === 'Bearer TOKEN' && dorarCall.q.q === 'إنما الأعمال بالنيات' && dorarCall.q.match === 'all' && dorarCall.q.highlight === '0');
  const two = await K.gather({ cats: ['fiqh', 'lugha', 'history'], text: 'حكم مس المصحف للمحدث ومعنى الحدث', prompt: 'بيّن' });
  const names = two.used.map((u) => u.id).sort().join(',');
  ok('أقسامٌ معاً: يُبحث في كلٍّ منها', names === 'fiqh,history,lugha' && two.sources.some((s) => s.cat === 'fiqh') && two.sources.some((s) => s.cat === 'lugha'), names);
  ok('موسوعةٌ لا يملكها التوكن: خطأٌ يُذكر ولا يوقف الباقي', two.errors.some((e) => /403/.test(e.error)) && two.sources.length >= 2);
  const gen = await K.gather({ cats: ['general'], prompt: 'ما النية؟' });
  ok('«عام»: بلا بحث', gen.how === 'general' && !gen.block && !gen.sources.length);
  const siwarCall = seen.filter((x) => /external\/public\/search/.test(x.p)).pop();
  ok('طلب سِوار: المفتاح في ترويسة apikey', siwarCall && siwarCall.apikey === 'f0000000-1111-2222-3333-444444444444' && !!siwarCall.q.query);

  // ٤) القواعد بلا ذكاء
  const R = K._rules;
  const cats = K.BUILTIN_CATS.map((c) => ({ ...c, words: c.words || [], enabled: true, keys: [1] }));
  const pick = (t) => R.heuristicCats(cats, t).map((c) => c.id);
  ok('القواعد: الآية للتفسير', pick('﴿وَإِلَٰهُكُمْ إِلَٰهٌ وَاحِدٌ﴾ قال المفسرون')[0] === 'tafseer');
  ok('القواعد: الحدث للتاريخ', pick('وفي سنة ١٣هـ كانت معركة اليرموك')[0] === 'history');
  ok('القواعد: المسألة للفقه', pick('باب حكم مس المصحف للمحدث وقد ذهب الجمهور')[0] === 'fiqh');
  const hq = R.heuristicQueries(cats.find((c) => c.id === 'hadith'), 'عن عمر رضي الله عنه أن النبي ﷺ قال: إنما الأعمال بالنيات وإنما لكل امرئ ما نوى', '');
  ok('القواعد: متن الحديث بلا صيغ التعظيم', /^إنما الأعمال بالنيات/.test(hq[0]), hq[0]);

  // ٥) الترجمة
  await K.translate({ items: [{ id: '1', text: 'x' }], from: 'en', to: 'en' }).then(
    () => ok('اللغة نفسها تُرفض', false),
    () => ok('اللغة نفسها تُرفض', true),
  );
  const ai = await K.translate({ items: [{ id: '1', text: 'النية محلها القلب' }, { id: '2', text: 'باب الطهارة' }], via: 'ai', to: 'en' });
  ok('بالذكاء الاصطناعي: كل فقرةٍ بمعرّفها، ومعها المسرد', ai.items.length === 2 && ai.items[0].text.startsWith('AI:') && ai.items[0].text.endsWith('+g') && ai.glossary.some((x) => x.from === 'سِوار'), JSON.stringify(ai.items));
  const en = await K.translate({ items: [{ id: '1', text: 'النية' }], via: 'engine', to: 'fr' });
  ok('بالمحرك وحده (بلا ذكاء)', en.via === 'engine' && en.items[0].text === 'LT:fr:5' && !en.provider, JSON.stringify(en));
  const hy = await K.translate({ items: [{ id: '1', text: 'النية' }], via: 'hybrid', to: 'en' });
  ok('المحرك ثم يراجعه الذكاء', hy.via === 'hybrid' && hy.items[0].text.startsWith('R:LT:en'), hy.items[0].text);
  const gl = K._rules.parseGlossary('الصلاة = Salah\nالزكاة: Zakah\nسطرٌ بلا مقابل');
  ok('مسرد المستخدم', gl.length === 2 && gl[1].dst === 'Zakah');

  // ٦) الحذف يفكّ المفتاح من الأقسام
  await K.deleteKey(d.id);
  ok('حذف المفتاح يفكّه من كل الأقسام', !K.getKnow().sci.cats.some((c) => c.keys.some((k) => k.key === d.id)));
} catch (e) {
  console.error(e);
  fail++;
} finally {
  mock.close();
  fs.rmSync(DATA, { recursive: true, force: true });
}
console.log(`\n${pass} نجح، ${fail} أخفق`);
process.exit(fail ? 1 : 0);
