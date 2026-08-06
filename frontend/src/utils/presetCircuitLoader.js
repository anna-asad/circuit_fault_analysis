/**
 * Builds React Flow preset circuits for the education simulator.
 * Returns { nodes, edges, counters } ready to load on the canvas.
 */

const NODE_STYLES = {
  base: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#1a1a1a',
  },
  ground: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '44px',
    minHeight: '52px',
    background: 'transparent',
    color: '#16a34a',
  },
  switch: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#27ae60',
  },
  bulb: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#f39c12',
  },
};

function styleFor(type) {
  if (type === 'ground') return NODE_STYLES.ground;
  if (type === 'switch') return NODE_STYLES.switch;
  if (type === 'bulb') return NODE_STYLES.bulb;
  if (type === 'dc_source') return { ...NODE_STYLES.base, minWidth: '90px' };
  if (type === 'current_source') return { ...NODE_STYLES.base, minWidth: '60px', minHeight: '90px' };
  return NODE_STYLES.base;
}

function compNode(id, type, value, position, extra = {}) {
  const ts = Date.now();
  const nodeId = `preset_${id}_${ts}`;
  return {
    id: nodeId,
    type: type === 'ground' ? 'groundNode' : 'componentNode',
    position,
    data: {
      label: id,
      componentType: type,
      componentId: id,
      value,
      nominalValue: value,
      rotation: extra.rotation ?? 0,
      state: extra.state,
      isPreset: true,
    },
    style: styleFor(type),
    presetMeta: { logicalId: id },
  };
}

function wire(source, sourceHandle, target, targetHandle, idx) {
  const isGround =
    sourceHandle === 'ground' ||
    targetHandle === 'ground' ||
    String(source).includes('ground') ||
    String(target).includes('ground');
  return {
    id: `e_preset_${idx}`,
    source,
    target,
    sourceHandle: sourceHandle === 'ground' ? 'top' : sourceHandle,
    targetHandle: targetHandle === 'ground' ? 'top' : targetHandle,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: isGround ? '#16a34a' : '#1a1a1a',
      strokeWidth: 2,
    },
    pathOptions: { borderRadius: 0 },
  };
}

