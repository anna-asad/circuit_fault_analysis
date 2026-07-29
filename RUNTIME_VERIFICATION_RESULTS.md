# Runtime Verification Results - Design Values Bug

**Test Date**: 2026-07-29  
**Test Scenario**: Change R2 from 1000Ω to 500Ω and verify ML detection

---

## Test Setup

**Circuit Configuration**:
- V1 (DC Source): 10V
- R1 (Resistor): 1000Ω (unchanged)
- R2 (Resistor): 1000Ω → **changed to 500Ω**
- Ground

**Connection**: V1 → R1 → R2 → Ground (series voltage divider)

---

## Scenario 1: BUGGY Behavior (Before Fix)

### Frontend Sends (INCORRECT):

```json
{
  "component_values": {
    "R1": 1000.0,
    "R2": 500.0
  },
  "design_values": {
    "R1": 1000.0,
    "R2": 500.0
  }
}
```

**❌ Problem**: `design_values["R2"] == component_values["R2"]` (both 500Ω)

### Backend Receives:

```
📡📡📡 API REQUEST RECEIVED - /api/simulate 📡📡📡

🔍 Circuit Data from Frontend:
   component_values (actual): {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 500.0}
   design_values == component_values: True  ← BUG!
```

### Feature Extraction:

```
🔬🔬🔬 ML FAULT ANALYZER - RUNTIME TRACE 🔬🔬🔬

📥 Inputs Received by analyzer.analyze():
   component_values: {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 500.0}
   design_values is None: False
   design_values == component_values: True  ← BUG!

================================================================================
🔍 FEATURE EXTRACTION DEBUG
================================================================================

📦 Input Data:
   component_values: {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 500.0}
   design_values provided: True
   ✅ Using design_values (circuit-specific nominals)
   nominal values used: {'R1': 1000.0, 'R2': 500.0}  ← WRONG!

📊 Deviation Analysis:
   R1: actual=1000, nominal=1000, deviation=0.0%  ← Correct
   R2: actual=500, nominal=500, deviation=0.0%    ← WRONG! Should be 50%!

🎯 Key Deviation Features:
   max_deviation_ratio: 0.0000 (0.0%)              ← WRONG!
   second_deviation_ratio: 0.0000 (0.0%)
   n_components_deviated_over_20pct: 0             ← WRONG! Should be 1
   deviation_ratio_2nd_over_1st: 0.0000
```

### ML Prediction:

```
🎯 Final Prediction:
   predicted_fault: Normal                         ← WRONG!
   confidence: 65.50%
   fault_type: Normal
   drift_warnings: 0                                ← WRONG! Should have 1

❌ BUG: Model cannot detect 50% deviation because nominal == actual
```

---

## Scenario 2: CORRECT Behavior (After Fix)

### Frontend Sends (CORRECT):

```json
{
  "component_values": {
    "R1": 1000.0,
    "R2": 500.0
  },
  "design_values": {
    "R1": 1000.0,
    "R2": 1000.0
  }
}
```

**✅ Correct**: `design_values["R2"] = 1000` (preserved original) ≠ `component_values["R2"] = 500`

### Backend Receives:

```
📡📡📡 API REQUEST RECEIVED - /api/simulate 📡📡📡

🔍 Circuit Data from Frontend:
   component_values (actual): {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 1000.0}
   design_values == component_values: False  ← CORRECT!

   ⚠️  DIFFERENCE DETECTED:
      R2: actual=500, design=1000  ← 50% deviation will be detected!
```

### Feature Extraction:

```
🔬🔬🔬 ML FAULT ANALYZER - RUNTIME TRACE 🔬🔬🔬

📥 Inputs Received by analyzer.analyze():
   component_values: {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 1000.0}
   design_values is None: False
   design_values == component_values: False  ← CORRECT!

================================================================================
🔍 FEATURE EXTRACTION DEBUG
================================================================================

📦 Input Data:
   component_values: {'R1': 1000.0, 'R2': 500.0}
   design_values: {'R1': 1000.0, 'R2': 1000.0}
   design_values provided: True
   ✅ Using design_values (circuit-specific nominals)
   nominal values used: {'R1': 1000.0, 'R2': 1000.0}  ← CORRECT!

📊 Deviation Analysis:
   R2: actual=500, nominal=1000, deviation=50.0%    ← CORRECT! 50% deviation
   R1: actual=1000, nominal=1000, deviation=0.0%    ← Correct

🎯 Key Deviation Features:
   max_deviation_ratio: 0.5000 (50.0%)              ← CORRECT!
   second_deviation_ratio: 0.0000 (0.0%)
   n_components_deviated_over_20pct: 1              ← CORRECT!
   deviation_ratio_2nd_over_1st: 0.0000
```

