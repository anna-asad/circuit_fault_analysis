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

// ── ML card styling by fault type ────────────────────────────────────────────
function mlCardClass(faultType) {
  if (!faultType || faultType === 'Normal') return 'ml-card ml-card-normal';
  if (faultType === 'model_unavailable' || faultType === 'prediction_error' || faultType === 'schema_mismatch')
    return 'ml-card ml-card-unknown';
  return 'ml-card ml-card-fault';
}

function confidenceClass(conf) {
  if (conf >= 0.8) return 'conf-badge conf-high';
  if (conf >= 0.5) return 'conf-badge conf-mid';
  return 'conf-badge conf-low';
}

// ── Build human-readable node descriptions ───────────────────────────────────
// For each ngspice node name (n1, n2, 0), find which component pins connect to it.
function buildNodeDescriptions(voltages, simulationData) {
  const components = simulationData?.components ?? [];
  const desc = {};

  Object.keys(voltages).forEach(node => {
    if (node === '0') {
      desc[node] = 'GND';
      return;
    }
    const pins = [];
    components.forEach(comp => {
      if (!comp.nodes) return;
      comp.nodes.forEach((n, idx) => {
        if (n !== node) return;
        const compId = comp.id ?? '?';
        const compType = comp.type ?? '';
        // Pin label: dc_source uses +/−, others use A/B
        let pinLabel;
        if (compType === 'dc_source') {
          pinLabel = idx === 0 ? '+' : '−';
        } else {
          pinLabel = idx === 0 ? 'A' : 'B';
        }
        pins.push(`${compId}(${pinLabel})`);
      });
    });
    desc[node] = pins.length > 0 ? pins.join(' · ') : node;
  });

  return desc;
}

// ── Build human-readable current source labels ────────────────────────────────
// ngspice reports I(Vdcsource...) — map back to V1, V2 etc.
function buildCurrentLabel(rawKey, simulationData) {
  const components = simulationData?.components ?? [];
  // rawKey from ngspice is the SPICE name (e.g. "VDCSOURCE1784..." or "V1")
  const upper = rawKey.toUpperCase();
  // Try to find the matching component by matching its SPICE name
  const match = components.find(c => {
    const spiceName = (c.type === 'dc_source'
      ? (c.id.toUpperCase().startsWith('V') ? c.id : `V${c.id}`)
      : c.id
    ).toUpperCase();
    return spiceName === upper || c.id.toUpperCase() === upper;
  });
  if (match) return match.id;
  return rawKey;
}
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

// ── Component ─────────────────────────────────────────────────────────────────
function ResultsPanel({ results }) {
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
  const voltages = simulation_data?.voltages ?? {};
  const currents = simulation_data?.currents ?? {};

  // Human-readable descriptions for each node and current source
  const nodeDesc    = buildNodeDescriptions(voltages, simulation_data);
  const currentDesc = (src) => buildCurrentLabel(src, simulation_data);

  return (
    <aside className="results-panel">
      <h3>Simulation Results</h3>

      {success ? (
        <div className="results-content">

          {/* Voltages */}
          {Object.keys(voltages).length > 0 && (
            <section className="result-section">
              <h4 className="section-title">Node Voltages</h4>
              <div className="data-grid">
                {Object.entries(voltages).map(([node, v]) => (
                  <div key={node} className="data-item">
                    <div className="data-label-wrap">
                      <span className="data-label">{nodeDesc[node] ?? node}</span>
                      <span className="data-subtext">V({node})</span>
                    </div>
                    <span className={`data-value${v === 0 ? ' data-value-zero' : ''}`}>
                      {fmtVoltage(v)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Currents */}
          {Object.keys(currents).length > 0 && (
            <section className="result-section">
              <h4 className="section-title">Branch Currents</h4>
              <div className="data-grid">
                {Object.entries(currents).map(([src, a]) => (
                  <div key={src} className="data-item">
                    <span className="data-label">I({currentDesc(src)})</span>
                    <span className="data-value">{fmtCurrent(a)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Structural faults */}
          {structural_faults && structural_faults.length > 0 && (
            <section className="result-section">
              <h4 className="section-title">Structural Faults</h4>
              <ul className="fault-list">
                {structural_faults.map((f, i) => (
                  <li key={i} className="fault-item fault-warn">{f}</li>
                ))}
              </ul>
            </section>
          )}

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

                {/* Per-label probabilities from real model */}
                {pattern_faults.all_probabilities &&
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

      ) : (
        <div className="results-content">
          <div className="sim-failed-banner">
            <strong>Simulation failed</strong>
            {error && <p className="sim-failed-detail">{error}</p>}
          </div>
          {structural_faults && structural_faults.length > 0 && (
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
      )}
    </aside>
  );
}

export default ResultsPanel;
