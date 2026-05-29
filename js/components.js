// ─── Definición y configuración de componentes ───

const GRID = 20;

const COMPONENT_DEFAULTS = {
  vs:   { value: 10,   name: 'V',   w: 80, h: 40 },
  cs:   { value: 2,    name: 'I',   w: 80, h: 40 },
  r:    { value: 1000, name: 'R',   w: 80, h: 40 },
  gnd:  { value: 0,    name: 'GND', w: 40, h: 40 },
  node: { value: 0,    name: 'N',   w: 20, h: 20 },
  vm:   { value: 0,    name: 'VM',  w: 80, h: 80 },
  am:   { value: 0,    name: 'AM',  w: 80, h: 40 }
};

// Rotaciones posibles en grados: 0, 90, 180, 270
// 0   = horizontal, − izq, + der
// 90  = vertical,   − arr, + aba
// 180 = horizontal, + izq, − der
// 270 = vertical,   + arr, − aba

let _idCounter = 0;
function nextId() { return ++_idCounter; }

const _typeCount = {};
function nextName(type) {
  _typeCount[type] = (_typeCount[type] || 0) + 1;
  return COMPONENT_DEFAULTS[type].name + _typeCount[type];
}

function createComponent(type, x, y) {
  const def = COMPONENT_DEFAULTS[type];
  if (!def) return null;

  // Para el nodo, centrar exactamente en el punto de grilla más cercano
  let cx, cy;
  if (type === 'node') {
    cx = snapGrid(x) - 10;
    cy = snapGrid(y) - 10;
  } else {
    cx = snapGrid(x - def.w / 2);
    cy = snapGrid(y - def.h / 2);
  }

  return {
    id:    nextId(),
    type,
    name:  nextName(type),
    x:     cx,
    y:     cy,
    w:     def.w,
    h:     def.h,
    rot:   0,
    value: def.value
  };
}

function snapGrid(v) {
  return Math.round(v / GRID) * GRID;
}

// ─── Terminales según rotación ───
// Terminal 0 = negativo (−), Terminal 1 = positivo (+)
function getTerminals(c) {
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;

  // La tierra siempre conecta por arriba
  if (c.type === 'gnd') return [{ x: cx, y: c.y }];

  // El nodo conecta en su centro en las 4 direcciones
  if (c.type === 'node') return [
    { x: cx, y: c.y },
    { x: cx, y: c.y + c.h },
    { x: c.x, y: cy },
    { x: c.x + c.w, y: cy }
  ];

  // Voltímetro: terminal 0 = + (izq), terminal 1 = − (der)
  if (c.type === 'vm') {
    if (c.rot === 0 || c.rot === undefined) return [
      { x: c.x,       y: cy },
      { x: c.x + c.w, y: cy }
    ];
    return [
      { x: cx, y: c.y },
      { x: cx, y: c.y + c.h }
    ];
  }

  // Amperímetro: terminal 0 = entrada (+), terminal 1 = salida (−)
  if (c.type === 'am') {
    if (c.rot === 0 || c.rot === undefined) return [
      { x: c.x,       y: cy },
      { x: c.x + c.w, y: cy }
    ];
    return [
      { x: cx, y: c.y },
      { x: cx, y: c.y + c.h }
    ];
  }

  switch (c.rot) {
    case 0:   // horizontal: izq=t0, der=t1
      return [
        { x: c.x,       y: cy },
        { x: c.x + c.w, y: cy }
      ];
    case 90:  // vertical: arr=t0, aba=t1
      return [
        { x: cx, y: c.y },
        { x: cx, y: c.y + c.h }
      ];
    case 180: // horizontal invertido: der=t0, izq=t1
      return [
        { x: c.x + c.w, y: cy },
        { x: c.x,       y: cy }
      ];
    case 270: // vertical invertido: aba=t0, arr=t1
      return [
        { x: cx, y: c.y + c.h },
        { x: cx, y: c.y }
      ];
    default:
      return [
        { x: c.x,       y: cy },
        { x: c.x + c.w, y: cy }
      ];
  }
}

function isHorizontal(c) {
  return c.rot === 0 || c.rot === 180;
}

function formatValue(value, type) {
  const units = { vs: 'V', cs: 'A', r: 'Ω', gnd: '' };
  const unit  = units[type] || '';
  return _applyPrefix(value) + unit;
}

