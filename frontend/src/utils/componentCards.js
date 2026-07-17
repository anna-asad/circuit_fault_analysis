/**
 * componentCards.js
 * ─────────────────
 * Shared logic for rendering per-component result cards.
 *
 * Every component type gets the same template:
 *   icon + "ID — plain name"
 *   up to 3 rows of [plain-English label]  [value with spelled-out unit]
 *   one muted sentence explaining the component's behaviour
 *
 * To add a new component type, add one entry to COMP_META.
 * Nothing else needs to change.
 */

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtV(v) {
  if (v === null || v === undefined) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0 V';
  if (a < 1e-3) return `${(v * 1e6).toFixed(2)} µV`;
  if (a < 1)    return `${(v * 1e3).toFixed(3)} mV`;
  return `${v.toFixed(4)} V`;
}

export function fmtA(a) {
  if (a === null || a === undefined) return '—';
  const abs = Math.abs(a);
  if (abs === 0) return '0 A';
  if (abs < 1e-6) return `${(a * 1e9).toFixed(2)} nA`;
  if (abs < 1e-3) return `${(a * 1e6).toFixed(2)} µA`;
  if (abs < 1)    return `${(a * 1e3).toFixed(3)} mA`;
  return `${a.toFixed(4)} A`;
}

export function fmtW(w) {
  if (w === null || w === undefined) return '—';
  const a = Math.abs(w);
  if (a === 0) return '0 W';
  if (a < 1e-6) return `${(w * 1e9).toFixed(2)} nW`;
  if (a < 1e-3) return `${(w * 1e6).toFixed(2)} µW`;
  if (a < 1)    return `${(w * 1e3).toFixed(3)} mW`;
  return `${w.toFixed(3)} W`;
}

/** Format a component's nominal value with its natural unit. */
export function fmtNominal(type, value) {
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'resistor':
      if (value >= 1e6) return `${value / 1e6} MΩ`;
      if (value >= 1e3) return `${value / 1e3} kΩ`;
      return `${value} Ω`;
    case 'capacitor':
      if (value >= 1e-3) return `${value * 1e3} mF`;
      if (value >= 1e-6) return `${value * 1e6} µF`;
      if (value >= 1e-9) return `${value * 1e9} nF`;
      return `${value * 1e12} pF`;
    case 'inductor':
      if (value >= 1) return `${value} H`;
      if (value >= 1e-3) return `${value * 1e3} mH`;
      if (value >= 1e-6) return `${value * 1e6} µH`;
      return `${value * 1e9} nH`;
    case 'dc_source':
      return `${value} V`;
    case 'current_source': {
      const a = Math.abs(value);
      if (a >= 1)    return `${value} A`;
      if (a >= 1e-3) return `${value * 1e3} mA`;
      if (a >= 1e-6) return `${value * 1e6} µA`;
      return `${value * 1e9} nA`;
    }
    default:
      return String(value);
  }
}

// ── Data resolvers ────────────────────────────────────────────────────────────

/**
 * Return the current through a component.
 * Priority: ngspice branch-current output → Ohm's law for resistors → 0 for reactive.
 */
function resolveCurrent(comp, voltages, currents) {
  // ngspice keys are uppercase SPICE names (V1, R1, etc.)
  const upper = comp.id.toUpperCase();
  if (currents[upper]      !== undefined) return currents[upper];
  if (currents[comp.id]    !== undefined) return currents[comp.id];
  // Voltage sources are reported as V<id>
  const vKey = upper.startsWith('V') ? upper : `V${upper}`;
  if (currents[vKey]       !== undefined) return currents[vKey];

  if (comp.type === 'resistor') {
    const v1 = voltages[comp.nodes?.[0]] ?? 0;
    const v2 = voltages[comp.nodes?.[1]] ?? 0;
    return comp.value ? (v1 - v2) / comp.value : 0;
  }
  if (comp.type === 'current_source') return comp.value ?? 0;
  if (comp.type === 'capacitor' || comp.type === 'inductor') return 0;
  return null;
}

function resolveVoltageDrop(comp, voltages) {
  const v1 = voltages[comp.nodes?.[0]] ?? 0;
  const v2 = voltages[comp.nodes?.[1]] ?? 0;
  return v1 - v2;
}

// ── COMP_META ─────────────────────────────────────────────────────────────────
/**
 * Per-type metadata.  Each entry must have:
 *
 *   icon       — emoji shown at top-left of card
 *   plainName  — function(comp) → string, e.g. "1 kΩ resistor"
 *   fields     — function(comp, voltages, currents) → [{ label, value }]
 *                Up to 3 entries.  value must already be a formatted string.
 *                Return null/undefined to skip that row.
 *   note       — function(comp, voltages, currents) → string | null
 *                One behaviour sentence.  null = omit.
 */
