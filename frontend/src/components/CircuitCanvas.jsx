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
    <svg className="component-svg" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="25" x2="25" y2="25" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="50" cy="25" r="15" stroke="currentColor" strokeWidth="2.5" fill="none"/>
      <line x1="75" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M 50 15 L 50 35 M 45 30 L 50 35 L 55 30" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="miter"/>
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
};

const NODE_STYLES = {
  base: {
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: 'monospace',
    border: '1.5px solid #555',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '80px',
    minHeight: '52px',
    background: '#f0f0e8',   // LTSpice yellowish off-white
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
  return formatValue(value, type);
}

function getNodeStyle(type) {
  if (type === 'junction') return NODE_STYLES.junction;
  if (type === 'ground')   return NODE_STYLES.ground;
  if (type === 'dc_source') return { ...NODE_STYLES.base, minWidth: '90px' };
  if (type === 'current_source') return { ...NODE_STYLES.base, minWidth: '90px' };
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
function NodeTerminals({ rotation = 0 }) {
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

  if (mode === 'results') {
    return (
      <div className="circuit-node circuit-node-component" style={data.style}>
        <NodeTerminals rotation={rotation} />
        <div className="circuit-node-content component-content">
          <div
            className="component-visual-container"
            style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }}
          >
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
    <div className="circuit-node circuit-node-component" style={data.style}>
      <NodeTerminals rotation={rotation} />
      <div className="circuit-node-content component-content">
        {/* Component reference label (R1, C2, V1 …) — outside the rotating box */}
        <div className="component-ref-label">{label}</div>
        {/* SVG symbol rotates independently; node bounding box stays fixed */}
        <div
          className="component-visual-container"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease',
          }}
        >
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
          <button
            type="button"
            className="value-button"
            onClick={(e) => {
              e.stopPropagation();
              data.onEditValue?.(id);
            }}
          >
            {formatNodeValue(componentType, value)}
          </button>
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
        <line x1="20" y1="0"  x2="20" y2="10" stroke="#1a1a1a" strokeWidth="2"/>
        {/* Three horizontal bars — wide, medium, narrow */}
        <line x1="4"  y1="10" x2="36" y2="10" stroke="#1a1a1a" strokeWidth="2.5"/>
        <line x1="10" y1="18" x2="30" y2="18" stroke="#1a1a1a" strokeWidth="2.5"/>
        <line x1="16" y1="26" x2="24" y2="26" stroke="#1a1a1a" strokeWidth="2.5"/>
      </svg>
    </div>
  );
}

