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

const initialNodes = [];
const initialEdges = [];

function NodeTerminals() {
  return (
    <>
      <Handle type="source" position={Position.Left} id="left" className="circuit-handle circuit-handle-left" />
      <Handle type="source" position={Position.Right} id="right" className="circuit-handle circuit-handle-right" />
    </>
  );
}

function ComponentNode({ id, data, mode }) {
  const isResultsMode = mode === 'results';
  const isEditing = data.isEditing;
  const valueDraft = data.valueDraft;

  const handleEditValue = (e) => {
    e.stopPropagation();
    data?.onEditValue?.(id);
  };

  const handleDraftChange = (e) => {
    data?.onChangeDraft?.(id, e.target.value);
  };

  const handleDraftSave = () => {
    data?.onSaveDraft?.(id);
  };

  const handleDraftCancel = () => {
    data?.onCancelDraft?.(id);
  };

  const getComponentImage = (type) => {
    // Check if custom image exists, otherwise use SVG
    const imagePath = `/components/${type}.png`;
    return (
      <img 
        src={imagePath} 
        alt={type}
        className="component-image"
        onError={(e) => {
          // Fallback to SVG if image not found
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'block';
        }}
      />
    );
  };

  const getComponentSVG = (type) => {
    switch(type) {
      case 'resistor':
        return (
          <svg className="component-svg" viewBox="0 0 100 30" width="80" height="24">
            <path d="M 0 15 L 15 15 L 20 5 L 30 25 L 40 5 L 50 25 L 60 5 L 70 25 L 80 5 L 85 15 L 100 15" 
                  stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'capacitor':
        return (
          <svg className="component-svg" viewBox="0 0 100 40" width="60" height="30">
            <line x1="0" y1="20" x2="45" y2="20" stroke="currentColor" strokeWidth="2.5"/>
            <line x1="45" y1="5" x2="45" y2="35" stroke="currentColor" strokeWidth="3"/>
            <line x1="55" y1="5" x2="55" y2="35" stroke="currentColor" strokeWidth="3"/>
            <line x1="55" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="2.5"/>
          </svg>
        );
      case 'inductor':
        return (
          <svg className="component-svg" viewBox="0 0 100 30" width="80" height="24">
            <path d="M 0 15 L 10 15 Q 10 5, 15 5 Q 20 5, 20 15 Q 20 5, 25 5 Q 30 5, 30 15 Q 30 5, 35 5 Q 40 5, 40 15 Q 40 5, 45 5 Q 50 5, 50 15 Q 50 5, 55 5 Q 60 5, 60 15 Q 60 5, 65 5 Q 70 5, 70 15 Q 70 5, 75 5 Q 80 5, 80 15 Q 80 5, 85 5 Q 90 5, 90 15 L 100 15" 
                  stroke="currentColor" strokeWidth="2.5" fill="none"/>
          </svg>
        );
      case 'dc_source':
        return (
          <svg className="component-svg" viewBox="0 0 60 60" width="50" height="50">
            <circle cx="30" cy="30" r="25" stroke="currentColor" strokeWidth="2.5" fill="none"/>
            <line x1="20" y1="30" x2="28" y2="30" stroke="currentColor" strokeWidth="2.5"/>
            <line x1="32" y1="30" x2="40" y2="30" stroke="currentColor" strokeWidth="2.5"/>
            <line x1="36" y1="26" x2="36" y2="34" stroke="currentColor" strokeWidth="2.5"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="circuit-node circuit-node-component" style={data.style}>
      <NodeTerminals />

      {data.componentType === 'dc_source' ? (
        <div className="battery-body">
          <span className="battery-polarity battery-negative">−</span>

          {isResultsMode ? (
            <span className="battery-value-hidden" aria-hidden="true" />
          ) : isEditing ? (
            <div className="value-editor" onClick={(e) => e.stopPropagation()}>
              <input
                className="value-editor-input"
                inputMode="decimal"
                type="text"
                value={valueDraft}
                onChange={handleDraftChange}
              />
              <div className="value-editor-actions">
                <button type="button" className="value-editor-btn" onClick={handleDraftSave}>
                  ✓
                </button>
                <button type="button" className="value-editor-btn" onClick={handleDraftCancel}>
                  ✕
                </button>
              </div>
              {data?.valueError ? <div className="value-editor-error">{data.valueError}</div> : null}
            </div>
          ) : (
            <div className="component-visual-wrapper">
              {getComponentImage(data.componentType)}
              <div className="component-svg-fallback" style={{display: 'none'}}>
                {getComponentSVG(data.componentType)}
              </div>
              <button
                type="button"
                className="circuit-node-content battery-content value-button"
                onClick={handleEditValue}
              >
                {formatNodeValue(data.componentType, data.value)}
              </button>
            </div>
          )}

          <span className="battery-polarity battery-positive">+</span>
        </div>
      ) : (
        <div className="circuit-node-content component-content">
          <div className="component-visual-container">
            {isResultsMode ? null : (
              <>
                {getComponentImage(data.componentType)}
                <div className="component-svg-fallback" style={{display: 'none'}}>
                  {getComponentSVG(data.componentType)}
                </div>
              </>
            )}
          </div>
          {isResultsMode ? null : isEditing ? (
            <div className="value-editor" onClick={(e) => e.stopPropagation()}>
              <input
                className="value-editor-input"
                inputMode="decimal"
                type="text"
                value={valueDraft}
                onChange={handleDraftChange}
              />
              <div className="value-editor-actions">
                <button type="button" className="value-editor-btn" onClick={handleDraftSave}>
                  ✓
                </button>
                <button type="button" className="value-editor-btn" onClick={handleDraftCancel}>
                  ✕
                </button>
              </div>
              {data?.valueError ? <div className="value-editor-error">{data.valueError}</div> : null}
            </div>
          ) : (
            <button type="button" className="value-button" onClick={handleEditValue}>
              {formatNodeValue(data.componentType, data.value)}
            </button>
          )}
        </div>
      )}
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

function CircuitCanvas({
  setCircuit,
  mode = 'edit',
  circuit,
}) {
  const externalNodes = circuit?.nodes;
  const externalEdges = circuit?.edges;

  const isReadOnly = mode === 'results';

  const [showInstructions, setShowInstructions] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);


  const handleEditValue = useCallback(
    (nodeId) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node;

          const currentValue = node.data?.value ?? getDefaultValue(node.data?.componentType);
          return {
            ...node,
            data: {
              ...node.data,
              isEditing: true,
              valueDraft: String(currentValue),
              valueError: null,
            },
          };
        })
      );
    },
    [setNodes]
  );

  const handleChangeDraft = useCallback(
    (nodeId, raw) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              valueDraft: raw,
              valueError: null,
            },
          };
        })
      );
    },
    [setNodes]
  );

  const handleSaveDraft = useCallback(
    (nodeId) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node;

          const raw = String(node.data?.valueDraft ?? '');
          const nextValue = Number(raw);
          if (!Number.isFinite(nextValue)) {
            return {
              ...node,
              data: {
                ...node.data,
                valueError: 'Enter a valid numeric value',
              },
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
    },
    [setNodes]
  );

  const handleCancelDraft = useCallback(
    (nodeId) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            data: {
              ...node.data,
              isEditing: false,
              valueDraft: undefined,
              valueError: null,
            },
          };
        })
      );
    },
    [setNodes]
  );



  // Memoize nodeTypes to prevent React Flow warning
  const nodeTypes = useMemo(
    () => ({
      componentNode: (props) => <ComponentNode {...props} mode={mode} />,
      junctionNode: JunctionNode,
      groundNode: GroundNode,
    }),
    [mode]
  );



  useEffect(() => {
    if (!setCircuit) return;
    setCircuit({ nodes, edges });
  }, [nodes, edges, setCircuit]);

  useEffect(() => {
    if (!isReadOnly) return;
    if (!Array.isArray(externalNodes) || !Array.isArray(externalEdges)) return;
    setNodes(externalNodes);
    setEdges(externalEdges);
  }, [isReadOnly, externalNodes, externalEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({
      ...params,
      type: 'straight', // Straight wires like LTspice
      animated: false,
      style: { stroke: '#1f2937', strokeWidth: 2 },
    }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      // Hide instructions after first drop
      setShowInstructions(false);

      const type = event.dataTransfer.getData('application/reactflow');
      
      // Use reactFlowInstance to properly convert screen coordinates to flow coordinates
      if (!reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const defaultValue = getDefaultValue(type);
      const nodeId = String(type) + '_' + String(Date.now());

      const nodeType = type === 'ground' ? 'groundNode' : type === 'junction' ? 'junctionNode' : 'componentNode';
      
      // Create label with component type and value
      let label;
      if (type === 'ground') {
        label = '⏚';
      } else if (type === 'junction') {
        label = '●'; // Small dot
      } else if (type === 'dc_source') {
        label = defaultValue + 'V';

      } else {
        const formattedValue = formatValue(defaultValue, type);
        label = `${getComponentIcon(type)}\n${formattedValue}`;
      }

      const newNode = {
        id: nodeId,
        type: nodeType,
        position,
        data: { 
          label,
          componentType: type,
          value: defaultValue,
          onEditValue: handleEditValue,
          onChangeDraft: handleChangeDraft,
          onSaveDraft: handleSaveDraft,
          onCancelDraft: handleCancelDraft
        },
        style: getNodeStyle(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, handleEditValue, handleChangeDraft, handleSaveDraft, handleCancelDraft]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Delete selected nodes and edges
  const onNodesDelete = useCallback(
    (deleted) => {
      setNodes((nds) => nds.filter((node) => !deleted.find((d) => d.id === node.id)));
    },
    [setNodes]
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      setEdges((eds) => eds.filter((edge) => !deleted.find((d) => d.id === edge.id)));
    },
    [setEdges]
  );

  // Handle keyboard shortcuts
  const onKeyDown = useCallback((event) => {
    // Delete key or Backspace to delete selected elements
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const selectedNodes = nodes.filter(node => node.selected);
      const selectedEdges = edges.filter(edge => edge.selected);
      
      if (selectedNodes.length > 0) {
        onNodesDelete(selectedNodes);
      }
      if (selectedEdges.length > 0) {
        onEdgesDelete(selectedEdges);
      }
    }
  }, [nodes, edges, onNodesDelete, onEdgesDelete]);

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
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
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

function getDefaultValue(type) {
  const defaults = {
    'dc_source': 5.0,
    'resistor': 1000,
    'capacitor': 1e-7,
    'inductor': 1e-6,
    'ground': 0
  };
  return defaults[type] || 0;
}

function formatValue(value, type) {
  if (type === 'resistor') {
    if (value >= 1000) return `${value/1000}kΩ`;
    return `${value}Ω`;
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
  if (type === 'dc_source') {
    return `${value}V`;
  }
  return formatValue(value, type);
}

function getComponentIcon(type) {
  const icons = {
    'dc_source': '⚡',
    'resistor': '━━',
    'capacitor': '||',
    'inductor': '~~~',
    'ground': '⏚'
  };
  return icons[type] || '?';
}

function getNodeStyle(type) {
  const baseStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '600',
    border: '2px solid #d1d5db',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '100px',
    minHeight: '70px',
    background: '#ffffff',
    color: '#374151',
  };

  const styles = {
    'dc_source': {
      ...baseStyle,
      minWidth: '120px',
    },
    'resistor': {
      ...baseStyle,
    },
    'capacitor': {
      ...baseStyle,
    },
    'inductor': {
      ...baseStyle,
    },
    'junction': {
      padding: '6px',
      borderRadius: '50%',
      width: '12px',
      height: '12px',
      background: '#1f2937',
      border: '2px solid #1f2937',
      color: 'transparent',
    },
    'ground': {
      ...baseStyle,
      background: '#f3f4f6',
      borderColor: '#6b7280',
      color: '#1f2937',
      minWidth: '56px',
      minHeight: '56px',
    },
  };

  return styles[type] || baseStyle;
}

export default CircuitCanvas;
