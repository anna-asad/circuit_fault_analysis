"""
Structural Fault Detector
=========================
Uses union-find connectivity analysis to detect wiring faults.

Meter validation logic
──────────────────────
Ammeter (in-parallel check)
  An ammeter is in series when removing it disconnects the circuit — i.e. its
  two terminals are NOT already connected through any other path.
  It is in parallel when the two terminals ARE connected through another path
  (meaning current can bypass the ammeter, making the reading wrong and
  potentially creating a near-short).

Voltmeter (in-series check)
  A voltmeter is in parallel when its two terminals are already connected
  through the rest of the circuit (so it just "reads" across those nodes).
  It is in series when removing it would break the circuit — i.e. its
  terminals have NO other path between them.  This blocks current flow.
"""

from typing import Dict, List, Set, Tuple, Optional


# ── Union-Find ────────────────────────────────────────────────────────────────

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
        if self.rank[rx] < self.rank[ry]:
            self.parent[rx] = ry
        elif self.rank[rx] > self.rank[ry]:
            self.parent[ry] = rx
        else:
            self.parent[ry] = rx
            self.rank[rx] += 1

    def connected(self, x, y) -> bool:
        return self.find(x) == self.find(y)

    def get_components(self) -> List[Set]:
        groups: Dict = {}
        for node in self.parent:
            root = self.find(node)
            groups.setdefault(root, set()).add(node)
        return list(groups.values())


def _build_uf_excluding(circuit_data: Dict,
                         exclude_types: Tuple[str, ...] = ()) -> UnionFind:
    """
    Build a UnionFind over electrical nodes, connecting them through every
    component whose type is NOT in *exclude_types*.
    """
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


# ── Main detector ─────────────────────────────────────────────────────────────

