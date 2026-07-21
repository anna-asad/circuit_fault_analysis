/** Convert React Flow graph to backend circuit format. */

export function convertCircuitToBackendFormat(nodes, edges) {
  if (!nodes || nodes.length === 0) throw new Error('Circuit is empty. Add components.');
  if (!edges || edges.length === 0) throw new Error('No wires found. Connect components.');

  // Drop edges that reference deleted nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const groundNodes    = nodes.filter(n => n.data?.componentType === 'ground');
  const meterTypes     = ['ammeter', 'voltmeter'];
  const componentNodes = nodes.filter(n => {
    const t = n.data?.componentType;
    return t && !['junction', 'ground'].includes(t);
  });

  // Adjacency graph
  const graph       = new Map();
  const handleEdges = new Map();

  edges.forEach(edge => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
    graph.get(edge.source).push(edge.target);
    graph.get(edge.target).push(edge.source);

    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;
    const PASSIVE = ['resistor', 'capacitor', 'inductor'];

    if (PASSIVE.includes(srcType) && edge.sourceHandle) {
      const key = `${edge.source}::${edge.sourceHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
    if (PASSIVE.includes(tgtType) && edge.targetHandle) {
      const key = `${edge.target}::${edge.targetHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
  });

  // No passive pin may have more than one wire
  handleEdges.forEach((count, key) => {
    if (count > 1) {
      const [nodeId, handleName] = key.split('::');
      const typeName = nodes.find(n => n.id === nodeId)?.data?.componentType ?? nodeId;
      throw new Error(`${typeName}: The ${handleName} pin has ${count} wires — only 1 allowed.`);
    }
  });

  if (groundNodes.length === 0) throw new Error('Add a Ground reference point (⏚).');
  groundNodes.forEach(gn => {
    if (!(graph.get(gn.id) || []).length) throw new Error('Ground not connected. Wire it to the circuit.');
  });

  // Validate connectivity — each component needs two distinct wired pins
  const terminalNodes = new Map();

  function followJunction(compId, start) {
    const visited = new Set([compId]);
    let cur = start;
    while (cur) {
      if (visited.has(cur)) return null;
      visited.add(cur);
      const t = nodes.find(n => n.id === cur)?.data?.componentType;
      if (t !== 'junction') return { endId: cur, endType: t };
      const next = (graph.get(cur) || []).find(n => !visited.has(n));
      if (!next) return null;
      cur = next;
    }
    return null;
  }

  componentNodes.forEach(comp => {
    const ctype   = comp.data?.componentType;
    const isMeter = meterTypes.includes(ctype);
    const compEdges = edges.filter(e => e.source === comp.id || e.target === comp.id);

    if (compEdges.length === 0) {
      throw new Error(`${comp.data?.componentId ?? ctype} is not connected — connect both pins.`);
    }

    const pins = new Map();
    compEdges.forEach(edge => {
      if (edge.source === comp.id && edge.sourceHandle) {
        if (!pins.has(edge.sourceHandle)) pins.set(edge.sourceHandle, []);
        pins.get(edge.sourceHandle).push(edge.target);
      }
      if (edge.target === comp.id && edge.targetHandle) {
        if (!pins.has(edge.targetHandle)) pins.set(edge.targetHandle, []);
        pins.get(edge.targetHandle).push(edge.source);
      }
    });

    const hasSingleConnectedPin = pins.size < 2;

    if (!hasSingleConnectedPin && !isMeter) {
      const nonGroundEndpoints = [];
      for (const [, neighbors] of pins) {
        const ep = followJunction(comp.id, neighbors[0]);
        if (ep && ep.endType !== 'ground') nonGroundEndpoints.push(ep);
      }
      if (nonGroundEndpoints.length < 2) {
        throw new Error(`${comp.data?.componentId ?? ctype} needs 2 non-ground connections — connect both pins.`);
      }
    }

    terminalNodes.set(comp.id, [`${comp.id}_t0`, `${comp.id}_t1`]);
  });

  const groundReference = groundNodes[0];
  const groundConns     = graph.get(groundReference.id) || [];
  if (!groundConns.some(id => nodes.find(n => n.id === id)?.data?.componentType !== 'ground')) {
    throw new Error('Ground is not connected to the circuit!');
  }

  // Union-Find
  const allIds = [...nodes.map(n => n.id), ...Array.from(terminalNodes.values()).flat()];
  const parent = new Map();
  const rank   = new Map();
  allIds.forEach(id => { parent.set(id, id); rank.set(id, 0); });

  function find(x) {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
    return parent.get(x);
  }
  function union(x, y) {
    const rx = find(x), ry = find(y);
    if (rx === ry) return;
    if (rank.get(rx) < rank.get(ry))      parent.set(rx, ry);
    else if (rank.get(rx) > rank.get(ry)) parent.set(ry, rx);
    else { parent.set(ry, rx); rank.set(rx, rank.get(rx) + 1); }
  }

  // left/top handle → terminal 0 (positive); right/bottom → terminal 1 (negative)
  function handleToIdx(h) {
    return (h === 'left' || h === 'top') ? 0 : 1;
  }

  const compHandleMap = new Map();
  edges.forEach(edge => {
    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;
    if (srcType && !['junction', 'ground'].includes(srcType) && edge.sourceHandle) {
      if (!compHandleMap.has(edge.source)) compHandleMap.set(edge.source, new Map());
      if (!compHandleMap.get(edge.source).has(edge.sourceHandle))
        compHandleMap.get(edge.source).set(edge.sourceHandle, edge.target);
    }
    if (tgtType && !['junction', 'ground'].includes(tgtType) && edge.targetHandle) {
      if (!compHandleMap.has(edge.target)) compHandleMap.set(edge.target, new Map());
      if (!compHandleMap.get(edge.target).has(edge.targetHandle))
        compHandleMap.get(edge.target).set(edge.targetHandle, edge.source);
    }
  });

  function safeTermIdx(compId, handleId) {
    if (handleId) return handleToIdx(handleId);
    const hmap = compHandleMap.get(compId);
    if (!hmap) return 0;
    for (const [hid, nbr] of hmap) {
      const opposite = compId === edges.find(e => e.source === compId)?.source ? edges.find(e => e.source === compId)?.target : null;
      if (nbr === opposite) return handleToIdx(hid);
    }
    return 0;
  }

  function terminalIdx(edge, nodeId) {
    const t = nodes.find(n => n.id === nodeId)?.data?.componentType;
    if (t && !['junction', 'ground'].includes(t)) {
      if (edge.source === nodeId && edge.sourceHandle) return handleToIdx(edge.sourceHandle);
      if (edge.target === nodeId && edge.targetHandle) return handleToIdx(edge.targetHandle);
    }
    return 0;
  }

  edges.forEach(edge => {
    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;
    const srcIsGnd  = srcType === 'ground';
    const tgtIsGnd  = tgtType === 'ground';
    const srcIsComp = !['junction', 'ground'].includes(srcType) && !!srcType;
    const tgtIsComp = !['junction', 'ground'].includes(tgtType) && !!tgtType;
    const srcTerms  = terminalNodes.get(edge.source);
    const tgtTerms  = terminalNodes.get(edge.target);
    const si = srcIsComp ? terminalIdx(edge, edge.source) : 0;
    const ti = tgtIsComp ? terminalIdx(edge, edge.target) : 0;

    if      (srcIsComp && tgtIsComp)   union(srcTerms[si], tgtTerms[ti]);
    else if (srcIsComp && !tgtIsGnd)   union(srcTerms[si], edge.target);
    else if (tgtIsComp && !srcIsGnd)   union(edge.source,  tgtTerms[ti]);
    else if (srcIsComp && tgtIsGnd)    union(srcTerms[si], edge.target);
    else if (tgtIsComp && srcIsGnd)    union(edge.source,  tgtTerms[ti]);
    else                               union(edge.source,  edge.target);
  });

  groundConns.forEach(cid => { if (cid !== groundReference.id) union(groundReference.id, cid); });

  // Assign electrical node names
  const usedRoots = new Set();
  componentNodes.forEach(c => { terminalNodes.get(c.id)?.forEach(t => usedRoots.add(find(t))); });
  groundNodes.forEach(g => usedRoots.add(find(g.id)));

  const electricalNodeMap = new Map();
  let nodeCounter = 1;
  usedRoots.forEach(root => {
    electricalNodeMap.set(root,
      groundNodes.some(g => find(g.id) === root) ? '0' : `n${nodeCounter++}`
    );
  });

  const components   = [];
  const meters       = [];
  const allElecNodes = new Set();

  componentNodes.forEach(compNode => {
    const ctype    = compNode.data?.componentType;
    const terms    = terminalNodes.get(compNode.id);
    const rotation = compNode.data?.rotation || 0;
    let elecNodes  = terms.map(t => electricalNodeMap.get(find(t)));

    if (elecNodes[0] === elecNodes[1]) {
      throw new Error(`${compNode.data?.componentId ?? ctype}: Both terminals at same node (short circuit).`);
    }

    // For sources: left handle = positive (+). If ground ended up at index 0, swap.
    if ((ctype === 'dc_source' || ctype === 'current_source') && elecNodes[0] === '0') {
      elecNodes = [elecNodes[1], elecNodes[0]];
    }

    elecNodes.forEach(n => allElecNodes.add(n));

    const rawId   = compNode.data?.componentId || compNode.data?.label || compNode.id;
    const cleanId = String(rawId).replace(/[^\x00-\x7F]/g, '').trim() || `comp${compNode.id.slice(-4)}`;

    if (ctype === 'ammeter') {
      const spiceName = `Vsense_${cleanId}`;
      meters.push({ id: cleanId, type: 'ammeter', spiceName, nodes: elecNodes });
      components.push({ id: cleanId, type: 'ammeter', value: 0, nodes: elecNodes, spiceName, position: compNode.position, rotation });
      return;
    }
    if (ctype === 'voltmeter') {
      const spiceName = `R${cleanId}_vm`;
      meters.push({ id: cleanId, type: 'voltmeter', spiceName, nodes: elecNodes });
      components.push({ id: cleanId, type: 'voltmeter', value: 1e9, nodes: elecNodes, spiceName, position: compNode.position, rotation });
      return;
    }

    components.push({
      id: cleanId, type: ctype,
      value: compNode.data?.value || getDefaultValue(ctype),
      nodes: elecNodes, position: compNode.position, rotation,
    });
  });

  const nonMeters = components.filter(c => !meterTypes.includes(c.type));
  if (nonMeters.length === 0) throw new Error('Add at least one circuit component.');
  if (!nonMeters.some(c => c.type === 'dc_source' || c.type === 'current_source'))
    throw new Error('Add a DC voltage source or current source.');
  if (!allElecNodes.has('0')) throw new Error('Ground is not connected to the circuit!');

  return { nodes: Array.from(allElecNodes), components, ground: '0', meters };
}

function getDefaultValue(type) {
  return { dc_source: 5.0, current_source: 0.012, resistor: 1000,
           capacitor: 1e-7, inductor: 1e-6, ammeter: 0, voltmeter: 1e9 }[type] ?? 0;
}
