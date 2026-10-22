/* =========================================================================
   DrawPad — pointer drawing surface with undo, brush size and ink extraction.
   Strokes are stored as point lists so the canvas can be replayed on undo.
   ========================================================================= */

class DrawPad {
  constructor(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.size = canvas.width || 512;
    this.brush = opts.brush || 13;
    this.strokes = [];
    this.current = null;
    this.drawing = false;
    this.onChange = opts.onChange || function () {};
    this.emitTimer = null;
    this._bind();
    this.clear(true);
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.size / r.width),
      y: (e.clientY - r.top) * (this.size / r.height)
    };
  }

  _style() {
    const c = this.ctx;
    c.lineWidth = this.brush;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#171a21';
    c.fillStyle = '#171a21';
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.drawing = true;
      const p = this._pos(e);
      this.current = [p];
      this.strokes.push(this.current);
      this._style();
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, Math.max(1, this.brush / 2), 0, Math.PI * 2);
      this.ctx.fill();
      this._queue(60);
    });

    c.addEventListener('pointermove', e => {
      if (!this.drawing || !this.current) return;
      e.preventDefault();
      const p = this._pos(e);
      const prev = this.current[this.current.length - 1];
      const dx = p.x - prev.x, dy = p.y - prev.y;
      if (dx * dx + dy * dy < 1.2) return;
      this._style();
      this.ctx.beginPath();
      this.ctx.moveTo(prev.x, prev.y);
      this.ctx.lineTo(p.x, p.y);
      this.ctx.stroke();
      this.current.push(p);
      this._queue(260);
    });

    const end = e => {
      if (!this.drawing) return;
      this.drawing = false;
      this.current = null;
      this._queue(0);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', e => { if (this.drawing && e.buttons === 0) end(); });
  }

  _queue(delay) {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    if (delay === 0) {
      this.onChange(this);
      return;
    }
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.onChange(this); }, delay);
  }

  _replay() {
    const c = this.ctx;
    c.clearRect(0, 0, this.size, this.size);
    this._style();
    for (const stroke of this.strokes) {
      if (!stroke.length) continue;
      if (stroke.length === 1) {
        c.beginPath();
        c.arc(stroke[0].x, stroke[0].y, Math.max(1, this.brush / 2), 0, Math.PI * 2);
        c.fill();
        continue;
      }
      c.beginPath();
      c.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) c.lineTo(stroke[i].x, stroke[i].y);
      c.stroke();
    }
  }

  setBrush(px) { this.brush = px; }

  undo() {
    this.strokes.pop();
    this._replay();
    this._queue(0);
  }

  clear(silent) {
    this.strokes = [];
    this.ctx.clearRect(0, 0, this.size, this.size);
    if (!silent) this._queue(0);
  }

  isEmpty() {
    const d = this.ctx.getImageData(0, 0, this.size, this.size);
    return !Glyph.bbox(Glyph.alphaToMask(d).mask, this.size, this.size);
  }

  /** normalised 16x16 ink map + aspect ratio of whatever is drawn */
  feature() {
    const d = this.ctx.getImageData(0, 0, this.size, this.size);
    const { mask, w, h } = Glyph.alphaToMask(d);
    const box = Glyph.bbox(mask, w, h);
    if (!box) return null;
    return Glyph.maskToFeature(mask, w, h, box);
  }

  /** small PNG of the drawn glyph, for the trained-sample list */
  thumbnail(max) {
    max = max || 132;
    const d = this.ctx.getImageData(0, 0, this.size, this.size);
    const { mask, w, h } = Glyph.alphaToMask(d);
    const box = Glyph.bbox(mask, w, h);
    if (!box) return '';
    const pad = Math.round(Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.08) + 2;
    const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
    const x1 = Math.min(this.size - 1, box.x1 + pad), y1 = Math.min(this.size - 1, box.y1 + pad);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    const c = document.createElement('canvas');
    const scale = Math.min(3, max / Math.max(bw, bh));
    c.width = Math.max(1, Math.round(bw * scale));
    c.height = Math.max(1, Math.round(bh * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f0e2';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, x0, y0, bw, bh, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
}

window.DrawPad = DrawPad;
