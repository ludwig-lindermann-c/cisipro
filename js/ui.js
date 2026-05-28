// ─── Interfaz de usuario ───

let _popupId = null;

function showPopup(c, px, py) {
  _popupId = c.id;
  selectedId = c.id;

  const typeNames = { vs: 'Fuente de Voltaje', cs: 'Fuente de Corriente', r: 'Resistencia' };
  const typeUnits = { vs: 'Voltaje (V)', cs: 'Corriente (A)', r: 'Resistencia (Ω)' };

  document.getElementById('popup-title').textContent = typeNames[c.type] + ' — ' + c.name;
  document.getElementById('popup-lbl').textContent   = typeUnits[c.type];
  // Separar valor en número base y prefijo
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

  let html = '';

  html += '<div class="res-section"><div class="res-title">Tensiones de nodo</div>';
  html += '<div class="res-row"><span class="res-label">Nodo 0 (GND)</span><span class="res-val val-v">0.0000 V</span></div>';
  for (let i = 1; i <= simResults.nodeCount; i++) {
    html += `<div class="res-row"><span class="res-label">Nodo ${i}</span><span class="res-val val-v">${formatResult(simResults.nodes[i])} V</span></div>`;
  }
  html += '</div>';

  html += '<div class="res-section"><div class="res-title">Componentes</div>';
  for (const c of components) {
    const r = simResults.components[c.id];
    if (!r) continue;
    const badges = { vs: 'Fuente V', cs: 'Fuente I', r: 'Resistor' };
    html += `<div class="res-comp">
      <div class="res-comp-name">${c.name} <span style="font-size:9px;font-weight:400;color:#888">${badges[c.type] || ''}</span></div>
      <div class="res-comp-vals">
        ${r.v !== undefined ? `<span class="val-v">V = ${formatResult(r.v)} V</span>` : ''}
        ${r.i !== undefined ? `<span class="val-i">I = ${formatResult(r.i)} A</span>` : ''}
        ${r.p !== undefined ? `<span class="val-p">P = ${formatResult(r.p)} W</span>` : ''}
      </div>
    </div>`;
  }
  html += '</div>';

  let pSupply = 0, pDissip = 0;
  for (const c of components) {
    const r = simResults.components[c.id];
    if (!r || r.p === undefined) continue;
    if (c.type === 'vs' || c.type === 'cs') pSupply += Math.abs(r.p);
    else pDissip += Math.abs(r.p);
  }
  const diff = Math.abs(pSupply - pDissip);
  const ok   = diff < 1e-6;

  html += `<div class="res-section"><div class="res-title">Balance de potencia</div>
    <div class="res-row"><span class="res-label">Suministrada</span><span class="res-val val-p">${formatResult(pSupply)} W</span></div>
    <div class="res-row"><span class="res-label">Disipada</span><span class="res-val val-p">${formatResult(pDissip)} W</span></div>
    <div class="res-row"><span class="res-label">Balance</span>
      <span class="res-val" style="color:${ok ? '#3B6D11' : '#E8593C'}">${ok ? '✓ OK' : '⚠ ' + formatResult(diff) + 'W'}</span>
    </div>
  </div>`;

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
    if (ok) { renderAll(); renderResults(); setStatus('✓ Simulación completada correctamente.'); }
  });
  // Botón Rotar en barra superior
  document.getElementById('btn-rotate').addEventListener('click', () => {
    if (selectedId === null) {
      setStatus('⚠ Selecciona un componente primero.');
      return;
    }
    const c = findComp(selectedId);
    if (c) {
      rotateComponent(c);
      setStatus(`${c.name} — ${rotLabel(c.rot)}`);
    }
  });
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (components.length === 0 && wires.length === 0) return;
    if (confirm('¿Limpiar todo el circuito?')) clearCircuit();
  });

  document.getElementById('popup-ok').addEventListener('click',    applyPopup);
  document.getElementById('popup-del').addEventListener('click',   deleteFromPopup);
  document.getElementById('popup-close').addEventListener('click', closePopup);

  document.getElementById('popup-val').addEventListener('keydown', e => {
    if (e.key === 'Enter')  applyPopup();
    if (e.key === 'Escape') closePopup();
  });

  document.querySelectorAll('.tool-btn[draggable]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('compType', btn.dataset.type);
    });
  });

  // Tecla R — rotar componente seleccionado
  document.addEventListener('keydown', e => {
    if (document.getElementById('edit-popup').style.display === 'block') return;
    if (e.key === 'r' || e.key === 'R') {
      if (selectedId === null) return;
      const c = findComp(selectedId);
      if (c) { rotateComponent(c); setStatus(`${c.name} — ${rotLabel(c.rot)}`); }
    }
    if (e.key === 'Delete') {
      if (selectedId === null) return;
      const c = findComp(selectedId);
      if (c) {
        const name = c.name;
        components = components.filter(x => x.id !== c.id);
        wires      = wires.filter(w => w.c1 !== c.id && w.c2 !== c.id);
        simResults = null;
        selectedId = null;
        renderAll();
        setStatus(`${name} eliminado.`);
      }
    }
  });
}