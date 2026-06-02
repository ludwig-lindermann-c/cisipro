// ─── Definición y configuración de componentes ───

const GRID = 20;

const COMPONENT_DEFAULTS = {
  vs:   { value: 10,   name: 'V',   w: 80, h: 40 },
  cs:   { value: 2,    name: 'I',   w: 80, h: 40 },
  r:    { value: 1000, name: 'R',   w: 80, h: 40 },
  gnd:  { value: 0,    name: 'GND', w: 40, h: 40 },
  node: { value: 0,    name: 'N',   w: 20, h: 20 },
  vm:   { value: 0,    name: 'VM',  w: 80, h: 40 },
  am:   { value: 0,    name: 'AM',  w: 80, h: 40 },
  om:   { value: 0,    name: 'OM',  w: 80, h: 40 },
  wm:   { value: 0,    name: 'WM',  w: 80, h: 80 }
};

let _idCounter = 0;
function nextId() { return ++_idCounter; }

const _typeCount = {};
function nextName(type) {
  _typeCount[type] = (_typeCount[type] || 0) + 1;
  return COMPONENT_DEFAULTS[type].name + _typeCount[type];
}

function resetCounters() {
  _idCounter = 0;
  for (let key in _typeCount) {
    delete _typeCount[key];
  }
}

function createComponent(type, x, y) {
  // Límite de 35 componentes para mantener rendimiento
  if (window.components && window.components.length >= 35) {
    if (window.setStatus) window.setStatus('⚠ Límite de 35 componentes alcanzado. Elimina algunos para continuar.');
    return null;
  }
  
  const def = COMPONENT_DEFAULTS[type];
  if (!def) return null;
  
  // Asegurar que w y h sean múltiplos de GRID
  const w = Math.ceil(def.w / GRID) * GRID;
  const h = Math.ceil(def.h / GRID) * GRID;
  
  let cx, cy;
  if (type === 'node') {
    cx = snapGrid(x) - GRID;
    cy = snapGrid(y) - GRID;
  } else {
    cx = snapGrid(x - w / 2);
    cy = snapGrid(y - h / 2);
  }
  
  return {
    id: nextId(), type, name: nextName(type),
    x: cx, y: cy, w: w, h: h,
    rot: 0, value: def.value,
    porcentaje: 50  // Valor inicial 50%
  };
}

function snapGrid(v) {
  return Math.round(v / GRID) * GRID;
}

// Función mejorada: respeta la rotación para todos los componentes

// Función mejorada: respeta la rotación VISUAL del componente
// Para fuentes de voltaje: el signo + visible es el terminal POSITIVO
function getTerminals(c) {
  const snap = v => Math.round(v / GRID) * GRID;
  const cx = snap(c.x + c.w / 2);
  const cy = snap(c.y + c.h / 2);
  
  // GND: solo un terminal
  if (c.type === 'gnd') return [{ x: cx, y: c.y }];
  
  // Nodo: 4 terminales
  if (c.type === 'node') return [
    { x: cx, y: c.y },           // arriba
    { x: cx, y: c.y + c.h },     // abajo
    { x: c.x, y: cy },           // izquierda
    { x: c.x + c.w, y: cy }      // derecha
  ];

    // Wattímetro: 4 terminales (I+, I-, V+, V-)
  // Este orden permite medir corriente en serie y voltaje en paralelo
  if (c.type === 'wm') {
    const snap = v => Math.round(v / GRID) * GRID;
    const cx = snap(c.x + c.w / 2);
    const cy = snap(c.y + c.h / 2);
    // NUEVO ORDEN: term0=I+, term1=I-, term2=V+, term3=V-
    return [
      { x: c.x, y: cy },           // term0: I+ (izquierda) - entrada corriente
      { x: c.x + c.w, y: cy },     // term1: I- (derecha) - salida corriente
      { x: cx, y: c.y },           // term2: V+ (arriba) - voltaje positivo
      { x: cx, y: c.y + c.h }      // term3: V- (abajo) - voltaje negativo
    ];
  }
  
  // Para componentes de dos terminales
  // rot=0: horizontal, positivo a la DERECHA (donde está el signo + visible)
  // rot=90: vertical, positivo hacia ABAJO
  // rot=180: horizontal, positivo a la IZQUIERDA
  // rot=270: vertical, positivo hacia ARRIBA
  
  if (c.rot === 0) {
    // Horizontal: positivo derecha (+), negativo izquierda (-)
    // El terminal 0 es positivo, terminal 1 es negativo
    return [{ x: c.x + c.w, y: cy }, { x: c.x, y: cy }];
  }
  
  if (c.rot === 90) {
    // Vertical: positivo abajo (+), negativo arriba (-)
    return [{ x: cx, y: c.y + c.h }, { x: cx, y: c.y }];
  }
  
  if (c.rot === 180) {
    // Horizontal invertido: positivo izquierda (+), negativo derecha (-)
    return [{ x: c.x, y: cy }, { x: c.x + c.w, y: cy }];
  }
  
  if (c.rot === 270) {
    // Vertical invertido: positivo arriba (+), negativo abajo (-)
    return [{ x: cx, y: c.y }, { x: cx, y: c.y + c.h }];
  }
  
  // Por defecto (rot=0)
  return [{ x: c.x + c.w, y: cy }, { x: c.x, y: cy }];
}

