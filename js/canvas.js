// ─── Gestión del canvas SVG ───

let components = [];
let wires = [];
let junctions = [];
let selectedId = null;
let mode = 'select';
let simResults = null;

let _drag = null;
let _wireStart = null;
let _tempWire = null;
let _wirePoints = [];
let _tempLines = [];
let _snapIndicator = null; // indicador visual de snap
let _canvas = null;
let _compLayer = null;
let _wireLayer = null;

// ─── Historial para deshacer ───
let _history = [];
const MAX_HISTORY = 30;

function _saveHistory() {
  const snapshot = {
    components: JSON.parse(JSON.stringify(components)),
    wires:      JSON.parse(JSON.stringify(wires)),
    junctions:  JSON.parse(JSON.stringify(junctions))
  };
  _history.push(snapshot);
  if (_history.length > MAX_HISTORY) _history.shift();
}

function undoLast() {
  if (_history.length === 0) { setStatus('⚠ No hay acciones para deshacer.'); return; }
  const snapshot = _history.pop();
  components = snapshot.components;
  wires      = snapshot.wires;
  junctions  = snapshot.junctions;
  simResults = null;
  renderAll();
  clearResults();
  setStatus('Acción deshecha.');
}

// ─── Inicializar canvas ───
function initCanvas() {
  _canvas = document.getElementById('canvas');
  _wireLayer = svgEl('g', { id: 'wire-layer' });
  _compLayer = svgEl('g', { id: 'comp-layer' });
  _canvas.appendChild(_wireLayer);
  _canvas.appendChild(_compLayer);
  drawGrid();
  bindCanvasEvents();
  window.addEventListener('resize', drawGrid);
}

// ─── Grid ───
function drawGrid() {
  let gl = document.getElementById('grid-layer');
  if (gl) gl.remove();
  gl = svgEl('g', { id: 'grid-layer' });
  _canvas.insertBefore(gl, _canvas.firstChild);
  const w = _canvas.clientWidth  || 800;
  const h = _canvas.clientHeight || 600;
  for (let x = 0; x <= w; x += GRID)
    for (let y = 0; y <= h; y += GRID)
      gl.appendChild(svgEl('circle', { cx: x, cy: y, r: 1.2, class: 'grid-dot' }));
}

// ─── Detección de punto de snap ───
// Retorna {x, y, type} donde type = 'terminal' | 'wire-end' | 'wire-mid' | null
function _detectSnapPoint(px, py) {
  const SNAP_R = GRID; // radio de detección = 1 celda de grilla

  // 1. Terminal de componente
  for (const c of components) {
    for (const t of getTerminals(c)) {
      if (Math.abs(t.x - px) < SNAP_R && Math.abs(t.y - py) < SNAP_R) {
        return { x: t.x, y: t.y, type: 'terminal' };
      }
    }
  }

  // 2. Extremo de cable existente
  for (const w of wires) {
    if (Math.abs(w.x1 - px) < SNAP_R && Math.abs(w.y1 - py) < SNAP_R)
      return { x: w.x1, y: w.y1, type: 'wire-end' };
    if (Math.abs(w.x2 - px) < SNAP_R && Math.abs(w.y2 - py) < SNAP_R)
      return { x: w.x2, y: w.y2, type: 'wire-end' };
  }

  // 3. Punto intermedio de cable (sobre el segmento, en la grilla)
  for (const w of wires) {
    const snapped = _nearestGridPointOnSegment(px, py, w);
    if (snapped) return { x: snapped.x, y: snapped.y, type: 'wire-mid', wire: w };
  }

  return null;
}

