import axios from 'axios';
import { convertCircuitToBackendFormat } from '../utils/circuitConverter';
import './SimulateButton.css';

const API_URL = 'http://localhost:8000';

function SimulateButton({ circuit, onSimulate, isSimulating, setIsSimulating }) {
  
  const handleSimulate = async () => {
    setIsSimulating(true);
    
    try {
      // Convert React Flow circuit to backend format
      const { nodes, edges } = circuit;
      
      if (!nodes || nodes.length === 0) {
        alert('⚠️ Please add components to the circuit first!');
        setIsSimulating(false);
        return;
      }

      if (edges.length === 0) {
        alert('⚠️ Please connect the components with wires!');
        setIsSimulating(false);
        return;
      }

      console.log('📊 Circuit before conversion:', { 
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes, 
        edges 
      });
      
      const circuitData = convertCircuitToBackendFormat(nodes, edges);

      // Keep a clean copy of meter metadata. The backend may strip or corrupt
      // the nodes/spiceName fields during Pydantic serialisation, so we always
      // inject the original frontend meters directly into the response rather
      // than relying on the backend to echo them back intact.
      const frontendMeters = circuitData.meters ?? [];

      console.log('✅ Sending to backend:', circuitData);

      const response = await axios.post(`${API_URL}/api/simulate`, circuitData);

      // Always overwrite simulation_data.meters with the frontend-authoritative
      // copy. This guarantees nodes + spiceName are present for ResultsPanel.
      if (response.data?.simulation_data) {
        response.data.simulation_data.meters = frontendMeters;
      }
      
      console.log('🎉 Simulation Results:', {
        success: response.data.success,
        voltages: response.data.simulation_data?.voltages,
        currents: response.data.simulation_data?.currents,
        structuralFaults: response.data.structural_faults,
        patternFaults: response.data.pattern_faults?.predicted_fault,
        confidence: response.data.pattern_faults?.confidence
      });
      
      onSimulate(response.data);
      
    } catch (error) {
      console.error('❌ Simulation error:', error);
      
      // Show detailed error in alert
      let errorMsg = 'Unknown error occurred';
      
      if (error.response) {
        // Backend returned error
        errorMsg = error.response.data?.detail || JSON.stringify(error.response.data);
      } else if (error.message) {
        // Conversion error or network error
        errorMsg = error.message;
      }
      
      alert('❌ Simulation Failed:\n\n' + errorMsg + '\n\nCheck browser console for details.');
      
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <button 
      className="simulate-btn"
      onClick={handleSimulate}
      disabled={isSimulating}
    >
      {isSimulating ? '⏳ Simulating...' : '▶️ Simulate'}
    </button>
  );
}

export default SimulateButton;
