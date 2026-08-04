"""
Test script for the fault report generator.
Demonstrates how to generate a comprehensive fault report.
"""

import sys
sys.path.insert(0, 'backend')

from report_generator import generate_fault_report
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from fault_analyzer import FaultAnalyzer
import json

def test_simple_circuit():
    """Test report generation for a simple voltage divider with fault."""
    
    # Circuit: 5V source with R1=1kΩ (nominal), R2=100Ω (10% of nominal 1kΩ)
    # This should trigger a partial_short fault
    circuit_data = {
        "circuit_id": "test_voltage_divider",
        "nodes": ["n1", "n2", "0"],
        "components": [
            {
                "id": "V1",
                "type": "dc_source",
                "value": 5.0,
                "nodes": ["n1", "0"],
                "position": {"x": 100, "y": 200}
            },
            {
                "id": "R1",
                "type": "resistor",
                "value": 1000.0,
                "nodes": ["n1", "n2"],
                "position": {"x": 300, "y": 200}
            },
            {
                "id": "R2",
                "type": "resistor",
                "value": 100.0,  # Faulty - should be 1000Ω
                "nodes": ["n2", "0"],
                "position": {"x": 500, "y": 200}
            }
        ],
        "ground": "0",
        "design_values": {
            "R1": 1000.0,
            "R2": 1000.0  # Nominal value
        }
    }
    
    print("=" * 80)
    print("FAULT REPORT GENERATOR TEST")
    print("=" * 80)
    print("\n1. Generating netlist...")
    
    netlist = generate_netlist(circuit_data)
    print(f"✓ Netlist generated ({len(netlist)} chars)")
    
    print("\n2. Running ngspice simulation...")
    runner = SimulationRunner()
    sim_result = runner.run_simulation(netlist, circuit_data)
    
    if not sim_result["success"]:
        print(f"✗ Simulation failed: {sim_result['error']}")
        return
    
    print(f"✓ Simulation successful")
    print(f"  Voltages: {len(sim_result['voltages'])} nodes")
    print(f"  Currents: {len(sim_result['currents'])} branches")
    
    print("\n3. Running ML fault analysis...")
    analyzer = FaultAnalyzer()
    
    if not analyzer.is_model_loaded():
        print("✗ ML model not loaded. Run: python src/train.py")
        return
    
    ml_predictions = analyzer.analyze(
        circuit_data=circuit_data,
        node_voltages=sim_result["voltages"],
        branch_currents=sim_result["currents"],
        design_values=circuit_data["design_values"]
    )
    
    print(f"✓ ML analysis complete")
    print(f"  Predicted fault: {ml_predictions['predicted_fault']}")
    print(f"  Confidence: {ml_predictions['confidence']:.2%}")
    
    print("\n4. Generating comprehensive report...")
    report = generate_fault_report(
        circuit_id=circuit_data["circuit_id"],
        circuit_data=circuit_data,
        netlist=netlist,
        simulation_result=sim_result,
        ml_predictions=ml_predictions,
        nominal_values=circuit_data["design_values"],
        add_rag_explanations=False  # Set to True to add RAG explanations
    )
    
    print(f"✓ Report generated in {report.generation_time_ms:.2f}ms")
    
    # Display report summary
    print("\n" + "=" * 80)
    print("REPORT SUMMARY")
    print("=" * 80)
    print(f"\nCircuit ID: {report.circuit_id}")
    print(f"Timestamp: {report.timestamp}")
    print(f"Topology: {report.topology_type}")
    print(f"Status: {report.overall_status}")
    
    print(f"\n📊 Components ({len(report.components)}):")
    for comp in report.components:
        dev_str = f" (⚠ {comp.deviation_pct:.1f}% drift)" if comp.deviation_pct else ""
        print(f"  • {comp.id} ({comp.type}): "
              f"{comp.actual_value}{comp.unit} / {comp.nominal_value}{comp.unit}{dev_str}")
    
    print(f"\n🔍 Symbolic Analysis:")
    if report.symbolic_analysis and not report.symbolic_analysis.error:
        print(f"  Status: {report.symbolic_analysis.cross_check_status}")
        print(f"  KCL Equations: {len(report.symbolic_analysis.kcl_equations)}")
        for kcl in report.symbolic_analysis.kcl_equations[:3]:  # Show first 3
            print(f"    • {kcl.equation_str}")
        print(f"  Cross-check: {', '.join(report.symbolic_analysis.cross_check_details[:2])}")
    else:
        print(f"  Error: {report.symbolic_analysis.error if report.symbolic_analysis else 'N/A'}")
    
    print(f"\n⚠ Detected Faults ({len(report.detected_faults)}):")
    for fault in report.detected_faults:
        print(f"  • {fault.component_id}: {fault.fault_type}")
        print(f"    Severity: {fault.severity} | Confidence: {fault.confidence:.2%}")
        print(f"    Deviation: {fault.deviation_metrics.get('deviation_pct', 0):.1f}%")
    
    print(f"\n💡 Recommendations ({len(report.recommendations)}):")
    for rec in report.recommendations[:3]:  # Show first 3
        print(f"  {rec.priority}. [{rec.severity}] {rec.fault_type}:")
        for action in rec.actions[:2]:  # Show first 2 actions
            print(f"     - {action}")
    
    # Save report to file
    output_file = f"fault_report_{report.circuit_id}.json"
    from dataclasses import asdict
    
    with open(output_file, 'w') as f:
        json.dump(asdict(report), f, indent=2)
    
    print(f"\n✓ Full report saved to: {output_file}")
    print(f"  File size: {len(json.dumps(asdict(report), indent=2))} bytes")
    
    return report


if __name__ == "__main__":
    try:
        report = test_simple_circuit()
        print("\n" + "=" * 80)
        print("TEST COMPLETE")
        print("=" * 80)
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
