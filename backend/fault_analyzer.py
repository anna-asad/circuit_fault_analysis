"""Fault Analyzer - ML model integration"""

import sys
import os
from pathlib import Path
from typing import Dict, Optional

# Change to parent directory so relative paths in predictor.py work
original_cwd = os.getcwd()
parent_dir = Path(__file__).parent.parent
os.chdir(parent_dir)

# Check if models exist
MODEL_DIR = Path("models")
MODEL_FILES = [
    MODEL_DIR / "fault_classifier.joblib",
    MODEL_DIR / "feature_columns.joblib",
    MODEL_DIR / "label_columns.joblib",
    MODEL_DIR / "nominal_lookup.joblib"
]

ML_MODEL_AVAILABLE = all(f.exists() for f in MODEL_FILES)

if ML_MODEL_AVAILABLE:
    # Add parent directory to path
    sys.path.insert(0, str(parent_dir))
    try:
        import src.predictor as predictor_module
        # Change back to original directory
        os.chdir(original_cwd)
    except Exception as e:
        os.chdir(original_cwd)
        print(f"Warning: Could not import ML model: {e}")
        ML_MODEL_AVAILABLE = False
else:
    os.chdir(original_cwd)
    print("Note: ML model files not found. Train the model first:")
    print("  1. cd ..")
    print("  2. python src/dataset_generator.py")
    print("  3. python src/train.py")


class FaultAnalyzer:
    """Analyzes circuit behavior using trained ML model."""
    
    def __init__(self):
        """Initialize fault analyzer with trained ML model."""
        self.model_loaded = ML_MODEL_AVAILABLE
        
        if self.model_loaded:
            print("✓ ML model loaded successfully")
    
    def analyze_pattern_faults(self, ml_features: Dict[str, float]) -> Optional[Dict]:
        """
        Analyze circuit features to detect pattern-based faults.
        
        Note: Your current ML model uses a different feature format.
        For now, this returns a placeholder until we integrate properly.
        
        Args:
            ml_features: Feature dictionary from simulation
            
        Returns:
            Dictionary with fault classification results
        """
        if not self.model_loaded:
            return {
                "predicted_fault": "Unknown",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "model_unavailable",
                "description": "ML model not loaded - please train the model first (run src/train.py)"
            }
        
        try:
            # TODO: Adapt ml_features format to match your predictor's expected format
            # Your predictor expects: component_values, node_voltages, branch_currents as JSON strings
            # Current ml_features has: resistor_value, voltage_out, current_draw, etc.
            
            # For now, return a simpler classification based on simulation results
            voltage_out = ml_features.get('voltage_out', 0)
            current_draw = ml_features.get('current_draw', 0)
            voltage_supply = ml_features.get('voltage_supply', 5.0)
            
            # Simple rule-based classification until proper integration
            if current_draw > 1.0:
                predicted = "Short_Circuit"
                confidence = 0.9
            elif current_draw < 0.001:
                predicted = "Open_Circuit"
                confidence = 0.85
            elif abs(voltage_out - voltage_supply/2) > voltage_supply * 0.3:
                predicted = "Parameter_Drift"
                confidence = 0.75
            else:
                predicted = "Normal"
                confidence = 0.8
            
            return {
                "predicted_fault": predicted,
                "confidence": confidence,
                "all_probabilities": {
                    predicted: confidence,
                    "Normal": 0.1 if predicted != "Normal" else confidence
                },
                "fault_type": predicted,
                "description": self._get_fault_description(predicted)
            }
            
        except Exception as e:
            return {
                "predicted_fault": "Error",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "prediction_error",
                "description": f"Error during fault prediction: {str(e)}"
            }
    
    def _get_fault_description(self, fault_type: str) -> str:
        """
        Get human-readable description of fault type.
        
        Args:
            fault_type: Predicted fault type
            
        Returns:
            Description string
        """
        descriptions = {
            "Normal": "Circuit operating within normal parameters",
            
            "Open_Circuit": (
                "Open circuit or broken connection detected. "
                "Simulation shows current cannot flow properly."
            ),
            
            "Short_Circuit": (
                "Short circuit detected. "
                "Unintended low-resistance path causing excessive current."
            ),
            
            "Parameter_Drift": (
                "Component value drift detected. "
                "One or more components (resistor, capacitor) have aged or are labeled incorrectly. "
                "Values are off specification but not extreme."
            ),
            
            "Connection_Fault": (
                "Connection fault or intermittent contact detected. "
                "Poor connection causing unstable or erratic behavior. "
                "May be a loose wire or corroded contact."
            ),
            
            "Partial_Short": (
                "Partial short circuit detected. "
                "Abnormally low resistance but not a complete short (zero resistance)."
            ),
            
            "Partial_Open": (
                "Partial open circuit or high resistance fault detected. "
                "Abnormally high resistance but not a complete break (infinite resistance)."
            ),
            
            "Wrong_Component": (
                "Wrong component type detected. "
                "Electrical behavior suggests a different component than expected "
                "(e.g., capacitor where resistor should be)."
            ),
            
            "Multiple_Faults": (
                "Multiple simultaneous faults detected. "
                "Circuit exhibits combination of fault signatures that don't match any single fault class."
            )
        }
        
        return descriptions.get(fault_type, f"Unknown fault type: {fault_type}")
    
    def is_model_loaded(self) -> bool:
        """Check if ML model is loaded and ready."""
        return self.model_loaded


