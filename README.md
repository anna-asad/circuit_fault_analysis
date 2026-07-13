# Fault Classification System

A machine learning system for classifying electronic circuit faults using ngspice simulations.

## Project Structure

```
├── dataset/
│   └── dataset.csv              # Training dataset (generated)
├── models/
│   ├── fault_classifier.joblib  # Trained model (generated)
│   ├── feature_columns.joblib   # Feature list (generated)
│   ├── label_columns.joblib     # Label encoder (generated)
│   └── nominal_lookup.joblib    # Label mapping (generated)
├── src/
│   ├── dataset_generator.py     # Generates dataset via ngspice
│   ├── train.py                 # Trains model and saves artifacts
│   ├── predictor.py             # Prediction engine (shared)
│   └── generate_test_sample.py  # Test sample generator
├── tests/
│   ├── test_model_ch3.py        # Chapter 3 specific tests
│   ├── test_36_samples.py       # Comprehensive 36-sample test
│   └── test_minimal_example.py  # Quick smoke test
└── requirements.txt
```

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### 1. Generate Dataset

```bash
python src/dataset_generator.py
```

This creates `dataset/dataset.csv` with simulated circuit data.

### 2. Train Model

```bash
python src/train.py
```

This trains the classifier and saves model files to `models/`:
- `fault_classifier.joblib` - trained Random Forest model
- `feature_columns.joblib` - list of feature names
- `label_columns.joblib` - label encoder
- `nominal_lookup.joblib` - fault type mappings

### 3. Run Predictions

```bash
python src/predictor.py
```

Or import in your code:

```python
from src.predictor import FaultPredictor

predictor = FaultPredictor()
result = predictor.predict_one({
    'resistor_value': 1000.0,
    'capacitor_value': 1e-7,
    'voltage_supply': 5.0,
    'voltage_out': 2.5,
    'current_draw': 0.05,
    'frequency_response': 500.0,
    'phase_shift': -45.0
})

print(f"Predicted: {result['predicted_fault']}")
print(f"Confidence: {result['confidence']:.2%}")
```

### 4. Generate Test Samples

```bash
python src/generate_test_sample.py
```

## Testing

Run individual test suites:

```bash
# Quick smoke test
python tests/test_minimal_example.py

# Chapter 3 scenarios
python tests/test_model_ch3.py

# Comprehensive 36-sample test
python tests/test_36_samples.py
```

## Fault Types

The system classifies circuits into:
- **Normal** - Functioning correctly
- **Open_Circuit** - Broken connection
- **Short_Circuit** - Unintended low-resistance path
- **Parameter_Drift** - Component values out of spec
- **Connection_Fault** - Intermittent or poor connection

## Independent Execution

All Python files are runnable independently:
- Each file has a `main()` function
- Each file includes proper imports
- Each file has a `if __name__ == '__main__'` block
- Test files add parent directory to Python path for imports
