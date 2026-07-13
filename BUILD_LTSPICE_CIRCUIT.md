# Build the LTspice Circuit (V1 + R1)

## 🎯 Goal: Replicate This Exact Circuit

```
     V1+
      |
      |-------- R1 --------
      |                    |
     V1-                   |
      |                    |
      |--------------------⏚ (Ground on bottom wire)
```

---

## 📋 Step-by-Step Instructions

### 1. Add Components
Drag these from the left sidebar:
- **DC Source (⚡)** - This is V1
- **Resistor (━━)** - This is R1
- **Ground (⏚)** - Place on wire

### 2. Wire the Circuit
Create wires in this exact order:

**Wire 1**: V1+ (top) → R1 (left side)
**Wire 2**: R1 (right side) → V1- (bottom) 
**Wire 3**: Add Ground, connect to the bottom wire

This creates a closed loop with ground reference.

---

## 🔍 What This Creates

### Visual Layout
```
    [⚡ V1]
     +  -
     |  |
     |  |
    [━━ R1]
        |
        ⏚ Ground (marks this wire as node 0)
```

### Electrical Schematic
```
Node n1: V1+ and R1 left terminal
Node 0:  V1- and R1 right terminal (ground)

Components:
- V1: connects between n1 and 0
- R1: connects between n1 and 0
```

### Backend Format
```json
{
  "nodes": ["n1", "0"],
  "components": [
    {
      "type": "dc_source",
      "value": 5.0,
      "nodes": ["n1", "0"]
    },
    {
      "type": "resistor", 
      "value": 1000,
      "nodes": ["n1", "0"]
    }
  ],
  "ground": "0"
}
```

---

## ⚡ Expected Simulation Results

With V1=5V and R1=1kΩ:

**Voltages:**
- V(n1) = 5.000V (top node)
- V(0) = 0.000V (ground reference)

**Currents:**
- I(V1) = 5.000mA (5V / 1kΩ = 5mA)

**Interpretation:**
- Voltage source provides 5V
- 5V drops across 1kΩ resistor
- 5mA flows through circuit
- Ground sets bottom wire to 0V reference

---

## 💡 Key Points

### Ground Placement
- **Ground (⏚) is placed ON the wire** between V1- and R1
- It marks that wire as node "0" (0V reference)
- Ground doesn't "connect" to components - it labels the wire

### Direct Component Wiring
- V1 and R1 wire directly to each other
- No junction needed for simple series circuit
- Components share electrical nodes at wire connections

### LTspice Equivalent
```
V1 n1 0 5V
R1 n1 0 1k
.tran 0.1
```

Same netlist, same behavior!

---

## 🧪 Test It

1. Open http://localhost:5174
2. Build this exact circuit
3. Click "Simulate"
4. Check results panel:
   - Should show V(n1) = 5V
   - Should show I(V1) = 5mA
   - No faults detected

---

## 🎨 Alternative Layouts

You can arrange components differently but keep same wiring:

### Horizontal Layout
```
[⚡]---[━━]
  |      |
  |------⏚
```

### Vertical Layout
```
 [⚡]
  |
 [━━]
  |
  ⏚
```

All produce same electrical circuit!

---

**The ground triangle (⏚) works exactly like LTspice - place it anywhere on wires to mark that point as 0V reference!** 🎯