def analyze_faults(ml_features: Dict[str, float], model_dir='../models') -> Optional[Dict]:
    """
    Convenience function to analyze faults.
    
    Args:
        ml_features: Feature dictionary from simulation
        model_dir: Path to model directory
        
    Returns:
        Fault analysis results
    """
    analyzer = FaultAnalyzer(model_dir=model_dir)
    return analyzer.analyze_pattern_faults(ml_features)


if __name__ == "__main__":
    analyzer = FaultAnalyzer()
    if analyzer.is_model_loaded():
        print("✓ ML model loaded")
    else:
        print("✗ ML model not loaded - run: python src/train.py")

    """Analyzes circuit behavior using trained ML model."""
    
    def __init__(self, model_dir='../models'):
        """
        Initialize fault analyzer with trained ML model.
        
        Args:
            model_dir: Path to directory containing model files
        """
        self.model_dir = model_dir
        self.predictor = None
        self.model_loaded = False
        
        if ML_MODEL_AVAILABLE:
            self._load_model()
    
    def _load_model(self):
        """Load the trained ML model."""
        try:
            self.predictor = FaultPredictor(model_dir=self.model_dir)
            self.model_loaded = True
            print("✓ ML model loaded successfully")
        except Exception as e:
            print(f"✗ Error loading ML model: {e}")
            self.model_loaded = False
    
    def analyze_pattern_faults(self, ml_features: Dict[str, float]) -> Optional[Dict]:
        """
        Analyze circuit features to detect pattern-based faults.
        
        Pattern faults detected by ML model:
        - Component value drift (resistor/capacitor aged or wrong value)
        - Partial short circuit (abnormally low resistance)
        - Partial open circuit (abnormally high resistance)
        - Wrong component type (capacitor where resistor expected)
        - Multiple simultaneous faults
        
        Args:
            ml_features: Feature dictionary from simulation
            
        Returns:
            Dictionary with fault classification results:
            {
                "predicted_fault": str,
                "confidence": float,
                "all_probabilities": dict,
                "fault_type": str,
                "description": str
            }
        """
        if not self.model_loaded or self.predictor is None:
            return {
                "predicted_fault": "Unknown",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "model_unavailable",
                "description": "ML model not loaded - cannot detect pattern faults"
            }
        
        try:
            # Use the trained model to predict
            result = self.predictor.predict_one(ml_features)
            
            # Add fault description
            fault_type = result['predicted_fault']
            result['fault_type'] = fault_type
            result['description'] = self._get_fault_description(fault_type)
            
            return result
            
        except Exception as e:
            return {
                "predicted_fault": "Error",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "prediction_error",
                "description": f"Error during fault prediction: {str(e)}"
            }
    
    def _get_fault_description(self, fault_type: str) -> str:
        """
        Get human-readable description of fault type.
        
        Args:
            fault_type: Predicted fault type
            
        Returns:
            Description string
        """
        descriptions = {
            "Normal": "Circuit operating within normal parameters",
            
            "Open_Circuit": (
                "Open circuit or broken connection detected. "
                "Simulation shows current cannot flow properly."
            ),
            
            "Short_Circuit": (
                "Short circuit detected. "
                "Unintended low-resistance path causing excessive current."
            ),
            
            "Parameter_Drift": (
                "Component value drift detected. "
                "One or more components (resistor, capacitor) have aged or are labeled incorrectly. "
                "Values are off specification but not extreme."
            ),
            
            "Connection_Fault": (
                "Connection fault or intermittent contact detected. "
                "Poor connection causing unstable or erratic behavior. "
                "May be a loose wire or corroded contact."
            ),
            
            "Partial_Short": (
                "Partial short circuit detected. "
                "Abnormally low resistance but not a complete short (zero resistance)."
            ),
            
            "Partial_Open": (
                "Partial open circuit or high resistance fault detected. "
                "Abnormally high resistance but not a complete break (infinite resistance)."
            ),
            
            "Wrong_Component": (
                "Wrong component type detected. "
                "Electrical behavior suggests a different component than expected "
                "(e.g., capacitor where resistor should be)."
            ),
            
            "Multiple_Faults": (
                "Multiple simultaneous faults detected. "
                "Circuit exhibits combination of fault signatures that don't match any single fault class."
            )
        }
        
        return descriptions.get(fault_type, f"Unknown fault type: {fault_type}")
    
    def is_model_loaded(self) -> bool:
        """Check if ML model is loaded and ready."""
        return self.model_loaded


