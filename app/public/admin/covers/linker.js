/*
 * linker.js — لوحة الربط اللوني بين العناصر (تطوير لأداة التوصيل التفاعلي).
 *  - عمودان: قسم الخلفية وقسم الخانة. كل صورة ولون نص وحدّ نص له نقطة توصيل.
 *  - اسحب من نقطة إلى أخرى، أو انقر نقطة ثم نقطة أخرى (يصلح للّمس).
 *  - يمكن الربط داخل القسم نفسه (مثلاً: الخطوط ↔ لون العنوان).
 *  - الخط يأخذ لون مجموعته، والنقر عليه يحذفه.
 *  - مجموعات اللون تُحسب بالاتحاد (أ↔ب و ب↔ج ⇒ أ ب ج لون واحد).
 */
(function () {
  'use strict';
  const Core = window.CoverCore;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').replace(/ـ/g, '').replace(/^\s*خانة\s*[:：-]?\s*/, '').replace(/\s+/g, ' ').trim();

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function create(root, api) {
    // api: { getDesign(), commit(label), changed(), toast(msg, warn) }
    let pending = null;
    let drag = null;
    let ro = null;
    let raf = 0;

    root.innerHTML = `
      <div class="lk-head">
        <div>
          <h2>الربط اللوني</h2>
          <p class="muted small">اسحب من نقطة إلى أخرى (أو انقر نقطتين) ليشترك العنصران في اللون. تغيير لون أحدهما يغيّر الآخر عند المستخدم وفي المحرر. انقر على الخط لحذفه.</p>
        </div>
        <div class="row">
          <button class="btn sm" data-act="auto">${ic('wand')} ربط تلقائي بالأسماء</button>
          <button class="btn sm danger" data-act="clear">${ic('unlink')} حذف كل الروابط</button>
        </div>
      </div>
      <div class="lk-board" tabindex="-1">
        <svg class="lk-svg"></svg>
        <svg class="lk-drag"><path class="lk-temp" d=""/></svg>
        <section class="lk-col" data-sec="cover"><header><span class="dot cover"></span> قسم الخلفية <span class="chip cover" data-count="cover"></span></header><div class="lk-list"></div></section>
        <div class="lk-gap"></div>
        <section class="lk-col" data-sec="slot"><header><span class="dot slot"></span> قسم الخانة <span class="chip slot" data-count="slot"></span></header><div class="lk-list"></div></section>
      </div>
      <div class="lk-groups-wrap">
        <h3>${ic('palette')} مجموعات اللون <span class="muted small">(ما يراه المستخدم لوناً واحداً)</span></h3>
        <div class="lk-groups"></div>
      </div>`;

    const board = root.querySelector('.lk-board');
    const svg = root.querySelector('.lk-svg');
    const temp = root.querySelector('.lk-temp');

    function rows(design, sec) {
      return design.layers.filter((l) => l.section === sec).slice().reverse().map((l) => {
        const icon = l.type === 'image' ? 'image' : 'type';
        let targets;
        if (l.type === 'image') {
          targets = [{ key: 'L:' + l.id, sub: l.tint ? 'لون الطبقة' : 'التلوين معطّل', color: l.color, off: !l.tint }];
        } else {
          targets = [{ key: 'T:' + l.id + ':fill', sub: 'لون النص', color: l.color }].concat(
            l.strokes.map((s, i) => ({ key: 'T:' + l.id + ':s:' + s.id, sub: 'الحد ' + (i + 1) + ' · ' + s.width + 'px', color: s.color }))
          );
        }
        return `<div class="lk-card" data-layer="${l.id}">
          <div class="lk-card-h">${ic(icon)}<b>${esc(l.name)}</b></div>
          ${targets.map((t) => `<div class="lk-t ${t.off ? 'off' : ''}" data-key="${t.key}">
              <span class="lk-sw ${t.color ? '' : 'orig'}" style="${t.color ? 'background:' + t.color : ''}"></span><span class="lk-sub">${esc(t.sub)}</span>
              <button class="lk-node" data-node="${t.key}" ${t.off ? 'disabled title="فعّل تلوين الطبقة أولاً"' : 'title="اسحب للربط"'} aria-label="نقطة ربط: ${esc(l.name)} — ${esc(t.sub)}"></button>
            </div>`).join('')}
        </div>`;
      }).join('') || '<p class="muted small" style="padding:8px">لا عناصر في هذا القسم.</p>';
    }

    function render() {
      const d = api.getDesign();
      root.querySelector('[data-sec="cover"] .lk-list').innerHTML = rows(d, 'cover');
      root.querySelector('[data-sec="slot"] .lk-list').innerHTML = rows(d, 'slot');
      const { groups, byKey } = Core.colorGroups(d);
      const linked = new Set(d.links.flatMap((l) => [l.a, l.b]));
      root.querySelectorAll('[data-node]').forEach((n) => {
        const k = n.dataset.node;
        n.classList.toggle('linked', linked.has(k));
        n.style.setProperty('--c', (groups[byKey[k]] && (groups[byKey[k]].find((t) => t.color) || {}).color) || '#999');
      });
      ['cover', 'slot'].forEach((s) => {
        const n = d.links.filter((l) => targetSection(d, l.a) === s || targetSection(d, l.b) === s).length;
        root.querySelector(`[data-count="${s}"]`).textContent = n + ' ربط';
      });
      renderGroups(d, groups);
      requestLines();
    }

    function targetSection(d, key) {
      const id = key.split(':')[1];
      const l = d.layers.find((x) => x.id === id);
      return l ? l.section : null;
    }

    function renderGroups(d, groups) {
      const multi = groups.filter((g) => g.length > 1);
      const box = root.querySelector('.lk-groups');
      if (!multi.length) { box.innerHTML = '<p class="muted small">لا مجموعات بعد — كل عنصر مستقل بلونه.</p>'; return; }
      box.innerHTML = multi.map((g) => `<div class="lk-group">
          <label class="color" title="لون المجموعة"><input type="color" value="${(g.find((t) => t.color) || { color: '#808080' }).color}" data-gcolor="${g[0].key}"></label>
          <div class="lk-members">${g.map((t) => `<span class="chip ${t.section}"><span class="dot ${t.section}"></span>${esc(t.label)}${t.sub ? ' · ' + esc(t.sub) : ''}</span>`).join('')}</div>
        </div>`).join('');
    }

    /* ---------------- الخطوط ---------------- */
    function requestLines() { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawLines); }

    function nodePos(key) {
      const n = board.querySelector(`[data-node="${CSS.escape(key)}"]`);
      if (!n) return null;
      const br = board.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      const sec = n.closest('.lk-col').dataset.sec;
      return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top, sec };
    }

    function curve(a, b) {
      // في اتجاه RTL: عمود الخلفية يميناً ونقاطه على حافته اليسرى، وعمود الخانة يساراً ونقاطه على حافته اليمنى
      const dirA = a.sec === 'cover' ? -1 : 1;
      if (b.sec && a.sec === b.sec) {
        const k = 46 + Math.abs(b.y - a.y) * 0.22;
        return `M ${a.x} ${a.y} C ${a.x + dirA * k} ${a.y}, ${b.x + dirA * k} ${b.y}, ${b.x} ${b.y}`;
      }
      const dx = Math.max(Math.abs(b.x - a.x) * 0.45, 50);
      const dirB = b.sec === 'cover' ? -1 : b.sec === 'slot' ? 1 : -dirA;
      return `M ${a.x} ${a.y} C ${a.x + dirA * dx} ${a.y}, ${b.x + dirB * dx} ${b.y}, ${b.x} ${b.y}`;
    }

    function drawLines() {
      const d = api.getDesign();
      const br = board.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
      const { groups, byKey } = Core.colorGroups(d);
      let html = '';
      for (const l of d.links) {
        const a = nodePos(l.a), b = nodePos(l.b);
        if (!a || !b) continue;
        const g = groups[byKey[l.a]];
        const color = (g && (g.find((t) => t.color) || {}).color) || '#8a8f99';
        const light = luminance(color) > 0.6;
        const p = curve(a, b);
        html += `<g class="lk-line" data-a="${l.a}" data-b="${l.b}">
          <title>انقر لحذف هذا الربط</title>
          <path class="hit" d="${p}"/>
          <path class="under ${light ? 'dark' : ''}" d="${p}"/>
          <path class="main" d="${p}" stroke="${color}"/>
        </g>`;
      }
      svg.innerHTML = html;
    }

    /* ---------------- التفاعل ---------------- */
    function link(a, b) {
      if (!a || !b || a === b) return;
      const d = api.getDesign();
      if (Core.addLink(d, a, b)) {
        api.commit('ربط');
        api.toast('تم الربط — أخذ العنصر لون مجموعته');
      } else api.toast('هذا الربط موجود', true);
      render();
      api.changed();
    }

    function setPending(k) {
      pending = k;
      root.querySelectorAll('.lk-t').forEach((r) => r.classList.toggle('pending', r.dataset.key === k));
      board.classList.toggle('picking', !!k);
    }

    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'auto') return autoLink();
      if (act && act.dataset.act === 'clear') {
        const d = api.getDesign();
        if (!d.links.length) return;
        if (!confirm('حذف كل الروابط اللونية في هذا التصميم؟')) return;
        d.links = [];
        api.commit('حذف الروابط');
        render(); api.changed();
        return;
      }
      const line = e.target.closest('.lk-line');
      if (line) {
        const d = api.getDesign();
        Core.removeLink(d, line.dataset.a, line.dataset.b);
        api.commit('حذف ربط');
        render(); api.changed();
        api.toast('حُذف الربط');
        return;
      }
      const row = e.target.closest('.lk-t');
      if (row && !row.classList.contains('off') && !drag) {
        const k = row.dataset.key;
        if (!pending) setPending(k);
        else if (pending === k) setPending(null);
        else { const p = pending; setPending(null); link(p, k); }
      }
    });

    root.addEventListener('input', (e) => {
      const k = e.target.dataset.gcolor;
      if (!k) return;
      Core.setDesignColor(api.getDesign(), k, e.target.value);
      root.querySelectorAll('[data-node]').forEach((n) => {
        const t = Core.groupOf(api.getDesign(), n.dataset.node)[0];
        if (t) n.style.setProperty('--c', t.color || '#999');
      });
      root.querySelectorAll('.lk-t').forEach((r) => {
        const t = Core.targetsOf(api.getDesign()).find((x) => x.key === r.dataset.key);
        if (t) { const sw = r.querySelector('.lk-sw'); sw.style.background = t.color || ''; sw.classList.toggle('orig', !t.color); }
      });
      drawLines();
      api.changed();
    });
    root.addEventListener('change', (e) => { if (e.target.dataset.gcolor) api.commit('لون مجموعة'); });

    board.addEventListener('pointerdown', (e) => {
      const n = e.target.closest('[data-node]');
      if (!n || n.disabled) return;
      e.preventDefault();
      const a = nodePos(n.dataset.node);
      drag = { from: n.dataset.node, a, moved: false, x0: e.clientX, y0: e.clientY };
      board.setPointerCapture(e.pointerId);
    });
    board.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) drag.moved = true;
      if (!drag.moved) return;
      const br = board.getBoundingClientRect();
      const b = { x: e.clientX - br.left, y: e.clientY - br.top, sec: null };
      temp.setAttribute('d', curve(drag.a, b));
      temp.style.display = 'block';
      board.querySelectorAll('.lk-t.hover').forEach((x) => x.classList.remove('hover'));
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el && el.closest('.lk-t:not(.off)');
      if (row) row.classList.add('hover');
    });
    const end = (e) => {
      if (!drag) return;
      const d0 = drag;
      drag = null;
      temp.style.display = 'none';
      board.querySelectorAll('.lk-t.hover').forEach((x) => x.classList.remove('hover'));
      if (!d0.moved) {
        // نقرة على النقطة = اختيار مصدر/هدف
        const k = d0.from;
        if (!pending) setPending(k);
        else if (pending === k) setPending(null);
        else { const p = pending; setPending(null); link(p, k); }
        setTimeout(() => {}, 0);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el && el.closest('.lk-t:not(.off)');
      if (row) link(d0.from, row.dataset.key);
    };
    board.addEventListener('pointerup', end);
    board.addEventListener('pointercancel', () => { drag = null; temp.style.display = 'none'; });
    // النقر على نقطة يُعالج في pointerup؛ نمنع معالجة النقر المكررة على الصف نفسه
    board.addEventListener('click', (e) => { if (e.target.closest('[data-node]')) e.stopPropagation(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending) setPending(null); });

    function autoLink() {
      const d = api.getDesign();
      let n = 0;
      const cover = d.layers.filter((l) => l.section === 'cover');
      const slot = d.layers.filter((l) => l.section === 'slot');
      for (const s of slot) {
        const m = cover.find((c) => c.type === s.type && norm(c.name) === norm(s.name));
        if (!m) continue;
        if (s.type === 'image' && (!m.tint || !s.tint)) continue;
        const a = s.type === 'image' ? 'L:' + m.id : 'T:' + m.id + ':fill';
        const b = s.type === 'image' ? 'L:' + s.id : 'T:' + s.id + ':fill';
        if (Core.addLink(d, a, b)) n++;
      }
      if (n) { api.commit('ربط تلقائي'); api.changed(); }
      api.toast(n ? `تم إنشاء ${n} ربط بمطابقة الأسماء (الخلفية↔خانة: الخلفية …)` : 'لا عناصر جديدة متطابقة الأسماء', !n);
      render();
    }

    ro = new ResizeObserver(requestLines);
    ro.observe(board);
    window.addEventListener('resize', requestLines);

    return { render, requestLines, destroy() { ro && ro.disconnect(); } };
  }

  window.CoverLinker = { create };
})();
