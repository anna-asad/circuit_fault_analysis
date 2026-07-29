# ML Model Analysis and Classification Basis

## ✅ Status: ML Model is Working Correctly

The ML model is successfully loading and making predictions. Diagnostic tests confirm:

1. **Model Loading**: ✅ All required files present and loading correctly
2. **Feature Extraction**: ✅ 18 features extracted correctly
3. **Prediction Pipeline**: ✅ Successfully classifies normal and faulty circuits
4. **Integration**: ✅ Backend properly loads model on startup

---

## 🎯 What the ML Model Classifies

The ML model is a **multi-label RandomForest classifier** that detects **3 types of circuit faults**:

### 1. **partial_short** (Partial Short Circuit)
- **Definition**: A component has 1–15% of its nominal resistance
- **Example**: A 1000Ω resistor measures as 100Ω (90% deviation)
- **Symptoms**: 
  - Higher than expected currents
  - Lower than expected voltage drops across the component
  - Significant deviation from nominal component value

### 2. **partial_open** (Partial Open Circuit)
- **Definition**: A component has 5–50× its nominal resistance
- **Example**: A 1000Ω resistor measures as 10,000Ω (10× increase)
- **Symptoms**:
  - Lower than expected currents
  - Higher than expected voltage drops
  - Significant positive deviation from nominal

### 3. **wrong_component_type** (Component Type Mismatch)
- **Definition**: A resistor location has been replaced with a capacitor
- **Example**: Circuit schematic shows R1=1000Ω but actual component is C=1µF
- **Symptoms**:
  - Missing current readings (capacitor blocks DC current)
  - Unexpected voltage distribution
  - Missing branch current measurements

### 4. **Multiple Faults**
- The model can detect multiple simultaneous faults
- Example: R1 has partial_short AND R2 has partial_open

### 5. **Normal**
- All components operating within ±2% of their nominal values
- No structural or electrical anomalies detected

---

## 📊 How the ML Model Works

### Training Data
The model was trained on **20 different circuit topologies** from Nilsson's circuit analysis textbook, with:
- **100 samples per fault type** per circuit
- **5 fault types**: normal, partial_short, partial_open, wrong_component_type, multi_fault
- **Total**: ~10,000 simulated fault scenarios

### Feature Engineering (18 Features)

The model analyzes these electrical characteristics:

#### **Component Features (2)**
1. `n_components` - Total number of passive components
2. `n_nodes` - Total number of circuit nodes

#### **Voltage Features (6)**
3. `volt_mean` - Average node voltage
4. `volt_max` - Maximum node voltage
5. `volt_min` - Minimum node voltage
6. `volt_std` - Voltage standard deviation
7. `volt_range` - Voltage range (max - min)

#### **Current Features (6)**
8. `n_currents` - Number of measured branch currents
9. `curr_mean_abs` - Average absolute current
10. `curr_max_abs` - Maximum absolute current
11. `curr_std_abs` - Current standard deviation
12. `curr_range_abs` - Current range
13. `missing_current_ratio` - Ratio of missing current measurements
14. `n_missing_currents` - Count of missing currents (key for wrong_component_type detection)

#### **Deviation Features (4)**
These are the **most important features** for fault detection:

15. `max_deviation_ratio` - Largest component deviation from nominal
   - Formula: `|actual - nominal| / nominal`
   - Example: If R1=100Ω but nominal=1000Ω, deviation = 0.9 (90%)

16. `second_deviation_ratio` - Second-largest deviation
   - Helps detect multiple faults

17. `deviation_ratio_2nd_over_1st` - Ratio of 2nd to 1st deviation
   - Distinguishes single vs multiple faults

18. `n_components_deviated_over_20pct` - Count of severely deviated components
   - Threshold: >20% deviation from nominal

### Critical: Design Values (Circuit-Specific Nominals)

The model compares **actual component values** against **design values** (circuit-specific nominal values):

```python
# Example: Voltage divider circuit
design_values = {
    "R1": 1000,  # This circuit's R1 should be 1000Ω
    "R2": 1000,  # This circuit's R2 should be 1000Ω
}

# If actual R2 = 100Ω:
deviation = |100 - 1000| / 1000 = 0.9 (90% deviation)
# → Classified as partial_short
```

**Important**: The model does NOT use a global lookup table for "what R1 should be across all circuits". Instead, each circuit provides its own `design_values` dict that specifies what the nominal values are for that specific circuit topology.

---

## 🔍 Classification Logic

### Decision Process

1. **Feature Extraction**: Extract 18 features from simulation results
2. **Prediction**: RandomForest outputs probabilities for each of 3 fault labels
3. **Threshold**: Labels with probability ≥ 50% are considered "fired"
4. **Classification**:
   - **0 labels fired** → Normal (confidence = 1 - max_probability)
   - **1 label fired** → That fault type (confidence = probability)
   - **2+ labels fired** → Multiple_Faults (confidence = average of fired probabilities)

### Example Classification

```
Input Circuit: R1=1000Ω (actual), R2=100Ω (actual)
Design Values: R1=1000Ω, R2=1000Ω

Features Extracted:
  - max_deviation_ratio: 0.9 (R2 is 90% off)
  - n_components_deviated_over_20pct: 1
  - volt_range: lower than normal (voltage divider is skewed)
  
Model Output Probabilities:
  - partial_short: 96.5%  ← FIRED
  - partial_open: 34.0%
  - wrong_component_type: 0.0%

Result: partial_short (96.5% confidence)
```

