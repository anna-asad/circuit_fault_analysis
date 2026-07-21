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
        """Ammeter must be in series: its terminals must have no parallel non-ground path."""
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
            ammeter_nodes   = set(nodes)

            # Direct parallel: another component shares exactly the same two nodes
            parallel = [
                c.get("id", "?") for c in all_comps
                if c is not ammeter
                and c.get("type") != "voltmeter"
                and len(c.get("nodes", [])) >= 2
                and set(c.get("nodes", [])[:2]) == ammeter_nodes
            ]
            if parallel:
                self.faults.append(
                    f"Ammeter {aid} must be connected in series, not in parallel. "
                    f"It shares nodes ({n_plus}, {n_minus}) with {', '.join(parallel)}."
                )
                continue

            # Indirect parallel: non-ground path exists without the ammeter
            uf = UnionFind()
            for node in circuit_data.get("nodes", []):
                uf.make_set(node)
            for comp in all_comps:
                if comp is ammeter:
                    continue
                comp_nodes = comp.get("nodes", [])
                if ground in comp_nodes:
                    continue
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])
            if uf.connected(n_plus, n_minus):
                self.faults.append(
                    f"Ammeter {aid} must be connected in series, not in parallel. "
                    f"Its terminals ({n_plus}, {n_minus}) are already connected through other components."
                )

    def _check_voltmeter_placement(self, circuit_data: Dict):
        """Voltmeter must be in parallel: its terminals must be reachable without it."""
        all_comps = circuit_data.get("components", [])
        ground    = circuit_data.get("ground", "0")

        for vm in all_comps:
            if vm.get("type") != "voltmeter":
                continue
            vid   = vm.get("id", "voltmeter")
            nodes = vm.get("nodes", [])
            if len(nodes) < 2:
                continue
            n_plus, n_minus = nodes[0], nodes[1]
            conductors      = [c for c in all_comps if c is not vm and c.get("type") != "voltmeter"]
            vm_nodes        = {n_plus, n_minus}

            # Direct bridge: a single component connects the same two nodes
            if any(set(c.get("nodes", [])[:2]) == vm_nodes for c in conductors):
                continue

            # Indirect parallel: non-ground path connects terminals without voltmeter
            uf = UnionFind()
            for node in circuit_data.get("nodes", []):
                uf.make_set(node)
            for comp in conductors:
                comp_nodes = comp.get("nodes", [])
                if ground in comp_nodes:
                    continue
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])
            if uf.connected(n_plus, n_minus):
                continue

            self.faults.append(
                f"Voltmeter {vid} must be connected in parallel, not in series. "
                f"Its terminals ({n_plus}, {n_minus}) have no other conducting path — "
                f"the voltmeter is the only bridge, blocking current flow."
            )

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
