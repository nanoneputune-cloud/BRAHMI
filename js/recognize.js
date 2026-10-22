/* =========================================================================
   Recognize — upload / paste / drop an image, segment it into lines, marks and
   words, match every mark, and report the result in three languages.

   The overlay is its own canvas above the image, so toggling or fading it never
   touches the segmentation: geometry stays fixed, only opacity changes.
   ========================================================================= */

window.Recognize = (function () {
  const ZOOMS = [0, 1, 1.5, 2, 3];      // 0 = fit to panel
  const MARK_CAP = 40;                   // cards rendered before "show all"
  const CROP_LIMIT = 160;                // lines longer than this skip photo crops

  /* overlay label script — Brahmi, English (IAST), Kannada or Hindi */
  const SCRIPT_FONT = {
    br: '"Noto Sans Brahmi","Segoe UI Historic",serif',
    en: '"Inter","Segoe UI",system-ui,sans-serif',
    kn: '"Noto Sans Kannada","Tunga","Nirmala UI",sans-serif',
    hi: '"Noto Sans Devanagari","Mangal","Nirmala UI",sans-serif'
  };

  const S = {
    imgData: null, base: null, ov: null, srcW: 0, srcH: 0,
    result: null, fileName: '', threshold: 0.45,
    overlay: true, labels: true, opacity: 0.85, script: 'br',
    zoomIdx: 0, busy: false
  };

  let el = {};

  /* ---------------------------------------------------------------- init */
  function init() {
    el = {
      drop: document.getElementById('recDrop'),
      file: document.getElementById('recFile'),
      scroll: document.getElementById('recScroll'),
      layers: document.getElementById('recLayers'),
      empty: document.getElementById('recEmpty'),
      ctrl: document.getElementById('recCtrl'),
      results: document.getElementById('recResults'),
      stat: document.getElementById('recStat'),
      thr: document.getElementById('recThr'),
      thrVal: document.getElementById('recThrVal'),
      demo: document.getElementById('recDemo'),
      reset: document.getElementById('recReset'),
      json: document.getElementById('recJson'),
      sw: document.getElementById('ovSwitch'),
      lb: document.getElementById('ovLabels'),
      op: document.getElementById('ovOpacity'),
      opVal: document.getElementById('ovOpacityVal'),
      zin: document.getElementById('ovZoomIn'),
      zout: document.getElementById('ovZoomOut'),
      zval: document.getElementById('ovZoomVal'),
      script: document.getElementById('recScript')
    };

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

    el.thr.addEventListener('input', () => {
      S.threshold = +el.thr.value / 100;
      el.thrVal.textContent = el.thr.value + '%';
      if (S.result) { rebuildWords(); renderResults(); drawOverlay(); }
    });

    el.sw.addEventListener('click', () => {
      S.overlay = !S.overlay;
      el.sw.classList.toggle('on', S.overlay);
      applyOverlayStyle();
    });
    el.lb.addEventListener('click', () => {
      S.labels = !S.labels;
      el.lb.classList.toggle('on', S.labels);
      drawOverlay();
    });
    el.op.addEventListener('input', () => {
      S.opacity = +el.op.value / 100;
      el.opVal.textContent = el.op.value + '%';
      applyOverlayStyle();
    });
    el.zin.addEventListener('click', () => setZoom(S.zoomIdx + 1));
    el.zout.addEventListener('click', () => setZoom(S.zoomIdx - 1));

    el.script.addEventListener('click', e => {
      const b = e.target.closest('.lang');
      if (!b) return;
      S.script = b.dataset.script;
      el.script.querySelectorAll('.lang').forEach(x => x.classList.toggle('on', x === b));
      drawOverlay();
    });

    el.demo.addEventListener('click', runDemo);
    el.reset.addEventListener('click', reset);
    el.json.addEventListener('click', exportJSON);

    window.addEventListener('resize', () => { if (S.result) drawOverlay(); });

    /* clicks on a rendered mark jump to nothing, but hover titles carry detail */
  }

  /* ------------------------------------------------------------- loading */
  function loadFile(file) {
    if (!/^image\//.test(file.type)) return;
    S.fileName = file.name || 'pasted image';
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => processImage(img);
      img.onerror = () => { el.results.innerHTML = '<div class="empty">That image could not be read.</div>'; };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function reset() {
    S.imgData = null; S.base = null; S.ov = null; S.result = null; S.fileName = '';
    el.layers.innerHTML = '';
    el.layers.hidden = true;
    el.ctrl.hidden = true;
    el.script.hidden = true;
    el.empty.hidden = false;
    el.results.innerHTML = '';
    el.json.disabled = true;
    el.stat.textContent = '—';
  }

  /* ------------------------------------------------------------ pipeline */
  function processImage(source) {
    if (S.busy) return;
    S.busy = true;
    el.empty.hidden = true;
    el.stat.textContent = 'processing…';
    el.results.innerHTML = '<div class="empty">Reading the image…</div>';

    /* let the browser paint that state before the heavy pass */
    setTimeout(() => {
      try {
        run(source);
      } catch (err) {
        console.error(err);
        el.results.innerHTML = '<div class="empty">Something went wrong while reading that image.</div>';
        el.stat.textContent = 'error';
      }
      S.busy = false;
    }, 40);
  }

  function run(source) {
    const t0 = performance.now();
    const { imgData, canvas } = Glyph.imageToImageData(source, 2400);
    S.imgData = imgData;
    S.base = canvas;
    S.srcW = canvas.width;
    S.srcH = canvas.height;
    S.zoomIdx = 0;

    const { mask, w, h } = Glyph.imageDataToMask(imgData);
    const lines = Glyph.segmentLines(mask, w, h);

    const out = lines.map((line, li) => {
      const boxes = Glyph.segmentGlyphs(mask, w, line).slice(0, 4000);
      let glyphs = [];
      for (const box of boxes) glyphs = glyphs.concat(analyze(mask, w, h, box, 0));
      glyphs = glyphs.slice(0, 5000);
      return { index: li, line, glyphs, words: [] };
    });

    const total = out.reduce((a, l) => a + l.glyphs.length, 0);
    S.result = { lines: out, marks: total, ms: Math.round(performance.now() - t0) };

    buildStage();
    rebuildWords();
    renderResults();
    drawOverlay();

    el.json.disabled = false;
    el.stat.textContent = `${total} marks · ${out.length} lines`;
  }

  /* one box → one glyph, or several if it is really a cluster */
  function analyze(mask, w, h, box, depth) {
    const feat = Glyph.maskToFeature(mask, w, h, box);
    const ranked = feat ? Library.match(feat).ranked : [];
    const best = ranked[0] || null;
    const score = best ? best.score : 0;

    if (depth < 2 && score < 0.62) {
      const sp = Glyph.bestSplit(mask, w, box);
      if (sp) {
        const parts = analyze(mask, w, h, sp[0], depth + 1)
          .concat(analyze(mask, w, h, sp[1], depth + 1));
        const avg = parts.reduce((a, g) => a + (g.best ? g.best.score : 0), 0) / parts.length;
        if (parts.length && avg > score + 0.06) return parts;
      }
    }
    return [{ box, ranked: ranked.slice(0, 4), best, crop: null }];
  }

  /* -------------------------------------------------------- word grouping */
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function rebuildWords() {
    if (!S.result) return;
    for (const line of S.result.lines) {
      line.words = groupWords(line.glyphs, line.line.y1 - line.line.y0 + 1);
    }
  }

  function groupWords(glyphs, lineH) {
    if (!glyphs.length) return [];
    const gaps = [];
    for (let i = 1; i < glyphs.length; i++) {
      const g = glyphs[i].box.x0 - glyphs[i - 1].box.x1;
      if (g >= 0) gaps.push(g);
    }
    const med = median(gaps);
    const brk = Math.max(med * 1.8, lineH * 0.32);
    const groups = [];
    let cur = [glyphs[0]];
    for (let i = 1; i < glyphs.length; i++) {
      const gap = glyphs[i].box.x0 - glyphs[i - 1].box.x1;
      if (gap > brk) { groups.push(cur); cur = []; }
      cur.push(glyphs[i]);
    }
    groups.push(cur);

    return groups.map(gr => {
      const ids = gr.filter(g => g.best && g.best.score >= S.threshold).map(g => g.best.charId);
      const comp = BrahmiData.compose(ids);
      const conf = gr.reduce((a, g) => a + (g.best ? g.best.score : 0), 0) / gr.length;
      return { glyphs: gr, count: gr.length, ids, br: comp.br, kn: comp.kn, hi: comp.hi, iast: comp.iast, conf };
    });
  }

  /* -------------------------------------------------------------- stage */
  function buildStage() {
    el.layers.innerHTML = '';
    S.base.className = 'base';
    S.ov = document.createElement('canvas');
    S.ov.className = 'ov';
    el.layers.appendChild(S.base);
    el.layers.appendChild(S.ov);
    el.layers.hidden = false;
    el.ctrl.hidden = false;
    el.script.hidden = false;
    setZoom(0, true);
    applyOverlayStyle();
  }

  function applyOverlayStyle() {
    if (!S.ov) return;
    S.ov.style.display = S.overlay ? 'block' : 'none';
    S.ov.style.opacity = String(S.overlay ? S.opacity : 0);
    el.sw.classList.toggle('on', S.overlay);
  }

  function setZoom(i, silent) {
    S.zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, i));
    const z = ZOOMS[S.zoomIdx];
    el.layers.style.width = z ? (S.srcW * z) + 'px' : '100%';
    el.zval.textContent = z ? z + '×' : 'fit';
    if (!silent) requestAnimationFrame(() => drawOverlay());
  }

  function clsFor(g) {
    if (!g.best) return 'none';
    return g.best.score >= S.threshold ? '' : (g.best.score >= S.threshold * 0.7 ? 'low' : 'none');
  }

  /* what the overlay prints for a matched character */
  function labelFor(c) {
    if (!c) return '?';
    if (S.script === 'en') return c.id;
    if (S.script === 'kn') return c.kn.replace(/◌/g, '');
    if (S.script === 'hi') return c.hi.replace(/◌/g, '');
    return c.br;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawOverlay() {
    if (!S.ov || !S.result || !S.base) return;
    const rect = S.base.getBoundingClientRect();
    if (!rect.width) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (S.ov.width !== W || S.ov.height !== H) { S.ov.width = W; S.ov.height = H; }

    const ctx = S.ov.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sx = W / S.srcW, sy = H / S.srcH;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    const lw = Math.max(1.1, S.srcW / 1100);
    /* label size scales with the image: ~1.6x bigger than the first version */
    const fs = Math.max(11, S.srcW / (S.script === 'en' ? 74 : 64));
    ctx.lineWidth = lw;
    ctx.font = `${fs}px ${SCRIPT_FONT[S.script] || SCRIPT_FONT.br}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const cssPerSrc = (W / dpr) / S.srcW;
    const labelMinW = 17 / cssPerSrc;        // only label reasonably wide boxes

    for (const line of S.result.lines) {
      for (const g of line.glyphs) {
        const cls = clsFor(g);
        ctx.strokeStyle = cls === '' ? 'rgba(52,214,124,.95)'
          : cls === 'low' ? 'rgba(232,178,52,.95)' : 'rgba(230,92,98,.9)';
        ctx.strokeRect(g.box.x0, g.box.y0, g.box.x1 - g.box.x0 + 1, g.box.y1 - g.box.y0 + 1);

        if (!S.labels) continue;
        if ((g.box.x1 - g.box.x0) < labelMinW) continue;

        const c = g.best && g.best.score >= S.threshold ? BrahmiData.BY_ID.get(g.best.charId) : null;
        const txt = labelFor(c);
        const tw = ctx.measureText(txt).width;
        const padX = fs * 0.28;
        const th = fs * 1.4;
        let tx = g.box.x0;
        if (tx + tw + padX * 2 > S.srcW) tx = Math.max(0, S.srcW - tw - padX * 2);
        let ty = g.box.y0 - th * 0.1;
        if (ty - th < 0) ty = g.box.y1 + th;          // no room above → put it below

        ctx.fillStyle = 'rgba(9,11,17,.82)';
        roundRect(ctx, tx, ty - th, tw + padX * 2, th, fs * 0.3);
        ctx.fill();
        ctx.fillStyle = c ? '#ffe7b0' : '#ffb0b4';
        ctx.fillText(txt, tx + padX, ty - th / 2);
      }
    }
  }

  /* ------------------------------------------------------------ results */
  function cardHtml(g, withCrop) {
    const cls = clsFor(g);
    const c = cls === '' && g.best ? BrahmiData.BY_ID.get(g.best.charId) : null;
    const alt = g.ranked.map(r => `${r.charId} ${Math.round(r.score * 100)}%`).join(' · ');
    const title = c
      ? `${c.desc.en}\n${c.desc.kn}\n${c.desc.hi}\nsound ≈ ${c.sound}\nalternatives: ${alt}`
      : `below threshold — closest: ${alt || 'none'}`;
    const pct = g.best ? Math.round(g.best.score * 100) : 0;
    let crop = '';
    if (withCrop) {
      if (!g.crop) g.crop = Glyph.cropDataURL(S.imgData, g.box, 130);
      crop = `<div class="crop"><img src="${g.crop}" alt="" /></div>`;
    }
    return `<div class="gl ${cls}" title="${esc(title)}">
      ${crop}
      <div class="big">${c ? c.br : '?'}</div>
      <div class="langs"><span class="kn">${c ? c.kn : '–'}</span><span class="hi">${c ? c.hi : '–'}</span></div>
      <div class="iast">${c ? c.id : 'unknown'}</div>
      <div class="conf"><i style="width:${pct}%"></i></div>
      <div class="pct">${pct}%</div>
    </div>`;
  }

  function lineCard(l) {
    const matched = l.glyphs.filter(g => g.best && g.best.score >= S.threshold);
    const seq = matched.map(g => BrahmiData.BY_ID.get(g.best.charId).br).join('');
    const tr = matched.map(g => {
      const c = BrahmiData.BY_ID.get(g.best.charId);
      return c.t === 'matra' ? (c.base || '') : c.id;
    }).join(' ');

    const words = l.words.length ? l.words : [];
    const wordRow = words.filter(w => w.count > 0).map(w => {
      const cls = w.conf >= S.threshold ? '' : (w.conf >= S.threshold * 0.7 ? 'low' : 'none');
      return `<div class="wchip ${cls}" title="${esc(w.iast)}">
        <span class="wb">${w.br || '?'}</span>
        <span class="wl"><span class="kn">${w.kn || '–'}</span><span class="hi">${w.hi || '–'}</span></span>
        <span class="wi">${esc(w.iast) || '—'}</span>
        <span class="wc">${Math.round(w.conf * 100)}% · ${w.count} marks</span>
      </div>`;
    }).join('');

    const withCrop = l.glyphs.length <= CROP_LIMIT;
    const first = l.glyphs.slice(0, MARK_CAP).map(g => cardHtml(g, withCrop)).join('');
    const more = l.glyphs.length > MARK_CAP
      ? `<button class="btn ghost tiny more" data-more="${l.index}">Show all ${l.glyphs.length} marks</button>`
      : '';

    return `<div class="line-card">
      <div class="line-head">
        <h3>Line ${l.index + 1}</h3>
        <span class="seq">${seq || '—'}</span>
        <span class="tr">${esc(tr)}</span>
        <span class="stat">${matched.length}/${l.glyphs.length} matched · threshold ${Math.round(S.threshold * 100)}%</span>
      </div>
      <div class="wordrow">${wordRow}</div>
      <details class="meanings">
        <summary>${l.glyphs.length} marks — images, confidence, meanings</summary>
        <div class="gl-row" data-marks="${l.index}">${first}</div>
        ${more}
        ${withCrop ? '' : '<p class="hint">Photo crops are skipped for very long lines — the overlay on the image still marks every character.</p>'}
      </details>
    </div>`;
  }

  function renderResults() {
    const { lines, marks, ms } = S.result;
    if (!lines.length) {
      el.results.innerHTML = '<div class="empty">No text found. The image may be too faint, or the marks too small — try a cleaner scan.</div>';
      return;
    }
    el.results.innerHTML = `<div class="line-head" style="border:none;margin:16px 0 0;padding:0 0 4px">
        <h3>Result</h3>
        <span class="stat">${lines.length} line(s) · ${marks} marks · ${ms} ms</span>
      </div>` + lines.map(lineCard).join('');

    el.results.querySelectorAll('[data-more]').forEach(b => {
      b.addEventListener('click', () => appendMore(+b.dataset.more, b));
    });
  }

  function appendMore(idx, btn) {
    const l = S.result.lines[idx];
    const row = el.results.querySelector(`[data-marks="${idx}"]`);
    if (!row) return;
    const withCrop = l.glyphs.length <= CROP_LIMIT;
    let i = row.children.length;
    btn.disabled = true;

    const step = () => {
      const end = Math.min(l.glyphs.length, i + 40);
      let html = '';
      for (; i < end; i++) html += cardHtml(l.glyphs[i], withCrop);
      row.insertAdjacentHTML('beforeend', html);
      if (i < l.glyphs.length) {
        btn.textContent = `Loading ${i}/${l.glyphs.length}…`;
        requestAnimationFrame(step);
      } else {
        btn.remove();
      }
    };
    step();
  }

  /* --------------------------------------------------------------- demo */
  function runDemo() {
    const c = document.createElement('canvas');
    c.width = 840; c.height = 300;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#111318';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // five separate letters — the case the library is built for
    ctx.font = '54px "Noto Sans Brahmi","Segoe UI Historic",serif';
    ctx.fillText('𑀓  𑀔  𑀕  𑀖  𑀗', 46, 80);

    // a real word with a halant cluster: reported honestly, not guessed
    ctx.font = '58px "Noto Sans Brahmi","Segoe UI Historic",serif';
    ctx.fillText('𑀩𑀭𑀳𑁆𑀫𑀻 𑀮𑀺𑀧𑀺', 46, 200);

    S.fileName = 'demo-line.png';
    processImage(c);
  }

  /* -------------------------------------------------------------- export */
  function exportJSON() {
    if (!S.result) return;
    const payload = {
      app: 'brahmi-lipi-studio',
      source: S.fileName || 'image',
      generated: new Date().toISOString(),
      threshold: S.threshold,
      lines: S.result.lines.map(l => ({
        line: l.index + 1,
        words: l.words.map(w => ({
          brahmi: w.br, kannada: w.kn, hindi: w.hi, iast: w.iast,
          marks: w.count, confidence: +w.conf.toFixed(3)
        })),
        glyphs: l.glyphs.map(g => {
          const c = g.best ? BrahmiData.BY_ID.get(g.best.charId) : null;
          const ok = c && g.best.score >= S.threshold;
          return {
            recognized: ok ? c.id : null,
            brahmi: ok ? c.br : null,
            kannada: ok ? c.kn : null,
            hindi: ok ? c.hi : null,
            name: ok ? c.name : null,
            sound: ok ? c.sound : null,
            meaning: ok ? { en: c.desc.en, kn: c.desc.kn, hi: c.desc.hi } : null,
            confidence: g.best ? +g.best.score.toFixed(3) : 0,
            box: { x: g.box.x0, y: g.box.y0, w: g.box.x1 - g.box.x0 + 1, h: g.box.y1 - g.box.y0 + 1 },
            alternatives: g.ranked.map(r => ({ id: r.charId, score: +r.score.toFixed(3) }))
          };
        })
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brahmi-recognition.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, loadFile, runDemo, reset };
})();
