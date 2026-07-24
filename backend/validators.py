"""Circuit Validators"""

from typing import Dict, List, Tuple, Optional
from pydantic import BaseModel


class ComponentSpec:
    """Specifications for each component type."""
    
    SPECS = {
        "dc_source": {
            "label": "DC Voltage Source",
            "value_min": 0.1,
            "value_max": 100.0,
            "value_default": 5.0,
            "unit": "V",
            "requires_two_terminals": True,
            "terminals": 2
        },
        "current_source": {
            "label": "Current Source",
            "value_min": 1e-6,  # 1 µA
            "value_max": 10.0,  # 10 A
            "value_default": 0.012,  # 12 mA
            "unit": "A",
            "requires_two_terminals": True,
            "terminals": 2
        },
        "resistor": {
            "label": "Resistor",
            "value_min": 0.0,
            "value_max": 1e6,  # 1 MΩ
            "value_default": 1000.0,
            "unit": "Ω",
            "requires_two_terminals": True,
            "terminals": 2
        },
        "capacitor": {
            "label": "Capacitor",
            "value_min": 1e-12,  # 1 pF
            "value_max": 1e-3,   # 1 mF
            "value_default": 1e-7,  # 100 nF
            "unit": "F",
            "requires_two_terminals": True,
            "terminals": 2
        },
        "inductor": {
            "label": "Inductor",
            "value_min": 1e-9,  # 1 nH
            "value_max": 1e-3,  # 1 mH
            "value_default": 1e-6,  # 1 µH
            "unit": "H",
            "requires_two_terminals": True,
            "terminals": 2
        },
        "ground": {
            "label": "Ground",
            "value_min": None,
            "value_max": None,
            "value_default": 0,
            "unit": None,
            "requires_two_terminals": False,
            "terminals": 1
        },
        "ammeter": {
            "label": "Ammeter",
            "value_min": None,
            "value_max": None,
            "value_default": 0,
            "unit": "A",
            "requires_two_terminals": True,
            "terminals": 2,
            "measurement_device": True
        },
        "voltmeter": {
            "label": "Voltmeter",
            "value_min": None,
            "value_max": None,
            "value_default": 0,
            "unit": "V",
            "requires_two_terminals": True,
            "terminals": 2,
            "measurement_device": True
        },
        "switch": {
            "label": "Switch",
            "value_min": None,
            "value_max": None,
            "value_default": 0,
            "unit": None,
            "requires_two_terminals": True,
            "terminals": 2,
            "has_state": True
        },
        "bulb": {
            "label": "Bulb",
            "value_min": 1.0,
            "value_max": 10000.0,
            "value_default": 240,
            "unit": "Ω",
            "requires_two_terminals": True,
            "terminals": 2
        }
    }
    
    @classmethod
    def get_spec(cls, component_type: str) -> Optional[Dict]:
        """Get specification for a component type."""
        return cls.SPECS.get(component_type)
    
    @classmethod
    def validate_value(cls, component_type: str, value: float) -> Tuple[bool, Optional[str]]:
        """
        Validate component value is within acceptable range.
        
        Returns:
            (is_valid, error_message)
        """
        spec = cls.get_spec(component_type)
        
        if not spec:
            return False, f"Unknown component type: {component_type}"
        
        # Measurement devices, ground, and switches don't need value validation
        if spec.get("measurement_device") or component_type in ("ground", "switch"):
            return True, None
        
        value_min = spec["value_min"]
        value_max = spec["value_max"]
        unit = spec["unit"]
        
        # Skip validation if limits are None or value is None
        if value is None or value_min is None or value_max is None:
            return True, None
        
        if value < value_min:
            return False, f"{spec['label']} value {value}{unit} is below minimum {value_min}{unit}"
        
        if value > value_max:
            return False, f"{spec['label']} value {value}{unit} exceeds maximum {value_max}{unit}"
        
        return True, None


