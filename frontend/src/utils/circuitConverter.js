/**
 * Convert React Flow graph to backend circuit format
 * 
 * LTspice-style ground handling:
 * - Ground is placed ON a wire (marks that wire as node '0')
 * - Components connect directly with wires
 * - Junctions optional for splits/merges
 */

export function convertCircuitToBackendFormat(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    throw new Error('Circuit is empty. Add components.');
  }

  if (!edges || edges.length === 0) {
    throw new Error('No wires found. Connect components.');
  }

  const groundNodes = nodes.filter(n => n.data?.componentType === 'ground');
  const junctionNodes = nodes.filter(n => n.data?.componentType === 'junction');
  const componentNodes = nodes.filter(n => {
    const type = n.data?.componentType;
    return type && !['junction', 'ground'].includes(type);
  });

  // Build adjacency graph.
  // Each entry maps nodeId → array of neighbor nodeIds (one entry per wire).
  // We also track which handle each wire uses so we can detect overloaded handles.
  const graph = new Map();          // nodeId → neighborId[]  (may contain duplicates for multi-wire junctions)
  const handleEdges = new Map();    // "nodeId::handleId" → count  (max 1 per component pin)

  edges.forEach(edge => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
    graph.get(edge.source).push(edge.target);
    graph.get(edge.target).push(edge.source);

    // Track handle usage for component nodes only (not junctions/ground which are hubs)
    const srcType = nodes.find(n => n.id === edge.source)?.data?.componentType;
    const tgtType = nodes.find(n => n.id === edge.target)?.data?.componentType;

    if (srcType && !['junction', 'ground'].includes(srcType) && edge.sourceHandle) {
      const key = `${edge.source}::${edge.sourceHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
    if (tgtType && !['junction', 'ground'].includes(tgtType) && edge.targetHandle) {
      const key = `${edge.target}::${edge.targetHandle}`;
      handleEdges.set(key, (handleEdges.get(key) ?? 0) + 1);
    }
  });

  // Validate: no component pin should have more than one wire
  handleEdges.forEach((count, key) => {
    if (count > 1) {
      const nodeId = key.split('::')[0];
      const compNode = nodes.find(n => n.id === nodeId);
      const typeName = compNode?.data?.componentType ?? nodeId;
      const handleName = key.split('::')[1] ?? 'pin';
      throw new Error(
        `${typeName}: The ${handleName} pin has ${count} wires connected — only 1 wire per pin is allowed.`
      );
    }
  });

  // Validate ground has at least 1 connection
  if (groundNodes.length === 0) {
    throw new Error('Add a Ground reference point (⏚).');
  }

  // Check that ground is connected, preferably to junctions
  groundNodes.forEach(groundNode => {
    const connections = graph.get(groundNode.id) || [];
    
    if (connections.length === 0) {
      throw new Error('Ground not connected. Place a Junction (●) on a wire, then connect Ground to it.');
    }

    // Warn if ground connects directly to component (will use up one of its 2 terminals)
    connections.forEach(connId => {
      const connNode = nodes.find(n => n.id === connId);
      const connType = connNode?.data?.componentType;
      
      if (connType && !['junction'].includes(connType)) {
        console.warn('⚠️ Ground connected directly to a component. Best practice: connect ground to a Junction (●) placed on a wire.');
      }
    });
  });

  // Create unique IDs for each component terminal
  const terminalNodes = new Map();
  
  componentNodes.forEach(comp => {
    const connections = graph.get(comp.id) || [];
    
    // Count non-ground connections by NUMBER OF WIRES, not distinct neighbors.
    // Two wires to the same component (e.g. resistor wired directly to both ends
    // of a dc_source) are valid — they connect different pins of that neighbor.
    // Ground connections don't count toward the required 2 pins.
    const nonGroundConnections = connections.filter(connId => {
      const connNode = nodes.find(n => n.id === connId);
      return connNode?.data?.componentType !== 'ground';
    });
    
    if (nonGroundConnections.length !== 2) {
      const typeName = comp.data?.componentType ?? 'Component';
      if (nonGroundConnections.length < 2) {
        throw new Error(
          `${typeName} has only ${nonGroundConnections.length} connection${nonGroundConnections.length === 1 ? '' : 's'} — connect both pins.`
        );
      } else {
        throw new Error(
          `${typeName} has ${nonGroundConnections.length} connections but needs exactly 2 (one per pin). Check for duplicate wires.`
        );
      }
    }
    
    terminalNodes.set(comp.id, [
      `${comp.id}_t0`,
      `${comp.id}_t1`
    ]);
  });

  // Ground must be explicitly wired to the circuit.
  // Do not auto-attach it to the nearest terminal.
  const groundReference = groundNodes[0];
  if (groundReference) {
    const groundConnections = graph.get(groundReference.id) || [];
    const hasGroundWire = groundConnections.some(connId => {
      const connNode = nodes.find(n => n.id === connId);
      return connNode && connNode.data?.componentType !== 'ground';
    });

    if (!hasGroundWire) {
      throw new Error('Ground is not connected to the circuit! Wire ground to a component terminal.');
    }
  }

  // Union-find setup - include terminals, junctions, grounds
  const allIds = [
    ...nodes.map(n => n.id),
    ...Array.from(terminalNodes.values()).flat()
  ];

  const parent = new Map();
  const rank = new Map();

  allIds.forEach(id => {
    parent.set(id, id);
    rank.set(id, 0);
  });

  function find(x) {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)));
    }
    return parent.get(x);
  }

  function union(x, y) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;
    
    if (rank.get(rootX) < rank.get(rootY)) {
      parent.set(rootX, rootY);
    } else if (rank.get(rootX) > rank.get(rootY)) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rank.get(rootX) + 1);
    }
  }

  // Map handle IDs to terminal indices
  // For components: "left" → t0, "right" → t1
  // This ensures that wires connected to different physical handles
  // always map to different terminals
  function handleToTerminalIndex(handleId) {
    // Handle ID can be "left" or "right" for components
    if (handleId === 'left') return 0;
    if (handleId === 'right') return 1;
    return 0; // fallback
  }

  // Get the terminal index for a component based on the edge's handle
  function getTerminalIndexForEdge(edge, nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    const nodeType = node?.data?.componentType;
    
    // Only use handle-based mapping for component nodes
    if (nodeType && !['junction', 'ground'].includes(nodeType)) {
      // Determine which handle this node uses in this edge
      if (edge.source === nodeId && edge.sourceHandle) {
        return handleToTerminalIndex(edge.sourceHandle);
      }
      if (edge.target === nodeId && edge.targetHandle) {
        return handleToTerminalIndex(edge.targetHandle);
      }
    }
    
    // Fallback for junctions/ground or missing handle info
    return 0;
  }

  // Process edges to union terminals/junctions/grounds
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    const sourceType = sourceNode?.data?.componentType;
    const targetType = targetNode?.data?.componentType;
    
    const sourceIsGround = sourceType === 'ground';
    const targetIsGround = targetType === 'ground';
    const sourceIsJunction = sourceType === 'junction';
    const targetIsJunction = targetType === 'junction';
    const sourceIsComponent = !['junction', 'ground'].includes(sourceType);
    const targetIsComponent = !['junction', 'ground'].includes(targetType);
    
    if (sourceIsComponent && targetIsComponent) {
      // Component to component: union terminals at this connection
      const sourceTerminals = terminalNodes.get(edge.source);
      const targetTerminals = terminalNodes.get(edge.target);
      
      const sourceTerminalIdx = getTerminalIndexForEdge(edge, edge.source);
      const targetTerminalIdx = getTerminalIndexForEdge(edge, edge.target);
      
      union(sourceTerminals[sourceTerminalIdx], targetTerminals[targetTerminalIdx]);
    } else if (sourceIsComponent && !targetIsGround) {
      // Component to junction: union terminal with junction
      const sourceTerminals = terminalNodes.get(edge.source);
      const terminalIdx = getTerminalIndexForEdge(edge, edge.source);
      
      union(sourceTerminals[terminalIdx], edge.target);
    } else if (targetIsComponent && !sourceIsGround) {
      // Junction to component: union junction with terminal
      const targetTerminals = terminalNodes.get(edge.target);
      const terminalIdx = getTerminalIndexForEdge(edge, edge.target);
      
      union(edge.source, targetTerminals[terminalIdx]);
    } else if (sourceIsComponent && targetIsGround) {
      // Component to ground: union the appropriate terminal with ground
      const sourceTerminals = terminalNodes.get(edge.source);
      const terminalIdx = getTerminalIndexForEdge(edge, edge.source);
      union(sourceTerminals[terminalIdx], edge.target);
    } else if (targetIsComponent && sourceIsGround) {
      // Ground to component: union ground with the appropriate terminal
      const targetTerminals = terminalNodes.get(edge.target);
      const terminalIdx = getTerminalIndexForEdge(edge, edge.target);
      union(edge.source, targetTerminals[terminalIdx]);
    } else if (!sourceIsGround && !targetIsGround) {
      // Junction to junction: union them
      union(edge.source, edge.target);
    } else if (sourceIsGround || targetIsGround) {
      // Ground to junction: union them
      union(edge.source, edge.target);
    }
  });

  // Ground is only connected through explicit wires.
  if (groundReference) {
    const groundConnections = graph.get(groundReference.id) || [];
    groundConnections.forEach(connId => {
      if (connId !== groundReference.id) {
        union(groundReference.id, connId);
      }
    });
  }

  // Assign electrical node names.
  // Only create a node entry for roots that are actually used by a component
  // terminal — skip phantom roots that exist only because of internal union-find
  // bookkeeping on junction/ground nodes that share a group with a terminal.
  const electricalNodeMap = new Map();
  let nodeCounter = 1;

  // First pass: collect only the roots that component terminals actually belong to.
  const usedRoots = new Set();
  componentNodes.forEach(compNode => {
    const terminals = terminalNodes.get(compNode.id);
    if (!terminals) return;
    terminals.forEach(t => usedRoots.add(find(t)));
  });
  // Also include the ground root so node '0' gets assigned.
  groundNodes.forEach(g => usedRoots.add(find(g.id)));

  usedRoots.forEach(root => {
    // Check if this group contains any ground node
    const hasGround = groundNodes.some(g => find(g.id) === root);
    if (hasGround) {
      electricalNodeMap.set(root, '0');
    } else {
      electricalNodeMap.set(root, `n${nodeCounter++}`);
    }
  });

  // Build components
  const components = [];
  const allElectricalNodes = new Set();

  componentNodes.forEach(compNode => {
    const componentType = compNode.data?.componentType;
    const terminals = terminalNodes.get(compNode.id);
    
    let terminalElectricalNodes = terminals.map(t => {
      const root = find(t);
      return electricalNodeMap.get(root);
    });

    // Check for short
    if (terminalElectricalNodes[0] === terminalElectricalNodes[1]) {
      throw new Error(`${componentType}: Both terminals at same node (short circuit).`);
    }

    // IMPORTANT: For voltage/current sources, rotation affects polarity!
    // At 0°:   left=positive(+),  right=negative(-)
    // At 180°: left=negative(-),  right=positive(+)  
    // We need to swap the nodes array to reflect the physical rotation
    const rotation = compNode.data?.rotation || 0;
    const isSource = componentType === 'dc_source' || componentType === 'current_source';
    
    if (isSource && (rotation === 180 || rotation === 270)) {
      // Rotation of 180° or 270° flips the polarity
      // Swap the terminal nodes so [0] is still positive in the netlist
      terminalElectricalNodes = [terminalElectricalNodes[1], terminalElectricalNodes[0]];
      console.log(`🔄 ${componentType} rotated ${rotation}° - terminals swapped for correct polarity`);
    }

    terminalElectricalNodes.forEach(n => allElectricalNodes.add(n));

    // Use the componentId from node data if available, otherwise use the label
    // This ensures unique IDs even when components have the same value
    const componentId = compNode.data?.componentId || compNode.data?.label || compNode.id;
    const cleanId = String(componentId).replace(/[^\x00-\x7F]/g, '').trim() || `comp${compNode.id.slice(-4)}`;

    components.push({
      id: cleanId,
      type: componentType,
      value: compNode.data?.value || getDefaultValue(componentType),
      nodes: terminalElectricalNodes,
      position: compNode.position,
      rotation: rotation, // Include rotation in component data
    });
  });

  // Validate
  if (components.length === 0) {
    throw new Error('Add at least one component.');
  }

  const hasVoltageOrCurrentSource = components.some(c => c.type === 'dc_source' || c.type === 'current_source');
  if (!hasVoltageOrCurrentSource) {
    throw new Error('Add a DC voltage source or current source.');
  }

  if (groundNodes.length === 0) {
    throw new Error('Add a Ground reference point.');
  }

  // Ensure node '0' exists (ground must be connected)
  if (!allElectricalNodes.has('0')) {
    throw new Error('Ground is not connected to the circuit! Wire ground to a component.');
  }

  const result = {
    nodes: Array.from(allElectricalNodes),
    components: components,
    ground: '0'
  };

  console.log('✅ Circuit converted:', result);
  
  return result;
}

function getDefaultValue(type) {
  const defaults = {
    'dc_source': 5.0,
    'current_source': 0.012,
    'resistor': 1000,
    'capacitor': 1e-7,
    'inductor': 1e-6,
  };
  return defaults[type] || 0;
}
