import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  addEdge,
  useUpdateNodeInternals,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './CircuitCanvas.css';

// ── SVG symbols ───────────────────────────────────────────────────────────────
const COMPONENT_SVGS = {
  resistor: (
    <svg className="component-svg" viewBox="0 0 100 30" preserveAspectRatio="xMidYMid meet">
      <path d="M 0 15 L 15 15 L 20 5 L 30 25 L 40 5 L 50 25 L 60 5 L 70 25 L 80 5 L 85 15 L 100 15"
            stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  capacitor: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="45" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="45" y1="5"  x2="45" y2="35" stroke="currentColor" strokeWidth="3"/>
      <line x1="55" y1="5"  x2="55" y2="35" stroke="currentColor" strokeWidth="3"/>
      <line x1="55" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  inductor: (
    <svg className="component-svg" viewBox="0 0 100 30" preserveAspectRatio="xMidYMid meet">
      <path d="M 0 15 L 10 15 Q 10 5,15 5 Q 20 5,20 15 Q 20 5,25 5 Q 30 5,30 15 Q 30 5,35 5 Q 40 5,40 15 Q 40 5,45 5 Q 50 5,50 15 Q 50 5,55 5 Q 60 5,60 15 Q 60 5,65 5 Q 70 5,70 15 Q 70 5,75 5 Q 80 5,80 15 Q 80 5,85 5 Q 90 5,90 15 L 100 15"
            stroke="currentColor" strokeWidth="2.5" fill="none"/>
    </svg>
  ),
  dc_source: (
    <svg className="component-svg" viewBox="0 0 80 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="25" y1="8"  x2="25" y2="32" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="35" y1="12" x2="35" y2="28" stroke="currentColor" strokeWidth="3"/>
      <line x1="35" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  current_source: (
    <svg className="component-svg" viewBox="0 0 50 100" preserveAspectRatio="xMidYMid meet">
      {/* Top terminal (positive, current source) */}
      <line x1="25" y1="0" x2="25" y2="25" stroke="currentColor" strokeWidth="2.5"/>
      {/* Circle symbol */}
      <circle cx="25" cy="50" r="15" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      {/* Bottom terminal (negative, current sink) */}
      <line x1="25" y1="75" x2="25" y2="100" stroke="currentColor" strokeWidth="2.5"/>
      {/* Arrow pointing down (current flow direction: top → bottom) */}
      <path d="M 25 35 L 25 65 M 20 60 L 25 65 L 30 60" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="miter"/>
    </svg>
  ),
  // Ammeter: circle with 'A' — two leads, must be wired in series
  ammeter: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="50" cy="20" r="16" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <text x="50" y="25" textAnchor="middle" fontSize="14" fontWeight="bold"
            fontFamily="monospace" fill="currentColor">A</text>
      <line x1="75" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  // Voltmeter: circle with 'V' — two leads, must be wired in parallel
  voltmeter: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="50" cy="20" r="16" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <text x="50" y="25" textAnchor="middle" fontSize="14" fontWeight="bold"
            fontFamily="monospace" fill="currentColor">V</text>
      <line x1="75" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  // Switch: open/closed toggle
  switch_open: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="20" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="20" cy="20" r="3" fill="currentColor"/>
      <line x1="20" y1="20" x2="75" y2="5" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="80" cy="20" r="3" fill="currentColor"/>
      <line x1="80" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  switch_closed: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="20" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="20" cy="20" r="3" fill="currentColor"/>
      <line x1="20" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="80" cy="20" r="3" fill="currentColor"/>
      <line x1="80" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  // Bulb: light bulb icon
  bulb: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0"  y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="50" cy="20" r="12" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      {/* Filament */}
      <path d="M 45 15 Q 50 20, 55 15 M 45 20 Q 50 22, 55 20 M 45 25 Q 50 22, 55 25"
            stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <line x1="75" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
};

let _bulbIdCounter = 0;

function renderComponentGraphic(componentType, state) {
  if (componentType === 'bulb') {
    const isBright = state === 'bright';
    const isDim = state === 'dim';
    const isOn = isBright || isDim;
    const bulbId = _bulbIdCounter++;
    const glowFilterId = `bulbGlow_${bulbId}`;
    return (
      <svg className={`component-svg bulb-svg ${isOn ? 'bulb-svg-on' : 'bulb-svg-off'}`} viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id={glowFilterId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={isBright ? "3" : "1.5"} result="blur" />
            <feColorMatrix in="blur" type="matrix" values={`1 0 0 0 ${isBright ? '0.4' : '0.15'}  0 1 0 0 ${isBright ? '0.3' : '0.1'}  0 0 1 0 0  0 0 0 ${isBright ? '2' : '1'} 0`} result="glowColor" />
            <feMerge>
              <feMergeNode in="glowColor" />
              {isBright && <feMergeNode in="glowColor" />}
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Glow halo: large blurred circle behind the bulb */}
        {isOn && (
          <circle cx="50" cy="20" r={isBright ? "18" : "14"} fill={isBright ? '#ffd54f' : '#fff3cd'} opacity={isBright ? "0.35" : "0.15"} filter={`url(${glowFilterId})`} />
        )}
        <line x1="0" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5" />
        {/* Bulb glass: filled yellow when on, outline when off */}
        <circle cx="50" cy="20" r="12" stroke={isOn ? (isBright ? '#ff8f00' : '#ffb300') : 'currentColor'} strokeWidth="2.5" fill={isOn ? (isBright ? '#fff3cd' : '#fffde7') : 'none'} />
        {/* Inner glow: brighter center */}
        {isOn && (
          <circle cx="50" cy="20" r={isBright ? "7" : "4"} fill={isBright ? '#ffec99' : '#fff9c4'} opacity={isBright ? "0.8" : "0.5"} />
        )}
        {/* Filament */}
        <path d="M 45 15 Q 50 20, 55 15 M 45 20 Q 50 22, 55 20 M 45 25 Q 50 22, 55 25"
              stroke={isOn ? (isBright ? '#ff6f00' : '#ff8f00') : 'currentColor'} strokeWidth="1.5" fill="none" />
        <line x1="75" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    );
  }

  if (componentType === 'switch') {
    return state === 'closed' ? COMPONENT_SVGS.switch_closed : COMPONENT_SVGS.switch_open;
  }

  return COMPONENT_SVGS[componentType] ?? COMPONENT_SVGS.resistor;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_VALUES = {
  dc_source: 5.0,
  current_source: 0.012,  // 12 mA default
  resistor: 1000,
  capacitor: 1e-7,
  inductor: 1e-6,
  ground: 0,
  ammeter: 0,    // ideal: 0 Ω
  voltmeter: 0,  // ideal: ∞ Ω (represented as 0, never used as a real value)
  switch: 0,     // state-based, no numeric value
  bulb: 240,     // typical bulb resistance in ohms
};

const NODE_STYLES = {
  base: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#1a1a1a',
  },
  junction: {
    padding: '0',
    borderRadius: '50%',
    width: '10px',
    height: '10px',
    background: '#1a1a1a',
    border: 'none',
    color: 'transparent',
  },
  ground: {
    background: 'transparent',
    border: 'none',
    minWidth: '44px',
    minHeight: '52px',
  },
  // Ammeter: red accent border — series device
  ammeter: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#c0392b',
  },
  // Voltmeter: blue accent border — parallel device
  voltmeter: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#1a6ab5',
  },
  // Switch: green accent
  switch: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#27ae60',
  },
  // Bulb: orange accent
  bulb: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: 'none',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: 'transparent',
    color: '#f39c12',
  },
};

