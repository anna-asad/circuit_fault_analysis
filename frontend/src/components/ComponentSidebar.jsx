import './ComponentSidebar.css';

const components = [
  { type: 'dc_source',      label: 'DC Voltage',     icon: '⚡',  unit: 'V' },
  { type: 'current_source', label: 'Current Source',  icon: '⬆',  unit: 'A' },
  { type: 'resistor',       label: 'Resistor',        icon: '♒︎', unit: 'Ω' },
  { type: 'capacitor',      label: 'Capacitor',       icon: '||', unit: 'F' },
  { type: 'inductor',       label: 'Inductor',        icon: '~~~', unit: 'H' },
  { type: 'ammeter',        label: 'Ammeter',         icon: 'Ⓐ',  unit: 'A', hint: 'Wire in series' },
  { type: 'voltmeter',      label: 'Voltmeter',       icon: 'Ⓥ',  unit: 'V', hint: 'Wire in parallel' },
  { type: 'junction',       label: 'Junction',        icon: '●',  unit: '' },
  { type: 'ground',         label: 'Ground',          icon: '⏚',  unit: '' },
];

function ComponentSidebar() {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="component-sidebar">
      <h3>Components</h3>
      <p className="hint">Drag onto canvas →</p>
      
      <div className="component-list">
        {components.map((comp) => (
          <div
            key={comp.type}
            className={`component-item${comp.type === 'ammeter' ? ' component-item-ammeter' : comp.type === 'voltmeter' ? ' component-item-voltmeter' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, comp.type)}
            title={comp.hint ?? (comp.type === 'junction' ? 'Connection point for wires' : '')}
          >
            <span className="component-icon">{comp.icon}</span>
            <div className="component-info">
              <div className="component-label">{comp.label}</div>
              {comp.unit  && <div className="component-unit">{comp.unit}</div>}
              {comp.hint  && <div className="component-hint">{comp.hint}</div>}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default ComponentSidebar;
