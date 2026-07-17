import { useState } from 'react';
import './ResultsPage.css';
import CircuitCanvas from '../components/CircuitCanvas';

// ── Value formatting ──────────────────────────────────────────────────────────
function fmtVoltage(v) {
  const a = Math.abs(v);
  if (a === 0) return '0 V';
  if (a < 1e-3) return `${(v * 1e6).toFixed(2)} µV`;
  if (a < 1) return `${(v * 1e3).toFixed(3)} mV`;
  return `${v.toFixed(4)} V`;
}

function fmtCurrent(a) {
  const abs = Math.abs(a);
  if (abs === 0) return '0 A';
  if (abs < 1e-6) return `${(a * 1e9).toFixed(2)} nA`;
  if (abs < 1e-3) return `${(a * 1e6).toFixed(2)} µA`;
  if (abs < 1) return `${(a * 1e3).toFixed(3)} mA`;
  return `${a.toFixed(4)} A`;
}

// ── Node description builder ──────────────────────────────────────────────────
function buildNodeDescriptions(voltages, simulationData) {
  const components = simulationData?.components ?? [];
  const desc = {};
  Object.keys(voltages).forEach(node => {
    if (node === '0') { desc[node] = 'GND'; return; }
    const pins = [];
    components.forEach(comp => {
      if (!comp.nodes) return;
      comp.nodes.forEach((n, idx) => {
        if (n !== node) return;
        const pinLabel = comp.type === 'dc_source'
          ? (idx === 0 ? '+' : '−')
          : (idx === 0 ? 'A' : 'B');
        pins.push(`${comp.id ?? '?'}(${pinLabel})`);
      });
    });
    desc[node] = pins.length > 0 ? pins.join(' · ') : node;
  });
  return desc;
}

// ── Meter reading resolver ────────────────────────────────────────────────────
function resolveMeterReadings(meters, voltages, currents) {
  if (!meters || meters.length === 0) return [];
  return meters.map(meter => {
    const { id, type, spiceName, nodes } = meter;
    if (type === 'ammeter') {
      const key   = spiceName?.toUpperCase();
      const value = currents[key] ?? currents[key?.replace('VSENSE_', '')] ?? null;
      return { id, type, value, formatted: value !== null ? fmtCurrent(value) : '—', ok: value !== null };
    }
    if (type === 'voltmeter') {
      const vplus  = voltages[nodes?.[0]];
      const vminus = voltages[nodes?.[1]];
      if (vplus !== undefined && vminus !== undefined) {
        const value = vplus - vminus;
        return { id, type, value, formatted: fmtVoltage(value), ok: true };
      }
      return { id, type, value: null, formatted: '—', ok: false };
    }
    return { id, type, value: null, formatted: '—', ok: false };
  });
}

