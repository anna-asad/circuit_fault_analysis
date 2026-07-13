import './ResultsPanel.css';

function ResultsPanel({ results }) {
  if (!results) {
    return (
      <aside className="results-panel">
        <h3>Results</h3>
        <p className="no-results">Run simulation to see results</p>
      </aside>
    );
  }

  const { success, simulation_data, structural_faults, pattern_faults, error } = results;

  return (
    <aside className="results-panel">
      <h3>Simulation Results</h3>
      
      {success ? (
        <div className="results-content">
          {/* Voltages */}
          <section className="result-section">
            <h4>⚡ Voltages</h4>
            <div className="data-grid">
              {Object.entries(simulation_data?.voltages || {}).map(([node, voltage]) => (
                <div key={node} className="data-item">
                  <span className="data-label">V({node})</span>
                  <span className="data-value">{voltage.toFixed(3)}V</span>
                </div>
              ))}
            </div>
          </section>

          {/* Currents */}
          <section className="result-section">
            <h4>🔌 Currents</h4>
            <div className="data-grid">
              {Object.entries(simulation_data?.currents || {}).map(([source, current]) => (
                <div key={source} className="data-item">
                  <span className="data-label">I({source})</span>
                  <span className="data-value">{Math.abs(current * 1000).toFixed(2)}mA</span>
                </div>
              ))}
            </div>
          </section>

          {/* Structural Faults */}
          {structural_faults && structural_faults.length > 0 && (
            <section className="result-section">
              <h4>⚠️ Structural Faults</h4>
              <ul className="fault-list">
                {structural_faults.map((fault, idx) => (
                  <li key={idx} className="fault-item warning">{fault}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Pattern Faults (ML) */}
          {pattern_faults && (
            <section className="result-section">
              <h4>🤖 ML Classification</h4>
              <div className="ml-result">
                <div className="ml-prediction">
                  <strong>{pattern_faults.predicted_fault}</strong>
                  <span className="confidence">{(pattern_faults.confidence * 100).toFixed(1)}%</span>
                </div>
                <p className="ml-description">{pattern_faults.description}</p>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="error-message">
          <h4>❌ Simulation failed</h4>
          {error && <p className="error-detail">{error}</p>}

          {structural_faults && structural_faults.length > 0 && (
            <section className="result-section">
              <h4>⚠️ Structural Issues</h4>
              <ul className="fault-list">
                {structural_faults.map((fault, idx) => (
                  <li key={idx} className="fault-item warning">{fault}</li>
                ))}
              </ul>
            </section>
          )}

          {!error && (!structural_faults || structural_faults.length === 0) && (
            <p className="error-detail">The backend rejected the circuit, but no detailed message was returned.</p>
          )}
        </div>
      )}
    </aside>
  );
}

export default ResultsPanel;
