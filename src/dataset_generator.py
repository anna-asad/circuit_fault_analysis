
import csv
import json
import os
import random
import re
import subprocess

# --------------------------------------------------------------------------
# Global configuration
# --------------------------------------------------------------------------

OUT_ROOT = "output"
CIRCUITS_ROOT = os.path.join(OUT_ROOT, "circuits")
MANIFEST_ALL_PATH = os.path.join(OUT_ROOT, "manifest.csv")
SAMPLES_PER_FAULT = 20
FAULT_TYPES = [
    "normal",
    "drift",
    "partial_short",
    "partial_open",
    "wrong_component_type",
    "multi_fault",
]
NGSPICE_BIN = "ngspice"  # falls back to ngspice_con if that's what's on PATH


CIRCUITS = {

    # --- Circuit 1: base series-parallel network (image not shown here,
    # original 4-resistor sample circuit) ---------------------------------
    "series_parallel_R1R2R3R4": {
        "description": (
            "in --R1-- a --R2-- b --R4-- 0, with R3 in parallel with R2 "
            "between a and b. Vin=10V DC between 'in' and '0'."
        ),
        "elements": {
            "Vin": {"type": "V", "n1": "in", "n2": "0", "value": 10},
            "R1":  {"type": "R", "n1": "in", "n2": "a", "value": 1000},
            "R2":  {"type": "R", "n1": "a",  "n2": "b", "value": 2000},
            "R3":  {"type": "R", "n1": "a",  "n2": "b", "value": 3000},
            "R4":  {"type": "R", "n1": "b",  "n2": "0", "value": 1500},
        },
    },

    # --- Circuit 2: "Figure 4: Circuit for problem 4" ---------------------
    # 3 voltage sources (10V, 15V, 20V-is-just-the-voltage-across-R5),
    # 1 current source (5A), 5 resistors, one common bottom rail (ground).
    # R1 and R5 are unknowns to *solve for* in the original problem, so
    # nominal placeholder values are assumed here (2000 ohm and 4000 ohm).
    "multisource_5R_network": {
        "description": (
            "Nodes: A (R1/10V junction), B (15V junction), C (5A/R5 "
            "junction). R1: A-0, R2: A-B, R3: A-C (top branch), R4: B-C, "
            "R5: C-0. V1=10V at A, V2=15V at B, I1=5A into C. "
            "R1 and R5 values were unknowns-to-solve in the original "
            "problem; nominal placeholders (2000, 4000 ohm) are assumed "
            "here so the network is fully defined for simulation."
        ),
        "elements": {
            "V1": {"type": "V", "n1": "A", "n2": "0", "value": 10},
            "V2": {"type": "V", "n1": "B", "n2": "0", "value": 15},
            "I1": {"type": "I", "n1": "0", "n2": "C", "value": 5},
            "R1": {"type": "R", "n1": "A", "n2": "0", "value": 2000},
            "R2": {"type": "R", "n1": "A", "n2": "B", "value": 2000},
            "R3": {"type": "R", "n1": "A", "n2": "C", "value": 1000},
            "R4": {"type": "R", "n1": "B", "n2": "C", "value": 1500},
            "R5": {"type": "R", "n1": "C", "n2": "0", "value": 4000},
        },
    },

    # --- Circuit 3: "(D)" single-resistor current-source circuit ---------
    # 12 mA source across Gx (=1/Rx). P = 60 mW dissipated in Rx is given,
    # so with all 12 mA forced through Rx (2-node circuit -> KCL),
    # Rx = P / I^2 = 0.060 / 0.012^2 = 416.666... ohm. That's used as the
    # nominal (derived, not guessed) value.
    "current_source_single_R": {
        "description": (
            "Two-node circuit: 12 mA current source in parallel with Rx. "
            "Nominal Rx derived from the given P=60mW and I=12mA via "
            "R = P / I^2 = 416.67 ohm."
        ),
        "elements": {
            "I1": {"type": "I", "n1": "0", "n2": "p", "value": 0.012},
            "Rx": {"type": "R", "n1": "p", "n2": "0",
                   "value": round(0.060 / (0.012 ** 2), 2)},
        },
    },

    # --- Circuit 4: 12k/9k voltage divider --------------------------------
    # Vs is unknown in the original problem; Vo=3V across the 9k is given.
    # Solve Vs so the *nominal* circuit reproduces Vo=3V exactly:
    #   I = Vo/R2 = 3/9000 A ;  Vs = I*(R1+R2) = 7 V
    "voltage_divider_12k_9k": {
        "description": (
            "Vs -R1(12k)- o -R2(9k)- 0, Vo = v(o) measured across R2. "
            "Vs was unknown in the original problem; nominal Vs=7V is "
            "solved so that the nominal circuit reproduces the given "
            "Vo=3V exactly."
        ),
        "elements": {
            "Vs": {"type": "V", "n1": "s", "n2": "0", "value": 7.0},
            "R1": {"type": "R", "n1": "s", "n2": "o", "value": 12000},
            "R2": {"type": "R", "n1": "o", "n2": "0", "value": 9000},
        },
    },

    # --- Circuit 5: "Figure 10: Application of KVL" -----------------------
    # Single series loop A-B-C-D-E-F-A. The figure gives the VOLTAGE DROP
    # across each resistor (not its ohm value) plus two ideal sources
    # (6V between E-F, 24V between C-D). Since it's a single series loop,
    # only the resistor ratios are fixed by the given drops -- the
    # absolute resistances are free (any common loop current reproduces
    # the same drops). A current of I=1mA is assumed and every resistor
    # is derived exactly as R = V_given / I -- NOT guessed. This is
    # fully self-consistent for ANY choice of I (verified: with
    # R_i = V_i/I, R_total = (sum V_i)/I, so required net EMF = I*R_total
    # = sum(V_i), independent of I), so the assumed 1mA is a free scaling
    # choice, not a source of error.
    # Node F is used as the ground reference (node "0"); this is an
    # arbitrary reference choice and does not affect the requested
    # differences V_DA and V_BE.
    "kvl_series_loop_ABCDEF": {
        "description": (
            "Series loop 0(F)-A-B-C-D-E-0(F). R_FA=8k (8V/1mA), "
            "R_AB=6k (6V/1mA), R_BC=12k (12V/1mA), R_DE=4k (4V/1mA) are "
            "DERIVED from the given voltage drops at an assumed 1mA loop "
            "current (exact, not guessed -- see comment above). "
            "V_CD=24V and V_EF=6V are the given ideal sources, used "
            "exactly as specified. Nominal solution reproduces the "
            "figure's answers: V_DA = -6V, V_BE = +8V."
        ),
        "elements": {
            "R_FA": {"type": "R", "n1": "0", "n2": "A", "value": 8000},
            "R_AB": {"type": "R", "n1": "A", "n2": "B", "value": 6000},
            "R_BC": {"type": "R", "n1": "B", "n2": "C", "value": 12000},
            "V_CD": {"type": "V", "n1": "C", "n2": "D", "value": 24},
            "R_DE": {"type": "R", "n1": "D", "n2": "E", "value": 4000},
            "V_EF": {"type": "V", "n1": "E", "n2": "0", "value": 6},
        },
    },

    # --- Circuit 6: "Figure 7: Application of VDR" ------------------------
    # 6k resistor, 12 mA current source, two 12k resistors, all in
    # parallel across the same two nodes.
    "vdr_parallel_network": {
        "description": (
            "4 parallel branches between nodes T and 0: R1=6k, "
            "I1=12mA current source, R2=12k, R3=12k (Io flows in R3)."
        ),
        "elements": {
            "I1": {"type": "I", "n1": "0", "n2": "T", "value": 0.012},
            "R1": {"type": "R", "n1": "T", "n2": "0", "value": 6000},
            "R2": {"type": "R", "n1": "T", "n2": "0", "value": 12000},
            "R3": {"type": "R", "n1": "T", "n2": "0", "value": 12000},
        },
    },

    # --- Circuit 7: Wheatstone bridge --------------------------------------
    # 20V source feeds a bridge: R1=100 / R2=150 (top arms), R3=200 /
    # R4=300 (bottom arms), Rg=50 bridging the two midpoints. All values
    # given directly (no unknowns to derive/assume). Balanced bridge
    # nominally (R1/R3 = R2/R4 = 0.5), so Ig ~ 0 at nominal -- a single
    # faulted arm unbalances it immediately, while some multi_fault
    # combinations can partially cancel back toward "looks normal",
    # giving a genuinely harder multi-fault case than the other circuits.
    "wheatstone_bridge": {
        "description": (
            "V1=20V between 'pos' and '0'. R1: pos-mid1(100), "
            "R3: mid1-0(200), R2: pos-mid2(150), R4: mid2-0(300), "
            "Rg: mid1-mid2(50) is the bridge/galvanometer resistor. "
            "All values given directly; nominally balanced (R1/R3=R2/R4), "
            "so Ig~0 at nominal operation."
        ),
        "elements": {
            "V1": {"type": "V", "n1": "pos", "n2": "0", "value": 20},
            "R1": {"type": "R", "n1": "pos", "n2": "mid1", "value": 100},
            "R3": {"type": "R", "n1": "mid1", "n2": "0", "value": 200},
            "R2": {"type": "R", "n1": "pos", "n2": "mid2", "value": 150},
            "R4": {"type": "R", "n1": "mid2", "n2": "0", "value": 300},
            "Rg": {"type": "R", "n1": "mid1", "n2": "mid2", "value": 50},
        },
    },

    # --- Circuit 8: 3-stage R-ladder network -------------------------------
    # 24V source drives a series-shunt-series-shunt-series ladder,
    # terminated by a load resistor. All values given directly. A fault
    # near the source (R1/R2) attenuates everything downstream; a fault
    # near the load (R5/R6) barely touches the input current -- good
    # "near vs far" multi-fault diversity.
    "r_ladder_circuit": {
        "description": (
            "Vin=24V - R1(10,series) - n1 - R2(20,shunt to 0) - "
            "R3(10,series) - n2 - R4(20,shunt to 0) - R5(10,series) - "
            "n3 - R6(20,load,shunt to 0). All values given directly."
        ),
        "elements": {
            "Vin": {"type": "V", "n1": "in", "n2": "0", "value": 24},
            "R1": {"type": "R", "n1": "in", "n2": "n1", "value": 10},
            "R2": {"type": "R", "n1": "n1", "n2": "0", "value": 20},
            "R3": {"type": "R", "n1": "n1", "n2": "n2", "value": 10},
            "R4": {"type": "R", "n1": "n2", "n2": "0", "value": 20},
            "R5": {"type": "R", "n1": "n2", "n2": "n3", "value": 10},
            "R6": {"type": "R", "n1": "n3", "n2": "0", "value": 20},
        },
    },

    # --- Circuit 9: Delta-loaded network -----------------------------------
    # 12V source into node A of a delta (Ra: A-B, Rb: B-C, Rc: C-A, all
    # 30 ohm), with node B returning to ground through a load resistor.
    # Node C is a purely internal delta node (no separate ground tap) --
    # different current-splitting topology than anything series/parallel
    # based, since current from A to B can take the direct Ra path or the
    # A-C-B path through the delta.
    "delta_loaded_network": {
        "description": (
            "Vin=12V between A and 0. Delta: Ra(A-B, 30), Rb(B-C, 30), "
            "Rc(C-A, 30). Rload(B-0, 30) provides the return path; node "
            "C is a purely internal delta node. All values given directly."
        ),
        "elements": {
            "Vin": {"type": "V", "n1": "A", "n2": "0", "value": 12},
            "Ra": {"type": "R", "n1": "A", "n2": "B", "value": 30},
            "Rb": {"type": "R", "n1": "B", "n2": "C", "value": 30},
            "Rc": {"type": "R", "n1": "C", "n2": "A", "value": 30},
            "Rload": {"type": "R", "n1": "B", "n2": "0", "value": 30},
        },
    },

    # --- Circuit 10: two-source bridge --------------------------------------
    # Two independent sources (15V, 10V) each feed one side of a bridge
    # through their own top arm, with a bridging resistor R5 between the
    # midpoints. All values given directly. Unlike the single-source
    # Wheatstone bridge above, the balance point here depends on both
    # source magnitudes as well as the resistor ratios.
    "two_source_bridge": {
        "description": (
            "V1=15V: p1-0. V2=10V: p2-0. R1: p1-mid1(100), "
            "R3: mid1-0(150). R2: p2-mid2(200), R4: mid2-0(250). "
            "R5: mid1-mid2(75) is the bridging resistor. All values "
            "given directly."
        ),
        "elements": {
            "V1": {"type": "V", "n1": "p1", "n2": "0", "value": 15},
            "V2": {"type": "V", "n1": "p2", "n2": "0", "value": 10},
            "R1": {"type": "R", "n1": "p1", "n2": "mid1", "value": 100},
            "R3": {"type": "R", "n1": "mid1", "n2": "0", "value": 150},
            "R2": {"type": "R", "n1": "p2", "n2": "mid2", "value": 200},
            "R4": {"type": "R", "n1": "mid2", "n2": "0", "value": 250},
            "R5": {"type": "R", "n1": "mid1", "n2": "mid2", "value": 75},
        },
    },

    # --- Circuit 11: resistor cube ------------------------------------------
    # Classic 12-edge, 8-node resistor cube, all edges 1 ohm, driven by
    # 12V between two diagonally opposite corners (node "0" and "n7").
    # By cube symmetry the nominal current splits into exactly 3 distinct
    # values (edges touching the source corner, "middle" edges, edges
    # touching the far corner) -- R_eq between opposite corners is the
    # well-known 5/6 ohm result, giving a built-in sanity check. Highest
    # component/node count in the dataset (12 resistors, 8 nodes) -- good
    # stress test for n_components/n_nodes scaling and for multi-fault
    # "close together" (same symmetry class) vs "far apart" placement.
    "resistor_cube": {
        "description": (
            "8-node, 12-edge unit-resistor cube (all R=1 ohm). Corner "
            "'0' (000) and corner 'n7' (111) are driven by a 12V source. "
            "Edges connect corners differing by exactly one bit: "
            "0-n1,0-n2,0-n4,n1-n3,n1-n5,n2-n3,n2-n6,n3-n7,n4-n5,n4-n6,"
            "n5-n7,n6-n7. Nominal R_eq(0,n7) = 5/6 ohm (classic result)."
        ),
        "elements": {
            "V1": {"type": "V", "n1": "n7", "n2": "0", "value": 12},
            "R1":  {"type": "R", "n1": "0",  "n2": "n1", "value": 1},
            "R2":  {"type": "R", "n1": "0",  "n2": "n2", "value": 1},
            "R3":  {"type": "R", "n1": "0",  "n2": "n4", "value": 1},
            "R4":  {"type": "R", "n1": "n1", "n2": "n3", "value": 1},
            "R5":  {"type": "R", "n1": "n1", "n2": "n5", "value": 1},
            "R6":  {"type": "R", "n1": "n2", "n2": "n3", "value": 1},
            "R7":  {"type": "R", "n1": "n2", "n2": "n6", "value": 1},
            "R8":  {"type": "R", "n1": "n3", "n2": "n7", "value": 1},
            "R9":  {"type": "R", "n1": "n4", "n2": "n5", "value": 1},
            "R10": {"type": "R", "n1": "n4", "n2": "n6", "value": 1},
            "R11": {"type": "R", "n1": "n5", "n2": "n7", "value": 1},
            "R12": {"type": "R", "n1": "n6", "n2": "n7", "value": 1},
        },
    },
}


