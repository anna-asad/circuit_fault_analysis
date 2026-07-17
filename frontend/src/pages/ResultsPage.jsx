import { useState } from 'react';
import './ResultsPage.css';
import CircuitCanvas from '../components/CircuitCanvas';
import { buildAllCards } from '../utils/componentCards';

// ── ComponentCard ─────────────────────────────────────────────────────────────
// Single unified card for every component type.
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
      {card.note && (
        <p className="comp-card-note">{card.note}</p>
      )}
    </div>
  );
}

// ── ResultsPage ───────────────────────────────────────────────────────────────
function ResultsPage({ results, onBack, circuit }) {
  const [cardsOpen, setCardsOpen] = useState(true);
  const [faultsOpen, setFaultsOpen] = useState(true);
  const [mlOpen, setMlOpen] = useState(true);

  if (!results) {
    return (
      <div className="results-page">
        <header className="results-page-header">
          <div className="results-page-title">
            <span className="results-page-title-icon">⚡</span>
            <h2>Simulation Results</h2>
          </div>
          {onBack && (
            <button type="button" className="results-page-back" onClick={onBack}>
              ← Back to editor
            </button>
          )}
        </header>
        <main className="results-page-body">
          <div className="results-empty-state">No simulation results available</div>
        </main>
      </div>
    );
  }

  const { success, simulation_data, structural_faults, pattern_faults, error } = results;
  const voltages   = { '0': 0, ...(simulation_data?.voltages ?? {}) };
  const currents   = simulation_data?.currents   ?? {};
  const meters     = simulation_data?.meters     ?? [];
  const components = simulation_data?.components ?? [];

  const hasFaults  = structural_faults?.length > 0;
  const isNormalML = String(pattern_faults?.predicted_fault ?? '').toLowerCase() === 'normal';
  const mlAvailable = !!pattern_faults &&
    !['model_unavailable', 'no_simulation_data'].includes(pattern_faults.fault_type);
  const isAllClear = success && !hasFaults && isNormalML && mlAvailable;

  // Add ground as a pseudo-component so its card shows
  const allComponents = [
    ...components,
    ...(!components.some(c => c.type === 'ground')
      ? [{ id: 'GND', type: 'ground', value: 0, nodes: ['0'] }]
      : []),
  ];

  const cards = buildAllCards(allComponents, voltages, currents, meters);

  const mlCardClass = !pattern_faults ? ''
    : isNormalML ? 'ml-card-page ml-card-page-normal'
    : ['model_unavailable','prediction_error','schema_mismatch'].includes(pattern_faults.fault_type)
      ? 'ml-card-page ml-card-page-unknown'
      : 'ml-card-page ml-card-page-fault';

  const LABEL_DISPLAY = {
    drift: 'Value Drift', partial_short: 'Partial Short',
    partial_open: 'Partial Open', wrong_component_type: 'Wrong Component',
    Normal: 'Normal', Multiple_Faults: 'Multiple Faults',
  };
  const displayLabel = raw => LABEL_DISPLAY[raw] ?? String(raw).replace(/_/g, ' ');

  const confClass = c => c >= 0.8 ? 'conf-badge conf-high'
    : c >= 0.5 ? 'conf-badge conf-mid' : 'conf-badge conf-low';

  return (
    <div className="results-page">
      <header className="results-page-header">
        <div className="results-page-title">
          <span className="results-page-title-icon">⚡</span>
          <h2>Simulation Results</h2>
        </div>
        {onBack && (
          <button type="button" className="results-page-back" onClick={onBack}>
            ← Back to editor
          </button>
        )}
      </header>

      <main className="results-page-body">
        {/* ── Left: circuit canvas ── */}
        <div className="results-canvas-container">
          <CircuitCanvas setCircuit={() => {}} circuit={circuit} mode="results" />
        </div>

        {/* ── Right: sidebar ── */}
        <aside className="results-sidebar">

          {/* Status banner */}
          <div className={`status-card ${isAllClear ? 'status-card-success' : success ? 'status-card-warn' : 'status-card-fault'}`}>
            <div className="status-card-icon">
              {isAllClear ? '✓' : success ? '⚠' : '✕'}
            </div>
            <div>
              <h3 className="status-card-title">
                {isAllClear
                  ? 'Everything checks out'
                  : !success
                    ? 'Simulation failed'
                    : (pattern_faults?.predicted_fault || 'Fault Detected')}
              </h3>
              <p className="status-card-subtitle">
                {isAllClear
                  ? 'No structural faults · Circuit operating normally'
                  : !success
                    ? (error ?? 'Check circuit wiring')
                    : hasFaults
                      ? structural_faults[0]
                      : (pattern_faults?.description ?? '')}
              </p>
            </div>
          </div>

          {/* ── Component cards ── */}
          {success && cards.length > 0 && (
            <section className="data-section">
              <button
                type="button"
                className="data-section-header"
                onClick={() => setCardsOpen(v => !v)}
              >
                <span className="data-section-title">🔬 Components</span>
                <span className="data-section-toggle">{cardsOpen ? '▼' : '▶'}</span>
              </button>
              {cardsOpen && (
                <div className="data-section-content comp-cards-list">
                  {cards.map(({ comp, card }) => (
                    <ComponentCard key={comp.id} card={card} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Structural faults ── */}
          <section className="data-section">
            <button
              type="button"
              className="data-section-header"
              onClick={() => setFaultsOpen(v => !v)}
            >
              <span className="data-section-title">⚠ Structural Faults</span>
              <span className="data-section-toggle">{faultsOpen ? '▼' : '▶'}</span>
            </button>
            {faultsOpen && (
              <div className="data-section-content">
                {hasFaults ? (
                  <ul className="fault-list-page">
                    {structural_faults.map((f, i) => (
                      <li key={i} className="fault-item-page">{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-faults-page">No structural faults detected.</p>
                )}
              </div>
            )}
          </section>

          {/* ── ML classification ── */}
          {pattern_faults && (
            <section className="data-section">
              <button
                type="button"
                className="data-section-header"
                onClick={() => setMlOpen(v => !v)}
              >
                <span className="data-section-title">🤖 ML Classification</span>
                <span className="data-section-toggle">{mlOpen ? '▼' : '▶'}</span>
              </button>
              {mlOpen && (
                <div className="data-section-content">
                  <div className={mlCardClass} style={{ margin: '8px 12px' }}>
                    <div className="ml-pred-row">
                      <strong>{displayLabel(pattern_faults.predicted_fault)}</strong>
                      <span className={confClass(pattern_faults.confidence)}>
                        {(pattern_faults.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="ml-desc-page">{pattern_faults.description}</p>
                    {!isNormalML && pattern_faults.all_probabilities &&
                      Object.keys(pattern_faults.all_probabilities).length > 0 && (
                      <div className="ml-probs-page">
                        {Object.entries(pattern_faults.all_probabilities)
                          .sort((a, b) => b[1] - a[1])
                          .map(([label, prob]) => (
                            <div key={label} className="ml-prob-row-page">
                              <span className="ml-prob-label-page">{displayLabel(label)}</span>
                              <div className="ml-prob-bar-wrap-page">
                                <div
                                  className={`ml-prob-bar-page${prob >= 0.5 ? ' fired' : ''}`}
                                  style={{ width: `${Math.round(prob * 100)}%` }}
                                />
                              </div>
                              <span className="ml-prob-pct-page">{(prob * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

        </aside>
      </main>
    </div>
  );
}

export default ResultsPage;
