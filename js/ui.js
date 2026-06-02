// ─── Interfaz de usuario ───

let _popupId = null;

function showPopup(c, px, py) {
  _popupId = c.id;
  selectedId = c.id;

  const typeNames = { 
    vs: 'Fuente de Voltaje', 
    cs: 'Fuente de Corriente', 
    r: 'Resistencia'
  };
  
  const typeUnits = { 
    vs: 'Voltaje (V)', 
    cs: 'Corriente (A)', 
    r: 'Resistencia (Ω)'
  };

  document.getElementById('popup-title').textContent = (typeNames[c.type] || 'Componente') + ' — ' + c.name;
  document.getElementById('popup-lbl').textContent   = typeUnits[c.type] || 'Valor';

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
  
  // <<<--- AGREGAR ESTA LÍNEA PARA DEPURACIÓN --->>>
  console.log(`Componente ${c.name} actualizado: valor = ${c.value} (base=${base}, prefix=${prefix})`);
  
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

    const instruments = components.filter(c => c.type === 'vm' || c.type === 'am' || c.type === 'om' || c.type === 'wm');

  if (instruments.length === 0) {
    div.innerHTML = '<p class="hint">Agrega voltímetros o amperímetros para ver mediciones.</p>';
    return;
  }

  const selectStyle = `font-size:10px;padding:2px 4px;border:0.5px solid var(--border-md);
    border-radius:4px;background:var(--bg-secondary);color:var(--text-secondary)`;

  let html = '<div class="res-section"><div class="res-title">Instrumentos</div>';

  for (const c of instruments) {
    const r = simResults.components[c.id];
    if (!r) continue;

    if (c.type === 'vm') {
      const raw = r.v;
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#9B59B6">Voltímetro</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span class="val-v" id="disp-${c.id}" style="font-family:monospace;font-size:12px;min-width:90px">${_fmtSig(raw, 1)} V</span>
          <select id="prefix-${c.id}" onchange="updateDisplay('${c.id}',${raw},'V',this.value)"
            style="${selectStyle}">
            <option value="1e9">GV</option>
            <option value="1e6">MV</option>
            <option value="1e3">kV</option>
            <option value="1" selected>V</option>
            <option value="1e-3">mV</option>
            <option value="1e-6">μV</option>
            <option value="1e-9">nV</option>
          </select>
        </div>
      </div>`;
    }

    if (c.type === 'am') {
      const raw = r.i;
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#E67E22">Amperímetro</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span class="val-i" id="disp-${c.id}" style="font-family:monospace;font-size:12px;min-width:90px">${_fmtSig(raw, 1)} A</span>
          <select id="prefix-${c.id}" onchange="updateDisplay('${c.id}',${raw},'A',this.value)"
            style="${selectStyle}">
            <option value="1e3">kA</option>
            <option value="1" selected>A</option>
            <option value="1e-3">mA</option>
            <option value="1e-6">μA</option>
            <option value="1e-9">nA</option>
          </select>
        </div>
      </div>`;
    }

    if (c.type === 'om') {
      const raw = r.r;
      const display = raw === Infinity ? '∞ (circuito abierto)' : _fmtSig(raw, 1) + ' Ω';
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#27AE60">Óhmetro</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span style="font-family:monospace;font-size:12px;min-width:90px;color:#27AE60"
            id="disp-${c.id}">${display}</span>
          ${raw !== Infinity ? `
          <select id="prefix-${c.id}" onchange="updateDisplayOhm('${c.id}',${raw},this.value)"
            style="${selectStyle}">
            <option value="1e9">GΩ</option>
            <option value="1e6">MΩ</option>
            <option value="1e3">kΩ</option>
            <option value="1" selected>Ω</option>
            <option value="1e-3">mΩ</option>
          </select>` : ''}
        </div>
      </div>`;
    }
            if (c.type === 'wm') {
      const raw = r.p;
      html += `<div class="res-comp">
        <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#F39C12">Wattímetro</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <span class="val-p" id="disp-${c.id}" style="font-family:monospace;font-size:12px;min-width:90px">${_fmtSig(raw, 1)} W</span>
          <select id="prefix-${c.id}" onchange="updateDisplay('${c.id}',${raw},'W',this.value)"
            style="${selectStyle}">
            <option value="1e12">TW</option>
            <option value="1e9">GW</option>
            <option value="1e6">MW</option>
            <option value="1e3">kW</option>
            <option value="1" selected>W</option>
            <option value="1e-3">mW</option>
            <option value="1e-6">μW</option>
          </select>
        </div>
      </div>`;
    }
  }

  html += '</div>';
  div.innerHTML = html;
}

function _fmtSig(value, prefix) {
  const converted = value / prefix;
  const s = parseFloat(converted.toPrecision(4)).toString();
  return s;
}

function updateDisplay(id, rawValue, unit, prefixStr) {
  const prefix = parseFloat(prefixStr);
  const prefixLabels = {
    '1e9': 'G', '1e6': 'M', '1e3': 'k',
    '1': '', '1e-3': 'm', '1e-6': 'μ', '1e-9': 'n'
  };
  const label     = prefixLabels[prefixStr] || '';
  const converted = rawValue / prefix;
  const display   = parseFloat(converted.toPrecision(4)).toString();
  const el = document.getElementById('disp-' + id);
  if (el) el.textContent = `${display} ${label}${unit}`;
}

function updateDisplay(id, rawValue, unit, prefixStr, decimals) {
  const prefix = parseFloat(prefixStr);
  const dec    = parseInt(decimals);
  const converted = rawValue / prefix;
  const prefixLabels = {
    '1e9': 'G', '1e6': 'M', '1e3': 'k',
    '1': '', '1e-3': 'm', '1e-6': 'μ', '1e-9': 'n'
  };
  const label = prefixLabels[prefixStr] || '';
  const el = document.getElementById('disp-' + id);
  if (el) el.textContent = `${converted.toFixed(dec)} ${label}${unit}`;
}

function updateDisplay(id, rawValue, unit, prefixStr) {
  const prefix = parseFloat(prefixStr);
  const converted = rawValue / prefix;
  const prefixLabels = {
    '1e9': 'G', '1e6': 'M', '1e3': 'k',
    '1': '', '1e-3': 'm', '1e-6': 'μ', '1e-9': 'n'
  };
  const label = prefixLabels[prefixStr] || '';
  const el = document.getElementById('disp-' + id);
  if (el) el.textContent = `${parseFloat(converted.toPrecision(5))} ${label}${unit}`;
}

function updateDisplayOhm(id, rawValue, prefixStr) {
  const prefix = parseFloat(prefixStr);
  const prefixLabels = {
    '1e9': 'G', '1e6': 'M', '1e3': 'k',
    '1': '', '1e-3': 'm'
  };
  const label     = prefixLabels[prefixStr] || '';
  const converted = rawValue / prefix;
  const display   = parseFloat(converted.toPrecision(4)).toString();
  const el = document.getElementById('disp-' + id);
  if (el) el.textContent = `${display} ${label}Ω`;
}

function clearResults() {
  document.getElementById('results').innerHTML =
    '<p class="hint">Coloca componentes, conéctalos y presiona <strong>Simular</strong>.</p>';
}

function setStatus(msg) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) statusDiv.textContent = msg;
}

// ─── Vincular botones ───
function bindUI() {
  document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
  document.getElementById('btn-wire').addEventListener('click',   () => setMode('wire'));
  document.getElementById('btn-delete').addEventListener('click', () => setMode('delete'));

  document.getElementById('btn-simulate').addEventListener('click', () => {
    renderAll();
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
      _saveHistory();           // Guardar el estado ANTES de limpiar
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
  // Asegurar que todos los tool-btn sean draggable
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.dataset.type) {
      btn.setAttribute('draggable', 'true');
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
        const maxId = [...components, ...wires, ...junctions]
          .reduce((m, x) => Math.max(m, x.id || 0), 0);
        _idCounter = maxId;
                // Reiniciar contador de nombres por tipo
        for (let key in _typeCount) delete _typeCount[key];
        components.forEach(c => {
          const type = c.type;
          _typeCount[type] = (_typeCount[type] || 0) + 1;
        });

        // Mostrar nombre del archivo sin extensión
        const nameWithoutExt = file.name.replace(/\.json$/i, '');
        document.getElementById('filename-display').textContent = nameWithoutExt;
        document.getElementById('filename-input').value = nameWithoutExt;

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

  // ─── Contador de componentes en el panel de estado ───
  function updateComponentCount() {
    const count = components.length;
    const statusDiv = document.getElementById('status');
    if (statusDiv && !statusDiv.textContent.includes('⚠') && !statusDiv.textContent.includes('✓')) {
      if (count === 0) {
        statusDiv.textContent = 'Circuito vacío. Arrastra componentes para comenzar.';
      } else {
        statusDiv.textContent = `${count} componente${count !== 1 ? 's' : ''} en el circuito.`;
      }
    }
  }
  
  // Actualizar cada vez que se renderiza
  const originalRenderAll = window.renderAll;
  window.renderAll = function() {
    if (originalRenderAll) originalRenderAll();
    updateComponentCount();
  };
  
  // Inicializar contador
  updateComponentCount();
}  // <--- Esta es la llave de cierre de bindUI