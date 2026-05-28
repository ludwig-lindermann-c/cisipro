// ─── Gestión del canvas SVG ───

let components = [];
let wires = [];
let selectedId = null;
let mode = 'select';
let simResults = null;

// Estado drag de componente
let _drag = null;

// Estado wire en progreso
let _wireStart = null;
let _tempWire = null;

// Referencia al canvas SVG
let _canvas = null;
let _compLayer = null;
let _wireLayer = null;

// ─── Inicializar canvas ───
function initCanvas() {
  _canvas = document.getElementById('canvas');

  // Capas
  _wireLayer = svgEl('g', { id: 'wire-layer' });
  _compLayer = svgEl('g', { id: 'comp-layer' });
  _canvas.appendChild(_wireLayer);
  _canvas.appendChild(_compLayer);

  drawGrid();
  bindCanvasEvents();
  window.addEventListener('resize', drawGrid);
}

// ─── Dibujar grid de puntos ───
function drawGrid() {
  let gl = document.getElementById('grid-layer');
  if (gl) gl.remove();
  gl = svgEl('g', { id: 'grid-layer' });
  _canvas.insertBefore(gl, _canvas.firstChild);

  const w = _canvas.clientWidth  || 800;
  const h = _canvas.clientHeight || 600;

  for (let x = 0; x <= w; x += GRID) {
    for (let y = 0; y <= h; y += GRID) {
      gl.appendChild(svgEl('circle', { cx: x, cy: y, r: 1.2, class: 'grid-dot' }));
    }
  }
}

// ─── Eventos del canvas ───
function bindCanvasEvents() {

  // Drag sobre canvas (soltar componente desde toolbar)
  _canvas.addEventListener('dragover', e => e.preventDefault());
  _canvas.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('compType');
    if (!type) return;
    const pt = canvasPoint(e);
    const c = createComponent(type, pt.x, pt.y);
    components.push(c);
    simResults = null;
    renderAll();
    setStatus(`${c.name} añadido. Doble clic para editar valor.`);
  });

  // Click en canvas vacío
  _canvas.addEventListener('click', e => {
    if (e.target === _canvas || e.target.classList.contains('grid-dot')) {
      if (mode === 'wire' && _wireStart) {
        cancelWire();
        setStatus('Conexión cancelada.');
      }
      selectedId = null;
      closePopup();
      renderAll();
    }
  });

  // Mouse move — arrastrar componente o previsualizar cable
  _canvas.addEventListener('mousemove', e => {
    if (_drag) {
      const pt = canvasPoint(e);
      _drag.comp.x = snapGrid(pt.x - _drag.ox);
      _drag.comp.y = snapGrid(pt.y - _drag.oy);
      renderAll();
      return;
    }
    if (mode === 'wire' && _wireStart && _tempWire) {
      const pt = canvasPoint(e);
      _tempWire.setAttribute('x2', pt.x);
      _tempWire.setAttribute('y2', pt.y);
    }
  });

  // Mouse up — soltar componente
  _canvas.addEventListener('mouseup', () => { _drag = null; });

  // Doble clic — abrir popup de edición
  _canvas.addEventListener('dblclick', e => {
    const gEl = e.target.closest('[data-cid]');
    if (!gEl) return;
    const c = findComp(parseInt(gEl.dataset.cid));
    if (!c || c.type === 'gnd') return;
    showPopup(c, e.clientX, e.clientY);
  });
}

// ─── Coordenadas relativas al canvas ───
function canvasPoint(e) {
  const r = _canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ─── Modo de interacción ───
function setMode(m) {
  mode = m;
  cancelWire();
  selectedId = null;
  closePopup();

  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + m);
  if (btn) btn.classList.add('active');

  _canvas.style.cursor = m === 'wire'   ? 'crosshair'  :
                         m === 'delete' ? 'not-allowed' : 'default';
  renderAll();
}

// ─── Renderizar todo ───
function renderAll() {
  _wireLayer.innerHTML = '';
  _compLayer.innerHTML = '';
  wires.forEach(renderWire);
  components.forEach(renderComponent);
}