// Punto de grilla más cercano sobre un segmento
function _nearestGridPointOnSegment(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return null;
  const t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
  if (t < 0.05 || t > 0.95) return null;
  const cx = snapGrid(w.x1 + t * dx);
  const cy = snapGrid(w.y1 + t * dy);
  if (Math.abs(cx - px) < GRID && Math.abs(cy - py) < GRID) {
    // Verificar que el punto snappeado realmente esté sobre el segmento
    const t2 = ((cx - w.x1) * dx + (cy - w.y1) * dy) / len2;
    if (t2 >= 0.05 && t2 <= 0.95) return { x: cx, y: cy };
  }
  return null;
}

// ─── Indicador visual de snap ───
function _showSnapIndicator(x, y, type) {
  _hideSnapIndicator();
  const color = type === 'terminal'  ? '#3B8BD4' :
                type === 'wire-end'  ? '#3B8BD4' :
                type === 'wire-mid'  ? '#E8B93C' : '#888';
  _snapIndicator = svgEl('circle', {
    cx: x, cy: y, r: 7,
    fill: 'none',
    stroke: color,
    'stroke-width': '2',
    opacity: '0.9'
  });
  _wireLayer.appendChild(_snapIndicator);
}

function _hideSnapIndicator() {
  if (_snapIndicator) { _snapIndicator.remove(); _snapIndicator = null; }
}

// ─── Eventos del canvas ───
function bindCanvasEvents() {
  _canvas.addEventListener('dragover', e => e.preventDefault());

  _canvas.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('compType');
    if (!type) return;
    const pt = canvasPoint(e);
    _saveHistory();
    const c = createComponent(type, pt.x, pt.y);
    components.push(c);
    simResults = null;
    renderAll();
    setStatus(`${c.name} añadido. Doble clic para editar.`);
  });

  _canvas.addEventListener('mousemove', e => {
    if (_drag) {
      const pt = canvasPoint(e);
      if (_drag.isNode) {
        _drag.comp.x = snapGrid(pt.x) - _drag.comp.w / 2;
        _drag.comp.y = snapGrid(pt.y) - _drag.comp.h / 2;
      } else {
        _drag.comp.x = snapGrid(pt.x - _drag.ox);
        _drag.comp.y = snapGrid(pt.y - _drag.oy);
      }
      renderAll();
      return;
    }

    if (mode === 'wire' && _wireStart) {
      const pt   = canvasPoint(e);
      const last = _wirePoints.length > 0
        ? _wirePoints[_wirePoints.length - 1]
        : { x: _wireStart.x, y: _wireStart.y };
      const snapped = snapAngle(last, pt);

      // Detectar punto de snap cercano
      const snap = _detectSnapPoint(snapped.x, snapped.y);
      if (snap) {
        _showSnapIndicator(snap.x, snap.y, snap.type);
        if (_tempWire) {
          _tempWire.setAttribute('x2', snap.x);
          _tempWire.setAttribute('y2', snap.y);
        }
      } else {
        _hideSnapIndicator();
        if (_tempWire) {
          _tempWire.setAttribute('x2', snapped.x);
          _tempWire.setAttribute('y2', snapped.y);
        }
      }
    }
  });

  _canvas.addEventListener('click', e => {
    const onCanvas = e.target === _canvas || e.target.classList.contains('grid-dot');

    if (mode === 'wire' && _wireStart) {
      const pt = canvasPoint(e);
      const last = _wirePoints.length > 0
        ? _wirePoints[_wirePoints.length - 1]
        : { x: _wireStart.x, y: _wireStart.y };
      const snapped = snapAngle(last, pt);

      // Detectar punto de snap
      const snap = _detectSnapPoint(snapped.x, snapped.y);

      if (snap) {
        // Conectar al punto detectado
        if (snap.type === 'wire-mid' && snap.wire) {
          // Dividir el cable en ese punto y crear junction
          _splitWire(snap.wire, snap.x, snap.y);
        }
        // Terminar el cable en ese punto
        _commitWire(snap.x, snap.y);
        return;
      }

      // Sin snap — agregar punto de quiebre
      _wirePoints.push(snapped);
      const seg = svgEl('line', {
        x1: last.x, y1: last.y,
        x2: snapped.x, y2: snapped.y,
        stroke: '#3B8BD4', 'stroke-width': '1.5',
        'stroke-dasharray': '6 3', opacity: '0.8',
        'stroke-linecap': 'round'
      });
      _wireLayer.appendChild(seg);
      _tempLines.push(seg);

      if (_tempWire) _tempWire.remove();
      _tempWire = svgEl('line', {
        x1: snapped.x, y1: snapped.y,
        x2: snapped.x, y2: snapped.y,
        stroke: '#3B8BD4', 'stroke-width': '1.5',
        'stroke-dasharray': '6 3', opacity: '0.8'
      });
      _wireLayer.appendChild(_tempWire);
      setStatus('Punto agregado. Acerca el cable a otro terminal o cable para conectar.');
      return;
    }

    if (onCanvas && mode !== 'wire') {
      selectedId = null;
      closePopup();
      renderAll();
    }
  });

  _canvas.addEventListener('mouseup', () => { _drag = null; });

  _canvas.addEventListener('dblclick', e => {
    const gEl = e.target.closest('[data-cid]');
    if (!gEl) return;
    e.stopPropagation();
    e.preventDefault();
    const c = findComp(parseInt(gEl.dataset.cid));
    if (!c) return;
    showPopup(c, e.clientX, e.clientY);
  });
}

