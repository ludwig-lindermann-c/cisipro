// ─── Motor de análisis nodal modificado (MNA) ───

function runSimulation() {
  simResults = null;

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

function _mna() {

  // ── Paso 1: asignar IDs de terminal ──
  const termId = {};
  let tid = 0;
  for (const c of components) {
    const pts = getTerminals(c);
    pts.forEach((_, i) => { termId[`${c.id}-${i}`] = tid++; });
  }

  // ── Paso 2: union-find ──
  const parent = Array.from({ length: tid }, (_, i) => i);

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function unite(a, b) {
    parent[find(a)] = find(b);
  }

  // Asignar IDs a extremos de cables
  const wireNodeId = {};
  let wnid = tid;
  for (const w of wires) {
    const keyA = `wire-${w.id}-a`;
    const keyB = `wire-${w.id}-b`;
    wireNodeId[keyA] = wnid++;
    wireNodeId[keyB] = wnid++;
    parent.push(wireNodeId[keyA], wireNodeId[keyB]);
    unite(wireNodeId[keyA], wireNodeId[keyB]);
  }

  // Conectar terminales de componentes con extremos de cables
  for (const w of wires) {
    const keyA = `wire-${w.id}-a`;
    const keyB = `wire-${w.id}-b`;
    if (w.c1 !== null && w.ti1 !== null) {
      const t = termId[`${w.c1}-${w.ti1}`];
      if (t !== undefined) unite(t, wireNodeId[keyA]);
    }
    if (w.c2 !== null && w.ti2 !== null) {
      const t = termId[`${w.c2}-${w.ti2}`];
      if (t !== undefined) unite(t, wireNodeId[keyB]);
    }
  }

  // Conectar cables que comparten el mismo punto físico
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const wi = wires[i];
      const wj = wires[j];
      const pts  = [
        { ka: `wire-${wi.id}-a`, xa: wi.x1, ya: wi.y1 },
        { ka: `wire-${wi.id}-b`, xa: wi.x2, ya: wi.y2 }
      ];
      const pts2 = [
        { kb: `wire-${wj.id}-a`, xb: wj.x1, yb: wj.y1 },
        { kb: `wire-${wj.id}-b`, xb: wj.x2, yb: wj.y2 }
      ];
      for (const p1 of pts) {
        for (const p2 of pts2) {
          if (Math.abs(p1.xa - p2.xb) < 2 && Math.abs(p1.ya - p2.yb) < 2) {
            unite(wireNodeId[p1.ka], wireNodeId[p2.kb]);
          }
        }
      }
    }
  }

