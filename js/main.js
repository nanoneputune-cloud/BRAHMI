/* =========================================================================
   Bootstrap — tabs, status chips, Ctrl+V paste routing, module wiring
   ========================================================================= */

(function () {
  function switchView(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 220);
    }, 1900);
  }

  function updateStatus() {
    const chipFont = document.getElementById('chipFont');
    const chipTpl = document.getElementById('chipTemplates');
    const chipTr = document.getElementById('chipTrained');

    if (Library.state.fontOk) {
      chipFont.textContent = 'Brahmi font: ready';
      chipFont.className = 'chip good';
    } else {
      chipFont.textContent = 'Brahmi font: not found — train or go online';
      chipFont.className = 'chip bad';
      chipFont.title = 'No installed font renders Brahmi on this machine and the web font did not load. Built-in templates are disabled; trained samples still work.';
    }
    chipTpl.textContent = `${Library.state.builtin.length} templates`;
    if (Library.fontCount > 1) {
      chipTpl.textContent += ` · ${Library.fontCount} fonts`;
      chipTpl.title = 'Templates from: ' + Library.state.fonts.map(f => f.name).join(', ');
    }
    chipTr.textContent = `${Library.trainedCount} trained`;
    chipTr.className = 'chip' + (Library.trainedCount ? ' good' : '');
  }

  /* Ctrl+V anywhere: route the clipboard image to the visible page */
  function findImageInClipboard(dt) {
    if (!dt) return null;
    const items = Array.from(dt.items || []);
    for (const it of items) {
      if (it.kind === 'file' && /^image\//.test(it.type)) {
        const f = it.getAsFile();
        if (f) return f;
      }
    }
    const files = Array.from(dt.files || []);
    return files.find(f => /^image\//.test(f.type)) || null;
  }

  function onPaste(e) {
    const file = findImageInClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const active = document.querySelector('.view.active');
    const id = active ? active.id : '';

    if (id === 'view-similar') {
      Similar.loadFile(file);
      toast('Image pasted — matching largest glyph');
    } else if (id === 'view-recognize') {
      Recognize.loadFile(file);
      toast('Image pasted — scanning every mark');
    } else {
      switchView('recognize');
      Recognize.loadFile(file);
      toast('Image pasted — scanning in Recognize');
    }
  }

  function boot() {
    document.getElementById('tabs').addEventListener('click', e => {
      const t = e.target.closest('.tab');
      if (t) switchView(t.dataset.view);
    });

    Train.init();
    Recognize.init();
    Similar.init();

    Library.setOnChange(function () {
      updateStatus();
      Train.onLibraryChange();
      Similar.onLibraryChange();
    });

    document.addEventListener('paste', onPaste);
    document.getElementById('recDemo').disabled = true;
    updateStatus();

    Library.init().then(() => {
      updateStatus();
      Train.onLibraryChange();
      document.getElementById('recDemo').disabled = false;
      if (!Library.state.fontOk) console.warn('Brahmi font unavailable — built-in templates disabled.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