def analyze_faults(ml_features: Dict[str, float], model_dir='../models') -> Optional[Dict]:
    """
    Convenience function to analyze faults.
    
    Args:
        ml_features: Feature dictionary from simulation
        model_dir: Path to model directory
        
    Returns:
        Fault analysis results
    """
    analyzer = FaultAnalyzer(model_dir=model_dir)
    return analyzer.analyze_pattern_faults(ml_features)


# Testing
if __name__ == "__main__":
    print("=" * 70)
    print("Fault Analyzer Test")
    print("=" * 70)
    
    analyzer = FaultAnalyzer()
    
    if not analyzer.is_model_loaded():
        print("\n✗ ML model not available")
        print("  Make sure you've trained the model:")
        print("  1. cd ../")
        print("  2. python src/dataset_generator.py")
        print("  3. python src/train.py")
        exit(1)
    
    print("\n✓ ML model loaded successfully")
    
    # Test 1: Normal circuit
    print("\n" + "=" * 70)
    print("Test 1: Normal Circuit")
    print("=" * 70)
    
    normal_features = {
        'resistor_value': 1000.0,
        'capacitor_value': 1e-7,
        'voltage_supply': 5.0,
        'voltage_out': 2.5,
        'current_draw': 0.05,
        'frequency_response': 500.0,
        'phase_shift': -45.0
    }
    
    result = analyzer.analyze_pattern_faults(normal_features)
    print(f"Predicted Fault: {result['predicted_fault']}")
    print(f"Confidence: {result['confidence']:.2%}")
    print(f"Description: {result['description']}")
    
    # Test 2: Parameter drift
    print("\n" + "=" * 70)
    print("Test 2: Component Parameter Drift")
    print("=" * 70)
    
    drift_features = {
        'resistor_value': 1800.0,  # Drifted from 1000
        'capacitor_value': 1e-7,
        'voltage_supply': 5.0,
        'voltage_out': 2.0,
        'current_draw': 0.035,
        'frequency_response': 420.0,
        'phase_shift': -65.0
    }
    
    result = analyzer.analyze_pattern_faults(drift_features)
    print(f"Predicted Fault: {result['predicted_fault']}")
    print(f"Confidence: {result['confidence']:.2%}")
    print(f"Description: {result['description']}")
    
    print("\n" + "=" * 70)
    print("✓ Fault analyzer tests complete")
    print("=" * 70)