function isHorizontal(c) {
  return c.rot === 0 || c.rot === 180;
}

function formatValue(value, type) {
  const units = { vs: 'V', cs: 'A', r: 'Ω', gnd: '' };
  return _applyPrefix(value) + (units[type] || '');
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
  if (a >= 1e9)  return { base: parseFloat((value / 1e9).toPrecision(6)),   prefix: '1e9'   };
  if (a >= 1e6)  return { base: parseFloat((value / 1e6).toPrecision(6)),   prefix: '1e6'   };
  if (a >= 1e3)  return { base: parseFloat((value / 1e3).toPrecision(6)),   prefix: '1e3'   };
  if (a >= 1)    return { base: parseFloat(value.toPrecision(6)),            prefix: '1'     };
  if (a >= 1e-3) return { base: parseFloat((value / 1e-3).toPrecision(6)),  prefix: '1e-3'  };
  if (a >= 1e-6) return { base: parseFloat((value / 1e-6).toPrecision(6)),  prefix: '1e-6'  };
  if (a >= 1e-9) return { base: parseFloat((value / 1e-9).toPrecision(6)),  prefix: '1e-9'  };
  return           { base: parseFloat((value / 1e-12).toPrecision(6)),       prefix: '1e-12' };
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
    vm: '#9B59B6', am: '#E67E22', om: '#27AE60',
    wm: '#F39C12'
  };
  return colors[type] || '#666666';
}