# --------------------------------------------------------------------------
# Fault-value generators (shared across all circuits)
# --------------------------------------------------------------------------

def drift_value(nominal):
    pct = random.uniform(0.3, 0.7)
    sign = random.choice([1, -1])
    return round(nominal * (1 + sign * pct), 6)


def partial_short_value(nominal):
    return round(nominal * random.uniform(0.01, 0.15), 6)


def partial_open_value(nominal):
    return round(nominal * random.uniform(5, 50), 6)


FAULT_VALUE_FN = {
    "drift": drift_value,
    "partial_short": partial_short_value,
    "partial_open": partial_open_value,
}


# --------------------------------------------------------------------------
# Generic netlist construction
# --------------------------------------------------------------------------

def collect_nodes(elements):
    nodes = set()
    for el in elements.values():
        nodes.add(el["n1"])
        nodes.add(el["n2"])
    nodes.discard("0")
    return sorted(nodes)


def resistor_names(elements):
    return [name for name, el in elements.items() if el["type"] == "R"]


def make_netlist(circuit_name, elements, override_values, cap_swap=None):
    """Build ngspice .cir text for a circuit, given per-resistor value
    overrides and an optional resistor name to replace with a capacitor
    (wrong_component_type fault)."""
    lines = [f"{circuit_name} - fault test"]

    for name, el in elements.items():
        n1, n2 = el["n1"], el["n2"]
        etype = el["type"]
        value = override_values.get(name, el["value"])

        if etype == "R":
            if name == cap_swap:
                cname = "C" + name[1:]  # keep same suffix, force C-prefix
                lines.append(f"{cname} {n1} {n2} {value}")
            else:
                lines.append(f"{name} {n1} {n2} {value}")
        elif etype in ("V", "I"):
            lines.append(f"{name} {n1} {n2} DC {value}")
        else:
            raise ValueError(f"Unknown element type '{etype}' for {name}")

    lines.append(".op")
    lines.append(".control")
    lines.append("run")

    nodes = collect_nodes(elements)
    lines.append("print " + " ".join(f"v({n})" for n in nodes))

    r_names = resistor_names(elements)
    print_targets = " ".join(
        f"@{n.lower()}[i]" for n in r_names if n != cap_swap
    )
    if print_targets:
        lines.append(f"print {print_targets}")

    lines.append(".endc")
    lines.append(".end")
    return "\n".join(lines) + "\n"


