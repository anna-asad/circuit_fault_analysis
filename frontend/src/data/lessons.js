/**
 * Education simulator lesson catalog.
 * Each lesson references a preset circuit key and defines guided steps.
 */

export const MODULES = [
  {
    id: 'basics',
    title: 'Basics',
    description: 'Switches, bulbs, and simple DC circuits.',
  },
  {
    id: 'ch3-dividers',
    title: 'Ch.3 — Voltage Dividers',
    description: 'Nilsson textbook examples on divider circuits.',
  },
  {
    id: 'ch3-series-parallel',
    title: 'Ch.3 — Series & Parallel',
    description: 'Combining resistors and analyzing branch currents.',
  },
  {
    id: 'ch3-current',
    title: 'Ch.3 — Current Division',
    description: 'Parallel branches and current splitting.',
  },
  {
    id: 'fault-lab',
    title: 'Fault Lab',
    description: 'Diagnose hidden component faults like a detective.',
  },
];

export const LESSONS = [
  {
    id: 'lab-0-switch-bulb',
    moduleId: 'basics',
    title: 'Lab 0: Switch & Bulb',
    subtitle: 'See how an open switch stops current flow',
    circuitKey: 'switch_bulb',
    difficulty: 'Beginner',
    durationMin: 5,
    textbookRef: null,
    objectives: [
      'Understand series connections',
      'Observe bulb brightness with open vs closed switch',
    ],
    steps: [
      {
        type: 'observe',
        text: 'This is a simple series circuit: 5 V battery → bulb → switch → ground. The switch starts open.',
      },
      {
        type: 'action',
        text: 'Click the switch to close it, then run the simulation.',
      },
      {
        type: 'predict',
        question: 'With the switch closed, will the bulb be bright or off?',
        inputType: 'choice',
        choices: ['Bright', 'Dim', 'Off'],
        expected: 'Bright',
        hint: 'A closed switch completes the path — current can flow.',
      },
      {
        type: 'verify',
        text: 'Open the switch again and re-simulate. The bulb should turn off.',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-1-divider-basics',
    moduleId: 'basics',
    title: 'Lab 1: Voltage Divider Basics',
    subtitle: '12 kΩ / 9 kΩ divider with Vo = 3 V',
    circuitKey: 'voltage_divider_12k_9k',
    difficulty: 'Beginner',
    durationMin: 8,
    textbookRef: 'Custom intro lab',
    objectives: [
      'Apply the voltage divider formula',
      'Measure output voltage with a voltmeter',
    ],
    steps: [
      {
        type: 'observe',
        text: 'Vs = 7 V, R1 = 12 kΩ, R2 = 9 kΩ. Output vo is measured across R2.',
      },
      {
        type: 'predict',
        question: 'What is vo across R2 (V)?',
        inputType: 'number',
        expected: 3,
        tolerancePct: 5,
        hint: 'vo = Vs × R2 / (R1 + R2)',
      },
      {
        type: 'action',
        text: 'Run the simulation and check the voltage across R2 in the component panel.',
      },
      {
        type: 'explore',
        text: 'Double R1 in the value editor. Predict vo again before re-simulating.',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-2-nilsson-ex3-2',
    moduleId: 'ch3-dividers',
    title: 'Lab 2: Voltage Divider (Ex 3.2)',
    subtitle: 'Nilsson — 25 kΩ / 100 kΩ divider',
    circuitKey: 'nilsson_ex3_2_divider',
    difficulty: 'Intermediate',
    durationMin: 10,
    textbookRef: 'Nilsson Ex 3.2',
    objectives: [
      'Compute divider output for given resistor values',
      'Verify simulation matches hand calculation',
    ],
    steps: [
      {
        type: 'observe',
        text: 'Vs = 100 V, R1 = 25 kΩ, R2 = 100 kΩ. Find vo across R2.',
      },
      {
        type: 'predict',
        question: 'What is vo (V)?',
        inputType: 'number',
        expected: 80,
        tolerancePct: 2,
        hint: 'vo = Vs × R2 / (R1 + R2) = 100 × 100k / 125k',
      },
      {
        type: 'action',
        text: 'Run the simulation. Compare your prediction to the voltage across R2.',
      },
      {
        type: 'verify',
        text: 'Expected answer: 80 V. Did your simulation match?',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-3-nilsson-ex3-1',
    moduleId: 'ch3-series-parallel',
    title: 'Lab 3: Series-Parallel (Ex 3.1)',
    subtitle: 'Nilsson — branch current analysis',
    circuitKey: 'nilsson_ex3_1_series_parallel',
    difficulty: 'Intermediate',
    durationMin: 12,
    textbookRef: 'Nilsson Ex 3.1',
    objectives: [
      'Identify series and parallel branches',
      'Verify branch currents: i1 = 4 A, i2 = 8 A',
    ],
    steps: [
      {
        type: 'observe',
        text: 'Vin = 120 V. R1 = 4 Ω in series. R2 = 18 Ω parallels R3+R4 (3 Ω + 6 Ω).',
      },
      {
        type: 'predict',
        question: 'Total source current is (A)?',
        inputType: 'number',
        expected: 12,
        tolerancePct: 5,
        hint: 'Find equivalent resistance, then I = V / Req.',
      },
      {
        type: 'action',
        text: 'Simulate and inspect currents through R2 and R3.',
      },
      {
        type: 'verify',
        text: 'Book values: is = 12 A, i1 through R2 = 4 A, i2 through R3+R4 = 8 A.',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-4-nilsson-ex3-4',
    moduleId: 'ch3-current',
    title: 'Lab 4: Current Division (Ex 3.4)',
    subtitle: 'Nilsson — parallel branches with series sub-networks',
    circuitKey: 'nilsson_ex3_4_current_division',
    difficulty: 'Advanced',
    durationMin: 15,
    textbookRef: 'Nilsson Ex 3.4',
    objectives: [
      'Analyze current splitting in parallel branches',
      'Verify io through R7 = 2 A',
    ],
    steps: [
      {
        type: 'observe',
        text: 'I1 = 8 A feeds four parallel branches. R7 carries current io.',
      },
      {
        type: 'predict',
        question: 'Current io through R7 (A)?',
        inputType: 'number',
        expected: 2,
        tolerancePct: 5,
        hint: 'Find equivalent resistance of all branches, then apply current division.',
      },
      {
        type: 'action',
        text: 'Simulate and read the current through R7.',
      },
      {
        type: 'verify',
        text: 'Expected: io = 2 A, node voltage v(T) = 48 V.',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-5-meter-placement',
    moduleId: 'basics',
    title: 'Lab 5: Using Meters Correctly',
    subtitle: 'Ammeter in series, voltmeter in parallel',
    circuitKey: 'nilsson_ex3_2_divider',
    difficulty: 'Beginner',
    durationMin: 8,
    textbookRef: null,
    objectives: [
      'Wire an ammeter in series',
      'Wire a voltmeter in parallel',
    ],
    steps: [
      {
        type: 'observe',
        text: 'The voltage divider is loaded. You will add meters to measure current and voltage.',
      },
      {
        type: 'action',
        text: 'Drag an ammeter into the R2 branch (in series). Drag a voltmeter across R2 (in parallel).',
      },
      {
        type: 'action',
        text: 'Simulate. If meter placement is wrong, the simulator will explain why.',
      },
      {
        type: 'verify',
        text: 'Correct placement: ammeter breaks the series path; voltmeter connects across R2 only.',
      },
    ],
    challenge: null,
  },
  {
    id: 'lab-6-diagnose-drift',
    moduleId: 'fault-lab',
    title: 'Lab 6: Diagnose the Drift',
    subtitle: 'Find which resistor changed value',
    circuitKey: 'nilsson_assess3_2_divider',
    difficulty: 'Intermediate',
    durationMin: 12,
    textbookRef: 'Nilsson Assess 3.2 + fault scenario',
    objectives: [
      'Use simulation readings to locate a drifting component',
      'Distinguish partial open from normal operation',
    ],
    steps: [
      {
        type: 'observe',
        text: 'This divider used to output 150 V at no load. Something has changed — find the faulty component.',
      },
      {
        type: 'action',
        text: 'Simulate, inspect component values and voltage readings, then submit your diagnosis.',
      },
    ],
    challenge: {
      mode: 'diagnose',
      inject: { component: 'R2', faultType: 'partial_open', multiplier: 3 },
      symptom: 'Output voltage is higher than the expected 150 V.',
      answer: { component: 'R2', faultType: 'partial_open' },
      choices: {
        components: ['R1', 'R2'],
        faultTypes: [
          { id: 'partial_open', label: 'Partial Open (high resistance)' },
          { id: 'partial_short', label: 'Partial Short (low resistance)' },
          { id: 'normal', label: 'No fault' },
        ],
      },
    },
  },
  {
    id: 'lab-7-multi-source',
    moduleId: 'fault-lab',
    title: 'Lab 7: Multi-Source Mystery',
    subtitle: 'Nilsson Ex 2.8 with a hidden fault',
    circuitKey: 'nilsson_ex2_8_multi_source',
    difficulty: 'Advanced',
    durationMin: 15,
    textbookRef: 'Nilsson Ex 2.8',
    objectives: [
      'Analyze circuits with multiple sources',
      'Diagnose component drift in complex networks',
    ],
    steps: [
      {
        type: 'observe',
        text: 'A 24 V source and 6 A source network. One resistor has drifted from its nominal value.',
      },
      {
        type: 'action',
        text: 'Simulate, compare readings to expected values, and identify the faulty resistor.',
      },
    ],
    challenge: {
      mode: 'diagnose',
      inject: { component: 'R3', faultType: 'partial_short', multiplier: 0.1 },
      symptom: 'Node voltages do not match the textbook solution.',
      answer: { component: 'R3', faultType: 'partial_short' },
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
