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
};

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
    border: '1.5px solid #c0392b',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: '#fff5f5',
    color: '#c0392b',
  },
  // Voltmeter: blue accent border — parallel device
  voltmeter: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: '1.5px solid #1a6ab5',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: '#f0f4ff',
    color: '#1a6ab5',
  },
};

// ── Rotation helpers ──────────────────────────────────────────────────────────
// Given a component's rotation (0 / 90 / 180 / 270), return the ReactFlow
// Position for its two logical handles (left-pin and right-pin).
// At 0°:   left=Left,  right=Right
// At 90°:  left=Top,   right=Bottom    (rotated clockwise)
// At 180°: left=Right, right=Left
// At 270°: left=Bottom,right=Top
const ROTATION_TO_POSITIONS = {
    0: { left: Position.Left,   right: Position.Right },
   90: { left: Position.Top,    right: Position.Bottom },
  180: { left: Position.Right,  right: Position.Left },
  270: { left: Position.Bottom, right: Position.Top },
};

function getHandlePositions(rotation = 0) {
  return ROTATION_TO_POSITIONS[((rotation % 360) + 360) % 360] ?? ROTATION_TO_POSITIONS[0];
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
  return value;
}

function formatNodeValue(type, value) {
  if (type === 'dc_source') return `${value}V`;
  if (type === 'current_source') return formatValue(value, type);
  if (type === 'ammeter')   return '— A —';
  if (type === 'voltmeter') return '— V —';
  return formatValue(value, type);
}

function getNodeStyle(type) {
  if (type === 'junction')      return NODE_STYLES.junction;
  if (type === 'ground')        return NODE_STYLES.ground;
  if (type === 'ammeter')       return NODE_STYLES.ammeter;
  if (type === 'voltmeter')     return NODE_STYLES.voltmeter;
  if (type === 'dc_source')     return { ...NODE_STYLES.base, minWidth: '90px' };
  if (type === 'current_source') return { ...NODE_STYLES.base, minWidth: '60px', minHeight: '90px' };
  return NODE_STYLES.base;
}

// ── ValueEditor ───────────────────────────────────────────────────────────────
// Bug 2 fix: onKeyDown stops propagation so Backspace/Delete keystrokes inside
// this input never bubble up to the canvas-level delete handler.
function ValueEditor({ valueDraft, error, onChange, onSave, onCancel }) {
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
          // Always stop propagation so the canvas delete handler never fires
          // while this input is focused — regardless of which key is pressed.
          e.stopPropagation();
          if (e.key === 'Enter')  onSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="value-editor-actions">
        <button type="button" className="value-editor-btn" onClick={onSave}>✓</button>
        <button type="button" className="value-editor-btn" onClick={onCancel}>✕</button>
      </div>
      {error && <div className="value-editor-error">{error}</div>}
    </div>
  );
}

// ── NodeTerminals ─────────────────────────────────────────────────────────────
// Rotation-aware handles: positions shift with the component's rotation so wires
// always stay attached to the correct side after a Ctrl+R rotate.
// Current source uses top/bottom by default (vertical orientation).
function NodeTerminals({ rotation = 0, componentType }) {
  // Current source has vertical orientation (top/bottom handles)
  if (componentType === 'current_source') {
    // For current source: "left" handle is at top, "right" handle is at bottom
    // Rotation still applies the same mapping, but starting from vertical
    const CURRENT_SOURCE_POSITIONS = {
        0: { left: Position.Top,    right: Position.Bottom },
       90: { left: Position.Right,  right: Position.Left },
      180: { left: Position.Bottom, right: Position.Top },
      270: { left: Position.Left,   right: Position.Right },
    };
    const positions = CURRENT_SOURCE_POSITIONS[((rotation % 360) + 360) % 360] ?? CURRENT_SOURCE_POSITIONS[0];
    return (
      <>
        <Handle type="source" position={positions.left}  id="left"  className="circuit-handle" />
        <Handle type="source" position={positions.right} id="right" className="circuit-handle" />
      </>
    );
  }
  
  // All other components use horizontal orientation (left/right handles)
  const { left, right } = getHandlePositions(rotation);
  return (
    <>
      <Handle type="source" position={left}  id="left"  className="circuit-handle" />
      <Handle type="source" position={right} id="right" className="circuit-handle" />
    </>
  );
}

