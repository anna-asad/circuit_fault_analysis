/**
 * Preset circuit loader — valid topologies for backend validation.
 *
 * DC voltage source rule: V+ → components → V− (closed loop).
 * Ground taps use a junction node on the loop (never on a source terminal).
 */

import { DATASET_CIRCUITS } from '../data/datasetCircuitValues.js';

const NODE_STYLES = {
  base: {
    padding: '4px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: '600',
    fontFamily: 'monospace', border: 'none', whiteSpace: 'pre-line', textAlign: 'center',
    minWidth: '80px', minHeight: '52px', background: 'transparent', color: '#1a1a1a',
  },
  ground: {
    padding: '4px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: '600',
    fontFamily: 'monospace', border: 'none', whiteSpace: 'pre-line', textAlign: 'center',
    minWidth: '44px', minHeight: '52px', background: 'transparent', color: '#16a34a',
  },
};

let _uid = 0;
function uid() { return ++_uid; }

function styleFor(type) {
  if (type === 'ground') return { ...NODE_STYLES.ground };
  if (type === 'switch') return { ...NODE_STYLES.base, color: '#27ae60' };
  if (type === 'bulb') return { ...NODE_STYLES.base, color: '#f39c12' };
  if (type === 'dc_source') return { ...NODE_STYLES.base, minWidth: '90px' };
  if (type === 'current_source') return { ...NODE_STYLES.base, minWidth: '60px', minHeight: '90px' };
  return { ...NODE_STYLES.base };
}

function compNode(id, type, value, position, extra = {}) {
  return {
    id: `preset_${id}_${uid()}`,
    type: type === 'ground' ? 'groundNode' : 'componentNode',
    position,
    data: {
      label: id,
      componentType: type,
      componentId: id,
      value,
      nominalValue: extra.nominalValue ?? value,
      rotation: extra.rotation ?? 0,
      state: extra.state,
      isPreset: true,
    },
    style: styleFor(type),
    presetMeta: { logicalId: id },
  };
}

function junctionNode(position) {
  return {
    id: `preset_j_${uid()}`,
    type: 'junctionNode',
    position,
    data: { label: '●', componentType: 'junction', componentId: '●' },
    style: { width: 10, height: 10, padding: 0, background: '#1a1a1a', borderRadius: '50%' },
  };
}

function wire(source, sourceHandle, target, targetHandle, idx) {
  const gnd = [source, target].some((n) => String(n).includes('GND'));
  return {
    id: `e_${idx}_${uid()}`,
    source, target, sourceHandle, targetHandle,
    type: 'smoothstep', animated: false,
    style: { stroke: gnd ? '#16a34a' : '#1a1a1a', strokeWidth: 2 },
    pathOptions: { borderRadius: 0 },
  };
}

function countCounters(nodes) {
  const c = {};
  const map = {
    dc_source: 'dc_source', current_source: 'current_source', resistor: 'resistor',
    bulb: 'bulb', switch: 'switch',
  };
  nodes.forEach((n) => {
    const key = map[n.data?.componentType];
    if (key) c[key] = (c[key] ?? 0) + 1;
  });
  return c;
}

function dv(id) { return DATASET_CIRCUITS[id]?.design_values ?? {}; }
function src(id) { return DATASET_CIRCUITS[id]?.sources ?? {}; }

/**
 * V+ → chain[0] → … → chain[n] → V− with ground junction after chain[groundAfterIdx].
 * groundAfterIdx=0 places ground between V+ and chain[0]; =1 between chain[0] and chain[1], etc.
 */
