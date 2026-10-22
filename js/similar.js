/* =========================================================================
   Similar — draw one character (or several, side by side) and get the closest
   shapes in the library, the word those shapes form, and alternative word
   formations ranked by combined similarity.

   Upload mode: every glyph in the image becomes selectable — click any single
   character to match it, or step through them with ‹ ›.
   ========================================================================= */

window.Similar = (function () {
  const S = {
    mode: 'draw', marks: null, crop: '',
    up: {
      imgData: null, base: null, ov: null, mask: null,
      w: 0, h: 0, srcW: 0, srcH: 0,
      comps: [], groups: [], sel: -1
    }
  };
  let pad = null;
  let el = {};

  function init() {
    el = {
      mode: document.getElementById('simMode'),
      drawPane: document.getElementById('simDrawPane'),
      uploadPane: document.getElementById('simUploadPane'),
      canvas: document.getElementById('simPad'),
      brush: document.getElementById('simBrush'),
      matches: document.getElementById('simMatches'),
      phonetic: document.getElementById('simPhonetic'),
      drop: document.getElementById('simDrop'),
      file: document.getElementById('simFile'),
      strip: document.getElementById('simWordStrip'),
      stripBody: document.getElementById('simWordBody'),
      hypos: document.getElementById('simHypos'),
      stage: document.getElementById('simStage'),
      layers: document.getElementById('simLayers'),
      prev: document.getElementById('simPrev'),
      next: document.getElementById('simNext'),
      pick: document.getElementById('simPick'),
      hint: document.getElementById('simPickHint')
    };

    pad = new DrawPad(el.canvas, {
      brush: +el.brush.value,
      onChange: p => { if (S.mode === 'draw') analyzeDraw(p); }
    });
    el.brush.addEventListener('input', () => pad.setBrush(+el.brush.value));
    document.querySelectorAll('[data-pad="simPad"]').forEach(b => {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'undo') pad.undo(); else pad.clear();
        if (pad.isEmpty()) idle();
      });
    });

    el.mode.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      el.mode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      setMode(b.dataset.mode);
    });

    el.drop.addEventListener('click', () => el.file.click());
    el.drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') el.file.click(); });
    el.file.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) loadFile(f);
      el.file.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => el.drop.addEventListener(ev, e => {
      e.preventDefault(); el.drop.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => el.drop.addEventListener(ev, e => {
      e.preventDefault(); el.drop.classList.remove('over');
    }));
    el.drop.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });

    el.prev.addEventListener('click', () => step(-1));
    el.next.addEventListener('click', () => step(1));
    window.addEventListener('resize', () => {
      if (S.mode === 'upload' && S.up.sel >= 0) drawUploadOverlay();
    });

    idle();
  }

  function setMode(m) {
    S.mode = m;
    el.drawPane.hidden = m !== 'draw';
    el.uploadPane.hidden = m !== 'upload';
    if (m === 'draw') {
      idle();
      if (!pad.isEmpty()) analyzeDraw(pad);
    } else {
      if (S.up.sel >= 0) selectGroup(S.up.sel);
      else idle();
    }
  }

  function idle() {
    el.matches.innerHTML = '<span class="muted">' +
      (S.mode === 'upload' ? 'Upload an image, then click a character.' : 'Draw something or upload an image.') +
      '</span>';
    el.phonetic.innerHTML = '<span class="muted">—</span>';
    el.hypos.innerHTML = '<span class="muted">Draw two or more characters to build a word.</span>';
    el.strip.hidden = true;
    S.marks = null;
  }

  /* ---------------------------------------------------------------- draw */
  function analyzeDraw(p) {
    const d = p.ctx.getImageData(0, 0, p.size, p.size);
    const { mask, w, h } = Glyph.alphaToMask(d);
    const ink = Glyph.bbox(mask, w, h);
    if (!ink) { idle(); return; }

    const boxes = Glyph.segmentGlyphs(mask, w, { y0: ink.y0, y1: ink.y1 }).slice(0, 12);
    const marks = boxes.map(b => {
      const feat = Glyph.maskToFeature(mask, w, h, b);
      const ranked = feat ? Library.match(feat).ranked : [];
      return { box: b, ranked: ranked.slice(0, 6), best: ranked[0] || null };
    }).filter(m => m.best);

    if (!marks.length) { idle(); return; }
    S.marks = marks;
    S.crop = '';
    render(marks);
  }

  /* -------------------------------------------------------------- upload */
  function loadFile(file) {
    if (!/^image\//.test(file.type)) return;
    if (S.mode !== 'upload') {
      el.mode.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.mode === 'upload'));
      setMode('upload');
    }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => processUpload(img);
      img.onerror = () => { el.matches.innerHTML = '<div class="empty">That image could not be read.</div>'; };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  function processUpload(img) {
    const { imgData, canvas } = Glyph.imageToImageData(img, 1000);
    const { mask, w, h } = Glyph.imageDataToMask(imgData);
    const comps = Glyph.components(mask, w, h, 12);

    if (!comps.length) {
      el.matches.innerHTML = '<div class="empty">No ink found in that image.</div>';
      el.stage.hidden = true;
      return;
    }

    S.up = {
      imgData, base: canvas, ov: null, mask, w, h,
      srcW: canvas.width, srcH: canvas.height,
      comps, groups: readingOrder(comps), sel: -1
    };

    buildUploadStage();

    /* default selection: the largest glyph */
    let bi = 0, bestArea = -1;
    S.up.groups.forEach((g, i) => {
      const a = (g.x1 - g.x0 + 1) * (g.y1 - g.y0 + 1);
      if (a > bestArea) { bestArea = a; bi = i; }
    });
    selectGroup(bi);
  }

  function buildUploadStage() {
    el.layers.innerHTML = '';
    S.up.base.className = 'base clickable';

    const ov = document.createElement('canvas');
    ov.className = 'ov';
    S.up.ov = ov;

    el.layers.appendChild(S.up.base);
    el.layers.appendChild(ov);
    el.stage.hidden = false;
    el.hint.hidden = false;

    S.up.base.addEventListener('click', e => {
      const p = pointFromEvent(e);
      const i = pickAt(p.x, p.y);
      if (i >= 0) selectGroup(i);
    });
  }

  function pointFromEvent(e) {
    const r = S.up.base.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (S.up.srcW / r.width),
      y: (e.clientY - r.top) * (S.up.srcH / r.height)
    };
  }

  /* reading order: top-to-bottom, then left-to-right within a line */
  function readingOrder(boxes) {
    const hs = boxes.map(b => b.y1 - b.y0 + 1).sort((a, b) => a - b);
    const medH = hs[Math.floor(hs.length / 2)] || 20;
    return boxes.slice().sort((a, b) => {
      if (Math.abs(a.y0 - b.y0) > medH * 0.6) return a.y0 - b.y0;
      return a.x0 - b.x0;
    });
  }

  /* nearest selectable glyph to a click, within a tolerance */
  function pickAt(x, y) {
    const groups = S.up.groups;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const dx = Math.max(g.x0 - x, 0, x - g.x1);
      const dy = Math.max(g.y0 - y, 0, y - g.y1);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    const tol = Math.max(12, (S.up.srcW || 300) * 0.035);
    return bestD <= tol ? best : -1;
  }

  /* a selected glyph may have a detached mātrā / dot next to it — pull those in */
  function effectiveBox(anchor, all) {
    const w = anchor.x1 - anchor.x0 + 1;
    const h = anchor.y1 - anchor.y0 + 1;
    const areaA = w * h;
    const parts = all.filter(o => {
      if (o === anchor) return true;
      const a = (o.x1 - o.x0 + 1) * (o.y1 - o.y0 + 1);
      if (a > areaA * 0.8) return false;                 // don't swallow an equal-sized neighbour
      const dx = Math.max(0, Math.max(anchor.x0, o.x0) - Math.min(anchor.x1, o.x1));
      const dy = Math.max(0, Math.max(anchor.y0, o.y0) - Math.min(anchor.y1, o.y1));
      return dx <= w * 0.4 && dy <= h * 0.5;
    });
    return Glyph.unionBox(parts);
  }

  function step(dir) {
    const n = S.up.groups.length;
    if (!n) return;
    const next = ((S.up.sel + dir) % n + n) % n;
    selectGroup(next);
  }

  function selectGroup(i) {
    const up = S.up;
    if (!up.groups.length) return;
    i = Math.max(0, Math.min(up.groups.length - 1, i));
    up.sel = i;

    const box = effectiveBox(up.groups[i], up.comps);
    const feat = Glyph.maskToFeature(up.mask, up.w, up.h, box);
    if (!feat) {
      el.matches.innerHTML = '<div class="empty">That glyph is too small to analyse.</div>';
      return;
    }

    S.crop = Glyph.cropDataURL(up.imgData, box, 240, 4);
    const ranked = Library.match(feat).ranked;
    S.marks = [{ box, ranked: ranked.slice(0, 6), best: ranked[0] || null }];

    el.pick.textContent = `${i + 1}/${up.groups.length}`;
    render(S.marks);
    drawUploadOverlay();
  }

  function drawUploadOverlay() {
    const up = S.up;
    if (!up.ov || !up.base) return;
    const rect = up.base.getBoundingClientRect();
    if (!rect.width) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (up.ov.width !== W || up.ov.height !== H) { up.ov.width = W; up.ov.height = H; }

    const ctx = up.ov.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(W / up.srcW, 0, 0, H / up.srcH, 0, 0);

    const lw = Math.max(1, up.srcW / 1000);

    /* boxes are drawn as a dark halo + gold line so they read on white paper
       and on a dark photo alike */
    const box = (b, thick, gold) => {
      const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      ctx.strokeStyle = 'rgba(6,8,13,.55)';
      ctx.lineWidth = thick + lw * 1.6;
      ctx.strokeRect(b.x0 - lw * 0.8, b.y0 - lw * 0.8, w + lw * 1.6, h + lw * 1.6);
      ctx.strokeStyle = gold;
      ctx.lineWidth = thick;
      ctx.strokeRect(b.x0, b.y0, w, h);
    };

    /* every selectable character */
    for (const g of up.groups) box(g, lw * 1.1, 'rgba(255,198,104,.95)');

    /* the selected one */
    const sel = up.groups[up.sel];
    if (sel) {
      const b = effectiveBox(sel, up.comps);
      ctx.fillStyle = 'rgba(255,206,120,.16)';
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
      box(b, lw * 2.8, 'rgba(255,236,178,1)');
    }
  }

  /* -------------------------------------------------------------- render */
  function render(marks) {
    if (marks.length === 1) renderSingle(marks[0]);
    else renderMulti(marks);
  }

  function matchRow(c, pct, opts) {
    opts = opts || {};
    return `<div class="match${opts.top ? ' top' : ''}" title="${c.desc.en} | ${c.desc.kn} | ${c.desc.hi}">
      <div class="mg">${c.br}</div>
      <div class="mbody">
        <div class="mtop">
          <b>${c.name}</b><span class="iast">${c.id}</span>
          <span class="muted" style="font-size:11px">${BrahmiData.TYPE_SHORT[c.t]}${opts.source === 'trained' ? ' · trained' : ''}</span>
        </div>
        <div class="mlangs"><span class="kn">${c.kn}</span><span class="hi">${c.hi}</span></div>
        <div class="mnote">${c.sound}</div>
      </div>
      <div class="bar">
        <div class="track"><i style="width:${pct}%"></i></div>
        <div class="pv">${pct}%</div>
      </div>
    </div>`;
  }

  function renderSingle(mark) {
    el.strip.hidden = true;
    el.hypos.innerHTML = '<span class="muted">Draw two or more characters side by side to build a word.</span>';

    const ranked = mark.ranked;
    const cropBlock = S.crop
      ? `<div class="match" style="border-style:dashed">
           <img src="${S.crop}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:6px;background:#f4efe1" />
           <div class="mbody"><div class="mtop"><b>Your input</b></div>
             <div class="mnote">${S.mode === 'upload' ? 'selected character' : 'largest detected glyph'}</div></div>
         </div>` : '';

    el.matches.innerHTML = cropBlock + ranked.slice(0, 8).map((r, i) => {
      const c = BrahmiData.BY_ID.get(r.charId);
      return c ? matchRow(c, Math.round(r.score * 100), { top: i === 0, source: r.source }) : '';
    }).join('');

    renderPhonetic(ranked[0]);
  }

  function renderMulti(marks) {
    const best = marks.map(m => (m.best ? m.best.charId : null));
    const comp = BrahmiData.compose(best.filter(Boolean));
    const avg = marks.reduce((a, m) => a + (m.best ? m.best.score : 0), 0) / marks.length;

    el.strip.hidden = false;
    el.stripBody.innerHTML = `<div class="wchip">
        <span class="wb">${comp.br || '?'}</span>
        <span class="wl"><span class="kn">${comp.kn}</span><span class="hi">${comp.hi}</span></span>
        <span class="wi">${esc(comp.iast)}</span>
        <span class="wc">${marks.length} marks · ${Math.round(avg * 100)}%</span>
      </div>`;

    el.matches.innerHTML = `<p class="tagline">${marks.length} marks detected — top candidate for each:</p>` +
      marks.map((m, i) => {
        const r = m.best;
        const c = BrahmiData.BY_ID.get(r.charId);
        if (!c) return '';
        const pct = Math.round(r.score * 100);
        const alts = m.ranked.slice(1, 3).map(a => {
          const ac = BrahmiData.BY_ID.get(a.charId);
          return ac ? `${ac.id} ${Math.round(a.score * 100)}%` : '';
        }).filter(Boolean).join(' · ');
        return `<div class="match${i === 0 ? ' top' : ''}" title="${c.desc.en} | ${c.desc.kn} | ${c.desc.hi}">
          <div class="mg">${c.br}</div>
          <div class="mbody">
            <div class="mtop"><b>${c.name}</b><span class="iast">${c.id}</span>
              <span class="muted" style="font-size:11px">mark ${i + 1}</span></div>
            <div class="mlangs"><span class="kn">${c.kn}</span><span class="hi">${c.hi}</span></div>
            <div class="mnote">${alts ? 'also: ' + alts : c.sound}</div>
          </div>
          <div class="bar"><div class="track"><i style="width:${pct}%"></i></div><div class="pv">${pct}%</div></div>
        </div>`;
      }).join('');

    renderHypotheses(marks);
    renderPhonetic(marks[0].best);
  }

  /* beam search over the top few candidates of each mark */
  function hypotheses(marks, maxOut) {
    let beams = [{ picks: [], conf: [] }];
    for (const m of marks) {
      const cands = (m.ranked || []).slice(0, 3);
      if (!cands.length) continue;
      const next = [];
      for (const b of beams) {
        for (const c of cands) next.push({ picks: b.picks.concat(c), conf: b.conf.concat(c.score) });
      }
      next.sort((a, b) => avg(b.conf) - avg(a.conf));
      beams = next.slice(0, 8);
    }
    const seen = new Set();
    const out = [];
    for (const b of beams) {
      const ids = b.picks.map(p => p.charId);
      const key = ids.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const comp = BrahmiData.compose(ids);
      if (!comp.br) continue;
      out.push({ br: comp.br, kn: comp.kn, hi: comp.hi, iast: comp.iast, conf: avg(b.conf), ids });
      if (out.length >= (maxOut || 5)) break;
    }
    return out;
  }

  function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

  function renderHypotheses(marks) {
    if (marks.length < 2) {
      el.hypos.innerHTML = '<span class="muted">Draw two or more characters to build a word.</span>';
      return;
    }
    const hs = hypotheses(marks, 5);
    if (!hs.length) {
      el.hypos.innerHTML = '<span class="muted">No combination found.</span>';
      return;
    }
    el.hypos.innerHTML = hs.map((h, i) => {
      const pct = Math.round(h.conf * 100);
      return `<div class="hypo${i === 0 ? ' top' : ''}">
        <span class="hb">${h.br}</span>
        <span class="hl"><span class="kn">${h.kn}</span><span class="hi">${h.hi}</span></span>
        <span class="hi2">${esc(h.iast)}</span>
        <span class="bar"><span class="track"><i style="width:${pct}%"></i></span><span class="pv">${pct}%</span></span>
      </div>`;
    }).join('');
  }

  function renderPhonetic(best) {
    if (!best) { el.phonetic.innerHTML = '<span class="muted">—</span>'; return; }
    const c = BrahmiData.BY_ID.get(best.charId);
    const fam = BrahmiData.family(c.id);
    const conf = Math.round((best.score || 0) * 100);
    const weak = conf < 60;
    const head = `<p class="tagline"><span class="br" style="font-size:20px">${c.br}</span>
      <b>${c.name}</b> — ${c.desc.en} · <span class="kn">${c.desc.kn}</span> · <span class="hi">${c.desc.hi}</span>
      <br/><span class="muted">sound ≈ ${c.sound}</span>
      ${weak
        ? `<span class="warnlow">shape match only ${conf}% — weak, so this family follows a guess</span>`
        : `<span class="muted">· shape match ${conf}%</span>`}</p>`;

    if (!fam.length) {
      el.phonetic.innerHTML = head + '<span class="muted">No related characters.</span>';
      return;
    }
    el.phonetic.innerHTML = head + '<div class="phon-grid">' + fam.map(x => `
      <div class="ph">
        <div class="g">${x.br}</div>
        <div class="l"><span class="kn">${x.kn}</span><span class="hi">${x.hi}</span></div>
        <div class="i">${x.id}</div>
        <div class="d">${x.sound}</div>
      </div>`).join('') + '</div>';
  }

  function onLibraryChange() {
    if (S.marks) render(S.marks);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, onLibraryChange, loadFile };
})();
