# Circuit Fault Detector - Testing Guide

## 🚀 Quick Start

### 1. Servers Running
✅ **Backend**: http://localhost:8000 (FastAPI + ngspice)
✅ **Frontend**: http://localhost:5174 (React + Vite)

Both servers are already running! Open http://localhost:5174 in your browser.

---

## 🧪 Test the Junction-Based Circuit System

### Understanding the Junction Model (Like LTspice)

In this system, **Junction nodes (●)** are the electrical connection points, similar to LTspice:

- **Junction**: A connection point where wires meet (like nodes in SPICE)
- **Ground**: Reference point (node '0')
- **Components**: Connect BETWEEN junctions/ground (not directly to each other)

### Example 1: Simple Voltage Divider Circuit

**Goal**: Build a basic circuit with battery and resistor

**Steps**:
1. **Drag a Junction** onto the canvas → Call it "Top Junction"
2. **Drag a DC Source** (battery ⚡) onto the canvas
3. **Drag another Junction** → Call it "Middle Junction"
4. **Drag a Resistor** (━━) onto the canvas
5. **Drag a Ground** (⏚) onto the canvas

**Wiring** (connect in this order):
```
Top Junction → Battery+ (top handle)
Battery- (bottom handle) → Middle Junction
Middle Junction → Resistor (top handle)
Resistor (bottom handle) → Ground
```

**Expected Result**: 
- Circuit converts to: Battery between Top Junction and Middle Junction, Resistor between Middle Junction and Ground
- Simulation should succeed
- Should show voltages at each node

---

### Example 2: Series Circuit with Two Resistors

**Steps**:
1. **Junction 1** (Top)
2. **Battery** 
3. **Junction 2** 
4. **Resistor 1**
5. **Junction 3**
6. **Resistor 2**
7. **Ground**

**Wiring**:
```
Junction1 → Battery+ → Junction2 → Resistor1 → Junction3 → Resistor2 → Ground
```

**Expected**: Voltage divider with two resistors in series

---

### Example 3: Parallel Resistors

**Steps**:
1. **Junction 1** (Top)
2. **Battery**
3. **Junction 2** (Middle - splits into two paths)
4. **Resistor 1** (Path A)
5. **Resistor 2** (Path B)
6. **Junction 3** (Bottom - merges paths)
7. **Ground**

**Wiring**:
```
Junction1 → Battery+ → Junction2
Junction2 → Resistor1 → Junction3
Junction2 → Resistor2 → Junction3 (parallel path)
Junction3 → Ground
```

**Expected**: Both resistors have same voltage (parallel configuration)

---

## 🔍 What to Test

### ✅ Basic Functionality
- [ ] Drag components from sidebar onto canvas
- [ ] Components drop where you drag them (not random placement)
- [ ] Connect components by dragging from handles
- [ ] Wires are straight (not curved)
- [ ] Battery shows "+" symbol on top terminal
- [ ] Delete components with Delete or Backspace key
- [ ] Delete wires by selecting them and pressing Delete

### ✅ Junction-Based Wiring
- [ ] Junctions appear as small dots (●)
- [ ] Components can connect to junctions
- [ ] Multiple wires can connect to same junction
- [ ] Ground can be connected anywhere (doesn't need 2 connections)

### ✅ Simulation
- [ ] Click "Simulate" button
- [ ] Backend receives correctly formatted data
- [ ] Results appear in right panel
- [ ] Shows voltages at each node
- [ ] Shows currents through components
- [ ] Detects structural faults (if any)
- [ ] Detects pattern faults (if any)

### ✅ Error Handling
- [ ] Error if component connects to another component directly (not through junction)
- [ ] Error if component has wrong number of connections
- [ ] Error if circuit has no voltage source
- [ ] Error if circuit has no ground
- [ ] Clear error messages in alert box

---

## 🐛 Common Issues and Solutions

### Issue 1: "Component needs 2 connections"
**Problem**: Component is floating or has only 1 wire
**Solution**: Components need EXACTLY 2 connections (each terminal connected)

### Issue 2: "Both terminals connected to same node"
**Problem**: Both ends of a component connect to the same junction
**Solution**: Components must connect BETWEEN different electrical nodes

### Issue 3: "Must connect to junctions or ground, not other components"
**Problem**: Component wired directly to another component
**Solution**: Use Junction nodes as connection points - wire goes Component → Junction → Component

### Issue 4: Components drop in wrong location
**Problem**: Component appears far from where you dragged it
**Solution**: This should be fixed now - component should drop exactly where you release the mouse

### Issue 5: Simulation returns undefined values
**Problem**: Backend receives invalid circuit data
**Solution**: Check browser console for circuit conversion details

---

## 🔧 Debugging Tips

### Check Browser Console (F12)
The simulate button logs detailed information:

```javascript
📊 Circuit before conversion: { nodes, edges }
✅ Sending to backend: { nodes, components, ground }
🎉 Simulation Results: { success, voltages, currents, faults }
```

### Check Backend Logs
Backend terminal shows:
- Received circuit data
- Generated SPICE netlist
- Simulation results
- Any errors

### Manual API Test
You can test the backend directly:

```bash
# Health check
curl http://localhost:8000/api/health

# Get components list
curl http://localhost:8000/api/components
```

---

## 📋 Testing Checklist

After testing, please report:

1. **What works?**
   - [ ] Junction-based circuit building intuitive?
   - [ ] Component placement accurate?
   - [ ] Wires connect correctly?
   - [ ] Simulation produces results?

2. **What doesn't work?**
   - [ ] Any errors when simulating?
   - [ ] Any UI confusion?
   - [ ] Any missing features?

3. **Improvements needed?**
   - [ ] Better visual feedback for junctions?
   - [ ] Junction node too small/large?
   - [ ] Instructions unclear?
   - [ ] Different workflow needed?

---

## 🎯 Next Steps (After Testing)

Based on your feedback, we can:

1. **Adjust Junction Size/Style**: Make junctions more visible if needed
2. **Add Visual Hints**: Highlight valid connection points
3. **Improve Error Messages**: More helpful guidance
4. **Add Component Values Editor**: Allow changing resistor values, etc.
5. **Add More Components**: Diodes, transistors, AC sources, etc.
6. **Results Visualization**: Better graphs and charts
7. **Save/Load Circuits**: Export circuit designs

---

## 💡 Tips for Building Circuits

1. **Start with Ground**: Place ground first as your reference
2. **Think in Junctions**: Plan connection points before adding components
3. **Build Top-Down**: Battery at top, ground at bottom (conventional)
4. **Use Meaningful Layout**: Arrange components to match flow of current
5. **Test Simple First**: Start with just battery + resistor + ground

---

Good luck testing! Report any issues or suggestions. 🚀