function buildDcSeriesLoop(sourceId, sourceValue, chain, groundAfterIdx = 1) {
  const y = 160;
  const vs = compNode(sourceId, 'dc_source', sourceValue, { x: 40, y });
  const parts = chain.map((el, i) => compNode(el.id, el.type, el.value, { x: 200 + i * 140, y }, el));
  const gnd = compNode('GND', 'ground', 0, { x: 200 + groundAfterIdx * 140 - 20, y: y + 110 });

  const nodes = [vs, ...parts];
  const edges = [];
  let e = 0;

  const attachWithOptionalJunction = (fromNode, fromHandle, toNode, toHandle, junctionX) => {
    if (junctionX != null) {
      const j = junctionNode({ x: junctionX, y });
      nodes.push(j);
      edges.push(wire(fromNode, fromHandle, j.id, 'left', e++));
      edges.push(wire(j.id, 'right', toNode, toHandle, e++));
      edges.push(wire(gnd.id, 'top', j.id, 'bottom', e++));
      return;
    }
    edges.push(wire(fromNode, fromHandle, toNode, toHandle, e++));
  };

  const jx = (idx) => 200 + idx * 140 - 70;

  if (groundAfterIdx === 0) {
    attachWithOptionalJunction(vs.id, 'right', parts[0].id, 'left', jx(0));
  } else {
    edges.push(wire(vs.id, 'right', parts[0].id, 'left', e++));
  }

  for (let i = 0; i < parts.length - 1; i++) {
    const useJunction = i + 1 === groundAfterIdx;
    attachWithOptionalJunction(parts[i].id, 'right', parts[i + 1].id, 'left', useJunction ? jx(i + 1) : null);
  }

  edges.push(wire(parts[parts.length - 1].id, 'right', vs.id, 'left', e++));
  nodes.push(gnd);

  return { nodes, edges, counters: countCounters(nodes) };
}

/** Current source in series loop: I+ → load → I− with ground junction on load path */
function buildCurrentSourceLoop(sourceId, sourceValue, loadId, loadValue, loadType = 'resistor') {
  const y = 200;
  const i1 = compNode(sourceId, 'current_source', sourceValue, { x: 60, y }, { rotation: 0 });
  const load = compNode(loadId, loadType, loadValue, { x: 260, y });
  const j = junctionNode({ x: 200, y });
  const gnd = compNode('GND', 'ground', 0, { x: 200, y: 320 });
  const edges = [
    wire(i1.id, 'right', j.id, 'left', 0),
    wire(j.id, 'right', load.id, 'left', 1),
    wire(load.id, 'right', i1.id, 'left', 2),
    wire(gnd.id, 'top', j.id, 'bottom', 3),
  ];
  return { nodes: [i1, load, j, gnd], edges, counters: countCounters([i1, load]) };
}

/** Current source with equivalent parallel load (single R_eq in loop) */
function buildCurrentSourceWithReq(sourceId, sourceValue, reqId, reqValue) {
  return buildCurrentSourceLoop(sourceId, sourceValue, reqId, reqValue);
}

// ── Beginner ────────────────────────────────────────────────────────────────

function buildBeginnerSwitchBulb() {
  return buildDcSeriesLoop('V1', 10, [
    { id: 'L1', type: 'bulb', value: 100 },
    { id: 'SW1', type: 'switch', value: 0, state: 'open' },
  ], 1);
}

function buildBeginnerTwoResistors() {
  return buildDcSeriesLoop('V1', 10, [
    { id: 'R1', type: 'resistor', value: 1000 },
    { id: 'R2', type: 'resistor', value: 2000 },
  ], 1);
}

function buildBeginnerResistorBulb() {
  return buildDcSeriesLoop('V1', 10, [
    { id: 'R1', type: 'resistor', value: 1000 },
    { id: 'L1', type: 'bulb', value: 100 },
  ], 1);
}

function buildBeginnerParallelTwoResistors() {
  const req = 1 / (1 / 1000 + 1 / 2000);
  return buildCurrentSourceWithReq('I1', 0.01, 'R_eq', req);
}

// ── Intermediate (dataset) ────────────────────────────────────────────────────

function buildVoltageDivider12k9k() {
  const d = dv('voltage_divider_12k_9k');
  const s = src('voltage_divider_12k_9k');
  return buildDcSeriesLoop('Vs', s.Vs, [
    { id: 'R1', type: 'resistor', value: d.R1 },
    { id: 'R2', type: 'resistor', value: d.R2 },
  ], 1);
}

