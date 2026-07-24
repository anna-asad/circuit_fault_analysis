"""SPICE Netlist Generator - DC analysis only

Meter handling
──────────────
Ammeter  → zero-volt voltage source (Vsense_<id> n+ n- DC 0).
            ngspice reports I(Vsense_<id>) = exact branch current.
            Zero voltage means it behaves as a perfect short (ideal ammeter).

Voltmeter → 1 GΩ resistor (R<id>_vm n+ n- 1e9).
            Negligible loading on the circuit; node voltages at both terminals
            are already printed, so V = V(n+) − V(n−) is computed in the panel.
"""

from typing import Dict, List, Optional
from datetime import datetime


class NetlistGenerator:
    """Generates SPICE netlist from circuit definition."""

    def __init__(self):
        self.netlist_lines: List[str] = []

    # ── Public API ────────────────────────────────────────────────────────────

    def generate(self, circuit_data: Dict) -> str:
        self.netlist_lines = []
        self._add_header()
        for component in circuit_data.get("components", []):
            self._add_component(component)
        self._add_control_section(circuit_data)
        self._add_footer()
        return "\n".join(self.netlist_lines)

    # ── Header / footer ───────────────────────────────────────────────────────

    def _add_header(self):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self.netlist_lines.extend([
            "* Circuit Fault Detector - Auto-generated Netlist",
            f"* Generated: {ts}",
            "* Analysis: DC Operating Point",
            "",
        ])

    def _add_footer(self):
        self.netlist_lines.append(".end")

    # ── Component translation ─────────────────────────────────────────────────

    def _add_component(self, component: Dict):
        comp_id    = component.get("id", "")
        comp_type  = component.get("type", "")
        comp_value = component.get("value", 0)
        comp_nodes = component.get("nodes", [])

        # Ground marker — no SPICE line needed
        if comp_type == "ground":
            return

        if len(comp_nodes) < 2:
            return

        n1, n2 = comp_nodes[0], comp_nodes[1]

        # ── Meters ────────────────────────────────────────────────────────────
        if comp_type == "ammeter":
            # Ideal ammeter = 0 V sense source.  The converter already set
            # spiceName = "Vsense_<id>"; use that if present, else build it.
            spice_name = component.get("spiceName") or f"Vsense_{comp_id}"
            # Ensure the name starts with 'V' (SPICE requirement)
            if not spice_name.upper().startswith("V"):
                spice_name = f"V{spice_name}"
            self.netlist_lines.append(f"{spice_name} {n1} {n2} DC 0")
            return

        if comp_type == "voltmeter":
            # Ideal voltmeter = infinite Ω, modelled as 1 GΩ.
            spice_name = component.get("spiceName") or f"R{comp_id}_vm"
            if not spice_name.upper().startswith("R"):
                spice_name = f"R{spice_name}"
            self.netlist_lines.append(f"{spice_name} {n1} {n2} 1e9")
            return

        # ── Switch ────────────────────────────────────────────────────────────
        if comp_type == "switch":
            # Convert switch state to resistance: closed = 0.001Ω, open = 1e9Ω
            state = component.get("state", "open")
            resistance = 0.001 if state == "closed" else 1e9
            spice_name = f"R{comp_id}_sw"
            self.netlist_lines.append(f"{spice_name} {n1} {n2} {resistance}")
            return

        # ── Bulb ──────────────────────────────────────────────────────────────
        if comp_type == "bulb":
            # Treat bulb as a resistor
            comp_value = component.get("value", 240)
            spice_name = f"R{comp_id}"
            self.netlist_lines.append(f"{spice_name} {n1} {n2} {comp_value}")
            return

        # ── Passive / source components ───────────────────────────────────────
        spice_name = self._get_spice_name(comp_type, comp_id)
        if not spice_name:
            return

        if comp_type == "dc_source":
            line = f"{spice_name} {n1} {n2} DC {comp_value}"
        elif comp_type == "current_source":
            line = f"{spice_name} {n1} {n2} DC {comp_value}"
        elif comp_type == "resistor":
            line = f"{spice_name} {n1} {n2} {comp_value}"
        elif comp_type == "capacitor":
            line = f"{spice_name} {n1} {n2} {comp_value}"
        elif comp_type == "inductor":
            line = f"{spice_name} {n1} {n2} {comp_value}"
        else:
            return

        self.netlist_lines.append(line)

    def _get_spice_name(self, comp_type: str, comp_id: str) -> Optional[str]:
        """Return a SPICE-legal name with the correct leading letter."""
        if not comp_id:
            return None
        prefixes = {
            "dc_source":      "V",
            "current_source": "I",
            "resistor":       "R",
            "capacitor":      "C",
            "inductor":       "L",
        }
        prefix = prefixes.get(comp_type)
        if not prefix:
            return None
        return comp_id if comp_id[0].upper() == prefix else f"{prefix}{comp_id}"

    # ── Control section ───────────────────────────────────────────────────────

    def _add_control_section(self, circuit_data: Dict):
        """
        Emit .control/.endc with explicit print commands so ngspice batch mode
        always produces parseable output.

        Prints:
          • v(node) for every electrical node
          • i(Vsource) for every DC voltage source
          • i(Vsense_<id>) for every ammeter  ← current reading
          • @R<id>_vm[i] (negligible — omitted) but v(n+) and v(n-)
            are already captured by the node-voltage prints above
          • @R<id>[i] for every resistor
        """
        components = circuit_data.get("components", [])
        elec_nodes = circuit_data.get("nodes", [])

        self.netlist_lines.extend([
            "",
            "* Control section",
            ".control",
            "  op",
            "",
        ])

        # Node voltages
        for node in elec_nodes:
            self.netlist_lines.append(f"  print v({node})")

        # Source / meter currents
        for comp in components:
            ctype      = comp.get("type", "")
            comp_id    = comp.get("id", "")

            if ctype == "dc_source":
                sname = self._get_spice_name(ctype, comp_id)
                if sname:
                    self.netlist_lines.append(f"  print i({sname})")

            elif ctype == "current_source":
                sname = self._get_spice_name(ctype, comp_id)
                if sname:
                    self.netlist_lines.append(f"  print i({sname})")

            elif ctype == "ammeter":
                # Use the stored spiceName so it matches exactly what was written
                sname = comp.get("spiceName") or f"Vsense_{comp_id}"
                if not sname.upper().startswith("V"):
                    sname = f"V{sname}"
                self.netlist_lines.append(f"  print i({sname})")

            elif ctype == "resistor":
                sname = self._get_spice_name(ctype, comp_id)
                if sname:
                    self.netlist_lines.append(f"  print @{sname}[i]")

        self.netlist_lines.extend([".endc", ""])


# ── Convenience wrapper ───────────────────────────────────────────────────────

def generate_netlist(circuit_data: Dict) -> str:
    return NetlistGenerator().generate(circuit_data)


if __name__ == "__main__":
    # Quick smoke-test with a meter in the circuit
    circuit = {
        "nodes": ["n1", "n2", "n3", "0"],
        "components": [
            {"id": "V1",   "type": "dc_source",  "value": 5.0,  "nodes": ["n1", "0"]},
            {"id": "AM1",  "type": "ammeter",     "value": 0,    "nodes": ["n1", "n2"],
             "spiceName": "Vsense_AM1"},
            {"id": "R1",   "type": "resistor",    "value": 1000, "nodes": ["n2", "n3"]},
            {"id": "VM1",  "type": "voltmeter",   "value": 1e9,  "nodes": ["n2", "n3"],
             "spiceName": "RVM1_vm"},
            {"id": "R2",   "type": "resistor",    "value": 1000, "nodes": ["n3", "0"]},
        ],
        "ground": "0",
    }
    print(generate_netlist(circuit))
