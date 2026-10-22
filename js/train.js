/* =========================================================================
   Train page — draw a glyph, assign it to a letter or an accent (mātrā),
   store the normalised ink map as a new template.
   ========================================================================= */

window.Train = (function () {
  const S = { selected: null, filter: 'all', query: '' };
  let pad = null;
  let el = {};

  function init() {
    el = {
      canvas: document.getElementById('trainPad'),
      brush: document.getElementById('trainBrush'),
      grid: document.getElementById('labelGrid'),
      search: document.getElementById('labelSearch'),
      filter: document.getElementById('labelFilter'),
      picked: document.getElementById('trainPicked'),
      save: document.getElementById('trainSave'),
      list: document.getElementById('sampleList'),
      count: document.getElementById('trainedCount'),
      exp: document.getElementById('trainedExport'),
      imp: document.getElementById('trainedImport'),
      impFile: document.getElementById('trainedImportFile'),
      clr: document.getElementById('trainedClear')
    };

    pad = new DrawPad(el.canvas, {
      brush: +el.brush.value,
      onChange: () => refreshSaveState()
    });

    el.brush.addEventListener('input', () => pad.setBrush(+el.brush.value));
    document.querySelectorAll('[data-pad="trainPad"]').forEach(b => {
      b.addEventListener('click', () => {
        if (b.dataset.act === 'undo') pad.undo();
        else pad.clear();
      });
    });

    el.search.addEventListener('input', () => { S.query = el.search.value.trim().toLowerCase(); renderGrid(); });
    el.filter.addEventListener('change', () => { S.filter = el.filter.value; renderGrid(); });

    el.grid.addEventListener('click', e => {
      const chip = e.target.closest('.cchip');
      if (!chip) return;
      select(chip.dataset.id);
    });

    el.save.addEventListener('click', saveSample);

    el.exp.addEventListener('click', exportModel);
    el.imp.addEventListener('click', () => el.impFile.click());
    el.impFile.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const n = Library.importModel(String(r.result));
          alert(n ? `Imported ${n} sample(s).` : 'No usable samples found in that file.');
        } catch (err) {
          alert('Could not read that model file: ' + err.message);
        }
      };
      r.readAsText(f);
      el.impFile.value = '';
    });
    el.clr.addEventListener('click', () => {
      if (!Library.trainedCount) return;
      if (confirm(`Delete all ${Library.trainedCount} trained sample(s)?`)) Library.clearTrained();
    });
  }

  function matches(c) {
    if (S.filter !== 'all' && c.t !== S.filter) return false;
    if (!S.query) return true;
    const hay = `${c.id} ${c.br} ${c.kn} ${c.hi} ${c.name} ${c.g} ${c.base || ''}`.toLowerCase();
    return hay.indexOf(S.query) !== -1;
  }

  function renderGrid() {
    const counts = Library.countsByChar();
    const list = BrahmiData.CHARS.filter(matches);
    if (!list.length) {
      el.grid.innerHTML = '<p class="muted" style="grid-column:1/-1">No character matches that search.</p>';
      return;
    }
    el.grid.innerHTML = list.map(c => {
      const n = counts.get(c.id) || 0;
      return `<div class="cchip${S.selected && S.selected.id === c.id ? ' on' : ''}" data-id="${c.id}"
        title="${c.name} · ${c.desc.en}">
        ${n ? `<span class="n">${n}</span>` : ''}
        <span class="g">${c.br}</span>
        <span class="t"><span class="kn">${c.kn}</span> · <span class="hi">${c.hi}</span></span>
        <span class="s">${BrahmiData.TYPE_SHORT[c.t]}</span>
      </div>`;
    }).join('');
  }

  function select(id) {
    S.selected = BrahmiData.BY_ID.get(id) || null;
    document.querySelectorAll('#labelGrid .cchip').forEach(ch => {
      ch.classList.toggle('on', ch.dataset.id === id);
    });
    renderPicked();
    refreshSaveState();
  }

  function renderPicked() {
    const c = S.selected;
    if (!c) {
      el.picked.innerHTML = '<span class="muted">No label selected — pick one below</span>';
      return;
    }
    el.picked.innerHTML = `
      <span class="pg br">${c.br}</span>
      <span>
        <span class="pn">${c.name} <span class="muted" style="font-weight:400">(${BrahmiData.TYPE_SHORT[c.t]})</span></span><br/>
        <span class="pm">
          <span class="kn">${c.kn}</span> · <span class="hi">${c.hi}</span> · <em>${c.id}</em><br/>
          <span style="font-size:11.5px">${c.desc.en}</span>
        </span>
      </span>`;
  }

  function refreshSaveState() {
    const hasInk = pad && !pad.isEmpty();
    el.save.disabled = !(hasInk && S.selected);
  }

  function saveSample() {
    if (!S.selected) return;
    const feat = pad.feature();
    if (!feat) { alert('Draw something first.'); return; }
    Library.addSample(S.selected.id, feat, pad.thumbnail(120));
    el.save.textContent = 'Saved ✓';
    setTimeout(() => { el.save.textContent = 'Save sample'; }, 1100);
    pad.clear();
    renderGrid();
    refreshSaveState();
  }

  function renderSamples() {
    const list = Library.state.trained;
    el.count.textContent = list.length;
    if (!list.length) {
      el.list.innerHTML = '<span class="muted">Nothing trained yet.</span>';
      return;
    }
    const sorted = list.slice().sort((a, b) => b.ts - a.ts);
    el.list.innerHTML = sorted.map(s => {
      const c = BrahmiData.BY_ID.get(s.charId);
      if (!c) return '';
      const when = new Date(s.ts).toLocaleString();
      return `<div class="sample">
        ${s.thumb ? `<img src="${s.thumb}" alt="" />` : `<div style="width:38px;height:38px;border-radius:6px;background:#f4efe1;display:grid;place-items:center" class="br">${c.br}</div>`}
        <div class="info">
          <b><span class="br">${c.br}</span> ${c.name}</b>
          <small><span class="kn">${c.kn}</span> · <span class="hi">${c.hi}</span> · ${BrahmiData.TYPE_SHORT[c.t]} · ${when}</small>
        </div>
        <button class="del" data-del="${s.id}" title="Delete sample">✕</button>
      </div>`;
    }).join('');

    el.list.querySelectorAll('[data-del]').forEach(b => {
      b.addEventListener('click', () => {
        Library.removeSample(b.dataset.del);
        renderGrid();
      });
    });
  }

  function exportModel() {
    if (!Library.trainedCount) { alert('Train at least one sample first.'); return; }
    const blob = new Blob([Library.exportModel()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brahmi-trained-model.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function onLibraryChange() {
    renderGrid();
    renderSamples();
    refreshSaveState();
  }

  return {
    init,
    onLibraryChange,
    get pad() { return pad; },
    select
  };
})();
