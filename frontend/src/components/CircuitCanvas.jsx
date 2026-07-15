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
    padding: '0',
    borderRadius: '50%',
    width: '8px',
    height: '8px',
    background: '#1f2937',
    border: 'none',
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

// ── GroundNode ─────────────────────────────────────────────────────────────
function GroundNode({ data }) {
  return (
    <div className="circuit-node circuit-node-ground" style={data.style}>
      {/* Ground has only ONE handle at the bottom - connects to any wire */}
      <Handle type="source" position={Position.Top} id="top" className="circuit-handle" />
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
          { 
            ...params, 
            type: 'straight', // Use straight lines like LTspice for clean circuits
            animated: false, 
            style: { stroke: '#1f2937', strokeWidth: 2 },
          },
          eds
        )
      ),
    [setEdges]
  );

  // ── Handle ground connecting to edges (wires) ────────────────────────────
  const onConnectStart = useCallback((event, { nodeId, handleId }) => {
    // Store the connection start info
    console.log('🔗 Connection started from:', nodeId, handleId);
    window.connectionStart = { nodeId, handleId };
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      console.log('🔗 Connection ended', { hasStart: !!window.connectionStart });
      
      const instance = reactFlowRef.current;
      if (!instance || !window.connectionStart) return;

      const { nodeId: startNodeId } = window.connectionStart;
      const startNode = nodes.find(n => n.id === startNodeId);
      
      console.log('🔗 Start node:', startNode?.data?.componentType);
      
      // Only handle this for ground nodes
      if (startNode?.data?.componentType !== 'ground') {
        window.connectionStart = null;
        return;
      }

      console.log('⏚ Ground connection detected!');

      // Get the position where the user released the connection
      const { clientX, clientY } = event;
      const position = instance.screenToFlowPosition({ x: clientX, y: clientY });
      
      console.log('📍 Release position:', position);

      // Check if we're near an edge (wire) - calculate distance to line segment
      const threshold = 80;
      let nearestEdge = null;
      let minDistance = Infinity;
      let nearestPoint = null;

      edges.forEach(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        if (!sourceNode || !targetNode) return;

        // Get actual node dimensions and handle positions
        // Components are roughly 70-80px wide, 50px tall
        // Handles are at left/right edges
        const getHandlePosition = (node, handleId) => {
          const baseX = node.position.x;
          const baseY = node.position.y;
          
          // Estimate based on handle ID
          if (handleId === 'left') return { x: baseX, y: baseY + 25 };
          if (handleId === 'right') return { x: baseX + 70, y: baseY + 25 };
          if (handleId === 'top') return { x: baseX + 35, y: baseY };
          if (handleId === 'bottom') return { x: baseX + 35, y: baseY + 50 };
          
          // Default: center of node
          return { x: baseX + 35, y: baseY + 25 };
        };

        const sourcePos = getHandlePosition(sourceNode, edge.sourceHandle);
        const targetPos = getHandlePosition(targetNode, edge.targetHandle);
        
        // Calculate closest point on line segment
        const x1 = sourcePos.x;
        const y1 = sourcePos.y;
        const x2 = targetPos.x;
        const y2 = targetPos.y;
        
        const A = position.x - x1;
        const B = position.y - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
          param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
          xx = x1;
          yy = y1;
        } else if (param > 1) {
          xx = x2;
          yy = y2;
        } else {
          xx = x1 + param * C;
          yy = y1 + param * D;
        }
        
        const dx = position.x - xx;
        const dy = position.y - yy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        console.log(`  Edge ${edge.source.slice(-6)}->${edge.target.slice(-6)}: distance = ${dist.toFixed(1)}px`);

        if (dist < threshold && dist < minDistance) {
          minDistance = dist;
          nearestEdge = edge;
          nearestPoint = { x: xx, y: yy };
        }
      });

      console.log('🎯 Nearest edge:', nearestEdge?.id, 'distance:', minDistance.toFixed(1));

      // If we found a nearby edge, insert a junction ON the line to preserve wire shape
      if (nearestEdge) {
        console.log('✅ Creating junction on edge:', nearestEdge.id);
        
        // Place junction at the nearest point ON the wire line (not at release position)
        // This ensures the wire path stays straight through the junction
        const junctionId = `junction_auto_${Date.now()}`;
        const junctionNode = {
          id: junctionId,
          type: 'junctionNode',
          position: {
            x: nearestPoint.x - 4, // Use calculated nearest point on the line
            y: nearestPoint.y - 4,
          },
          data: {
            label: '●',
            componentType: 'junction',
            componentId: junctionId,
          },
          style: NODE_STYLES.junction,
        };

        // Batch both updates together
        setNodes((nds) => [...nds, junctionNode]);
        
        setEdges((eds) => {
          // Remove the original edge
          const filtered = eds.filter(e => e.id !== nearestEdge.id);
          
          // Add three new edges with EXACT same handles as original
          return [
            ...filtered,
            // Split 1: preserve exact path source -> junction
            {
              id: `${nearestEdge.source}-${junctionId}`,
              source: nearestEdge.source,
              sourceHandle: nearestEdge.sourceHandle, // Same as original
              target: junctionId,
              targetHandle: nearestEdge.sourceHandle, // Match original direction
              type: 'straight',
              style: nearestEdge.style || { stroke: '#1f2937', strokeWidth: 2 },
            },
            // Split 2: preserve exact path junction -> target  
            {
              id: `${junctionId}-${nearestEdge.target}`,
              source: junctionId,
              sourceHandle: nearestEdge.targetHandle, // Match original direction
              target: nearestEdge.target,
              targetHandle: nearestEdge.targetHandle, // Same as original
              type: 'straight',
              style: nearestEdge.style || { stroke: '#1f2937', strokeWidth: 2 },
            },
            // Ground connection
            {
              id: `${startNodeId}-${junctionId}`,
              source: startNodeId,
              sourceHandle: 'top',
              target: junctionId,
              type: 'smoothstep',
              style: { stroke: '#1f2937', strokeWidth: 2 },
              pathOptions: { borderRadius: 8 },
            },
          ];
        });
        
        console.log('✨ Junction created at', nearestPoint);
      } else {
        console.log('❌ No edge found near release point');
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

  // Helper function to rotate handle IDs 90° clockwise
  const rotateHandle = useCallback((handle) => {
    const rotationMap = {
      'left': 'top',
      'top': 'right',
      'right': 'bottom',
      'bottom': 'left',
    };
    return rotationMap[handle] || handle;
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
        event.preventDefault();

        // Track which nodes are being rotated
        const rotatedNodeIds = new Set();
        
        setNodes((nds) =>
          nds.map((n) => {
            if (!n.selected) return n;
            const ctype = n.data?.componentType;
            if (!ctype || ctype === 'junction' || ctype === 'ground') return n;

            rotatedNodeIds.add(n.id);
            const currentRotation = n.data?.rotation ?? 0;
            const nextRotation = (currentRotation + 90) % 360;

            return {
              ...n,
              data: { ...n.data, rotation: nextRotation },
            };
          })
        );

        // Remap edges connected to rotated components to use the correct physical handles
        setTimeout(() => {
          setEdges((eds) =>
            eds.map((edge) => {
              let newEdge = { ...edge };
              
              // Check if source is rotated
              const sourceNode = nodes.find((n) => n.id === edge.source);
              if (sourceNode && rotatedNodeIds.has(edge.source)) {
                if (edge.sourceHandle) {
                  newEdge.sourceHandle = rotateHandle(edge.sourceHandle);
                }
              }
              
              // Check if target is rotated
              const targetNode = nodes.find((n) => n.id === edge.target);
              if (targetNode && rotatedNodeIds.has(edge.target)) {
                if (edge.targetHandle) {
                  newEdge.targetHandle = rotateHandle(edge.targetHandle);
                }
              }
              
              return newEdge;
            })
          );
        }, 10);

        return;
      }
    },
    [setNodes, setEdges, nodes, rotateHandle]
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
        snapGrid={[20, 20]}
        fitView
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
        <Background variant="dots" gap={20} size={1.5} color="#d1d5db" />
      </ReactFlow>
    </div>
  );
}

export default CircuitCanvas;
