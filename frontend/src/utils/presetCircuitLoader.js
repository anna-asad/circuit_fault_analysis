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
 * 
 * Clean horizontal layout with 200px spacing between components.
 */
function buildDcSeriesLoop(sourceId, sourceValue, chain, groundAfterIdx = 1) {
  const y = 250;
  const vs = compNode(sourceId, 'dc_source', sourceValue, { x: 100, y });
  const parts = chain.map((el, i) => compNode(el.id, el.type, el.value, { x: 300 + i * 200, y }, el));
  const gnd = compNode('GND', 'ground', 0, { x: 300 + groundAfterIdx * 200 - 100, y: y + 200 });

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

  const jx = (idx) => 300 + idx * 200 - 100;

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

/** Current source in series loop: I+ → load → I− with ground junction on load path 
 * Clean horizontal layout with proper spacing */
function buildCurrentSourceLoop(sourceId, sourceValue, loadId, loadValue, loadType = 'resistor') {
  const y = 250;
  const i1 = compNode(sourceId, 'current_source', sourceValue, { x: 100, y }, { rotation: 0 });
  const load = compNode(loadId, loadType, loadValue, { x: 400, y });
  const j = junctionNode({ x: 250, y });
  const gnd = compNode('GND', 'ground', 0, { x: 250, y: 450 });
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
  // Clean parallel layout: I1 → junction → two parallel resistors → junction → back
  // Grid: x: 100, 300, 500, 700; y: 100, 250, 400
  const y = 250;
  const i1 = compNode('I1', 'current_source', 0.01, { x: 100, y }, { rotation: 0 });
  const j1 = junctionNode({ x: 300, y });
  const r1 = compNode('R1', 'resistor', 1000, { x: 500, y: 100 });
  const r2 = compNode('R2', 'resistor', 2000, { x: 500, y: 400 });
  const j2 = junctionNode({ x: 700, y });
  const gnd = compNode('GND', 'ground', 0, { x: 300, y: 500 });

  const edges = [
    wire(i1.id, 'right', j1.id, 'left', 0),
    wire(j1.id, 'top', r1.id, 'left', 1),
    wire(j1.id, 'bottom', r2.id, 'left', 2),
    wire(r1.id, 'right', j2.id, 'top', 3),
    wire(r2.id, 'right', j2.id, 'bottom', 4),
    wire(j2.id, 'right', i1.id, 'left', 5),
    wire(gnd.id, 'top', j1.id, 'bottom', 6),
  ];

  return { nodes: [i1, r1, r2, j1, j2, gnd], edges, counters: countCounters([i1, r1, r2]) };
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
  // Three parallel resistors with proper vertical spacing
  // Grid: x: 100, 300, 550, 750; y: 100, 300, 500
  const d = dv('vdr_parallel_network');
  const s = src('vdr_parallel_network');
  const y = 300;
  const i1 = compNode('I1', 'current_source', s.I1, { x: 100, y }, { rotation: 0 });
  const j1 = junctionNode({ x: 300, y });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 550, y: 100 });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 550, y: 300 });
  const r3 = compNode('R3', 'resistor', d.R3, { x: 550, y: 500 });
  const j2 = junctionNode({ x: 750, y });
  const gnd = compNode('GND', 'ground', 0, { x: 300, y: 600 });

  const edges = [
    wire(i1.id, 'right', j1.id, 'left', 0),
    wire(j1.id, 'top', r1.id, 'left', 1),
    wire(j1.id, 'right', r2.id, 'left', 2),
    wire(j1.id, 'bottom', r3.id, 'left', 3),
    wire(r1.id, 'right', j2.id, 'top', 4),
    wire(r2.id, 'right', j2.id, 'right', 5),
    wire(r3.id, 'right', j2.id, 'bottom', 6),
    wire(j2.id, 'right', i1.id, 'left', 7),
    wire(gnd.id, 'top', j1.id, 'bottom', 8),
  ];

  return { nodes: [i1, r1, r2, r3, j1, j2, gnd], edges, counters: countCounters([i1, r1, r2, r3]) };
}