// Conectar cables que pasan por un junction
  for (const j of junctions) {
    const jKey = `junction-${j.id}`;
    const jnid = wnid++;
    parent.push(jnid);
    wireNodeId[jKey] = jnid;

    for (const w of wires) {
      const keyA = `wire-${w.id}-a`;
      const keyB = `wire-${w.id}-b`;
      if (Math.abs(w.x1 - j.x) < 4 && Math.abs(w.y1 - j.y) < 4) {
        unite(wireNodeId[keyA], wireNodeId[jKey]);
      }
      if (Math.abs(w.x2 - j.x) < 4 && Math.abs(w.y2 - j.y) < 4) {
        unite(wireNodeId[keyB], wireNodeId[jKey]);
      }
    }
  }

  // Conectar también cables que comparten punto físico con el junction
  // aunque no estén registrados explícitamente
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const wi = wires[i];
      const wj = wires[j];
      const endPoints = [
        { key: `wire-${wi.id}-a`, x: wi.x1, y: wi.y1 },
        { key: `wire-${wi.id}-b`, x: wi.x2, y: wi.y2 },
        { key: `wire-${wj.id}-a`, x: wj.x1, y: wj.y1 },
        { key: `wire-${wj.id}-b`, x: wj.x2, y: wj.y2 }
      ];
      // Si extremo de wi coincide con extremo de wj
      for (const ei of endPoints.slice(0,2)) {
        for (const ej of endPoints.slice(2,4)) {
          if (Math.abs(ei.x - ej.x) < 4 && Math.abs(ei.y - ej.y) < 4) {
            unite(wireNodeId[ei.key], wireNodeId[ej.key]);
          }
        }
      }
    }
  }

  // ── Paso 3: identificar nodo GND ──
  const gnd = components.find(c => c.type === 'gnd');
  const gndTerm  = termId[`${gnd.id}-0`];
  const gndTerm1 = termId[`${gnd.id}-1`];
  if (gndTerm1 !== undefined) unite(gndTerm, gndTerm1);
  if (gndTerm === undefined) {
    setStatus('⚠ El componente GND no está conectado.');
    return null;
  }
  const gndRoot = find(gndTerm);

  // ── Paso 4: numerar nodos (GND = 0) ──
  const roots = new Set();
  for (let i = 0; i < parent.length; i++) roots.add(find(i));

  const nodeMap = {};
  let nodeCount = 0;
  for (const r of roots) {
    nodeMap[r] = (r === gndRoot) ? 0 : ++nodeCount;
  }

  function nodeOf(compId, termIdx) {
    const t = termId[`${compId}-${termIdx}`];
    if (t === undefined) return -1;
    const r = find(t);
    return nodeMap[r] ?? 0;
  }

  // ── Paso 5: construir sistema MNA ──
  const vSources = components.filter(c => c.type === 'vs');
  const N = nodeCount;
  const M = vSources.length;
  const S = N + M;

  if (S === 0) {
    setStatus('⚠ No hay nodos activos. Verifica las conexiones.');
    return null;
  }

  const A = Array.from({ length: S }, () => new Array(S).fill(0));
  const b = new Array(S).fill(0);

  // Estampar resistencias
  for (const c of components) {
    if (c.type !== 'r') continue;
    if (c.value === 0) {
      setStatus(`⚠ ${c.name} tiene valor 0Ω.`);
      return null;
    }
    const G  = 1 / c.value;
    const n1 = nodeOf(c.id, 0);
    const n2 = nodeOf(c.id, 1);
    if (n1 > 0) A[n1-1][n1-1] += G;
    if (n2 > 0) A[n2-1][n2-1] += G;
    if (n1 > 0 && n2 > 0) { A[n1-1][n2-1] -= G; A[n2-1][n1-1] -= G; }
  }

  // Estampar fuentes de corriente
  for (const c of components) {
    if (c.type !== 'cs') continue;
    const n1 = nodeOf(c.id, 0);
    const n2 = nodeOf(c.id, 1);
    if (n2 > 0) b[n2-1] += c.value;
    if (n1 > 0) b[n1-1] -= c.value;
  }

  // Estampar fuentes de voltaje
  vSources.forEach((c, k) => {
    const nPlus  = nodeOf(c.id, 0);
    const nMinus = nodeOf(c.id, 1);
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
  const V = new Array(nodeCount + 1).fill(0);
  for (let i = 1; i <= nodeCount; i++) V[i] = x[i-1] ?? 0;

  // ── Paso 8: V, I, P por componente ──
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

  // ── Paso 9: calcular corriente real por cable ──
  const wireCurrent = {};
  for (const w of wires) {
    const nA = nodeMap[find(wireNodeId[`wire-${w.id}-a`])] ?? 0;
    const nB = nodeMap[find(wireNodeId[`wire-${w.id}-b`])] ?? 0;
    const vA = V[nA] ?? 0;
    const vB = V[nB] ?? 0;

    // Buscar resistencia conectada a este cable para calcular I=V/R
    let current = null;

    if (w.c1 !== null) {
      const comp = components.find(c => c.id === w.c1);
      if (comp && compData[comp.id]) {
        current = w.ti1 === 1
          ? compData[comp.id].i
          : -compData[comp.id].i;
      }
    }
    if (current === null && w.c2 !== null) {
      const comp = components.find(c => c.id === w.c2);
      if (comp && compData[comp.id]) {
        current = w.ti2 === 1
          ? -compData[comp.id].i
          : compData[comp.id].i;
      }
    }

    // Si no tiene componente directo, usar diferencia de tensión
    // y buscar resistencia equivalente del nodo
    if (current === null && Math.abs(vA - vB) > 1e-9) {
      // Buscar corriente total que sale del nodo de mayor tensión
      const highNode = vA > vB ? nA : nB;
      let totalI = 0;
      for (const c of components) {
        const r = compData[c.id];
        if (!r) continue;
        const cn1 = nodeOf(c.id, 0);
        const cn2 = nodeOf(c.id, 1);
        if (cn1 === highNode || cn2 === highNode) {
          totalI += Math.abs(r.i);
        }
      }
      current = vA > vB ? totalI : -totalI;
    }

    wireCurrent[w.id] = current ?? 0;
  }

  return { nodes: V, nodeCount, components: compData, nodeOf, wireCurrent };
}

function _gaussElimination(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c2 = col; c2 <= n; c2++) M[r][c2] -= factor * M[col][c2];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}