/**
 * Education simulator lesson catalog — Beginner, Intermediate, Advanced tiers.
 */

export const MODULES = [
  {
    id: 'beginner',
    title: 'Beginner',
    tier: 'beginner',
    description: 'Simple 1–3 component circuits with round, hand-verifiable values.',
  },
  {
    id: 'intermediate',
    title: 'Intermediate',
    tier: 'intermediate',
    description: 'Textbook-aligned dataset circuits with real nominal component values.',
  },
  {
    id: 'advanced',
    title: 'Advanced',
    tier: 'advanced',
    description: 'Coming soon — complex multi-source and bridge networks.',
    comingSoon: true,
  },
];

export const LESSONS = [
  // ── Beginner tier ─────────────────────────────────────────────────────────
  {
    id: 'b-lab-1-switch-bulb',
    moduleId: 'beginner',
    title: 'Lab 1: Switch & Bulb',
    subtitle: '10 V source, open switch stops current',
    circuitKey: 'beginner_switch_bulb',
    difficulty: 'Beginner',
    durationMin: 5,
    datasetCircuitId: null,
    objectives: ['Build a series circuit', 'See how a switch controls bulb brightness'],
    steps: [
      { type: 'observe', text: '10 V battery → 100 Ω bulb → switch. The switch starts open.' },
      { type: 'action', text: 'Close the switch, then run the simulation.' },
      {
        type: 'predict', question: 'With the switch closed, is the bulb bright or off?',
        inputType: 'choice', choices: ['Bright', 'Dim', 'Off'], expected: 'Bright',
        hint: 'A closed switch completes the loop.',
      },
      { type: 'verify', text: 'Re-open the switch and simulate — the bulb should turn off.' },
    ],
    challenge: null,
  },
  {
    id: 'b-lab-2-two-resistors',
    moduleId: 'beginner',
    title: 'Lab 2: Two Resistors in Series',
    subtitle: '10 V, 1 kΩ + 2 kΩ',
    circuitKey: 'beginner_two_resistors',
    difficulty: 'Beginner',
    durationMin: 6,
    datasetCircuitId: null,
    objectives: ['Apply Ohm\'s law in series', 'Compute voltage across R2'],
    steps: [
      { type: 'observe', text: '10 V source with R1 = 1 kΩ and R2 = 2 kΩ in series.' },
      {
        type: 'predict', question: 'Voltage across R2 (V)?', inputType: 'number',
        expected: 6.67, tolerancePct: 3, hint: 'V_R2 = Vs × R2 / (R1 + R2)',
      },
      { type: 'action', text: 'Run the simulation and read the voltage drop on R2.' },
      { type: 'verify', text: 'Expected ≈ 6.67 V across R2.' },
    ],
    challenge: null,
  },
  {
    id: 'b-lab-3-resistor-bulb',
    moduleId: 'beginner',
    title: 'Lab 3: Resistor & Bulb',
    subtitle: 'Current limiting with a series resistor',
    circuitKey: 'beginner_resistor_bulb',
    difficulty: 'Beginner',
    durationMin: 6,
    datasetCircuitId: null,
    objectives: ['Limit current with a resistor', 'Observe bulb brightness'],
    steps: [
      { type: 'observe', text: '10 V → 1 kΩ resistor → 100 Ω bulb in series.' },
      {
        type: 'predict', question: 'Circuit current (mA)?', inputType: 'number',
        expected: 9.09, tolerancePct: 5, hint: 'I = Vs / (R1 + R_bulb)',
      },
      { type: 'action', text: 'Simulate and check current through the bulb.' },
      { type: 'verify', text: 'Expected current ≈ 9.1 mA.' },
    ],
    challenge: null,
  },
  {
    id: 'b-lab-4-parallel',
    moduleId: 'beginner',
    title: 'Lab 4: Parallel Resistors',
    subtitle: '1 kΩ ∥ 2 kΩ on 10 V',
    circuitKey: 'beginner_parallel_resistors',
    difficulty: 'Beginner',
    durationMin: 8,
    datasetCircuitId: null,
    objectives: ['Find equivalent parallel resistance', 'Compute node voltage from current source'],
    steps: [
      { type: 'observe', text: 'I1 = 10 mA with R1 = 1 kΩ and R2 = 2 kΩ in parallel.' },
      {
        type: 'predict', question: 'Node voltage (V)?', inputType: 'number',
        expected: 6.67, tolerancePct: 3, hint: 'V = I × (R1‖R2) = 0.01 × 667',
      },
      { type: 'action', text: 'Simulate and read the parallel node voltage.' },
      { type: 'verify', text: 'Expected voltage ≈ 6.67 V.' },
    ],
    challenge: null,
  },

  // ── Intermediate tier (dataset circuits) ──────────────────────────────────
  {
    id: 'i-lab-1-divider-12k',
    moduleId: 'intermediate',
    title: 'Voltage Divider (12 kΩ / 9 kΩ)',
    subtitle: 'Dataset: voltage_divider_12k_9k',
    circuitKey: 'voltage_divider_12k_9k',
    difficulty: 'Intermediate',
    durationMin: 10,
    datasetCircuitId: 'voltage_divider_12k_9k',
    objectives: ['Apply divider formula with dataset values', 'Verify vo from simulation'],
    steps: [
      { type: 'observe', text: 'Vs = 7 V, R1 = 12 kΩ, R2 = 9 kΩ (dataset design_values).' },
      {
        type: 'predict', question: 'Output voltage vo across R2 (V)?', inputType: 'number',
        expected: 3, tolerancePct: 3, hint: 'vo = 7 × 9000 / (12000 + 9000)',
      },
      { type: 'action', text: 'Simulate and compare to your prediction.' },
      { type: 'verify', text: 'Dataset normal row: vo ≈ 2.99 V.' },
    ],
  },
  {
    id: 'i-lab-2-series-parallel',
    moduleId: 'intermediate',
    title: 'Series-Parallel Network',
    subtitle: 'Dataset: series_parallel_R1R2R3R4',
    circuitKey: 'series_parallel_R1R2R3R4',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'series_parallel_R1R2R3R4',
    objectives: ['Reduce series-parallel networks', 'Read branch currents from simulation'],
    steps: [
      { type: 'observe', text: 'Vin = 10 V. R1=1 kΩ series; R2 ∥ (R3+R4) with R2=2 kΩ, R3=3 kΩ, R4=1.5 kΩ.' },
      {
        type: 'predict', question: 'Current through R1 (mA)?', inputType: 'number',
        expected: 2.74, tolerancePct: 8, hint: 'Find Req, then I = Vin/Req.',
      },
      { type: 'action', text: 'Simulate and inspect R1 current.' },
      { type: 'verify', text: 'Dataset normal row: I_R1 ≈ 2.74 mA.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Source current dropped sharply — find the opened branch element.',
      answer: { component: 'R1', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2', 'R3', 'R4'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-3-current-single-r',
    moduleId: 'intermediate',
    title: 'Current Source & Single Resistor',
    subtitle: 'Dataset: current_source_single_R',
    circuitKey: 'current_source_single_R',
    difficulty: 'Intermediate',
    durationMin: 10,
    datasetCircuitId: 'current_source_single_R',
    objectives: ['Relate I, R, and V for a current source load', 'Use dataset Rx = 416.67 Ω'],
    steps: [
      { type: 'observe', text: 'I1 = 12 mA in parallel with Rx = 416.67 Ω (dataset nominal).' },
      {
        type: 'predict', question: 'Voltage at node p (V)?', inputType: 'number',
        expected: 5, tolerancePct: 5, hint: 'V = I × R',
      },
      { type: 'action', text: 'Simulate and read voltage across Rx.' },
      { type: 'verify', text: 'Dataset normal row: Vp ≈ 4.95 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltage is much higher than expected — the load resistance changed.',
      answer: { component: 'Rx', faultType: 'partial_open' },
      choices: {
        components: ['Rx'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-4-vdr-parallel',
    moduleId: 'intermediate',
    title: 'Parallel Network (VDR)',
    subtitle: 'Dataset: vdr_parallel_network',
    circuitKey: 'vdr_parallel_network',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'vdr_parallel_network',
    objectives: ['Analyze parallel branches with a current source', 'Find node voltage T'],
    steps: [
      { type: 'observe', text: 'I1 = 12 mA feeds R1=6 kΩ, R2=12 kΩ, R3=12 kΩ in parallel.' },
      {
        type: 'predict', question: 'Node voltage T (V)?', inputType: 'number',
        expected: 36, tolerancePct: 5, hint: 'V = I × (R1‖R2‖R3)',
      },
      { type: 'action', text: 'Simulate and read node T voltage.' },
      { type: 'verify', text: 'Dataset normal row: V_T ≈ 35.9 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node T voltage rose — one parallel branch partially opened.',
      answer: { component: 'R3', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2', 'R3'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-5-cs-divider',
    moduleId: 'intermediate',
    title: 'Current-Source Voltage Divider',
    subtitle: 'Dataset: current_source_voltage_divider',
    circuitKey: 'current_source_voltage_divider',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'current_source_voltage_divider',
    objectives: ['Apply current division to parallel resistors', 'Compute V_out'],
    steps: [
      { type: 'observe', text: 'I1 = 10 mA, R1 = 1 kΩ ∥ R2 = 2 kΩ (dataset design_values).' },
      {
        type: 'predict', question: 'Output voltage V_out (V)?', inputType: 'number',
        expected: 6.67, tolerancePct: 5, hint: 'V = I × (R1‖R2)',
      },
      { type: 'action', text: 'Simulate and read voltage at the output node.' },
      { type: 'verify', text: 'Dataset normal row: V_out ≈ 6.75 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Output voltage dropped — a branch resistor partially opened.',
      answer: { component: 'R2', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-6-t-network',
    moduleId: 'intermediate',
    title: 'Current-Source T-Network',
    subtitle: 'Dataset: current_source_t_network',
    circuitKey: 'current_source_t_network',
    difficulty: 'Intermediate',
    durationMin: 14,
    datasetCircuitId: 'current_source_t_network',
    objectives: ['Analyze a T-network fed by a current source', 'Read node b voltage'],
    steps: [
      { type: 'observe', text: 'I1 = 5 mA, R_s=500 Ω, R_p=1 kΩ shunt, R_L=1.5 kΩ load (dataset values).' },
      {
        type: 'predict', question: 'Voltage at node b (V)?', inputType: 'number',
        expected: 5.01, tolerancePct: 5, hint: 'Solve the T-network with nodal analysis.',
      },
      { type: 'action', text: 'Simulate and inspect node b voltage.' },
      { type: 'verify', text: 'Dataset normal row: V_b ≈ 5.01 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_short',
      symptom: 'Shunt branch current increased — find the partially shorted resistor.',
      answer: { component: 'R_p', faultType: 'partial_short' },
      choices: {
        components: ['R_s', 'R_p', 'R_L', 'R_leak'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-7-kvl-loop',
    moduleId: 'intermediate',
    title: 'KVL Series Loop',
    subtitle: 'Dataset: kvl_series_loop_ABCDEF',
    circuitKey: 'kvl_series_loop_ABCDEF',
    difficulty: 'Intermediate',
    durationMin: 14,
    datasetCircuitId: 'kvl_series_loop_ABCDEF',
    objectives: ['Apply KVL around a multi-source loop', 'Verify node B voltage'],
    steps: [
      { type: 'observe', text: 'Series loop: R_FA, R_AB, R_BC, V_CD=24 V, R_DE, V_EF=6 V (dataset values).' },
      {
        type: 'predict', question: 'Node B voltage (V)?', inputType: 'number',
        expected: 14.03, tolerancePct: 5, hint: 'Write KVL around the closed loop.',
      },
      { type: 'action', text: 'Simulate and read node B voltage.' },
      { type: 'verify', text: 'Dataset normal row: V_B ≈ 14.03 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Loop current collapsed — a series resistor partially opened.',
      answer: { component: 'R_AB', faultType: 'partial_open' },
      choices: {
        components: ['R_FA', 'R_AB', 'R_BC', 'R_DE'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-8-multisource-5r',
    moduleId: 'intermediate',
    title: 'Multi-Source 5R Network',
    subtitle: 'Dataset: multisource_5R_network',
    circuitKey: 'multisource_5R_network',
    difficulty: 'Intermediate',
    durationMin: 15,
    datasetCircuitId: 'multisource_5R_network',
    objectives: ['Analyze a network with two voltage sources and a current source', 'Inspect node C voltage'],
    steps: [
      { type: 'observe', text: 'V1=10 V, V2=15 V, I1=5 A with five resistors (dataset design_values).' },
      {
        type: 'predict', question: 'Node C voltage (V)?', inputType: 'number',
        expected: 2600, tolerancePct: 5, hint: 'Use nodal analysis at nodes A, B, C.',
      },
      { type: 'action', text: 'Simulate and read node C voltage.' },
      { type: 'verify', text: 'Dataset normal row: V_C ≈ 2600 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltages shifted — a branch resistor partially opened.',
      answer: { component: 'R2', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2', 'R3', 'R4', 'R5'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
  {
    id: 'i-lab-9-multimesh',
    moduleId: 'intermediate',
    title: 'MultiMesh Circuit',
    subtitle: 'Dataset: nilsson_ex2_8_multi_source',
    circuitKey: 'nilsson_ex2_8_multi_source',
    difficulty: 'Intermediate',
    durationMin: 15,
    datasetCircuitId: 'nilsson_ex2_8_multi_source',
    objectives: ['Analyze multi-mesh network with voltage and current sources', 'Apply mesh current method'],
    steps: [
      { type: 'observe', text: 'V1=24 V, I1=6 A, five resistors (dataset design_values).' },
      {
        type: 'predict', question: 'Node c voltage (V)?', inputType: 'number',
        expected: 26.31, tolerancePct: 5, hint: 'Apply nodal or mesh analysis.',
      },
      { type: 'action', text: 'Simulate and read node c voltage.' },
      { type: 'verify', text: 'Dataset normal row: V_c ≈ 26.31 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltages do not match the textbook solution.',
      answer: { component: 'R4', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2', 'R3', 'R4', 'R5'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open' },
          { id: 'partial_short', label: 'Partial Short' },
        ],
      },
    },
  },
];

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) ?? null;
}

export function getLessonsByModule(moduleId) {
  return LESSONS.filter((l) => l.moduleId === moduleId);
}
