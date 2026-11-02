// دخول مالك الموقع: كلمة سر مخزنة بتجزئة scrypt، وجلسة موقّعة (HMAC) في ملف تعريف ارتباط HttpOnly
import crypto from 'node:crypto';
import { SECRET, getConfig, setConfig } from './store.js';

const COOKIE = 'warraq_admin';
const SESSION_HOURS = 12;

/* ---------------- كلمة السر ---------------- */
function hashPassword(pw, salt = crypto.randomBytes(16)) {
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}
function verifyHash(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hash, 'base64');
  return ref.length === h.length && crypto.timingSafeEqual(ref, h);
}

/** هل كلمة السر مضبوطة؟ (من ADMIN_PASSWORD أو من الإعداد الأول) */
export const passwordConfigured = () => !!(process.env.ADMIN_PASSWORD || getConfig().passwordHash);

export function checkPassword(pw) {
  if (process.env.ADMIN_PASSWORD) {
    const a = crypto.createHash('sha256').update(String(pw)).digest();
    const b = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
    return crypto.timingSafeEqual(a, b);
  }
  return verifyHash(pw, getConfig().passwordHash);
}

export async function setPassword(pw) {
  if (String(pw).length < 8) throw Object.assign(new Error('كلمة السر ٨ أحرف على الأقل'), { status: 400 });
  await setConfig({ passwordHash: hashPassword(pw), sessionEpoch: Date.now() });
}

/* ---------------- الجلسة ---------------- */
/** إضافة Set-Cookie دون محو ما سبقه في الرد نفسه */
export function appendCookie(res, cookie) {
  const prev = res.getHeader('set-cookie');
  res.setHeader('set-cookie', prev ? [].concat(prev, cookie) : cookie);
}
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

export function issueSession(res) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  const epoch = getConfig().sessionEpoch || 0; // تغيير كلمة السر يُبطل الجلسات القديمة
  const payload = `${exp}.${epoch}.${crypto.randomBytes(9).toString('base64url')}`;
  appendCookie(
    res,
    `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}` +
      (process.env.WARRAQ_SECURE_COOKIE ? '; Secure' : ''),
  );
}
export function clearSession(res) {
  appendCookie(res, `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}
export function isAuthed(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
  if (!m) return false;
  const parts = m[1].split('.');
  if (parts.length !== 4) return false;
  const payload = parts.slice(0, 3).join('.');
  const sig = Buffer.from(parts[3]);
  const ref = Buffer.from(sign(payload));
  if (sig.length !== ref.length || !crypto.timingSafeEqual(sig, ref)) return false;
  if (+parts[0] < Date.now()) return false;
  return +parts[1] === (getConfig().sessionEpoch || 0);
}

/* ---------------- الحد من المحاولات ---------------- */
const buckets = new Map();
/** true إن تجاوز العنوان الحد (limit محاولة في windowMs) */
export function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  b.push(now);
  buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return b.length > limit;
}

export function clientIp(req) {
  return (process.env.WARRAQ_TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
}
export const isLocal = (req) => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
