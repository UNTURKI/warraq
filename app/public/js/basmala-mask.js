// صور صفحات الطباعة في المتصفح: تحويل صورة البسملة إلى قناع يُلوَّن، وتجهيز صورة لصفحة صورة.

/** أي صورة ← قناع: إن كانت شفافة الخلفية أُخذت شفافيتها، وإلا فالداكن حبر والفاتح شفاف. ثم تُقص إلى حدود الحبر. */
export async function toMask(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = Math.min(1, 2200 / Math.max(img.naturalWidth || 1200, 1));
    const W = Math.max(1, Math.round((img.naturalWidth || 1200) * k));
    const H = Math.max(1, Math.round((img.naturalHeight || 400) * k));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H);
    const px = d.data;
    let transparent = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) transparent++;
    const hasAlpha = transparent > px.length / 4 / 50; // أكثر من ٢٪ شفاف: الخلفية شفافة أصلاً
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let i = 0, n = 0; i < px.length; i += 4, n++) {
      const lum = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      let a = hasAlpha ? px[i + 3] : Math.round(((255 - lum) * px[i + 3]) / 255);
      if (!hasAlpha) a = a < 28 ? 0 : a > 200 ? 255 : Math.round(((a - 28) * 255) / 172); // تنظيف الخلفية وتقوية الحبر
      px[i] = px[i + 1] = px[i + 2] = 0;
      px[i + 3] = a;
      if (a > 40) {
        const x = n % W, y = (n / W) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) throw new Error('لم يُعثر على حبر في الصورة');
    g.putImageData(d, 0, 0);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return { src: out.toDataURL('image/png'), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** صورة لصفحة صورة: تُصغَّر إن كبرت، وتُحفظ PNG إن كان فيها شفافية وإلا JPEG */
export async function toPageImage(file, max = 2400) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 1200;
    const nh = img.naturalHeight || 1200;
    const k = Math.min(1, max / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * k));
    const h = Math.max(1, Math.round(nh * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    let alpha = false;
    const px = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 16) {
      if (px[i] < 250) {
        alpha = true;
        break;
      }
    }
    return { src: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** تلوين قناع بلون (لعرض مصغّرات البسملة): يُرجع data URL */
export async function tintMask(src, color) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color || '#000';
  g.fillRect(0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
