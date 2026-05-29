// ─── Interfaz de usuario ───

let _popupId = null;

function showPopup(c, px, py) {
  _popupId = c.id;
  selectedId = c.id;

  const typeNames = { vs: 'Fuente de Voltaje', cs: 'Fuente de Corriente', r: 'Resistencia' };
  const typeUnits = { vs: 'Voltaje (V)', cs: 'Corriente (A)', r: 'Resistencia (Ω)' };

  document.getElementById('popup-title').textContent = typeNames[c.type] + ' — ' + c.name;
  document.getElementById('popup-lbl').textContent   = typeUnits[c.type];

  const { base, prefix } = splitValuePrefix(c.value);
  document.getElementById('popup-val').value    = base;
  document.getElementById('popup-prefix').value = prefix;

  const popup = document.getElementById('edit-popup');
  const wrap  = document.getElementById('canvas-wrap');
  const wr    = wrap.getBoundingClientRect();
  let left    = px - wr.left + 12;
  let top     = py - wr.top  + 12;

  if (left + 200 > wrap.clientWidth)  left = wrap.clientWidth  - 205;
  if (top  + 260 > wrap.clientHeight) top  = wrap.clientHeight - 265;
  if (left < 4) left = 4;
  if (top  < 4) top  = 4;

  popup.style.left    = left + 'px';
  popup.style.top     = top  + 'px';
  popup.style.display = 'block';

  document.getElementById('popup-val').focus();
  document.getElementById('popup-val').select();
  renderAll();
}

function rotLabel(rot) {
  const labels = {
    0:   '→  − izq / + der',
    90:  '↓  − arr / + aba',
    180: '←  + izq / − der',
    270: '↑  + arr / − aba'
  };
  return labels[rot] || '→';
}

function closePopup() {
  document.getElementById('edit-popup').style.display = 'none';
  _popupId = null;
}

function applyPopup() {
  const c = findComp(_popupId);
  if (!c) return;

  const base   = parseFloat(document.getElementById('popup-val').value);
  const prefix = parseFloat(document.getElementById('popup-prefix').value);

  if (isNaN(base)) { setStatus('⚠ Valor inválido.'); return; }

  const newVal = base * prefix;

  if (c.type === 'r' && newVal <= 0) { setStatus('⚠ La resistencia debe ser mayor a 0Ω.'); return; }
  if ((c.type === 'vs' || c.type === 'cs') && newVal === 0) { setStatus('⚠ El valor no puede ser 0.'); return; }

  c.value = newVal;
  simResults = null;
  closePopup();
  renderAll();
  setStatus(`${c.name} actualizado — ${formatValue(c.value, c.type)}`);
}

function rotateFromPopup() {}

function deleteFromPopup() {
  const c = findComp(_popupId);
  if (!c) return;
  const name = c.name;
  _saveHistory();
  components = components.filter(x => x.id !== c.id);
  wires      = wires.filter(w => w.c1 !== c.id && w.c2 !== c.id);
  simResults = null;
  closePopup();
  renderAll();
  setStatus(`${name} eliminado.`);
}

// ─── Panel de resultados ───
function renderResults() {
  const div = document.getElementById('results');
  if (!simResults) {
    div.innerHTML = '<p class="hint">Coloca componentes, conéctalos y presiona <strong>Simular</strong>.</p>';
    return;
  }

  const instruments = components.filter(c => c.type === 'vm' || c.type === 'am');

  if (instruments.length === 0) {
    div.innerHTML = '<p class="hint">Agrega voltímetros o amperímetros para ver mediciones.</p>';
    return;
  }

  let html = '<div class="res-section"><div class="res-title">Instrumentos</div>';

  for (const c of instruments) {
    const r = simResults.components[c.id];
    if (!r) continue;
    if (c.type === 'vm') {
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#9B59B6">Voltímetro</span></div>
        <div class="res-comp-vals">
          <span class="val-v">V = ${formatResult(r.v)} V</span>
        </div>
      </div>`;
    }
    if (c.type === 'am') {
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#E67E22">Amperímetro</span></div>
        <div class="res-comp-vals">
          <span class="val-i">I = ${formatResult(r.i)} A</span>
        </div>
      </div>`;
    }
  }

  html += '</div>';
  div.innerHTML = html;
}

function clearResults() {
  document.getElementById('results').innerHTML =
    '<p class="hint">Coloca componentes, conéctalos y presiona <strong>Simular</strong>.</p>';
}

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

