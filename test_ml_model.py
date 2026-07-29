"""Test script to diagnose ML model loading and prediction."""

import sys
from pathlib import Path
import joblib
import pandas as pd
import numpy as np

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from fault_analyzer import FaultAnalyzer

def test_model_loading():
    """Test if the model loads correctly."""
    print("=" * 80)
    print("TEST 1: Model Loading")
    print("=" * 80)
    
    analyzer = FaultAnalyzer()
    
    if analyzer.is_model_loaded():
        print("✅ Model loaded successfully!")
        print(f"   - Feature columns: {len(analyzer._feature_cols)}")
        print(f"   - Label columns: {len(analyzer._label_cols)}")
        print(f"   - Labels: {analyzer._label_cols}")
        return analyzer
    else:
        print("❌ Model failed to load")
        print("   Run: python src/train.py")
        return None


def test_simple_circuit_prediction(analyzer):
    """Test prediction on a simple normal circuit."""
    print("\n" + "=" * 80)
    print("TEST 2: Simple Normal Circuit Prediction")
    print("=" * 80)
    
    # Simple voltage divider: 10V source, R1=1000Ω, R2=1000Ω
    circuit_data = {
        "components": [
            {"id": "V1", "type": "dc_source", "value": 10, "nodes": ["n1", "0"]},
            {"id": "R1", "type": "resistor", "value": 1000, "nodes": ["n1", "n2"]},
            {"id": "R2", "type": "resistor", "value": 1000, "nodes": ["n2", "0"]},
        ],
        "ground": "0"
    }
    
    # Expected results for a normal 1:1 voltage divider
    node_voltages = {
        "n1": 10.0,   # source voltage
        "n2": 5.0,    # midpoint voltage (10V * 1000/(1000+1000))
    }
    
    branch_currents = {
        "R1": 0.005,  # 10V / 2000Ω total = 5mA
        "R2": 0.005,  # same current through series resistors
    }
    
    # Design values (nominals) for this specific circuit
    design_values = {
        "R1": 1000,
        "R2": 1000,
    }
    
    result = analyzer.analyze(
        circuit_data=circuit_data,
        node_voltages=node_voltages,
        branch_currents=branch_currents,
        design_values=design_values
    )
    
    print(f"Predicted Fault: {result['predicted_fault']}")
    print(f"Confidence: {result['confidence']:.2%}")
    print(f"Fault Type: {result['fault_type']}")
    print(f"Description: {result['description']}")
    print(f"\nAll Probabilities:")
    for label, prob in result['all_probabilities'].items():
        print(f"   {label}: {prob:.2%}")
    
    if result['fault_type'] == 'Normal':
        print("\n✅ Correctly identified as Normal circuit")
    else:
        print(f"\n⚠️  Expected Normal, got {result['fault_type']}")
    
    return result


def test_partial_short_prediction(analyzer):
    """Test prediction on a circuit with partial short."""
    print("\n" + "=" * 80)
    print("TEST 3: Partial Short Circuit Prediction")
    print("=" * 80)
    
    # Same voltage divider but R2 is shorted to 10% of nominal
    circuit_data = {
        "components": [
            {"id": "V1", "type": "dc_source", "value": 10, "nodes": ["n1", "0"]},
            {"id": "R1", "type": "resistor", "value": 1000, "nodes": ["n1", "n2"]},
            {"id": "R2", "type": "resistor", "value": 100, "nodes": ["n2", "0"]},  # 90% short!
        ],
        "ground": "0"
    }
    
    # Expected results with R2 shorted to 100Ω (10% of 1000Ω nominal)
    # Total resistance: 1000 + 100 = 1100Ω
    # Current: 10V / 1100Ω ≈ 0.00909A
    # V(n2) = 0.00909A * 100Ω ≈ 0.909V
    node_voltages = {
        "n1": 10.0,
        "n2": 0.909,  # much lower than nominal 5V
    }
    
    branch_currents = {
        "R1": 0.00909,
        "R2": 0.00909,
    }
    
    design_values = {
        "R1": 1000,
        "R2": 1000,  # nominal, but actual is 100
    }
    
    result = analyzer.analyze(
        circuit_data=circuit_data,
        node_voltages=node_voltages,
        branch_currents=branch_currents,
        design_values=design_values
    )
    
    print(f"Predicted Fault: {result['predicted_fault']}")
    print(f"Confidence: {result['confidence']:.2%}")
    print(f"Fault Type: {result['fault_type']}")
    print(f"Description: {result['description']}")
    print(f"\nAll Probabilities:")
    for label, prob in result['all_probabilities'].items():
        print(f"   {label}: {prob:.2%}")
    
    print(f"\nDrift Warnings: {len(result.get('drift_warnings', []))}")
    for warning in result.get('drift_warnings', []):
        print(f"   {warning['message']}")
    
    if 'partial_short' in result['fault_type'].lower():
        print("\n✅ Correctly identified partial short")
    else:
        print(f"\n⚠️  Expected partial_short, got {result['fault_type']}")
    
    return result


def test_feature_extraction():
    """Test feature extraction to verify schema consistency."""
    print("\n" + "=" * 80)
    print("TEST 4: Feature Extraction Schema Verification")
    print("=" * 80)
    
    analyzer = FaultAnalyzer()
    
    if not analyzer.is_model_loaded():
        print("❌ Model not loaded, skipping test")
        return
    
    # Create test data
    component_values = {"R1": 1000, "R2": 1000}
    node_voltages = {"n1": 10.0, "n2": 5.0}
    branch_currents = {"R1": 0.005, "R2": 0.005}
    design_values = {"R1": 1000, "R2": 1000}
    
    from fault_analyzer import _extract_features
    
    try:
        features = _extract_features(
            component_values, node_voltages, branch_currents,
            analyzer._nominal_lookup, None, design_values
        )
        
        print(f"✅ Feature extraction successful")
        print(f"   Extracted {len(features)} features")
        print(f"   Expected {len(analyzer._feature_cols)} features")
        
        if len(features) == len(analyzer._feature_cols):
            print("   ✅ Feature count matches")
        else:
            print(f"   ❌ Feature count mismatch!")
        
        print(f"\nExtracted features:")
        for name, value in features.items():
            print(f"   {name}: {value:.6f}")
        
        # Check for missing features
        missing = set(analyzer._feature_cols) - set(features.keys())
        if missing:
            print(f"\n❌ Missing features: {missing}")
        else:
            print(f"\n✅ All expected features present")
        
    except Exception as e:
        print(f"❌ Feature extraction failed: {e}")
        import traceback
        traceback.print_exc()


def main():
    print("Circuit Fault Detector - ML Model Diagnostics")
    print("=" * 80)
    
    analyzer = test_model_loading()
    
    if analyzer:
        test_feature_extraction()
        test_simple_circuit_prediction(analyzer)
        test_partial_short_prediction(analyzer)
    
    print("\n" + "=" * 80)
    print("DIAGNOSTICS COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
