import { useState } from 'react';
import './ResultsPage.css';
import CircuitCanvas from '../components/CircuitCanvas';
import { buildAllCards } from '../utils/componentCards';
import axios from 'axios';

const STRUCTURAL_STATUS_RULES = [
  { pattern: /short circuit/i, title: 'Short Circuit' },
  { pattern: /open circuit/i, title: 'Open Circuit' },
  { pattern: /ammeter/i, title: 'Ammeter Fault' },
  { pattern: /voltmeter/i, title: 'Voltmeter Fault' },
  { pattern: /component bypass/i, title: 'Component Bypass' },
  { pattern: /reversed polarity/i, title: 'Reversed Polarity' },
  { pattern: /missing ground reference/i, title: 'Missing Ground' },
];

function getStructuralStatus(structural_faults) {
  const firstFault = structural_faults?.[0] ?? '';
  const rule = STRUCTURAL_STATUS_RULES.find(entry => entry.pattern.test(firstFault));

  return {
    title: rule?.title ?? 'Structural Fault Detected',
    subtitle: firstFault,
  };
}

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
  
  // AI Explanation state
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState(null);

  const handleExplainFault = async (faultType, components) => {
    setLoadingExplanation(true);
    setExplanationError(null);
    
    try {
      const componentType = components?.find(c => c.type !== 'ground')?.type || 'circuit';
      const response = await axios.post('http://localhost:8000/api/explain-fault', {
        fault_type: faultType || 'unknown',
        component: componentType
      });
      
      setAiExplanation(response.data.explanation);
    } catch (error) {
      console.error('Failed to get AI explanation:', error);
      setExplanationError('Failed to get explanation. Please try again.');
    } finally {
      setLoadingExplanation(false);
    }
  };

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
  const voltages      = { '0': 0, ...(simulation_data?.voltages ?? {}) };
  const currents      = simulation_data?.currents       ?? {};
  const meters        = simulation_data?.meters         ?? [];
  const components    = simulation_data?.components     ?? [];
  const driftWarnings = simulation_data?.drift_warnings ?? [];

  const hasFaults  = structural_faults?.length > 0;
  const isNormalML = String(pattern_faults?.predicted_fault ?? '').toLowerCase() === 'normal';
  const mlAvailable = !!pattern_faults &&
    !['model_unavailable', 'no_simulation_data'].includes(pattern_faults.fault_type);

  // Detect open circuit state: circuit is structurally valid but inactive
  // (e.g. an open switch). This is a non-fatal circuit state, not an error.
  const isOpenCircuit = hasFaults && structural_faults.some(
    f => /open.?circuit/i.test(f) && /switch/i.test(f)
  );

  const isAllClear = success && !hasFaults && isNormalML && mlAvailable;
  const structuralStatus = getStructuralStatus(structural_faults);
  const firstStructuralFault = structural_faults?.[0] ?? '';
  const displayStructuralFault = formatStructuralFault(firstStructuralFault);
  const statusTitle = isAllClear
    ? 'Everything checks out'
    : isOpenCircuit
      ? 'Open Circuit Detected'
      : !success
        ? 'Simulation failed'
        : hasFaults
          ? structuralStatus.title
          : (pattern_faults?.predicted_fault || 'Fault Detected');
  const statusSubtitle = isAllClear
    ? 'No structural faults · Circuit operating normally'
    : isOpenCircuit
      ? 'The circuit is valid, but no current is flowing because the switch is open.'
      : !success
        ? (displayStructuralFault.detail || error || 'Check circuit wiring')
        : hasFaults
          ? displayStructuralFault.detail
          : (pattern_faults?.description ?? '');
  const statusClass = isAllClear
    ? 'status-card-success'
    : isOpenCircuit
      ? 'status-card-warn'
      : !success
        ? 'status-card-fault'
        : hasFaults
          ? 'status-card-fault'
          : 'status-card-warn';

  // Override the structural faults section title when it's an open circuit
  const structuralFaultsTitle = isOpenCircuit
    ? 'ℹ Circuit Status'
    : '⚠ Structural Faults';

  // Add ground as a pseudo-component so its card shows
  const allComponents = [
    ...components,
    ...(!components.some(c => c.type === 'ground')
      ? [{ id: 'GND', type: 'ground', value: 0, nodes: ['0'] }]
      : []),
  ];

  const cards = buildAllCards(allComponents, voltages, currents, meters);