// ─── Vincular botones ───
function bindUI() {
  document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
  document.getElementById('btn-wire').addEventListener('click',   () => setMode('wire'));
  document.getElementById('btn-delete').addEventListener('click', () => setMode('delete'));

  document.getElementById('btn-simulate').addEventListener('click', () => {
    const ok = runSimulation();
    if (ok) {
      renderAll();
      renderResults();
      document.getElementById('btn-simulate').style.display = 'none';
      document.getElementById('btn-stop').style.display = '';
      // Bloquear botones de edición
      ['btn-select','btn-wire','btn-rotate','btn-undo','btn-delete'].forEach(id => {
        const btn = document.getElementById(id);
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'not-allowed';
      });
      // Bloquear drag del toolbar
      document.querySelectorAll('.tool-btn[draggable]').forEach(b => b.setAttribute('draggable','false'));
      setStatus('✓ Simulación completada. Presiona Detener para editar.');
    }
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    simResults = null;
    renderAll();
    clearResults();
    document.getElementById('btn-stop').style.display = 'none';
    document.getElementById('btn-simulate').style.display = '';
    // Desbloquear botones de edición
    ['btn-select','btn-wire','btn-rotate','btn-undo','btn-delete'].forEach(id => {
      const btn = document.getElementById(id);
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    });
    // Reactivar drag del toolbar
    document.querySelectorAll('.tool-btn').forEach(b => {
      if (b.dataset.type) b.setAttribute('draggable','true');
    });
    setStatus('Simulación detenida.');
  });

  document.getElementById('btn-rotate').addEventListener('click', () => {
    if (selectedId === null) { setStatus('⚠ Selecciona un componente primero.'); return; }
    const c = findComp(selectedId);
    if (c) { rotateComponent(c); setStatus(`${c.name} — ${rotLabel(c.rot)}`); }
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    document.getElementById('btn-stop').style.display = 'none';
    document.getElementById('btn-simulate').style.display = '';
    undoLast();
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (components.length === 0 && wires.length === 0) return;
    if (confirm('¿Limpiar todo el circuito?')) {
      _saveHistory();
      document.getElementById('btn-stop').style.display = 'none';
      document.getElementById('btn-simulate').style.display = '';
      clearCircuit();
    }
  });

  document.getElementById('popup-ok').addEventListener('click',    applyPopup);
  document.getElementById('popup-del').addEventListener('click',   deleteFromPopup);
  document.getElementById('popup-close').addEventListener('click', closePopup);

  document.getElementById('popup-val').addEventListener('keydown', e => {
    if (e.key === 'Enter')  applyPopup();
    if (e.key === 'Escape') closePopup();
  });

  // ─── Nombre de archivo editable ───
  const filenameDisplay = document.getElementById('filename-display');
  const filenameInput   = document.getElementById('filename-input');

  filenameDisplay.addEventListener('dblclick', () => {
    filenameInput.value = filenameDisplay.textContent;
    filenameDisplay.style.display = 'none';
    filenameInput.style.display   = '';
    filenameInput.focus();
    filenameInput.select();
  });

  filenameInput.addEventListener('blur', () => {
    const val = filenameInput.value.trim();
    filenameDisplay.textContent     = val || 'sin_nombre';
    filenameDisplay.style.display   = '';
    filenameInput.style.display     = 'none';
  });

  filenameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') filenameInput.blur();
    if (e.key === 'Escape') {
      filenameInput.style.display   = 'none';
      filenameDisplay.style.display = '';
    }
  });
  document.querySelectorAll('.tool-btn[draggable]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('compType', btn.dataset.type);
    });
  });
// ─── Guardar circuito ───
  document.getElementById('btn-save').addEventListener('click', async () => {
    const data = {
      version: '1.0',
      components: components.map(c => ({...c})),
      wires:      wires.map(w => ({...w})),
      junctions:  junctions.map(j => ({...j}))
    };
    const json = JSON.stringify(data, null, 2);
    const filename = document.getElementById('filename-display').textContent.trim() || 'sin_nombre';
    const suggestedName = filename.endsWith('.json') ? filename : filename + '.json';

    // Usar File System Access API si está disponible (Chrome/Edge)
    if (window.showSaveFilePicker) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'Circuito CiSIPro', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        setStatus(`Circuito guardado: ${fileHandle.name}`);
      } catch (err) {
        if (err.name !== 'AbortError') setStatus('⚠ Error al guardar: ' + err.message);
      }
    } else {
      // Fallback para otros navegadores
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = suggestedName;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Circuito guardado: ${suggestedName}`);
    }
  });

  // ─── Abrir circuito ───
  document.getElementById('btn-open').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.components || !data.wires) {
          setStatus('⚠ Archivo inválido.');
          return;
        }
        _saveHistory();
        components = data.components;
        wires      = data.wires;
        junctions  = data.junctions || [];
        simResults = null;
        // Restaurar contador de IDs
        const maxId = [...components, ...wires, ...junctions]
          .reduce((m, x) => Math.max(m, x.id || 0), 0);
        _idCounter = maxId;
        renderAll();
        clearResults();
        setStatus(`Circuito cargado: ${file.name}`);
      } catch (err) {
        setStatus('⚠ Error al leer el archivo: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  document.addEventListener('keydown', e => {
    if (document.getElementById('edit-popup').style.display === 'block') return;

    if (e.key === 'Escape') {
      if (_wireStart) { cancelWire(); setStatus('Cable cancelado.'); }
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      if (selectedId === null) return;
      const c = findComp(selectedId);
      if (c) { rotateComponent(c); setStatus(`${c.name} — ${rotLabel(c.rot)}`); }
    }

    if (e.key === 'Delete') {
      // Borrar componente seleccionado
      if (selectedId !== null) {
        const c = findComp(selectedId);
        if (c) {
          _saveHistory();
          const name = c.name;
          components = components.filter(x => x.id !== c.id);
          wires      = wires.filter(w => w.c1 !== c.id && w.c2 !== c.id);
          simResults = null;
          selectedId = null;
          renderAll();
          setStatus(`${name} eliminado.`);
        }
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      document.getElementById('btn-stop').style.display = 'none';
      document.getElementById('btn-simulate').style.display = '';
      undoLast();
    }
  });
}