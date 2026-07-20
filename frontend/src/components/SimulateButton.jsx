import axios from 'axios';
import { convertCircuitToBackendFormat } from '../utils/circuitConverter';
import './SimulateButton.css';

const API_URL = 'http://localhost:8000';

function SimulateButton({ circuit, onSimulate, isSimulating, setIsSimulating }) {

  const handleSimulate = async () => {
    setIsSimulating(true);
    try {
      const { nodes, edges } = circuit;

      if (!nodes || nodes.length === 0) {
        alert('Please add components to the circuit first.');
        return;
      }
      if (!edges || edges.length === 0) {
        alert('Please connect the components with wires.');
        return;
      }

      const circuitData = convertCircuitToBackendFormat(nodes, edges);
      // Preserve meter metadata client-side — Pydantic may strip spiceName/nodes
      const frontendMeters = circuitData.meters ?? [];

      const response = await axios.post(`${API_URL}/api/simulate`, circuitData);

      if (response.data?.simulation_data) {
        response.data.simulation_data.meters = frontendMeters;
      }

      onSimulate(response.data);

    } catch (error) {
      const msg = error.response?.data?.detail
        ?? (typeof error.response?.data === 'string' ? error.response.data : null)
        ?? error.message
        ?? 'Unknown error';
      alert('Simulation Failed:\n\n' + msg);
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
