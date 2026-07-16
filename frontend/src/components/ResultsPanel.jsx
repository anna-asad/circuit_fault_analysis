import { useState } from 'react';
import './ResultsPanel.css';

// ── Value formatting ──────────────────────────────────────────────────────────
function fmtVoltage(v) {
  const a = Math.abs(v);
  if (a === 0) return '0 V';
  if (a < 1e-3) return `${(v * 1e6).toFixed(2)} µV`;
  if (a < 1)    return `${(v * 1e3).toFixed(3)} mV`;
  return `${v.toFixed(4)} V`;
}

function fmtCurrent(a) {
  const abs = Math.abs(a);
  if (abs === 0) return '0 A';
  if (abs < 1e-6) return `${(a * 1e9).toFixed(2)} nA`;
  if (abs < 1e-3) return `${(a * 1e6).toFixed(2)} µA`;
  if (abs < 1)    return `${(a * 1e3).toFixed(3)} mA`;
  return `${a.toFixed(4)} A`;
}

// ── ML card helpers ───────────────────────────────────────────────────────────
function mlCardClass(faultType) {
  if (!faultType || faultType === 'Normal') return 'ml-card ml-card-normal';
  if (['model_unavailable', 'prediction_error', 'schema_mismatch'].includes(faultType))
    return 'ml-card ml-card-unknown';
  return 'ml-card ml-card-fault';
}
function confidenceClass(conf) {
  if (conf >= 0.8) return 'conf-badge conf-high';
  if (conf >= 0.5) return 'conf-badge conf-mid';
  return 'conf-badge conf-low';
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

// ── Current-source label resolver ─────────────────────────────────────────────
function buildCurrentLabel(rawKey, simulationData) {
  const upper = rawKey.toUpperCase();
  const match = (simulationData?.components ?? []).find(c => {
    const sname = (c.type === 'dc_source'
      ? (c.id.toUpperCase().startsWith('V') ? c.id : `V${c.id}`)
      : c.id
    ).toUpperCase();
    return sname === upper || c.id.toUpperCase() === upper;
  });
  return match ? match.id : rawKey;
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

// ── ML labels ─────────────────────────────────────────────────────────────────
const LABEL_DISPLAY = {
  drift:                'Value Drift',
  partial_short:        'Partial Short',
  partial_open:         'Partial Open',
  wrong_component_type: 'Wrong Component',
  Normal:               'Normal',
  Multiple_Faults:      'Multiple Faults',
};
function displayLabel(raw) {
  return LABEL_DISPLAY[raw] ?? raw.replace(/_/g, ' ');
}

// ── SimData: the full voltage/current/meter tables ────────────────────────────
function SimData({ voltages, currents, meters, simulationData, ammeterSpiceKeys }) {
  const nodeDesc    = buildNodeDescriptions(voltages, simulationData);
  const currentDesc = src => buildCurrentLabel(src, simulationData);
  const meterReadings = resolveMeterReadings(meters, voltages, currents);

  return (
    <div className="results-content">
      {/* Meter measurements */}
      {meterReadings.length > 0 && (
        <section className="result-section">
          <h4 className="section-title">📏 Measurements</h4>
          <div className="data-grid">
            {meterReadings.map(m => (
              <div key={m.id} className={`data-item meter-item meter-item-${m.type}`}>
                <div className="data-label-wrap">
                  <span className="data-label">{m.type === 'ammeter' ? 'Ⓐ' : 'Ⓥ'} {m.id}</span>
                  <span className="data-subtext">
                    {m.type === 'ammeter' ? 'Current (series)' : 'Voltage (parallel)'}
                  </span>
                </div>
                <span className={`data-value meter-value-${m.type}${!m.ok ? ' data-value-zero' : ''}`}>
                  {m.formatted}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Node voltages */}
      <section className="result-section">
        <h4 className="section-title">⚡ Node Voltages</h4>
        {Object.keys(voltages).length > 0 ? (
          <div className="data-grid">
            {Object.entries(voltages)
              .sort(([a], [b]) => {
                if (a === '0') return -1;
                if (b === '0') return 1;
                return (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0);
              })
              .map(([node, v]) => (
                <div key={node} className="data-item">
                  <div className="data-label-wrap">
                    <span className="data-label" title={`Node ${node}`}>{nodeDesc[node] ?? node}</span>
                    <span className="data-subtext">V({node})</span>
                  </div>
                  <span className={`data-value${v === 0 ? ' data-value-zero' : ''}`}>{fmtVoltage(v)}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="empty-data-state">
            <p>No node voltage data available</p>
            <small>Check that ngspice completed successfully</small>
          </div>
        )}
      </section>

      {/* Branch currents */}
      <section className="result-section">
        <h4 className="section-title">🔌 Branch Currents</h4>
        {(() => {
          const visible = Object.entries(currents).filter(
            ([src]) => !ammeterSpiceKeys.has(src.toUpperCase())
          );
          return visible.length > 0 ? (
            <div className="data-grid">
              {visible.map(([src, a]) => (
                <div key={src} className="data-item">
                  <div className="data-label-wrap">
                    <span className="data-label" title={`Current through ${src}`}>{currentDesc(src)}</span>
                    <span className="data-subtext">I({src})</span>
                  </div>
                  <span className="data-value">{fmtCurrent(a)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-data-state">
              <p>No current data available</p>
              <small>Check that ngspice completed successfully</small>
            </div>
          );
        })()}
      </section>
    </div>
  );
}

// ── ResultsPanel component ────────────────────────────────────────────────────
function ResultsPanel({ results }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!results) {
    return (
      <aside className="results-panel">
        <h3>Results</h3>
        <div className="empty-state">
          <p className="empty-title">No results yet</p>
          <ol className="empty-steps">
            <li>Drag components onto the canvas</li>
            <li>Connect pins with wires</li>
            <li>Click <strong>▶ Simulate</strong></li>
          </ol>
        </div>
      </aside>
    );
  }

  const { success, simulation_data, structural_faults, pattern_faults, error } = results;
  const voltages = { '0': 0, ...(simulation_data?.voltages ?? {}) };
  const currents = simulation_data?.currents ?? {};
  const meters   = simulation_data?.meters   ?? [];

  const hasFaults      = structural_faults && structural_faults.length > 0;
  const isNormalML     = String(pattern_faults?.predicted_fault ?? '').toLowerCase() === 'normal';
  const mlAvailable    = !!pattern_faults && !['model_unavailable', 'no_simulation_data'].includes(pattern_faults.fault_type);
  // "All clear" = simulation succeeded, no structural faults, ML says Normal
  const isAllClear     = success && !hasFaults && isNormalML && mlAvailable;

  const ammeterSpiceKeys = new Set(
    meters
      .filter(m => m.type === 'ammeter')
      .flatMap(m => [
        m.spiceName?.toUpperCase(),
        m.spiceName?.toUpperCase().replace('VSENSE_', ''),
      ])
      .filter(Boolean)
  );

  // ── Failed simulation ─────────────────────────────────────────────────────
  if (!success) {
    return (
      <aside className="results-panel">
        <h3>Simulation Results</h3>
        <div className="results-content">
          <div className="sim-failed-banner">
            <strong>Simulation failed</strong>
            {error && <p className="sim-failed-detail">{error}</p>}
          </div>
          {hasFaults && (
            <section className="result-section">
              <h4 className="section-title">Issues Detected</h4>
              <ul className="fault-list">
                {structural_faults.map((f, i) => (
                  <li key={i} className="fault-item fault-warn">{f}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    );
  }

  // ── All-clear: compact summary + collapsible details ─────────────────────
  if (isAllClear) {
    return (
      <aside className="results-panel">
        <h3>Simulation Results</h3>
        <div className="results-content">

          {/* Meter readings still shown prominently even in all-clear mode */}
          {meters.length > 0 && (
            <section className="result-section">
              <h4 className="section-title">📏 Measurements</h4>
              <div className="data-grid">
                {resolveMeterReadings(meters, voltages, currents).map(m => (
                  <div key={m.id} className={`data-item meter-item meter-item-${m.type}`}>
                    <div className="data-label-wrap">
                      <span className="data-label">{m.type === 'ammeter' ? 'Ⓐ' : 'Ⓥ'} {m.id}</span>
                      <span className="data-subtext">
                        {m.type === 'ammeter' ? 'Current (series)' : 'Voltage (parallel)'}
                      </span>
                    </div>
                    <span className={`data-value meter-value-${m.type}`}>
                      {resolveMeterReadings(meters, voltages, currents).find(r => r.id === m.id)?.formatted ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All-clear banner */}
          <div className="all-clear-banner">
            <span className="all-clear-icon">✓</span>
            <div className="all-clear-text">
              <strong>Everything checks out</strong>
              <p>No structural faults · Circuit operating normally</p>
            </div>
          </div>

          {/* Collapsible simulation data */}
          <button
            type="button"
            className="details-toggle"
            onClick={() => setDetailsOpen(v => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? '▲ Hide details' : '▼ Show simulation data'}
          </button>

          {detailsOpen && (
            <SimData
              voltages={voltages}
              currents={currents}
              meters={meters}
              simulationData={simulation_data}
              ammeterSpiceKeys={ammeterSpiceKeys}
            />
          )}
        </div>
      </aside>
    );
  }

  // ── Normal expanded view (faults present or ML non-normal) ───────────────
  return (
    <aside className="results-panel">
      <h3>Simulation Results</h3>
      <div className="results-content">

        {/* Meter measurements */}
        {meters.length > 0 && (() => {
          const readings = resolveMeterReadings(meters, voltages, currents);
          return (
            <section className="result-section">
              <h4 className="section-title">📏 Measurements</h4>
              <div className="data-grid">
                {readings.map(m => (
                  <div key={m.id} className={`data-item meter-item meter-item-${m.type}`}>
                    <div className="data-label-wrap">
                      <span className="data-label">{m.type === 'ammeter' ? 'Ⓐ' : 'Ⓥ'} {m.id}</span>
                      <span className="data-subtext">
                        {m.type === 'ammeter' ? 'Current (series)' : 'Voltage (parallel)'}
                      </span>
                    </div>
                    <span className={`data-value meter-value-${m.type}${!m.ok ? ' data-value-zero' : ''}`}>
                      {m.formatted}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Node voltages */}
        <section className="result-section">
          <h4 className="section-title">⚡ Node Voltages</h4>
          {Object.keys(voltages).length > 0 ? (
            <div className="data-grid">
              {Object.entries(voltages)
                .sort(([a], [b]) => {
                  if (a === '0') return -1;
                  if (b === '0') return 1;
                  return (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0);
                })
                .map(([node, v]) => (
                  <div key={node} className="data-item">
                    <div className="data-label-wrap">
                      <span className="data-label" title={`Node ${node}`}>
                        {buildNodeDescriptions(voltages, simulation_data)[node] ?? node}
                      </span>
                      <span className="data-subtext">V({node})</span>
                    </div>
                    <span className={`data-value${v === 0 ? ' data-value-zero' : ''}`}>{fmtVoltage(v)}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="empty-data-state">
              <p>No node voltage data available</p>
              <small>Check that ngspice completed successfully</small>
            </div>
          )}
        </section>

        {/* Branch currents */}
        <section className="result-section">
          <h4 className="section-title">🔌 Branch Currents</h4>
          {(() => {
            const visible = Object.entries(currents).filter(
              ([src]) => !ammeterSpiceKeys.has(src.toUpperCase())
            );
            return visible.length > 0 ? (
              <div className="data-grid">
                {visible.map(([src, a]) => (
                  <div key={src} className="data-item">
                    <div className="data-label-wrap">
                      <span className="data-label" title={`Current through ${src}`}>
                        {buildCurrentLabel(src, simulation_data)}
                      </span>
                      <span className="data-subtext">I({src})</span>
                    </div>
                    <span className="data-value">{fmtCurrent(a)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-data-state">
                <p>No current data available</p>
                <small>Check that ngspice completed successfully</small>
              </div>
            );
          })()}
        </section>

        {/* Structural faults — always rendered, empty state when clean */}
        <section className="result-section">
          <h4 className="section-title">⚠ Structural Faults</h4>
          {hasFaults ? (
            <ul className="fault-list">
              {structural_faults.map((f, i) => (
                <li key={i} className="fault-item fault-warn">{f}</li>
              ))}
            </ul>
          ) : (
            <p className="no-faults-line">No structural faults detected.</p>
          )}
        </section>

        {/* ML Classification */}
        {pattern_faults && (
          <section className="result-section">
            <h4 className="section-title">ML Fault Classification</h4>
            <div className={mlCardClass(pattern_faults.fault_type)}>
              <div className="ml-prediction-row">
                <strong className="ml-predicted">
                  {displayLabel(pattern_faults.predicted_fault)}
                </strong>
                <span className={confidenceClass(pattern_faults.confidence)}>
                  {(pattern_faults.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="ml-description">{pattern_faults.description}</p>
              {!isNormalML &&
                pattern_faults.all_probabilities &&
                Object.keys(pattern_faults.all_probabilities).length > 0 && (
                <div className="ml-probs">
                  {Object.entries(pattern_faults.all_probabilities)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, prob]) => (
                      <div key={label} className="ml-prob-row">
                        <span className="ml-prob-label">{displayLabel(label)}</span>
                        <div className="ml-prob-bar-wrap">
                          <div
                            className={`ml-prob-bar${prob >= 0.5 ? ' ml-prob-bar-fired' : ''}`}
                            style={{ width: `${Math.round(prob * 100)}%` }}
                          />
                        </div>
                        <span className="ml-prob-pct">{(prob * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

export default ResultsPanel;
