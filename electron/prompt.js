// نافذة السؤال: الرسالة والقيمة من عنوانها، والجواب عبر prompt-preload.cjs
const q = new URLSearchParams(location.search);
if (q.get('night') === '1') document.documentElement.classList.add('night');
const m = q.get('m') || '';
document.getElementById('m').textContent = m;
document.title = m.split('\n')[0].slice(0, 80) || 'ورّاق';
const input = document.getElementById('v');
input.value = q.get('v') || '';
input.focus();
input.select();
let sent = false;
const done = (v) => {
  if (sent) return;
  sent = true;
  window.warraqPrompt.done(v);
};
document.getElementById('f').addEventListener('submit', (e) => {
  e.preventDefault();
  done(input.value);
});
document.getElementById('no').addEventListener('click', () => done(null));
document.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