// ── Rotation helpers ─────────────────
const ROTATION_TO_POSITIONS = {
    0: { left: Position.Left,   right: Position.Right },
   90: { left: Position.Top,    right: Position.Bottom },
  180: { left: Position.Right,  right: Position.Left },
  270: { left: Position.Bottom, right: Position.Top },
};

function getHandlePositions(rotation = 0) {
  return ROTATION_TO_POSITIONS[((rotation % 360) + 360) % 360] ?? ROTATION_TO_POSITIONS[0];
}

// ── Wire-splitting geometry helpers ───────────────────────────────────────────
// Shared by onConnectEnd so handle positions match rendered nodes (including rotation).

function parseDim(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.endsWith('px')) return parseInt(value, 10);
  return null;
}

function getComponentRotation(node) {
  return node?.data?.rotation ?? 0;
}

function getNodeSize(node) {
  const ct = node?.data?.componentType;
  const st = node?.data?.style || node?.style || {};

  if (ct === 'junction') {
    const junctionStyle = { ...NODE_STYLES.junction, ...st };
    return {
      w: parseDim(junctionStyle.width) || parseDim(junctionStyle.minWidth) || 10,
      h: parseDim(junctionStyle.height) || parseDim(junctionStyle.minHeight) || 10,
    };
  }

  if (ct === 'ground') {
    const groundStyle = { ...NODE_STYLES.ground, ...st };
    return {
      w: parseDim(groundStyle.width) || parseDim(groundStyle.minWidth) || 44,
      h: parseDim(groundStyle.height) || parseDim(groundStyle.minHeight) || 52,
    };
  }

  if (node?.width && node?.height) {
    return { w: node.width, h: node.height };
  }

  const rotation = getComponentRotation(node);
  const isVertical = ct === 'current_source'
    ? (rotation === 0 || rotation === 180)
    : (rotation === 90 || rotation === 270);

  const baseStyle = { ...NODE_STYLES.base, ...st };
  const nativeW = parseDim(baseStyle.minWidth) || parseDim(baseStyle.width) || 80;
  const nativeH = parseDim(baseStyle.minHeight) || parseDim(baseStyle.height)
    || (ct === 'current_source' ? 90 : 52);

  return {
    w: isVertical ? nativeW : nativeH,
    h: isVertical ? nativeH : nativeW,
  };
}

function positionToCoords(position, nx, ny, w, h) {
  switch (position) {
    case Position.Left:   return { x: nx, y: ny + h / 2 };
    case Position.Right:  return { x: nx + w, y: ny + h / 2 };
    case Position.Top:    return { x: nx + w / 2, y: ny };
    case Position.Bottom: return { x: nx + w / 2, y: ny + h };
    default:              return { x: nx + w / 2, y: ny + h / 2 };
  }
}