function buildCurrentSourceVoltageDivider() {
  // Vertical voltage divider with current source
  // Grid: x: 100, 300, 500; y: 100, 300, 500
  const d = dv('current_source_voltage_divider');
  const s = src('current_source_voltage_divider');
  const i1 = compNode('I1', 'current_source', s.I1, { x: 100, y: 300 }, { rotation: 0 });
  const j1 = junctionNode({ x: 300, y: 300 });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 500, y: 150 }, { rotation: 90 });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 500, y: 450 }, { rotation: 90 });
  const gnd = compNode('GND', 'ground', 0, { x: 300, y: 600 });

  const edges = [
    wire(i1.id, 'right', j1.id, 'left', 0),
    wire(j1.id, 'right', r1.id, 'left', 1),
    wire(r1.id, 'right', r2.id, 'left', 2),
    wire(r2.id, 'right', i1.id, 'left', 3),
    wire(gnd.id, 'top', j1.id, 'bottom', 4),
  ];

  return { nodes: [i1, r1, r2, j1, gnd], edges, counters: countCounters([i1, r1, r2]) };
}

function buildSeriesParallelR1R2R3R4() {
  // Clean schematic layout:
  //              ┌─── R2 ───┐
  // Vin ─ R1 ─●──┤          ├─●─ R4 ─┐
  //           │  └─── R3 ───┘ │      │
  //          GND                     │
  //           └──────────────────────┘
  // Grid: x: 100, 300, 450, 600, 800, 1000; y: 100, 300, 500
  const d = dv('series_parallel_R1R2R3R4');
  const s = src('series_parallel_R1R2R3R4');
  const y = 300;
  
  const vin = compNode('Vin', 'dc_source', s.Vin, { x: 100, y });
  const r1 = compNode('R1', 'resistor', d.R1, { x: 300, y });
  const ja = junctionNode({ x: 450, y });
  const r2 = compNode('R2', 'resistor', d.R2, { x: 600, y: 150 });
  const r3 = compNode('R3', 'resistor', d.R3, { x: 600, y: 450 });
  const jb = junctionNode({ x: 750, y });
  const r4 = compNode('R4', 'resistor', d.R4, { x: 900, y });
  const gnd = compNode('GND', 'ground', 0, { x: 450, y: 550 });
  
  const edges = [
    wire(vin.id, 'right', r1.id, 'left', 0),
    wire(r1.id, 'right', ja.id, 'left', 1),
    wire(ja.id, 'top', r2.id, 'left', 2),
    wire(ja.id, 'bottom', r3.id, 'left', 3),
    wire(r2.id, 'right', jb.id, 'top', 4),
    wire(r3.id, 'right', jb.id, 'bottom', 5),
    wire(jb.id, 'right', r4.id, 'left', 6),
    wire(r4.id, 'right', vin.id, 'left', 7),
    wire(gnd.id, 'top', ja.id, 'bottom', 8),
  ];
  
  return {
    nodes: [vin, r1, r2, r3, r4, ja, jb, gnd],
    edges,
    counters: countCounters([vin, r1, r2, r3, r4]),
  };
}

