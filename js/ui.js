// ─── Interfaz de usuario ───

// ─── Popup de edición ───
let _popupId = null;

function showPopup(c, px, py) {
  _popupId = c.id;
  selectedId = c.id;

  const typeNames = {
    vs: 'Fuente de Voltaje',
    cs: 'Fuente de Corriente',
    r:  'Resistencia'
  };
  const typeUnits = {
    vs: 'Voltaje (V)',
    cs: 'Corriente (A)',
    r:  'Resistencia (Ω)'
  };

  document.getElementById('popup-title').textContent =
    typeNames[c.type] + ' — ' + c.name;
  document.getElementById('popup-lbl').textContent =
    typeUnits[c.type];
  document.getElementById('popup-val').value = c.value;
  document.getElementById('popup-dir').value = c.dir;

  // Posicionar popup dentro del canvas-wrap
  const wrap = document.getElementById('canvas-wrap');
  const wr   = wrap.getBoundingClientRect();
  let left   = px - wr.left + 12;
  let top    = py - wr.top  + 12;

  // Evitar que se salga del contenedor
  if (left + 190 > wrap.clientWidth)  left = wrap.clientWidth  - 195;
  if (top  + 220 > wrap.clientHeight) top  = wrap.clientHeight - 225;

  const popup = document.getElementById('edit-popup');
  popup.style.left    = left + 'px';
  popup.style.top     = top  + 'px';
  popup.style.display = 'block';

  document.getElementById('popup-val').focus();
  document.getElementById('popup-val').select();

  renderAll();
}

function closePopup() {
  document.getElementById('edit-popup').style.display = 'none';
  _popupId = null;
}

function applyPopup() {
  const c = findComp(_popupId);
  if (!c) return;

  const newVal = parseFloat(document.getElementById('popup-val').value);
  if (isNaN(newVal)) {
    setStatus('⚠ Valor inválido.');
    return;
  }
  if (c.type === 'r' && newVal <= 0) {
    setStatus('⚠ La resistencia debe ser mayor a 0Ω.');
    return;
  }

  c.value = newVal;

  const newDir = document.getElementById('popup-dir').value;
  if (newDir !== c.dir) {
    c.dir = newDir;
    // Intercambiar w y h al rotar
    const tmp = c.w;
    c.w = c.h;
    c.h = tmp;
  }

  simResults = null;
  closePopup();
  renderAll();
  setStatus(`${c.name} actualizado.`);
}

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

  // Tensiones de nodo
  html += '<div class="res-section">';
  html += '<div class="res-title">Tensiones de nodo</div>';
  html += '<div class="res-row"><span class="res-label">Nodo 0 (GND)</span><span class="res-val val-v">0.0000 V</span></div>';
  for (let i = 1; i <= simResults.nodeCount; i++) {
    const v = simResults.nodes[i];
    html += `<div class="res-row">
      <span class="res-label">Nodo ${i}</span>
      <span class="res-val val-v">${formatResult(v)} V</span>
    </div>`;
  }
  html += '</div>';

  // Componentes
  html += '<div class="res-section">';
  html += '<div class="res-title">Componentes</div>';

  for (const c of components) {
    const r = simResults.components[c.id];
    if (!r) continue;

    html += `<div class="res-comp">
      <div class="res-comp-name">${c.name}`;

    // Badge de tipo
    const badges = { vs: 'Fuente V', cs: 'Fuente I', r: 'Resistor' };
    html += ` <span style="font-size:9px;font-weight:400;color:#888">${badges[c.type] || ''}</span>`;
    html += '</div>';
    html += '<div class="res-comp-vals">';

    if (r.v !== undefined)
      html += `<span class="val-v">V = ${formatResult(r.v)} V</span>`;
    if (r.i !== undefined)
      html += `<span class="val-i">I = ${formatResult(r.i)} A</span>`;
    if (r.p !== undefined)
      html += `<span class="val-p">P = ${formatResult(r.p)} W</span>`;

    html += '</div></div>';
  }
  html += '</div>';

  // Balance de potencia
  let pSupply = 0, pDissip = 0;
  for (const c of components) {
    const r = simResults.components[c.id];
    if (!r || r.p === undefined) continue;
    if (c.type === 'vs' || c.type === 'cs') pSupply += Math.abs(r.p);
    else pDissip += Math.abs(r.p);
  }

  html += '<div class="res-section">';
  html += '<div class="res-title">Balance de potencia</div>';
  html += `<div class="res-row">
    <span class="res-label">Suministrada</span>
    <span class="res-val val-p">${formatResult(pSupply)} W</span>
  </div>`;
  html += `<div class="res-row">
    <span class="res-label">Disipada</span>
    <span class="res-val val-p">${formatResult(pDissip)} W</span>
  </div>`;

  // Verificación de balance
  const diff = Math.abs(pSupply - pDissip);
  const ok   = diff < 1e-6;
  html += `<div class="res-row">
    <span class="res-label">Balance</span>
    <span class="res-val" style="color:${ok ? '#3B6D11' : '#E8593C'}">
      ${ok ? '✓ OK' : '⚠ ' + formatResult(diff) + 'W'}
    </span>
  </div>`;
  html += '</div>';

  div.innerHTML = html;
}

function clearResults() {
  document.getElementById('results').innerHTML =
    '<p class="hint">Coloca componentes, conéctalos y presiona <strong>Simular</strong>.</p>';
}

// ─── Barra de estado ───
function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

// ─── Vincular botones de UI ───
function bindUI() {
  // Modos
  document.getElementById('btn-select').addEventListener('click', () => setMode('select'));
  document.getElementById('btn-wire').addEventListener('click',   () => setMode('wire'));
  document.getElementById('btn-delete').addEventListener('click', () => setMode('delete'));

  // Simular
  document.getElementById('btn-simulate').addEventListener('click', () => {
    const ok = runSimulation();
    if (ok) {
      renderAll();
      renderResults();
      setStatus('✓ Simulación completada correctamente.');
    }
  });

  // Limpiar
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (components.length === 0 && wires.length === 0) return;
    const conf = confirm('¿Limpiar todo el circuito?');
    if (conf) clearCircuit();
  });

  // Popup — botones
  document.getElementById('popup-ok').addEventListener('click',    applyPopup);
  document.getElementById('popup-del').addEventListener('click',   deleteFromPopup);
  document.getElementById('popup-close').addEventListener('click', closePopup);

  // Popup — Enter para aplicar
  document.getElementById('popup-val').addEventListener('keydown', e => {
    if (e.key === 'Enter')  applyPopup();
    if (e.key === 'Escape') closePopup();
  });

  // Toolbar drag
  document.querySelectorAll('.tool-btn[draggable]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('compType', btn.dataset.type);
    });
  });
}