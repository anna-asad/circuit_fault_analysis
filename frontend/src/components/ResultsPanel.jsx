import { useState } from 'react';
import './ResultsPanel.css';
import { buildAllCards } from '../utils/componentCards';

// ── ML helpers ────────────────────────────────────────────────────────────────
const LABEL_DISPLAY = {
  drift: 'Value Drift', partial_short: 'Partial Short',
  partial_open: 'Partial Open', wrong_component_type: 'Wrong Component',
  Normal: 'Normal', Multiple_Faults: 'Multiple Faults',
};
const displayLabel = raw => LABEL_DISPLAY[raw] ?? String(raw).replace(/_/g, ' ');
const mlCardClass  = ft =>
  !ft || ft === 'Normal'  ? 'ml-card ml-card-normal'  :
  ['model_unavailable','prediction_error','schema_mismatch'].includes(ft)
                           ? 'ml-card ml-card-unknown' : 'ml-card ml-card-fault';
const confClass = c => c >= 0.8 ? 'conf-badge conf-high'
                     : c >= 0.5 ? 'conf-badge conf-mid' : 'conf-badge conf-low';

function formatStructuralFault(fault) {
  if (/^Floating nodes \(single connection\):/i.test(fault)) {
    return {
      title: 'Open Circuit / Unconnected Components',
      detail: 'Some component terminals are not connected to the rest of the circuit. Please check the component wiring.',
    };
  }

  if (/has an unconnected terminal/i.test(fault)) {
    return {
      title: 'Open Circuit Detected',
      detail: 'One or more component terminals are not connected to the circuit. Please check all connections.',
    };
  }

  if (/open circuit/i.test(fault)) {
    return {
      title: 'Open Circuit Detected',
      detail: fault,
    };
  }

  return {
    title: 'Structural Fault Detected',
    detail: fault,
  };
}

// ── Single component card ─────────────────────────────────────────────────────
function ComponentCard({ card }) {
  return (
    <div className="comp-card">
      <div className="comp-card-header">
        <span className="comp-card-icon">{card.icon}</span>
        <span className="comp-card-heading">{card.heading}</span>
      </div>
      {card.fields.length > 0 && (
        <div className="comp-card-fields">
          {card.fields.map((f, i) => (
            <div key={i} className="comp-card-row">
              <span className="comp-card-label">{f.label}</span>
              <span className="comp-card-value">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {card.note && <p className="comp-card-note">{card.note}</p>}
    </div>
  );
}

// ── ML section (shared between all-clear and expanded) ────────────────────────
function MlSection({ pattern_faults }) {
  if (!pattern_faults) return null;
  const isNormal = String(pattern_faults.predicted_fault ?? '').toLowerCase() === 'normal';
  return (
    <section className="result-section">
      <h4 className="section-title">ML Fault Classification</h4>
      <div className={mlCardClass(pattern_faults.fault_type)}>
        <div className="ml-prediction-row">
          <strong className="ml-predicted">{displayLabel(pattern_faults.predicted_fault)}</strong>
          <span className={confClass(pattern_faults.confidence)}>
            {(pattern_faults.confidence * 100).toFixed(0)}%
          </span>
        </div>
        <p className="ml-description">{pattern_faults.description}</p>
        {!isNormal && pattern_faults.all_probabilities &&
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
  );
}

// ── Component cards section (shared) ─────────────────────────────────────────
function CardsSection({ components, voltages, currents, meters }) {
  const allComponents = [
    ...components,
    ...(!components.some(c => c.type === 'ground')
      ? [{ id: 'GND', type: 'ground', value: 0, nodes: ['0'] }]
      : []),
  ];
  const cards = buildAllCards(allComponents, voltages, currents, meters);
  if (cards.length === 0) return null;
  return (
    <section className="result-section">
      <h4 className="section-title">🔬 Components</h4>
      <div className="comp-cards-list">
        {cards.map(({ comp, card }) => (
          <ComponentCard key={comp.id} card={card} />
        ))}
      </div>
    </section>
  );
}

// ── Structural faults section (shared) ───────────────────────────────────────
function FaultsSection({ structural_faults }) {
  const hasFaults = structural_faults?.length > 0;
  return (
    <section className="result-section">
      <h4 className="section-title">⚠ Structural Faults</h4>
      {hasFaults ? (
        <ul className="fault-list">
          {structural_faults.map((f, i) => (
            <li key={i} className="fault-item fault-warn">
              <strong>{formatStructuralFault(f).title}</strong>
              <span>{formatStructuralFault(f).detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="no-faults-line">No structural faults detected.</p>
      )}
    </section>
  );
}

// ── ResultsPanel ──────────────────────────────────────────────────────────────
function ResultsPanel({ results }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ── No results yet ──────────────────────────────────────────────────────
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
  const voltages   = { '0': 0, ...(simulation_data?.voltages ?? {}) };
  const currents   = simulation_data?.currents   ?? {};
  const meters     = simulation_data?.meters     ?? [];
  const components = simulation_data?.components ?? [];

  const hasFaults   = structural_faults?.length > 0;
  const isNormalML  = String(pattern_faults?.predicted_fault ?? '').toLowerCase() === 'normal';
  const mlAvailable = !!pattern_faults &&
    !['model_unavailable', 'no_simulation_data'].includes(pattern_faults.fault_type);
  const isAllClear  = success && !hasFaults && isNormalML && mlAvailable;

  // ── Failed simulation ───────────────────────────────────────────────────
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

  // ── All-clear: compact banner + collapsible detail ──────────────────────
  if (isAllClear) {
    return (
      <aside className="results-panel">
        <h3>Simulation Results</h3>
        <div className="results-content">
          <div className="all-clear-banner">
            <span className="all-clear-icon">✓</span>
            <div className="all-clear-text">
              <strong>Everything checks out</strong>
              <p>No structural faults · Circuit operating normally</p>
            </div>
          </div>
          <button
            type="button"
            className="details-toggle"
            onClick={() => setDetailsOpen(v => !v)}
            aria-expanded={detailsOpen}
          >
            {detailsOpen ? '▲ Hide details' : '▼ Show component data'}
          </button>
          {detailsOpen && (
            <div className="results-content">
              <CardsSection
                components={components}
                voltages={voltages}
                currents={currents}
                meters={meters}
              />
              <FaultsSection structural_faults={structural_faults} />
              <MlSection pattern_faults={pattern_faults} />
            </div>
          )}
        </div>
      </aside>
    );
  }

  // ── Expanded view (faults present or ML non-normal) ─────────────────────
  return (
    <aside className="results-panel">
      <h3>Simulation Results</h3>
      <div className="results-content">
        <CardsSection
          components={components}
          voltages={voltages}
          currents={currents}
          meters={meters}
        />
        <FaultsSection structural_faults={structural_faults} />
        <MlSection pattern_faults={pattern_faults} />
      </div>
    </aside>
  );
}

export default ResultsPanel;
