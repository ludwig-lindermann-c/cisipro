// ─── Motor de análisis nodal modificado (MNA) - VERSIÓN CORREGIDA ───

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

  if (wires.length === 0 && components.filter(c => c.type !== 'gnd' && c.type !== 'node').length > 0) {
    setStatus('⚠ No hay conexiones. Conecta los componentes con cables.');
    return false;
  }

  const hasOhmmeter = components.some(c => c.type === 'om');
  const hasSources  = components.some(c => c.type === 'vs' || c.type === 'cs');
  if (hasOhmmeter && hasSources) {
    setStatus('⚠ El óhmetro no puede usarse con fuentes activas en el circuito.');
    return false;
  }

  try {
    const result = _mnaCorregido();
    if (!result) return false;
    simResults = result;
    return true;
  } catch (err) {
    setStatus('⚠ Error en el análisis: ' + err.message);
    console.error(err);
    return false;
  }
}

// Función principal corregida
function _mnaCorregido() {
  
  // ============================================
  // PASO 1: Crear un mapa de todas las posiciones (terminales y puntos de cable)
  // ============================================
  
  // Colección de todos los puntos eléctricos
  const puntos = new Map(); // "x,y" -> id
  
  function obtenerIdPunto(x, y) {
    const tol = 5; // tolerancia en píxeles
    // Buscar punto existente cercano
    for (let [key, id] of puntos) {
      const [px, py] = key.split(',').map(Number);
      if (Math.abs(px - x) <= tol && Math.abs(py - y) <= tol) {
        return id;
      }
    }
    // Si no existe, crear nuevo
    const nuevoId = puntos.size;
    puntos.set(`${Math.round(x/20)*20},${Math.round(y/20)*20}`, nuevoId);
    return nuevoId;
  }
  
  // Registrar todas las terminales de componentes
  for (const c of components) {
    const terms = getTerminals(c);
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      const id = obtenerIdPunto(t.x, t.y);
      if (!c.terminals) c.terminals = [];
      c.terminals[i] = id;
    }
  }
  
  // Registrar todos los puntos de los cables (extremos y puntos intermedios)
  for (const w of wires) {
    const id1 = obtenerIdPunto(w.x1, w.y1);
    const id2 = obtenerIdPunto(w.x2, w.y2);
    w.puntoId1 = id1;
    w.puntoId2 = id2;
  }
  
  // Unir puntos conectados por cables (mismo cable conecta sus dos extremos)
  // Usamos union-find simple
  const parent = Array(puntos.size).fill(0).map((_, i) => i);
  
  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  
  function unite(a, b) {
    parent[find(a)] = find(b);
  }
  
  // Unir extremos de cada cable
  for (const w of wires) {
    unite(w.puntoId1, w.puntoId2);
  }
  
  // Unir terminales que están en la misma posición (ya lo hace obtenerIdPunto)
  
  // ============================================
  // PASO 2: Identificar qué terminal de cada componente va a qué nodo eléctrico
  // ============================================
  
  // Reasignar terminales usando los puntos unidos
  for (const c of components) {
    if (!c.terminals) continue;
    for (let i = 0; i < c.terminals.length; i++) {
      const root = find(c.terminals[i]);
      c.terminals[i] = root;
    }
  }
  
  // ============================================
  // PASO 3: Numerar nodos (GND = 0)
  // ============================================
  
  // Encontrar el nodo GND
  const gndComp = components.find(c => c.type === 'gnd');
  let gndRoot = null;
  if (gndComp && gndComp.terminals && gndComp.terminals[0] !== undefined) {
    gndRoot = find(gndComp.terminals[0]);
  }
  
  // Colección de todos los roots únicos
  const rootsSet = new Set();
  for (const c of components) {
    if (c.terminals) {
      for (const t of c.terminals) {
        rootsSet.add(find(t));
      }
    }
  }
  
  // Mapear cada root a un número de nodo (0 para GND)
  const nodeMap = new Map();
  let nextNode = 1;
  for (const root of rootsSet) {
    if (gndRoot !== null && root === gndRoot) {
      nodeMap.set(root, 0);
    } else {
      nodeMap.set(root, nextNode++);
    }
  }
  
  const nodeCount = nextNode - 1;
  
  // Función para obtener el nodo de un terminal
  function getNode(comp, termIdx) {
    if (!comp.terminals || comp.terminals[termIdx] === undefined) return -1;
    const root = find(comp.terminals[termIdx]);
    return nodeMap.get(root) ?? -1;
  }
  
  // ============================================
  // PASO 4: Construir sistema MNA
  // ============================================
  
  // Separar fuentes de voltaje (incluyendo amperímetros y óhmetros)
  const vSources = components.filter(c => c.type === 'vs');
  const amMeters = components.filter(c => c.type === 'am');
  const omMeters = components.filter(c => c.type === 'om');
  const wmMeters = components.filter(c => c.type === 'wm');
  const allVSources = [...vSources, ...amMeters, ...omMeters, ...wmMeters];
  
  const N = nodeCount;
  const M = allVSources.length;
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
    const G = 1 / c.value;
    const n1 = getNode(c, 0);
    const n2 = getNode(c, 1);
    
    if (n1 === -1 && n2 === -1) {
      setStatus(`⚠ ${c.name} no está conectada.`);
      return null;
    }
    
    if (n1 > 0) A[n1-1][n1-1] += G;
    if (n2 > 0) A[n2-1][n2-1] += G;
    if (n1 > 0 && n2 > 0) {
      A[n1-1][n2-1] -= G;
      A[n2-1][n1-1] -= G;
    }
  }
  
  // Estampar fuentes de corriente
  for (const c of components) {
    if (c.type !== 'cs') continue;
    const n1 = getNode(c, 0);
    const n2 = getNode(c, 1);
    
    if (n1 === -1 && n2 === -1) {
      setStatus(`⚠ ${c.name} no está conectada.`);
      return null;
    }
    
    if (n2 > 0) b[n2-1] += c.value;
    if (n1 > 0) b[n1-1] -= c.value;
  }
  
  // Estampar fuentes de voltaje
  allVSources.forEach((c, k) => {
    const n1 = getNode(c, 0);
    const n2 = getNode(c, 1);
    const row = N + k;
    
    if (n1 > 0) {
      A[row][n1-1] = 1;
      A[n1-1][row] = 1;
    }
    if (n2 > 0) {
      A[row][n2-1] = -1;
      A[n2-1][row] = -1;
    }
    
    b[row] = c.type === 'am' ? 0 : c.type === 'om' ? 1 : c.value;
  });
  
  // ============================================
  // PASO 5: Resolver sistema
  // ============================================
  
  const x = _gaussElimination(A, b);
  if (!x) {
    setStatus('⚠ Sistema singular. Verifica las conexiones.');
    return null;
  }
  
  // ============================================
  // PASO 6: Calcular voltajes de nodo
  // ============================================
  
  const V = new Array(nodeCount + 1).fill(0);
  for (let i = 1; i <= nodeCount; i++) {
    V[i] = x[i-1] ?? 0;
  }
  
  
  // ============================================
  // PASO 7: Calcular resultados por componente
  // ============================================
  
  const compData = {};
  for (const c of components) {
    if (c.type === 'gnd' || c.type === 'node') continue;
    
    const n1 = getNode(c, 0);
    const n2 = getNode(c, 1);
    const v1 = n1 >= 0 ? V[n1] ?? 0 : 0;
    const v2 = n2 >= 0 ? V[n2] ?? 0 : 0;
    
        if (c.type === 'r') {
      const vc = v1 - v2;
      const ic = vc / c.value;
      compData[c.id] = { v: vc, i: ic, p: vc * ic };
    } else if (c.type === 'vs') {
      const idx = allVSources.indexOf(c);
      const ic = x[N + idx] ?? 0;
      compData[c.id] = { v: c.value, i: ic, p: c.value * ic };
    } else if (c.type === 'cs') {
      const vc = v1 - v2;
      compData[c.id] = { v: vc, i: c.value, p: vc * c.value };
    } else if (c.type === 'vm') {
      compData[c.id] = { v: v1 - v2, instrument: 'vm' };
    } else if (c.type === 'am') {
      const idx = allVSources.indexOf(c);
      const ic = x[N + idx] ?? 0;
      compData[c.id] = { i: ic, instrument: 'am' };
    } else if (c.type === 'om') {
      const idx = allVSources.indexOf(c);
      const ic = x[N + idx] ?? 0;
      const resistance = Math.abs(ic) > 1e-12 ? 1 / Math.abs(ic) : Infinity;
      compData[c.id] = { r: resistance, instrument: 'om' };
            } else if (c.type === 'wm') {
      // NUEVO ORDEN: term0=I+, term1=I-, term2=V+, term3=V-
      const nIplus = getNode(c, 0);   // I+ (izquierda)
      const nIminus = getNode(c, 1);  // I- (derecha)
      const nVplus = getNode(c, 2);   // V+ (arriba)
      const nVminus = getNode(c, 3);  // V- (abajo)
      
      // Depuración
      
      // Calcular voltaje entre V+ y V-
      const voltaje = V[nVplus] - V[nVminus];
      
      // Obtener corriente a través del wattímetro (entre I+ e I-)
      const idx = allVSources.indexOf(c);
      let corriente = 0;
      if (idx !== -1 && (N + idx) < x.length) {
        corriente = x[N + idx];
      }
      
      // Ajustar signo de corriente (positiva cuando entra por I+ y sale por I-)
      // Si nIplus tiene mayor voltaje que nIminus, la corriente debería ser positiva
      if (V[nIplus] < V[nIminus]) {
        corriente = -corriente;
      }
      
      const potencia = voltaje * corriente;
      
      
      compData[c.id] = { 
        v: voltaje, 
        i: corriente, 
        p: potencia, 
        instrument: 'wm' 
      };
    }
}
  // ============================================
  // PASO 8: Calcular voltajes de cables (para colorear)
  // ============================================
  
  const wireVoltage = {};
  let vMax = 0;
  for (const w of wires) {
    const n1 = nodeMap.get(find(w.puntoId1)) ?? 0;
    const n2 = nodeMap.get(find(w.puntoId2)) ?? 0;
    const v1 = V[n1] ?? 0;
    const v2 = V[n2] ?? 0;
    const avg = (Math.abs(v1) + Math.abs(v2)) / 2;
    wireVoltage[w.id] = avg;
    if (avg > vMax) vMax = avg;
  }
  
  // Depuración: mostrar todos los wattímetros
  for (const c of components) {
    if (c.type === 'wm') {
      const data = compData[c.id];
    }
  }

  return { nodes: V, nodeCount, components: compData, wireVoltage, vMax };
}

function _gaussElimination(A, b) {
  try {
    // Usar math.js para resolver el sistema lineal (mucho más rápido y estable)
    const bMatrix = b.map(v => [v]);  // Convertir a matriz columna
    const x = math.lusolve(A, bMatrix);  // Descomposición LU (rápida y estable)
    return x.map(row => row[0]);  // Extraer resultados
  } catch (err) {
    console.error("Error en solución matricial:", err);
    return null;
  }
}