function canvasPoint(e) {
  const r = _canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ─── Confirmar cable ───
function _commitWire(x2, y2) {
  const allPoints = [
    { x: _wireStart.x, y: _wireStart.y },
    ..._wirePoints,
    { x: x2, y: y2 }
  ];

  // Encontrar componente destino en el punto final
  let destComp = null, destIdx = null;
  for (const c of components) {
    const terms = getTerminals(c);
    for (let i = 0; i < terms.length; i++) {
      if (Math.abs(terms[i].x - x2) < GRID && Math.abs(terms[i].y - y2) < GRID) {
        destComp = c; destIdx = i; break;
      }
    }
    if (destComp) break;
  }

  _saveHistory();
  for (let i = 0; i < allPoints.length - 1; i++) {
    const x1 = allPoints[i].x,   y1 = allPoints[i].y;
    const x2 = allPoints[i+1].x, y2 = allPoints[i+1].y;
    if (x1 === x2 && y1 === y2) continue;

    wires.push({
      id:  nextId(),
      x1, y1, x2, y2,
      c1:  i === 0 ? _wireStart.compId : null,
      ti1: i === 0 ? _wireStart.termIdx : null,
      c2:  (i === allPoints.length - 2 && destComp) ? destComp.id : null,
      ti2: (i === allPoints.length - 2 && destComp) ? destIdx : null
    });
  }

  _hideSnapIndicator();
  // Si el cable termina sobre un cable existente, crear junction visible
  const lastPt = allPoints[allPoints.length - 1];
  const hitWire = _wireAtPoint(lastPt.x, lastPt.y);
  if (hitWire) {
    const exists = junctions.find(j =>
      Math.abs(j.x - lastPt.x) < 4 && Math.abs(j.y - lastPt.y) < 4);
    if (!exists) junctions.push({ id: nextId(), x: lastPt.x, y: lastPt.y });
  }

  // Si dos o más cables comparten un extremo, crear junction
  for (const pt of allPoints) {
    let count = 0;
    for (const w of wires) {
      if (Math.abs(w.x1 - pt.x) < 4 && Math.abs(w.y1 - pt.y) < 4) count++;
      if (Math.abs(w.x2 - pt.x) < 4 && Math.abs(w.y2 - pt.y) < 4) count++;
    }
    if (count >= 3) {
      const exists = junctions.find(j =>
        Math.abs(j.x - pt.x) < 4 && Math.abs(j.y - pt.y) < 4);
      if (!exists) junctions.push({ id: nextId(), x: pt.x, y: pt.y });
    }
  }
  cancelWire();
  simResults = null;
  renderAll();
  setStatus('¡Conexión realizada! Presiona Simular para analizar.');
}

// ─── Modos ───
function setMode(m) {
  mode = m;
  cancelWire();
  _hideSnapIndicator();
  selectedId = null;
  closePopup();
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + m);
  if (btn) btn.classList.add('active');
  _canvas.style.cursor = m === 'wire' ? 'crosshair' : m === 'delete' ? 'not-allowed' : 'default';
  renderAll();
}

