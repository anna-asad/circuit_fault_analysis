"""Test the complete backend integration: validation → simulation → ML analysis."""

import sys
import json
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from validators import CircuitValidator
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from fault_analyzer import FaultAnalyzer

def test_complete_flow():
    """Test a complete simulation flow."""
    print("=" * 80)
    print("COMPLETE BACKEND INTEGRATION TEST")
    print("=" * 80)
    
    # Test circuit: simple voltage divider with one faulty resistor
    circuit_dict = {
        "nodes": ["n1", "n2", "0"],
        "components": [
            {
                "id": "V1",
                "type": "dc_source",
                "value": 10.0,
                "nodes": ["n1", "0"],
                "position": {"x": 100, "y": 200}
            },
            {
                "id": "R1",
                "type": "resistor",
                "value": 1000.0,
                "nodes": ["n1", "n2"],
                "position": {"x": 200, "y": 200}
            },
            {
                "id": "R2",
                "type": "resistor",
                "value": 100.0,  # FAULT: should be 1000, but is 100 (90% short)
                "nodes": ["n2", "0"],
                "position": {"x": 300, "y": 200}
            },
        ],
        "ground": "0",
        "meters": [],
        "design_values": {
            "R1": 1000.0,
            "R2": 1000.0,  # This is what R2 SHOULD be
        }
    }
    
    # Step 1: Validation
    print("\n1️⃣  VALIDATION")
    print("-" * 80)
    validator = CircuitValidator()
    is_valid, errors, warnings = validator.validate(circuit_dict)
    
    if not is_valid:
        print(f"❌ Validation failed: {errors}")
        return False
    print(f"✅ Circuit valid")
    if warnings:
        print(f"⚠️  Warnings: {warnings}")
    
    # Step 2: Netlist Generation
    print("\n2️⃣  NETLIST GENERATION")
    print("-" * 80)
    try:
        netlist = generate_netlist(circuit_dict)
        print("✅ Netlist generated:")
        print(netlist)
    except Exception as e:
        print(f"❌ Netlist generation failed: {e}")
        return False
    
    # Step 3: Simulation
    print("\n3️⃣  NGSPICE SIMULATION")
    print("-" * 80)
    runner = SimulationRunner()
    
    # Check ngspice availability
    ngspice_installed, ngspice_version = runner.check_ngspice_installed()
    if not ngspice_installed:
        print("⚠️  ngspice not found - cannot run simulation")
        print("   Install ngspice to test simulation flow")
        print("   ML model can still be tested with mock data")
        return test_ml_with_mock_data(circuit_dict)
    
    print(f"✅ ngspice found: {ngspice_version}")
    
    try:
        sim_result = runner.run_simulation(netlist, circuit_data=circuit_dict)
        
        if not sim_result["success"]:
            print(f"❌ Simulation failed: {sim_result['error']}")
            return False
        
        print(f"✅ Simulation successful")
        print(f"\nNode Voltages:")
        for node, voltage in sim_result["voltages"].items():
            print(f"   {node}: {voltage:.4f} V")
        
        print(f"\nBranch Currents:")
        for comp, current in sim_result["currents"].items():
            print(f"   {comp}: {current:.6f} A")
        
    except Exception as e:
        print(f"❌ Simulation error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Step 4: ML Analysis
    print("\n4️⃣  ML FAULT ANALYSIS")
    print("-" * 80)
    analyzer = FaultAnalyzer()
    
    if not analyzer.is_model_loaded():
        print("❌ ML model not loaded")
        return False
    
    try:
        pattern_faults = analyzer.analyze(
            circuit_data=circuit_dict,
            node_voltages=sim_result["voltages"],
            branch_currents=sim_result["currents"],
            design_values=circuit_dict.get("design_values"),
        )
        
        print(f"✅ ML analysis complete")
        print(f"\n🔍 Results:")
        print(f"   Predicted Fault: {pattern_faults['predicted_fault']}")
        print(f"   Confidence: {pattern_faults['confidence']:.2%}")
        print(f"   Fault Type: {pattern_faults['fault_type']}")
        print(f"   Description: {pattern_faults['description']}")
        
        print(f"\n📊 All Probabilities:")
        for label, prob in pattern_faults['all_probabilities'].items():
            indicator = "🔴" if prob >= 0.5 else "⚪"
            print(f"   {indicator} {label}: {prob:.2%}")
        
        print(f"\n⚠️  Drift Warnings ({len(pattern_faults.get('drift_warnings', []))}):")
        for warning in pattern_faults.get('drift_warnings', []):
            print(f"   • {warning['message']}")
        
        # Verify expected result
        if 'partial_short' in pattern_faults['fault_type'].lower():
            print(f"\n✅ CORRECT: Detected partial short (R2 = 100Ω vs nominal 1000Ω)")
            return True
        else:
            print(f"\n⚠️  UNEXPECTED: Expected partial_short, got {pattern_faults['fault_type']}")
            return False
        
    except Exception as e:
        print(f"❌ ML analysis error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_ml_with_mock_data(circuit_dict):
    """Test ML analysis with mock simulation data (when ngspice unavailable)."""
    print("\n4️⃣  ML FAULT ANALYSIS (with mock data)")
    print("-" * 80)
    
    # Mock simulation results for the faulty circuit
    # R_total = 1000 + 100 = 1100Ω
    # I = 10V / 1100Ω = 0.00909A
    # V(n2) = 0.00909A * 100Ω = 0.909V
    mock_voltages = {
        "n1": 10.0,
        "n2": 0.909,
    }
    
    mock_currents = {
        "R1": 0.00909,
        "R2": 0.00909,
    }
    
    analyzer = FaultAnalyzer()
    
    if not analyzer.is_model_loaded():
        print("❌ ML model not loaded")
        return False
    
    try:
        pattern_faults = analyzer.analyze(
            circuit_data=circuit_dict,
            node_voltages=mock_voltages,
            branch_currents=mock_currents,
            design_values=circuit_dict.get("design_values"),
        )
        
        print(f"✅ ML analysis complete")
        print(f"\n🔍 Results:")
        print(f"   Predicted Fault: {pattern_faults['predicted_fault']}")
        print(f"   Confidence: {pattern_faults['confidence']:.2%}")
        print(f"   Fault Type: {pattern_faults['fault_type']}")
        print(f"   Description: {pattern_faults['description']}")
        
        print(f"\n📊 All Probabilities:")
        for label, prob in pattern_faults['all_probabilities'].items():
            indicator = "🔴" if prob >= 0.5 else "⚪"
            print(f"   {indicator} {label}: {prob:.2%}")
        
        print(f"\n⚠️  Drift Warnings ({len(pattern_faults.get('drift_warnings', []))}):")
        for warning in pattern_faults.get('drift_warnings', []):
            print(f"   • {warning['message']}")
        
        if 'partial_short' in pattern_faults['fault_type'].lower():
            print(f"\n✅ CORRECT: Detected partial short (R2 = 100Ω vs nominal 1000Ω)")
            return True
        else:
            print(f"\n⚠️  UNEXPECTED: Expected partial_short, got {pattern_faults['fault_type']}")
            return False
        
    except Exception as e:
        print(f"❌ ML analysis error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    success = test_complete_flow()
    
    print("\n" + "=" * 80)
    if success:
        print("✅ ALL TESTS PASSED - Backend integration working correctly")
    else:
        print("⚠️  Some tests had issues - check output above")
    print("=" * 80)


if __name__ == "__main__":
    main()