function getHandleIdToPosition(node, handleId) {
  const ct = node?.data?.componentType;
  const rotation = getComponentRotation(node);
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (ct === 'junction' || ct === 'ground') {
    const map = {
      left: Position.Left,
      right: Position.Right,
      top: Position.Top,
      bottom: Position.Bottom,
    };
    return map[handleId] ?? Position.Top;
  }

  if (ct === 'current_source') {
    const currentSourcePositions = {
      0: { left: Position.Top, right: Position.Bottom },
      90: { left: Position.Right, right: Position.Left },
      180: { left: Position.Bottom, right: Position.Top },
      270: { left: Position.Left, right: Position.Right },
    };
    const positions = currentSourcePositions[normalizedRotation] ?? currentSourcePositions[0];
    return handleId === 'right' ? positions.right : positions.left;
  }

  const { left, right } = getHandlePositions(normalizedRotation);
  return handleId === 'right' ? right : left;
}

function getHandlePos(node, handleId) {
  const nx = node.positionAbsolute?.x ?? node.position.x;
  const ny = node.positionAbsolute?.y ?? node.position.y;
  const { w, h } = getNodeSize(node);
  const position = getHandleIdToPosition(node, handleId);
  return positionToCoords(position, nx, ny, w, h);
}

/** Center (jx, jy) and size — compute a junction handle's flow position before render. */
function getJunctionHandlePos(centerX, centerY, jWidth, jHeight, handleId) {
  const nx = centerX - jWidth / 2;
  const ny = centerY - jHeight / 2;
  const position = getHandleIdToPosition(
    { data: { componentType: 'junction' } },
    handleId
  );
  return positionToCoords(position, nx, ny, jWidth, jHeight);
}

/** Classify wire as horizontal or vertical from endpoint handle positions. */
function isWireHorizontal(srcPos, tgtPos) {
  return Math.abs(tgtPos.x - srcPos.x) >= Math.abs(tgtPos.y - srcPos.y);
}

function pickClosestHandle(candidateIds, anchor, centerX, centerY, jWidth, jHeight) {
  let bestId = candidateIds[0];
  let bestDist = Infinity;
  candidateIds.forEach((handleId) => {
    const hp = getJunctionHandlePos(centerX, centerY, jWidth, jHeight, handleId);
    const d = Math.hypot(anchor.x - hp.x, anchor.y - hp.y);
    if (d < bestDist) {
      bestDist = d;
      bestId = handleId;
    }
  });
  return bestId;
}

// ── Value formatting ──────────────────────────────────────────────────────────
function formatValue(value, type) {
  if (type === 'resistor') {
    return value >= 1000 ? `${value / 1000}kΩ` : `${value}Ω`;
  }
  if (type === 'capacitor') {
    if (value >= 1e-6) return `${value * 1e6}µF`;
    if (value >= 1e-9) return `${value * 1e9}nF`;
    return `${value * 1e12}pF`;
  }
  if (type === 'inductor') {
    if (value >= 1e-3) return `${value * 1e3}mH`;
    if (value >= 1e-6) return `${value * 1e6}µH`;
    return `${value * 1e9}nH`;
  }
  if (type === 'current_source') {
    if (value >= 1) return `${value}A`;
    if (value >= 1e-3) return `${value * 1e3}mA`;
    if (value >= 1e-6) return `${value * 1e6}µA`;
    return `${value * 1e9}nA`;
  }
  if (type === 'bulb') {
    return value >= 1000 ? `${value / 1000}kΩ` : `${value}Ω`;
  }
  return value;
}

function formatNodeValue(type, value, state) {
  if (type === 'dc_source') return `${value}V`;
  if (type === 'current_source') return formatValue(value, type);
  if (type === 'ammeter')   return '— A —';
  if (type === 'voltmeter') return '— V —';
  if (type === 'switch')    return state === 'closed' ? 'Closed' : 'Open';
  if (type === 'bulb')      return 'Bulb';
  return formatValue(value, type);
}

function getNodeStyle(type) {
  if (type === 'junction')      return NODE_STYLES.junction;
  if (type === 'ground')        return NODE_STYLES.ground;
  if (type === 'ammeter')       return NODE_STYLES.ammeter;
  if (type === 'voltmeter')     return NODE_STYLES.voltmeter;
  if (type === 'switch')        return NODE_STYLES.switch;
  if (type === 'bulb')          return NODE_STYLES.bulb;
  if (type === 'dc_source')     return { ...NODE_STYLES.base, minWidth: '90px' };
  if (type === 'current_source') return { ...NODE_STYLES.base, minWidth: '60px', minHeight: '90px' };
  return NODE_STYLES.base;
}

