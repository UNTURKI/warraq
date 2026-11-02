// مظهر الموقع (يضبطه المالك من لوحته): ألوان الموقع كله، وحركة «النَّقْط» عند الضغط.
// يُخدم ورقة أنماط (/api/theme.css) تُربط في كل الصفحات: تعرّف ألوان ‎--l-*‎ التي تبني عليها أوراق الأنماط كلها.
import { readJson, updateJson } from './store.js';

const FILE = 'look.json';
const HEX = /^#[0-9a-f]{6}$/i;

/** المظاهر الجاهزة. كل لون له دور: الكاغد (الخلفية)، المداد (النص)، الحُمرة (العناوين والتنبيهات)، الأزرار، والزخرفة (النقط والخطوط) */
export const THEMES = {
  annabi: {
    name: 'العنّابي والذهب',
    desc: 'المظهر الأصلي: كاغد عاجي، وعناوين وأزرار عنّابية، ونقط مذهّبة.',
    paper: '#FBF8F1', vellum: '#F3EFE6', sheet: '#FFFDF8', ink: '#2A1D14', rubric: '#6B1D2F', rubricD: '#551625',
    gold: '#C5A059', goldD: '#8A6727', line: '#E4DCCB', muted: '#6C5949', btn: '#6B1D2F', btnD: '#551625', on: '#ffffff', mark: '#6B1D2F', dot: '#C5A059',
  },
  midad: {
    name: 'المِداد والحُمرة',
    desc: 'لون حبر العفص على الورق القديم، والعناوين بالحُمرة كما كتبها النسّاخ.',
    paper: '#F3EBDD', vellum: '#EADFCC', sheet: '#FFFFFF', ink: '#4A2C1A', rubric: '#9A3324', rubricD: '#7A2619',
    gold: '#A88660', goldD: '#6F5236', line: '#DFD2BC', muted: '#8A705A', btn: '#4A2C1A', btnD: '#33200F', on: '#ffffff', mark: '#4A2C1A', dot: '#4A2C1A',
  },
};
export const CUSTOM_KEYS = ['paper', 'ink', 'rubric', 'btn', 'gold'];
const DEFAULT = { theme: 'annabi', customs: [], clickDot: true };
const MAX_CUSTOMS = 12;

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** مظهر كامل من خمسة ألوان يختارها المالك: الباقي يُشتق منها */
export function deriveTheme(c) {
  const b = { ...pick(THEMES.annabi, CUSTOM_KEYS), ...c };
  return {
    paper: b.paper, vellum: mix(b.paper, b.ink, 0.045), sheet: mix(b.paper, '#ffffff', 0.6), ink: b.ink,
    rubric: b.rubric, rubricD: mix(b.rubric, '#000000', 0.2), gold: b.gold, goldD: mix(b.gold, '#000000', 0.32),
    line: mix(b.paper, b.ink, 0.11), muted: mix(b.ink, b.paper, 0.3), btn: b.btn, btnD: mix(b.btn, '#000000', 0.22),
    on: lum(b.btn) > 0.45 ? b.ink : '#ffffff', mark: b.btn, dot: b.gold,
  };
}
function pick(o, keys) {
  return Object.fromEntries(keys.map((k) => [k, o[k]]));
}
function cleanColors(c) {
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of CUSTOM_KEYS) out[k] = HEX.test(c[k] || '') ? c[k].toUpperCase() : THEMES.annabi[k];
  return out;
}
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'ألواني';
/** مظاهر المالك (ألوان من عنده): قائمة، ولكل مظهر اسمه ومعرّفه */
function customsOf(d) {
  const list = (Array.isArray(d.customs) ? d.customs : [])
    .filter((x) => x && typeof x.id === 'string' && /^c-[a-z0-9]{1,12}$/.test(x.id) && cleanColors(x.colors))
    .map((x) => ({ id: x.id, name: cleanName(x.name), colors: cleanColors(x.colors) }));
  // صيغة قديمة: مظهر واحد اسمه custom
  if (!list.length && cleanColors(d.custom)) list.push({ id: 'c-1', name: 'ألواني', colors: cleanColors(d.custom) });
  return list.slice(0, MAX_CUSTOMS);
}