function buildSwitchBulb() {
  const v1 = compNode('V1', 'dc_source', 5, { x: 40, y: 180 });
  const r1 = compNode('L1', 'bulb', 100, { x: 180, y: 180 });
  const sw = compNode('SW1', 'switch', 0, { x: 320, y: 180 }, { state: 'open' });
  const gnd = compNode('⏚', 'ground', 0, { x: 460, y: 280 });
  const edges = [
    wire(gnd.id, 'top', v1.id, 'left', 0),
    wire(v1.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', sw.id, 'left', 2),
    wire(sw.id, 'right', gnd.id, 'top', 3),
  ];
  return {
    nodes: [v1, r1, sw, gnd],
    edges,
    counters: { dc_source: 1, bulb: 1, switch: 1 },
  };
}

function buildVoltageDivider12k9k() {
  const vs = compNode('Vs', 'dc_source', 7, { x: 40, y: 160 });
  const r1 = compNode('R1', 'resistor', 12000, { x: 180, y: 160 });
  const r2 = compNode('R2', 'resistor', 9000, { x: 340, y: 160 });
  const gnd = compNode('⏚', 'ground', 0, { x: 340, y: 280 });
  const edges = [
    wire(gnd.id, 'top', vs.id, 'left', 0),
    wire(vs.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', r2.id, 'left', 2),
    wire(r2.id, 'right', gnd.id, 'top', 3),
  ];
  return {
    nodes: [vs, r1, r2, gnd],
    edges,
    counters: { dc_source: 1, resistor: 2 },
  };
}

function buildNilssonEx32Divider() {
  const vs = compNode('Vs', 'dc_source', 100, { x: 40, y: 160 });
  const r1 = compNode('R1', 'resistor', 25000, { x: 180, y: 160 });
  const r2 = compNode('R2', 'resistor', 100000, { x: 340, y: 160 });
  const gnd = compNode('⏚', 'ground', 0, { x: 340, y: 280 });
  const edges = [
    wire(gnd.id, 'top', vs.id, 'left', 0),
    wire(vs.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', r2.id, 'left', 2),
    wire(r2.id, 'right', gnd.id, 'top', 3),
  ];
  return {
    nodes: [vs, r1, r2, gnd],
    edges,
    counters: { dc_source: 1, resistor: 2 },
  };
}

function buildNilssonAssess32Divider() {
  const vs = compNode('Vs', 'dc_source', 200, { x: 40, y: 160 });
  const r1 = compNode('R1', 'resistor', 25000, { x: 180, y: 160 });
  const r2 = compNode('R2', 'resistor', 75000, { x: 340, y: 160 });
  const gnd = compNode('⏚', 'ground', 0, { x: 340, y: 280 });
  const edges = [
    wire(gnd.id, 'top', vs.id, 'left', 0),
    wire(vs.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', r2.id, 'left', 2),
    wire(r2.id, 'right', gnd.id, 'top', 3),
  ];
  return {
    nodes: [vs, r1, r2, gnd],
    edges,
    counters: { dc_source: 1, resistor: 2 },
  };
}

function buildNilssonEx31SeriesParallel() {
  const vin = compNode('Vin', 'dc_source', 120, { x: 30, y: 200 });
  const r1 = compNode('R1', 'resistor', 4, { x: 160, y: 200 });
  const r2 = compNode('R2', 'resistor', 18, { x: 300, y: 120 });
  const r3 = compNode('R3', 'resistor', 3, { x: 300, y: 200 });
  const r4 = compNode('R4', 'resistor', 6, { x: 440, y: 200 });
  const gnd = compNode('⏚', 'ground', 0, { x: 440, y: 320 });
  const j1 = {
    id: `preset_j1_${Date.now()}`,
    type: 'junctionNode',
    position: { x: 248, y: 198 },
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
  const j2 = {
    id: `preset_j2_${Date.now() + 1}`,
    type: 'junctionNode',
    position: { x: 388, y: 198 },
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
  const edges = [
    wire(gnd.id, 'top', vin.id, 'left', 0),
    wire(vin.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', j1.id, 'right', 2),
    wire(j1.id, 'left', r2.id, 'left', 3),
    wire(j1.id, 'right', r3.id, 'left', 4),
    wire(r3.id, 'right', r4.id, 'left', 5),
    wire(r4.id, 'right', gnd.id, 'top', 6),
    wire(r2.id, 'right', gnd.id, 'top', 7),
  ];
  return {
    nodes: [vin, r1, r2, r3, r4, gnd, j1, j2],
    edges,
    counters: { dc_source: 1, resistor: 4 },
  };
}

function buildNilssonEx34CurrentDivision() {
  const i1 = compNode('I1', 'current_source', 8, { x: 80, y: 220 }, { rotation: 0 });
  const r1 = compNode('R1', 'resistor', 36, { x: 220, y: 80 });
  const r2 = compNode('R2', 'resistor', 44, { x: 360, y: 80 });
  const r3 = compNode('R3', 'resistor', 10, { x: 220, y: 180 });
  const r4 = compNode('R4', 'resistor', 40, { x: 220, y: 280 });
  const r5 = compNode('R5', 'resistor', 10, { x: 360, y: 280 });
  const r6 = compNode('R6', 'resistor', 30, { x: 500, y: 280 });
  const r7 = compNode('R7', 'resistor', 24, { x: 220, y: 380 });
  const gnd = compNode('⏚', 'ground', 0, { x: 500, y: 420 });
  const jT = {
    id: `preset_jT_${Date.now()}`,
    type: 'junctionNode',
    position: { x: 168, y: 218 },
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
  const jN1 = {
    id: `preset_jN1_${Date.now()}`,
    type: 'junctionNode',
    position: { x: 308, y: 78 },
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
  const jN3 = {
    id: `preset_jN3_${Date.now()}`,
    type: 'junctionNode',
    position: { x: 448, y: 278 },
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
  const edges = [
    wire(gnd.id, 'top', i1.id, 'left', 0),
    wire(i1.id, 'right', jT.id, 'left', 1),
    wire(jT.id, 'right', r1.id, 'left', 2),
    wire(r1.id, 'right', jN1.id, 'left', 3),
    wire(jN1.id, 'right', r2.id, 'left', 4),
    wire(jN1.id, 'bottom', gnd.id, 'top', 5),
    wire(jT.id, 'bottom', r3.id, 'left', 6),
    wire(r3.id, 'right', gnd.id, 'top', 7),
    wire(jT.id, 'top', r4.id, 'left', 8),
    wire(r4.id, 'right', r5.id, 'left', 9),
    wire(r5.id, 'right', jN3.id, 'left', 10),
    wire(jN3.id, 'right', r6.id, 'left', 11),
    wire(r6.id, 'right', gnd.id, 'top', 12),
    wire(jT.id, 'top', r7.id, 'left', 13),
    wire(r7.id, 'right', gnd.id, 'top', 14),
  ];
  return {
    nodes: [i1, r1, r2, r3, r4, r5, r6, r7, gnd, jT, jN1, jN3],
    edges,
    counters: { current_source: 1, resistor: 7 },
  };
}

function buildNilssonEx28MultiSource() {
  const v1 = compNode('V1', 'dc_source', 24, { x: 40, y: 140 });
  const i1 = compNode('I1', 'current_source', 6, { x: 40, y: 280 }, { rotation: 0 });
  const r1 = compNode('R1', 'resistor', 2, { x: 200, y: 100 });
  const r2 = compNode('R2', 'resistor', 3, { x: 200, y: 180 });
  const r3 = compNode('R3', 'resistor', 4, { x: 200, y: 260 });
  const r4 = compNode('R4', 'resistor', 5, { x: 360, y: 180 });
  const r5 = compNode('R5', 'resistor', 7, { x: 360, y: 280 });
  const gnd = compNode('⏚', 'ground', 0, { x: 480, y: 320 });
  const edges = [
    wire(gnd.id, 'top', v1.id, 'left', 0),
    wire(gnd.id, 'top', i1.id, 'left', 1),
    wire(v1.id, 'right', r1.id, 'left', 2),
    wire(v1.id, 'right', r2.id, 'left', 3),
    wire(r1.id, 'right', r5.id, 'left', 4),
    wire(i1.id, 'right', r5.id, 'left', 5),
    wire(r2.id, 'right', r4.id, 'left', 6),
    wire(r3.id, 'right', gnd.id, 'top', 7),
    wire(r4.id, 'right', gnd.id, 'top', 8),
    wire(r5.id, 'right', gnd.id, 'top', 9),
    wire(v1.id, 'right', r3.id, 'left', 10),
  ];
  return {
    nodes: [v1, i1, r1, r2, r3, r4, r5, gnd],
    edges,
    counters: { dc_source: 1, current_source: 1, resistor: 5 },
  };
}

const BUILDERS = {
  switch_bulb: buildSwitchBulb,
  voltage_divider_12k_9k: buildVoltageDivider12k9k,
  nilsson_ex3_2_divider: buildNilssonEx32Divider,
  nilsson_assess3_2_divider: buildNilssonAssess32Divider,
  nilsson_ex3_1_series_parallel: buildNilssonEx31SeriesParallel,
  nilsson_ex3_4_current_division: buildNilssonEx34CurrentDivision,
  nilsson_ex2_8_multi_source: buildNilssonEx28MultiSource,
};

/**
 * Load a preset circuit by key.
 * @param {string} circuitKey
 * @param {{ inject?: { component: string, faultType: string, multiplier: number } }} options
 */
export function loadPresetCircuit(circuitKey, options = {}) {
  const builder = BUILDERS[circuitKey];
  if (!builder) {
    throw new Error(`Unknown preset circuit: ${circuitKey}`);
  }

  const preset = builder();
  const { inject } = options;

  if (inject) {
    preset.nodes = preset.nodes.map((node) => {
      const logicalId = node.data?.componentId ?? node.presetMeta?.logicalId;
      if (logicalId !== inject.component) return node;

      const nominal = node.data.value;
      let faulty = nominal;
      if (inject.faultType === 'partial_open') {
        faulty = nominal * (inject.multiplier ?? 5);
      } else if (inject.faultType === 'partial_short') {
        faulty = nominal * (inject.multiplier ?? 0.1);
      }

      return {
        ...node,
        data: {
          ...node.data,
          value: faulty,
          nominalValue: nominal,
          injectedFault: inject.faultType,
        },
      };
    });
  }

  return {
    ...preset,
    circuitKey,
    loadId: `${circuitKey}_${Date.now()}`,
  };
}

export function listPresetCircuitKeys() {
  return Object.keys(BUILDERS);
}