// ── ValueEditor ───────────────────────────────────────────────────
function ValueEditor({ valueDraft, error, onChange, onSave, onCancel, onSetDesign, isResistor }) {
  const stopProp = useCallback((e) => e.stopPropagation(), []);
  return (
    <div className="value-editor" onClick={stopProp}>
      <input
        className="value-editor-input"
        inputMode="decimal"
        type="text"
        autoFocus
        value={valueDraft}
        onChange={onChange}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter')  onSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="value-editor-actions">
        <button type="button" className="value-editor-btn" onClick={onSave}>✓</button>
        <button type="button" className="value-editor-btn" onClick={onCancel}>✕</button>
      </div>
      {isResistor && onSetDesign && (
        <div className="value-editor-design">
          <button
            type="button"
            className="value-editor-btn-design"
            onClick={onSetDesign}
            title="Reset the design (nominal) baseline to this value"
          >
            📌 Set as Design Value
          </button>
          <p className="value-editor-design-hint">
            Future edits will use this as the baseline.
          </p>
        </div>
      )}
      {error && <div className="value-editor-error">{error}</div>}
    </div>
  );
}

// ── NodeTerminals ─────────────────────────────────────────────────────────────
function NodeTerminals({ rotation = 0, componentType }) {
  const normalizedRotation = ((rotation % 360) + 360) % 360;

  if (componentType === 'current_source'|| componentType === 'currentSource') {
    const currentSourcePositions = {
      0: { left: Position.Top,    right: Position.Bottom },
      90: { left: Position.Right, right: Position.Left },
      180: { left: Position.Bottom, right: Position.Top },
      270: { left: Position.Left, right: Position.Right },
    };
    const positions = currentSourcePositions[normalizedRotation] ?? currentSourcePositions[0];

    return (
      <>
        <Handle
          key={`${componentType}-${normalizedRotation}-left`}
          type="source"
          position={positions.left}
          id="left"
          className="circuit-handle"
        />
        <Handle
          key={`${componentType}-${normalizedRotation}-right`}
          type="source" 
          position={positions.right}
          id="right"
          className="circuit-handle"
        />
      </>
    );
  }

  const { left, right } = getHandlePositions(normalizedRotation);
  return (
    <>
      <Handle
        key={`${componentType}-${normalizedRotation}-left`}
        type="source"
        position={left}
        id="left"
        className="circuit-handle"
      />
      <Handle
        key={`${componentType}-${normalizedRotation}-right`}
        type="source"
        position={right}
        id="right"
        className="circuit-handle"
      />
    </>
  );
}

