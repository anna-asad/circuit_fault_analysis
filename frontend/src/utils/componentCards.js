/** Shared logic for per-component result cards. Add new types to COMP_META only. */

export function fmtV(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a === 0) return '0 V';
  if (a < 1e-3) return `${(v * 1e6).toFixed(2)} µV`;
  if (a < 1)    return `${(v * 1e3).toFixed(3)} mV`;
  return `${v.toFixed(4)} V`;
}

export function fmtA(a) {
  if (a == null) return '—';
  const abs = Math.abs(a);
  if (abs === 0) return '0 A';
  if (abs < 1e-6) return `${(a * 1e9).toFixed(2)} nA`;
  if (abs < 1e-3) return `${(a * 1e6).toFixed(2)} µA`;
  if (abs < 1)    return `${(a * 1e3).toFixed(3)} mA`;
  return `${a.toFixed(4)} A`;
}

export function fmtW(w) {
  if (w == null) return '—';
  const a = Math.abs(w);
  if (a === 0) return '0 W';
  if (a < 1e-6) return `${(w * 1e9).toFixed(2)} nW`;
  if (a < 1e-3) return `${(w * 1e6).toFixed(2)} µW`;
  if (a < 1)    return `${(w * 1e3).toFixed(3)} mW`;
  return `${w.toFixed(3)} W`;
}

export function fmtNominal(type, value) {
  if (value == null) return '';
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
      if (value >= 1)    return `${value} H`;
      if (value >= 1e-3) return `${value * 1e3} mH`;
      if (value >= 1e-6) return `${value * 1e6} µH`;
      return `${value * 1e9} nH`;
    case 'dc_source':      return `${value} V`;
    case 'current_source': {
      const a = Math.abs(value);
      if (a >= 1)    return `${value} A`;
      if (a >= 1e-3) return `${value * 1e3} mA`;
      if (a >= 1e-6) return `${value * 1e6} µA`;
      return `${value * 1e9} nA`;
    }
    default: return String(value);
  }
}

function resolveCurrent(comp, voltages, currents) {
  const upper = comp.id.toUpperCase();
  if (currents[upper]   != null) return currents[upper];
  if (currents[comp.id] != null) return currents[comp.id];
  const vKey = upper.startsWith('V') ? upper : `V${upper}`;
  if (currents[vKey]    != null) return currents[vKey];
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
  return (voltages[comp.nodes?.[0]] ?? 0) - (voltages[comp.nodes?.[1]] ?? 0);
}

