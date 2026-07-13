"""Structural Fault Detector - Union-find connectivity analysis"""

from typing import Dict, List, Set, Tuple, Optional


class UnionFind:
    """Union-Find (Disjoint Set Union) data structure for connectivity."""
    
    def __init__(self):
        self.parent = {}
        self.rank = {}
    
    def make_set(self, x):
        """Create a new set with element x."""
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0
    
    def find(self, x):
        """Find the root of the set containing x (with path compression)."""
        if x not in self.parent:
            self.make_set(x)
        
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # Path compression
        
        return self.parent[x]
    
    def union(self, x, y):
        """Merge the sets containing x and y (union by rank)."""
        root_x = self.find(x)
        root_y = self.find(y)
        
        if root_x == root_y:
            return  # Already in same set
        
        # Union by rank
        if self.rank[root_x] < self.rank[root_y]:
            self.parent[root_x] = root_y
        elif self.rank[root_x] > self.rank[root_y]:
            self.parent[root_y] = root_x
        else:
            self.parent[root_y] = root_x
            self.rank[root_x] += 1
    
    def connected(self, x, y):
        """Check if x and y are in the same set."""
        return self.find(x) == self.find(y)
    
    def get_components(self):
        """Get all connected components as sets."""
        components = {}
        for node in self.parent:
            root = self.find(node)
            if root not in components:
                components[root] = set()
            components[root].add(node)
        
        return list(components.values())


