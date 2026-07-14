# Visual Guide: How Rotation Works

## The Key Concept

**Handle IDs stay with semantic terminals, not visual positions.**

---

## DC Voltage Source Rotation Example

### At 0° (Default)
```
        ┌────────────────┐
        │                │
  ◄─────┤ LEFT (+)       │
    +   │                │
        │      9V DC     │
  ◄─────┤       RIGHT (−)│
    −   │                │
        └────────────────┘

Handle "left"  = Position.Left  = Positive terminal
Handle "right" = Position.Right = Negative terminal
```

### After Ctrl+R (90° clockwise)
```
             ▲
             │ LEFT (+)
             │ +
        ┌────┴────┐
        │         │
        │   9V    │
        │   DC    │
        │         │
        └────┬────┘
             │ −
             │ RIGHT (−)
             ▼

Handle "left"  = Position.Top    = STILL Positive terminal
Handle "right" = Position.Bottom = STILL Negative terminal
```

### After Ctrl+R (180° total)
```
        ┌────────────────┐
        │                │
        │       LEFT (+) ├─────►
        │                │   +
        │      9V DC     │
        │ RIGHT (−)      ├─────►
        │                │   −
        └────────────────┘

Handle "left"  = Position.Right = STILL Positive terminal
Handle "right" = Position.Left  = STILL Negative terminal
```

### After Ctrl+R (270° total)
```
             ▲
             │ −
             │ RIGHT (−)
        ┌────┴────┐
        │         │
        │   9V    │
        │   DC    │
        │         │
        └────┬────┘
             │ +
             │ LEFT (+)
             ▼

Handle "left"  = Position.Bottom = STILL Positive terminal
Handle "right" = Position.Top    = STILL Negative terminal
```

---

## The Critical Difference

### ❌ WRONG (Position-Based)
```javascript
// If we used visual position to determine terminals:
const leftSideWire = getWireOnLeftSide(component);
const rightSideWire = getWireOnRightSide(component);
nodes = [leftSideWire, rightSideWire];  // Changes with rotation!
```

**Result:** At 180°, the positive terminal would be on the right side, so we'd accidentally create `nodes = [negative, positive]` - BACKWARDS!

---

### ✅ CORRECT (Handle ID-Based)
```javascript
// Using handle IDs as semantic identifiers:
const leftHandleWire = getWireFromHandle(component, "left");
const rightHandleWire = getWireFromHandle(component, "right");
nodes = [leftHandleWire, rightHandleWire];  // Always correct!
```

**Result:** At 180°, we still read the handle IDs correctly: "left" handle is now visually on the right, but it's still the positive terminal, so `nodes = [positive, negative]` - CORRECT!

---

## Why This Matters: Polarity Fault Example

### Scenario: 9V source with positive terminal connected to ground

#### At 0° Rotation
```
        ┌────────────────┐
  GND───┤ LEFT (+)       │        ◄─── Ground on positive
        │                │
        │      9V DC     │
        │       RIGHT (−)├────► [To circuit]
        │                │
        └────────────────┘

Backend receives: nodes = ["0", "n1"]  (ground is node "0")
Polarity check: nodes[0] == "0"?  YES → FAULT DETECTED ✓
```

#### At 180° Rotation (Wire positions unchanged)
```
        ┌────────────────┐
        │       LEFT (+) ├───GND    ◄─── Ground STILL on positive
        │                │                 (just visually on right now)
        │      9V DC     │
[circuit]◄───┤ RIGHT (−)      │
        │                │
        └────────────────┘

Backend receives: nodes = ["0", "n1"]  (SAME ORDER!)
Polarity check: nodes[0] == "0"?  YES → FAULT DETECTED ✓
```

**The fault is detected correctly at both rotations because the converter always sends the positive terminal first, regardless of visual position.**

---

## Current Source Rotation (No Polarity Issues)

