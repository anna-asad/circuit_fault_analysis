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
  {
    id: 'b-lab-5-two-room-lighting',
    moduleId: 'beginner',
    title: 'Lab 5: Two-Room Lighting',
    subtitle: 'Independent switches control separate bulbs in parallel',
    circuitKey: 'two_room_lighting',
    difficulty: 'Beginner',
    durationMin: 10,
    datasetCircuitId: null,
    objectives: ['Understand parallel branch independence', 'Control loads with switches', 'Observe bulb brightness changes'],
    steps: [
      { type: 'observe', text: '120 V source powers two parallel branches. Each branch has a switch (SW1 or SW2) and a bulb (L1 or L2).' },
      { type: 'action', text: 'Both switches start open. Click SW1 to close it, then run the simulation.' },
      {
        type: 'predict', question: 'With only SW1 closed, which bulb lights up?',
        inputType: 'choice', choices: ['L1 only', 'L2 only', 'Both bulbs', 'Neither bulb'], expected: 'L1 only',
        hint: 'Each switch controls only its own branch. SW2 is still open.',
      },
      { type: 'action', text: 'Now close SW2 as well (both switches closed), then simulate again.' },
      {
        type: 'predict', question: 'With both switches closed, what happens?',
        inputType: 'choice', choices: ['L1 only', 'L2 only', 'Both bulbs', 'Neither bulb'], expected: 'Both bulbs',
        hint: 'Parallel branches work independently — each closed switch completes its own loop.',
      },
      { type: 'verify', text: 'Open SW1 and leave SW2 closed. Only L2 should light up now.' },
    ],
    challenge: null,
  },

  // ── Intermediate tier (dataset circuits) ──────────────────────────────────
  {
    id: 'i-lab-1-divider-12k',
    moduleId: 'intermediate',
    title: 'Voltage Divider (12 kΩ / 9 kΩ)',
    subtitle: '7 V source with two resistors in series',
    circuitKey: 'voltage_divider_12k_9k',
    difficulty: 'Intermediate',
    durationMin: 10,
    datasetCircuitId: 'voltage_divider_12k_9k',
    objectives: ['Apply divider formula with dataset values', 'Verify vo from simulation'],
    steps: [
      { type: 'observe', text: 'The circuit has a 7 V source (Vs) with R1 = 12 kΩ and R2 = 9 kΩ from the dataset.' },
      {
        type: 'predict', question: 'What is the output voltage vo across R2?', inputType: 'number',
        expected: 3, tolerancePct: 3, hint: 'Use the voltage divider formula: vo = Vs × R2 / (R1 + R2)',
      },
      { type: 'action', text: 'Run the simulation and compare the result to your prediction.' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 2.99 V.' },
    ],
  },
  {
    id: 'i-lab-2-series-parallel',
    moduleId: 'intermediate',
    title: 'Series-Parallel Network',
    subtitle: 'Four resistors with series and parallel combinations',
    circuitKey: 'series_parallel_R1R2R3R4',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'series_parallel_R1R2R3R4',
    objectives: ['Reduce series-parallel networks', 'Read branch currents from simulation'],
    steps: [
      { type: 'observe', text: 'The circuit has Vin = 10 V. R1 = 1 kΩ is in series, then R2 = 2 kΩ is in parallel with (R3 = 3 kΩ + R4 = 1.5 kΩ).' },
      {
        type: 'predict', question: 'What is the current through R1 in milliamps?', inputType: 'number',
        expected: 2.74, tolerancePct: 8, hint: 'First find the equivalent resistance (Req), then use I = Vin / Req.',
      },
      { type: 'action', text: 'Run the simulation and check the current through R1.' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 2.74 mA.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Source current dropped sharply — find the opened branch element.',
      answer: { 
        component: 'R1', 
        faultType: 'partial_open',
        correctValue: '1 kΩ',
        faultyValue: '33.03 kΩ'
      },
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
    subtitle: '12 mA current source with load resistor',
    circuitKey: 'current_source_single_R',
    difficulty: 'Intermediate',
    durationMin: 10,
    datasetCircuitId: 'current_source_single_R',
    objectives: ['Relate I, R, and V for a current source load', 'Use dataset Rx = 416.67 Ω'],
    steps: [
      { type: 'observe', text: 'The circuit has a current source I1 = 12 mA in parallel with a resistor Rx = 416.67 Ω.' },
      {
        type: 'predict', question: 'What is the voltage at node p? (Node p is where the current source and Rx connect)', inputType: 'number',
        expected: 5, tolerancePct: 5, hint: 'Use Ohm\'s law: V = I × R',
      },
      { type: 'action', text: 'Run the simulation and read the voltage across Rx (at node p).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 4.95 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltage is much higher than expected — the load resistance changed.',
      answer: { 
        component: 'Rx', 
        faultType: 'partial_open',
        correctValue: '416.67 Ω',
        faultyValue: 'significantly higher'
      },
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
    subtitle: 'Three resistors in parallel with current source',
    circuitKey: 'vdr_parallel_network',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'vdr_parallel_network',
    objectives: ['Analyze parallel branches with a current source', 'Find node voltage T'],
    steps: [
      { type: 'observe', text: 'A current source I1 = 12 mA feeds three resistors in parallel: R1 = 6 kΩ, R2 = 12 kΩ, and R3 = 12 kΩ.' },
      {
        type: 'predict', question: 'What is the voltage at node T? (Node T is where all three resistors meet)', inputType: 'number',
        expected: 36, tolerancePct: 5, hint: 'Find the parallel equivalent resistance, then use V = I × (R1‖R2‖R3)',
      },
      { type: 'action', text: 'Run the simulation and read the voltage at node T (labeled on the circuit).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 35.9 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node T voltage rose — one parallel branch partially opened.',
      answer: { 
        component: 'R3', 
        faultType: 'partial_open',
        correctValue: '12 kΩ',
        faultyValue: 'significantly higher'
      },
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
    subtitle: '10 mA source with parallel resistor network',
    circuitKey: 'current_source_voltage_divider',
    difficulty: 'Intermediate',
    durationMin: 12,
    datasetCircuitId: 'current_source_voltage_divider',
    objectives: ['Apply current division to parallel resistors', 'Compute V_out'],
    steps: [
      { type: 'observe', text: 'The circuit has a current source I1 = 10 mA with R1 = 1 kΩ and R2 = 2 kΩ in parallel.' },
      {
        type: 'predict', question: 'What is the output voltage V_out?', inputType: 'number',
        expected: 6.67, tolerancePct: 5, hint: 'Find the parallel equivalent resistance, then use V = I × (R1‖R2)',
      },
      { type: 'action', text: 'Run the simulation and read the voltage at the output node.' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 6.75 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Output voltage dropped — a branch resistor partially opened.',
      answer: { 
        component: 'R2', 
        faultType: 'partial_open',
        correctValue: '2 kΩ',
        faultyValue: 'significantly higher'
      },
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
    subtitle: 'T-network topology with series and shunt resistors',
    circuitKey: 'current_source_t_network',
    difficulty: 'Intermediate',
    durationMin: 14,
    datasetCircuitId: 'current_source_t_network',
    objectives: ['Analyze a T-network fed by a current source', 'Read node b voltage'],
    steps: [
      { type: 'observe', text: 'The circuit has I1 = 5 mA, with R_s = 500 Ω (series), R_p = 1 kΩ (shunt), and R_L = 1.5 kΩ (load) forming a T-network.' },
      {
        type: 'predict', question: 'What is the voltage at node b? (Node b is at the junction after R_s)', inputType: 'number',
        expected: 5.01, tolerancePct: 5, hint: 'Use nodal analysis to solve the T-network.',
      },
      { type: 'action', text: 'Run the simulation and check the voltage at node b (labeled on the circuit).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 5.01 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_short',
      symptom: 'Shunt branch current increased — find the partially shorted resistor.',
      answer: { 
        component: 'R_p', 
        faultType: 'partial_short',
        correctValue: '1 kΩ',
        faultyValue: '112.53 Ω'
      },
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
    subtitle: 'Multi-resistor loop with two voltage sources',
    circuitKey: 'kvl_series_loop_ABCDEF',
    difficulty: 'Intermediate',
    durationMin: 14,
    datasetCircuitId: 'kvl_series_loop_ABCDEF',
    objectives: ['Apply KVL around a multi-source loop', 'Verify node B voltage'],
    steps: [
      { type: 'observe', text: 'This series loop has resistors R_FA, R_AB, R_BC, R_DE and two voltage sources: V_CD = 24 V and V_EF = 6 V.' },
      {
        type: 'predict', question: 'What is the voltage at node B? (Node B is between R_AB and R_BC)', inputType: 'number',
        expected: 14.03, tolerancePct: 5, hint: 'Apply Kirchhoff\'s Voltage Law (KVL) around the closed loop.',
      },
      { type: 'action', text: 'Run the simulation and read the voltage at node B (labeled on the circuit).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 14.03 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Loop current collapsed — a series resistor partially opened.',
      answer: { 
        component: 'R_AB', 
        faultType: 'partial_open',
        correctValue: 'design value',
        faultyValue: 'significantly higher'
      },
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
    subtitle: 'Complex network with multiple sources and parallel paths',
    circuitKey: 'multisource_5R_network',
    difficulty: 'Intermediate',
    durationMin: 15,
    datasetCircuitId: 'multisource_5R_network',
    objectives: ['Analyze a network with two voltage sources and a current source', 'Inspect node C voltage'],
    steps: [
      { type: 'observe', text: 'This network has two voltage sources (V1 = 10 V, V2 = 15 V), one current source (I1 = 5 A), and five resistors.' },
      {
        type: 'predict', question: 'What is the voltage at node C? (Node C is the junction where I1, R4, and R5 meet)', inputType: 'number',
        expected: 2600, tolerancePct: 5, hint: 'Apply nodal analysis at nodes A, B, and C to solve the circuit.',
      },
      { type: 'action', text: 'Run the simulation and read the voltage at node C (the junction between R4, I1, and R5).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 2600 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltages shifted — a branch resistor partially opened.',
      answer: { 
        component: 'R2', 
        faultType: 'partial_open',
        correctValue: '2 kΩ',
        faultyValue: '90.8 kΩ'
      },
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
    title: 'Multi-Mesh Circuit',
    subtitle: 'Advanced mesh analysis with voltage and current sources',
    circuitKey: 'nilsson_ex2_8_multi_source',
    difficulty: 'Intermediate',
    durationMin: 15,
    datasetCircuitId: 'nilsson_ex2_8_multi_source',
    objectives: ['Analyze multi-mesh network with voltage and current sources', 'Apply mesh current method'],
    steps: [
      { type: 'observe', text: 'This multi-mesh circuit has V1 = 24 V, I1 = 6 A, and five resistors from the dataset.' },
      {
        type: 'predict', question: 'What is the voltage at node c? (Node c is the right-side junction where R1, R2, R4, and I1 connect)', inputType: 'number',
        expected: 26.31, tolerancePct: 5, hint: 'Apply nodal analysis or mesh current method to solve the circuit.',
      },
      { type: 'action', text: 'Run the simulation and read the voltage at node c (the junction on the right side of the circuit).' },
      { type: 'verify', text: 'If you calculated correctly, you should see approximately 26.31 V.' },
    ],
    challenge: {
      mode: 'diagnose',
      datasetFault: 'partial_open',
      symptom: 'Node voltages do not match the textbook solution.',
      answer: { 
        component: 'R4', 
        faultType: 'partial_open',
        correctValue: '5 Ω',
        faultyValue: '237.80 Ω'
      },
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
