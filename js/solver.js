// ─── Motor de análisis nodal modificado (MNA) ───

function runSimulation() {
  simResults = null;

  // Validaciones previas
  if (components.length === 0) {
    setStatus('⚠ No hay componentes en el circuito.');
    return false;
  }

  const gndComps = components.filter(c => c.type === 'gnd');
  if (gndComps.length === 0) {
    setStatus('⚠ Falta referencia a tierra (GND). Añade un componente Tierra.');
    return false;
  }

  if (wires.length === 0) {
    setStatus('⚠ No hay conexiones. Conecta los componentes con cables.');
    return false;
  }

  try {
    const result = _mna();
    if (!result) return false;
    simResults = result;
    return true;
  } catch (err) {
    setStatus('⚠ Error en el análisis: ' + err.message);
    return false;
  }
}

// ─── Núcleo MNA ───
function _mna() {

  // ── Paso 1: asignar IDs de terminal ──
  // Cada terminal de cada componente recibe un ID único
  const termId = {};
  let tid = 0;
  for (const c of components) {
    const pts = getTerminals(c);
    pts.forEach((_, i) => {
      termId[`${c.id}-${i}`] = tid++;
    });
  }

  // ── Paso 2: union-find para fusionar nodos por cables ──
  const parent = Array.from({ length: tid }, (_, i) => i);

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function unite(a, b) {
    parent[find(a)] = find(b);
  }

  for (const w of wires) {
    const a = termId[`${w.c1}-${w.ti1}`];
    const b = termId[`${w.c2}-${w.ti2}`];
    if (a !== undefined && b !== undefined) unite(a, b);
  }

  // ── Paso 3: identificar nodo GND ──
  const gnd = components.find(c => c.type === 'gnd');
  const gndTerm = termId[`${gnd.id}-0`];
  const gndTerm1 = termId[`${gnd.id}-1`];
  if (gndTerm1 !== undefined) unite(gndTerm, gndTerm1);
  if (gndTerm === undefined) {
    setStatus('⚠ El componente GND no está conectado.');
    return null;
  }
  const gndRoot = find(gndTerm);

  // ── Paso 4: numerar nodos (GND = 0) ──
  const roots = new Set();
  for (let i = 0; i < tid; i++) roots.add(find(i));

  const nodeMap = {};
  let nodeCount = 0;
  for (const r of roots) {
    nodeMap[r] = (r === gndRoot) ? 0 : ++nodeCount;
  }

  // Función auxiliar: obtener número de nodo de un terminal
  function nodeOf(compId, termIdx) {
    const t = termId[`${compId}-${termIdx}`];
    if (t === undefined) return -1;
    const r = find(t);
    return nodeMap[r] ?? 0;
  }

  // ── Paso 5: construir sistema MNA ──
  const vSources = components.filter(c => c.type === 'vs');
  const N = nodeCount;       // nodos desconocidos
  const M = vSources.length; // fuentes de voltaje
  const S = N + M;           // tamaño del sistema

  if (S === 0) {
    setStatus('⚠ No hay nodos activos. Verifica las conexiones.');
    return null;
  }

  // Matriz A y vector b
  const A = Array.from({ length: S }, () => new Array(S).fill(0));
  const b = new Array(S).fill(0);

  // ── Estampar resistencias ──
  for (const c of components) {
    if (c.type !== 'r') continue;
    if (c.value === 0) {
      setStatus(`⚠ ${c.name} tiene valor 0Ω. Usa un valor mayor a 0.`);
      return null;
    }
    const G  = 1 / c.value;
    const n1 = nodeOf(c.id, 0);
    const n2 = nodeOf(c.id, 1);

    if (n1 > 0) A[n1-1][n1-1] += G;
    if (n2 > 0) A[n2-1][n2-1] += G;
    if (n1 > 0 && n2 > 0) {
      A[n1-1][n2-1] -= G;
      A[n2-1][n1-1] -= G;
    }
  }

  // ── Estampar fuentes de corriente ──
  for (const c of components) {
    if (c.type !== 'cs') continue;
    const n1 = nodeOf(c.id, 0); // terminal −
    const n2 = nodeOf(c.id, 1); // terminal + (corriente entra)
    if (n2 > 0) b[n2-1] += c.value;
    if (n1 > 0) b[n1-1] -= c.value;
  }

  // ── Estampar fuentes de voltaje ──
  vSources.forEach((c, k) => {
    const nPlus  = nodeOf(c.id, 0); // terminal +
    const nMinus = nodeOf(c.id, 1); // terminal −
    const row = N + k;

    if (nPlus  > 0) { A[row][nPlus-1]  =  1; A[nPlus-1][row]  =  1; }
    if (nMinus > 0) { A[row][nMinus-1] = -1; A[nMinus-1][row] = -1; }
    b[row] = c.value;
  });

  // ── Paso 6: resolver Ax = b ──
  const x = _gaussElimination(A, b);
  if (!x) {
    setStatus('⚠ Sistema singular. Verifica que el circuito esté correctamente conectado.');
    return null;
  }

  // ── Paso 7: tensiones de nodo ──
  const V = new Array(nodeCount + 1).fill(0); // V[0] = GND = 0
  for (let i = 1; i <= nodeCount; i++) {
    V[i] = x[i-1] ?? 0;
  }

  // ── Paso 8: calcular V, I, P por componente ──
  const compData = {};

  for (const c of components) {
    if (c.type === 'gnd') continue;

    const n1 = nodeOf(c.id, 0);
    const n2 = nodeOf(c.id, 1);
    const v1 = V[n1] ?? 0;
    const v2 = V[n2] ?? 0;

    if (c.type === 'r') {
      const vc = v1 - v2;
      const ic = vc / c.value;
      compData[c.id] = { v: vc, i: ic, p: vc * ic };

    } else if (c.type === 'vs') {
      const idx = vSources.indexOf(c);
      const ic  = -(x[N + idx] ?? 0);
      compData[c.id] = { v: c.value, i: ic, p: c.value * ic };

    } else if (c.type === 'cs') {
      const vc = v1 - v2;
      compData[c.id] = { v: vc, i: c.value, p: vc * c.value };
    }
  }

  // ── Paso 9: corriente en cables ──
  for (const w of wires) {
    const c = components.find(x => x.id === w.c1);
    if (c && compData[c.id]) {
      w.current = compData[c.id].i;
    }
  }

  return {
    nodes:      V,
    nodeCount,
    components: compData,
    nodeOf
  };
}

// ─── Eliminación Gaussiana con pivoteo parcial ───
function _gaussElimination(A, b) {
  const n = b.length;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Pivoteo parcial
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    // Singular?
    if (Math.abs(M[col][col]) < 1e-12) return null;

    // Eliminación
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c2 = col; c2 <= n; c2++) {
        M[r][c2] -= factor * M[col][c2];
      }
    }
  }

  return M.map((row, i) => row[n] / row[i]);
}