// ─── Definición y configuración de componentes ───

const GRID = 40;

const COMPONENT_DEFAULTS = {
  vs:  { value: 10,   label: 'V', name: 'V',   w: 80, h: 40 },
  cs:  { value: 2,    label: 'A', name: 'I',   w: 80, h: 40 },
  r:   { value: 1000, label: 'Ω', name: 'R',   w: 80, h: 40 },
  gnd: { value: 0,    label: '',  name: 'GND', w: 40, h: 40 }
};

// Contador global de IDs
let _idCounter = 0;
function nextId() { return ++_idCounter; }

// Contador por tipo para nombrar componentes
const _typeCount = {};
function nextName(type) {
  _typeCount[type] = (_typeCount[type] || 0) + 1;
  return COMPONENT_DEFAULTS[type].name + _typeCount[type];
}

// ─── Crear un componente nuevo ───
function createComponent(type, x, y) {
  const def = COMPONENT_DEFAULTS[type];
  if (!def) return null;
  return {
    id:    nextId(),
    type,
    name:  nextName(type),
    x:     snapGrid(x - def.w / 2),
    y:     snapGrid(y - def.h / 2),
    w:     def.w,
    h:     def.h,
    dir:   'h',
    value: def.value
  };
}

// ─── Snap al grid ───
function snapGrid(v) {
  return Math.round(v / GRID) * GRID;
}

// ─── Puntos terminales de un componente ───
// Retorna [{x, y}, {x, y}] — los dos extremos de conexión
function getTerminals(c) {
  if (c.dir === 'h') {
    return [
      { x: c.x,       y: c.y + c.h / 2 },
      { x: c.x + c.w, y: c.y + c.h / 2 }
    ];
  } else {
    return [
      { x: c.x + c.w / 2, y: c.y },
      { x: c.x + c.w / 2, y: c.y + c.h }
    ];
  }
}

// ─── Formatear valor con unidades ───
function formatValue(value, type) {
  if (type === 'r') {
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'MΩ';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + 'kΩ';
    return value + 'Ω';
  }
  if (type === 'vs') return value + 'V';
  if (type === 'cs') return value + 'A';
  return '';
}

// ─── Formatear número de resultado ───
function formatResult(v) {
  if (v === undefined || v === null || isNaN(v)) return '?';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6)  return (v / 1e6).toFixed(4)  + 'M';
  if (a >= 1e3)  return (v / 1e3).toFixed(4)  + 'k';
  if (a < 1e-3 && a > 0) return (v * 1e3).toFixed(4) + 'm';
  return parseFloat(v.toFixed(5)).toString();
}

// ─── Color por tipo de componente ───
function compColor(type) {
  const colors = {
    vs:  '#E8593C',
    cs:  '#3B8BD4',
    r:   '#444444',
    gnd: '#3B6D11'
  };
  return colors[type] || '#555555';
}

// ─── Construir símbolo SVG de un componente ───
function buildSymbol(c) {
  const g = svgEl('g', {});
  const hw = c.w / 2;
  const hh = c.h / 2;
  const col = compColor(c.type);

  if (c.dir === 'h') {
    g.setAttribute('transform', `translate(0, ${hh})`);
    _symbolH(g, c.type, c.w, col);
  } else {
    g.setAttribute('transform', `translate(${hw}, 0)`);
    _symbolV(g, c.type, c.h, col);
  }
  return g;
}

function _symbolH(g, type, w, col) {
  const hw = w / 2;

  if (type === 'r') {
    _line(g, 0, 0, hw - 16, 0, col);
    _rect(g, hw - 16, -9, 32, 18, col);
    _line(g, hw + 16, 0, w, 0, col);

  } else if (type === 'vs') {
    _line(g, 0, 0, hw - 16, 0, col);
    _circle(g, hw, 0, 16, col);
    _text(g, '+', hw - 4, -4, '#E8593C', 9, '700');
    _text(g, '−', hw + 3,  5, '#3B8BD4', 9, '700');
    _line(g, hw + 16, 0, w, 0, col);

  } else if (type === 'cs') {
    _line(g, 0, 0, hw - 16, 0, col);
    _circle(g, hw, 0, 16, col);
    _line(g, hw - 9, 0, hw + 5, 0, '#3B8BD4');
    _arrow(g, hw + 5, 0, 'right', '#3B8BD4');
    _line(g, hw + 16, 0, w, 0, col);

  } else if (type === 'gnd') {
    const cx = hw;
    _line(g, cx, -14, cx, 0, col);
    _line(g, cx - 14, 0, cx + 14, 0, col, 2.2);
    _line(g, cx - 9,  5, cx + 9,  5, col, 1.6);
    _line(g, cx - 4, 10, cx + 4, 10, col, 1.2);
  }
}

function _symbolV(g, type, h, col) {
  const hh = h / 2;

  if (type === 'r') {
    _line(g, 0, 0, 0, hh - 16, col);
    _rect(g, -9, hh - 16, 18, 32, col);
    _line(g, 0, hh + 16, 0, h, col);

  } else if (type === 'vs') {
    _line(g, 0, 0, 0, hh - 16, col);
    _circle(g, 0, hh, 16, col);
    _text(g, '+', -2, hh - 5, '#E8593C', 9, '700');
    _text(g, '−', -2, hh + 8, '#3B8BD4', 9, '700');
    _line(g, 0, hh + 16, 0, h, col);

  } else if (type === 'cs') {
    _line(g, 0, 0, 0, hh - 16, col);
    _circle(g, 0, hh, 16, col);
    _line(g, 0, hh - 9, 0, hh + 5, '#3B8BD4');
    _arrow(g, 0, hh + 5, 'down', '#3B8BD4');
    _line(g, 0, hh + 16, 0, h, col);

  } else if (type === 'gnd') {
    const cy = hh;
    _line(g, 0, cy - 14, 0, cy, col);
    _line(g, -14, cy, 14, cy, col, 2.2);
    _line(g, -9, cy + 5, 9, cy + 5, col, 1.6);
    _line(g, -4, cy + 10, 4, cy + 10, col, 1.2);
  }
}

// ─── Helpers SVG ───
function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function _line(g, x1, y1, x2, y2, stroke, sw = 1.8) {
  g.appendChild(svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': sw, 'stroke-linecap': 'round' }));
}

function _rect(g, x, y, w, h, stroke) {
  g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 3, fill: 'none', stroke, 'stroke-width': 1.8 }));
}

function _circle(g, cx, cy, r, stroke) {
  g.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke, 'stroke-width': 1.8 }));
}

function _text(g, txt, x, y, fill, size = 10, weight = '400') {
  const t = svgEl('text', {
    x, y,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-size': size,
    'font-weight': weight,
    'font-family': 'Segoe UI, system-ui, sans-serif',
    fill
  });
  t.textContent = txt;
  g.appendChild(t);
}

function _arrow(g, x, y, dir, fill) {
  let pts;
  if (dir === 'right') pts = `${x-6},-4 ${x+2},0 ${x-6},4`;
  else                 pts = `-4,${y-6} 0,${y+2} 4,${y-6}`;
  g.appendChild(svgEl('polygon', { points: pts, fill }));
}