// ─── Renderizar todo ───
function renderAll() {
  _wireLayer.innerHTML = '';
  _compLayer.innerHTML = '';
  wires.forEach(renderWire);
  junctions.forEach(renderJunction);
  components.forEach(renderComponent);
}

// ─── Renderizar componente ───
function renderComponent(c) {
  const g = svgEl('g', {
    'data-cid': c.id,
    transform: `translate(${c.x}, ${c.y})`,
    cursor: mode === 'delete' ? 'not-allowed' : 'move'
  });

  g.appendChild(svgEl('rect', {
    x: 0, y: 0, width: c.w, height: c.h,
    fill: 'transparent', stroke: 'none'
  }));

  g.appendChild(buildSymbol(c));

  if (c.type !== 'gnd' && c.type !== 'node' && c.type !== 'vm' && c.type !== 'am') {
    const isH = isHorizontal(c);
    const isSource = c.type === 'vs' || c.type === 'cs';
    const lbl = svgEl('text', {
      'font-size': '10',
      'font-family': 'Consolas, monospace',
      fill: compColor(c.type),
      'font-weight': '600'
    });
    lbl.textContent = formatValue(c.value, c.type);
    if (isH) {
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('x', c.w / 2);
      lbl.setAttribute('y', c.h / 2 - (isSource ? 28 : 24));
    } else {
      lbl.setAttribute('text-anchor', 'start');
      lbl.setAttribute('x', c.w / 2 + (isSource ? 26 : 16));
      lbl.setAttribute('y', c.h / 2);
      lbl.setAttribute('dominant-baseline', 'central');
    }
    g.appendChild(lbl);
  }

  if (c.type !== 'gnd' && c.type !== 'node') {
    const isH = isHorizontal(c);
    const isSource = c.type === 'vs' || c.type === 'cs' || c.type === 'vm' || c.type === 'am';
    const nl = svgEl('text', {
      'text-anchor': 'middle',
      'font-size': '9',
      fill: '#888',
      'font-style': 'italic'
    });
    nl.textContent = c.name;
    const offset = isSource ? 32 : 26;
    if (isH) {
      nl.setAttribute('x', c.w / 2);
      nl.setAttribute('y', c.h / 2 + offset);
    } else {
      nl.setAttribute('x', c.w / 2 - offset);
      nl.setAttribute('y', c.h / 2);
      nl.setAttribute('dominant-baseline', 'central');
    }
    g.appendChild(nl);
  }

  if (selectedId === c.id) {
    g.appendChild(svgEl('rect', {
      x: -5, y: -5, width: c.w + 10, height: c.h + 10,
      rx: 7, fill: 'none',
      stroke: '#3B8BD4', 'stroke-width': '1.5',
      'stroke-dasharray': '5 3', opacity: '0.8'
    }));
  }

  // Terminales
  if (c.type !== 'node') {
    getTerminals(c).forEach((pt, idx) => {
      const dot = svgEl('circle', {
        cx: pt.x - c.x, cy: pt.y - c.y,
        r: 4, fill: 'white',
        stroke: compColor(c.type), 'stroke-width': '1.8',
        cursor: 'crosshair'
      });
      dot.addEventListener('mousedown', e => {
        e.stopPropagation();
        onTerminalClick(c, idx, pt);
      });
      g.appendChild(dot);
    });
  }

  g.addEventListener('mousedown', e => {
    if (e.detail === 2) return;
    onCompMouseDown(e, c);
  });
  g.addEventListener('click', e => onCompClick(e, c));
  _compLayer.appendChild(g);
}