// ── ComponentNode ─────────────────────────────────────────────────────────────
function ComponentNode({ id, data, mode }) {
  const rotation = data.rotation ?? 0;
  const updateNodeInternals = useUpdateNodeInternals();
  
  // Update React Flow internals when rotation changes (after render commits)
  // Skip the initial render by using useRef to track if it's the first mount
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Rotation has changed - notify React Flow to recalculate handle positions
    updateNodeInternals(id);
  }, [rotation, id, updateNodeInternals]);
  
  // For current_source the native orientation is vertical (SVG viewBox is portrait).
  // isVertical = true  → component is in its natural portrait orientation (0°/180°)
  // isVertical = false → component has been rotated to landscape (90°/270°)
  // For all other components the native orientation is horizontal.
  const isVertical = data.componentType === 'current_source'
    ? (rotation === 0 || rotation === 180)
    : (rotation === 90 || rotation === 270);

  // Box dimensions: always make the longer side match the component's lead axis.
  // current_source native: minWidth='60px' (narrow), minHeight='90px' (tall).
  // At 0°/180° (portrait): width=60, height=90.
  // At 90°/270° (landscape): swap → width=90, height=60.
  const nativeW = data.style?.minWidth  || '80px';
  const nativeH = data.style?.minHeight || '52px';
  const nodeStyle = {
    ...data.style,
    width:     isVertical ? nativeW : nativeH,
    height:    isVertical ? nativeH : nativeW,
    minWidth:  undefined,
    minHeight: undefined,
  };

  // Visual container also swaps dimensions to properly contain rotated SVG
  const visualContainerStyle = {
    transform: `rotate(${rotation}deg)`,
    transformOrigin: 'center center',
    transition: 'transform 0.15s ease',
    width: isVertical ? '32px' : '100%',
    height: isVertical ? '100%' : '32px',
  };

  // Apply compact styling for vertical orientation
  const valueButtonStyle = isVertical ? { fontSize: '9px', maxWidth: '100%' } : {};
  const labelStyle = isVertical ? { fontSize: '9px', maxWidth: '100%' } : {};

  if (mode === 'results') {
    return (
      <div className="circuit-node circuit-node-component" style={nodeStyle}>
        <div className="circuit-node-content component-content">
          <div>
            <NodeTerminals rotation={rotation} componentType={data.componentType} />
            <div className="component-visual-container" style={visualContainerStyle}>
              <div className="component-svg-fallback visible">
                {renderComponentGraphic(data.componentType, data.state)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { isEditing, valueDraft, valueError, componentType, value, label } = data;

  return (
    <div className="circuit-node circuit-node-component" style={nodeStyle}>
      <div className="circuit-node-content component-content">
        {/* Component reference label (R1, C2, V1 …) — stacking context ensures visibility */}
        <div className="component-ref-label" style={labelStyle}>{label}</div>
        <div>
          <NodeTerminals rotation={rotation} componentType={componentType} />
          {/* SVG symbol rotates; container becomes portrait box at 90°/270° */}
          <div className="component-visual-container" style={visualContainerStyle}>
            <div className="component-svg-fallback visible">
              {componentType === 'switch' 
                ? (data.state === 'closed' ? COMPONENT_SVGS.switch_closed : COMPONENT_SVGS.switch_open)
                : COMPONENT_SVGS[componentType]
              }
            </div>
          </div>
        </div>
        {isEditing ? (
          <ValueEditor
            valueDraft={valueDraft}
            error={valueError}
            onChange={(e) => data.onChangeDraft?.(id, e.target.value)}
            onSave={() => data.onSaveDraft?.(id)}
            onCancel={() => data.onCancelDraft?.(id)}
            onSetDesign={() => data.onResetDesignValue?.(id)}
            isResistor={componentType === 'resistor'}
          />
        ) : (
          // Meters have no user-editable value — show a read-only placeholder
          componentType === 'ammeter' || componentType === 'voltmeter' ? (
            <span className="meter-placeholder">
              {componentType === 'ammeter' ? 'series' : 'parallel'}
            </span>
          ) : componentType === 'bulb' ? (
            <span className="value-button bulb-placeholder">
              Bulb
            </span>
          ) : componentType === 'switch' ? (
            // Switch shows state toggle button
            <button
              type="button"
              className="value-button switch-state-button"
              style={valueButtonStyle}
              onClick={(e) => {
                e.stopPropagation();
                data.onToggleSwitch?.(id);
              }}
            >
              {data.state === 'closed' ? 'Closed' : 'Open'}
            </button>
          ) : (
          <button
            type="button"
            className="value-button"
            style={valueButtonStyle}
            onClick={(e) => {
              e.stopPropagation();
              data.onEditValue?.(id);
            }}
          >
            {formatNodeValue(componentType, value, data.state)}
          </button>
          )
        )}
      </div>
    </div>
  );
}

// ── JunctionNode / GroundNode ─────────────────────────────────────────────────
function JunctionNode({ data, style }) {
  // Allow explicit handle position overrides from data.handlePositions
  // This ensures through-handles maintain wire trajectory without zigzags
  const handlePositions = data?.handlePositions || {
    left: Position.Left,
    right: Position.Right,
    top: Position.Top,
    bottom: Position.Bottom,
  };
  
  return (
    <div className="circuit-node circuit-node-junction" style={data?.style || style}>
      <Handle type="source" position={handlePositions.left}   id="left"   className="circuit-handle" />
      <Handle type="source" position={handlePositions.right}  id="right"  className="circuit-handle" />
      <Handle type="source" position={handlePositions.top}    id="top"    className="circuit-handle" />
      <Handle type="source" position={handlePositions.bottom} id="bottom" className="circuit-handle" />
      <div className="junction-dot" />
    </div>
  );
}

// ── GroundNode ─────────────────────────────────────────────────────────────
function GroundNode({ data, style }) {
  return (
    <div className="circuit-node circuit-node-ground" style={data?.style || style}>
      {/* Single connection handle at the top of the ground symbol */}
      <Handle type="source" position={Position.Top} id="top" className="circuit-handle" />
      <svg
        className="ground-svg"
        viewBox="0 0 40 36"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Vertical stem */}
        <line x1="20" y1="0"  x2="20" y2="10" stroke="#16a34a" strokeWidth="2"/>
        {/* Three horizontal bars — wide, medium, narrow */}
        <line x1="4"  y1="10" x2="36" y2="10" stroke="#0eb294ff" strokeWidth="2.5"/>
        <line x1="10" y1="18" x2="30" y2="18" stroke="#0eb294ff"  strokeWidth="2.5"/>
        <line x1="16" y1="26" x2="24" y2="26" stroke="#0eb294ff"  strokeWidth="2.5"/>
      </svg>
    </div>
  );
}

// ── Main canvas component ─────────────────────────────────────────────────────
function CircuitCanvas({ setCircuit, mode = 'edit', circuit, componentCounters, setComponentCounters }) {
  const isReadOnly = mode === 'results';
  const [showInstructions, setShowInstructions] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowRef = useRef(null);

  // ── Value editing callbacks ───────────────────────────────────────────────
  const handleEditValue = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                isEditing: true,
                valueDraft: String(n.data?.value ?? DEFAULT_VALUES[n.data?.componentType] ?? 0),
                valueError: null,
              },
            }
          : n
      )
    );
  }, [setNodes]);

  const handleChangeDraft = useCallback((nodeId, raw) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, valueDraft: raw, valueError: null } }
          : n
      )
    );
  }, [setNodes]);

  const handleSaveDraft = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextValue = Number(n.data?.valueDraft ?? '');
        if (!Number.isFinite(nextValue)) {
          return { ...n, data: { ...n.data, valueError: 'Enter a valid numeric value' } };
        }
        return {
          ...n,
          data: {
            ...n.data,
            value: nextValue,
            // nominalValue is set at drop time and never changed here.
            isEditing: false,
            valueDraft: undefined,
            valueError: null,
          },
        };
      })
    );
  }, [setNodes]);

  const handleCancelDraft = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, isEditing: false, valueDraft: undefined, valueError: null } }
          : n
      )
    );
  }, [setNodes]);

  const handleResetDesignValue = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextValue = Number(n.data?.valueDraft ?? '');
        if (!Number.isFinite(nextValue)) {
          return { ...n, data: { ...n.data, valueError: 'Enter a valid numeric value' } };
        }
        return {
          ...n,
          data: {
            ...n.data,
            value:        nextValue,
            nominalValue: nextValue,   // reset the design baseline to current input
            isEditing:    false,
            valueDraft:   undefined,
            valueError:   null,
          },
        };
      })
    );
  }, [setNodes]);

  const handleToggleSwitch = useCallback((nodeId) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                state: n.data.state === 'closed' ? 'open' : 'closed',
              },
            }
          : n
      )
    );
  }, [setNodes]);

  const WIRE_COLOR        = '#1a1a1a';
  const GROUND_WIRE_COLOR = '#16a34a'; // green — ground connections

  // ── Wire connection ───────────────────────────────────────────────────────
  const onConnect = useCallback(
    (params) => {
      window.connectionHandled = true;
      const isGroundEdge = nodes.some(
        n => (n.id === params.source || n.id === params.target)
          && n.data?.componentType === 'ground'
      );
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: false,
            style: { stroke: isGroundEdge ? GROUND_WIRE_COLOR : WIRE_COLOR, strokeWidth: 2 },
            pathOptions: { borderRadius: 0 },
          },
          eds
        )
      );
    },
    [setEdges, nodes]
  );

  // ── Handle ground connecting to edges (wires) ────────────────────────────
  const onConnectStart = useCallback((event, { nodeId, handleId }) => {
    window.connectionStart   = { nodeId, handleId };
    window.connectionHandled = false; // reset for this drag gesture
  }, []);

  // ── onConnectEnd: auto-junction when a wire is dropped onto another wire ──
  //
  // This fires for ANY component drag that ends over empty canvas or a wire
  // (i.e. NOT over a handle — those go through onConnect instead).
  //
  // Behaviour:
  //   1. Find the nearest existing wire to the drop point (generous threshold).
  //   2. Insert an auto-junction at the nearest point on that wire.
  //   3. Split the original wire into two segments through the junction.
  //   4. Connect the dragged component's handle to the junction.
  //
  // This works for every component type: ground, voltmeter, ammeter, resistor,
  // capacitor, inductor, dc_source, current_source.
  const onConnectEnd = useCallback(
    (event) => {
      // onConnect already handled a proper handle→handle connection — skip.
      if (window.connectionHandled) {
        window.connectionStart   = null;
        window.connectionHandled = false;
        return;
      }

      const instance = reactFlowRef.current;
      if (!instance || !window.connectionStart) return;

      const { nodeId: startNodeId, handleId: startHandleId } = window.connectionStart;
      const startNode = nodes.find(n => n.id === startNodeId);
      if (!startNode) { window.connectionStart = null; return; }

      const { clientX, clientY } = event;
      const position = instance.screenToFlowPosition({ x: clientX, y: clientY });

      // ── Find the nearest wire to the drop point ───────────────────────────
      const THRESHOLD = 80;
      let nearestEdge  = null;
      let minDistance  = Infinity;
      let nearestPoint = null;

      edges.forEach(edge => {
        if (edge.source === startNodeId || edge.target === startNodeId) return;

        const srcNode = nodes.find(n => n.id === edge.source);
        const tgtNode = nodes.find(n => n.id === edge.target);
        if (!srcNode || !tgtNode) return;

        const srcPos = getHandlePos(srcNode, edge.sourceHandle);
        const tgtPos = getHandlePos(tgtNode, edge.targetHandle);

        const dx = tgtPos.x - srcPos.x;
        const dy = tgtPos.y - srcPos.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0
          ? ((position.x - srcPos.x) * dx + (position.y - srcPos.y) * dy) / lenSq
          : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = srcPos.x + t * dx;
        const cy = srcPos.y + t * dy;
        const dist = Math.hypot(position.x - cx, position.y - cy);

        if (dist < THRESHOLD && dist < minDistance) {
          minDistance  = dist;
          nearestEdge  = edge;
          nearestPoint = { x: cx, y: cy };
        }
      });

      if (!nearestEdge) {
        window.connectionStart   = null;
        window.connectionHandled = false;
        return;
      }

      const srcNode = nodes.find(n => n.id === nearestEdge.source);
      const tgtNode = nodes.find(n => n.id === nearestEdge.target);
      const srcPos  = getHandlePos(srcNode, nearestEdge.sourceHandle);
      const tgtPos  = getHandlePos(tgtNode, nearestEdge.targetHandle);
      const horizontal = isWireHorizontal(srcPos, tgtPos);

      const SNAP = 10;
      const { w: jWidth, h: jHeight } = getNodeSize({ data: { componentType: 'junction' }, style: NODE_STYLES.junction });

      // Snap only the axis perpendicular to the wire so the junction stays on-line.
      const jx = horizontal
        ? Math.round(nearestPoint.x / SNAP) * SNAP
        : nearestPoint.x;
      const jy = horizontal
        ? nearestPoint.y
        : Math.round(nearestPoint.y / SNAP) * SNAP;

      const junctionId = `junction_auto_${Date.now()}`;
      const isGroundNode = startNode?.data?.componentType === 'ground';
      const WIRE_STYLE     = { stroke: WIRE_COLOR,        strokeWidth: 2 };
      const GND_WIRE_STYLE = { stroke: GROUND_WIRE_COLOR, strokeWidth: 2 };
      const WIRE_OPTS      = { pathOptions: { borderRadius: 0 } };

      const connectingHandle = startHandleId ?? 'left';
      const connectingAnchor = getHandlePos(startNode, connectingHandle);

      // Through handles follow the original wire axis; branch uses the perpendicular pair.
      const throughHandles = horizontal ? ['left', 'right'] : ['top', 'bottom'];
      const branchCandidates = horizontal ? ['top', 'bottom'] : ['left', 'right'];

      const junctionToSrcHandle = horizontal
        ? (srcPos.x < jx ? throughHandles[0] : throughHandles[1])
        : (srcPos.y < jy ? throughHandles[0] : throughHandles[1]);
      const junctionToTgtHandle = junctionToSrcHandle === throughHandles[0]
        ? throughHandles[1]
        : throughHandles[0];

      const connectingJunctionHandle = pickClosestHandle(
        branchCandidates,
        connectingAnchor,
        jx,
        jy,
        jWidth,
        jHeight
      );

      // Build explicit handle position map to prevent zigzags.
      // Through-handles (continuing the original wire) must align with wire orientation.
      // Branch handles use the perpendicular axis.
      const junctionHandlePositions = {};
      if (horizontal) {
        // Original wire is horizontal → through-handles are left/right
        junctionHandlePositions.left = Position.Left;
        junctionHandlePositions.right = Position.Right;
        junctionHandlePositions.top = Position.Top;
        junctionHandlePositions.bottom = Position.Bottom;
      } else {
        // Original wire is vertical → through-handles are top/bottom
        junctionHandlePositions.top = Position.Top;
        junctionHandlePositions.bottom = Position.Bottom;
        junctionHandlePositions.left = Position.Left;
        junctionHandlePositions.right = Position.Right;
      }

      setNodes(nds => [
        ...nds,
        {
          id:   junctionId,
          type: 'junctionNode',
          position: { x: jx - jWidth / 2, y: jy - jHeight / 2 },
          data: {
            label: '●',
            componentType: 'junction',
            componentId: junctionId,
            style: NODE_STYLES.junction,
            handlePositions: junctionHandlePositions,
          },
          style: NODE_STYLES.junction,
        },
      ]);

      setEdges(eds => {
        const filtered = eds.filter(e => e.id !== nearestEdge.id);
        const originalStyle = nearestEdge.style || WIRE_STYLE;
        const originalType = nearestEdge.type || 'smoothstep';

        return [
          ...filtered,
          {
            id:           `e_${nearestEdge.source}_${junctionId}_${Date.now()}`,
            source:       nearestEdge.source,
            sourceHandle: nearestEdge.sourceHandle,
            target:       junctionId,
            targetHandle: junctionToSrcHandle,
            type:         originalType,
            style:        originalStyle,
            ...WIRE_OPTS,
          },
          {
            id:           `e_${junctionId}_${nearestEdge.target}_${Date.now()}`,
            source:       junctionId,
            sourceHandle: junctionToTgtHandle,
            target:       nearestEdge.target,
            targetHandle: nearestEdge.targetHandle,
            type:         originalType,
            style:        originalStyle,
            ...WIRE_OPTS,
          },
          {
            id:           `e_${startNodeId}_${junctionId}_${Date.now()}`,
            source:       startNodeId,
            sourceHandle: connectingHandle,
            target:       junctionId,
            targetHandle: connectingJunctionHandle,
            type:         'smoothstep',
            style:        isGroundNode ? GND_WIRE_STYLE : WIRE_STYLE,
            ...WIRE_OPTS,
          },
        ];
      });

      window.connectionStart   = null;
      window.connectionHandled = false;
    },
    [nodes, edges, setNodes, setEdges]
  );

  // ── Drop from sidebar ─────────────────────────────────────────────────────
  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setShowInstructions(false);

      const instance = reactFlowRef.current;
      if (!instance) return;

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const value    = DEFAULT_VALUES[type] ?? 0;
      const nodeType = type === 'ground' ? 'groundNode' : type === 'junction' ? 'junctionNode' : 'componentNode';

      // Generate unique component ID using persistent counters (never reuse deleted numbers)
      let componentId;
      let prefix;
      
      // Helper to ensure ID is unique (in case of stale counter)
      const existingIds = new Set(nodes.map(n => n.data?.componentId).filter(Boolean));
      const getUniqueId = (basePrefix, counter) => {
        let num = counter;
        let candidate = `${basePrefix}${num}`;
        while (existingIds.has(candidate)) {
          num++;
          candidate = `${basePrefix}${num}`;
        }
        return { id: candidate, finalNum: num };
      };
      
      const componentConfig = {
        'dc_source': { prefix: 'V', counter: 'dc_source' },
        'current_source': { prefix: 'I', counter: 'current_source' },
        'resistor': { prefix: 'R', counter: 'resistor' },
        'capacitor': { prefix: 'C', counter: 'capacitor' },
        'inductor': { prefix: 'L', counter: 'inductor' },
        'ammeter': { prefix: 'AM', counter: 'ammeter' },
        'voltmeter': { prefix: 'VM', counter: 'voltmeter' },
        'switch': { prefix: 'SW', counter: 'switch' },
        'bulb': { prefix: 'L', counter: 'bulb' }
      };

      if (componentConfig[type]) {
        const { prefix, counter } = componentConfig[type];
        const nextNum = (componentCounters?.[counter] ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        setComponentCounters?.((prev) => ({ ...prev, [counter]: finalNum }));
      } else if (type === 'ground') {
        componentId = '⏚';
      } else if (type === 'junction') {
        componentId = '●';
      } else {
        componentId = `${type}_${Date.now()}`;
      }

      const newNode = {
        id: `${type}_${Date.now()}`,
        type: nodeType,
        position,
        data: {
          label: componentId,  // Display the component ID as label
          componentType: type,
          componentId: componentId,  // Store for circuit conversion
          value,
          // nominalValue is the default/design value — locked at component creation
          // and never changed again, even when the user edits the current value.
          // This gives the ML model a stable reference to compare against.
          nominalValue: value,
          state: type === 'switch' ? 'open' : undefined,  // Initial switch state
          rotation: 0,
          onEditValue:   handleEditValue,
          onChangeDraft: handleChangeDraft,
          onSaveDraft:   handleSaveDraft,
          onCancelDraft: handleCancelDraft,
          onResetDesignValue: handleResetDesignValue,
          onToggleSwitch: handleToggleSwitch,
        },
        style: getNodeStyle(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft, handleResetDesignValue, handleToggleSwitch, setNodes, nodes, componentCounters, setComponentCounters]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // ── Delete / Backspace ───────────────────────────────────────────────
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Collect IDs of nodes being deleted (before state update)
        const deletedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
        
        // Remove selected nodes
        setNodes((nds) => nds.filter((n) => !n.selected));
        
        // Remove selected edges AND any edges connected to deleted nodes
        setEdges((eds) => eds.filter((e) => {
          // Remove if edge is selected
          if (e.selected) return false;
          // Remove if edge connects to a deleted node
          if (deletedNodeIds.has(e.source) || deletedNodeIds.has(e.target)) return false;
          return true;
        }));
        return;
      }

      // ── Ctrl+R: rotate selected components 90° clockwise ────────────────
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();

        setNodes((nds) =>
          nds.map((n) => {
            if (!n.selected) return n;
            const ctype = n.data?.componentType;
            if (!ctype || ctype === 'junction' || ctype === 'ground') return n;
            
            const oldRot = n.data?.rotation ?? 0;
            const newRot = (oldRot + 90) % 360;
            
            return { ...n, data: { ...n.data, rotation: newRot } };
          })
        );

        return;
      }
    },
    [setNodes, setEdges, nodes]
  );

  // ── nodeTypes (stable reference — recreated only when mode changes) ───────
  const nodeTypes = useMemo(
    () => ({
      componentNode: (props) => <ComponentNode {...props} mode={mode} />,
      junctionNode:  JunctionNode,
      groundNode:    GroundNode,
    }),
    [mode]
  );

  // ── Sync canvas state up to App.jsx ──────────────────────────────────────
  useEffect(() => {
    if (setCircuit) setCircuit({ nodes, edges });
  }, [nodes, edges, setCircuit]);

  // ── Read-only mode: mirror the passed-in circuit (results page canvas) ────
  useEffect(() => {
    if (isReadOnly && Array.isArray(circuit?.nodes) && Array.isArray(circuit?.edges)) {
      setNodes(circuit.nodes);
      setEdges(circuit.edges);
    }
  }, [isReadOnly, circuit, setNodes, setEdges]);

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {showInstructions && !isReadOnly && (
        <div className="canvas-instructions">
          💡 <strong>Quick start:</strong>{' '}
          Draw wires between component pins |
          Drop a wire <strong>onto any existing wire</strong> to auto-junction |
          <kbd>Del</kbd> to delete | <kbd>Ctrl+R</kbd> to rotate
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={(instance) => { reactFlowRef.current = instance; }}
        nodeTypes={nodeTypes}
        connectionMode="loose"
        snapToGrid={true}
        snapGrid={[10, 10]}
        fitView
        deleteKeyCode={null}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
        defaultEdgeOptions={{
          type: 'smoothstep',
          pathOptions: { borderRadius: 0 },
        }}
      >
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.data?.componentType === 'dc_source') return '#2563eb';
            if (node.data?.componentType === 'current_source') return '#7c3aed';
            if (node.data?.componentType === 'ground') return '#4b5563';
            if (node.data?.componentType === 'junction') return '#1a1a1a';
            if (node.data?.componentType === 'ammeter')  return '#c0392b';
            if (node.data?.componentType === 'voltmeter') return '#1a6ab5';
            return '#059669';
          }}
          maskColor="rgba(240,240,232,0.7)"
        />
        <Background variant="lines" gap={20} size={1} color="#d0cfc6" />
      </ReactFlow>
    </div>
  );
}

export default CircuitCanvas;