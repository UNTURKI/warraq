// نافذة «عن ورّاق»: رقم الإصدار (بأرقامه كما هو: 1.0.0)، وزر قصة الهوية (تُفتح صفحتها في نافذة البرنامج)
const v = new URLSearchParams(location.search).get('v') || '';
document.getElementById('ver').textContent = v;
document.getElementById('identity').addEventListener('click', () => window.warraqDesktop && window.warraqDesktop.openWindow('identity'));
document.getElementById('close').addEventListener('click', () => window.close());
document.addEventListener('keydown', (e) => e.key === 'Escape' && window.close());
