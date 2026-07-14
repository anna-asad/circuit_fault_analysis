# Current Source Implementation

## Overview
Added full support for current source components across the entire application stack - frontend UI, circuit conversion, backend validation, SPICE simulation, and fault analysis.

## Changes Made

### Frontend

#### 1. CircuitCanvas.jsx
- ✅ Added current source SVG symbol (circle with upward arrow)
- ✅ Added to `COMPONENT_SVGS` constant
- ✅ Added to `DEFAULT_VALUES`: 0.012 A (12 mA)
- ✅ Implemented current formatting: A, mA, µA, nA
- ✅ Updated `formatValue()` to handle current units
- ✅ Updated `formatNodeValue()` for current source display

#### 2. ComponentSidebar.jsx
- ✅ Added "Current Source" to components list
- ✅ Icon: ⬆ (upward arrow)
- ✅ Unit: A (Amperes)

#### 3. circuitConverter.js
- ✅ Added `current_source` to default values (0.012 A)
- ✅ Updated validation to accept current source as power source
- ✅ Fixed bug: Convert `label` to string before `.replace()`

### Backend

#### 4. validators.py
- ✅ Added `current_source` to `ComponentSpec.SPECS`
  - Label: "Current Source"
  - Value range: 1e-6 to 10.0 A (1 µA to 10 A)
  - Default: 0.012 A (12 mA)
  - Unit: "A"
  - Terminals: 2
- ✅ Updated validation to accept current source as power source

#### 5. netlist_generator.py
- ✅ Added current source handling in `_add_component()`
  - Format: `Iname n+ n- DC value`
- ✅ Added to `_get_spice_name()` with 'I' prefix
- ✅ Properly generates SPICE netlist entries

#### 6. simulation_runner.py
- ✅ Added current source feature extraction
- ✅ Stores as `current_supply` in features dict

#### 7. structural_faults.py
- ✅ Updated source validation to include current sources
- ✅ Checks current source connection to ground
- ✅ Detects shorted current sources

#### 8. fault_analyzer.py
- ✅ Included current_source in component value extraction

#### 9. main.py (FastAPI)
- ✅ Updated Component model description to include current_source

### Documentation

#### 10. Component Images README
- ✅ Added current_source.png to required images list
- ✅ Specified circle with upward arrow symbol

## Technical Details

### SPICE Format
```spice
* Current source format
Iname n+ n- DC value

* Example
I1 n1 0 DC 0.012  ; 12 mA current source
```

### Frontend Display
- **Default value**: 12 mA (0.012 A)
- **Units**: Automatically scales (A, mA, µA, nA)
- **Symbol**: Circle with upward arrow ⬆
- **Color**: Same as other components (white bg, gray border)

### Validation Rules
- **Minimum**: 1 µA (1e-6 A)
- **Maximum**: 10 A
- **Terminals**: Must have exactly 2
- **Power requirement**: Circuit needs either voltage source OR current source

### Feature Extraction
Current sources contribute to circuit features as:
- `current_supply`: The current value in Amperes

### Training Dataset Compatibility
The implementation matches the training data format:
- Used in `current_source_single_R` circuit
- Used in `vdr_parallel_network` circuit
- Default 12 mA matches dataset examples

## Testing

### Manual Test Circuit
1. Open frontend application
2. Drag "Current Source" component onto canvas
3. Connect to resistor and ground
4. Set current value (e.g., 12mA)
5. Click "Simulate"
6. Verify successful simulation and fault detection

### Backend Validation Test
```python
from backend.validators import ComponentSpec

# Get current source spec
spec = ComponentSpec.get_spec('current_source')
print(spec)  # Should show all specifications

# Validate a value
is_valid, error = ComponentSpec.validate_value('current_source', 0.012)
print(f"Valid: {is_valid}, Error: {error}")  # Should be (True, None)
```

## Known Compatibility
- ✅ Works with ngspice DC analysis
- ✅ Compatible with existing fault detection model
- ✅ Handles all circuit topologies from training data
- ✅ Proper SPICE netlist generation
- ✅ Frontend-backend communication validated

## Future Enhancements
- Add current source PNG image (currently using SVG fallback)
- Consider adding AC current source support
- Add current source rotation/flipping in UI
