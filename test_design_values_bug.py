"""
Test to verify design_values implementation issue:
The frontend's convertCircuitToBackendFormat() creates design_values from
the CURRENT component values, which means changing a resistor from 1000Ω to 500Ω
will set design_values["R1"] = 500, making it identical to component_values["R1"] = 500.

This test simulates exactly what happens when a user changes a component value.
"""

import sys
from pathlib import Path
import json

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from fault_analyzer import FaultAnalyzer

def test_scenario_1_bug_reproduction():
    """
    Scenario 1: Current buggy behavior (design_values = component_values)
    
    User builds circuit with R1=1000Ω, R2=1000Ω, then changes R2 to 500Ω.
    Frontend sends: component_values = {R1: 1000, R2: 500}
                   design_values = {R1: 1000, R2: 500}  ← BUG: should be 1000!
    """
    print("=" * 80)
    print("SCENARIO 1: CURRENT BUGGY BEHAVIOR (design_values = component_values)")
    print("=" * 80)
    print("\nUser Action: Changed R2 from 1000Ω to 500Ω in the circuit editor")
    print("Expected: ML should detect 50% deviation from nominal 1000Ω")
    print("Actual: Frontend sends design_values[R2] = 500 (same as actual!)")
    
    circuit_data = {
        "components": [
            {"id": "V1", "type": "dc_source", "value": 10.0, "nodes": ["n1", "0"]},
            {"id": "R1", "type": "resistor", "value": 1000.0, "nodes": ["n1", "n2"]},
            {"id": "R2", "type": "resistor", "value": 500.0, "nodes": ["n2", "0"]},  # Changed!
        ],
        "ground": "0"
    }
    
    # This is what the BUGGY frontend converter sends:
    component_values_buggy = {"R1": 1000.0, "R2": 500.0}
    design_values_buggy = {"R1": 1000.0, "R2": 500.0}  # ← BUG: R2 should be 1000!
    
    print(f"\n📤 Data sent by frontend (BUGGY):")
    print(f"   component_values: {component_values_buggy}")
    print(f"   design_values:    {design_values_buggy}")
    print(f"   Are they equal? {component_values_buggy == design_values_buggy}")
    
    # Mock simulation results for this circuit
    # R_total = 1000 + 500 = 1500Ω
    # I = 10V / 1500Ω = 0.00667A
    # V(n2) = 0.00667A * 500Ω = 3.33V
    node_voltages = {"n1": 10.0, "n2": 3.33}
    branch_currents = {"R1": 0.00667, "R2": 0.00667}
    
    analyzer = FaultAnalyzer()
    result = analyzer.analyze(
        circuit_data=circuit_data,
        node_voltages=node_voltages,
        branch_currents=branch_currents,
        design_values=design_values_buggy  # ← BUG HERE
    )
    
    print(f"\n🎯 ML Prediction Result:")
    print(f"   predicted_fault: {result['predicted_fault']}")
    print(f"   confidence: {result['confidence']:.2%}")
    print(f"   drift_warnings: {len(result.get('drift_warnings', []))}")
    
    if result['predicted_fault'] == 'Normal':
        print("\n❌ BUG CONFIRMED: Model thinks circuit is Normal because deviation = 0%")
        print("   Reason: design_values[R2] = 500 matches component_values[R2] = 500")
    else:
        print(f"\n⚠️  Unexpected: Model detected {result['predicted_fault']}")
    
    return result


