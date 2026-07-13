# Quick Start Guide

## ✅ System is Ready!

Both servers are running:
- **Backend (API)**: http://localhost:8000
- **Frontend (UI)**: http://localhost:5174

**→ Open http://localhost:5174 in your browser to start building circuits!**

---

## 🎯 Build Your First Circuit (30 seconds)

### Simple Circuit (Direct Wiring)
1. Drag **DC Source** (⚡) onto canvas → Battery
2. Drag **Resistor** (━━) → Resistor  
3. Drag **Ground** (⏚) → Ground
4. **Wire**: Battery+ → Resistor → Battery-
5. **Wire**: Resistor → Ground (place ground on wire)
6. Click **"▶️ Simulate"**

### With Junctions (For Complex Circuits)
Use **Junction (●)** when you need to split/merge wires:
1. Drag components + junctions
2. Wire through junctions for branches
3. Place ground anywhere
4. Simulate!

---

## 💡 Key Concepts

### Ground Placement
**Ground (⏚)** can be placed anywhere:
- At component terminals
- On wires between components
- At junctions
- Anywhere you want 0V reference!

### Junctions (Optional)
**Junction (●)** is OPTIONAL - use when you need:
- Wire splitting (parallel paths)
- Wire merging (joining paths)
- Visual organization

### Direct Wiring
**Components can wire directly:**
```
Battery → Resistor → Battery (simple series)
```

No junction needed for simple circuits!

---

## ⌨️ Keyboard Shortcuts

- **Delete/Backspace**: Delete selected components or wires
- **Click + Drag**: Pan the canvas
- **Scroll**: Zoom in/out

---

## 🐛 Common First-Time Mistakes

### ❌ Problem: "Component needs 2 connections"
**Fix**: Each component terminal must have a wire

### ❌ Problem: "Both terminals connected to same node"
**Fix**: Don't connect both ends to the same electrical point

### ❌ Problem: Floating components
**Fix**: All components must be part of a complete circuit path

---

## 📖 More Help

- **TESTING_GUIDE.md**: Comprehensive testing instructions
- **CIRCUIT_EXAMPLES.md**: Visual examples with diagrams
- **Browser Console (F12)**: Detailed logs of circuit conversion and simulation

---

## 🎨 Component Legend

| Symbol | Component | Purpose |
|--------|-----------|---------|
| ⚡ | DC Source | Battery/power supply |
| ━━ | Resistor | Limits current |
| \|\| | Capacitor | Stores charge |
| ~~~ | Inductor | Stores magnetic energy |
| ● | Junction | Connection point |
| ⏚ | Ground | Reference (0V) |

---

## 🚀 What to Test

1. **Basic circuit works?** (battery + resistor + ground)
2. **Components drop where you drag them?**
3. **Wires are straight?** (not curved)
4. **Simulation produces results?**
5. **Error messages helpful?**

---

## 📝 Report Issues

After testing, let me know:
- What works ✅
- What doesn't work ❌
- What's confusing 🤔
- What features you want 🎯

---

**Happy circuit building! ⚡🔧**
