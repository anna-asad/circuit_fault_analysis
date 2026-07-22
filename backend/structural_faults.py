"""Structural fault detection using union-find connectivity analysis."""

from typing import Dict, List, Set, Tuple, Optional


class UnionFind:
    def __init__(self):
        self.parent: Dict = {}
        self.rank:   Dict = {}

    def make_set(self, x):
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x]   = 0

    def find(self, x):
        if x not in self.parent:
            self.make_set(x)
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self.rank[rx] < self.rank[ry]:   self.parent[rx] = ry
        elif self.rank[rx] > self.rank[ry]: self.parent[ry] = rx
        else:
            self.parent[ry] = rx
            self.rank[rx] += 1

    def connected(self, x, y) -> bool:
        return self.find(x) == self.find(y)

    def get_components(self) -> List[Set]:
        groups: Dict = {}
        for node in self.parent:
            groups.setdefault(self.find(node), set()).add(node)
        return list(groups.values())


def _build_uf_excluding(circuit_data: Dict, exclude_types: Tuple[str, ...] = ()) -> UnionFind:
    uf = UnionFind()
    for node in circuit_data.get("nodes", []):
        uf.make_set(node)
    for comp in circuit_data.get("components", []):
        if comp.get("type") in exclude_types:
            continue
        ns = comp.get("nodes", [])
        if len(ns) >= 2:
            uf.union(ns[0], ns[1])
    return uf


def _get_single_pin_nodes(circuit_data: Dict) -> Set[str]:
    single_pin_nodes: Set[str] = set()
    for comp in circuit_data.get("components", []):
        ns = comp.get("nodes", [])
        if len(ns) == 1:
            single_pin_nodes.add(ns[0])
    return single_pin_nodes