class StructuralFaultDetector:

    def __init__(self):
        self.faults: List[str] = []

    def detect_faults(self, circuit_data: Dict, simulation_result: Dict) -> List[str]:
        self.faults = []

        self._check_missing_ground(circuit_data)
        self._check_open_circuits(circuit_data)
        self._check_short_circuits(circuit_data, simulation_result)
        self._check_ammeter_placement(circuit_data)
        self._check_voltmeter_placement(circuit_data)
        self._check_component_bypasses(circuit_data)
        self._check_reversed_polarity(circuit_data)

        return self.faults

    # ── Ground ────────────────────────────────────────────────────────────────

    def _check_missing_ground(self, circuit_data: Dict):
        ground = circuit_data.get("ground", "0")
        nodes  = circuit_data.get("nodes", [])
        comps  = circuit_data.get("components", [])

        if ground not in nodes:
            self.faults.append(
                f"Missing ground reference: node '{ground}' not found in circuit."
            )
            return

        if not any(ground in c.get("nodes", []) for c in comps):
            self.faults.append(
                f"Missing ground reference: no component is connected to ground node '{ground}'."
            )

    # ── Open circuits ─────────────────────────────────────────────────────────

    def _check_open_circuits(self, circuit_data: Dict):
        """
        Connectivity check excluding voltmeters (they don't conduct DC current).
        Every node must be reachable from ground.
        """
        uf     = _build_uf_excluding(circuit_data, exclude_types=("voltmeter",))
        ground = circuit_data.get("ground", "0")

        # Find the union-find root that represents the ground group.
        # Use the root (not a set object) for comparison so the identity check
        # is stable across multiple calls to get_components().
        ground_root = uf.find(ground)

        for group in uf.get_components():
            # Skip the ground-connected group entirely.
            if ground in group:
                continue
            if not group:
                continue
            # Also strip the ground node itself from the message just in case
            # it leaked in via an edge-case (e.g. ground not yet initialised).
            disconnected = sorted(n for n in group if n != ground)
            if disconnected:
                self.faults.append(
                    f"Open circuit / broken wire: node(s) {', '.join(disconnected)} "
                    f"have no conducting path to ground."
                )

        for comp in circuit_data.get("components", []):
            if comp.get("type") in ("dc_source", "current_source"):
                if not all(uf.connected(n, ground) for n in comp.get("nodes", [])):
                    self.faults.append(
                        f"Open circuit: source {comp['id']} is not connected to ground."
                    )

    # ── Short circuits ────────────────────────────────────────────────────────

    def _check_short_circuits(self, circuit_data: Dict, simulation_result: Dict):
        if not simulation_result or not simulation_result.get("success"):
            return

        voltages   = simulation_result.get("voltages", {})
        currents   = simulation_result.get("currents", {})
        max_current = max((abs(v) for v in currents.values()), default=0.0)

        for src, current in currents.items():
            comp = next(
                (c for c in circuit_data.get("components", []) if c.get("id") == src),
                None,
            )
            if comp and comp.get("type") == "current_source":
                continue
            if not comp or comp.get("type") != "dc_source":
                continue
            if abs(current) > 1.0:
                self.faults.append(
                    f"Short circuit: excessive current through {src} "
                    f"({abs(current):.3f} A) — likely an unintended direct connection."
                )

        for comp in circuit_data.get("components", []):
            ctype, cid = comp.get("type"), comp.get("id")
            ns = comp.get("nodes", [])
            if ctype in ("resistor", "capacitor", "inductor") and len(ns) == 2:
                v1, v2 = voltages.get(ns[0], 0), voltages.get(ns[1], 0)
                vdrop  = abs(v1 - v2)
                if ctype == "resistor" and vdrop < 0.01 and max_current > 0.01:
                    self.faults.append(
                        f"Short circuit across {cid}: voltage collapsed to "
                        f"~{vdrop:.4f} V — component may be shorted or bypassed."
                    )

            if ctype == "dc_source" and len(ns) == 2:
                v1, v2   = voltages.get(ns[0], 0), voltages.get(ns[1], 0)
                vout     = abs(v1 - v2)
                expected = comp.get("value", 0)
                if expected > 0 and vout < expected * 0.1 and max_current > 0.01:
                    self.faults.append(
                        f"Short circuit: source {cid} output collapsed "
                        f"(expected {expected:.2f} V, got {vout:.4f} V)."
                    )

    # ── Ammeter placement ─────────────────────────────────────────────────────

    def _check_ammeter_placement(self, circuit_data: Dict):
        """
        An ammeter must be in SERIES, meaning it is the ONLY conducting path
        between its two terminals.

        Detection logic
        ───────────────
        1. First check: if ANY other component shares exactly the same two nodes
           as the ammeter, it's in parallel (simplest case).
        
        2. Second check: Build a UF excluding the ammeter and ground-touching
           components. If the terminals are still connected, there's a parallel
           non-ground path.
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
            ammeter_node_set = set(nodes)

            # ── Check 1: Direct parallel (same two nodes) ─────────────────────
            # If any other component connects exactly the same two nodes, it's
            # definitely in parallel, regardless of whether ground is involved.
            parallel_comps = [
                c.get("id", "?") for c in all_comps
                if c is not ammeter
                and c.get("type") != "voltmeter"  # voltmeters don't conduct DC
                and len(c.get("nodes", [])) >= 2
                and set(c.get("nodes", [])[:2]) == ammeter_node_set
            ]
            
            if parallel_comps:
                self.faults.append(
                    f"Ammeter {aid} must be connected in series, not in parallel. "
                    f"It shares the exact same connection points ({n_plus}, {n_minus}) "
                    f"as {', '.join(parallel_comps)}. The ammeter is being bypassed. "
                    f"Break the wire at one point and insert the ammeter in series."
                )
                continue  # Already found the fault, skip the UF check

            # ── Check 2: Indirect parallel (through non-ground paths) ─────────
            # Build connectivity WITHOUT:
            #   1. This ammeter itself
            #   2. Any component that touches ground (they all share the ground
            #      bus, which would make every pair of nodes look "connected")
            uf = UnionFind()
            for node in circuit_data.get("nodes", []):
                uf.make_set(node)

            for comp in all_comps:
                if comp is ammeter:
                    continue
                comp_nodes = comp.get("nodes", [])
                # Skip components that connect through ground — those create a
                # common ground bus that connects everything and produces false
                # positives for the parallel check.
                if ground in comp_nodes:
                    continue
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])

            if uf.connected(n_plus, n_minus):
                # There is a non-ground parallel path bypassing the ammeter
                self.faults.append(
                    f"Ammeter {aid} must be connected in series, not in parallel. "
                    f"Its terminals ({n_plus}, {n_minus}) are already connected "
                    f"through other components, so the ammeter is being bypassed. "
                    f"Break the wire at that point and insert the ammeter in series."
                )

    # ── Voltmeter placement ───────────────────────────────────────────────────

    def _check_voltmeter_placement(self, circuit_data: Dict):
        """
        A voltmeter must be in PARALLEL across an existing conducting path.

        Test: remove this voltmeter (and all other voltmeters) from the graph,
        then check if the voltmeter's two terminals are still connected through
        a path that does NOT use the ground bus.

        Why exclude ground-connected components
        ────────────────────────────────────────
        Every properly grounded circuit has all nodes reachable from ground,
        so including ground-connected components makes every pair of nodes look
        "connected" via the ground bus — producing false negatives for a series
        voltmeter (VM1(n1,n2) with V1(n1,0) and R1(n2,0) would show n1↔0↔n2
        and pass even though the voltmeter is the only direct n1↔n2 path).

        Instead we build a graph of ONLY non-ground-touching components
        (excluding the voltmeter under test and all other voltmeters).  If n+
        and n− are connected in that reduced graph, there is a genuine direct
        parallel path between them → correct placement.  If not → series fault.

        Special case: if one terminal IS ground ('0'), the other terminal must
        be reachable from some component that also touches ground — i.e. there
        must be another component sharing the ground terminal on one side and
        the non-ground terminal on the other.  We handle this by checking if
        any single non-voltmeter component directly bridges (n_plus, n_minus).
        """
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

            # Collect conducting components (exclude all voltmeters)
            conductors = [
                c for c in all_comps
                if c is not vm and c.get("type") != "voltmeter"
            ]

            # ── Direct bridge check ───────────────────────────────────────────
            # Is there any single component that directly connects n_plus to n_minus?
            # This covers the common case: VM across a resistor, or VM across a
            # source, including when one terminal is ground.
            vm_node_set = {n_plus, n_minus}
            direct_bridge = any(
                set(c.get("nodes", [])[:2]) == vm_node_set
                for c in conductors
            )
            if direct_bridge:
                continue  # Correctly placed — no fault

            # ── Indirect parallel path check (non-ground paths only) ──────────
            # Build a UF excluding any component that touches ground.
            # This removes the ground bus and leaves only direct component-to-
            # component links.
            uf = UnionFind()
            for node in circuit_data.get("nodes", []):
                uf.make_set(node)

            for comp in conductors:
                comp_nodes = comp.get("nodes", [])
                if ground in comp_nodes:
                    continue          # skip ground-touching components
                if len(comp_nodes) >= 2:
                    uf.union(comp_nodes[0], comp_nodes[1])

            if uf.connected(n_plus, n_minus):
                continue  # There is a non-ground parallel path → correct

            # Neither a direct bridge nor an indirect non-ground path exists.
            # The voltmeter is in series.
            self.faults.append(
                f"Voltmeter {vid} must be connected in parallel, not in series. "
                f"Its terminals ({n_plus}, {n_minus}) have no other conducting path "
                f"between them — the voltmeter is the only bridge, which blocks "
                f"current flow. Connect it across an existing component or node pair."
            )

    # ── Component bypasses ────────────────────────────────────────────────────

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
                    f"Component bypass: {cid} is bypassed by {', '.join(bypass)} "
                    f"— unintended parallel connection shorts it out."
                )

    # ── Reversed polarity ─────────────────────────────────────────────────────

    def _check_reversed_polarity(self, circuit_data: Dict):
        ground = circuit_data.get("ground", "0")
        for comp in circuit_data.get("components", []):
            if comp.get("type") != "dc_source":
                continue
            ns = comp.get("nodes", [])
            if len(ns) >= 2 and ns[0] == ground:
                self.faults.append(
                    f"Reversed polarity: {comp['id']} positive terminal is connected "
                    f"to ground — the source is wired backwards."
                )


# ── Convenience wrapper ───────────────────────────────────────────────────────

def detect_structural_faults(circuit_data: Dict,
                              simulation_result: Dict = None) -> List[str]:
    return StructuralFaultDetector().detect_faults(
        circuit_data, simulation_result or {}
    )


if __name__ == "__main__":
    print("Structural Fault Detector — import and call detect_structural_faults().")