def run_ngspice(cir_path):
    return subprocess.run(["ngspice_con", "-b", cir_path], capture_output=True, text=True)


def parse_op_output(stdout_text):
    """Extract 'name = value' pairs from ngspice's printed .op output."""
    results = {}
    for match in re.finditer(r"([\w@\[\]\.\(\)]+)\s*=\s*([-\d.eE+]+)", stdout_text):
        name, val = match.groups()
        try:
            results[name] = float(val)
        except ValueError:
            pass
    return results


# --------------------------------------------------------------------------
# Fault sample generation (generic across any circuit)
# --------------------------------------------------------------------------
def normal_value(nominal):
    pct = random.uniform(-0.02, 0.02)
    return round(nominal * (1 + pct), 6)
def make_sample(circuit_name, circuit_def, fault_type, sample_index, folder):
    elements = circuit_def["elements"]
    r_names = resistor_names(elements)

    override = {name: normal_value(elements[name]["value"]) for name in r_names}
    faulted_components = []
    cap_swap = None

    if fault_type == "normal":
        pass

    elif fault_type in ("drift", "partial_short", "partial_open"):
        target = random.choice(r_names)
        override[target] = FAULT_VALUE_FN[fault_type](elements[target]["value"])
        faulted_components.append(target)

    elif fault_type == "wrong_component_type":
        target = random.choice(r_names)
        cap_swap = target
        override[target] = round(random.uniform(1e-6, 10e-6), 8)  # farads
        faulted_components.append(target)

    elif fault_type == "multi_fault":

        if len(r_names) >= 2:
            # Two different components
            t1, t2 = random.sample(r_names, 2)

            # Two different fault types
            k1, k2 = random.sample(list(FAULT_VALUE_FN.keys()), 2)

            override[t1] = FAULT_VALUE_FN[k1](elements[t1]["value"])
            override[t2] = FAULT_VALUE_FN[k2](elements[t2]["value"])

            # New syntax
            faulted_components = [
                f"{t1}:{k1}",
                f"{t2}:{k2}"
            ]

        else:
        # Single-resistor circuits (Rx only)
            t1 = r_names[0]

            k1, k2 = random.sample(list(FAULT_VALUE_FN.keys()), 2)

            intermediate = FAULT_VALUE_FN[k1](elements[t1]["value"])
            override[t1] = FAULT_VALUE_FN[k2](intermediate)

            # New syntax
            faulted_components = [
                f"{t1}:{k1}",
                f"{t1}:{k2}"
            ]
    else:
        raise ValueError(f"Unknown fault type: {fault_type}")

    netlist_text = make_netlist(circuit_name, elements, override, cap_swap=cap_swap)
    fname = f"{fault_type}_{sample_index}.cir"
    cir_path = os.path.join(folder, fname)
    with open(cir_path, "w") as f:
        f.write(netlist_text)

    res = run_ngspice(cir_path)
    parsed = parse_op_output(res.stdout)

    nodes = collect_nodes(elements)
    # ngspice always echoes node names in lowercase in its printed output,
    # regardless of the case used in the netlist, so look up by lower().
    node_voltages = {n: parsed.get(f"v({n.lower()})") for n in nodes}
    branch_currents = {
        n: parsed.get(f"@{n.lower()}[i]") for n in r_names if n != cap_swap
    }

    success = res.returncode == 0 and all(v is not None for v in node_voltages.values())

    component_values = {name: override.get(name, elements[name]["value"]) for name in r_names}

    row = {
        "circuit_id": circuit_name,
        "sample_id": f"{circuit_name}__{fault_type}_{sample_index}",
        "fault_type": fault_type,
        "faulted_components": ";".join(faulted_components) if faulted_components else "",
        "component_values": json.dumps(component_values),
        "node_voltages": json.dumps(node_voltages),
        "branch_currents": json.dumps(branch_currents),
        "success": success,
    }
    return row


# --------------------------------------------------------------------------
# Main driver
# --------------------------------------------------------------------------

def main():
    os.makedirs(CIRCUITS_ROOT, exist_ok=True)
    all_rows = []

    for circuit_name, circuit_def in CIRCUITS.items():
        circuit_folder = os.path.join(CIRCUITS_ROOT, circuit_name)
        os.makedirs(circuit_folder, exist_ok=True)

        for fault_type in FAULT_TYPES:
            for i in range(1, SAMPLES_PER_FAULT + 1):
                row = make_sample(circuit_name, circuit_def, fault_type, i, circuit_folder)
                all_rows.append(row)
                print(f"{row['sample_id']:55s} success={row['success']}")

        print(f"  -> done with {circuit_name}\n")

    # combined manifest across all circuits
    with open(MANIFEST_ALL_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=all_rows[0].keys())
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"\nTotal samples across {len(CIRCUITS)} circuits: {len(all_rows)} -> {MANIFEST_ALL_PATH}")


if __name__ == "__main__":
    main()