export function getLook() {
  const d = readJson(FILE, DEFAULT);
  const customs = customsOf(d);
  const want = d.theme === 'custom' ? 'c-1' : d.theme;
  const theme = THEMES[want] || customs.some((c) => c.id === want) ? want : 'annabi';
  return { theme, customs, clickDot: d.clickDot !== false };
}
const save = (fn) =>
  updateJson(FILE, DEFAULT, (cur) => {
    const next = { theme: cur.theme === 'custom' ? 'c-1' : cur.theme || 'annabi', customs: customsOf(cur), clickDot: cur.clickDot !== false };
    fn(next);
    return next;
  });
/** اختيار مظهر (جاهز أو من مظاهر المالك)، أو تشغيل نقطة الضغط وإيقافها */
export async function setLook(patch) {
  const b = patch && typeof patch === 'object' ? patch : {};
  await save((next) => {
    if (b.theme !== undefined && (THEMES[b.theme] || next.customs.some((c) => c.id === b.theme))) next.theme = b.theme;
    if (b.clickDot !== undefined) next.clickDot = !!b.clickDot;
  });
  return adminLook();
}
/** مظهر جديد من ألوان المالك: يُحفظ باسمه ويُعمل به */
export async function addCustom(input) {
  const b = input && typeof input === 'object' ? input : {};
  const colors = cleanColors(b.colors);
  if (!colors) throw Object.assign(new Error('الألوان غير صالحة'), { status: 400 });
  let full = false;
  await save((next) => {
    if (next.customs.length >= MAX_CUSTOMS) return void (full = true);
    let n = next.customs.length + 1;
    while (next.customs.some((c) => c.id === 'c-' + n)) n++;
    next.customs.push({ id: 'c-' + n, name: cleanName(b.name), colors });
    next.theme = 'c-' + n;
  });
  if (full) throw Object.assign(new Error('بلغت مظاهرك الحد (' + MAX_CUSTOMS + '): احذف واحداً ثم أضف'), { status: 409 });
  return adminLook();
}
/** حذف مظهر من مظاهر المالك. إن كان هو المعمول به عاد الموقع إلى المظهر الأصلي */
export async function deleteCustom(id) {
  await save((next) => {
    next.customs = next.customs.filter((c) => c.id !== id);
    if (next.theme === id) next.theme = 'annabi';
  });
  return adminLook();
}
/** ألوان المظهر المعمول به */
export function activeTheme(look = getLook()) {
  const c = look.customs.find((x) => x.id === look.theme);
  return c ? deriveTheme(c.colors) : THEMES[look.theme] || THEMES.annabi;
}
/** للوحة المالك: الحال، والمظاهر الجاهزة بألوانها، ومظاهر المالك */
export function adminLook() {
  const look = getLook();
  return {
    ...look,
    active: activeTheme(look),
    themes: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, desc: t.desc, colors: pick(t, CUSTOM_KEYS) })),
    maxCustoms: MAX_CUSTOMS,
  };
}

const VARS = { paper: 'paper', vellum: 'vellum', sheet: 'sheet', ink: 'ink', rubric: 'rubric', rubricD: 'rubric-d', gold: 'gold', goldD: 'gold-d', line: 'line', muted: 'muted', btn: 'btn', btnD: 'btn-d', on: 'on', mark: 'mark', dot: 'dot' };
/** ورقة الأنماط التي تُربط في كل الصفحات */
export function lookCss() {
  const look = getLook();
  const t = activeTheme(look);
  let css = `/* مظهر الموقع: ${look.theme} */\n`;
  // المظهر الأصلي هو ما في أوراق الأنماط نفسها: لا يُكتب شيء
  if (look.theme !== 'annabi') css += `:root{${Object.entries(VARS).map(([k, v]) => `--l-${v}:${t[k]}`).join(';')}}\n`;
  if (!look.clickDot) css += '.stp{display:none!important}\n';
  return css;
}