function buildCurrentSourceTNetwork() {
  // T-network with proper spacing and clean layout
  // Grid: x: 100, 350, 550, 750, 950; y: 100, 350, 600
  const d = dv('current_source_t_network');
  const s = src('current_source_t_network');
  
  const i1 = compNode('I1', 'current_source', s.I1, { x: 100, y: 450 }, { rotation: 0 });
  const rs = compNode('R_s', 'resistor', d.R_s, { x: 350, y: 350 });
  const jb = junctionNode({ x: 550, y: 350 });
  const rl = compNode('R_L', 'resistor', d.R_L, { x: 750, y: 150 });
  const rleak = compNode('R_leak', 'resistor', d.R_leak, { x: 950, y: 150 });
  const rp = compNode('R_p', 'resistor', d.R_p, { x: 750, y: 550 });
  const jg = junctionNode({ x: 950, y: 400 });
  const gnd = compNode('GND', 'ground', 0, { x: 950, y: 650 });
  
  const edges = [
    wire(i1.id, 'right', rs.id, 'left', 0),
    wire(rs.id, 'right', jb.id, 'left', 1),
    wire(jb.id, 'top', rl.id, 'left', 2),
    wire(jb.id, 'bottom', rp.id, 'left', 3),
    wire(rl.id, 'right', rleak.id, 'left', 4),
    wire(rleak.id, 'right', jg.id, 'top', 5),
    wire(rp.id, 'right', jg.id, 'bottom', 6),
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
  // Long series loop with proper spacing
  // Grid: x: 100, 250, 400, 550, 700, 850, 1000, 1150; y: 300, 500
  const d = dv('kvl_series_loop_ABCDEF');
  const s = src('kvl_series_loop_ABCDEF');
  const y = 300;
  
  const rfa = compNode('R_FA', 'resistor', d.R_FA, { x: 100, y:200 });
  const rab = compNode('R_AB', 'resistor', d.R_AB, { x: 250, y:200 });
  const jB = junctionNode({ x: 400, y:230 });
  const rbc = compNode('R_BC', 'resistor', d.R_BC, { x: 550, y:200 });
  const vcd = compNode('V_CD', 'dc_source', s.V_CD, { x: 700, y:205 }, { rotation: 0 });
  const rde = compNode('R_DE', 'resistor', d.R_DE, { x: 850, y:200 });
  const vef = compNode('V_EF', 'dc_source', s.V_EF, { x: 1000, y:250 }, { rotation: 90 });
  const gnd = compNode('GND', 'ground', 0, { x: 400, y: 500 });
  
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

  // EXACT Figure 4 topology:
  // Middle rail junctions (left to right): [R1]—[V1]—[R2]—[V2]—[R4]—[I1]—[R5]
  // R3 parallel ABOVE, spanning from V1 junction to I1 junction (parallel to R2 and R4 series)
  // Bottom rail: return path
  // Ground tap added on the bottom rail junction — a plain junction node, never a source terminal.

  // Middle rail junction nodes (horizontal, left to right)
  const jR1 = junctionNode({ x: 120, y: 200 });         // After R1
  const jV1 = junctionNode({ x: 240, y: 200 });         // After V1, before R2
  const jV2 = junctionNode({ x: 440, y: 200 });         // After R2, before R4 (V2 connects here)
  const jI1 = junctionNode({ x: 600, y: 200 });         // After R4, before R5 (I1 connects here)
  const jR5 = junctionNode({ x: 720, y: 200 });         // After R5

  // Bottom rail junctions
  const jBotLeft = junctionNode({ x: 120, y: 400 });
  const jBotRight = junctionNode({ x: 600, y: 400 });

  // Top junctions for R3 parallel path
  const jTopV1 = junctionNode({ x: 240, y: 80 });       // Above V1 junction
  const jTopI1 = junctionNode({ x: 600, y: 80 });       // Above I1 junction

  // Horizontal components on middle rail
  const r2 = compNode('R2', 'resistor', d.R2, { x: 310, y: 160 }, { rotation: 0 });  // Between V1 and V2
  const r4 = compNode('R4', 'resistor', d.R4, { x: 470, y: 160 }, { rotation: 0 });  // Between V2 and I1

  // Top horizontal component - R3 parallel to (R2 + R4)
  const r3 = compNode('R3', 'resistor', d.R3, { x: 390, y: 40 }, { rotation: 0 });

  // Vertical components (rotation 90° for vertical orientation)
  const r1 = compNode('R1', 'resistor', d.R1, { x: 80, y: 290 }, { rotation: 90 });
  const v1 = compNode('V1', 'dc_source', s.V1, { x: 200, y: 290 }, { rotation: 90 });
  const v2 = compNode('V2', 'dc_source', s.V2, { x: 400, y: 290 }, { rotation: 90 });
  const i1 = compNode('I1', 'current_source', s.I1, { x: 560, y: 300 }, { rotation: 0 });
  const r5 = compNode('R5', 'resistor', d.R5, { x: 680, y: 290 }, { rotation: 90 });

  // Ground reference — REQUIRED for the solver, was missing entirely before.
  // Tapped on jBotLeft, a plain junction on the return rail (not a source terminal).
  const gnd = compNode('GND', 'ground', 0, { x: 120, y: 480 });

  const edges = [
    // Middle horizontal rail: jR1 — jV1 — R2 — jV2 — R4 — jI1 — jR5
    wire(jR1.id, 'right', jV1.id, 'left', 0),
    wire(jV1.id, 'right', r2.id, 'left', 1),
    wire(r2.id, 'right', jV2.id, 'left', 2),
    wire(jV2.id, 'right', r4.id, 'left', 3),
    wire(r4.id, 'right', jI1.id, 'left', 4),
    wire(jI1.id, 'right', jR5.id, 'left', 5),

    // Top parallel path: jV1 up to jTopV1 — R3 — jTopI1 — down to jI1
    wire(jV1.id, 'top', jTopV1.id, 'bottom', 6),
    wire(jTopV1.id, 'right', r3.id, 'left', 7),
    wire(r3.id, 'right', jTopI1.id, 'left', 8),
    wire(jTopI1.id, 'bottom', jI1.id, 'top', 9),

    // Vertical branch 1: R1 (far left)
    wire(jR1.id, 'bottom', r1.id, 'left', 10),
    wire(r1.id, 'right', jBotLeft.id, 'top', 11),

    // Vertical branch 2: V1 (10V, between R1 and R2)
    wire(jV1.id, 'bottom', v1.id, 'left', 12),
    wire(v1.id, 'right', jBotLeft.id, 'right', 13),

    // Vertical branch 3: V2 (15V, between R2 and R4)
    wire(jV2.id, 'bottom', v2.id, 'left', 14),
    wire(v2.id, 'right', jBotLeft.id, 'right', 15),

    // Vertical branch 4: I1 (5A, between R4 and R5)
    wire(jI1.id, 'bottom', i1.id, 'left', 16),
    wire(i1.id, 'right', jBotRight.id, 'top', 17),

    // Vertical branch 5: R5 (far right with 20V)
    wire(jR5.id, 'bottom', r5.id, 'left', 18),
    wire(r5.id, 'right', jBotRight.id, 'right', 19),

    // Bottom rail: jBotLeft — jBotRight
    wire(jBotLeft.id, 'right', jBotRight.id, 'left', 20),

    // Ground reference tap
    wire(gnd.id, 'top', jBotLeft.id, 'bottom', 21),
  ];

  return {
    nodes: [r1, r2, r3, r4, r5, v1, v2, i1, gnd,
            jR1, jV1, jV2, jI1, jR5,
            jTopV1, jTopI1, jBotLeft, jBotRight],
    edges,
    counters: countCounters([r1, r2, r3, r4, r5, v1, v2, i1]),
  };
}

function buildTwoRoomLighting() {
  // Two-room lighting circuit with independent switches
  // Parallel branches: V1 → junction → [ SW1→L1 | SW2→L2 ] → junction → V1
  // Each switch controls its own bulb independently
  const y = 250;
  const v1 = compNode('V1', 'dc_source', 120, { x: 100, y },{ rotation: 90 });
  const j1 = junctionNode({ x: 300, y });
  
  // Branch 1: SW1 → L1 (top)
  const sw1 = compNode('SW1', 'switch', 0, { x: 500, y: 100 }, { state: 'open' });
  const l1 = compNode('L1', 'bulb', 240, { x: 700, y: 100 });
  
  // Branch 2: SW2 → L2 (bottom)
  const sw2 = compNode('SW2', 'switch', 0, { x: 500, y: 400 }, { state: 'open' });
  const l2 = compNode('L2', 'bulb', 240, { x: 700, y: 400 });
  
  const j2 = junctionNode({ x: 900, y });
  const gnd = compNode('GND', 'ground', 0, { x: 300, y: 500 });

  const edges = [
    // V1 → j1
    wire(v1.id, 'right', j1.id, 'left', 0),
    // j1 splits to both branches
    wire(j1.id, 'top', sw1.id, 'left', 1),
    wire(j1.id, 'bottom', sw2.id, 'left', 2),
    // Branch 1: SW1 → L1 → j2
    wire(sw1.id, 'right', l1.id, 'left', 3),
    wire(l1.id, 'right', j2.id, 'top', 4),
    // Branch 2: SW2 → L2 → j2
    wire(sw2.id, 'right', l2.id, 'left', 5),
    wire(l2.id, 'right', j2.id, 'bottom', 6),
    // j2 → V1 return
    wire(j2.id, 'left', v1.id, 'left', 7),
    // Ground reference
    wire(gnd.id, 'top', j1.id, 'bottom', 8),
  ];

  return { nodes: [v1, sw1, l1, sw2, l2, j1, j2, gnd], edges, counters: countCounters([v1, sw1, l1, sw2, l2]) };
}

function buildMultiMeshCircuit() {
  const d = dv('nilsson_ex2_8_multi_source');
  const s = src('nilsson_ex2_8_multi_source');

  // Circuit topology (matches the reference diagram):
  // - 24V source (V1) on left, vertical
  // - R1 (2Ω) across the top, horizontal
  // - R4 (5Ω) on the right, vertical
  // - Three PARALLEL paths bridge NodeA (jMidLeft/jBotLeft) <-> NodeB (jMidRight/jBotRight):
  //     1) R2 (3Ω) directly
  //     2) I1 (6A) directly
  //     3) R3 (4Ω) in series with R5 (7Ω), tapped by a Ground reference at their midpoint
  //   (NodeA/jMidLeft/jBotLeft are the same electrical node — plain wire, no component
  //    between them — likewise NodeB/jMidRight/jBotRight.)

  // Four corner junctions for clean rectangular topology
  const jTopLeft = junctionNode({ x: 150, y: 100 });
  const jTopRight = junctionNode({ x: 600, y: 100 });
  const jBotLeft = junctionNode({ x: 150, y: 380 });
  const jBotRight = junctionNode({ x: 600, y: 380 });

  // Center junctions for middle horizontal path
  const jMidLeft = junctionNode({ x: 150, y: 280 });
  const jMidRight = junctionNode({ x: 600, y: 280 });

  // Ground junction sits between R3 and R5 on the bottom series path —
  // a plain junction node, never a source terminal.
  const jGround = junctionNode({ x: 375, y: 420 });

  // Ground reference component — was missing entirely; required for the solver
  // to have a defined 0V node, same convention used by every other builder here.
  const gnd = compNode('GND', 'ground', 0, { x: 375, y: 480 });

  // Left side: 24V source (vertical)
  const v1 = compNode('V1', 'dc_source', s.V1, { x: 110, y: 170 }, { rotation: 90 });

  // Top: 2Ω resistor (horizontal) - dataset R1
  const r1 = compNode('R1', 'resistor', d.R1, { x: 360, y: 70 }, { rotation: 0 });

  // Upper middle: 3Ω resistor (horizontal), parallel with I1 - dataset R2
  const r2 = compNode('R2', 'resistor', d.R2, { x: 360, y: 240 }, { rotation: 0 });

  // Bottom left: 4Ω resistor (horizontal), in series with R5 via Ground - dataset R3
  const r3 = compNode('R3', 'resistor', d.R3, { x: 240, y: 380 }, { rotation: 0 });

  // Bottom right: 7Ω resistor (horizontal), in series with R3 via Ground - dataset R5
  const r5label = compNode('R5', 'resistor', d.R5, { x: 480, y: 380 }, { rotation: 0 });

  // Right side: 5Ω resistor (vertical) - dataset R4
  const r4 = compNode('R4', 'resistor', d.R4, { x: 555, y: 160 }, { rotation: 90 });

  // 6A current source: vertical, parallel to R2 (bridges NodeA <-> NodeB directly).
  const i1 = compNode('I1', 'current_source', s.I1, { x: 375, y: 310 }, { rotation: 90 });

  const edges = [
    // Left vertical: jTopLeft — V1 (24V) — jMidLeft — jBotLeft
    wire(jTopLeft.id, 'bottom', v1.id, 'left', 0),
    wire(v1.id, 'right', jMidLeft.id, 'top', 1),
    wire(jMidLeft.id, 'bottom', jBotLeft.id, 'top', 2),

    // Top horizontal: jTopLeft — R1 (2Ω) — jTopRight
    wire(jTopLeft.id, 'right', r1.id, 'left', 3),
    wire(r1.id, 'right', jTopRight.id, 'left', 4),

    // Middle horizontal: jMidLeft — R2 (3Ω) — jMidRight  (parallel path #1)
    wire(jMidLeft.id, 'right', r2.id, 'left', 5),
    wire(r2.id, 'right', jMidRight.id, 'left', 6),

    // Bottom horizontal series path: jBotLeft — R3 (4Ω) — jGround — R5 (7Ω) — jBotRight  (parallel path #2)
    wire(jBotLeft.id, 'right', r3.id, 'left', 7),
    wire(r3.id, 'right', jGround.id, 'left', 8),
    wire(jGround.id, 'right', r5label.id, 'left', 9),
    wire(r5label.id, 'right', jBotRight.id, 'left', 10),

    // Ground reference tap at the R3/R5 midpoint
    wire(jGround.id, 'bottom', gnd.id, 'top', 11),

    // Right vertical: jTopRight — R4 (5Ω) — jMidRight — jBotRight
    wire(jTopRight.id, 'bottom', r4.id, 'left', 12),
    wire(r4.id, 'right', jMidRight.id, 'top', 13),
    wire(jMidRight.id, 'bottom', jBotRight.id, 'top', 14),

    // I1 (6A): jBotLeft — jBotRight, parallel to R2 (parallel path #3)
    wire(jBotLeft.id, 'bottom', i1.id, 'left', 15),
    wire(i1.id, 'right', jBotRight.id, 'bottom', 16),
  ];

  return {
    nodes: [v1, r1, r2, r3, r4, r5label, i1, gnd,
            jTopLeft, jTopRight, jMidLeft, jMidRight, jBotLeft, jBotRight, jGround],
    edges,
    counters: countCounters([v1, r1, r2, r3, r4, r5label, i1]),
  };
}
const BUILDERS = {
  beginner_switch_bulb: buildBeginnerSwitchBulb,
  beginner_two_resistors: buildBeginnerTwoResistors,
  beginner_resistor_bulb: buildBeginnerResistorBulb,
  beginner_parallel_resistors: buildBeginnerParallelTwoResistors,
  two_room_lighting: buildTwoRoomLighting,
  series_parallel_R1R2R3R4: buildSeriesParallelR1R2R3R4,
  voltage_divider_12k_9k: buildVoltageDivider12k9k,
  current_source_single_R: buildCurrentSourceSingleR,
  vdr_parallel_network: buildVdrParallelNetwork,
  current_source_voltage_divider: buildCurrentSourceVoltageDivider,
  current_source_t_network: buildCurrentSourceTNetwork,
  kvl_series_loop_ABCDEF: buildKvlSeriesLoop,
  multisource_5R_network: buildMultisource5RNetwork,
  nilsson_ex2_8_multi_source: buildMultiMeshCircuit,
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