const COMP_META = {
  resistor: {
    icon: '⬛',
    plainName: c => `${fmtNominal('resistor', c.value)} resistor`,
    fields: (c, voltages, currents) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      const i     = resolveCurrent(c, voltages, currents);
      return [
        { label: 'Voltage drop',               value: fmtV(vdrop) },
        { label: 'Current flowing through it',  value: fmtA(i)     },
        { label: 'Power used (heat)',            value: fmtW(i != null ? vdrop * i : null) },
      ];
    },
    note: () => null,
  },
  dc_source: {
    icon: '🔋',
    plainName: c => `${fmtNominal('dc_source', c.value)} battery`,
    fields: (c, voltages, currents) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      const i     = resolveCurrent(c, voltages, currents);
      return [
        { label: 'Voltage',                value: fmtV(Math.abs(vdrop)) },
        { label: "Current it's pushing out", value: fmtA(i != null ? Math.abs(i) : null) },
        { label: "Power it's supplying",    value: fmtW(i != null ? Math.abs(vdrop * i) : null) },
      ];
    },
    note: c => `This is the power source — everything else is using the ${fmtNominal('dc_source', c.value)} it makes.`,
  },
  current_source: {
    icon: '⬆',
    plainName: c => `${fmtNominal('current_source', c.value)} current source`,
    fields: (c, voltages) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      return [
        { label: "Current it's pushing (fixed)", value: fmtA(c.value ?? 0) },
        { label: 'Voltage it needs to do that',  value: fmtV(vdrop) },
        { label: "Power it's supplying",          value: fmtW(Math.abs(vdrop * (c.value ?? 0))) },
      ];
    },
    note: c => `Always pushes exactly ${fmtA(c.value)} — the circuit determines the voltage needed.`,
  },
  capacitor: {
    icon: '⚡',
    plainName: c => `${fmtNominal('capacitor', c.value)} capacitor`,
    fields: (c, voltages) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      return [
        { label: 'Voltage across it', value: fmtV(vdrop) },
        { label: 'Current (DC = 0)',  value: '0 A' },
        { label: 'Energy stored',     value: fmtW(0.5 * c.value * vdrop * vdrop) },
      ];
    },
    note: () => 'In DC, a capacitor is fully charged and no current flows through it.',
  },
  inductor: {
    icon: '〰',
    plainName: c => `${fmtNominal('inductor', c.value)} inductor`,
    fields: (c, voltages, currents) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      const i     = resolveCurrent(c, voltages, currents);
      return [
        { label: 'Voltage across it (DC = 0)', value: fmtV(vdrop) },
        { label: 'Current flowing through it',  value: fmtA(i) },
        { label: 'Energy stored',               value: fmtW(i != null ? 0.5 * c.value * i * i : null) },
      ];
    },
    note: () => 'In DC, an ideal inductor is a short circuit — voltage collapses to zero.',
  },
  ammeter: {
    icon: 'Ⓐ',
    plainName: () => 'ammeter',
    fields: (c, _v, currents, meters) => {
      const m   = meters?.find(m => m.type === 'ammeter' && m.id === c.id);
      const key = m?.spiceName?.toUpperCase();
      const val = key ? (currents[key] ?? currents[key.replace('VSENSE_', '')] ?? null) : null;
      return [{ label: 'Current passing through this point', value: fmtA(val) }];
    },
    note: () => "Just a measurement — it doesn't change the circuit.",
  },
  voltmeter: {
    icon: 'Ⓥ',
    plainName: () => 'voltmeter',
    fields: (c, voltages, _c, meters) => {
      const m     = meters?.find(m => m.type === 'voltmeter' && m.id === c.id);
      const vplus  = voltages[m?.nodes?.[0]];
      const vminus = voltages[m?.nodes?.[1]];
      const val    = (vplus != null && vminus != null) ? vplus - vminus : null;
      return [{ label: 'Voltage reading', value: fmtV(val) }];
    },
    note: () => "Just a measurement — it doesn't change the circuit.",
  },
  ground: {
    icon: '⏚',
    plainName: () => 'ground',
    fields: () => [{ label: 'Reference point (always 0)', value: '0 V' }],
    note: () => 'Every voltage in the circuit is measured relative to this point.',
  },
  switch: {
    icon: '⏻',
    plainName: c => `switch`,
    fields: (c) => [{ label: 'State', value: c.state === 'closed' ? 'Closed' : 'Open' }],
    note: c => c.state === 'closed' 
      ? 'The switch is closed — current flows through it.' 
      : 'The switch is open — no current flows.',
  },
  bulb: {
    icon: '💡',
    plainName: c => `${fmtNominal('resistor', c.value)} bulb`,
    fields: (c, voltages, currents) => {
      const vdrop = resolveVoltageDrop(c, voltages);
      const i     = resolveCurrent(c, voltages, currents);
      const power = i != null ? Math.abs(vdrop * i) : null;
      const brightness = c.brightness || 'off';
      return [
        { label: 'Voltage drop',           value: fmtV(vdrop) },
        { label: 'Current flowing through it', value: fmtA(i) },
        { label: 'Power used (heat)',      value: fmtW(power) },
        { label: 'Brightness',             value: brightness },
      ];
    },
    note: c => {
      if (c.brightness === 'off') return 'The bulb is off — no power.';
      if (c.brightness === 'dim') return 'The bulb is dimly lit.';
      if (c.brightness === 'bright') return 'The bulb is bright!';
      return null;
    },
  },
};

export function buildCardData(comp, voltages, currents, meters) {
  const meta = COMP_META[comp.type];
  if (!meta) return null;
  const nominal = meta.plainName(comp);
  const fields  = (meta.fields(comp, voltages, currents, meters) ?? []).filter(Boolean).slice(0, 3);
  return {
    icon:    meta.icon,
    heading: nominal ? `${comp.id} — ${nominal}` : comp.id,
    fields,
    note:    meta.note(comp, voltages, currents) ?? null,
  };
}

export function buildAllCards(components, voltages, currents, meters) {
  const ORDER = ['dc_source', 'current_source', 'resistor', 'capacitor', 'inductor',
                 'ammeter', 'voltmeter', 'switch', 'bulb', 'ground'];
  return [...components]
    .sort((a, b) => {
      const ai = ORDER.indexOf(a.type), bi = ORDER.indexOf(b.type);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map(c => ({ comp: c, card: buildCardData(c, voltages, currents, meters) }))
    .filter(({ card }) => card !== null);
}