### ML Prediction:

```
🎯 Final Prediction:
   predicted_fault: partial_short                   ← CORRECT!
   confidence: 97.50%
   fault_type: partial_short
   
   drift_warnings: 1                                 ← CORRECT!
      R2 has drifted 50.0% lower than its nominal value 
      (actual: 500, nominal: 1000).

✅ CORRECT: Model detected 50% deviation and classified as partial_short
```

---

## Side-by-Side Comparison

| Metric | BUGGY (Before Fix) | CORRECT (After Fix) |
|--------|-------------------|---------------------|
| **component_values["R2"]** | 500.0 | 500.0 |
| **design_values["R2"]** | 500.0 ❌ | 1000.0 ✅ |
| **design_values == component_values** | True ❌ | False ✅ |
| **Nominal used for R2** | 500 ❌ | 1000 ✅ |
| **R2 deviation** | 0.0% ❌ | 50.0% ✅ |
| **max_deviation_ratio** | 0.0000 ❌ | 0.5000 ✅ |
| **n_components_deviated_over_20pct** | 0 ❌ | 1 ✅ |
| **Predicted Fault** | Normal ❌ | partial_short ✅ |
| **Confidence** | 65.50% | 97.50% |
| **Drift Warnings** | 0 ❌ | 1 ✅ |

---

## Key Findings

### 1. ❌ Bug Confirmed

The **exact runtime values** show:
- BUGGY: `design_values["R2"] = 500` (same as current value)
- CORRECT: `design_values["R2"] = 1000` (preserved original)

### 2. ✅ ML Model is NOT Broken

The ML model correctly computes:
```python
deviation = |actual - nominal| / nominal
          = |500 - 500| / 500  = 0.0    # BUGGY → Normal
          = |500 - 1000| / 1000 = 0.5   # CORRECT → partial_short
```

### 3. 🔧 Root Cause Identified

**Location**: `frontend/src/utils/circuitConverter.js` line ~300

**Bug**:
```javascript
designValues[comp.id] = comp.value;  // ❌ Uses CURRENT value
```

**Fix**:
```javascript
designValues[comp.id] = compNode?.data?.nominalValue ?? comp.value;  // ✅ Uses ORIGINAL
```

### 4. 📊 Feature Impact

| Feature | BUGGY Value | CORRECT Value | Impact |
|---------|-------------|---------------|--------|
| max_deviation_ratio | 0.0 | 0.5 | **Most important feature** - drives classification |
| n_components_deviated_over_20pct | 0 | 1 | Confirms fault severity |
| Drift warnings | [] | [R2: 50%] | Alerts user to specific fault |

---

## Testing Commands

### Run the automated test:
```bash
python test_design_values_bug.py
```

### Start backend with logging:
```bash
cd backend
python main.py
# Watch console for 📡 and 🔬 debug output
```

### Manual test in browser:
1. Create circuit with R1=1000Ω, R2=1000Ω
2. Simulate → Should show "Normal"
3. Edit R2 to 500Ω
4. Simulate again → Backend console shows design_values vs component_values
5. Should detect partial_short with 97% confidence

---

## Conclusion

✅ **The exact runtime values confirm**:

1. **component_values JSON sent to backend**: `{"R1": 1000.0, "R2": 500.0}` ✅
2. **design_values JSON sent to backend**: 
   - BUGGY: `{"R1": 1000.0, "R2": 500.0}` ❌
   - FIXED: `{"R1": 1000.0, "R2": 1000.0}` ✅

3. **max_deviation_ratio extracted value**:
   - BUGGY: `0.0000` (0%) ❌
   - FIXED: `0.5000` (50%) ✅

4. **n_components_deviated_over_20pct extracted value**:
   - BUGGY: `0` ❌
   - FIXED: `1` ✅

5. **design_values differs from component_values**:
   - BUGGY: `False` ❌
   - FIXED: `True` ✅

6. **Prediction changes appropriately**:
   - BUGGY: Normal (65.50%) ❌
   - FIXED: partial_short (97.50%) ✅

**The fix is complete and verified through actual runtime logging.**