function ResultsPage({ results, onBack, circuit }) {
  const [measurementsOpen, setMeasurementsOpen] = useState(true);
  const [voltagesOpen, setVoltagesOpen] = useState(true);
  const [currentsOpen, setCurrentsOpen] = useState(true);
  
  if (!results) {
    return (
      <div className="results-page">
        <header className="results-page-header">
          <div className="results-page-title">
            <span className="results-page-title-icon">⚡</span>
            <h2>Simulation Results</h2>
          </div>
          <div className="results-page-actions">
            {onBack && (
              <button type="button" className="results-page-back" onClick={onBack}>
                ← Back to editor
              </button>
            )}
          </div>
        </header>
        <main className="results-page-body">
          <div className="results-empty-state">
            <p>No simulation results available</p>
          </div>
        </main>
      </div>
    );
  }

  const { success, simulation_data, structural_faults, pattern_faults, error } = results;
  const voltages = { '0': 0, ...(simulation_data?.voltages ?? {}) };
  const currents = simulation_data?.currents ?? {};
  const meters   = simulation_data?.meters   ?? [];
  
  const hasFaults = structural_faults && structural_faults.length > 0;
  const isNormalML = String(pattern_faults?.predicted_fault ?? '').toLowerCase() === 'normal';
  const isAllClear = success && !hasFaults && isNormalML;

  const nodeDesc = buildNodeDescriptions(voltages, simulation_data);
  const meterReadings = resolveMeterReadings(meters, voltages, currents);
  
  // Build set of ammeter SPICE keys to exclude from branch currents
  const ammeterSpiceKeys = new Set(
    meters
      .filter(m => m.type === 'ammeter')
      .flatMap(m => [
        m.spiceName?.toUpperCase(),
        m.spiceName?.toUpperCase().replace('VSENSE_', ''),
      ])
      .filter(Boolean)
  );

  return (
    <div className="results-page">
      <header className="results-page-header">
        <div className="results-page-title">
          <span className="results-page-title-icon">⚡</span>
          <h2>Simulation Results</h2>
        </div>
        <div className="results-page-actions">
          {onBack && (
            <button type="button" className="results-page-back" onClick={onBack}>
              ← Back to editor
            </button>
          )}
        </div>
      </header>

      <main className="results-page-body">
        {/* Left column: Circuit diagram */}
        <div className="results-canvas-container">
          <CircuitCanvas setCircuit={() => {}} circuit={circuit} mode="results" />
        </div>

        {/* Right column: Status + Data sections */}
        <aside className="results-sidebar">
          {/* Status Card */}
          <div className={`status-card ${isAllClear ? 'status-card-success' : 'status-card-fault'}`}>
            <div className="status-card-icon">
              {isAllClear ? '✓' : '⚠'}
            </div>
            <h3 className="status-card-title">
              {isAllClear ? 'Everything checks out' : (pattern_faults?.predicted_fault || 'Fault Detected')}
            </h3>
            <p className="status-card-subtitle">
              {isAllClear 
                ? 'No structural faults · Circuit operating normally'
                : hasFaults 
                  ? structural_faults[0]
                  : pattern_faults?.description || error || 'Simulation completed with warnings'}
            </p>
          </div>

          {/* Meter Measurements Section */}
          {meterReadings.length > 0 && (
            <section className="data-section">
              <button 
                type="button"
                className="data-section-header"
                onClick={() => setMeasurementsOpen(!measurementsOpen)}
              >
                <span className="data-section-title">
                  📏 Measurements
                  <span className="info-tooltip" title="Ammeter (Ⓐ) shows current through the meter. Voltmeter (Ⓥ) shows voltage across its terminals.">
                    ⓘ
                  </span>
                </span>
                <span className="data-section-toggle">{measurementsOpen ? '▼' : '▶'}</span>
              </button>
              {measurementsOpen && (
                <div className="data-section-content">
                  {meterReadings.map(m => (
                    <div key={m.id} className="data-row">
                      <span className="data-row-label">
                        {m.type === 'ammeter' ? 'Ⓐ' : 'Ⓥ'} {m.id}
                      </span>
                      <span className={`data-row-value${!m.ok ? ' data-row-value-error' : ''}`}>
                        {m.formatted}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Node Voltages Section */}
          <section className="data-section">
            <button 
              type="button"
              className="data-section-header"
              onClick={() => setVoltagesOpen(!voltagesOpen)}
            >
              <span className="data-section-title">
                ⚡ Node Voltages
                <span className="info-tooltip" title="V(node) = voltage at that node relative to ground. V(0) is always ground (0V).">
                  ⓘ
                </span>
              </span>
              <span className="data-section-toggle">{voltagesOpen ? '▼' : '▶'}</span>
            </button>
            {voltagesOpen && (
              <div className="data-section-content">
                {Object.entries(voltages)
                  .sort(([a], [b]) => {
                    if (a === '0') return -1;
                    if (b === '0') return 1;
                    return (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0);
                  })
                  .map(([node, v]) => (
                    <div key={node} className="data-row">
                      <span className="data-row-label">{nodeDesc[node]} V({node})</span>
                      <span className="data-row-value">{fmtVoltage(v)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Branch Currents Section */}
          <section className="data-section">
            <button 
              type="button"
              className="data-section-header"
              onClick={() => setCurrentsOpen(!currentsOpen)}
            >
              <span className="data-section-title">
                🔌 Branch Currents
                <span className="info-tooltip" title="I(component) = current flowing through that component, in the direction shown by its symbol.">
                  ⓘ
                </span>
              </span>
              <span className="data-section-toggle">{currentsOpen ? '▼' : '▶'}</span>
            </button>
            {currentsOpen && (
              <div className="data-section-content">
                {Object.entries(currents)
                  .filter(([src]) => !ammeterSpiceKeys.has(src.toUpperCase()))
                  .map(([src, a]) => (
                    <div key={src} className="data-row">
                      <span className="data-row-label">{src} I({src})</span>
                      <span className="data-row-value">{fmtCurrent(a)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

export default ResultsPage;