def test_scenario_2_correct_behavior():
    """
    Scenario 2: What SHOULD happen (design_values preserved from initial circuit)
    
    User builds circuit with R1=1000Ω, R2=1000Ω, then changes R2 to 500Ω.
    Frontend SHOULD send: component_values = {R1: 1000, R2: 500}
                         design_values = {R1: 1000, R2: 1000}  ← CORRECT: original!
    """
    print("\n" + "=" * 80)
    print("SCENARIO 2: CORRECT BEHAVIOR (design_values preserved)")
    print("=" * 80)
    print("\nUser Action: Changed R2 from 1000Ω to 500Ω in the circuit editor")
    print("Expected: ML should detect 50% deviation from nominal 1000Ω")
    print("Correct: Frontend sends design_values[R2] = 1000 (original value)")
    
    circuit_data = {
        "components": [
            {"id": "V1", "type": "dc_source", "value": 10.0, "nodes": ["n1", "0"]},
            {"id": "R1", "type": "resistor", "value": 1000.0, "nodes": ["n1", "n2"]},
            {"id": "R2", "type": "resistor", "value": 500.0, "nodes": ["n2", "0"]},  # Changed!
        ],
        "ground": "0"
    }
    
    # This is what the CORRECT frontend converter should send:
    component_values_correct = {"R1": 1000.0, "R2": 500.0}
    design_values_correct = {"R1": 1000.0, "R2": 1000.0}  # ← CORRECT: preserved original!
    
    print(f"\n📤 Data sent by frontend (CORRECT):")
    print(f"   component_values: {component_values_correct}")
    print(f"   design_values:    {design_values_correct}")
    print(f"   Are they equal? {component_values_correct == design_values_correct}")
    
    # Same simulation results
    node_voltages = {"n1": 10.0, "n2": 3.33}
    branch_currents = {"R1": 0.00667, "R2": 0.00667}
    
    analyzer = FaultAnalyzer()
    result = analyzer.analyze(
        circuit_data=circuit_data,
        node_voltages=node_voltages,
        branch_currents=branch_currents,
        design_values=design_values_correct  # ← CORRECT
    )
    
    print(f"\n🎯 ML Prediction Result:")
    print(f"   predicted_fault: {result['predicted_fault']}")
    print(f"   confidence: {result['confidence']:.2%}")
    print(f"   drift_warnings: {len(result.get('drift_warnings', []))}")
    for warning in result.get('drift_warnings', []):
        print(f"      {warning['message']}")
    
    if 'partial' in result['predicted_fault'].lower() or len(result.get('drift_warnings', [])) > 0:
        print("\n✅ CORRECT: Model detected deviation because design_values[R2] = 1000 != component_values[R2] = 500")
    else:
        print(f"\n⚠️  Unexpected: Model should detect fault with 50% deviation")
    
    return result


def main():
    print("\n" + "🔬" * 40)
    print("DESIGN_VALUES BUG VERIFICATION TEST")
    print("🔬" * 40)
    
    print("\nThis test verifies the design_values implementation by comparing:")
    print("  Scenario 1: Current buggy behavior (design_values = component_values)")
    print("  Scenario 2: Correct behavior (design_values preserved from original)")
    
    result1 = test_scenario_1_bug_reproduction()
    result2 = test_scenario_2_correct_behavior()
    
    print("\n" + "=" * 80)
    print("COMPARISON SUMMARY")
    print("=" * 80)
    print(f"\nScenario 1 (BUGGY - design_values = component_values):")
    print(f"   Predicted: {result1['predicted_fault']}")
    print(f"   Confidence: {result1['confidence']:.2%}")
    print(f"   Drift Warnings: {len(result1.get('drift_warnings', []))}")
    
    print(f"\nScenario 2 (CORRECT - design_values preserved):")
    print(f"   Predicted: {result2['predicted_fault']}")
    print(f"   Confidence: {result2['confidence']:.2%}")
    print(f"   Drift Warnings: {len(result2.get('drift_warnings', []))}")
    
    if result1['predicted_fault'] == 'Normal' and result2['predicted_fault'] != 'Normal':
        print("\n" + "🔴" * 40)
        print("BUG CONFIRMED!")
        print("🔴" * 40)
        print("\n⚠️  The frontend's convertCircuitToBackendFormat() is BROKEN:")
        print("   It creates design_values from CURRENT values instead of ORIGINAL values.")
        print("\n   Line in circuitConverter.js:")
        print("   designValues[comp.id] = comp.value;  ← This is WRONG!")
        print("\n   Should be:")
        print("   designValues[comp.id] = comp.originalValue || comp.value;")
        print("\n   Without preserving original values, the ML model cannot detect")
        print("   deviations because design_values == component_values always.")
        print("🔴" * 40)
    else:
        print("\n✅ Behavior is consistent (or both scenarios detected correctly)")


if __name__ == "__main__":
    main()