class CircuitValidator:
    """Validates circuit structure and components."""
    
    def __init__(self):
        self.errors = []
        self.warnings = []
    
    def validate(self, circuit_data: Dict) -> Tuple[bool, List[str], List[str]]:
        """
        Validate complete circuit.
        
        Args:
            circuit_data: Circuit dictionary with nodes, components, ground
            
        Returns:
            (is_valid, errors, warnings)
        """
        self.errors = []
        self.warnings = []
        
        # Basic structure validation
        self._validate_structure(circuit_data)
        
        # Component validation
        self._validate_components(circuit_data.get("components", []))
        
        # Ground validation
        self._validate_ground(circuit_data)
        
        # Node connectivity
        self._validate_nodes(circuit_data)
        
        is_valid = len(self.errors) == 0
        return is_valid, self.errors, self.warnings
    
    def _validate_structure(self, circuit_data: Dict):
        """Validate basic circuit structure."""
        
        # Check required fields
        if "nodes" not in circuit_data:
            self.errors.append("Missing required field: nodes")
        
        if "components" not in circuit_data:
            self.errors.append("Missing required field: components")
        
        if "ground" not in circuit_data:
            self.errors.append("Missing required field: ground")
        
        # Check minimum requirements
        components = circuit_data.get("components", [])
        
        if len(components) == 0:
            self.errors.append("Circuit must have at least one component")
        
        # Check for at least one voltage or current source
        has_source = any(c.get("type") in ["dc_source", "current_source"] for c in components)
        if not has_source:
            self.errors.append("Circuit must have at least one DC voltage source or current source")
    
    def _validate_components(self, components: List[Dict]):
        """Validate all components."""
        
        component_ids = set()
        
        for idx, component in enumerate(components):
            comp_id = component.get("id", f"component_{idx}")
            comp_type = component.get("type")
            comp_value = component.get("value", 0)
            comp_nodes = component.get("nodes", [])
            
            # Check duplicate IDs
            if comp_id in component_ids:
                self.errors.append(f"Duplicate component ID: {comp_id}")
            component_ids.add(comp_id)
            
            # Check component type exists
            spec = ComponentSpec.get_spec(comp_type)
            if not spec:
                self.errors.append(f"Component {comp_id}: Unknown type '{comp_type}'")
                continue
            
            # Validate value range
            is_valid, error_msg = ComponentSpec.validate_value(comp_type, comp_value)
            if not is_valid:
                self.errors.append(f"Component {comp_id}: {error_msg}")
            
            # Validate terminal count
            expected_terminals = spec["terminals"]
            actual_terminals = len(comp_nodes)
            
            if actual_terminals != expected_terminals:
                if expected_terminals == 2 and actual_terminals == 1:
                    continue
                self.errors.append(
                    f"Component {comp_id} ({comp_type}): "
                    f"Expected {expected_terminals} terminals, got {actual_terminals}"
                )
            
            # Check for self-connection (both terminals to same node)
            if len(comp_nodes) == 2 and comp_nodes[0] == comp_nodes[1]:
                self.errors.append(f"Component {comp_id}: Both terminals connected to same node {comp_nodes[0]}")
    
    def _validate_ground(self, circuit_data: Dict):
        """Validate ground reference."""
        
        ground_node = circuit_data.get("ground")
        nodes = circuit_data.get("nodes", [])
        
        if not ground_node:
            self.errors.append("Ground node not specified")
            return
        
        # Check if ground node exists in nodes list
        if ground_node not in nodes:
            self.errors.append(f"Ground node '{ground_node}' not found in nodes list")

        # Ground can be placed as a reference marker and resolved by the frontend converter.
        # Don't require a direct wire connection here.
    
    def _validate_nodes(self, circuit_data: Dict):
        """Validate node connectivity."""
        
        nodes = set(circuit_data.get("nodes", []))
        components = circuit_data.get("components", [])
        
        # Collect all nodes mentioned in components
        used_nodes = set()
        for component in components:
            comp_nodes = component.get("nodes", [])
            used_nodes.update(comp_nodes)
        
        # Check for unused nodes
        unused_nodes = nodes - used_nodes
        if unused_nodes:
            self.warnings.append(f"Unused nodes in circuit: {', '.join(unused_nodes)}")
        
        # Check for nodes used but not declared
        undeclared_nodes = used_nodes - nodes
        if undeclared_nodes:
            self.errors.append(f"Components reference undeclared nodes: {', '.join(undeclared_nodes)}")
        
        # Check for floating nodes (nodes with only one connection)
        node_connections = {node: 0 for node in nodes}
        for component in components:
            for node in component.get("nodes", []):
                if node in node_connections:
                    node_connections[node] += 1
        
        floating_nodes = [node for node, count in node_connections.items() if count == 1 and node != circuit_data.get("ground")]
        if floating_nodes:
            self.warnings.append(f"Floating nodes (single connection): {', '.join(floating_nodes)}")


def validate_circuit_quick(circuit_data: Dict) -> Dict:
    """
    Quick validation function for API endpoint.
    
    Returns:
        {
            "valid": bool,
            "errors": List[str],
            "warnings": List[str]
        }
    """
    validator = CircuitValidator()
    is_valid, errors, warnings = validator.validate(circuit_data)
    
    return {
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }
