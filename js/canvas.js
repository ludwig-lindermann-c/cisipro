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
  stopCurrentAnimation();
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

  _canvas.addEventListener('click', e => {
    const onCanvas = e.target === _canvas || e.target.classList.contains('grid-dot');

    // Clic sobre un cable en modo wire — crear junction
    if (mode === 'wire' && _wireStart && !onCanvas) {
      const pt  = canvasPoint(e);
      const hit = _wireAtPoint(pt.x, pt.y);
      if (hit) {
        _saveHistory();
        const snapped = _snapToWire(hit, pt.x, pt.y);
        _splitWire(hit, snapped.x, snapped.y);

        const allPoints = [
          { x: _wireStart.x, y: _wireStart.y },
          ..._wirePoints,
          { x: snapped.x, y: snapped.y }
        ];

        for (let i = 0; i < allPoints.length - 1; i++) {
          wires.push({
            id:  nextId(),
            x1:  allPoints[i].x,   y1: allPoints[i].y,
            x2:  allPoints[i+1].x, y2: allPoints[i+1].y,
            c1:  i === 0 ? _wireStart.compId : null,
            ti1: i === 0 ? _wireStart.termIdx : null,
            c2:  null, ti2: null
          });
        }

        cancelWire();
        simResults = null;
        renderAll();
        setStatus('¡Junction creado! Presiona Simular para analizar.');
        return;
      }
    }

    // Clic en canvas vacío en modo wire — agregar punto de quiebre
    if (mode === 'wire' && _wireStart && onCanvas) {
      const pt   = canvasPoint(e);
      const last = _wirePoints.length > 0
        ? _wirePoints[_wirePoints.length - 1]
        : { x: _wireStart.x, y: _wireStart.y };
      const snapped = snapAngle(last, pt);
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
      setStatus('Punto agregado. Clic en terminal o cable para conectar.');
      return;
    }

    if (onCanvas && mode !== 'wire') {
      selectedId = null;
      closePopup();
      renderAll();
    }
  });

  _canvas.addEventListener('mousemove', e => {
    if (_drag) {
      const pt = canvasPoint(e);
      _drag.comp.x = snapGrid(pt.x - _drag.ox);
      _drag.comp.y = snapGrid(pt.y - _drag.oy);
      renderAll();
      return;
    }
    if (mode === 'wire' && _wireStart) {
      const pt   = canvasPoint(e);
      const last = _wirePoints.length > 0
        ? _wirePoints[_wirePoints.length - 1]
        : { x: _wireStart.x, y: _wireStart.y };
      const snapped = snapAngle(last, pt);
      if (_tempWire) {
        _tempWire.setAttribute('x2', snapped.x);
        _tempWire.setAttribute('y2', snapped.y);
      }
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

// ─── Modos ───
function setMode(m) {
  mode = m;
  cancelWire();
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

  if (c.type !== 'gnd') {
    const isH = isHorizontal(c);
    const lbl = svgEl('text', {
      'font-size': '10',
      'font-family': 'Consolas, monospace',
      fill: compColor(c.type),
      'font-weight': '600'
    });
    lbl.textContent = formatValue(c.value, c.type);
    const isSource = c.type === 'vs' || c.type === 'cs';
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

  if (c.type !== 'gnd') {
    const isH = isHorizontal(c);
    const nl = svgEl('text', {
      'text-anchor': 'middle',
      'font-size': '9',
      fill: '#888',
      'font-style': 'italic'
    });
    nl.textContent = c.name;
    const offset = (c.type === 'vs' || c.type === 'cs') ? 32 : 26;
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

  if (simResults && simResults.components[c.id]) {
    renderInlineResults(g, c, simResults.components[c.id]);
  }

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

  g.addEventListener('mousedown', e => {
    if (e.detail === 2) return;
    onCompMouseDown(e, c);
  });
  g.addEventListener('click', e => onCompClick(e, c));

  _compLayer.appendChild(g);
}

function renderInlineResults(g, c, res) {}

function renderWire(w) {
  const line = svgEl('line', {
    x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
    stroke: '#888', 'stroke-width': '2',
    'stroke-linecap': 'round',
    cursor: mode === 'delete' ? 'not-allowed' : 'default'
  });
  line.addEventListener('click', () => {
    if (mode === 'delete') {
      _saveHistory();
      wires = wires.filter(x => x.id !== w.id);
      simResults = null;
      stopCurrentAnimation();
      renderAll();
      setStatus('Cable eliminado.');
    }
  });
  _wireLayer.appendChild(line);
}

function renderJunction(j) {
  const dot = svgEl('circle', {
    cx: j.x, cy: j.y, r: 5,
    fill: '#ccc', stroke: 'none'
  });
  _wireLayer.appendChild(dot);
}

function onCompMouseDown(e, c) {
  if (mode !== 'select') return;
  e.stopPropagation();
  selectedId = c.id;
  const pt = canvasPoint(e);
  _drag = { comp: c, ox: pt.x - c.x, oy: pt.y - c.y };
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
  if (c.type === 'gnd') { setStatus('La tierra no necesita rotación.'); return; }
  const centerX = c.x + c.w / 2;
  const centerY = c.y + c.h / 2;
  const wasH = isHorizontal(c);
  c.rot = (c.rot + 90) % 360;
  const nowH = isHorizontal(c);
  if (wasH !== nowH) {
    const tmp = c.w; c.w = c.h; c.h = tmp;
  }
  c.x = centerX - c.w / 2;
  c.y = centerY - c.h / 2;
  simResults = null;
  renderAll();
}

function onTerminalClick(c, termIdx, pt) {
  if (mode === 'delete') return;
  if (mode !== 'wire') setMode('wire');

  if (!_wireStart) {
    _wireStart = { compId: c.id, termIdx, x: snapGrid(pt.x), y: snapGrid(pt.y) };
    _wirePoints = [];
    _tempWire = svgEl('line', {
      x1: snapGrid(pt.x), y1: snapGrid(pt.y), x2: snapGrid(pt.x), y2: snapGrid(pt.y),
      stroke: '#3B8BD4', 'stroke-width': '1.5',
      'stroke-dasharray': '6 3', opacity: '0.8'
    });
    _wireLayer.appendChild(_tempWire);
    setStatus('Clic en terminal destino o en canvas para agregar punto de quiebre.');
    return;
  }

  if (_wireStart.compId === c.id) {
    cancelWire();
    setStatus('No se puede conectar un componente consigo mismo.');
    return;
  }

  const allPoints = [
    { x: _wireStart.x, y: _wireStart.y },
    ..._wirePoints,
    { x: pt.x, y: pt.y }
  ];

  for (let p = 1; p < allPoints.length - 1; p++) {
    const hit = _wireAtPoint(allPoints[p].x, allPoints[p].y);
    if (hit) _splitWire(hit, allPoints[p].x, allPoints[p].y);
  }

  _saveHistory();
  for (let i = 0; i < allPoints.length - 1; i++) {
    wires.push({
      id:  nextId(),
      x1:  allPoints[i].x,   y1: allPoints[i].y,
      x2:  allPoints[i+1].x, y2: allPoints[i+1].y,
      c1:  i === 0 ? _wireStart.compId : null,
      ti1: i === 0 ? _wireStart.termIdx : null,
      c2:  i === allPoints.length - 2 ? c.id : null,
      ti2: i === allPoints.length - 2 ? termIdx : null
    });
  }

  cancelWire();
  simResults = null;
  renderAll();
  setStatus('¡Conexión realizada! Presiona Simular para analizar.');
}

function cancelWire() {
  if (_tempWire) { _tempWire.remove(); _tempWire = null; }
  _tempLines.forEach(l => l.remove());
  _tempLines = [];
  _wirePoints = [];
  _wireStart = null;
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
  // Primero snap al grid
  const toSnapped = {
    x: snapGrid(to.x),
    y: snapGrid(to.y)
  };

  const dx  = toSnapped.x - from.x;
  const dy  = toSnapped.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { x: from.x, y: from.y };

  // Luego snap al ángulo más cercano (0, 45, 90, 135...)
  const angle  = Math.atan2(dy, dx);
  const snap45 = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  return {
    x: snapGrid(from.x + len * Math.cos(snap45)),
    y: snapGrid(from.y + len * Math.sin(snap45))
  };
}

// ─── Animación de corriente ───
let _animFrame = null;
let _animParticles = [];

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
    x: Math.round(w.x1 + tc * dx),
    y: Math.round(w.y1 + tc * dy)
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