function renderInlineResults(g, c, res) {}

// ─── Renderizar cable ───
function renderWire(w) {
  let color = '#888';
  if (simResults && simResults.wireVoltage) {
    const v    = simResults.wireVoltage[w.id];
    const vMax = simResults.vMax || 1;
    if (v !== undefined) color = _voltageColor(v, vMax);
  }
  
// Área de clic invisible más ancha
  const hitLine = svgEl('line', {
    x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
    stroke: 'transparent', 'stroke-width': '12',
    'stroke-linecap': 'round',
    cursor: mode === 'delete' ? 'not-allowed' : 'default'
  });

  if (mode === 'delete') {
    hitLine.addEventListener('mouseenter', () => {
      line.setAttribute('stroke', '#E8593C');
      line.setAttribute('stroke-width', '3.5');
    });
    hitLine.addEventListener('mouseleave', () => {
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2.5');
    });
  }

  hitLine.addEventListener('click', () => {
    if (mode === 'delete') {
      _saveHistory();
      wires = wires.filter(x => x.id !== w.id);

      // Limpiar junctions que ya no tienen cables conectados
      junctions = junctions.filter(j => {
        const connected = wires.some(wr =>
          (Math.abs(wr.x1 - j.x) < 4 && Math.abs(wr.y1 - j.y) < 4) ||
          (Math.abs(wr.x2 - j.x) < 4 && Math.abs(wr.y2 - j.y) < 4)
        );
        return connected;
      });

      simResults = null;
      renderAll();
      setStatus('Cable eliminado.');
    }
  });
  _wireLayer.appendChild(hitLine);

  const line = svgEl('line', {
    x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
    stroke: color, 'stroke-width': '2.5',
    'stroke-linecap': 'round',
    cursor: mode === 'delete' ? 'not-allowed' : 'default'
  });

  _wireLayer.appendChild(line);
}

function _voltageColor(v, vMax) {
  if (vMax === 0) return '#888';
  const t = Math.max(0, Math.min(1, v / vMax));
  const r = Math.round(59  + (232 - 59)  * t);
  const g = Math.round(139 + (89  - 139) * t);
  const b = Math.round(212 + (60  - 212) * t);
  return `rgb(${r},${g},${b})`;
}

function renderJunction(j) {
  const dot = svgEl('circle', {
    cx: j.x, cy: j.y, r: 5,
    fill: '#e8e8e2',
    stroke: '#999',
    'stroke-width': '1'
  });
  _wireLayer.appendChild(dot);
}

// ─── Eventos de componente ───
function onCompMouseDown(e, c) {
  if (mode !== 'select') return;
  e.stopPropagation();
  selectedId = c.id;
  const pt = canvasPoint(e);
  if (c.type === 'node') {
    _drag = { comp: c, ox: c.w / 2, oy: c.h / 2, isNode: true };
  } else {
    _drag = { comp: c, ox: pt.x - c.x, oy: pt.y - c.y };
  }
  simResults = null;
  renderAll();
}

function onCompClick(e, c) {
  if (mode === 'delete') {
    e.stopPropagation();
    _saveHistory();
    components = components.filter(x => x.id !== c.id);
    wires      = wires.filter(w => w.c1 !== c.id && w.c2 !== c.id);
    simResults = null;
    renderAll();
    setStatus(`${c.name} eliminado.`);
  }
}