// ── Main canvas component ─────────────────────────────────────────────────────
function CircuitCanvas({ setCircuit, mode = 'edit', circuit }) {
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

  // ── Wire connection ───────────────────────────────────────────────────────
  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',          // orthogonal elbow routing, LTSpice-style
            animated: false,
            style: { stroke: '#1a1a1a', strokeWidth: 2 },
            pathOptions: { borderRadius: 0 },  // sharp 90° elbows
          },
          eds
        )
      ),
    [setEdges]
  );

  // ── Handle ground connecting to edges (wires) ────────────────────────────
  const onConnectStart = useCallback((event, { nodeId, handleId }) => {
    window.connectionStart = { nodeId, handleId };
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      const instance = reactFlowRef.current;
      if (!instance || !window.connectionStart) return;

      const { nodeId: startNodeId } = window.connectionStart;
      const startNode = nodes.find(n => n.id === startNodeId);

      // Only handle this for ground nodes that were NOT connected to a handle
      // (ReactFlow fires onConnect for handle-to-handle; onConnectEnd fires for
      //  drops onto empty canvas / wires — we only want the latter.)
      if (startNode?.data?.componentType !== 'ground') {
        window.connectionStart = null;
        return;
      }

      const { clientX, clientY } = event;
      const position = instance.screenToFlowPosition({ x: clientX, y: clientY });

      // ── Compute accurate handle positions using ReactFlow's internal node
      // dimensions (populated after first render) ───────────────────────────
      const getHandlePos = (node, handleId) => {
        // Use internals if available (ReactFlow ≥ 11 populates positionAbsolute + width/height)
        const nx = (node.positionAbsolute?.x ?? node.position.x);
        const ny = (node.positionAbsolute?.y ?? node.position.y);
        const w  = node.width  ?? (node.data?.componentType === 'junction' ? 8 : 80);
        const h  = node.height ?? (node.data?.componentType === 'ground'   ? 60 : 50);

        switch (handleId) {
          case 'left':   return { x: nx,         y: ny + h / 2 };
          case 'right':  return { x: nx + w,      y: ny + h / 2 };
          case 'top':    return { x: nx + w / 2,  y: ny         };
          case 'bottom': return { x: nx + w / 2,  y: ny + h     };
          default:       return { x: nx + w / 2,  y: ny + h / 2 };
        }
      };

      // Find the nearest wire (edge) to the drop point
      const threshold = 60;
      let nearestEdge = null;
      let minDistance = Infinity;
      let nearestPoint = null;

      edges.forEach(edge => {
        const srcNode = nodes.find(n => n.id === edge.source);
        const tgtNode = nodes.find(n => n.id === edge.target);
        if (!srcNode || !tgtNode) return;

        const srcPos = getHandlePos(srcNode, edge.sourceHandle);
        const tgtPos = getHandlePos(tgtNode, edge.targetHandle);

        // Closest point on segment
        const dx = tgtPos.x - srcPos.x;
        const dy = tgtPos.y - srcPos.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((position.x - srcPos.x) * dx + (position.y - srcPos.y) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = srcPos.x + t * dx;
        const cy = srcPos.y + t * dy;
        const dist = Math.hypot(position.x - cx, position.y - cy);

        if (dist < threshold && dist < minDistance) {
          minDistance = dist;
          nearestEdge = edge;
          nearestPoint = { x: cx, y: cy };
        }
      });

      if (nearestEdge) {
        // Snap junction to grid (20px)
        const snap = 20;
        const snappedX = Math.round(nearestPoint.x / snap) * snap;
        const snappedY = Math.round(nearestPoint.y / snap) * snap;

        const junctionId = `junction_auto_${Date.now()}`;
        const WIRE_STYLE = { stroke: '#1a1a1a', strokeWidth: 2 };

        setNodes((nds) => [
          ...nds,
          {
            id: junctionId,
            type: 'junctionNode',
            position: { x: snappedX - 4, y: snappedY - 4 },
            data: { label: '●', componentType: 'junction', componentId: junctionId },
            style: NODE_STYLES.junction,
          },
        ]);

        setEdges((eds) => {
          const filtered = eds.filter(e => e.id !== nearestEdge.id);
          return [
            ...filtered,
            // wire: original source → junction  (keep original sourceHandle)
            {
              id: `e_${nearestEdge.source}_${junctionId}`,
              source: nearestEdge.source,
              sourceHandle: nearestEdge.sourceHandle,
              target: junctionId,
              targetHandle: 'left',   // junctions accept any handle; use left
              type: 'smoothstep',
              style: WIRE_STYLE,
              pathOptions: { borderRadius: 0 },
            },
            // wire: junction → original target  (keep original targetHandle)
            {
              id: `e_${junctionId}_${nearestEdge.target}`,
              source: junctionId,
              sourceHandle: 'right',  // symmetrical exit
              target: nearestEdge.target,
              targetHandle: nearestEdge.targetHandle,
              type: 'smoothstep',
              style: WIRE_STYLE,
              pathOptions: { borderRadius: 0 },
            },
            // wire: ground → junction
            {
              id: `e_${startNodeId}_${junctionId}`,
              source: startNodeId,
              sourceHandle: 'top',
              target: junctionId,
              targetHandle: 'bottom',
              type: 'smoothstep',
              style: WIRE_STYLE,
              pathOptions: { borderRadius: 0 },
            },
          ];
        });
      }

      window.connectionStart = null;
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

      // Generate unique component ID based on type and count
      let componentId;
      if (type === 'dc_source') {
        const vCount = nodes.filter(n => n.data?.componentType === 'dc_source').length;
        componentId = `V${vCount + 1}`;
      } else if (type === 'current_source') {
        const iCount = nodes.filter(n => n.data?.componentType === 'current_source').length;
        componentId = `I${iCount + 1}`;
      } else if (type === 'resistor') {
        const rCount = nodes.filter(n => n.data?.componentType === 'resistor').length;
        componentId = `R${rCount + 1}`;
      } else if (type === 'capacitor') {
        const cCount = nodes.filter(n => n.data?.componentType === 'capacitor').length;
        componentId = `C${cCount + 1}`;
      } else if (type === 'inductor') {
        const lCount = nodes.filter(n => n.data?.componentType === 'inductor').length;
        componentId = `L${lCount + 1}`;
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
    [handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft, setNodes, nodes]
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
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((e) => !e.selected));
        return;
      }

      // ── Ctrl+R: rotate selected components 90° clockwise ────────────────
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();

        // Handle IDs on ComponentNode are ALWAYS "left" and "right" — they never
        // change. Only the Handle's `position` prop changes (via ROTATION_TO_POSITIONS)
        // so that the handle physically moves to a different edge of the node box.
        // Edges reference handles by ID, so we must NOT remap IDs here.
        // Just update the rotation value in node data; NodeTerminals re-renders
        // the handles at the correct position automatically.
        setNodes((nds) =>
          nds.map((n) => {
            if (!n.selected) return n;
            const ctype = n.data?.componentType;
            if (!ctype || ctype === 'junction' || ctype === 'ground') return n;
            const nextRot = ((n.data?.rotation ?? 0) + 90) % 360;
            return { ...n, data: { ...n.data, rotation: nextRot } };
          })
        );

        return;
      }
    },
    [setNodes, setEdges]
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
          Wire components together |
          Connect <strong>Ground (⏚)</strong> directly to any wire (auto-creates junction) |
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
          style: { stroke: '#1a1a1a', strokeWidth: 2 },
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
