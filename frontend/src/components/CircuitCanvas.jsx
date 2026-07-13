import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
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
      <Handle type="source" position={Position.Left} id="left-source" className="circuit-handle circuit-handle-left-source" />
      <Handle type="target" position={Position.Left} id="left-target" className="circuit-handle circuit-handle-left-target" />
      <Handle type="source" position={Position.Right} id="right-source" className="circuit-handle circuit-handle-right-source" />
      <Handle type="target" position={Position.Right} id="right-target" className="circuit-handle circuit-handle-right-target" />
    </>
  );
}

function ComponentNode({ data }) {
  return (
    <div className="circuit-node circuit-node-component" style={data.style}>
      <NodeTerminals />
      {data.componentType === 'dc_source' ? (
        <div className="battery-body">
          <span className="battery-polarity battery-negative">−</span>
          <div className="circuit-node-content battery-content">{data.label}</div>
          <span className="battery-polarity battery-positive">+</span>
        </div>
      ) : (
        <div className="circuit-node-content">{data.label}</div>
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

function CircuitCanvas({ setCircuit }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Memoize nodeTypes to prevent React Flow warning
  const nodeTypes = useMemo(() => ({
    componentNode: ComponentNode,
    junctionNode: JunctionNode,
    groundNode: GroundNode,
  }), []);

  // Update parent state whenever nodes or edges change
  useEffect(() => {
    setCircuit({ nodes, edges });
  }, [nodes, edges, setCircuit]);

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

      const type = event.dataTransfer.getData('application/reactflow');
      
      // Get the ReactFlow wrapper bounds
      const reactFlowWrapper = document.querySelector('.react-flow');
      if (!reactFlowWrapper) return;
      
      const reactFlowBounds = reactFlowWrapper.getBoundingClientRect();
      
      // Calculate position relative to ReactFlow canvas (accounting for pan/zoom)
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      const defaultValue = getDefaultValue(type);
      const nodeId = `${type}_${Date.now()}`;
      const nodeType = type === 'ground' ? 'groundNode' : type === 'junction' ? 'junctionNode' : 'componentNode';
      
      // Create label with component type and value
      let label;
      if (type === 'ground') {
        label = '⏚';
      } else if (type === 'junction') {
        label = '●'; // Small dot
      } else if (type === 'dc_source') {
        label = `${defaultValue}V`;
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
          value: defaultValue
        },
        style: getNodeStyle(type),
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes]
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
      <div className="canvas-instructions">
        💡 <strong>Build circuits:</strong> 
        Wire components from any terminal to any terminal or use <strong>Junctions (●)</strong> for splits/merges |
        Place <strong>Ground (⏚)</strong> anywhere on the canvas |
        Battery+ top | <kbd>Delete</kbd> to remove
      </div>
      
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
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
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
    padding: '12px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    border: '2px solid',
    whiteSpace: 'pre-line',
    textAlign: 'center',
    minWidth: '96px',
    minHeight: '48px',
  };

  const styles = {
    'dc_source': {
      ...baseStyle,
      background: '#eff6ff',
      borderColor: '#3b82f6',
      color: '#1e40af',
    },
    'resistor': {
      ...baseStyle,
      background: '#f0fdf4',
      borderColor: '#10b981',
      color: '#065f46',
    },
    'capacitor': {
      ...baseStyle,
      background: '#fef3c7',
      borderColor: '#f59e0b',
      color: '#92400e',
    },
    'inductor': {
      ...baseStyle,
      background: '#f3e8ff',
      borderColor: '#a855f7',
      color: '#6b21a8',
    },
    'junction': {
      padding: '8px',
      borderRadius: '50%',
      width: '16px',
      height: '16px',
      background: '#1f2937',
      border: '2px solid #1f2937',
      color: 'transparent',
    },
    'ground': {
      ...baseStyle,
      background: '#f3f4f6',
      borderColor: '#6b7280',
      color: '#1f2937',
      minWidth: '72px',
      minHeight: '72px',
    },
  };

  return styles[type] || baseStyle;
}

export default CircuitCanvas;
