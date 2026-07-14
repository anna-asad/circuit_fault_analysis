import './ResultsPage.css';
import ResultsPanel from '../components/ResultsPanel';
import CircuitCanvas from '../components/CircuitCanvas';

function ResultsPage({ results, onBack, circuit }) {
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
        <div className="results-panel-wrap">
          <div className="results-canvas-readonly">
            <CircuitCanvas setCircuit={() => {}} circuit={circuit} mode="results" />
          </div>
          <ResultsPanel results={results} />
        </div>
      </main>

    </div>
  );
}

export default ResultsPage;