function _applyPrefix(value) {
  if (value === 0) return '0';
  const a = Math.abs(value);
  if (a >= 1e9)  return parseFloat((value / 1e9).toPrecision(4))  + 'G';
  if (a >= 1e6)  return parseFloat((value / 1e6).toPrecision(4))  + 'M';
  if (a >= 1e3)  return parseFloat((value / 1e3).toPrecision(4))  + 'k';
  if (a >= 1)    return parseFloat(value.toPrecision(4))           + '';
  if (a >= 1e-3) return parseFloat((value / 1e-3).toPrecision(4)) + 'm';
  if (a >= 1e-6) return parseFloat((value / 1e-6).toPrecision(4)) + 'μ';
  if (a >= 1e-9) return parseFloat((value / 1e-9).toPrecision(4)) + 'n';
  return parseFloat((value / 1e-12).toPrecision(4)) + 'p';
}

function splitValuePrefix(value) {
  const a = Math.abs(value);
  if (a >= 1e9)  return { base: parseFloat((value / 1e9).toPrecision(6)),  prefix: '1e9'  };
  if (a >= 1e6)  return { base: parseFloat((value / 1e6).toPrecision(6)),  prefix: '1e6'  };
  if (a >= 1e3)  return { base: parseFloat((value / 1e3).toPrecision(6)),  prefix: '1e3'  };
  if (a >= 1)    return { base: parseFloat(value.toPrecision(6)),           prefix: '1'    };
  if (a >= 1e-3) return { base: parseFloat((value / 1e-3).toPrecision(6)), prefix: '1e-3' };
  if (a >= 1e-6) return { base: parseFloat((value / 1e-6).toPrecision(6)), prefix: '1e-6' };
  if (a >= 1e-9) return { base: parseFloat((value / 1e-9).toPrecision(6)), prefix: '1e-9' };
  return           { base: parseFloat((value / 1e-12).toPrecision(6)),      prefix: '1e-12'};
}

function formatResult(v) {
  if (v === undefined || v === null || isNaN(v)) return '?';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6)  return (v / 1e6).toFixed(4) + 'M';
  if (a >= 1e3)  return (v / 1e3).toFixed(4) + 'k';
  if (a < 1e-3 && a > 0) return (v * 1e3).toFixed(4) + 'm';
  return parseFloat(v.toFixed(5)).toString();
}

function compColor(type) {
  const colors = {
    vs: '#E8593C', cs: '#3B8BD4', r: '#666666',
    gnd: '#3B6D11', node: '#cccccc',
    vm: '#9B59B6', am: '#E67E22'
  };
  return colors[type] || '#666666';
}

// ─── Construir símbolo SVG ───

function buildSymbol(c) {
  const g = svgEl('g', {});
  const cx = c.w / 2;
  const cy = c.h / 2;

  if (c.type === 'node') {
    g.appendChild(svgEl('circle', {
      cx: cx, cy: cy, r: '6',
      fill: '#cccccc', stroke: 'none'
    }));
    return g;
  }

  if (c.type === 'gnd') {
    _drawSymbol(g, c.type, c.w, c.h);
    return g;
  }

  if (c.type === 'vm' || c.type === 'am') {
    _drawSymbol(g, c.type, c.w, c.h);
    return g;
  }

  const isH   = isHorizontal(c);
  const drawW = isH ? c.w : c.h;
  const drawH = isH ? c.h : c.w;
  const sym   = svgEl('g', {});

  _drawSymbol(sym, c.type, drawW, drawH);

  if (c.rot === 0) {
  } else if (c.rot === 90) {
    sym.setAttribute('transform',
      `translate(${cx},${cy}) rotate(90) translate(${-drawW/2},${-drawH/2})`);
  } else if (c.rot === 180) {
    sym.setAttribute('transform',
      `translate(${cx},${cy}) scale(-1,1) translate(${-cx},${-cy})`);
  } else if (c.rot === 270) {
    sym.setAttribute('transform',
      `translate(${cx},${cy}) rotate(270) translate(${-drawW/2},${-drawH/2})`);
  }

  g.appendChild(sym);
  return g;
}

