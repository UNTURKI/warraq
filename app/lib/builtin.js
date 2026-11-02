/*
 * lib/builtin.js — المضمَّن في البرنامج: الأساليب والأغلفة والحزم التي تأتي معه.
 * الملفات في app/builtin/ (styles.json: الإضافات والطباعة لكل أسلوب، والكتلة الأخرى في shared/presets.js،
 * وcovers.json: الأغلفة الخارجية والحزم). صورها في public/covers/builtin.
 * الأساليب تُركَّب في shared/presets.js (كتلة PRESETS) والإضافات هنا، فيُغيَّر المضمَّن بتغيير هذه الملفات معاً.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'builtin');
const read = (file) => JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));

/** إضافات كل أسلوب مضمَّن (CSS وصور وقوالب) وتنسيق طباعته: { id: { extras, print } } */
export const BUILTIN_STYLES = Object.fromEntries(read('styles.json').map((s) => [s.id, { extras: s.extras || null, print: s.print || null }]));

/** الأغلفة والحزم المضمّنة: { designs: [تصميم بمعرّف bi-…], bundles: [حزمة بمعرّف bi-…] } */
export const BUILTIN_COVERS = read('covers.json');
