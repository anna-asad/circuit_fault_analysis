import { useState, useCallback } from 'react';
import CircuitCanvas from './components/CircuitCanvas';
import ComponentSidebar from './components/ComponentSidebar';
import SimulateButton from './components/SimulateButton';
import ResultsPage from './pages/ResultsPage';
import './App.css';

function App() {
  const [circuit, setCircuit] = useState({ nodes: [], edges: [] });
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showResultsPage, setShowResultsPage] = useState(false);

  const handleSimulateResults = useCallback((results) => {
    setSimulationResults(results);
    setShowResultsPage(true);
  }, []);

  const handleBack = useCallback(() => {
    setShowResultsPage(false);
  }, []);

  return (
    <>
      {/*
        Both the editor and the results page are always mounted.
        Toggling display:none instead of conditional rendering keeps
        CircuitCanvas's internal ReactFlow state (nodes + edges) alive
        across the results → editor round-trip — fixing the "circuit
        disappears on Back" bug.
      */}

      {/* ── Editor view ─────────────────────────────────────────────── */}
      <div className="app" style={{ display: showResultsPage ? 'none' : 'flex' }}>
        <header className="app-header">
          <h1>⚡ Circuit Fault Detector</h1>
          <SimulateButton
            circuit={circuit}
            onSimulate={handleSimulateResults}
            isSimulating={isSimulating}
            setIsSimulating={setIsSimulating}
          />
        </header>

        <div className="app-body">
          <ComponentSidebar />
          <main className="canvas-container">
            <CircuitCanvas setCircuit={setCircuit} mode="edit" />
          </main>
        </div>
      </div>

      {/* ── Results view ─────────────────────────────────────────────── */}
      {showResultsPage && (
        <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ResultsPage
            results={simulationResults}
            circuit={circuit}
            onBack={handleBack}
          />
        </div>
      )}
    </>
  );
}

export default App;