function buildCurrentSourceSingleR() {
  const d = dv('current_source_single_R');
  const s = src('current_source_single_R');
  return buildCurrentSourceLoop('I1', s.I1, 'Rx', d.Rx);
}

function buildVdrParallelNetwork() {
  const d = dv('vdr_parallel_network');
  const s = src('vdr_parallel_network');
  const req = 1 / (1 / d.R1 + 1 / d.R2 + 1 / d.R3);
  return buildCurrentSourceWithReq('I1', s.I1, 'R_eq', req);
}

function buildCurrentSourceVoltageDivider() {
  const d = dv('current_source_voltage_divider');
  const s = src('current_source_voltage_divider');
  const req = 1 / (1 / d.R1 + 1 / d.R2);
  return buildCurrentSourceWithReq('I1', s.I1, 'R_eq', req);
}

function buildSeriesParallelR1R2R3R4() {
  const d = dv('series_parallel_R1R2R3R4');
  const s = src('series_parallel_R1R2R3R4');
  const y = 180;
  const vin = compNode('Vin', 'dc_source', s.Vin, { x: 30, y });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 170, y });
  const ja = junctionNode({ x: 250, y });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 330, y: 100 });
  const r3 = compNode('R3', 'resistor', d.R3, { x: 330, y });
  const r4 = compNode('R4', 'resistor', d.R4, { x: 470, y });
  const jRet = junctionNode({ x: 550, y });
  const gnd = compNode('GND', 'ground', 0, { x: 550, y: 280 });
  const edges = [
    wire(vin.id, 'right', r1.id, 'left', 0),
    wire(r1.id, 'right', ja.id, 'left', 1),
    wire(ja.id, 'right', r3.id, 'left', 2),
    wire(ja.id, 'top', r2.id, 'left', 3),
    wire(r3.id, 'right', r4.id, 'left', 4),
    wire(r4.id, 'right', jRet.id, 'left', 5),
    wire(r2.id, 'right', jRet.id, 'left', 6),
    wire(jRet.id, 'right', vin.id, 'left', 7),
    wire(gnd.id, 'top', ja.id, 'bottom', 8),
  ];
  return {
    nodes: [vin, r1, r2, r3, r4, ja, jRet, gnd],
    edges,
    counters: countCounters([vin, r1, r2, r3, r4]),
  };
}

function buildCurrentSourceTNetwork() {
  const d = dv('current_source_t_network');
  const s = src('current_source_t_network');
  const y = 200;
  const i1 = compNode('I1', 'current_source', s.I1, { x: 40, y: 320 }, { rotation: 0 });
  const rs = compNode('R_s', 'resistor', d.R_s, { x: 180, y: 200 });
  const jb = junctionNode({ x: 300, y: 200 });
  const rp = compNode('R_p', 'resistor', d.R_p, { x: 420, y: 300 });
  const rl = compNode('R_L', 'resistor', d.R_L, { x: 420, y: 120 });
  const rleak = compNode('R_leak', 'resistor', d.R_leak, { x: 560, y: 120 });
  const jg = junctionNode({ x: 560, y: 260 });
  const gnd = compNode('GND', 'ground', 0, { x: 560, y: 340 });
  const edges = [
    wire(i1.id, 'right', rs.id, 'left', 0),
    wire(rs.id, 'right', jb.id, 'left', 1),
    wire(jb.id, 'right', rp.id, 'left', 2),
    wire(jb.id, 'top', rl.id, 'left', 3),
    wire(rl.id, 'right', rleak.id, 'left', 4),
    wire(rp.id, 'right', jg.id, 'left', 5),
    wire(rleak.id, 'right', jg.id, 'left', 6),
    wire(jg.id, 'right', i1.id, 'left', 7),
    wire(gnd.id, 'top', jg.id, 'bottom', 8),
  ];
  return {
    nodes: [i1, rs, rp, rl, rleak, jb, jg, gnd],
    edges,
    counters: countCounters([i1, rs, rp, rl, rleak]),
  };
}

