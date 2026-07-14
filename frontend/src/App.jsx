import { useState } from 'react';
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

  const handleSimulateResults = (results) => {
    setSimulationResults(results);
    setShowResultsPage(true);
  };

  return showResultsPage ? (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ResultsPage
        results={simulationResults}
        circuit={circuit}
        onBack={() => {
          setShowResultsPage(false);
        }}
      />
    </div>
  ) : (
    <div className="app">
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
          <CircuitCanvas setCircuit={setCircuit} circuit={circuit} mode="edit" />
        </main>
      </div>
    </div>
  );
}

export default App;

