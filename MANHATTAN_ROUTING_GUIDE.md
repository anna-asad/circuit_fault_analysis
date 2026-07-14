# Manhattan/Orthogonal Wire Routing Implementation

## Overview
Implemented textbook-style circuit schematic rendering with Manhattan routing (right-angle wires) instead of diagonal lines, matching standard electrical engineering conventions used in LTSpice, KiCad, and textbooks.

## Changes Made

### 1. Wire Routing Type
**File**: `CircuitCanvas.jsx`

**Before**: `type: 'straight'` - Diagonal point-to-point lines
**After**: `type: 'smoothstep'` - Manhattan routing with smooth corners

```javascript
const onConnect = useCallback(
  (params) =>
    setEdges((eds) =>
      addEdge(
        { 
          ...params, 
          type: 'smoothstep',  // Manhattan routing
          animated: false, 
          style: { stroke: '#1f2937', strokeWidth: 2 },
          pathOptions: { borderRadius: 8 }  // Rounded corners
        },
        eds
      )
    ),
  [setEdges]
);
```

### 2. Grid Snapping
**File**: `CircuitCanvas.jsx`

Added to ReactFlow component:
```javascript
snapToGrid={true}
snapGrid={[20, 20]}
```

**Benefits**:
- Components align to 20px grid
- Wires meet cleanly at right angles
- No arbitrary offsets
- Professional schematic appearance

### 3. Background Grid
**File**: `CircuitCanvas.jsx`

Updated to match snap grid:
```javascript
<Background variant="dots" gap={20} size={1.5} color="#d1d5db" />
```

**Changes**:
- Gap: 16px → 20px (matches snap grid)
- Size: 1px → 1.5px (more visible)
- Color: Added explicit gray color for clarity

### 4. Connection Handles
**File**: `CircuitCanvas.css`

**Visual Improvements**:
- Size: 8px → 10px (more visible)
- Color: White → Blue (#3b82f6)
- Opacity: 0.5 → 0.8 (always visible)
- Hover: Scales up 1.3x with darker blue
- Border: Better contrast

**Before**:
```css
.circuit-handle {
  width: 8px;
  background: #ffffff;
  opacity: 0.5;
}
```

**After**:
```css
.circuit-handle {
  width: 10px;
  background: #3b82f6;
  opacity: 0.8;
  transform: scale(1.3) on hover;
}
```

### 5. Wire Styling
**File**: `CircuitCanvas.css`

Added smooth corners:
```css
.react-flow__edge-path {
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
}
```

## Visual Results

### Before (Diagonal Routing)
```
    V1
     ╲
      ╲
       R1
        ╲
         ╲
          ⏚
```
Messy diagonal lines, arbitrary positioning

### After (Manhattan Routing)
```
    V1────┐
          │
          R1
          │
          ⏚
```
Clean rectangular loops, right-angle corners

## Circuit Layout Best Practices

### 1. **Simple Series Circuit**
```
┌──V1──R1──┐
│          │
└────⏚─────┘
```
- Place voltage source on left
- Components flow left-to-right or top-to-bottom
- Ground at bottom-right

### 2. **Parallel Circuit**
```
    V1
    │
┌───┴───┐
R1      R2
│       │
└───┬───┘
    ⏚
```
- Use junctions (●) for splits
- Symmetrical layout
- Ground at bottom

### 3. **Complex Circuit**
```
V1──R1──●──R2──┐
        │      │
        R3     C1
        │      │
        ●──────┘
        ⏚
```
- Multiple junctions for clarity
- Grid alignment keeps it clean
- Manhattan routing prevents diagonal chaos

## Technical Details

### ReactFlow Edge Types

| Type | Description | Use Case |
|------|-------------|----------|
| `straight` | Direct diagonal line | ❌ Not for circuits |
| `smoothstep` | Manhattan with curves | ✅ Standard circuits |
| `step` | Manhattan sharp corners | ⚠️ Too angular |
| `bezier` | Curved flowing lines | ❌ Not standard |

**Choice**: `smoothstep` provides the best balance:
- Right-angle routing (Manhattan)
- Smooth 8px radius corners (not harsh)
- Professional appearance
- Matches textbook conventions

### Grid System

**20px Grid**:
- Components snap to 20px intervals
- Handles positioned at component edges
- Background dots at 20px spacing
- Perfect alignment for wires

**Why 20px?**
- Not too fine (10px = too granular)
- Not too coarse (40px = too limited)
- Works well with typical component sizes (70-100px wide)
- Clean 5-unit subdivisions if needed

### Handle Positioning

All components have handles at:
- **Left edge**: `left: -5px` (5px outside component)
- **Right edge**: `right: -5px` (5px outside component)

This ensures:
- Wires connect to component edges, not centers
- Manhattan routing looks natural
- No awkward diagonal connections from mid-component

## Comparison with Industry Tools

### LTSpice
- Uses Manhattan routing: ✅ Matches
- Grid snapping: ✅ Matches
- Right-angle wires: ✅ Matches

### KiCad
- Orthogonal wiring: ✅ Matches
- Grid-based layout: ✅ Matches
- Professional schematics: ✅ Matches

### Textbooks
- Rectangular loops: ✅ Matches
- Clean right angles: ✅ Matches
- Standard conventions: ✅ Matches

## User Experience Improvements

### 1. **Easier to Build**
- Components snap to grid automatically
- No fiddly positioning
- Wires naturally form rectangles

### 2. **Easier to Read**
- Standard textbook appearance
- Clear signal paths
- No visual confusion

### 3. **Professional Output**
- Export-ready schematics
- Presentation quality
- Educational clarity

### 4. **Better Debugging**
- Clear connection points
- Obvious wire paths
- Easy to trace signals

## Migration Notes

### Existing Circuits
Existing circuits with diagonal wires will:
- Keep their diagonal edges (type: 'straight')
- New connections use Manhattan routing
- Can be rebuilt with grid snapping

### Future Improvements
1. **Auto-router**: Automatically route wires around components
2. **Wire cleanup**: Simplify overlapping wire segments
3. **Alignment tools**: Align multiple components at once
4. **Component rotation**: Full 90° rotation support (already planned)

## Testing

### Manual Test Checklist
- [ ] Place two components on canvas
- [ ] Drag to connect - wire forms right angles
- [ ] Components snap to grid when dragged
- [ ] Background dots align with snap points
- [ ] Handles visible and easy to click
- [ ] Wire corners are smooth (not harsh)
- [ ] Simple loop forms clean rectangle
- [ ] Junction splits work with Manhattan routing

### Expected Behavior
1. Drop component → snaps to grid
2. Drag component → moves in 20px increments
3. Connect wire → routes horizontally/vertically
4. Create loop → forms rectangle, not X-shape

## Performance

No performance impact:
- `smoothstep` is built into ReactFlow
- Grid snapping is O(1) operation
- Same render performance as before
- No custom edge components needed

## Accessibility

Improved accessibility:
- ✅ Larger handles (easier to click)
- ✅ Better contrast (blue vs background)
- ✅ Clear connection points
- ✅ Standard visual conventions

## Browser Compatibility

Works in all modern browsers:
- ✅ Chrome/Edge
- ✅ Firefox  
- ✅ Safari
- Uses standard SVG rendering
- No special browser features required
