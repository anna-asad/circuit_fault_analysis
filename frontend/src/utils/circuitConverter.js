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

  // Build adjacency graph
  const graph = new Map();
  edges.forEach(edge => {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    if (!graph.has(edge.target)) graph.set(edge.target, []);
    graph.get(edge.source).push(edge.target);
    graph.get(edge.target).push(edge.source);
  });

  // Validate ground has at least 1 connection
  if (groundNodes.length === 0) {
    throw new Error('Add a Ground reference point (⏚).');
  }

  // Create unique IDs for each component terminal
  const terminalNodes = new Map();
  
  componentNodes.forEach(comp => {
    const connections = graph.get(comp.id) || [];
    
    // Components need exactly 2 connections
    // BUT: if connected to ground, ground doesn't count as a "component terminal connection"
    // Ground just marks which wire is node '0'
    const nonGroundConnections = connections.filter(connId => {
      const connNode = nodes.find(n => n.id === connId);
      return connNode?.data?.componentType !== 'ground';
    });
    
    if (nonGroundConnections.length !== 2) {
      throw new Error(`${comp.data?.componentType} needs exactly 2 terminal connections (ground doesn't count). Has ${nonGroundConnections.length}.`);
    }
    
    terminalNodes.set(comp.id, [
      `${comp.id}_t0`,
      `${comp.id}_t1`
    ]);
  });

  // Allow the ground symbol to act like LTspice's reference marker.
  // If it is not wired, attach it to the nearest component terminal.
  const groundReference = groundNodes[0];
  if (groundReference) {
    const nearestTerminal = findNearestTerminal(groundReference, componentNodes, terminalNodes);
    if (!nearestTerminal) {
      throw new Error('Ground could not be placed near any component terminal.');
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
      
      const sourceConnections = graph.get(edge.source).filter(id => {
        const n = nodes.find(node => node.id === id);
        return n?.data?.componentType !== 'ground';
      });
      const targetConnections = graph.get(edge.target).filter(id => {
        const n = nodes.find(node => node.id === id);
        return n?.data?.componentType !== 'ground';
      });
      
      const sourceTerminalIdx = sourceConnections.indexOf(edge.target);
      const targetTerminalIdx = targetConnections.indexOf(edge.source);
      
      union(sourceTerminals[sourceTerminalIdx], targetTerminals[targetTerminalIdx]);
    } else if (sourceIsComponent && !targetIsGround) {
      // Component to junction: union terminal with junction
      const sourceTerminals = terminalNodes.get(edge.source);
      const sourceConnections = graph.get(edge.source).filter(id => {
        const n = nodes.find(node => node.id === id);
        return n?.data?.componentType !== 'ground';
      });
      const terminalIdx = sourceConnections.indexOf(edge.target);
      
      union(sourceTerminals[terminalIdx], edge.target);
    } else if (targetIsComponent && !sourceIsGround) {
      // Junction to component: union junction with terminal
      const targetTerminals = terminalNodes.get(edge.target);
      const targetConnections = graph.get(edge.target).filter(id => {
        const n = nodes.find(node => node.id === id);
        return n?.data?.componentType !== 'ground';
      });
      const terminalIdx = targetConnections.indexOf(edge.source);
      
      union(edge.source, targetTerminals[terminalIdx]);
    } else if (sourceIsComponent && targetIsGround) {
      // Component to ground: union terminal with ground
      const sourceTerminals = terminalNodes.get(edge.source);
      const sourceConnections = graph.get(edge.source).filter(id => {
        const n = nodes.find(node => node.id === id);
        return n?.data?.componentType !== 'ground';
      });
      // Ground connects to the "other" terminals that aren't the main 2
      // Actually, ground connects to whichever wire it's attached to
      // We need to find which terminal this ground is near
      
      // For now: union ground with ALL terminals of this component
      sourceTerminals.forEach(term => union(term, edge.target));
    } else if (targetIsComponent && sourceIsGround) {
      // Ground to component: union ground with terminal
      const targetTerminals = terminalNodes.get(edge.target);
      targetTerminals.forEach(term => union(edge.source, term));
    } else if (!sourceIsGround && !targetIsGround) {
      // Junction to junction: union them
      union(edge.source, edge.target);
    } else if (sourceIsGround || targetIsGround) {
      // Ground to junction: union them
      union(edge.source, edge.target);
    }
  });

  if (groundReference) {
    const nearestTerminal = findNearestTerminal(groundReference, componentNodes, terminalNodes);
    if (nearestTerminal) {
      union(groundReference.id, nearestTerminal);
    }
  }

  // Assign electrical node names
  const electricalNodeMap = new Map();
  let nodeCounter = 1;

  const allRoots = new Set();
  allIds.forEach(id => allRoots.add(find(id)));

  allRoots.forEach(root => {
    // Check if this group contains any ground
    const hasGround = allIds.some(id => {
      const node = nodes.find(n => n.id === id);
      return node && node.data?.componentType === 'ground' && find(id) === root;
    });
    
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
    
    const terminalElectricalNodes = terminals.map(t => {
      const root = find(t);
      return electricalNodeMap.get(root);
    });

    // Check for short
    if (terminalElectricalNodes[0] === terminalElectricalNodes[1]) {
      throw new Error(`${componentType}: Both terminals at same node (short circuit).`);
    }

    terminalElectricalNodes.forEach(n => allElectricalNodes.add(n));

    components.push({
      id: compNode.id.replace(/_/g, ''),
      type: componentType,
      value: compNode.data?.value || getDefaultValue(componentType),
      nodes: terminalElectricalNodes,
      position: compNode.position
    });
  });

  // Validate
  if (components.length === 0) {
    throw new Error('Add at least one component.');
  }

  const hasVoltageSource = components.some(c => c.type === 'dc_source');
  if (!hasVoltageSource) {
    throw new Error('Add a DC voltage source (battery).');
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
    'resistor': 1000,
    'capacitor': 1e-7,
    'inductor': 1e-6,
  };
  return defaults[type] || 0;
}

function findNearestTerminal(groundNode, componentNodes, terminalNodes) {
  if (!groundNode || componentNodes.length === 0) {
    return null;
  }

  const groundPoint = {
    x: groundNode.position?.x ?? 0,
    y: groundNode.position?.y ?? 0,
  };

  let nearestTerminal = null;
  let nearestDistance = Infinity;

  componentNodes.forEach((componentNode) => {
    const terminals = terminalNodes.get(componentNode.id);
    if (!terminals) {
      return;
    }

    const centerY = (componentNode.position?.y ?? 0) + 24;
    const leftTerminal = {
      id: terminals[0],
      x: componentNode.position?.x ?? 0,
      y: centerY,
    };
    const rightTerminal = {
      id: terminals[1],
      x: (componentNode.position?.x ?? 0) + 120,
      y: centerY,
    };

    [leftTerminal, rightTerminal].forEach((terminal) => {
      const dx = groundPoint.x - terminal.x;
      const dy = groundPoint.y - terminal.y;
      const distance = Math.sqrt((dx * dx) + (dy * dy));

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTerminal = terminal.id;
      }
    });
  });

  return nearestTerminal;
}