// ── ComponentNode ─────────────────────────────────────────────────────────────
function ComponentNode({ id, data, mode }) {
  const rotation = data.rotation ?? 0;
  
  // Determine if the component is in a vertical orientation
  // - Current source: vertical at 0°/180°, horizontal at 90°/270°
  // - Other components: horizontal at 0°/180°, vertical at 90°/270°
  const isVertical = data.componentType === 'current_source'
    ? (rotation === 0 || rotation === 180)
    : (rotation === 90 || rotation === 270);
  
  // Compute the outer box style with swapped dimensions
  const nodeStyle = {
    ...data.style,
    width: isVertical ? (data.style?.minHeight || '52px') : (data.style?.minWidth || '80px'),
    height: isVertical ? (data.style?.minWidth || '80px') : (data.style?.minHeight || '52px'),
    minWidth: undefined,  // clear minWidth/minHeight to use explicit width/height
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
        <NodeTerminals rotation={rotation} componentType={data.componentType} />
        <div className="circuit-node-content component-content">
          <div className="component-visual-container" style={visualContainerStyle}>
            <div className="component-svg-fallback visible">
              {COMPONENT_SVGS[data.componentType]}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { isEditing, valueDraft, valueError, componentType, value, label } = data;

  return (
    <div className="circuit-node circuit-node-component" style={nodeStyle}>
      <NodeTerminals rotation={rotation} componentType={componentType} />
      <div className="circuit-node-content component-content">
        {/* Component reference label (R1, C2, V1 …) — stacking context ensures visibility */}
        <div className="component-ref-label" style={labelStyle}>{label}</div>
        {/* SVG symbol rotates; container becomes portrait box at 90°/270° */}
        <div className="component-visual-container" style={visualContainerStyle}>
          <div className="component-svg-fallback visible">
            {COMPONENT_SVGS[componentType]}
          </div>
        </div>
        {isEditing ? (
          <ValueEditor
            valueDraft={valueDraft}
            error={valueError}
            onChange={(e) => data.onChangeDraft?.(id, e.target.value)}
            onSave={() => data.onSaveDraft?.(id)}
            onCancel={() => data.onCancelDraft?.(id)}
          />
        ) : (
          // Meters have no user-editable value — show a read-only placeholder
          componentType === 'ammeter' || componentType === 'voltmeter' ? (
            <span className="meter-placeholder">
              {componentType === 'ammeter' ? 'series' : 'parallel'}
            </span>
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
            {formatNodeValue(componentType, value)}
          </button>
          )
        )}
      </div>
    </div>
  );
}

// ── JunctionNode / GroundNode ─────────────────────────────────────────────────
function JunctionNode({ data }) {
  return (
    <div className="circuit-node circuit-node-junction" style={data.style}>
      <Handle type="source" position={Position.Left}   id="left"   className="circuit-handle" />
      <Handle type="source" position={Position.Right}  id="right"  className="circuit-handle" />
      <Handle type="source" position={Position.Top}    id="top"    className="circuit-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="circuit-handle" />
      <div className="junction-dot" />
    </div>
  );
}

// ── GroundNode ─────────────────────────────────────────────────────────────
function GroundNode({ data }) {
  return (
    <div className="circuit-node circuit-node-ground" style={data.style}>
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

      // ── Compute the pixel position of a node's handle ─────────────────────
      const getHandlePos = (node, handleId) => {
        const nx = node.positionAbsolute?.x ?? node.position.x;
        const ny = node.positionAbsolute?.y ?? node.position.y;
        const w  = node.width  ?? (node.data?.componentType === 'junction' ? 8 : 80);
        const h  = node.height ?? (node.data?.componentType === 'ground'   ? 60 : 50);
        switch (handleId) {
          case 'left':   return { x: nx,        y: ny + h / 2 };
          case 'right':  return { x: nx + w,     y: ny + h / 2 };
          case 'top':    return { x: nx + w / 2, y: ny         };
          case 'bottom': return { x: nx + w / 2, y: ny + h     };
          default:       return { x: nx + w / 2, y: ny + h / 2 };
        }
      };

      // ── Find the nearest wire to the drop point ───────────────────────────
      // Threshold is generous (80 px) so users don't have to click precisely.
      const THRESHOLD = 80;
      let nearestEdge  = null;
      let minDistance  = Infinity;
      let nearestPoint = null;

      edges.forEach(edge => {
        // Don't try to split an edge that belongs to the node being connected
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

      // ── Snap junction to grid ─────────────────────────────────────────────
      const SNAP = 10;
      const jx = Math.round(nearestPoint.x / SNAP) * SNAP;
      const jy = Math.round(nearestPoint.y / SNAP) * SNAP;

      const junctionId = `junction_auto_${Date.now()}`;
      const isGroundNode = startNode?.data?.componentType === 'ground';
      const WIRE_STYLE       = { stroke: WIRE_COLOR,        strokeWidth: 2 };
      const GND_WIRE_STYLE   = { stroke: GROUND_WIRE_COLOR, strokeWidth: 2 };
      const WIRE_OPTS  = { pathOptions: { borderRadius: 0 } };

      // Determine which handle on the connecting component faces the junction.
      // startHandleId is the handle that was being dragged from.
      const connectingHandle = startHandleId ?? 'left';

      setNodes(nds => [
        ...nds,
        {
          id:   junctionId,
          type: 'junctionNode',
          position: { x: jx - 5, y: jy - 5 },
          data: { label: '●', componentType: 'junction', componentId: junctionId },
          style: NODE_STYLES.junction,
        },
      ]);

      setEdges(eds => {
        const filtered = eds.filter(e => e.id !== nearestEdge.id);
        return [
          ...filtered,
          // Segment 1: original source → junction
          {
            id:           `e_${nearestEdge.source}_${junctionId}_${Date.now()}`,
            source:       nearestEdge.source,
            sourceHandle: nearestEdge.sourceHandle,
            target:       junctionId,
            targetHandle: 'left',
            type:         'smoothstep',
            style:        WIRE_STYLE,
            ...WIRE_OPTS,
          },
          // Segment 2: junction → original target
          {
            id:           `e_${junctionId}_${nearestEdge.target}_${Date.now()}`,
            source:       junctionId,
            sourceHandle: 'right',
            target:       nearestEdge.target,
            targetHandle: nearestEdge.targetHandle,
            type:         'smoothstep',
            style:        WIRE_STYLE,
            ...WIRE_OPTS,
          },
          // New wire: connecting component → junction
          {
            id:           `e_${startNodeId}_${junctionId}_${Date.now()}`,
            source:       startNodeId,
            sourceHandle: connectingHandle,
            target:       junctionId,
            targetHandle: 'bottom',
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
      
      if (type === 'dc_source') {
        prefix = 'V';
        const nextNum = (componentCounters?.dc_source ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating dc_source: counter was ${componentCounters?.dc_source}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, dc_source: finalNum }));
      } else if (type === 'current_source') {
        prefix = 'I';
        const nextNum = (componentCounters?.current_source ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating current_source: counter was ${componentCounters?.current_source}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, current_source: finalNum }));
      } else if (type === 'resistor') {
        prefix = 'R';
        const nextNum = (componentCounters?.resistor ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating resistor: counter was ${componentCounters?.resistor}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, resistor: finalNum }));
      } else if (type === 'capacitor') {
        prefix = 'C';
        const nextNum = (componentCounters?.capacitor ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating capacitor: counter was ${componentCounters?.capacitor}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, capacitor: finalNum }));
      } else if (type === 'inductor') {
        prefix = 'L';
        const nextNum = (componentCounters?.inductor ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating inductor: counter was ${componentCounters?.inductor}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, inductor: finalNum }));
      } else if (type === 'ammeter') {
        prefix = 'AM';
        const nextNum = (componentCounters?.ammeter ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating ammeter: counter was ${componentCounters?.ammeter}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, ammeter: finalNum }));
      } else if (type === 'voltmeter') {
        prefix = 'VM';
        const nextNum = (componentCounters?.voltmeter ?? 0) + 1;
        const { id, finalNum } = getUniqueId(prefix, nextNum);
        componentId = id;
        console.log(`🔢 Creating voltmeter: counter was ${componentCounters?.voltmeter}, now ${finalNum}, ID: ${componentId}`);
        setComponentCounters?.((prev) => ({ ...prev, voltmeter: finalNum }));
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
          rotation: 0,
          onEditValue:   handleEditValue,
          onChangeDraft: handleChangeDraft,
          onSaveDraft:   handleSaveDraft,
          onCancelDraft: handleCancelDraft,
        },
        style: getNodeStyle(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft, setNodes, nodes, componentCounters, setComponentCounters]
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