### At 0° (Arrow points right)
```
        ┌────────────────┐
        │   ╭───────╮    │
  ◄─────┤   │   ↑   │    │
  TAIL  │   │   │   │    │◄─── Arrow shows current direction
        │   │  2A   │    │
  ◄─────┤   │       │    │
  HEAD  │   ╰───────╯    │
        └────────────────┘

Handle "left"  = Tail (current flows out)
Handle "right" = Head (current flows in)
```

### At 90° (Arrow points down)
```
             ▲ TAIL
             │
        ┌────┴────┐
        │ ╭─────╮ │
        │ │  ↓  │ │  ◄─── Arrow rotated with component
        │ │ 2A  │ │
        │ ╰─────╯ │
        └────┬────┘
             │
             ▼ HEAD

Handle "left"  = Position.Top    = STILL Tail
Handle "right" = Position.Bottom = STILL Head
```

**Current sources don't have polarity faults** because current direction is relative - only the arrow orientation matters, and that rotates correctly with the component.

---

## Junction Example (4 Handles)

Junctions have handles on all 4 sides and act as wire hubs:

```
         TOP
          ▲
          │
    LEFT  │  RIGHT
    ◄─────●─────►
          │
          ▼
        BOTTOM
```

When a component connects to a junction, we track which component handle connects:
- Component "left" handle → Junction's "bottom" handle
- Component "right" handle → Junction's "top" handle

This allows splitting/merging wires while preserving terminal semantics.

---

## Data Structure: edgeHandleMap

The converter builds this map to track connections:

```javascript
edgeHandleMap = new Map([
  // "sourceNodeId::targetNodeId" → handleId
  ["dc_source_123::resistor_456", "left"],   // DC source's left handle → resistor
  ["dc_source_123::ground_789", "right"],    // DC source's right handle → ground
  ["resistor_456::dc_source_123", "left"],   // Resistor's left handle → DC source
  // ... etc
]);
```

Then when building the circuit:
```javascript
function getTerminalIndexForEdge(nodeId, neighborId) {
  const handleId = edgeHandleMap.get(`${nodeId}::${neighborId}`);
  if (handleId === 'left') return 0;   // Terminal 0 (positive/tail)
  if (handleId === 'right') return 1;  // Terminal 1 (negative/head)
}
```

---

## Complete Example: Series Circuit with Rotation

### Circuit
```
  9V DC source (rotated 180°) → 1kΩ resistor (0°) → Ground
```

### Visual Layout
```
  [Ground]───[DC+]──9V──[DC−]───[R_left]──1kΩ──[R_right]
       0              n1                     n2
```

### Component Data Sent to Backend
```javascript
{
  components: [
    {
      id: "V1",
      type: "dc_source",
      value: 9,
      nodes: ["n1", "0"],  // ← Positive first, even though rotated!
      position: {...}
    },
    {
      id: "R1",
      type: "resistor",
      value: 1000,
      nodes: ["n1", "n2"],
      position: {...}
    }
  ],
  ground: "0"
}
```

### Backend Processing
```spice
* SPICE Netlist
V1 n1 0 DC 9        ← Positive terminal (n1) first
R1 n1 n2 1000       ← Correct node order
.control
op
print all
.endc
```

### Simulation Result
```
V(n1) = 9V     ← Voltage at positive terminal
V(n2) = 0V     ← Voltage at resistor's far end (connected through ground path)
I(V1) = 9mA    ← Current through source
```

### Polarity Check
```python
# structural_faults.py
positive_node = component.nodes[0]  # "n1"
if positive_node == "0":
    # Fault: reversed polarity
else:
    # OK: positive is not grounded
```

**No fault detected** because `n1 ≠ "0"` - the positive terminal is correctly NOT connected to ground, even though the component is rotated 180°.

---

## Summary

1. **Handle IDs** ("left", "right") are semantic identifiers attached to terminals
2. **Handle Positions** (Left, Right, Top, Bottom) are visual locations that change with rotation
3. **The converter uses Handle IDs** to determine terminal order, not visual positions
4. **The backend is rotation-agnostic** - it only sees semantically ordered node arrays
5. **Faults are detected based on semantic terminals**, not visual layout

**Rotation is purely a frontend visual concern. The backend never knows or cares about rotation angles.**