class StructuralFaultDetector:

    def __init__(self):
        self.faults: List[str] = []

    def detect_faults(self, circuit_data: Dict, simulation_result: Dict) -> List[str]:
        self.faults = []
        self._check_missing_ground(circuit_data)
        self._check_unconnected_component_terminals(circuit_data)
        self._check_open_circuits(circuit_data)
        self._check_short_circuits(circuit_data, simulation_result)
        self._check_ammeter_placement(circuit_data)
        self._check_voltmeter_placement(circuit_data)
        self._check_component_bypasses(circuit_data)
        self._check_reversed_polarity(circuit_data, simulation_result)
        return self.faults

    def _check_missing_ground(self, circuit_data: Dict):
        ground = circuit_data.get("ground", "0")
        nodes  = circuit_data.get("nodes", [])
        comps  = circuit_data.get("components", [])
        if ground not in nodes:
            self.faults.append(f"Missing ground reference: node '{ground}' not found.")
            return
        if not any(ground in c.get("nodes", []) for c in comps):
            self.faults.append(f"Missing ground reference: no component connected to '{ground}'.")

    def _check_open_circuits(self, circuit_data: Dict):
        uf     = _build_uf_excluding(circuit_data, exclude_types=("voltmeter",))
        ground = circuit_data.get("ground", "0")
        single_pin_nodes = _get_single_pin_nodes(circuit_data)
        for group in uf.get_components():
            if ground in group:
                continue
            disconnected = sorted(n for n in group if n != ground)
            if disconnected and all(node in single_pin_nodes for node in disconnected):
                continue
            if disconnected:
                self.faults.append(
                    f"Open circuit / broken wire: node(s) {', '.join(disconnected)} "
                    f"have no conducting path to ground."
                )
        for comp in circuit_data.get("components", []):
            if comp.get("type") in ("dc_source", "current_source"):
                if not all(uf.connected(n, ground) for n in comp.get("nodes", [])):
                    self.faults.append(f"Open circuit: source {comp['id']} is not connected to ground.")

    def _check_unconnected_component_terminals(self, circuit_data: Dict):
        for comp in circuit_data.get("components", []):
            ctype = comp.get("type")
            nodes = comp.get("nodes", [])
            if ctype in ("dc_source", "current_source", "resistor", "capacitor", "inductor") and len(nodes) == 1:
                self.faults.append(
                    f"Open circuit: {comp.get('id', 'component')} has an unconnected terminal."
                )

    def _check_short_circuits(self, circuit_data: Dict, simulation_result: Dict):
        if not simulation_result or not simulation_result.get("success"):
            return
        voltages    = simulation_result.get("voltages", {})
        currents    = simulation_result.get("currents", {})
        max_current = max((abs(v) for v in currents.values()), default=0.0)

        for src, current in currents.items():
            comp = next((c for c in circuit_data.get("components", []) if c.get("id") == src), None)
            if not comp or comp.get("type") != "dc_source":
                continue
            if abs(current) > 1.0:
                self.faults.append(
                    f"Short circuit: excessive current through {src} ({abs(current):.3f} A)."
                )

        for comp in circuit_data.get("components", []):
            ctype, cid = comp.get("type"), comp.get("id")
            ns = comp.get("nodes", [])
            if ctype == "resistor" and len(ns) == 2:
                vdrop = abs(voltages.get(ns[0], 0) - voltages.get(ns[1], 0))
                if vdrop < 0.01 and max_current > 0.01:
                    self.faults.append(
                        f"Short circuit across {cid}: voltage collapsed to ~{vdrop:.4f} V."
                    )
            if ctype == "dc_source" and len(ns) == 2:
                vout     = abs(voltages.get(ns[0], 0) - voltages.get(ns[1], 0))
                expected = comp.get("value", 0)
                if expected > 0 and vout < expected * 0.1 and max_current > 0.01:
                    self.faults.append(
                        f"Short circuit: source {cid} output collapsed "
                        f"(expected {expected:.2f} V, got {vout:.4f} V)."
                    )

    def _check_ammeter_placement(self, circuit_data: Dict):
        """
        Ammeter validation rules:
        1. If directly across voltage source with no load → Short circuit
        2. If not part of any closed loop → Open circuit
        3. If in series with current source → VALID (measures current source output)
        """
        all_comps = circuit_data.get("components", [])
        ground    = circuit_data.get("ground", "0")

        for ammeter in all_comps:
            if ammeter.get("type") != "ammeter":
                continue
            aid   = ammeter.get("id", "ammeter")
            nodes = ammeter.get("nodes", [])
            if len(nodes) < 2:
                continue
            n_plus, n_minus = nodes[0], nodes[1]

            # Build loop WITHOUT ammeter to check what exists
            uf = UnionFind()
            for node in circuit_data.get("nodes", []):
                uf.make_set(node)
            
            voltage_sources = []
            current_sources = []
            has_load = False
            
            for comp in all_comps:
                if comp is ammeter or comp.get("type") == "voltmeter":
                    continue
                comp_nodes = comp.get("nodes", [])
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])
                    
                    # Track what's connected to ammeter terminals
                    if n_plus in comp_nodes or n_minus in comp_nodes:
                        if comp.get("type") == "dc_source":
                            voltage_sources.append(comp.get("id"))
                        elif comp.get("type") == "current_source":
                            current_sources.append(comp.get("id"))
                        elif comp.get("type") in ("resistor", "capacitor", "inductor"):
                            has_load = True
            
            # Check if terminals form closed loop without ammeter
            terminals_connected_without_ammeter = uf.connected(n_plus, n_minus)
            both_connected_to_ground = uf.connected(n_plus, ground) and uf.connected(n_minus, ground)
            
            # Rule 3: Ammeter with current source is VALID
            if current_sources:
                continue
            
            # Rule 1: Ammeter directly across voltage source forms short if no load
            # DEBUG: Print what we found
            print(f"DEBUG ammeter {aid}: vsources={voltage_sources}, connected={terminals_connected_without_ammeter}, has_load={has_load}")
            
            if voltage_sources and terminals_connected_without_ammeter and not has_load:
                self.faults.append(
                    f"Short circuit: ammeter {aid} across voltage source with no load."
                )
                continue
            
            # Rule 2: Ammeter must be in a closed loop
            if not both_connected_to_ground:
                self.faults.append(
                    f"Open circuit: ammeter {aid} not part of a closed loop."
                )

    def _check_voltmeter_placement(self, circuit_data: Dict):
        """
        Voltmeter validation rules:
        1. Both terminals must connect to valid nodes → otherwise floating error
        2. If across current source with no other current path → open circuit error  
        3. If in series (only bridge between source and ground) → series error
        """
        all_comps = circuit_data.get("components", [])
        ground    = circuit_data.get("ground", "0")
        all_nodes = set(circuit_data.get("nodes", []))

        for vm in all_comps:
            if vm.get("type") != "voltmeter":
                continue
            vid   = vm.get("id", "voltmeter")
            nodes = vm.get("nodes", [])
            
            # Rule 1: Check for floating terminals
            if len(nodes) < 2:
                self.faults.append(
                    f"Floating voltmeter: {vid} does not have both terminals connected."
                )
                continue
            
            n_plus, n_minus = nodes[0], nodes[1]
            
            if n_plus not in all_nodes or n_minus not in all_nodes:
                self.faults.append(
                    f"Floating voltmeter: {vid} terminal(s) not connected."
                )
                continue
            
            # Build connectivity WITHOUT voltmeter
            uf = UnionFind()
            for node in all_nodes:
                uf.make_set(node)
            
            current_sources_in_path = []
            voltage_sources_in_path = []
            
            for comp in all_comps:
                if comp is vm or comp.get("type") == "voltmeter":
                    continue
                comp_nodes = comp.get("nodes", [])
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])
                    
                    # Check if this component connects to voltmeter terminals
                    if n_plus in comp_nodes or n_minus in comp_nodes:
                        if comp.get("type") == "current_source":
                            current_sources_in_path.append(comp.get("id"))
                        elif comp.get("type") == "dc_source":
                            voltage_sources_in_path.append(comp.get("id"))
            
            terminals_connected_without_vm = uf.connected(n_plus, n_minus)
            
            # DEBUG
            print(f"DEBUG voltmeter {vid}: vsources={voltage_sources_in_path}, isources={current_sources_in_path}, connected={terminals_connected_without_vm}")
            
            # Rule 2: Current source blocked by voltmeter
            if current_sources_in_path and not terminals_connected_without_vm:
                self.faults.append(
                    f"Open circuit: current source has no path to flow (voltmeter {vid} blocks it)."
                )
                continue
            
            # Rule 3: Voltmeter in series (breaks the circuit path)
            # If terminals NOT connected without voltmeter AND there's a source in the path
            if not terminals_connected_without_vm:
                if voltage_sources_in_path or current_sources_in_path:
                    self.faults.append(
                        f"Voltmeter {vid} must be connected in parallel, not in series."
                    )
                    continue

    def _check_component_bypasses(self, circuit_data: Dict):
        comps = circuit_data.get("components", [])
        for comp in comps:
            ctype, cid = comp.get("type"), comp.get("id")
            if ctype not in ("resistor", "capacitor", "inductor"):
                continue
            nodes = set(comp.get("nodes", []))
            bypass = [
                c.get("id") for c in comps
                if c is not comp
                and set(c.get("nodes", [])) == nodes
                and c.get("type") == "resistor"
                and c.get("value", float("inf")) < 1
            ]
            if bypass:
                self.faults.append(
                    f"Component bypass: {cid} is shorted by {', '.join(bypass)}."
                )

    def _check_reversed_polarity(self, circuit_data: Dict, simulation_result: Dict):
        """Flag a DC source whose measured terminal voltage sign contradicts its rated value."""
        voltages = (simulation_result or {}).get("voltages", {})
        if not voltages:
            return
        for comp in circuit_data.get("components", []):
            if comp.get("type") != "dc_source":
                continue
            ns    = comp.get("nodes", [])
            rated = comp.get("value", 0)
            if len(ns) < 2 or rated == 0:
                continue
            v_pos, v_neg = voltages.get(ns[0]), voltages.get(ns[1])
            if v_pos is None or v_neg is None:
                continue
            measured = v_pos - v_neg
            if (rated > 0 and measured < -0.01 * abs(rated)) or \
               (rated < 0 and measured > -0.01 * abs(rated)):
                self.faults.append(
                    f"Reversed polarity: {comp['id']} rated {rated} V but measured "
                    f"{measured:.4f} V — source may be wired backwards."
                )


def detect_structural_faults(circuit_data: Dict, simulation_result: Dict = None) -> List[str]:
    return StructuralFaultDetector().detect_faults(circuit_data, simulation_result or {})