function buildKvlSeriesLoop() {
  const d = dv('kvl_series_loop_ABCDEF');
  const s = src('kvl_series_loop_ABCDEF');
  const y = 180;
  const rfa = compNode('R_FA', 'resistor', d.R_FA, { x: 80, y });
  const rab = compNode('R_AB', 'resistor', d.R_AB, { x: 200, y });
  const jB = junctionNode({ x: 280, y });
  const rbc = compNode('R_BC', 'resistor', d.R_BC, { x: 360, y });
  const vcd = compNode('V_CD', 'dc_source', s.V_CD, { x: 480, y });
  const rde = compNode('R_DE', 'resistor', d.R_DE, { x: 600, y });
  const vef = compNode('V_EF', 'dc_source', s.V_EF, { x: 720, y });
  const gnd = compNode('GND', 'ground', 0, { x: 280, y: 300 });
  const edges = [
    wire(rfa.id, 'right', rab.id, 'left', 0),
    wire(rab.id, 'right', jB.id, 'left', 1),
    wire(jB.id, 'right', rbc.id, 'left', 2),
    wire(rbc.id, 'right', vcd.id, 'left', 3),
    wire(vcd.id, 'right', rde.id, 'left', 4),
    wire(rde.id, 'right', vef.id, 'left', 5),
    wire(vef.id, 'right', rfa.id, 'left', 6),
    wire(gnd.id, 'top', jB.id, 'bottom', 7),
  ];
  return {
    nodes: [rfa, rab, rbc, vcd, rde, vef, jB, gnd],
    edges,
    counters: countCounters([rfa, rab, rbc, vcd, rde, vef]),
  };
}

function buildMultisource5RNetwork() {
  const d = dv('multisource_5R_network');
  const s = src('multisource_5R_network');
  const jA = junctionNode({ x: 220, y: 80 });
  const jB = junctionNode({ x: 420, y: 80 });
  const jC = junctionNode({ x: 320, y: 200 });
  const jG = junctionNode({ x: 320, y: 320 });
  const gnd = compNode('GND', 'ground', 0, { x: 320, y: 400 });
  const v1 = compNode('V1', 'dc_source', s.V1, { x: 40, y: 80 });
  const v2 = compNode('V2', 'dc_source', s.V2, { x: 40, y: 180 });
  const i1 = compNode('I1', 'current_source', s.I1, { x: 40, y: 300 }, { rotation: 0 });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 140, y: 200 });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 320, y: 80 });
  const r3 = compNode('R3', 'resistor', d.R3, { x: 180, y: 140 });
  const r4 = compNode('R4', 'resistor', d.R4, { x: 420, y: 160 });
  const r5 = compNode('R5', 'resistor', d.R5, { x: 420, y: 280 });
  const edges = [
    wire(v1.id, 'right', jA.id, 'left', 0),
    wire(v1.id, 'left', jC.id, 'left', 1),
    wire(v2.id, 'right', jB.id, 'left', 2),
    wire(v2.id, 'left', jC.id, 'right', 3),
    wire(jA.id, 'right', r2.id, 'left', 4),
    wire(r2.id, 'right', jB.id, 'left', 5),
    wire(jA.id, 'bottom', r3.id, 'left', 6),
    wire(r3.id, 'right', jC.id, 'top', 7),
    wire(jB.id, 'bottom', r4.id, 'left', 8),
    wire(r4.id, 'right', jC.id, 'bottom', 9),
    wire(jA.id, 'top', r1.id, 'left', 10),
    wire(r1.id, 'right', jG.id, 'left', 11),
    wire(jC.id, 'right', r5.id, 'left', 12),
    wire(r5.id, 'right', jG.id, 'right', 13),
    wire(i1.id, 'right', jG.id, 'bottom', 14),
    wire(jC.id, 'left', i1.id, 'left', 15),
    wire(gnd.id, 'top', jG.id, 'bottom', 16),
  ];
  return {
    nodes: [v1, v2, i1, r1, r2, r3, r4, r5, jA, jB, jC, jG, gnd],
    edges,
    counters: countCounters([v1, v2, i1, r1, r2, r3, r4, r5]),
  };
}