function rotateComponent(c) {
  if (c.type === 'gnd')  { setStatus('La tierra no necesita rotación.'); return; }
  if (c.type === 'node') { setStatus('El nodo no necesita rotación.'); return; }
  const centerX = c.x + c.w / 2;
  const centerY = c.y + c.h / 2;
  const wasH = isHorizontal(c);
  c.rot = (c.rot + 90) % 360;
  const nowH = isHorizontal(c);
  if (wasH !== nowH) { const tmp = c.w; c.w = c.h; c.h = tmp; }
  c.x = centerX - c.w / 2;
  c.y = centerY - c.h / 2;
  simResults = null;
  renderAll();
}

// ─── Conexión por terminal ───
function onTerminalClick(c, termIdx, pt) {
  if (mode === 'delete') return;
  if (mode !== 'wire') setMode('wire');

  if (!_wireStart) {
    _wireStart = { compId: c.id, termIdx, x: snapGrid(pt.x), y: snapGrid(pt.y) };
    _wirePoints = [];
    _tempWire = svgEl('line', {
      x1: snapGrid(pt.x), y1: snapGrid(pt.y),
      x2: snapGrid(pt.x), y2: snapGrid(pt.y),
      stroke: '#3B8BD4', 'stroke-width': '1.5',
      'stroke-dasharray': '6 3', opacity: '0.8'
    });
    _wireLayer.appendChild(_tempWire);
    setStatus('Mueve el cursor hacia otro terminal o cable para conectar.');
    return;
  }

  if (_wireStart.compId === c.id) {
    cancelWire();
    setStatus('No se puede conectar un componente consigo mismo.');
    return;
  }

  _commitWire(snapGrid(pt.x), snapGrid(pt.y));
}

function cancelWire() {
  if (_tempWire) { _tempWire.remove(); _tempWire = null; }
  _tempLines.forEach(l => l.remove());
  _tempLines = [];
  _wirePoints = [];
  _wireStart = null;
  _hideSnapIndicator();
}

function clearCircuit() {
  components = [];
  wires      = [];
  junctions  = [];
  simResults = null;
  selectedId = null;
  _drag      = null;
  cancelWire();
  renderAll();
  clearResults();
  setStatus('');
}

function findComp(id) {
  return components.find(c => c.id === id);
}

function snapAngle(from, to) {
  const toSnapped = { x: snapGrid(to.x), y: snapGrid(to.y) };
  const dx  = toSnapped.x - from.x;
  const dy  = toSnapped.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: from.x, y: from.y };
  const angle  = Math.atan2(dy, dx);
  const snap45 = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: snapGrid(from.x + len * Math.cos(snap45)),
    y: snapGrid(from.y + len * Math.sin(snap45))
  };
}

function startCurrentAnimation() { renderAll(); }
function stopCurrentAnimation()  { renderAll(); }

function _wireAtPoint(x, y) {
  for (const w of wires) {
    if (_pointOnSegment(x, y, w.x1, w.y1, w.x2, w.y2)) return w;
  }
  return null;
}

function _pointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return false;
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0.05 || t > 0.95) return false;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.abs(cx - px) < 6 && Math.abs(cy - py) < 6;
}

function _snapToWire(w, px, py) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const len2 = dx * dx + dy * dy;
  const t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
  const tc = Math.max(0.05, Math.min(0.95, t));
  return {
    x: snapGrid(w.x1 + tc * dx),
    y: snapGrid(w.y1 + tc * dy)
  };
}

function _splitWire(w, x, y) {
  const exists = junctions.find(j => Math.abs(j.x - x) < 4 && Math.abs(j.y - y) < 4);
  if (!exists) junctions.push({ id: nextId(), x, y });
  const seg1 = {
    id: nextId(), x1: w.x1, y1: w.y1, x2: x, y2: y,
    c1: w.c1, ti1: w.ti1, c2: null, ti2: null
  };
  const seg2 = {
    id: nextId(), x1: x, y1: y, x2: w.x2, y2: w.y2,
    c1: null, ti1: null, c2: w.c2, ti2: w.ti2
  };
  wires = wires.filter(wr => wr.id !== w.id);
  wires.push(seg1, seg2);
}