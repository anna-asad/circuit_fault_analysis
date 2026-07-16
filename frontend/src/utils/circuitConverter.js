/**
 * Convert React Flow graph to backend circuit format.
 *
 * Meter handling
 * ──────────────
 * Ammeter  → included in netlist as a 0 V sense-voltage-source (Vsense).
 *            ngspice reports I(Vsense_AM1) = branch current through it.
 *            Structurally it must be in series (exactly one path through it).
 *
 * Voltmeter → included in netlist as a 1 GΩ resistor.
 *             ngspice gives us the node voltages on both terminals; we compute
 *             V = V(node+) − V(node−) in the frontend.
 *             Structurally it must be in parallel (both terminals already
 *             connected to the circuit without the voltmeter).
 *
 * A `meters` array is appended to the result so the backend / ResultsPanel
 * can map simulation outputs back to the original meter IDs:
 *   { id, type, spiceName, nodes: [n+, n−] }
 */

export function convertCircuitToBackendFormat(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    throw new Error('Circuit is empty. Add components.');
  }
  if (!edges || edges.length === 0) {
    throw new Error('No wires found. Connect components.');
  }

  // ── Partition nodes by role ───────────────────────────────────────────────
  const groundNodes   = nodes.filter(n => n.data?.componentType === 'ground');
  const meterTypes    = ['ammeter', 'voltmeter'];
  const passThroughTypes = ['junction', 'ground', ...meterTypes];

  // "component nodes" = everything that becomes a real SPICE element
  // (includes meters — they get their own SPICE line)
  const componentNodes = nodes.filter(n => {
    const t = n.data?.componentType;
    return t && !['junction', 'ground'].includes(t);
  });

  // passive/source components only — used for the "needs 2 connections" check
  const circuitNodes = nodes.filter(n => {
    const t = n.data?.componentType;
    return t && !passThroughTypes.includes(t);
  });

  // ── Build adjacency graph ─────────────────────────────────────────────────
  const graph       = new Map(); // nodeId → neighborId[]
  const handleEdges = new Map(); // "nodeId::handleId" → count

  edges.forEach(edge => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
    graph.get(edge.source).push(edge.target);
    graph.get(edge.target).push(edge.source);

    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;

    // Track handle usage only for passive components (resistors, capacitors, inductors).
    // Skip validation for:
    // - junction/ground (they're wire nodes, not components)
    // - meters (validated structurally by backend)
    // - sources (voltage/current sources can connect to junctions that split to multiple paths)
    const SKIP_HANDLE_CHECK = ['junction', 'ground', 'ammeter', 'voltmeter', 'dc_source', 'current_source'];

    if (srcType && !SKIP_HANDLE_CHECK.includes(srcType) && edge.sourceHandle) {
      const key = `${edge.source}::${edge.sourceHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
    if (tgtType && !SKIP_HANDLE_CHECK.includes(tgtType) && edge.targetHandle) {
      const key = `${edge.target}::${edge.targetHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
  });

  // ── Validate: no passive/source pin should have more than one wire ────────
  handleEdges.forEach((count, key) => {
    if (count > 1) {
      const nodeId   = key.split('::')[0];
      const compNode = nodes.find(n => n.id === nodeId);
      const typeName = compNode?.data?.componentType ?? nodeId;
      const handleName = key.split('::')[1] ?? 'pin';
      throw new Error(
        `${typeName}: The ${handleName} pin has ${count} wires — only 1 wire per pin is allowed.`
      );
    }
  });

  // ── Validate ground ───────────────────────────────────────────────────────
  if (groundNodes.length === 0) {
    throw new Error('Add a Ground reference point (⏚).');
  }
  groundNodes.forEach(gn => {
    const conns = graph.get(gn.id) || [];
    if (conns.length === 0) {
      throw new Error('Ground not connected. Wire ground to the circuit.');
    }
  });

  // ── Validate each component has exactly 2 distinct terminal branches ────────
  // Check each pin/handle separately to avoid counting the same endpoint twice
  // when different pins can reach it through different paths.
  const terminalNodes = new Map();

  // Helper: from a specific handle/pin of a component, follow through junctions
  // and return the first non-junction, non-ground endpoint reachable.
  function findEndpointFromHandle(compId, startNeighbor) {
    const visited = new Set([compId]);
    let current = startNeighbor;

    while (current) {
      if (visited.has(current)) return null; // Loop detected
      visited.add(current);

      const curType = nodes.find(n => n.id === current)?.data?.componentType;

      if (curType === 'junction') {
        // Keep traversing through this junction
        const neighbors = graph.get(current) || [];
        const nextNode = neighbors.find(nbr => !visited.has(nbr));
        if (!nextNode) return null; // Dead end
        current = nextNode;
      } else {
        // Real endpoint (component, ground, or dangling)
        return { endId: current, endType: curType };
      }
    }
    return null;
  }

  componentNodes.forEach(comp => {
    const ctype = comp.data?.componentType;
    const isMeter = meterTypes.includes(ctype);

    // Get all direct connections (edges touching this component)
    const compEdges = edges.filter(e => e.source === comp.id || e.target === comp.id);
    
    if (compEdges.length === 0) {
      const id = comp.data?.componentId ?? ctype;
      throw new Error(`${id} is not connected — connect both pins.`);
    }

    // Group edges by handle to check each pin separately
    const pinConnections = new Map(); // handleId → [neighbors]
    
    compEdges.forEach(edge => {
      if (edge.source === comp.id && edge.sourceHandle) {
        if (!pinConnections.has(edge.sourceHandle)) {
          pinConnections.set(edge.sourceHandle, []);
        }
        pinConnections.get(edge.sourceHandle).push(edge.target);
      }
      if (edge.target === comp.id && edge.targetHandle) {
        if (!pinConnections.has(edge.targetHandle)) {
          pinConnections.set(edge.targetHandle, []);
        }
        pinConnections.get(edge.targetHandle).push(edge.source);
      }
    });

    // Each pin should have exactly one wire (already validated by handleEdges check above)
    // Now verify both pins are connected
    const connectedPins = pinConnections.size;
    
    if (connectedPins < 2) {
      const id = comp.data?.componentId ?? ctype;
      throw new Error(`${id} has only ${connectedPins} pin connected — connect both pins.`);
    }

    // For non-meters, verify each pin reaches a distinct non-ground endpoint
    if (!isMeter) {
      const endpoints = [];
      for (const [handle, neighbors] of pinConnections) {
        // Each pin should have exactly one neighbor (validated earlier)
        const neighbor = neighbors[0];
        const endpoint = findEndpointFromHandle(comp.id, neighbor);
        
        if (endpoint && endpoint.endType !== 'ground') {
          endpoints.push(endpoint);
        }
      }

      // Should have exactly 2 distinct non-ground endpoints (one per pin)
      if (endpoints.length < 2) {
        const id = comp.data?.componentId ?? ctype;
        throw new Error(
          `${id} has only ${endpoints.length} non-ground connection${endpoints.length === 1 ? '' : 's'} — connect both pins.`
        );
      }
    }

    terminalNodes.set(comp.id, [`${comp.id}_t0`, `${comp.id}_t1`]);
  });

  // ── Ground connectivity ───────────────────────────────────────────────────
  const groundReference = groundNodes[0];
  const groundConns = graph.get(groundReference.id) || [];
  const hasGroundWire = groundConns.some(cid => {
    const t = nodes.find(n => n.id === cid)?.data?.componentType;
    return t && t !== 'ground';
  });
  if (!hasGroundWire) {
    throw new Error('Ground is not connected to the circuit!');
  }

  // ── Union-Find setup ──────────────────────────────────────────────────────
  const allIds = [
    ...nodes.map(n => n.id),
    ...Array.from(terminalNodes.values()).flat(),
  ];

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

  function handleToTerminalIndex(handleId) {
    if (handleId === 'left')   return 0;  // left  handle → _t0 (positive/+)
    if (handleId === 'right')  return 1;  // right handle → _t1 (negative/−)
    if (handleId === 'top')    return 0;  // top   handle → _t0 (rotated 90°)
    if (handleId === 'bottom') return 1;  // bottom handle → _t1 (rotated 90°)
    return 0;
  }

  // Build a lookup: for each component node, which handle connects to which
  // neighbor?  { compNodeId → { handleId: neighborChainId } }
  // We resolve through junctions so the union-find always sees an actual
  // electrical neighbor, not just an intermediate junction node.
  const compHandleMap = new Map(); // compId → Map<handleId, neighborId>

  edges.forEach(edge => {
    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;
    const srcIsComp = srcType && !['junction', 'ground'].includes(srcType);
    const tgtIsComp = tgtType && !['junction', 'ground'].includes(tgtType);

    if (srcIsComp && edge.sourceHandle) {
      if (!compHandleMap.has(edge.source)) compHandleMap.set(edge.source, new Map());
      // Only store the first wire on this handle (duplicates already validated above)
      if (!compHandleMap.get(edge.source).has(edge.sourceHandle)) {
        compHandleMap.get(edge.source).set(edge.sourceHandle, edge.target);
      }
    }
    if (tgtIsComp && edge.targetHandle) {
      if (!compHandleMap.has(edge.target)) compHandleMap.set(edge.target, new Map());
      if (!compHandleMap.get(edge.target).has(edge.targetHandle)) {
        compHandleMap.get(edge.target).set(edge.targetHandle, edge.source);
      }
    }
  });

  function terminalIdx(edge, nodeId) {
    const ntype = nodes.find(n => n.id === nodeId)?.data?.componentType;
    if (ntype && !['junction', 'ground'].includes(ntype)) {
      if (edge.source === nodeId && edge.sourceHandle)
        return handleToTerminalIndex(edge.sourceHandle);
      if (edge.target === nodeId && edge.targetHandle)
        return handleToTerminalIndex(edge.targetHandle);
    }
    return 0;
  }

  // ── Union edges ───────────────────────────────────────────────────────────
  // Rule: for each edge, determine which terminal (_t0 or _t1) of each
  // component the edge touches, and union that terminal with the neighbor's
  // electrical identity (junction id, ground id, or the neighbor's terminal).
  edges.forEach(edge => {
    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;

    const srcIsGnd  = srcType === 'ground';
    const tgtIsGnd  = tgtType === 'ground';
    const srcIsComp = !['junction', 'ground'].includes(srcType) && !!srcType;
    const tgtIsComp = !['junction', 'ground'].includes(tgtType) && !!tgtType;

    const srcTerms = terminalNodes.get(edge.source);
    const tgtTerms = terminalNodes.get(edge.target);

    // Determine terminal index from the handle on the edge.
    // If a handle ID is missing (e.g. older edge from auto-junction split),
    // fall back to scanning compHandleMap for this component so we still get
    // the right index rather than always defaulting to 0.
    function safeTermIdx(compId, edgeHandleId) {
      if (edgeHandleId) return handleToTerminalIndex(edgeHandleId);
      // Fallback: look up which handle this edge's neighbor appears under
      const hmap = compHandleMap.get(compId);
      if (!hmap) return 0;
      for (const [hid, nbr] of hmap) {
        if (nbr === (compId === edge.source ? edge.target : edge.source))
          return handleToTerminalIndex(hid);
      }
      return 0;
    }

    const srcIdx = srcIsComp ? safeTermIdx(edge.source, edge.sourceHandle) : 0;
    const tgtIdx = tgtIsComp ? safeTermIdx(edge.target, edge.targetHandle) : 0;

    if (srcIsComp && tgtIsComp) {
      union(srcTerms[srcIdx], tgtTerms[tgtIdx]);
    } else if (srcIsComp && !tgtIsGnd) {
      union(srcTerms[srcIdx], edge.target);
    } else if (tgtIsComp && !srcIsGnd) {
      union(edge.source, tgtTerms[tgtIdx]);
    } else if (srcIsComp && tgtIsGnd) {
      union(srcTerms[srcIdx], edge.target);
    } else if (tgtIsComp && srcIsGnd) {
      union(edge.source, tgtTerms[tgtIdx]);
    } else {
      // junction↔junction, junction↔ground, ground↔junction
      union(edge.source, edge.target);
    }
  });

  // Ensure ground is fully propagated through junction chains
  groundConns.forEach(cid => { if (cid !== groundReference.id) union(groundReference.id, cid); });

  // ── Assign electrical node names ──────────────────────────────────────────
  const usedRoots = new Set();
  componentNodes.forEach(c => {
    const terms = terminalNodes.get(c.id);
    if (terms) terms.forEach(t => usedRoots.add(find(t)));
  });
  groundNodes.forEach(g => usedRoots.add(find(g.id)));

  const electricalNodeMap = new Map();
  let nodeCounter = 1;
  usedRoots.forEach(root => {
    const hasGround = groundNodes.some(g => find(g.id) === root);
    electricalNodeMap.set(root, hasGround ? '0' : `n${nodeCounter++}`);
  });

  // ── Build component list ──────────────────────────────────────────────────
  const components     = [];
  const meters         = []; // { id, type, spiceName, nodes: [n+, n-] }
  const allElecNodes   = new Set();

  componentNodes.forEach(compNode => {
    const ctype    = compNode.data?.componentType;
    const terms    = terminalNodes.get(compNode.id);
    const rotation = compNode.data?.rotation || 0;

    let elecNodes = terms.map(t => electricalNodeMap.get(find(t)));

    if (elecNodes[0] === elecNodes[1]) {
      throw new Error(`${compNode.data?.componentId ?? ctype}: Both terminals at same node (short circuit).`);
    }

    // ── Source polarity ───────────────────────────────────────────────────
    // Convention throughout this codebase:
    //   _t0  ←→  'left' handle  = positive (+) terminal
    //   _t1  ←→  'right' handle = negative (−) terminal
    //
    // The SVG symbols are drawn left=+, right=−.
    // After union-find, elecNodes[0] is the node the left/top handle touches
    // and elecNodes[1] is the node the right/bottom handle touches.
    //
    // For voltage/current sources the SPICE line must be:
    //   Vx  n+  n−  DC value   (positive first)
    //
    // We determine polarity by asking: which resolved electrical node is
    // connected to ground ('0')?  That must be n− (index 1).
    // If the ground-connected node ended up in index 0, swap.
    //
    // This is more robust than a rotation-angle heuristic because it doesn't
    // depend on remembering which rotation flips the handle layout.
    const isSource = ctype === 'dc_source' || ctype === 'current_source';
    if (isSource) {
      // elecNodes[0] should be n+ (not ground), elecNodes[1] should be n−.
      // If elecNodes[0] === '0' (ground), the wiring is inverted → swap.
      if (elecNodes[0] === '0') {
        elecNodes = [elecNodes[1], elecNodes[0]];
      }
    }

    elecNodes.forEach(n => allElecNodes.add(n));

    const rawId  = compNode.data?.componentId || compNode.data?.label || compNode.id;
    const cleanId = String(rawId).replace(/[^\x00-\x7F]/g, '').trim()
                  || `comp${compNode.id.slice(-4)}`;

    // ── Meter metadata ────────────────────────────────────────────────────
    if (ctype === 'ammeter') {
      // SPICE sense voltage source: Vsense_<id> n+ n- DC 0
      // ngspice will report I(Vsense_<id>) = the current flowing through it
      const spiceName = `Vsense_${cleanId}`;
      meters.push({ id: cleanId, type: 'ammeter', spiceName, nodes: elecNodes });
      components.push({
        id: cleanId, type: 'ammeter', value: 0,
        nodes: elecNodes, spiceName,
        position: compNode.position, rotation,
      });
      return;
    }

    if (ctype === 'voltmeter') {
      // SPICE: R<id>_vm n+ n- 1G  (ideal = ∞ Ω, 1 GΩ is negligible loading)
      const spiceName = `R${cleanId}_vm`;
      meters.push({ id: cleanId, type: 'voltmeter', spiceName, nodes: elecNodes });
      components.push({
        id: cleanId, type: 'voltmeter', value: 1e9,
        nodes: elecNodes, spiceName,
        position: compNode.position, rotation,
      });
      return;
    }

    // Regular component
    components.push({
      id: cleanId,
      type: ctype,
      value: compNode.data?.value || getDefaultValue(ctype),
      nodes: elecNodes,
      position: compNode.position,
      rotation,
    });
  });

  // ── Final validations ─────────────────────────────────────────────────────
  const nonMeterComponents = components.filter(c => !meterTypes.includes(c.type));
  if (nonMeterComponents.length === 0) {
    throw new Error('Add at least one circuit component (resistor, source, etc.).');
  }
  const hasSource = nonMeterComponents.some(
    c => c.type === 'dc_source' || c.type === 'current_source'
  );
  if (!hasSource) {
    throw new Error('Add a DC voltage source or current source.');
  }
  if (!allElecNodes.has('0')) {
    throw new Error('Ground is not connected to the circuit!');
  }

  const result = {
    nodes:      Array.from(allElecNodes),
    components,
    ground:     '0',
    meters,     // consumed by backend for measurement extraction + frontend display
  };

  console.log('✅ Circuit converted:', result);
  return result;
}

function getDefaultValue(type) {
  const defaults = {
    dc_source:      5.0,
    current_source: 0.012,
    resistor:       1000,
    capacitor:      1e-7,
    inductor:       1e-6,
    ammeter:        0,
    voltmeter:      1e9,
  };
  return defaults[type] ?? 0;
}