const bulbStateMap = new Map(
    (simulation_data?.components ?? [])
      .filter(comp => comp.type === 'bulb')
      .map(comp => [comp.id, comp.state || comp.brightness || 'off'])
  );

  const canvasCircuit = {
    ...(circuit ?? {}),
    nodes: (circuit?.nodes ?? []).map(node => {
      const componentId = node.data?.componentId || node.data?.label;
      const bulbState = bulbStateMap.get(componentId);
      if (node.data?.componentType === 'bulb' && bulbState) {
        return {
          ...node,
          data: {
            ...node.data,
            state: bulbState,
          },
        };
      }
      return node;
    }),
    edges: circuit?.edges ?? [],
  };

  const mlCardClass = !pattern_faults ? ''
    : isNormalML ? 'ml-card-page ml-card-page-normal'
    : ['model_unavailable','prediction_error','schema_mismatch'].includes(pattern_faults.fault_type)
      ? 'ml-card-page ml-card-page-unknown'
      : 'ml-card-page ml-card-page-fault';

  const LABEL_DISPLAY = {
    partial_short: 'Partial Short',
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
          <CircuitCanvas setCircuit={() => {}} circuit={canvasCircuit} mode="results" />
        </div>

        {/* ── Right: sidebar ── */}
        <aside className="results-sidebar">

          {/* Status banner */}
          <div className={`status-card ${statusClass}`}>
            <div className="status-card-icon">
              {isAllClear ? '✓' : '⚠'}
            </div>
            <div>
              <h3 className="status-card-title">
                {statusTitle}
              </h3>
              <p className="status-card-subtitle">
                {statusSubtitle}
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

          {/* ── Drift warnings ── */}
          {success && driftWarnings.length > 0 && (
            <section className="data-section">
              <div className="data-section-header" style={{ cursor: 'default' }}>
                <span className="data-section-title">⚠ Value Drift Detected</span>
              </div>
              <div className="data-section-content">
                <ul className="fault-list-page">
                  {driftWarnings.map((w, i) => (
                    <li key={i} className="drift-item-page">
                      <strong className="drift-comp-page">{w.component_id}</strong>
                      <span>{w.message}</span>
                    </li>
                  ))}
                </ul>
                <p className="drift-note-page">
                  Informational only — does not affect the ML classification.
                </p>
              </div>
            </section>
          )}

          {/* ── Structural faults / Circuit Status ── */}
          <section className="data-section">
            <button
              type="button"
              className="data-section-header"
              onClick={() => setFaultsOpen(v => !v)}
            >
              <span className="data-section-title">{structuralFaultsTitle}</span>
              <span className="data-section-toggle">{faultsOpen ? '▼' : '▶'}</span>
            </button>
            {faultsOpen && (
              <div className="data-section-content">
                {isOpenCircuit ? (
                  <ul className="fault-list-page">
                    <li className="fault-item-page" style={{ background: '#fef9c3', borderLeft: '3px solid #eab308' }}>
                      <strong>Open circuit detected.</strong>
                      <span>The simulation completed successfully, but the electrical path is incomplete. This is not a wiring fault—it is the expected behavior when a switch is left open.</span>
                    </li>
                  </ul>
                ) : hasFaults ? (
                  <ul className="fault-list-page">
                    {structural_faults.map((f, i) => (
                      <li key={i} className="fault-item-page">
                        <strong>{formatStructuralFault(f).title}</strong>
                        <span>{formatStructuralFault(f).detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-faults-page">No structural faults detected.</p>
                )}
              </div>
            )}
          </section>

          {/* ── ML classification ── */}
          {isOpenCircuit ? (
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
                  <div className="ml-card-page ml-card-page-unknown" style={{ margin: '8px 12px' }}>
                    <div className="ml-pred-row">
                      <strong>Not Applicable</strong>
                    </div>
                    <p className="ml-desc-page">
                      The circuit is inactive because no current is flowing. Fault classification is skipped until the circuit is closed.
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : pattern_faults && (
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
                    
                    {/* AI Explanation Button - only show for non-normal faults */}
                    {!isNormalML && (
                      <div className="ai-explain-section" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <button
                          type="button"
                          className="ai-explain-button"
                          onClick={() => handleExplainFault(pattern_faults.predicted_fault, components)}
                          disabled={loadingExplanation}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: loadingExplanation ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(102, 126, 234, 0.2)',
                            opacity: loadingExplanation ? 0.7 : 1
                          }}
                        >
                          {loadingExplanation ? '🤔 Thinking...' : '🤖 Explain with AI'}
                        </button>
                        
                        {aiExplanation && (
                          <div style={{
                            marginTop: '10px',
                            padding: '12px',
                            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
                            border: '1px solid #c4b5fd',
                            borderRadius: '8px',
                            animation: 'fadeIn 0.3s ease-in'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <span style={{ fontSize: '14px' }}>✨</span>
                              <strong style={{ fontSize: '11px', color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                AI Explanation
                              </strong>
                            </div>
                            <p style={{ fontSize: '12px', color: '#4c1d95', lineHeight: '1.6', margin: 0 }}>
                              {aiExplanation}
                            </p>
                          </div>
                        )}
                        
                        {explanationError && (
                          <div style={{
                            marginTop: '8px',
                            padding: '8px 10px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            fontSize: '11px',
                            color: '#991b1b'
                          }}>
                            {explanationError}
                          </div>
                        )}
                      </div>
                    )}
                    
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
