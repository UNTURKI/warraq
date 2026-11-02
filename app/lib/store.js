// مخزن إعدادات المالك (لا نصوص كتب): ملفات JSON في مجلد data بكتابة ذرّية، ومفتاح سري للتشفير والتوقيع
// Owner-level persistent data only: config, uploaded assets, feedback. Book texts are never stored.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.WARRAQ_DATA_DIR || path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

/* ---------------- المفتاح السري (تشفير مفتاح Gemini + توقيع الجلسات) ---------------- */
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
function loadSecret() {
  if (process.env.WARRAQ_SECRET) return crypto.createHash('sha256').update(process.env.WARRAQ_SECRET).digest();
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32), { mode: 0o600 });
  return fs.readFileSync(SECRET_FILE);
}
export const SECRET = loadSecret();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', SECRET, iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
export function decrypt(blob) {
  try {
    const [iv, tag, data] = String(blob).split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', SECRET, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/* ---------------- ملفات JSON بكتابة ذرّية ومتسلسلة ---------------- */
const queues = new Map();
export function readJson(name, fallback) {
  const f = path.join(DATA_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return typeof fallback === 'function' ? fallback() : structuredClone(fallback);
  }
}
/** تعديل ملف JSON تحت قفل: fn(value) => newValue */
export function updateJson(name, fallback, fn) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(() => {
    const cur = readJson(name, fallback);
    const val = fn(cur) ?? cur;
    const f = path.join(DATA_DIR, name);
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(val, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, f);
    return val;
  });
  queues.set(name, next.catch(() => {}));
  return next;
}

/* ---------------- الإعدادات ---------------- */
const CONFIG = 'config.json';
// passwordOff: المالك أوقف كلمة السر (فمن دخل من الباب الخفي دخل اللوحة). الأصل أنها مفعّلة
const DEFAULT_CONFIG = { aiEnabled: false, aiProviders: [], geminiKeyEnc: '', aiModel: 'gemini-2.5-flash', passwordHash: '', passwordOff: false, updatedAt: null };
export function getConfig() {
  const c = { ...DEFAULT_CONFIG, ...readJson(CONFIG, {}) };
  // ترحيل: مفتاح Gemini القديم يصبح أول مزوّد في السلسلة
  if (c.geminiKeyEnc && !(c.aiProviders || []).length) c.aiProviders = [{ id: 'legacy-gemini', kind: 'gemini', label: '', baseUrl: '', model: c.aiModel || '', keyEnc: c.geminiKeyEnc, enabled: true }];
  if (!Array.isArray(c.aiProviders)) c.aiProviders = [];
  return c;
}
export const setConfig = (patch) =>
  updateJson(CONFIG, {}, (c) => ({ ...DEFAULT_CONFIG, ...c, ...patch, updatedAt: new Date().toISOString() }));
