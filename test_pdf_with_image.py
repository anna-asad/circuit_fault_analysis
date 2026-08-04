"""
Test script for PDF report generation with circuit image.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from report_generator import generate_fault_report, save_report_as_pdf
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from fault_analyzer import FaultAnalyzer
import base64

# Sample circuit with a fault (partial short in R2)
circuit_data = {
    "nodes": ["n1", "n2", "0"],
    "components": [
        {"id": "V1", "type": "dc_source", "value": 10.0, "nodes": ["n1", "0"]},
        {"id": "R1", "type": "resistor", "value": 1000.0, "nodes": ["n1", "n2"]},
        {"id": "R2", "type": "resistor", "value": 300.0, "nodes": ["n2", "0"]},
    ],
    "ground": "0"
}

design_values = {
    "R1": 1000.0,
    "R2": 1000.0
}

print("=" * 80)
print("Testing PDF Report Generation with Circuit Image")
print("=" * 80)

# Step 1: Generate netlist
print("\n1. Generating SPICE netlist...")
netlist = generate_netlist(circuit_data)

# Step 2: Run simulation
print("\n2. Running ngspice simulation...")
runner = SimulationRunner()
sim_result = runner.run_simulation(netlist, circuit_data=circuit_data)

if not sim_result["success"]:
    print(f"ERROR: Simulation failed: {sim_result['error']}")
    exit(1)

print(f"✓ Simulation completed successfully")

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
    circuit_id="test_voltage_divider_with_image",
    circuit_data=circuit_data,
    netlist=netlist,
    simulation_result=sim_result,
    ml_predictions=ml_predictions,
    nominal_values=design_values,
    add_explanations=True  # Use hardcoded explanations
)

print(f"✓ Report generated successfully")

# Step 5: Create a dummy circuit image (1x1 red pixel PNG as base64)
# In real usage, this comes from the frontend via html2canvas
dummy_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

# Step 6: Save as PDF with image
print("\n5. Saving report as PDF with circuit diagram...")
pdf_path = "test_fault_report_with_image.pdf"

try:
    save_report_as_pdf(report, pdf_path, circuit_image_base64=dummy_image)
    print(f"✓ PDF saved successfully: {pdf_path}")
except Exception as e:
    print(f"ERROR: Failed to generate PDF: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "=" * 80)
print("PDF Report Generation Test Complete!")
print("=" * 80)
print(f"\nOpen the generated PDF: {pdf_path}")
print("Note: The circuit image is a dummy 1x1 pixel. In production, this comes from the frontend.")
