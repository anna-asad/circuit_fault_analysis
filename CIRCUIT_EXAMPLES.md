# Visual Circuit Examples (Junction-Based System)

## 🔌 Understanding the Junction Model

### Key Concept
In LTspice and SPICE simulators, circuits are built using:
- **Nodes**: Electrical connection points
- **Components**: Connect BETWEEN nodes
- **Wires**: Connect multiple things to the same node

Our **Junction nodes (●)** represent these electrical connection points.

---

## Example 1: Simple Battery + Resistor Circuit

### Visual Layout
```
     ●  (Junction 1 - node "n1")
     |
    [⚡] (Battery: V1 = 5V, connects n1 to n2)
     |
     ●  (Junction 2 - node "n2")
     |
    [━━] (Resistor: R1 = 1kΩ, connects n2 to ground)
     |
     ⏚  (Ground - node "0")
```

### How to Build
1. Place Junction 1
2. Place Battery
3. Place Junction 2
4. Place Resistor
5. Place Ground
6. Wire: Junction1 → Battery+ → Junction2 → Resistor → Ground

### Expected Backend Format
```json
{
  "nodes": ["n1", "n2", "0"],
  "components": [
    {
      "id": "dcsource...",
      "type": "dc_source",
      "value": 5.0,
      "nodes": ["n1", "n2"]
    },
    {
      "id": "resistor...",
      "type": "resistor",
      "value": 1000,
      "nodes": ["n2", "0"]
    }
  ],
  "ground": "0"
}
```

### Expected Results
- Voltage at n1: ~5V
- Voltage at n2: ~0V (because resistor to ground)
- Current through V1: ~5mA (5V / 1kΩ)

---

## Example 2: Voltage Divider (Two Resistors in Series)

### Visual Layout
```
     ●  (Junction 1 - node "n1")
     |
    [⚡] (Battery: 5V, n1 to n2)
     |
     ●  (Junction 2 - node "n2")
     |
    [━━] (R1: 1kΩ, n2 to n3)
     |
     ●  (Junction 3 - node "n3")
     |
    [━━] (R2: 1kΩ, n3 to 0)
     |
     ⏚  (Ground)
```

### Expected Results
- Voltage at n1: ~5V
- Voltage at n2: ~5V (top of R1)
- Voltage at n3: ~2.5V (middle point - voltage divider!)
- Voltage at 0: 0V (ground reference)
- Current: ~2.5mA through entire circuit

---

## Example 3: Parallel Resistors

### Visual Layout
```
          ●  (Junction 1 - node "n1")
          |
         [⚡] (Battery: 5V, n1 to n2)
          |
          ●  (Junction 2 - node "n2" - SPLITS HERE)
        /   \
       /     \
    [━━]    [━━]  (R1: 1kΩ, n2-n3)  (R2: 1kΩ, n2-n3)
       \     /
        \   /
          ●  (Junction 3 - node "n3" - MERGES HERE)
          |
          ⏚  (Ground)
```

### How to Build
1. Place Junction 1
2. Place Battery
3. Place Junction 2 (the split point)
4. Place R1
5. Place R2
6. Place Junction 3 (the merge point)
7. Place Ground
8. Wire:
   - Junction1 → Battery+ → Junction2
   - Junction2 → R1 → Junction3
   - Junction2 → R2 → Junction3 (parallel path!)
   - Junction3 → Ground

### Expected Results
- Both resistors see same voltage: ~5V
- Current splits: ~2.5mA through R1, ~2.5mA through R2
- Total current from battery: ~5mA
- Equivalent resistance: 500Ω (parallel: 1/(1/1k + 1/1k) = 500Ω)

---

## Example 4: More Complex Circuit (RC Circuit)

### Visual Layout
```
     ●  (Junction 1)
     |
    [⚡] (Battery: 5V)
     |
     ●  (Junction 2)
     |
    [━━] (Resistor: 1kΩ)
     |
     ●  (Junction 3)
     |
    [||] (Capacitor: 100µF)
     |
     ⏚  (Ground)
```

### Expected for DC Analysis
- Capacitor acts as open circuit in DC steady-state
- Very low current flow
- Voltage builds up across capacitor to ~5V

---

## ❌ Common Mistakes

### Mistake 1: Direct Component-to-Component Connection
```
❌ WRONG:
    [⚡]     (Battery)
     ↓
    [━━]    (Resistor) ← Directly connected!
```

This doesn't work because components need junction/ground nodes.

```
✅ CORRECT:
    [⚡]     (Battery)
     ↓
     ●       (Junction)
     ↓
    [━━]    (Resistor)
```

### Mistake 2: Component with Both Ends at Same Node
```
❌ WRONG:
     ●  (Junction)
    / \
   /   \
  ↓     ↓
 [━━━━━]  (Both ends connect to same junction = short!)
```

This creates a component with nodes=["n1", "n1"], which is invalid.

### Mistake 3: Floating Components
```
❌ WRONG:
    [━━]    (Resistor with no wires)
```

Components need exactly 2 connections.

---

## 🎯 Junction Best Practices

1. **Use junctions for splits/merges**: Any time current path splits or merges
2. **Use junctions between components**: Always put junction between two components
3. **One junction per node**: Don't create duplicate junctions for same electrical point
4. **Ground placement**: Ground can go anywhere you want 0V reference
5. **Visual clarity**: Arrange junctions to show current flow path

---

## 🧮 How Backend Converts This

Frontend (React Flow):
- Junction nodes: Visual connection points
- Components: Visual elements
- Edges: Wires

Backend (SPICE):
- Junctions → Electrical nodes (n1, n2, n3, etc.)
- Ground → Node "0"
- Components → SPICE components with node connections
- No edges in backend (just node names in components)

---

## 🔍 Debugging Your Circuit

If simulation fails, check:

1. **Each component has exactly 2 wires** (except ground can have 1+)
2. **Components connect to junctions/ground**, not directly to other components
3. **At least one battery** (dc_source) exists
4. **At least one ground** exists
5. **All components are part of a complete circuit** (no floating parts)

---

Use these examples to test the system. Start simple, then build more complex circuits! 🚀
