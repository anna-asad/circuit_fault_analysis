# Rotation Feature Testing Guide

## What Was Fixed

The rotation feature (Ctrl+R) now correctly handles **semantic terminal preservation** for polarized components like voltage sources and current sources.

### The Problem
Previously, when you rotated a DC voltage source 180°, the visual representation would flip, but the circuit converter would accidentally swap the positive and negative terminals because it was using **position-based** terminal assignment instead of **semantic handle IDs**.

### The Solution
The converter now uses **handle IDs** ("left" and "right") to determine which terminal is which:
- **Handle "left"** always maps to terminal 0 (positive for dc_source, tail for current_source)
- **Handle "right"** always maps to terminal 1 (negative for dc_source, head for current_source)

This way, rotation only changes the visual appearance - the semantic meaning of each terminal stays fixed regardless of how the component is rotated.

---

## Test Cases

### Test 1: DC Voltage Source - 4 Rotations (Correct Wiring)

**Setup:**
1. Place a 9V DC voltage source
2. Connect a 100Ω resistor in series
3. Connect ground to the negative terminal of the source

**Expected Behavior:**
Rotate the voltage source through all 4 orientations (0°, 90°, 180°, 270°) using Ctrl+R while keeping the wiring physically the same.

**Expected Results:**
- All 4 rotations should produce **identical simulation results**:
  - Voltage across resistor: ~9V
  - Current through circuit: ~90mA
  - Power dissipated: ~810mW
- **No polarity fault** should be detected in any orientation
- The netlist should show the same node ordering for the voltage source regardless of rotation

---

### Test 2: DC Voltage Source - Reversed Polarity Detection

**Setup:**
1. Place a 9V DC voltage source
2. Connect a 100Ω resistor in series
3. Connect ground to the **positive terminal** of the source (intentional error)

**Expected Behavior:**
Rotate the voltage source through all 4 orientations (0°, 90°, 180°, 270°).

**Expected Results:**
- All 4 rotations should detect: **"Reversed voltage source polarity"** fault
- The fault should fire consistently regardless of rotation because the semantic positive terminal is always connected to ground
- Simulation results should still be valid (just with a polarity warning)

---

### Test 3: Current Source - 4 Rotations (Direction Preservation)

**Setup:**
1. Place a 2A current source
2. Connect a 12Ω resistor in parallel
3. Connect ground somewhere in the circuit

**Expected Behavior:**
Rotate the current source through all 4 orientations (0°, 90°, 180°, 270°).

**Expected Results:**
- All 4 rotations should produce **identical simulation results**:
  - Voltage across resistor: ~24V
  - Power dissipated: ~48W
- The arrow direction (indicating current flow) should be preserved in the SPICE netlist
- **No polarity fault** should ever be detected for current sources (they don't have polarity issues)
- Current magnitude and sign should remain consistent across all rotations

---

### Test 4: Mixed Circuit - Multiple Rotated Components

**Setup:**
1. Place a 12V DC voltage source (rotated to 90°)
2. Place a resistor R1 = 1kΩ (rotated to 180°)
3. Place a resistor R2 = 2kΩ (rotated to 270°)
4. Wire in series: source → R1 → R2 → ground

**Expected Results:**
- Simulation should succeed with consistent results regardless of component rotations
- Total current: ~4mA (12V / 3kΩ)
- Voltage across R1: ~4V
- Voltage across R2: ~8V
- No structural faults detected

---

### Test 5: Rotation + Edit + Rotation

**Setup:**
1. Place a 5V DC voltage source at 0° rotation
2. Wire it with a resistor and ground
3. Run simulation - note results
4. Rotate source to 180° (Ctrl+R twice)
5. Edit voltage value to 10V
6. Rotate back to 0° (Ctrl+R twice more)
7. Run simulation again

**Expected Results:**
- First simulation (5V): appropriate current/voltage
- Second simulation (10V): exactly double the first simulation results
- No change in behavior due to rotation - only the value edit should affect results
- Terminal connections should remain semantically correct throughout

---

## Backend Validation

The backend should **never need to know about rotation**. The frontend converter handles all rotation logic and always emits components with nodes in the correct semantic order:
- `nodes[0]` = positive terminal (for dc_source) or tail (for current_source)
- `nodes[1]` = negative terminal (for dc_source) or head (for current_source)

### Files That Should NOT Change:
- `backend/validators.py` - no rotation awareness needed
- `backend/netlist_generator.py` - no rotation awareness needed
- `backend/structural_faults.py` - no rotation awareness needed (already fixed to ignore current_source polarity)
- `backend/simulation_runner.py` - no rotation awareness needed

### Files That Were Changed:
- `frontend/src/utils/circuitConverter.js` - now uses handle IDs for terminal assignment
- `frontend/src/components/CircuitCanvas.jsx` - already had rotation infrastructure (no changes needed)

---

## How to Test

1. **Start the frontend dev server:**
   ```bash
   cd frontend
   npm run dev
   ```

2. **Start the backend server:**
   ```bash
   cd backend
   python main.py
   ```

3. **Build each test circuit** in the UI

4. **Use Ctrl+R to rotate components** and observe:
   - Visual rotation happens smoothly
   - Wires stay connected to the correct handles
   - Simulation results remain consistent

5. **Check for faults** in the results panel:
   - Polarity faults should only appear when positive is truly grounded
   - No false positives from rotation

---

## Technical Details

### Handle ID Mapping:
```javascript
// In circuitConverter.js:
function getTerminalIndexForEdge(nodeId, neighborId) {
  const edgeKey = `${nodeId}::${neighborId}`;
  const handleId = edgeHandleMap.get(edgeKey);
  
  // "left" handle = terminal 0 (positive/tail)
  // "right" handle = terminal 1 (negative/head)
  if (handleId === 'left') return 0;
  if (handleId === 'right') return 1;
  
  // Fallback to position-based (shouldn't happen)
  return nonGroundNeighbors.indexOf(neighborId);
}
```

### Rotation-Aware Handle Positions:
```javascript
// In CircuitCanvas.jsx:
const ROTATION_TO_POSITIONS = {
    0: { left: Position.Left,   right: Position.Right },
   90: { left: Position.Top,    right: Position.Bottom },
  180: { left: Position.Right,  right: Position.Left },
  270: { left: Position.Bottom, right: Position.Top },
};
```

This ensures that:
- At 0°: left handle is on the left side (positive)
- At 90°: left handle moves to top side (still positive)
- At 180°: left handle moves to right side (still positive)
- At 270°: left handle moves to bottom side (still positive)

The **semantic meaning** stays with the handle ID, not the visual position.

---

## Success Criteria

✅ **Pass**: All 5 test cases produce expected results  
✅ **Pass**: Rotating components doesn't change simulation results  
✅ **Pass**: Polarity faults fire consistently based on semantic terminals  
✅ **Pass**: Current sources never show polarity faults  
✅ **Pass**: Backend files require no rotation-specific logic  

❌ **Fail**: Rotating a component changes simulation results  
❌ **Fail**: Polarity fault appears/disappears when rotating (without changing wiring)  
❌ **Fail**: Current sources show polarity faults  
❌ **Fail**: Backend needs rotation parameter to work correctly
