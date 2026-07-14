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
};

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_VALUES = {
  dc_source: 5.0,
  resistor: 1000,
  capacitor: 1e-7,
  inductor: 1e-6,
  ground: 0,
};

const NODE_STYLES = {
  base: {
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '600',
    border: '1.5px solid #d1d5db',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '70px',
    minHeight: '50px',
    background: '#ffffff',
    color: '#374151',
  },
  junction: {
    padding: '6px',
    borderRadius: '50%',
    width: '12px',
    height: '12px',
    background: '#1f2937',
    border: '2px solid #1f2937',
    color: 'transparent',
  },
  ground: {
    background: '#f3f4f6',
    borderColor: '#6b7280',
    minWidth: '50px',
    minHeight: '50px',
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
  return value;
}

function formatNodeValue(type, value) {
  return type === 'dc_source' ? `${value}V` : formatValue(value, type);
}

function getNodeStyle(type) {
  if (type === 'junction') return NODE_STYLES.junction;
  if (type === 'ground')   return { ...NODE_STYLES.base, ...NODE_STYLES.ground };
  if (type === 'dc_source') return { ...NODE_STYLES.base, minWidth: '80px' };
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
          <div className="component-visual-container" />
        </div>
      </div>
    );
  }

  const { isEditing, valueDraft, valueError, componentType, value } = data;

  return (
    <div className="circuit-node circuit-node-component" style={data.style}>
      <NodeTerminals rotation={rotation} />
      <div className="circuit-node-content component-content">
        {/* Bug 3: rotate the SVG around its own centre. The wrapper div is
            the bounding box that ReactFlow measures; we rotate only the
            visual content inside it so the node's hit-area doesn't shift. */}
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
      <div className="junction-dot">{data.label}</div>
    </div>
  );
}

function GroundNode({ data }) {
  return (
    <div className="circuit-node circuit-node-ground" style={data.style}>
      <div className="ground-symbol">{data.label}</div>
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
          { ...params, type: 'straight', animated: false, style: { stroke: '#1f2937', strokeWidth: 2 } },
          eds
        )
      ),
    [setEdges]
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

      const newNode = {
        id: `${type}_${Date.now()}`,
        type: nodeType,
        position,
        data: {
          label: type === 'ground' ? '⏚' : type === 'junction' ? '●' : formatNodeValue(type, value),
          componentType: type,
          value,
          rotation: 0,           // Bug 3: every new node starts at 0°
          onEditValue:   handleEditValue,
          onChangeDraft: handleChangeDraft,
          onSaveDraft:   handleSaveDraft,
          onCancelDraft: handleCancelDraft,
        },
        style: getNodeStyle(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft, setNodes]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Keyboard handler ──────────────────────────────────────────────────────
  const onKeyDown = useCallback(
    (event) => {
      // ── Bug 2 fix: ignore all key handling when the user is typing in an
      // input or textarea (e.g. the inline value editor).  This prevents
      // Backspace/Delete from deleting nodes while editing a value.
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // ── Delete / Backspace: remove selected nodes and edges ───────────────
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((e) => !e.selected));
        return;
      }

      // ── Ctrl+R: rotate selected component 90° clockwise ──────────────────
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        // Prevent the browser's "reload page" shortcut
        event.preventDefault();

        setNodes((nds) =>
          nds.map((n) => {
            // Only rotate selected component nodes (not junctions or ground)
            if (!n.selected) return n;
            const ctype = n.data?.componentType;
            if (!ctype || ctype === 'junction' || ctype === 'ground') return n;

            const currentRotation = n.data?.rotation ?? 0;
            const nextRotation    = (currentRotation + 90) % 360;

            return {
              ...n,
              data: { ...n.data, rotation: nextRotation },
            };
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
          💡 <strong>Build circuits:</strong>{' '}
          Wire components from any terminal |
          Use <strong>Junctions (●)</strong> for splits |
          Place <strong>Ground (⏚)</strong> anywhere |
          <kbd>Del</kbd> to remove | <kbd>Ctrl+R</kbd> to rotate
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={(instance) => { reactFlowRef.current = instance; }}
        nodeTypes={nodeTypes}
        connectionMode="loose"
        fitView
        // Bug 2 fix: remove ReactFlow's built-in deleteKeyCode so it can't
        // independently fire node-deletion while an input is focused.
        // Our onKeyDown handler (which checks activeElement) takes over instead.
        deleteKeyCode={null}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
      >
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.data?.componentType === 'dc_source') return '#3b82f6';
            if (node.data?.componentType === 'ground')    return '#6b7280';
            return '#10b981';
          }}
        />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export default CircuitCanvas;
