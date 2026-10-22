/* =========================================================================
   Glyph library — built-in templates rendered from every available Brahmi
   typeface, plus the samples the user trains by drawing. Everything is matched
   in one pass.

   Two things decide a match:
     • shape  — Pearson correlation of 16x16 ink maps
     • aspect — a wide blob may not claim to be a narrow mark
   ========================================================================= */

window.Library = (function () {
  const KEY = 'brahmi.studio.samples.v1';

  const state = {
    builtin: [],      // {charId, f, st, ar, source:'builtin', font}
    trained: [],      // {id, charId, f, st, ar, thumb, ts}
    fonts: [],        // [{name, stack}]
    fontOk: false,
    ready: false
  };

  let onChange = () => {};
  function setOnChange(fn) { onChange = fn || (() => {}); }
  function emit() { onChange(); }

  /* ---------- storage ---------- */

  function encodeFeat(f) {
    const u = new Uint8Array(f.length);
    for (let i = 0; i < f.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(f[i] * 255)));
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function decodeFeat(b64) {
    try {
      const s = atob(b64);
      if (s.length !== 256) return null;
      const f = new Float32Array(256);
      for (let i = 0; i < 256; i++) f[i] = s.charCodeAt(i) / 255;
      return f;
    } catch (e) { return null; }
  }

  function loadTrained() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(s => {
        const f = typeof s.d === 'string' ? decodeFeat(s.d) : null;
        if (!f || !s.c) return null;
        return {
          id: s.i || ('s' + Math.random().toString(36).slice(2)),
          charId: s.c, f, st: Glyph.stats(f),
          ar: typeof s.r === 'number' ? s.r : null,
          thumb: s.t || '', ts: s.ts || 0
        };
      }).filter(Boolean);
    } catch (e) {
      console.warn('trained samples unreadable', e);
      return [];
    }
  }

  function persist() {
    const arr = state.trained.map(s => ({
      i: s.id, c: s.charId, d: encodeFeat(s.f),
      r: s.ar ? +s.ar.toFixed(4) : undefined,
      t: s.thumb, ts: s.ts
    }));
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('could not save samples', e);
      alert('Could not save: browser storage is full or blocked.');
    }
  }

  /* ---------- build ---------- */

  function buildBuiltin() {
    const out = [];
    for (const font of state.fonts) {
      for (const c of BrahmiData.CHARS) {
        const feat = Glyph.templateFeature(c, font.stack);
        if (!feat) continue;
        out.push({
          charId: c.id, f: feat.f, st: Glyph.stats(feat.f), ar: feat.ar,
          source: 'builtin', font: font.name
        });
      }
    }
    return out;
  }

  function init() {
    return new Promise(resolve => {
      const start = () => {
        state.fonts = Glyph.availableBrahmiFonts();
        state.fontOk = state.fonts.length > 0;
        state.builtin = buildBuiltin();
        state.trained = loadTrained();
        state.ready = true;
        emit();
        resolve(state);

        /* The webfont is loaded lazily; if it was not ready when we looked,
           look once more shortly after instead of silently running with one
           template family. */
        if (!state.fonts.some(f => f.name === 'Noto Sans Brahmi')) {
          setTimeout(() => {
            if (Glyph.rendersBrahmi('"Noto Sans Brahmi","Noto Sans",serif')) reloadBuiltin();
          }, 1500);
        }
      };

      /* make sure the Brahmi webfont is actually requested before probing */
      const warm = (document.fonts && document.fonts.load)
        ? document.fonts.load('24px "Noto Sans Brahmi"', '𑀓𑀕').catch(() => {})
        : Promise.resolve();

      const ready = (document.fonts && document.fonts.ready)
        ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))])
        : Promise.resolve();

      Promise.all([warm, ready]).then(() => setTimeout(start, 60)).catch(start);
    });
  }

  function reloadBuiltin() {
    state.fonts = Glyph.availableBrahmiFonts();
    state.fontOk = state.fonts.length > 0;
    state.builtin = buildBuiltin();
    emit();
  }

  /* ---------- matching ---------- */

  function all() {
    return state.builtin.concat(state.trained.map(t => ({
      charId: t.charId, f: t.f, st: t.st, ar: t.ar, source: 'trained'
    })));
  }

  /**
   * Rank every known character against a feature.
   * @param {{f:Float32Array, ar:number}|Float32Array} feature
   * @returns {{ranked: Array, best: object|null}}
   */
  function match(feature) {
    if (!feature) return { ranked: [], best: null };
    const vec = feature.f || feature;
    const ar = feature.f ? feature.ar : null;
    const qs = Glyph.stats(vec);
    if (qs.n < 1e-5) return { ranked: [], best: null };

    const per = new Map();
    for (const t of all()) {
      let s = Glyph.similarity(qs, t.st);
      if (ar && t.ar) s *= Glyph.arFactor(ar, t.ar);

      const cur = per.get(t.charId);
      if (!cur) {
        per.set(t.charId, { charId: t.charId, score: s, source: t.source, hits: 1 });
      } else {
        cur.hits++;
        if (s > cur.score) { cur.score = s; cur.source = t.source; }
      }
    }
    const ranked = [...per.values()].sort((a, b) => b.score - a.score);
    return { ranked, best: ranked[0] || null };
  }

  /* ---------- CRUD ---------- */

  function addSample(charId, feature, thumb) {
    const vec = feature && feature.f ? feature.f : feature;
    const ar = feature && feature.f ? feature.ar : null;
    if (!vec) return null;
    const s = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      charId, f: vec, st: Glyph.stats(vec), ar: ar || null, thumb: thumb || '', ts: Date.now()
    };
    state.trained.push(s);
    persist();
    emit();
    return s;
  }

  function removeSample(id) {
    state.trained = state.trained.filter(s => s.id !== id);
    persist();
    emit();
  }

  function clearTrained() {
    state.trained = [];
    persist();
    emit();
  }

  function countsByChar() {
    const m = new Map();
    for (const s of state.trained) m.set(s.charId, (m.get(s.charId) || 0) + 1);
    return m;
  }

  function exportModel() {
    return JSON.stringify({
      app: 'brahmi-lipi-studio',
      version: 2,
      exported: new Date().toISOString(),
      samples: state.trained.map(s => ({
        c: s.charId, d: encodeFeat(s.f),
        r: s.ar ? +s.ar.toFixed(4) : undefined,
        t: s.thumb, ts: s.ts
      }))
    }, null, 2);
  }

  function importModel(text) {
    const obj = JSON.parse(text);
    const list = Array.isArray(obj) ? obj : (obj.samples || []);
    let added = 0;
    for (const s of list) {
      const f = decodeFeat(s.d);
      if (!f || !s.c || !BrahmiData.BY_ID.has(s.c)) continue;
      state.trained.push({
        id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        charId: s.c, f, st: Glyph.stats(f),
        ar: typeof s.r === 'number' ? s.r : null,
        thumb: s.t || '', ts: s.ts || Date.now()
      });
      added++;
    }
    persist();
    emit();
    return added;
  }

  return {
    init, reloadBuiltin, match, all, addSample, removeSample, clearTrained,
    countsByChar, exportModel, importModel, setOnChange,
    get state() { return state; },
    get trainedCount() { return state.trained.length; },
    get templateCount() { return state.builtin.length + state.trained.length; },
    get fontCount() { return state.fonts.length; }
  };
})();
