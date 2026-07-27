from backend.netlist_generator import generate_netlist
from backend.simulation_runner import SimulationRunner


def test_open_switch_results_zero_current_and_preserve_source_voltage():
    circuit = {
        "nodes": ["n1", "n2", "0"],
        "components": [
            {"id": "V1", "type": "dc_source", "value": 5.0, "nodes": ["n1", "0"]},
            {"id": "SW1", "type": "switch", "state": "open", "nodes": ["n1", "n2"]},
            {"id": "R1", "type": "resistor", "value": 1000, "nodes": ["n2", "0"]},
        ],
        "ground": "0",
    }

    netlist = generate_netlist(circuit)
    result = SimulationRunner(timeout=10).run_simulation(netlist, circuit)

    assert result["success"] is True
    assert result["voltages"]["n1"] == 5.0
    assert result["currents"]["V1"] == 0.0
    assert result["currents"]["R1"] == 0.0