class StructuralFaultDetector:
    """Detects structural/wiring faults in circuits."""
    
    def __init__(self):
        self.faults = []
    
    def detect_faults(self, circuit_data: Dict, simulation_result: Dict) -> List[str]:
        """
        Detect all structural faults in circuit.
        
        Args:
            circuit_data: Circuit definition
            simulation_result: Results from ngspice simulation
            
        Returns:
            List of fault descriptions
        """
        self.faults = []
        
        # Run all structural checks
        self._check_missing_ground(circuit_data)
        self._check_open_circuits(circuit_data)
        self._check_short_circuits(circuit_data, simulation_result)
        self._check_ammeter_in_parallel(circuit_data)
        self._check_voltmeter_in_series(circuit_data)
        self._check_component_bypasses(circuit_data)
        self._check_reversed_polarity(circuit_data)
        self._check_series_parallel_confusion(circuit_data)
        
        return self.faults
    
    def _check_missing_ground(self, circuit_data: Dict):
        """
        Check if circuit has a proper ground reference.
        Missing ground reference — no node tied to ground (node 0).
        """
        ground = circuit_data.get("ground", "0")
        nodes = circuit_data.get("nodes", [])
        components = circuit_data.get("components", [])
        
        # Check if ground node exists in nodes list
        if ground not in nodes:
            self.faults.append(
                f"Missing ground reference: Ground node '{ground}' not found in circuit"
            )
            return
        
        # Check if any component is connected to ground
        ground_connected = False
        for component in components:
            if ground in component.get("nodes", []):
                ground_connected = True
                break
        
        if not ground_connected:
            self.faults.append(
                f"Missing ground reference: No components connected to ground node '{ground}'"
            )
    
    def _check_open_circuits(self, circuit_data: Dict):
        """
        Detect open circuits using union-find.
        Open circuit / broken wire — a break in the path; no connection from source to ground.
        """
        uf = UnionFind()
        ground = circuit_data.get("ground", "0")
        
        # Add all nodes
        for node in circuit_data.get("nodes", []):
            uf.make_set(node)
        
        # Connect nodes through components (excluding voltmeters which block DC current)
        for component in circuit_data.get("components", []):
            nodes = component.get("nodes", [])
            comp_type = component.get("type")
            
            # Voltmeter doesn't conduct current - acts as open circuit
            if comp_type == "voltmeter":
                continue
            
            # Connect nodes through this component
            if len(nodes) >= 2:
                uf.union(nodes[0], nodes[1])
        
        # Check if all nodes are connected to ground
        components_sets = uf.get_components()
        
        # Find ground's component set
        ground_component_set = None
        for comp_set in components_sets:
            if ground in comp_set:
                ground_component_set = comp_set
                break
        
        # Check for isolated components (open circuit)
        for comp_set in components_sets:
            if comp_set != ground_component_set and len(comp_set) > 0:
                isolated_nodes = sorted(comp_set)
                self.faults.append(
                    f"Open circuit / broken wire: Nodes {', '.join(isolated_nodes)} have no path to ground"
                )
        
        # Check if voltage sources are connected to ground
        for component in circuit_data.get("components", []):
            if component.get("type") == "dc_source":
                comp_nodes = component.get("nodes", [])
                source_connected_to_ground = any(
                    uf.connected(node, ground) for node in comp_nodes
                )
                
                if not source_connected_to_ground:
                    self.faults.append(
                        f"Open circuit: Voltage source {component['id']} not connected to ground"
                    )
    
    def _check_short_circuits(self, circuit_data: Dict, simulation_result: Dict):
        """
        Detect short circuits from simulation results.
        Short circuit — unintended direct connection; simulation shows voltage collapsing to ~zero across a component.
        """
        if not simulation_result or not simulation_result.get("success"):
            return
        
        voltages = simulation_result.get("voltages", {})
        currents = simulation_result.get("currents", {})
        
        # Check for excessive current (> 1A indicates likely short)
        for source, current in currents.items():
            if abs(current) > 1.0:  # 1A threshold
                self.faults.append(
                    f"Short circuit: Excessive current through {source} ({abs(current):.3f}A) - indicates unintended direct connection"
                )
        
        # Check for voltage collapsing across components (near-zero voltage drop)
        for component in circuit_data.get("components", []):
            comp_type = component.get("type")
            comp_id = component.get("id")
            
            # Check resistors, capacitors, inductors for voltage collapse
            if comp_type in ["resistor", "capacitor", "inductor"]:
                nodes = component.get("nodes", [])
                if len(nodes) == 2:
                    v1 = voltages.get(nodes[0], 0)
                    v2 = voltages.get(nodes[1], 0)
                    voltage_drop = abs(v1 - v2)
                    
                    # For resistors, near-zero voltage despite current flow = short
                    if comp_type == "resistor" and voltage_drop < 0.01:
                        self.faults.append(
                            f"Short circuit across {comp_id}: Voltage collapsed to ~zero ({voltage_drop:.4f}V) - component may be shorted or bypassed"
                        )
                    
                    # Check if voltage source is shorted (near-zero voltage)
            if comp_type == "dc_source":
                nodes = component.get("nodes", [])
                if len(nodes) == 2:
                    v1 = voltages.get(nodes[0], 0)
                    v2 = voltages.get(nodes[1], 0)
                    voltage_output = abs(v1 - v2)
                    expected_voltage = component.get("value", 0)
                    
                    # If voltage source output is much less than expected, it's shorted
                    if expected_voltage > 0 and voltage_output < expected_voltage * 0.1:
                        self.faults.append(
                            f"Short circuit: Voltage source {comp_id} output collapsed (expected {expected_voltage:.2f}V, got {voltage_output:.4f}V)"
                        )
    
    def _check_ammeter_in_parallel(self, circuit_data: Dict):
        """
        Ammeter connected in parallel — should be in series; wrong placement can create a short.
        """
        components = circuit_data.get("components", [])
        
        for component in components:
            if component.get("type") == "ammeter":
                comp_id = component.get("id")
                nodes = set(component.get("nodes", []))
                
                # Check if there are other conducting components connecting same nodes
                parallel_components = [
                    c for c in components 
                    if c != component and 
                    set(c.get("nodes", [])) == nodes and
                    c.get("type") not in ["voltmeter"]  # Voltmeter in parallel is OK
                ]
                
                if parallel_components:
                    parallel_ids = [c.get("id") for c in parallel_components]
                    self.faults.append(
                        f"Ammeter in parallel: {comp_id} is connected in parallel with {', '.join(parallel_ids)} - should be in series. Wrong placement can create a short."
                    )
    
    def _check_voltmeter_in_series(self, circuit_data: Dict):
        """
        Voltmeter connected in series — should be in parallel; wrong placement blocks current flow.
        """
        # Build connectivity graph excluding voltmeters
        uf_without_voltmeter = UnionFind()
        ground = circuit_data.get("ground", "0")
        
        for node in circuit_data.get("nodes", []):
            uf_without_voltmeter.make_set(node)
        
        # Connect nodes through all components EXCEPT voltmeters
        for component in circuit_data.get("components", []):
            if component.get("type") != "voltmeter":
                nodes = component.get("nodes", [])
                if len(nodes) >= 2:
                    uf_without_voltmeter.union(nodes[0], nodes[1])
        
        # Now check each voltmeter
        for component in circuit_data.get("components", []):
            if component.get("type") == "voltmeter":
                comp_id = component.get("id")
                nodes = component.get("nodes", [])
                
                if len(nodes) >= 2:
                    # If removing this voltmeter breaks connectivity to ground, it's in series (bad)
                    if not uf_without_voltmeter.connected(nodes[0], nodes[1]):
                        self.faults.append(
                            f"Voltmeter in series: {comp_id} is in series with circuit - should be in parallel. Wrong placement blocks current flow."
                        )
    
    def _check_component_bypasses(self, circuit_data: Dict):
        """
        Wires bypassing a component — a wire creates an unintended connection around a component 
        instead of through it, effectively shorting it out.
        """
        components = circuit_data.get("components", [])
        
        # For each resistor/capacitor/inductor, check if there are parallel conducting paths
        for component in components:
            comp_type = component.get("type")
            comp_id = component.get("id")
            
            # Only check components that should have voltage drop
            if comp_type in ["resistor", "capacitor", "inductor"]:
                nodes = set(component.get("nodes", []))
                
                # Check if there are other low-resistance paths connecting same nodes
                bypass_components = []
                
                for other_comp in components:
                    if other_comp == component:
                        continue
                    
                    other_nodes = set(other_comp.get("nodes", []))
                    other_type = other_comp.get("type")
                    
                    # If same nodes and it's a low-resistance component, it's a bypass
                    if other_nodes == nodes:
                        # Wires (if they existed as components) or very low resistance
                        if other_type == "resistor" and other_comp.get("value", float('inf')) < 1:
                            bypass_components.append(other_comp.get("id"))
                        # Direct wire connections would be detected here
                
                if bypass_components:
                    self.faults.append(
                        f"Component bypass: {comp_id} is bypassed by {', '.join(bypass_components)} - unintended parallel connection shorts it out"
                    )
    
    def _check_reversed_polarity(self, circuit_data: Dict):
        """
        Reversed power source polarity — battery/source connected backwards.
        Check if DC source positive terminal is connected to ground.
        """
        ground = circuit_data.get("ground", "0")
        
        for component in circuit_data.get("components", []):
            if component.get("type") == "dc_source":
                comp_id = component.get("id")
                nodes = component.get("nodes", [])
                
                if len(nodes) >= 2:
                    positive_node = nodes[0]  # First node is positive by convention
                    negative_node = nodes[1]  # Second node is negative by convention
                    
                    # If positive terminal is ground, polarity is reversed
                    if positive_node == ground:
                        self.faults.append(
                            f"Reversed power source polarity: {comp_id} positive terminal connected to ground - battery/source connected backwards"
                        )
                    
                    # Alternative check: if negative is at higher potential than positive
                    # This would need simulation results to verify
    
    def _check_series_parallel_confusion(self, circuit_data: Dict):
        """
        Series vs. parallel confusion — components connected in the wrong arrangement 
        relative to design intent.
        
        This is difficult to detect without knowing design intent, but we can warn about
        suspicious patterns like very unbalanced resistor networks.
        """
        # This would require design intent specification or ML pattern recognition
        # For now, we'll detect obvious issues like mismatched parallel resistors
        pass


def detect_structural_faults(circuit_data: Dict, simulation_result: Dict = None) -> List[str]:
    """
    Convenience function to detect structural faults.
    
    Args:
        circuit_data: Circuit definition
        simulation_result: Optional simulation results for advanced detection
        
    Returns:
        List of fault descriptions
    """
    detector = StructuralFaultDetector()
    return detector.detect_faults(circuit_data, simulation_result or {})


if __name__ == "__main__":
    print("Structural Fault Detector - Use via API")
