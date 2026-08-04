"""
Test script for PDF report generation.

This script tests the PDF report generator with a sample faulty circuit.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from report_generator import generate_fault_report, save_report_as_pdf
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from fault_analyzer import FaultAnalyzer

# Sample circuit with a fault (partial short in R2)
circuit_data = {
    "nodes": ["n1", "n2", "0"],
    "components": [
        {"id": "V1", "type": "dc_source", "value": 10.0, "nodes": ["n1", "0"]},
        {"id": "R1", "type": "resistor", "value": 1000.0, "nodes": ["n1", "n2"]},
        {"id": "R2", "type": "resistor", "value": 300.0, "nodes": ["n2", "0"]},  # Should be 1000, this is a fault
    ],
    "ground": "0"
}

# Design values (what the circuit should have)
design_values = {
    "R1": 1000.0,
    "R2": 1000.0
}

print("=" * 80)
print("Testing PDF Report Generation")
print("=" * 80)

# Step 1: Generate netlist
print("\n1. Generating SPICE netlist...")
netlist = generate_netlist(circuit_data)
print(netlist)

# Step 2: Run simulation
print("\n2. Running ngspice simulation...")
runner = SimulationRunner()
sim_result = runner.run_simulation(netlist, circuit_data=circuit_data)

if not sim_result["success"]:
    print(f"ERROR: Simulation failed: {sim_result['error']}")
    exit(1)

print(f"✓ Simulation completed successfully")
print(f"  Voltages: {sim_result['voltages']}")
print(f"  Currents: {sim_result['currents']}")

# Step 3: Run ML fault analysis
print("\n3. Running ML fault analysis...")
analyzer = FaultAnalyzer()
ml_predictions = analyzer.analyze(
    circuit_data=circuit_data,
    node_voltages=sim_result["voltages"],
    branch_currents=sim_result["currents"],
    design_values=design_values
)

print(f"✓ ML analysis completed")
print(f"  Fault type: {ml_predictions['fault_type']}")
print(f"  Confidence: {ml_predictions['confidence']:.2%}")

# Step 4: Generate report
print("\n4. Generating comprehensive report...")
report = generate_fault_report(
    circuit_id="test_voltage_divider",
    circuit_data=circuit_data,
    netlist=netlist,
    simulation_result=sim_result,
    ml_predictions=ml_predictions,
    nominal_values=design_values,
    add_rag_explanations=False  # Skip RAG for quick test
)

print(f"✓ Report generated successfully")
print(f"  Circuit ID: {report.circuit_id}")
print(f"  Status: {report.overall_status}")
print(f"  Detected faults: {len(report.detected_faults)}")
print(f"  Recommendations: {len(report.recommendations)}")

# Step 5: Save as PDF
print("\n5. Saving report as PDF...")
pdf_path = "test_fault_report.pdf"

try:
    save_report_as_pdf(report, pdf_path)
    print(f"✓ PDF saved successfully: {pdf_path}")
except ImportError as e:
    print(f"ERROR: {e}")
    print("\nPlease install reportlab:")
    print("  pip install reportlab")
    exit(1)
except Exception as e:
    print(f"ERROR: Failed to generate PDF: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "=" * 80)
print("PDF Report Generation Test Complete!")
print("=" * 80)
print(f"\nOpen the generated PDF: {pdf_path}")