// ─── Renderizar un componente ───
function renderComponent(c) {
  const g = svgEl('g', {
    'data-cid': c.id,
    transform: `translate(${c.x}, ${c.y})`,
    cursor: mode === 'delete' ? 'not-allowed' : 'move'
  });

  // Área de hit transparente
  g.appendChild(svgEl('rect', {
    x: 0, y: 0, width: c.w, height: c.h,
    fill: 'transparent', stroke: 'none'
  }));

  // Símbolo
  g.appendChild(buildSymbol(c));

  // Etiqueta de valor
  if (c.type !== 'gnd') {
    const lbl = svgEl('text', {
      'text-anchor': 'middle',
      'font-size': '10',
      'font-family': 'Consolas, monospace',
      fill: compColor(c.type),
      'font-weight': '600'
    });
    lbl.textContent = formatValue(c.value, c.type);
    if (c.dir === 'h') {
      lbl.setAttribute('x', c.w / 2);
      lbl.setAttribute('y', c.h / 2 - 24);
    } else {
      lbl.setAttribute('x', c.w / 2 + 24);
      lbl.setAttribute('y', c.h / 2);
      lbl.setAttribute('dominant-baseline', 'central');
    }
    g.appendChild(lbl);
  }

  // Nombre del componente
  if (c.type !== 'gnd') {
    const nameLbl = svgEl('text', {
      'text-anchor': 'middle',
      'font-size': '9',
      fill: '#888',
      'font-style': 'italic'
    });
    nameLbl.textContent = c.name;
    if (c.dir === 'h') {
      nameLbl.setAttribute('x', c.w / 2);
      nameLbl.setAttribute('y', c.h / 2 + 26);
    } else {
      nameLbl.setAttribute('x', c.w / 2 - 26);
      nameLbl.setAttribute('y', c.h / 2);
      nameLbl.setAttribute('dominant-baseline', 'central');
    }
    g.appendChild(nameLbl);
  }

  // Resaltado de selección
  if (selectedId === c.id) {
    g.appendChild(svgEl('rect', {
      x: -5, y: -5, width: c.w + 10, height: c.h + 10,
      rx: 7, fill: 'none',
      stroke: '#3B8BD4', 'stroke-width': '1.5',
      'stroke-dasharray': '5 3', opacity: '0.8'
    }));
  }

  // Resultados inline sobre el componente
  if (simResults && simResults.components[c.id]) {
    renderInlineResults(g, c, simResults.components[c.id]);
  }

  // Terminales
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

  // Eventos del grupo
  g.addEventListener('mousedown', e => onCompMouseDown(e, c));
  g.addEventListener('click',     e => onCompClick(e, c));

  _compLayer.appendChild(g);
}

// ─── Resultados inline sobre el componente ───
function renderInlineResults(g, c, res) {
  const items = [];
  if (res.v !== undefined) items.push({ txt: formatResult(res.v) + 'V', col: '#E8593C' });
  if (res.i !== undefined) items.push({ txt: formatResult(res.i) + 'A', col: '#3B8BD4' });
  if (res.p !== undefined) items.push({ txt: formatResult(res.p) + 'W', col: '#3B6D11' });

  items.forEach((item, i) => {
    const t = svgEl('text', {
      'text-anchor': 'middle',
      'font-size': '9',
      'font-weight': '700',
      'font-family': 'Consolas, monospace',
      fill: item.col
    });
    t.textContent = item.txt;
    if (c.dir === 'h') {
      t.setAttribute('x', c.w / 2);
      t.setAttribute('y', c.h / 2 + 36 + i * 12);
    } else {
      t.setAttribute('x', c.w / 2 + 32);
      t.setAttribute('y', c.h / 2 - 12 + i * 12);
      t.setAttribute('dominant-baseline', 'central');
    }
    g.appendChild(t);
  });
}

// ─── Renderizar un cable ───
function renderWire(w) {
  const line = svgEl('line', {
    x1: w.x1, y1: w.y1,
    x2: w.x2, y2: w.y2,
    stroke: w.current !== undefined ? '#3B8BD4' : '#666',
    'stroke-width': w.current !== undefined
      ? Math.min(4, 1.5 + Math.abs(w.current) * 0.4).toString()
      : '2',
    'stroke-linecap': 'round',
    cursor: mode === 'delete' ? 'not-allowed' : 'default'
  });

  line.addEventListener('click', () => {
    if (mode === 'delete') {
      wires = wires.filter(x => x.id !== w.id);
      simResults = null;
      renderAll();
      setStatus('Cable eliminado.');
    }
  });

  _wireLayer.appendChild(line);
}

// ─── Eventos de componente ───
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
    components = components.filter(x => x.id !== c.id);
    wires = wires.filter(w => w.c1 !== c.id && w.c2 !== c.id);
    simResults = null;
    renderAll();
    setStatus(`${c.name} eliminado.`);
  }
}

// ─── Conexión por terminal ───
function onTerminalClick(c, termIdx, pt) {
  if (mode === 'delete') return;

  // Cambiar a modo wire automáticamente
  if (mode !== 'wire') setMode('wire');

  if (!_wireStart) {
    _wireStart = { compId: c.id, termIdx, x: pt.x, y: pt.y };
    _tempWire = svgEl('line', {
      x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y,
      stroke: '#3B8BD4', 'stroke-width': '1.5',
      'stroke-dasharray': '6 3', opacity: '0.8'
    });
    _wireLayer.appendChild(_tempWire);
    setStatus('Haz clic en el terminal de destino para conectar.');
    return;
  }

  // No conectar al mismo componente
  if (_wireStart.compId === c.id) {
    cancelWire();
    setStatus('No se puede conectar un componente consigo mismo.');
    return;
  }

  // Crear cable
  wires.push({
    id:   nextId(),
    x1:   _wireStart.x,   y1: _wireStart.y,
    x2:   pt.x,           y2: pt.y,
    c1:   _wireStart.compId, ti1: _wireStart.termIdx,
    c2:   c.id,           ti2: termIdx
  });

  cancelWire();
  simResults = null;
  renderAll();
  setStatus('¡Conexión realizada! Presiona Simular para analizar.');
}

function cancelWire() {
  if (_tempWire) { _tempWire.remove(); _tempWire = null; }
  _wireStart = null;
}

// ─── Limpiar circuito ───
function clearCircuit() {
  components = [];
  wires = [];
  simResults = null;
  selectedId = null;
  _drag = null;
  cancelWire();
  renderAll();
  clearResults();
  setStatus('');
}

// ─── Utilidad ───
function findComp(id) {
  return components.find(c => c.id === id);
}