const COMP_META = {
  resistor: {
    icon: '⬛',
    plainName: (c) => `${fmtNominal('resistor', c.value)} resistor`,
    fields: (c, voltages, currents) => {
      const vdrop   = resolveVoltageDrop(c, voltages);
      const current = resolveCurrent(c, voltages, currents);
      const power   = (current !== null) ? vdrop * current : null;
      return [
        { label: 'Voltage drop',              value: fmtV(vdrop)   },
        { label: 'Current flowing through it', value: fmtA(current) },
        { label: 'Power used (heat)',           value: fmtW(power)   },
      ];
    },
    note: () => null,   // behaviour is self-evident
  },

  dc_source: {
    icon: '🔋',
    plainName: (c) => `${fmtNominal('dc_source', c.value)} battery`,
    fields: (c, voltages, currents) => {
      const vdrop   = resolveVoltageDrop(c, voltages);
      const current = resolveCurrent(c, voltages, currents);
      // Power supplied by the source (positive = supplying power to circuit)
      const power   = (current !== null) ? Math.abs(vdrop * current) : null;
      return [
        { label: 'Voltage',               value: fmtV(Math.abs(vdrop)) },
        { label: "Current it's pushing out", value: fmtA(current !== null ? Math.abs(current) : null) },
        { label: "Power it's supplying",   value: fmtW(power) },
      ];
    },
    note: (c) =>
      `This is the power source — everything else in the circuit is using the ${fmtNominal('dc_source', c.value)} it makes.`,
  },

  current_source: {
    icon: '⬆',
    plainName: (c) => `${fmtNominal('current_source', c.value)} current source`,
    fields: (c, voltages, currents) => {
      const current  = c.value ?? 0;
      const vdrop    = resolveVoltageDrop(c, voltages);
      const power    = Math.abs(vdrop * current);
      return [
        { label: "Current it's pushing (fixed)", value: fmtA(current)  },
        { label: 'Voltage it needs to do that',  value: fmtV(vdrop)    },
        { label: "Power it's supplying",          value: fmtW(power)    },
      ];
    },
    note: (c) =>
      `This source always pushes exactly ${fmtA(c.value)}, no matter what's connected — the rest of the circuit determines the voltage it needs.`,
  },

  capacitor: {
    icon: '⚡',
    plainName: (c) => `${fmtNominal('capacitor', c.value)} capacitor`,
    fields: (c, voltages) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      // DC energy stored: E = ½CV²
      const energy = 0.5 * c.value * vdrop * vdrop;
      return [
        { label: 'Voltage across it',  value: fmtV(vdrop)  },
        { label: 'Current (DC = 0)',   value: '0 A'         },
        { label: 'Energy stored',      value: fmtW(energy)  },
      ];
    },
    note: () =>
      'In DC, a capacitor is fully charged and no current flows through it.',
  },

  inductor: {
    icon: '〰',
    plainName: (c) => `${fmtNominal('inductor', c.value)} inductor`,
    fields: (c, voltages, currents) => {
      const current = resolveCurrent(c, voltages, currents);
      const vdrop   = resolveVoltageDrop(c, voltages);
      // DC energy stored: E = ½LI²
      const energy  = current !== null ? 0.5 * c.value * current * current : null;
      return [
        { label: 'Voltage across it (DC = 0)', value: fmtV(vdrop)    },
        { label: 'Current flowing through it',  value: fmtA(current)  },
        { label: 'Energy stored',               value: fmtW(energy)   },
      ];
    },
    note: () =>
      'In DC, an ideal inductor is a short circuit — the voltage across it collapses to zero.',
  },

  ammeter: {
    icon: 'Ⓐ',
    plainName: () => 'ammeter',
    fields: (c, voltages, currents, meters) => {
      const m = meters?.find(m => m.type === 'ammeter' && m.id === c.id);
      if (!m) return [{ label: 'Current passing through', value: '—' }];
      const key   = m.spiceName?.toUpperCase();
      const value = currents[key] ?? currents[key?.replace('VSENSE_', '')] ?? null;
      return [
        { label: 'Current passing through this point', value: fmtA(value) },
      ];
    },
    note: () => "Just a measurement — it doesn't change the circuit.",
  },

  voltmeter: {
    icon: 'Ⓥ',
    plainName: () => 'voltmeter',
    fields: (c, voltages, currents, meters) => {
      const m = meters?.find(m => m.type === 'voltmeter' && m.id === c.id);
      if (!m) return [{ label: 'Voltage reading', value: '—' }];
      const vplus  = voltages[m.nodes?.[0]];
      const vminus = voltages[m.nodes?.[1]];
      const value  = (vplus !== undefined && vminus !== undefined)
        ? vplus - vminus : null;
      return [
        { label: 'Voltage reading', value: fmtV(value) },
      ];
    },
    note: () => "Just a measurement — it doesn't change the circuit.",
  },

  ground: {
    icon: '⏚',
    plainName: () => 'ground',
    fields: () => [
      { label: 'Reference point (always 0)', value: '0 V' },
    ],
    note: () =>
      'Every voltage in the circuit is measured relative to this point.',
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a card data object for a single component.
 * Returns null if the type is unknown.
 *
 * Shape:
 *   { icon, heading, fields: [{label, value}], note }
 */
export function buildCardData(comp, voltages, currents, meters) {
  const meta = COMP_META[comp.type];
  if (!meta) return null;

  const nominal  = meta.plainName(comp);
  const heading  = nominal ? `${comp.id} — ${nominal}` : comp.id;
  const rawFields = meta.fields(comp, voltages, currents, meters) ?? [];
  // Filter out null rows and cap at 3
  const fields   = rawFields.filter(Boolean).slice(0, 3);
  const note     = meta.note(comp, voltages, currents) ?? null;

  return { icon: meta.icon, heading, fields, note };
}

/**
 * Build card data for every component in the circuit, in a stable display order:
 * sources first, then passives, then meters, then ground.
 */
export function buildAllCards(components, voltages, currents, meters) {
  const ORDER = ['dc_source', 'current_source', 'resistor', 'capacitor', 'inductor',
                 'ammeter', 'voltmeter', 'ground'];

  const sorted = [...components].sort((a, b) => {
    const ai = ORDER.indexOf(a.type);
    const bi = ORDER.indexOf(b.type);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  return sorted
    .map(c => ({ comp: c, card: buildCardData(c, voltages, currents, meters) }))
    .filter(({ card }) => card !== null);
}
