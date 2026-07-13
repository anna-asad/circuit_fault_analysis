import { useState } from 'react';
import CircuitCanvas from './components/CircuitCanvas';
import ComponentSidebar from './components/ComponentSidebar';
import SimulateButton from './components/SimulateButton';
import ResultsPanel from './components/ResultsPanel';
import './App.css';

function App() {
  const [circuit, setCircuit] = useState({ nodes: [], edges: [] });
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>⚡ Circuit Fault Detector</h1>
        <SimulateButton 
          circuit={circuit}
          onSimulate={setSimulationResults}
          isSimulating={isSimulating}
          setIsSimulating={setIsSimulating}
        />
      </header>
      
      <div className="app-body">
        <ComponentSidebar />
        
        <main className="canvas-container">
          <CircuitCanvas 
            setCircuit={setCircuit}
          />
        </main>
        
        <ResultsPanel results={simulationResults} />
      </div>
    </div>
  );
}

export default App;
