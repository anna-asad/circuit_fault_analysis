"""SPICE Netlist Generator - DC analysis only"""

from typing import Dict, List, Optional
from datetime import datetime


class NetlistGenerator:
    """Generates SPICE netlist from circuit definition."""
    
    def __init__(self):
        self.netlist_lines = []
        self.component_counter = {}
    
    def generate(self, circuit_data: Dict) -> str:
        """
        Generate complete SPICE netlist from circuit data.
        
        Args:
            circuit_data: Circuit dictionary with nodes, components, ground
            
        Returns:
            SPICE netlist as string
        """
        self.netlist_lines = []
        
        # Header
        self._add_header()
        
        # Components
        components = circuit_data.get("components", [])
        for component in components:
            self._add_component(component)
        
        # Control section (DC operating point analysis)
        self._add_control_section()
        
        # Footer
        self._add_footer()
        
        return "\n".join(self.netlist_lines)
    
    def _add_header(self):
        """Add netlist header with title and metadata."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.netlist_lines.extend([
            "* Circuit Fault Detector - Auto-generated Netlist",
            f"* Generated: {timestamp}",
            "* Analysis: DC Operating Point",
            ""
        ])
    
    def _add_component(self, component: Dict):
        """
        Add a single component to the netlist.
        
        SPICE component format:
        - Voltage source: Vname n+ n- DC value
        - Current source: Iname n+ n- DC value
        - Resistor: Rname n1 n2 value
        - Capacitor: Cname n1 n2 value
        - Inductor: Lname n1 n2 value
        """
        comp_id = component.get("id", "")
        comp_type = component.get("type", "")
        comp_value = component.get("value", 0)
        comp_nodes = component.get("nodes", [])
        
        # Skip measurement devices (they don't appear in DC netlist)
        if comp_type in ["ammeter", "voltmeter", "ground"]:
            return
        
        if len(comp_nodes) < 2:
            return  # Invalid component
        
        node1, node2 = comp_nodes[0], comp_nodes[1]
        spice_name = self._get_spice_name(comp_type, comp_id)
        if not spice_name:
            return
        
        # Generate SPICE line based on component type
        if comp_type == "dc_source":
            # Voltage source: V1 n+ n- DC 5
            line = f"{spice_name} {node1} {node2} DC {comp_value}"
        
        elif comp_type == "current_source":
            # Current source: I1 n+ n- DC 0.012
            line = f"{spice_name} {node1} {node2} DC {comp_value}"
        
        elif comp_type == "resistor":
            # Resistor: R1 n1 n2 1000
            line = f"{spice_name} {node1} {node2} {comp_value}"
        
        elif comp_type == "capacitor":
            # Capacitor: C1 n1 n2 100n
            # For DC analysis, capacitor acts as open circuit
            # But we include it for completeness
            line = f"{spice_name} {node1} {node2} {comp_value}"
        
        elif comp_type == "inductor":
            # Inductor: L1 n1 n2 1u
            # For DC analysis, inductor acts as short circuit (wire)
            line = f"{spice_name} {node1} {node2} {comp_value}"
        
        else:
            return  # Unknown component type
        
        self.netlist_lines.append(line)

    def _get_spice_name(self, comp_type: str, comp_id: str) -> Optional[str]:
        """Return a SPICE-safe component name with the correct leading prefix."""
        if not comp_id:
            return None

        if comp_type == "dc_source":
            return comp_id if comp_id[:1].upper() == "V" else f"V{comp_id}"
        if comp_type == "current_source":
            return comp_id if comp_id[:1].upper() == "I" else f"I{comp_id}"
        if comp_type == "resistor":
            return comp_id if comp_id[:1].upper() == "R" else f"R{comp_id}"
        if comp_type == "capacitor":
            return comp_id if comp_id[:1].upper() == "C" else f"C{comp_id}"
        if comp_type == "inductor":
            return comp_id if comp_id[:1].upper() == "L" else f"L{comp_id}"

        return None
    
    def _add_control_section(self):
        """
        Add ngspice control commands for DC analysis.
        
        DC operating point (.op) analysis:
        - Calculates steady-state voltages at all nodes
        - Calculates currents through voltage sources
        """
        self.netlist_lines.extend([
            "",
            "* Control section",
            ".control",
            "  op",  # DC operating point analysis
            "  print all",  # Print all voltages and currents
            "  print allv",  # Print all node voltages
            "  print alli",  # Print all currents
            ".endc",
            ""
        ])
    
    def _add_footer(self):
        """Add netlist footer."""
        self.netlist_lines.append(".end")
    
    def format_value(self, value: float, unit: str = "") -> str:
        """
        Format component value with engineering notation.
        
        Examples:
            1000 Ω → 1k
            0.000001 F → 1u
            100000000 Ω → 100Meg
        """
        if value == 0:
            return "0"
        
        # SPICE suffixes
        if value >= 1e9:
            return f"{value/1e9}G"  # Giga
        elif value >= 1e6:
            return f"{value/1e6}Meg"  # Mega
        elif value >= 1e3:
            return f"{value/1e3}k"  # Kilo
        elif value >= 1:
            return f"{value}"
        elif value >= 1e-3:
            return f"{value*1e3}m"  # Milli
        elif value >= 1e-6:
            return f"{value*1e6}u"  # Micro
        elif value >= 1e-9:
            return f"{value*1e9}n"  # Nano
        elif value >= 1e-12:
            return f"{value*1e12}p"  # Pico
        else:
            return f"{value}"


def generate_netlist(circuit_data: Dict) -> str:
    """
    Convenience function to generate netlist.
    
    Args:
        circuit_data: Circuit dictionary
        
    Returns:
        SPICE netlist string
    """
    generator = NetlistGenerator()
    return generator.generate(circuit_data)


# Example usage and testing
if __name__ == "__main__":
    print("SPICE Netlist Generator Test\n")
    print("=" * 70)
    
    # Example circuit: Simple voltage divider
    circuit = {
        "nodes": ["n1", "n2", "0"],
        "components": [
            {
                "id": "V1",
                "type": "dc_source",
                "value": 5.0,
                "nodes": ["n1", "0"]
            },
            {
                "id": "R1",
                "type": "resistor",
                "value": 1000,
                "nodes": ["n1", "n2"]
            },
            {
                "id": "R2",
                "type": "resistor",
                "value": 1000,
                "nodes": ["n2", "0"]
            }
        ],
        "ground": "0"
    }
    
    netlist = generate_netlist(circuit)
    
    print("Generated Netlist:")
    print("=" * 70)
    print(netlist)
    print("=" * 70)
    
    # Example 2: RC circuit
    print("\n\nExample 2: RC Circuit")
    print("=" * 70)
    
    circuit2 = {
        "nodes": ["n1", "n2", "0"],
        "components": [
            {
                "id": "V1",
                "type": "dc_source",
                "value": 12.0,
                "nodes": ["n1", "0"]
            },
            {
                "id": "R1",
                "type": "resistor",
                "value": 10000,
                "nodes": ["n1", "n2"]
            },
            {
                "id": "C1",
                "type": "capacitor",
                "value": 1e-6,
                "nodes": ["n2", "0"]
            }
        ],
        "ground": "0"
    }
    
    netlist2 = generate_netlist(circuit2)
    print(netlist2)
    print("=" * 70)
