// ─── Punto de entrada principal ───

document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  bindUI();
  loadExample();
  setStatus('Bienvenido a CiSIPro. Arrastra componentes al canvas o edita el ejemplo.');
});

// ─── Circuito de ejemplo ───
function loadExample() {

  // Fuente de voltaje vertical
  const v1 = {
    id: nextId(), type: 'vs', name: 'V1',
    x: 140, y: 220, w: 40, h: 80,
    dir: 'v', value: 12
  };
  components.push(v1);

  // R1 horizontal
  const r1 = {
    id: nextId(), type: 'r', name: 'R1',
    x: 280, y: 200, w: 80, h: 40,
    dir: 'h', value: 1000
  };
  components.push(r1);

  // R2 horizontal
  const r2 = {
    id: nextId(), type: 'r', name: 'R2',
    x: 280, y: 300, w: 80, h: 40,
    dir: 'h', value: 2200
  };
  components.push(r2);

  // Tierra
  const gnd = {
    id: nextId(), type: 'gnd', name: 'GND1',
    x: 140, y: 380, w: 40, h: 40,
    dir: 'h', value: 0
  };
  components.push(gnd);

  // ── Cables ──
  // V1 vertical:    terminal 0 = arriba  (160, 220)
  //                 terminal 1 = abajo   (160, 300)
  // R1 horizontal:  terminal 0 = izq     (280, 220)
  //                 terminal 1 = der     (360, 220)
  // R2 horizontal:  terminal 0 = izq     (280, 320)
  //                 terminal 1 = der     (360, 320)
  // GND:            terminal 0 = arriba  (160, 380)

  // V1 arriba → R1 izquierda
  wires.push({ id: nextId(),
    x1: 160, y1: 220, x2: 280, y2: 220,
    c1: v1.id, ti1: 0, c2: r1.id, ti2: 0
  });

  // R1 derecha → R2 derecha (nodo de salida del divisor)
  wires.push({ id: nextId(),
    x1: 360, y1: 220, x2: 360, y2: 320,
    c1: r1.id, ti1: 1, c2: r2.id, ti2: 1
  });

  // R2 izquierda → V1 abajo
  wires.push({ id: nextId(),
    x1: 280, y1: 320, x2: 160, y2: 320,
    c1: r2.id, ti1: 0, c2: v1.id, ti2: 1
  });

  // V1 abajo → GND
  wires.push({ id: nextId(),
    x1: 160, y1: 300, x2: 160, y2: 380,
    c1: v1.id, ti1: 1, c2: gnd.id, ti2: 0
  });

  renderAll();
}