// ─── Construir símbolo SVG ───
function buildSymbol(c) {
  const g  = svgEl('g', {});
  const cx = c.w / 2;
  const cy = c.h / 2;

  if (c.type === 'node') {
    g.appendChild(svgEl('circle', { cx, cy, r: '6', fill: '#cccccc', stroke: 'none' }));
    return g;
  }

  if (c.type === 'gnd') {
    _drawSymbol(g, c.type, c.w, c.h);
    return g;
  }

  // Fuente de voltaje — símbolo base + signos según orientación
  if (c.type === 'vs') {
    const isH   = isHorizontal(c);
    const drawW = isH ? c.w : c.h;
    const drawH = isH ? c.h : c.w;
    const sym   = svgEl('g', {});

    _drawVsBase(sym, drawW, drawH);

    if (c.rot === 90) {
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

  // Amperímetro
  if (c.type === 'am') {
    const isH   = isHorizontal(c);
    const drawW = isH ? c.w : c.h;
    const drawH = isH ? c.h : c.w;
    const sym   = svgEl('g', {});
    _drawAmBase(sym, drawW, drawH);
    if (c.rot === 90) {
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

    // Letra A horizontal (sin rotación, siempre derecha)
    const letraA = svgEl('text', {
      x: cx, y: cy,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': '14', 'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif', fill: '#E67E22'
    });
    letraA.textContent = 'A';
    g.appendChild(letraA);

    // Signos cerca de los terminales
    const terms  = getTerminals(c);
    const tPlus  = { x: terms[0].x - c.x, y: terms[0].y - c.y };
    const tMinus = { x: terms[1].x - c.x, y: terms[1].y - c.y };
    if (isH) {
      // Horizontal: signos cerca de los terminales
      _text(g, '+', tPlus.x  + (c.rot === 0 ? -3 : 1), cy - 10, '#E8593C', 9, '700');
      _text(g, '−', tMinus.x + (c.rot === 0 ? 3 : -1), cy - 10, '#3B8BD4', 9, '700');
    } else {
      // Vertical: signos cerca de los terminales
      _text(g, '+', cx + 8, tPlus.y  + (c.rot === 90 ? -3 : 1), '#E8593C', 9, '700');
      _text(g, '−', cx + 8, tMinus.y + (c.rot === 90 ? 3 : -1), '#3B8BD4', 9, '700');
    }
    return g;
  }

    // Voltímetro
  if (c.type === 'vm') {
    const isH   = isHorizontal(c);
    const drawW = isH ? c.w : c.h;
    const drawH = isH ? c.h : c.w;
    const sym   = svgEl('g', {});
    _drawVmBase(sym, drawW, drawH);
    if (c.rot === 90) {
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

    // Letra V horizontal (sin rotación, siempre derecha)
    const letraV = svgEl('text', {
      x: cx, y: cy,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': '14', 'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif', fill: '#9B59B6'
    });
    letraV.textContent = 'V';
    g.appendChild(letraV);

    // Signos cerca de los terminales
    const terms  = getTerminals(c);
    const tPlus  = { x: terms[0].x - c.x, y: terms[0].y - c.y };
    const tMinus = { x: terms[1].x - c.x, y: terms[1].y - c.y };
    if (isH) {
      // Horizontal: signos cerca de los terminales
      _text(g, '+', tPlus.x  + (c.rot === 0 ? -3 : 1), cy - 10, '#E8593C', 9, '700');
      _text(g, '−', tMinus.x + (c.rot === 0 ? 3 : -1), cy - 10, '#3B8BD4', 9, '700');
    } else {
      // Vertical: signos cerca de los terminales
      _text(g, '+', cx + 8, tPlus.y  + (c.rot === 90 ? -3 : 1), '#E8593C', 9, '700');
      _text(g, '−', cx + 8, tMinus.y + (c.rot === 90 ? 3 : -1), '#3B8BD4', 9, '700');
    }
    return g;
  }

    // Óhmetro
  if (c.type === 'om') {
    const isH   = isHorizontal(c);
    const drawW = isH ? c.w : c.h;
    const drawH = isH ? c.h : c.w;
    const sym   = svgEl('g', {});
    _drawOmBase(sym, drawW, drawH);
    if (c.rot === 90) {
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

    // Letra Ω horizontal (sin rotación, siempre derecha)
    const letraO = svgEl('text', {
      x: cx, y: cy,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': '13', 'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif', fill: '#27AE60'
    });
    letraO.textContent = 'Ω';
    g.appendChild(letraO);

    // NO se dibujan signos + y - (el óhmetro no tiene polaridad)
    return g;
  }

  // Wattímetro — cruz simétrica con círculo central (bounding box cuadrado 80x80)
  if (c.type === 'wm') {
    const col = '#F39C12';
    const cr  = 18; // radio del círculo central, proporcional a 80x80
    // cx = c.w/2 = 40, cy = c.h/2 = 40

    // Brazos de la cruz (coords relativas al grupo)
    _line(g, cx,      0,       cx,      cy - cr, col, 2.2); // V+ arriba
    _line(g, cx,      cy + cr, cx,      c.h,     col, 2.2); // V− abajo
    _line(g, 0,       cy,      cx - cr, cy,      col, 2.2); // I+ izq
    _line(g, cx + cr, cy,      c.w,     cy,      col, 2.2); // I− der

    // Círculo central
    g.appendChild(svgEl('circle', {
      cx, cy, r: cr,
      fill: 'var(--bg-primary)', stroke: col, 'stroke-width': '2.2'
    }));

    // Letra W
    const letraW = svgEl('text', {
      x: cx, y: cy,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': '15', 'font-weight': '700',
      'font-family': 'Segoe UI, sans-serif', fill: col
    });
    letraW.textContent = 'W';
    g.appendChild(letraW);

    // Etiquetas junto a cada terminal
    const lblData = [
      { t: 'V+', x: cx + 3,  y: 10,       anchor: 'start', color: '#E8593C' },
      { t: 'V−', x: cx + 3,  y: c.h - 4,  anchor: 'start', color: '#3B8BD4' },
      { t: 'I+', x: 3,       y: cy - 5,   anchor: 'start', color: '#E8593C' },
      { t: 'I−', x: c.w - 3, y: cy - 5,   anchor: 'end',   color: '#3B8BD4' },
    ];
    for (const l of lblData) {
      const t = svgEl('text', {
        x: l.x, y: l.y,
        'text-anchor': l.anchor,
        'font-size': '7', 'font-weight': '600',
        'font-family': 'Segoe UI, sans-serif', fill: l.color
      });
      t.textContent = l.t;
      g.appendChild(t);
    }

    return g;
  }

  // Resistencia u otros componentes
  const isH   = isHorizontal(c);
  const drawW = isH ? c.w : c.h;
  const drawH = isH ? c.h : c.w;
  const sym   = svgEl('g', {});
  _drawSymbol(sym, c.type, drawW, drawH);
  if (c.rot === 90) {
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

// ─── Símbolo base fuente de voltaje (sin signos) ───
function _drawVsBase(g, w, h) {
  const hw  = w / 2;
  const hh  = h / 2;
  const col = compColor('vs');
  _line(g, 0,       hh, hw - 20, hh, col);
  _circle(g, hw, hh, 20, col);
  _line(g, hw + 20, hh, w, hh, col);
  // Signos fijos: − izquierda, + derecha (siempre en base horizontal)
  _line(g, hw - 9, hh - 7, hw - 9, hh + 7, '#3B8BD4', 2.5);
  _line(g, hw + 4,  hh - 7, hw + 4, hh + 7, '#E8593C', 2.5);
  _line(g, hw - 3,  hh,     hw + 11, hh,    '#E8593C', 2.5);
}

// ─── Símbolo base amperímetro (sin signos) ───
function _drawAmBase(g, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  const r  = Math.min(hw, hh) - 4;
  _line(g, 0,      hh, hw - r, hh, '#E67E22');
  _line(g, hw + r, hh, w,      hh, '#E67E22');
  _circle(g, hw, hh, r, '#E67E22');
  // La letra se dibujará por separado (sin rotación)
}

function _drawVmBase(g, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  const r  = Math.min(hw, hh) - 4;
  _line(g, 0,      hh, hw - r, hh, '#9B59B6');
  _line(g, hw + r, hh, w,      hh, '#9B59B6');
  _circle(g, hw, hh, r, '#9B59B6');
  // La letra se dibujará por separado
}

function _drawOmBase(g, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  const r  = Math.min(hw, hh) - 4;
  _line(g, 0,      hh, hw - r, hh, '#27AE60');
  _line(g, hw + r, hh, w,      hh, '#27AE60');
  _circle(g, hw, hh, r, '#27AE60');
  // La letra Ω se dibuja por separado en buildSymbol (horizontal)
}

// ─── Símbolo base wattímetro ───
function _drawWmBase(g, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  const r  = Math.min(hw, hh) - 4;
  _line(g, 0,      hh, hw - r, hh, '#F39C12');
  _line(g, hw + r, hh, w,      hh, '#F39C12');
  _circle(g, hw, hh, r, '#F39C12');
  // La letra W se dibuja por separado (horizontal)
}

// ─── Dibujar símbolo base ───
function _drawSymbol(g, type, w, h) {
  const hw  = w / 2;
  const hh  = h / 2;
  const col = compColor(type);

  if (type === 'r') {
    _line(g, 0,       hh, hw - 16, hh, col);
    _rect(g, hw - 16, hh - 9, 32, 18, col);
    _line(g, hw + 16, hh, w,       hh, col);

  } else if (type === 'cs') {
    _line(g, 0,       hh, hw - 20, hh, col);
    _circle(g, hw, hh, 20, col);
    _line(g, hw - 13, hh, hw + 6,  hh, '#3B8BD4', 2);
    _arrow(g, hw + 6, hh, '#3B8BD4');
    _line(g, hw + 20, hh, w,       hh, col);

  } else if (type === 'gnd') {
    _line(g, hw, 0,        hw, hh,          col);
    _line(g, hw - 14, hh,  hw + 14, hh,    col, 2.2);
    _line(g, hw - 9,  hh+5, hw + 9, hh+5,  col, 1.6);
    _line(g, hw - 4,  hh+10, hw + 4, hh+10, col, 1.2);
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
    points: `${x-6},${y-4} ${x+2},${y} ${x-6},${y+4}`, fill
  }));
}

function _text(g, txt, x, y, fill, size = 10, weight = '400') {
  const t = svgEl('text', {
    x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    'font-size': size, 'font-weight': weight,
    'font-family': 'Segoe UI, system-ui, sans-serif', fill
  });
  t.textContent = txt;
  g.appendChild(t);
}

function _terminalDot(g, x, y, color) {
  const dot = svgEl('circle', {
    cx: x, cy: y, r: 4,
    fill: 'white',
    stroke: color,
    'stroke-width': '1.8'
  });
  g.appendChild(dot);
}