// ─── Dibujar símbolo base (siempre horizontal) ───
function _drawSymbol(g, type, w, h) {
  const hw  = w / 2;
  const hh  = h / 2;
  const col = compColor(type);

  if (type === 'r') {
    _line(g, 0,       hh, hw - 16, hh, col);
    _rect(g, hw - 16, hh - 9, 32, 18, col);
    _line(g, hw + 16, hh, w,      hh, col);

  } else if (type === 'vs') {
    _line(g, 0,       hh, hw - 20, hh, col);
    _circle(g, hw, hh, 20, col);
    // − a la izquierda del centro (más separado)
    _line(g, hw - 15, hh, hw - 7, hh, '#3B8BD4', 2.2);
    // + a la derecha del centro (cruz más separada)
    _line(g, hw + 7,  hh - 6, hw + 7, hh + 6, '#E8593C', 2.2);
    _line(g, hw + 1,  hh,     hw + 13, hh,     '#E8593C', 2.2);
    _line(g, hw + 20, hh, w,  hh, col);

  } else if (type === 'cs') {
    _line(g, 0,       hh, hw - 20, hh, col);
    _circle(g, hw, hh, 20, col);
    _line(g, hw - 13, hh, hw + 6,  hh, '#3B8BD4', 2);
    _arrow(g, hw + 6, hh, '#3B8BD4');
    _line(g, hw + 20, hh, w,       hh, col);

  } else if (type === 'gnd') {
    _line(g, hw, 0,      hw, hh,      col);
    _line(g, hw - 14, hh, hw + 14, hh, col, 2.2);
    _line(g, hw - 9,  hh + 5, hw + 9,  hh + 5, col, 1.6);
    _line(g, hw - 4,  hh + 10, hw + 4, hh + 10, col, 1.2);
  }

  if (type === 'vm') {
    // Círculo grande con V
    _circle(g, hw, hh, Math.min(hw, hh) - 4, '#9B59B6');
    // Líneas de conexión
    _line(g, 0, hh, hw - Math.min(hw,hh) + 4, hh, '#9B59B6');
    _line(g, hw + Math.min(hw,hh) - 4, hh, w, hh, '#9B59B6');
    // Letra V
    const tv = svgEl('text', {
      x: hw, y: hh,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': '18',
      'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif',
      fill: '#9B59B6'
    });
    tv.textContent = 'V';
    g.appendChild(tv);
    // Marcas + y −
    _text(g, '+', hw - 18, hh - 14, '#E8593C', 10, '700');
    _text(g, '−', hw + 18, hh - 14, '#3B8BD4', 10, '700');
  }

  if (type === 'am') {
    // Círculo con A
    _circle(g, hw, hh, 16, '#E67E22');
    _line(g, 0, hh, hw - 16, hh, '#E67E22');
    _line(g, hw + 16, hh, w, hh, '#E67E22');
    const ta = svgEl('text', {
      x: hw, y: hh,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': '12',
      'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif',
      fill: '#E67E22'
    });
    ta.textContent = 'A';
    g.appendChild(ta);
    // Flecha de dirección
    _line(g, hw - 8, hh + 10, hw + 8, hh + 10, '#E67E22', 1.5);
    _arrow(g, hw + 8, hh + 10, '#E67E22');
    // Marcas + y −
    _text(g, '+', 8,   hh - 10, '#E8593C', 9, '700');
    _text(g, '−', w-8, hh - 10, '#3B8BD4', 9, '700');
  }

}

// ─── Helpers SVG ───
function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function _line(g, x1, y1, x2, y2, stroke, sw = 1.8) {
  g.appendChild(svgEl('line', {
    x1, y1, x2, y2, stroke,
    'stroke-width': sw, 'stroke-linecap': 'round'
  }));
}

function _rect(g, x, y, w, h, stroke) {
  g.appendChild(svgEl('rect', {
    x, y, width: w, height: h,
    rx: 3, fill: 'none', stroke, 'stroke-width': 1.8
  }));
}

function _circle(g, cx, cy, r, stroke) {
  g.appendChild(svgEl('circle', {
    cx, cy, r, fill: 'none', stroke, 'stroke-width': 1.8
  }));
}

function _arrow(g, x, y, fill) {
  g.appendChild(svgEl('polygon', {
    points: `${x-6},${y-4} ${x+2},${y} ${x-6},${y+4}`,
    fill
  }));
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