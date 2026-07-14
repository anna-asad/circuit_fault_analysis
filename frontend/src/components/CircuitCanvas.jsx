import { useCallback, useEffect, useMemo, useState } from 'react';
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

// Component SVG symbols
const COMPONENT_SVGS = {
  resistor: (
    <svg className="component-svg" viewBox="0 0 100 30" preserveAspectRatio="xMidYMid meet">
      <path d="M 0 15 L 15 15 L 20 5 L 30 25 L 40 5 L 50 25 L 60 5 L 70 25 L 80 5 L 85 15 L 100 15" 
            stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  capacitor: (
    <svg className="component-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="20" x2="45" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="45" y1="5" x2="45" y2="35" stroke="currentColor" strokeWidth="3"/>
      <line x1="55" y1="5" x2="55" y2="35" stroke="currentColor" strokeWidth="3"/>
      <line x1="55" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
  inductor: (
    <svg className="component-svg" viewBox="0 0 100 30" preserveAspectRatio="xMidYMid meet">
      <path d="M 0 15 L 10 15 Q 10 5, 15 5 Q 20 5, 20 15 Q 20 5, 25 5 Q 30 5, 30 15 Q 30 5, 35 5 Q 40 5, 40 15 Q 40 5, 45 5 Q 50 5, 50 15 Q 50 5, 55 5 Q 60 5, 60 15 Q 60 5, 65 5 Q 70 5, 70 15 Q 70 5, 75 5 Q 80 5, 80 15 Q 80 5, 85 5 Q 90 5, 90 15 L 100 15" 
            stroke="currentColor" strokeWidth="2.5" fill="none"/>
    </svg>
  ),
  dc_source: (
    <svg className="component-svg" viewBox="0 0 80 40" preserveAspectRatio="xMidYMid meet">
      <line x1="0" y1="20" x2="25" y2="20" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="25" y1="8" x2="25" y2="32" stroke="currentColor" strokeWidth="2.5"/>
      <line x1="35" y1="12" x2="35" y2="28" stroke="currentColor" strokeWidth="3"/>
      <line x1="35" y1="20" x2="80" y2="20" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  ),
};

const DEFAULT_VALUES = {
  dc_source: 5.0,
  resistor: 1000,
  capacitor: 1e-7,
  inductor: 1e-6,
  ground: 0
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

// Utility functions
function formatValue(value, type) {
  if (type === 'resistor') {
    return value >= 1000 ? `${value/1000}kΩ` : `${value}Ω`;
  }
  if (type === 'capacitor') {
    if (value >= 1e-6) return `${value*1e6}µF`;
    if (value >= 1e-9) return `${value*1e9}nF`;
    return `${value*1e12}pF`;
  }
  if (type === 'inductor') {
    if (value >= 1e-3) return `${value*1e3}mH`;
    if (value >= 1e-6) return `${value*1e6}µH`;
    return `${value*1e9}nH`;
  }
  return value;
}

function formatNodeValue(type, value) {
  return type === 'dc_source' ? `${value}V` : formatValue(value, type);
}

function getNodeStyle(type) {
  if (type === 'junction') return NODE_STYLES.junction;
  if (type === 'ground') return { ...NODE_STYLES.base, ...NODE_STYLES.ground };
  if (type === 'dc_source') return { ...NODE_STYLES.base, minWidth: '80px' };
  return NODE_STYLES.base;
}

// Node Components
function NodeTerminals() {
  return (
    <>
      <Handle type="source" position={Position.Left} id="left" className="circuit-handle circuit-handle-left" />
      <Handle type="source" position={Position.Right} id="right" className="circuit-handle circuit-handle-right" />
    </>
  );
}

function ValueEditor({ valueDraft, error, onChange, onSave, onCancel }) {
  return (
    <div className="value-editor" onClick={(e) => e.stopPropagation()}>
      <input
        className="value-editor-input"
        inputMode="decimal"
        type="text"
        value={valueDraft}
        onChange={onChange}
      />
      <div className="value-editor-actions">
        <button type="button" className="value-editor-btn" onClick={onSave}>✓</button>
        <button type="button" className="value-editor-btn" onClick={onCancel}>✕</button>
      </div>
      {error && <div className="value-editor-error">{error}</div>}
    </div>
  );
}

function ComponentNode({ id, data, mode }) {
  if (mode === 'results') {
    return (
      <div className="circuit-node circuit-node-component" style={data.style}>
        <NodeTerminals />
        <div className="circuit-node-content component-content">
          <div className="component-visual-container" />
        </div>
      </div>
    );
  }

  const { isEditing, valueDraft, valueError, componentType, value } = data;

  return (
    <div className="circuit-node circuit-node-component" style={data.style}>
      <NodeTerminals />
      <div className="circuit-node-content component-content">
        <div className="component-visual-container">
          <img 
            src={`/components/${componentType}.png`}
            alt={componentType}
            className="component-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <div className="component-svg-fallback" style={{display: 'none'}}>
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

function JunctionNode({ data }) {
  return (
    <div className="circuit-node circuit-node-junction" style={data.style}>
      <NodeTerminals />
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

// Main Component
function CircuitCanvas({ setCircuit, mode = 'edit', circuit }) {
  const isReadOnly = mode === 'results';
  const [showInstructions, setShowInstructions] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // Value editing handlers
  const handleEditValue = useCallback((nodeId) => {
    setNodes((nodes) =>
      nodes.map((node) => 
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                isEditing: true,
                valueDraft: String(node.data?.value ?? DEFAULT_VALUES[node.data?.componentType] ?? 0),
                valueError: null,
              },
            }
          : node
      )
    );
  }, [setNodes]);

  const handleChangeDraft = useCallback((nodeId, raw) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, valueDraft: raw, valueError: null } }
          : node
      )
    );
  }, [setNodes]);

  const handleSaveDraft = useCallback((nodeId) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== nodeId) return node;
        
        const nextValue = Number(node.data?.valueDraft ?? '');
        if (!Number.isFinite(nextValue)) {
          return {
            ...node,
            data: { ...node.data, valueError: 'Enter a valid numeric value' },
          };
        }

        return {
          ...node,
          data: {
            ...node.data,
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
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                isEditing: false,
                valueDraft: undefined,
                valueError: null,
              },
            }
          : node
      )
    );
  }, [setNodes]);

  // ReactFlow event handlers
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'straight',
      animated: false,
      style: { stroke: '#1f2937', strokeWidth: 2 },
    }, eds)),
    [setEdges]
  );

  const onDrop = useCallback((event) => {
    event.preventDefault();
    setShowInstructions(false);

    if (!reactFlowInstance) return;

    const type = event.dataTransfer.getData('application/reactflow');
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const value = DEFAULT_VALUES[type] || 0;
    const nodeType = type === 'ground' ? 'groundNode' : type === 'junction' ? 'junctionNode' : 'componentNode';
    
    const newNode = {
      id: `${type}_${Date.now()}`,
      type: nodeType,
      position,
      data: {
        label: type === 'ground' ? '⏚' : type === 'junction' ? '●' : formatNodeValue(type, value),
        componentType: type,
        value,
        onEditValue: handleEditValue,
        onChangeDraft: handleChangeDraft,
        onSaveDraft: handleSaveDraft,
        onCancelDraft: handleCancelDraft,
      },
      style: getNodeStyle(type),
    };

    setNodes((nds) => [...nds, newNode]);
  }, [reactFlowInstance, handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft, setNodes]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onKeyDown = useCallback((event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedNodes = nodes.filter(node => node.selected);
      const selectedEdges = edges.filter(edge => edge.selected);
      
      if (selectedNodes.length > 0) {
        setNodes((nds) => nds.filter((node) => !selectedNodes.find((d) => d.id === node.id)));
      }
      if (selectedEdges.length > 0) {
        setEdges((eds) => eds.filter((edge) => !selectedEdges.find((d) => d.id === edge.id)));
      }
    }
  }, [nodes, edges, setNodes, setEdges]);

  const nodeTypes = useMemo(
    () => ({
      componentNode: (props) => <ComponentNode {...props} mode={mode} />,
      junctionNode: JunctionNode,
      groundNode: GroundNode,
    }),
    [mode]
  );

  // Sync with external circuit state
  useEffect(() => {
    if (setCircuit) setCircuit({ nodes, edges });
  }, [nodes, edges, setCircuit]);

  useEffect(() => {
    if (isReadOnly && Array.isArray(circuit?.nodes) && Array.isArray(circuit?.edges)) {
      setNodes(circuit.nodes);
      setEdges(circuit.edges);
    }
  }, [isReadOnly, circuit, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%' }} onKeyDown={onKeyDown} tabIndex={0}>
      {showInstructions && !isReadOnly && (
        <div className="canvas-instructions">
          💡 <strong>Build circuits:</strong> 
          Wire components from any terminal to any terminal or use <strong>Junctions (●)</strong> for splits/merges |
          Place <strong>Ground (⏚)</strong> anywhere on the canvas |
          Battery+ top | <kbd>Delete</kbd> to remove
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
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        connectionMode="loose"
        fitView
        deleteKeyCode={isReadOnly ? [] : ['Delete', 'Backspace']}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            if (node.data?.componentType === 'dc_source') return '#3b82f6';
            if (node.data?.componentType === 'ground') return '#6b7280';
            return '#10b981';
          }}
        />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}

export default CircuitCanvas;