function buildNilssonEx28MultiSource() {
  const d = dv('nilsson_ex2_8_multi_source');
  const s = src('nilsson_ex2_8_multi_source');
  const y = 180;
  const v1 = compNode('V1', 'dc_source', s.V1, { x: 30, y: 100 });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 170, y: 80 });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 170, y: 160 });
  const ja = junctionNode({ x: 250, y: 120 });
  const r4 = compNode('R4', 'resistor', d.R4, { x: 370, y: 160 });
  const r5 = compNode('R5', 'resistor', d.R5, { x: 370, y: 260 });
  const r3 = compNode('R3', 'resistor', d.R3, { x: 250, y: 260 });
  const i1 = compNode('I1', 'current_source', s.I1, { x: 30, y: 280 }, { rotation: 0 });
  const j5 = junctionNode({ x: 250, y: 280 });
  const jRet = junctionNode({ x: 490, y: 200 });
  const gnd = compNode('GND', 'ground', 0, { x: 490, y: 320 });
  const edges = [
    wire(v1.id, 'right', r1.id, 'left', 0),
    wire(v1.id, 'right', r2.id, 'left', 1),
    wire(r1.id, 'right', ja.id, 'left', 2),
    wire(r2.id, 'right', ja.id, 'left', 3),
    wire(ja.id, 'right', r4.id, 'left', 4),
    wire(ja.id, 'bottom', j5.id, 'left', 5),
    wire(i1.id, 'right', r3.id, 'left', 6),
    wire(r3.id, 'right', j5.id, 'right', 7),
    wire(j5.id, 'top', r5.id, 'left', 8),
    wire(r4.id, 'right', jRet.id, 'left', 9),
    wire(r5.id, 'right', jRet.id, 'left', 10),
    wire(jRet.id, 'right', v1.id, 'left', 11),
    wire(jRet.id, 'right', i1.id, 'left', 12),
    wire(gnd.id, 'top', ja.id, 'bottom', 13),
  ];
  return {
    nodes: [v1, i1, r1, r2, r3, r4, r5, ja, j5, jRet, gnd],
    edges,
    counters: countCounters([v1, i1, r1, r2, r3, r4, r5]),
  };
}

const BUILDERS = {
  beginner_switch_bulb: buildBeginnerSwitchBulb,
  beginner_two_resistors: buildBeginnerTwoResistors,
  beginner_resistor_bulb: buildBeginnerResistorBulb,
  beginner_parallel_resistors: buildBeginnerParallelTwoResistors,
  series_parallel_R1R2R3R4: buildSeriesParallelR1R2R3R4,
  voltage_divider_12k_9k: buildVoltageDivider12k9k,
  current_source_single_R: buildCurrentSourceSingleR,
  vdr_parallel_network: buildVdrParallelNetwork,
  current_source_voltage_divider: buildCurrentSourceVoltageDivider,
  current_source_t_network: buildCurrentSourceTNetwork,
  kvl_series_loop_ABCDEF: buildKvlSeriesLoop,
  multisource_5R_network: buildMultisource5RNetwork,
  nilsson_ex2_8_multi_source: buildNilssonEx28MultiSource,
};

export function loadPresetCircuit(circuitKey, options = {}) {
  const builder = BUILDERS[circuitKey];
  if (!builder) throw new Error(`Unknown preset circuit: ${circuitKey}`);
  _uid = 0;
  const preset = builder();
  const { faultValues, nominalValues } = options;
  if (faultValues || nominalValues) {
    preset.nodes = preset.nodes.map((node) => {
      const id = node.data?.componentId;
      if (!id || node.data?.componentType === 'ground') return node;
      const nom = nominalValues?.[id] ?? node.data.nominalValue ?? node.data.value;
      const val = faultValues?.[id] ?? node.data.value;
      return { ...node, data: { ...node.data, value: val, nominalValue: nom } };
    });
  }
  return { ...preset, circuitKey, loadId: `${circuitKey}_${Date.now()}` };
}

export function listPresetCircuitKeys() {
  return Object.keys(BUILDERS);
}

export function getDatasetCircuit(circuitId) {
  return DATASET_CIRCUITS[circuitId] ?? null;
}