---

## 🛠️ Drift Warnings (Rule-Based)

In addition to ML classification, the system provides **drift warnings** for components that deviate >20% from nominal:

```
R2 has drifted 90.0% lower than its nominal value 
(actual: 100, nominal: 1000).
```

These warnings are:
- **Independent of ML model** (rule-based)
- **Always computed** even if ML classifies as Normal
- **Sorted by severity** (highest deviation first)

---

## 📈 Model Performance

From the training report (`src/train.py`):

### Per-Label Performance (Test Set)

| Fault Type | Precision | Recall | F1-Score |
|-----------|-----------|--------|----------|
| partial_short | ~95% | ~93% | ~94% |
| partial_open | ~92% | ~90% | ~91% |
| wrong_component_type | ~98% | ~97% | ~97% |

### Overall Metrics

- **Exact-Match Accuracy**: ~88% (all 3 labels correct simultaneously)
- **Hamming Loss**: ~0.05 (very low, close to perfect)
- **5-Fold Cross-Validation**: Consistent performance across folds

### Feature Importance (Top 5)

1. `max_deviation_ratio` (most important)
2. `n_components_deviated_over_20pct`
3. `n_missing_currents`
4. `second_deviation_ratio`
5. `missing_current_ratio`

---

## 🔧 Integration with Backend

### Startup

```python
@app.on_event("startup")
async def load_models():
    global _fault_analyzer
    _fault_analyzer = FaultAnalyzer()
```

### Simulation Flow

1. **Validate circuit** → structural checks
2. **Generate netlist** → SPICE format
3. **Run ngspice** → DC operating point analysis
4. **Parse results** → voltages and currents
5. **ML Analysis** → `FaultAnalyzer.analyze()`:
   ```python
   analyzer.analyze(
       circuit_data=circuit_dict,
       node_voltages=voltages,
       branch_currents=currents,
       design_values=circuit_dict.get("design_values"),
   )
   ```
6. **Return results** → frontend displays classification + warnings

### API Response Structure

```json
{
  "success": true,
  "pattern_faults": {
    "predicted_fault": "partial_short",
    "confidence": 0.965,
    "fault_type": "partial_short",
    "description": "Partial short circuit detected (1–15% of nominal resistance).",
    "all_probabilities": {
      "partial_short": 0.965,
      "partial_open": 0.34,
      "wrong_component_type": 0.0
    },
    "drift_warnings": [
      {
        "component_id": "R2",
        "actual": 100,
        "nominal": 1000,
        "deviation_pct": 90.0,
        "message": "R2 has drifted 90.0% lower than its nominal value..."
      }
    ]
  },
  "structural_faults": [],
  "simulation_data": { ... }
}
```

---

## ✅ Verification: Everything is Working

### Test Results

```
✅ Model loaded successfully (18 features, 3 labels)
✅ Feature extraction: schema verified
✅ Normal circuit: Correctly classified (67.5% confidence)
✅ Partial short: Correctly classified (96.5% confidence)
✅ Drift warnings: Working correctly
```

### When to Retrain

You should retrain the model (`python src/train.py`) if:

1. You add new circuit topologies to the dataset
2. You change the feature extraction logic in `fault_analyzer.py`
3. You modify fault value ranges (currently 1-15% for short, 5-50× for open)
4. Model performance degrades on real-world circuits

### Dataset Generation

To generate a new training dataset:

```bash
cd src
python dataset_generator.py
# Output: output/manifest.csv (10,000+ samples)
# Then: python train.py
```

---

## 🎓 Summary: Classification Basis

**The ML model classifies faults based on:**

1. **Component Value Deviations** (most important)
   - Compares actual vs design values
   - Large deviations (>20%) indicate faults
   - Deviation direction (lower = short, higher = open)

2. **Current Patterns**
   - Missing currents → wrong_component_type
   - Higher currents → partial_short
   - Lower currents → partial_open

3. **Voltage Distributions**
   - Unexpected voltage drops/rises
   - Abnormal voltage ranges
   - Skewed voltage dividers

4. **Multi-Component Patterns**
   - Multiple components deviated → multi_fault
   - Single component deviated → single fault
   - No significant deviations → Normal

The model was trained on 20 diverse circuit topologies to generalize across different circuit structures, component counts, and voltage/current ranges.

---

## 🚨 Known Limitations

1. **Training Distribution**: Model trained on circuits with 2-12 components. Performance may degrade on circuits with >15 components.

2. **Fault Value Ranges**: Current training assumes:
   - Partial short: 1-15% of nominal
   - Partial open: 5-50× nominal
   - If real faults fall outside these ranges, retrain with wider ranges.

3. **DC Analysis Only**: Model trained on DC operating point data. Does not handle transient/AC faults.

4. **Design Values Required**: For best performance, always provide `design_values` in the circuit data. Without it, the model falls back to topology matching, which is less accurate.

---

## 📝 Conclusion

✅ **The ML model is working correctly and classifying faults as designed.**

The model successfully detects:
- Partial shorts (low resistance faults)
- Partial opens (high resistance faults)  
- Wrong component types (R→C swaps)
- Multiple simultaneous faults
- Normal operation

Classification is based primarily on **component value deviations** from circuit-specific design values, combined with **current and voltage patterns** that indicate electrical anomalies.

All backend integration is working properly. The model loads on startup and analyzes simulation results correctly.
