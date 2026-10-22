/* =========================================================================
   Glyph engine — binarisation, segmentation, normalisation, template matching
   A glyph is reduced to a 16x16 ink-density map (256 numbers). Comparison is
   Pearson correlation of those maps: robust to pen weight, size and position.
   ========================================================================= */

window.Glyph = (function () {
  const G = 32;       // intermediate grid
  const OUT = 16;     // feature grid
  const INNER = 28;   // glyph is scaled so its long side fits inside 28/32

  /* ---------- image helpers ---------- */

  function imageToImageData(img, maxDim) {
    maxDim = maxDim || 1400;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas: c, imgData: ctx.getImageData(0, 0, w, h), w, h, scale };
  }

  function otsu(gray) {
    const hist = new Int32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 127;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; t = i; }
    }
    return t;
  }

  /* luminance -> binary ink mask (polarity auto-detected) */
  function imageDataToMask(imgData) {
    const { data, width: w, height: h } = imgData;
    const gray = new Uint8ClampedArray(w * h);
    for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
      gray[p] = data[i + 3] < 40
        ? 255
        : (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    const t = otsu(gray);
    let dark = 0;
    for (let p = 0; p < gray.length; p++) if (gray[p] <= t) dark++;
    const inkIsDark = dark <= gray.length - dark;
    const mask = new Uint8Array(w * h);
    for (let p = 0; p < gray.length; p++) {
      const isInk = inkIsDark ? gray[p] <= t : gray[p] > t;
      mask[p] = isInk ? 1 : 0;
    }
    return { mask, w, h, threshold: t, inkIsDark };
  }

  /* canvas alpha -> ink mask (drawing pad) */
  function alphaToMask(imgData) {
    const { data, width: w, height: h } = imgData;
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 3; p < mask.length; p++, i += 4) mask[p] = data[i] > 90 ? 1 : 0;
    return { mask, w, h };
  }

  /* ---------- geometry ---------- */

  function bbox(mask, w, h, rect) {
    const x0 = rect ? Math.max(0, rect.x0) : 0;
    const y0 = rect ? Math.max(0, rect.y0) : 0;
    const x1 = rect ? Math.min(w - 1, rect.x1) : w - 1;
    const y1 = rect ? Math.min(h - 1, rect.y1) : h - 1;
    let ax0 = w, ay0 = h, ax1 = -1, ay1 = -1, n = 0;
    for (let y = y0; y <= y1; y++) {
      const off = y * w;
      for (let x = x0; x <= x1; x++) {
        if (!mask[off + x]) continue;
        n++;
        if (x < ax0) ax0 = x;
        if (x > ax1) ax1 = x;
        if (y < ay0) ay0 = y;
        if (y > ay1) ay1 = y;
      }
    }
    if (!n) return null;
    return { x0: ax0, y0: ay0, x1: ax1, y1: ay1, n };
  }

  function inkCount(mask, w, rect) {
    let n = 0;
    for (let y = rect.y0; y <= rect.y1; y++) {
      const off = y * w;
      for (let x = rect.x0; x <= rect.x1; x++) if (mask[off + x]) n++;
    }
    return n;
  }

  /* line bands from the horizontal ink projection */
  function segmentLines(mask, w, h) {
    const rows = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let c = 0;
      for (let x = 0; x < w; x++) if (mask[off + x]) c++;
      rows[y] = c;
    }
    const rowMin = Math.max(2, Math.round(w * 0.0015));
    const bands = [];
    let start = -1;
    for (let y = 0; y < h; y++) {
      const on = rows[y] >= rowMin;
      if (on && start < 0) start = y;
      if (!on && start >= 0) { bands.push([start, y - 1]); start = -1; }
    }
    if (start >= 0) bands.push([start, h - 1]);

    const merged = [];
    for (const b of bands) {
      if (!merged.length) { merged.push(b.slice()); continue; }
      const prev = merged[merged.length - 1];
      const gap = b[0] - prev[1] - 1;
      const prevH = prev[1] - prev[0] + 1;
      if (gap <= Math.max(2, Math.round(prevH * 0.4))) prev[1] = b[1];
      else merged.push(b.slice());
    }
    const minH = Math.max(6, Math.round(h * 0.008));
    return merged
      .filter(b => (b[1] - b[0] + 1) >= minH)
      .map(b => ({ y0: Math.max(0, b[0] - 2), y1: Math.min(h - 1, b[1] + 2) }));
  }

  /* glyph runs inside a line from the vertical ink projection */
  function segmentGlyphs(mask, w, line) {
    const { y0, y1 } = line;
    const lh = y1 - y0 + 1;
    const cols = new Int32Array(w);
    for (let y = y0; y <= y1; y++) {
      const off = y * w;
      for (let x = 0; x < w; x++) if (mask[off + x]) cols[x]++;
    }
    const runs = [];
    let start = -1;
    for (let x = 0; x < w; x++) {
      const on = cols[x] > 0;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
    }
    if (start >= 0) runs.push([start, w - 1]);

    const gapMax = Math.max(2, Math.round(lh * 0.09));
    const merged = [];
    for (const r of runs) {
      if (merged.length && r[0] - merged[merged.length - 1][1] - 1 <= gapMax) {
        merged[merged.length - 1][1] = r[1];
      } else merged.push(r.slice());
    }

    const out = [];
    for (const [a, b] of merged) {
      if (b - a + 1 < 2) continue;
      const box = bbox(mask, w, mask.length / w, { x0: a, y0, x1: b, y1 });
      if (!box || box.n < 8) continue;
      out.push(box);
    }
    return out;
  }

  /* connected components (8-connectivity) */
  function components(mask, w, h, minPix) {
    minPix = minPix || 8;
    const labels = new Int32Array(w * h);
    const out = [];
    const stack = [];
    let cur = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i0 = y * w + x;
        if (!mask[i0] || labels[i0]) continue;
        cur++;
        let minx = x, maxx = x, miny = y, maxy = y, n = 0;
        stack.length = 0;
        stack.push(i0);
        labels[i0] = cur;
        while (stack.length) {
          const p = stack.pop();
          const py = (p / w) | 0, px = p - py * w;
          n++;
          if (px < minx) minx = px;
          if (px > maxx) maxx = px;
          if (py < miny) miny = py;
          if (py > maxy) maxy = py;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = py + dy;
            if (ny < 0 || ny >= h) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = px + dx;
              if (nx < 0 || nx >= w) continue;
              const q = ny * w + nx;
              if (mask[q] && !labels[q]) { labels[q] = cur; stack.push(q); }
            }
          }
        }
        if (n >= minPix) out.push({ x0: minx, y0: miny, x1: maxx, y1: maxy, n });
      }
    }
    return out;
  }

  /* A halant cluster (e.g. ha + virama + ma) touches into one blob. Split it at
     the thinnest interior column so the parts can be matched separately. */
  function bestSplit(mask, w, box) {
    const bw = box.x1 - box.x0 + 1;
    if (bw < 12) return null;
    const from = box.x0 + Math.round(bw * 0.28);
    const to = box.x0 + Math.round(bw * 0.72);
    let cutX = -1, minV = Infinity;
    for (let x = from; x <= to; x++) {
      let v = 0;
      for (let y = box.y0; y <= box.y1; y++) if (mask[y * w + x]) v++;
      if (v < minV) { minV = v; cutX = x; }
    }
    if (cutX < 0) return null;
    const a = { x0: box.x0, y0: box.y0, x1: cutX, y1: box.y1 };
    const b = { x0: cutX + 1, y0: box.y0, x1: box.x1, y1: box.y1 };
    if (a.x1 - a.x0 + 1 < 6 || b.x1 - b.x0 + 1 < 6) return null;
    return [a, b];
  }

  function unionBox(boxes) {
    if (!boxes.length) return null;
    const b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 };
    for (const x of boxes) {
      b.x0 = Math.min(b.x0, x.x0); b.y0 = Math.min(b.y0, x.y0);
      b.x1 = Math.max(b.x1, x.x1); b.y1 = Math.max(b.y1, x.y1); b.n += x.n || 0;
    }
    return b;
  }

  /* ---------- feature extraction ---------- */

  const _src = document.createElement('canvas');
  const _dst = document.createElement('canvas');

  function maskToFeature(mask, w, h, box) {
    if (!box) box = bbox(mask, w, h);
    if (!box) return null;
    const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
    if (bw < 2 || bh < 2) return null;

    _src.width = bw; _src.height = bh;
    const sctx = _src.getContext('2d', { willReadFrequently: true });
    const id = sctx.createImageData(bw, bh);
    for (let y = 0; y < bh; y++) {
      const off = (box.y0 + y) * w + box.x0;
      for (let x = 0; x < bw; x++) {
        const v = mask[off + x] ? 0 : 255;
        const i = (y * bw + x) * 4;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
    }
    sctx.putImageData(id, 0, 0);

    _dst.width = G; _dst.height = G;
    const dctx = _dst.getContext('2d', { willReadFrequently: true });
    dctx.fillStyle = '#fff';
    dctx.fillRect(0, 0, G, G);
    const scale = INNER / Math.max(bw, bh);
    const dw = Math.max(1, Math.round(bw * scale));
    const dh = Math.max(1, Math.round(bh * scale));
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.drawImage(_src, Math.round((G - dw) / 2), Math.round((G - dh) / 2), dw, dh);

    const px = dctx.getImageData(0, 0, G, G).data;
    const f = new Float32Array(OUT * OUT);
    for (let y = 0; y < OUT; y++) {
      for (let x = 0; x < OUT; x++) {
        let s = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            s += 255 - px[((y * 2 + dy) * G + (x * 2 + dx)) * 4];
          }
        }
        f[y * OUT + x] = s / (4 * 255);
      }
    }
    return { f, ar: bw / bh, box, w: bw, h: bh };
  }

  /* mean-centred vector + its norm, cached on templates */
  function stats(f) {
    let m = 0;
    for (let i = 0; i < f.length; i++) m += f[i];
    m /= f.length;
    const c = new Float32Array(f.length);
    let ss = 0;
    for (let i = 0; i < f.length; i++) {
      const v = f[i] - m;
      c[i] = v;
      ss += v * v;
    }
    return { c, n: Math.sqrt(ss) };
  }

  function similarity(qs, ts) {
    if (!qs || !ts || qs.n < 1e-5 || ts.n < 1e-5) return 0;
    let d = 0;
    for (let i = 0; i < qs.c.length; i++) d += qs.c[i] * ts.c[i];
    const p = d / (qs.n * ts.n);
    return Math.max(0, Math.min(1, p));
  }

  /* ---------- font rendering (built-in templates) ---------- */

  const FONT_STACK = '"Noto Sans Brahmi","Segoe UI Historic","Nirmala UI","Noto Sans",serif';

  /* Every Brahmi-capable typeface we can find becomes its own template family.
     A letter drawn in Segoe UI Historic only scores ~55% against Noto shapes —
     with both families it scores ~95%. Never fall back across families here, or
     the "missing font" case silently produces tofu templates. */
  const FONT_CANDIDATES = [
    { name: 'Noto Sans Brahmi', stack: '"Noto Sans Brahmi","Noto Sans",serif' },
    { name: 'Segoe UI Historic', stack: '"Segoe UI Historic",serif' },
    { name: 'Nirmala UI', stack: '"Nirmala UI",serif' }
  ];

  const _tpl = document.createElement('canvas');

  function renderTextMask(text, fontPx, stack) {
    const size = 160;
    _tpl.width = size; _tpl.height = size;
    const ctx = _tpl.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    ctx.font = `${fontPx}px ${stack || FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);
    const d = ctx.getImageData(0, 0, size, size).data;
    const mask = new Uint8Array(size * size);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) mask[p] = d[i] < 140 ? 1 : 0;
    return { mask, w: size, h: size };
  }

  /* A combining mark alone renders with a dotted circle, so it is isolated by
     diffing "base + mark" against "base". */
  function templateFeature(char, stack) {
    const fontPx = 120;
    if (!char.combining) {
      const r = renderTextMask(char.br, fontPx, stack);
      return maskToFeature(r.mask, r.w, r.h);
    }
    const BASE = '𑀓';
    const a = renderTextMask(BASE, fontPx, stack);
    const b = renderTextMask(BASE + char.br, fontPx, stack);
    const diff = new Uint8Array(a.mask.length);
    let n = 0;
    for (let i = 0; i < diff.length; i++) {
      if (b.mask[i] && !a.mask[i]) { diff[i] = 1; n++; }
    }
    if (n >= 12) {
      const f = maskToFeature(diff, a.w, a.h);
      if (f) return f;
    }
    return maskToFeature(b.mask, b.w, b.h);
  }

  /* a family is usable only if it really draws Brahmi: two different letters
     must come out different (a missing font returns the same .notdef box) */
  function rendersBrahmi(stack) {
    const a = renderTextMask('𑀓', 100, stack);
    const box = bbox(a.mask, a.w, a.h);
    if (!box || box.n < 20) return false;
    const b = renderTextMask('𑀕', 100, stack);
    const fa = maskToFeature(a.mask, a.w, a.h);
    const fb = maskToFeature(b.mask, b.w, b.h);
    if (!fa || !fb) return false;
    return similarity(stats(fa.f), stats(fb.f)) < 0.97;
  }

  function availableBrahmiFonts() {
    const out = [];
    for (const f of FONT_CANDIDATES) {
      if (rendersBrahmi(f.stack)) out.push({ name: f.name, stack: f.stack });
    }
    return out;
  }

  /* kept for callers that only care whether *any* family works */
  function fontAvailable() {
    return availableBrahmiFonts().length > 0;
  }

  /* Aspect ratio is a strong, typeface-independent cue: a wide line-blob must
     not be able to claim it is a small mark like the virāma. 0.6 octaves of
     slack, then a linear penalty. Costs no accuracy on clean glyphs. */
  function arFactor(arQ, arT) {
    if (!arQ || !arT) return 1;
    const d = Math.abs(Math.log(arQ / arT) / Math.LN2);
    return Math.max(0, 1 - Math.max(0, d - 0.6) * 0.55);
  }

  /* ---------- display helpers ---------- */

  const _cropTmp = document.createElement('canvas');

  function cropDataURL(imgData, box, max, pad) {
    pad = pad === undefined ? 2 : pad;
    const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
    const x1 = Math.min(imgData.width - 1, box.x1 + pad), y1 = Math.min(imgData.height - 1, box.y1 + pad);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    max = max || 120;
    const scale = Math.max(1, Math.min(4, max / Math.max(bw, bh)));
    _cropTmp.width = imgData.width;
    _cropTmp.height = imgData.height;
    _cropTmp.getContext('2d').putImageData(imgData, 0, 0);

    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bw * scale));
    c.height = Math.max(1, Math.round(bh * scale));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(_cropTmp, x0, y0, bw, bh, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  return {
    G, OUT,
    imageToImageData, otsu, imageDataToMask, alphaToMask,
    bbox, inkCount, segmentLines, segmentGlyphs, components, unionBox, bestSplit,
    maskToFeature, stats, similarity, arFactor,
    renderTextMask, templateFeature, fontAvailable, availableBrahmiFonts, rendersBrahmi,
    cropDataURL
  };
})();
