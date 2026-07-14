# Component Images Setup Guide

## Overview

The circuit canvas now uses visual images/symbols for components instead of colored boxes. The system supports both PNG images and built-in SVG fallbacks.

## Where to Add Your PNG Images

Add your component images to:
```
d:\circuit_proj\frontend\public\components\
```

## Required Files

Create PNG files with these exact names:

1. **resistor.png** - Resistor zigzag symbol
2. **capacitor.png** - Capacitor parallel lines symbol  
3. **inductor.png** - Inductor coil/spiral symbol
4. **dc_source.png** - DC voltage source (circle with +/-)

## Image Requirements

- **Format**: PNG with transparent background
- **Size**: Approximately 80-100px wide, 30-50px tall
- **Color**: Black or dark gray symbols
- **Orientation**: Horizontal (left terminal → right terminal)

## Built-in SVG Fallbacks

If you don't provide PNG images, the system automatically uses built-in SVG symbols:

- ✅ **Resistor**: Zigzag waveform
- ✅ **Capacitor**: Two parallel lines
- ✅ **Inductor**: Coiled/arc pattern
- ✅ **DC Source**: Circle with +/- symbol

## How It Works

1. System tries to load PNG from `/components/[component-type].png`
2. If PNG fails to load → automatically switches to SVG fallback
3. Component value is displayed below the symbol
4. All components have white background with gray border

## Visual Style

The new design features:
- Clean white boxes with subtle gray borders
- Professional circuit symbols (PNG or SVG)
- Component values displayed below symbols
- Minimal, uncluttered appearance
- Connection terminals on left and right sides

## Testing

To test with PNG images:
1. Place your PNG files in `frontend/public/components/`
2. Run `npm run dev` in the frontend directory
3. Drag components onto the canvas
4. Images should appear automatically

## Example Image Sources

- IEEE/IEC standard circuit symbols
- LTspice component library exports
- Electronic CAD software symbol libraries
- Hand-drawn schematic symbols (scanned/vectorized)
