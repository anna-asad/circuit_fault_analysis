# Component Images

Place your PNG images for circuit components in this directory with the following names:

## Required Image Files:

1. **resistor.png** - Resistor symbol (zigzag pattern recommended)
2. **capacitor.png** - Capacitor symbol (two parallel lines)
3. **inductor.png** - Inductor symbol (coiled/spiral pattern)
4. **dc_source.png** - DC voltage source symbol (circle with +/- or battery symbol)
5. **current_source.png** - Current source symbol (circle with arrow pointing up)

## Image Specifications:

- **Format**: PNG with transparent background
- **Recommended size**: 80-100px width, 30-50px height
- **Style**: Black or dark gray symbols on transparent background
- **Orientation**: Horizontal (terminals on left and right)

## Example Sources:

You can find circuit symbol images from:
- Electronic circuit symbol libraries
- LTspice component images
- Standard electrical schematic symbols (IEEE/IEC standards)

## Fallback Behavior:

If images are not provided, the system will automatically use SVG fallback symbols that are built into the application.

## Current Status:

The application is configured to:
1. First try to load PNG images from this directory
2. If image fails to load, automatically fallback to built-in SVG symbols
3. Display component values below the symbol
