
import json
import numpy as np
import pandas as pd
import joblib

MODEL_PATH = "models/fault_classifier.joblib"
FEATURES_PATH = "models/feature_columns.joblib"
LABELS_PATH = "models/label_columns.joblib"
NOMINAL_LOOKUP_PATH = "models/nominal_lookup.joblib"

THRESHOLD = 0.5

clf = joblib.load(MODEL_PATH)
feature_columns = joblib.load(FEATURES_PATH)
label_columns = joblib.load(LABELS_PATH)          # ["drift", "partial_short", "partial_open", "wrong_component_type"]
nominal_lookup = joblib.load(NOMINAL_LOOKUP_PATH)

# --------------------------------------------------------------------------
# IMPORTANT: nominal_lookup is keyed purely by *which component names*
# appear together (frozenset of names) -- not by their values. Your
# training manifest already has circuit families literally named
# R1/R2/R3/R4 (series_parallel_R1R2R3R4, nominal ~1000/2000/3000/1500 Ohm)
# and R1..R5 (multisource_5R_network, nominal ~2000/2000/1000/1500/4000
# Ohm). These two textbook circuits reuse generic resistor labels too,
# but at totally different Ohm scales, so if we kept the names R1-R4 /
# R1-R5 every deviation feature would be computed against the WRONG
# baseline (someone else's nominal values), making even the "normal"
# rows look badly faulted.
#
# Fix: use component names unique to these circuits (RA1..RA4, RB1..RB5)
# so they get their own frozenset key, and seed that key's nominal
# values here from the textbook's own normal solution. This does not
# require retraining -- it's the same thing build_nominal_lookup() would
# have produced if these circuits' normal rows had been in the manifest.
nominal_lookup[frozenset(["RA1", "RA2", "RA3", "RA4"])] = {
    "RA1": 4.0, "RA2": 3.0, "RA3": 6.0, "RA4": 18.0,
}
nominal_lookup[frozenset(["RB1", "RB2", "RB3", "RB4", "RB5"])] = {
    "RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 6.0, "RB5": 10.0,
}
nominal_lookup[frozenset(["RC1", "RC2", "RC3", "RC4", "RC5"])] = {
    "RC1": 1.0, "RC2": 15.0, "RC3": 10.0, "RC4": 40.0, "RC5": 50.0,
}
nominal_lookup[frozenset(["RD1", "RD2", "RD3"])] = {
    "RD1": 5.0, "RD2": 10.0, "RD3": 40.0,
}


# --------------------------------------------------------------------------
# Same feature extraction used at train time -- must stay in lockstep with
# train_model.py's extract_features(), including the nominal-deviation
# features, or the model will get garbage input.
# --------------------------------------------------------------------------
def extract_features(row):
    comps_dict = json.loads(row["component_values"])
    comps = list(comps_dict.values())
    volts = list(json.loads(row["node_voltages"]).values())
    currs = list(json.loads(row["branch_currents"]).values())

    key = frozenset(comps_dict.keys())
    nominal = nominal_lookup.get(key, {})
    deviations = []
    for name, val in comps_dict.items():
        nom = nominal.get(name)
        if nom:
            deviations.append(abs(val - nom) / nom)

    deviations_sorted = sorted(deviations, reverse=True)
    max_dev = deviations_sorted[0] if deviations_sorted else 0
    second_dev = deviations_sorted[1] if len(deviations_sorted) > 1 else 0
    dev_ratio = (second_dev / max_dev) if max_dev > 0 else 0
    n_dev_over_20pct = sum(d > 0.20 for d in deviations)

    return pd.Series({
        "n_components": len(comps),
        "comp_mean": np.mean(comps) if comps else 0,
        "comp_max": np.max(comps) if comps else 0,
        "comp_min": np.min(comps) if comps else 0,
        "comp_std": np.std(comps) if comps else 0,
        "n_nodes": len(volts),
        "volt_mean": np.mean(volts) if volts else 0,
        "volt_max": np.max(volts) if volts else 0,
        "volt_min": np.min(volts) if volts else 0,
        "n_currents": len(currs),
        "curr_mean_abs": np.mean(np.abs(currs)) if currs else 0,
        "curr_max_abs": np.max(np.abs(currs)) if currs else 0,
        "n_missing_currents": len(comps) - len(currs),
        "max_deviation_ratio": max_dev,
        "second_deviation_ratio": second_dev,
        "deviation_ratio_2nd_over_1st": dev_ratio,
        "n_components_deviated_over_20pct": n_dev_over_20pct,
    })


def predict_one(sample, threshold=THRESHOLD):
    """
    Returns:
        overall_pred : str  -- collapsed prediction ("normal", one of the
                                4 fault names, or "multi_fault")
        label_probs  : dict -- {label_name: probability_of_yes}
    """
    row = pd.Series(sample)
    features = extract_features(row)
    X_new = pd.DataFrame([features]).reindex(columns=feature_columns, fill_value=0)

    proba_per_label = clf.predict_proba(X_new)

    label_probs = {}
    for i, label in enumerate(label_columns):
        classes = clf.classes_[i] if hasattr(clf, "estimators_") else [0, 1]
        arr = proba_per_label[i][0]
        if 1 in list(classes):
            yes_idx = list(classes).index(1)
            p_yes = arr[yes_idx]
        else:
            p_yes = 0.0
        label_probs[label] = float(p_yes)

    fired = [label for label, p in label_probs.items() if p >= threshold]

    if len(fired) == 0:
        overall_pred = "normal"
    elif len(fired) == 1:
        overall_pred = fired[0]
    else:
        overall_pred = "multi_fault"

    return overall_pred, label_probs


TEST_CASES = [
    # ===== Circuit A: Example 3.1 / Fig. 3.9 (Problems 3.1-3.2), p.60-61 =====
    # 120V -> RA1(4) -> x -> { RA4(18) || [RA2(3)+RA3(6)] } -> y(gnd). RA3 faulted.
    {"expected": "normal",
     "component_values": '{"RA1": 4.0, "RA2": 3.0, "RA3": 6.0, "RA4": 18.0}',
     "node_voltages": '{"s": 120.0, "x": 72.0, "z": 48.0, "y": 0.0}',
     "branch_currents": '{"RA1": 12.0, "RA2": 8.0, "RA3": 8.0, "RA4": 4.0}'},
    {"expected": "drift",
     "component_values": '{"RA1": 4.0, "RA2": 3.0, "RA3": 8.4, "RA4": 18.0}',
     "node_voltages": '{"s": 120.0, "x": 76.282528, "z": 56.208178, "y": 0.0}',
     "branch_currents": '{"RA1": 10.929368, "RA2": 6.69145, "RA3": 6.69145, "RA4": 4.237918}'},
    {"expected": "partial_short",
     "component_values": '{"RA1": 4.0, "RA2": 3.0, "RA3": 0.9, "RA4": 18.0}',
     "node_voltages": '{"s": 120.0, "x": 53.38403, "z": 12.319392, "y": 0.0}',
     "branch_currents": '{"RA1": 16.653992, "RA2": 13.688213, "RA3": 13.688213, "RA4": 2.965779}'},
    {"expected": "partial_open",
     "component_values": '{"RA1": 4.0, "RA2": 3.0, "RA3": 300.0, "RA4": 18.0}',
     "node_voltages": '{"s": 120.0, "x": 97.13268, "z": 96.170971, "y": 0.0}',
     "branch_currents": '{"RA1": 5.71683, "RA2": 0.32057, "RA3": 0.32057, "RA4": 5.39626}'},
    {"expected": "wrong_component_type",
     "component_values": '{"RA1": 4.0, "RA2": 3.0, "RA3": 4.7e-06, "RA4": 18.0}',
     "node_voltages": '{"s": 120.0, "x": 98.181818, "z": 98.181818, "y": 0.0}',
     "branch_currents": '{"RA1": 5.454545, "RA2": 0.0, "RA4": 5.454545}'},

    # ===== Circuit B: Assessment Problem 3.1, p.61 =====
    # 5A source at A (shunt RB1=30) -> RB2(7.2) -> B (shunt RB3=64)
    #   -> RB4(6) -> C (shunt RB5=10). RB4 faulted.
    {"expected": "normal",
     "component_values": '{"RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 6.0, "RB5": 10.0}',
     "node_voltages": '{"A": 60.0, "B": 38.4, "C": 24.0}',
     "branch_currents": '{"RB1": 2.0, "RB2": 3.0, "RB3": 0.6, "RB4": 2.4, "RB5": 2.4}'},
    {"expected": "drift",
     "component_values": '{"RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 8.4, "RB5": 10.0}',
     "node_voltages": '{"A": 62.606531, "B": 41.632099, "C": 22.626141}',
     "branch_currents": '{"RB1": 2.086884, "RB2": 2.913116, "RB3": 0.650502, "RB4": 2.262614, "RB5": 2.262614}'},
    {"expected": "partial_short",
     "component_values": '{"RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 0.9, "RB5": 10.0}',
     "node_voltages": '{"A": 53.254417, "B": 30.035478, "C": 27.555484}',
     "branch_currents": '{"RB1": 1.775147, "RB2": 3.224853, "RB3": 0.469304, "RB4": 2.755548, "RB5": 2.755548}'},
    {"expected": "partial_open",
     "component_values": '{"RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 300.0, "RB5": 10.0}',
     "node_voltages": '{"A": 100.13747, "B": 88.170463, "C": 2.844208}',
     "branch_currents": '{"RB1": 3.337916, "RB2": 1.662084, "RB3": 1.377663, "RB4": 0.284421, "RB5": 0.284421}'},
    {"expected": "wrong_component_type",
     "component_values": '{"RB1": 30.0, "RB2": 7.2, "RB3": 64.0, "RB4": 2.2e-06, "RB5": 10.0}',
     "node_voltages": '{"A": 105.533597, "B": 94.86166, "C": 0.0}',
     "branch_currents": '{"RB1": 3.517787, "RB2": 1.482213, "RB3": 1.482213, "RB5": 0.0}'},

    # ===== Circuit C: Problem 3.59 / Fig. P3.59 (Delta-to-Y), p.85 =====
    # 24V @ node A (RC4=40 shunt) -> delta{RC1(1,A-M), RC2(15,A-B), RC3(10,M-B)}
    #   -> node B (RC5=50 shunt). v1=VA=24V trivially; v2=VB solved below.
    {"expected": "normal",
     "component_values": '{"RC1": 1.0, "RC2": 15.0, "RC3": 10.0, "RC4": 40.0, "RC5": 50.0}',
     "node_voltages": '{"A": 24.0, "M": 23.754266, "B": 21.296928}',
     "branch_currents": '{"RC1": 0.245734, "RC2": 0.180205, "RC3": 0.245734, "RC4": 0.6, "RC5": 0.425939}'},
    # multi_fault #1: RC3 (10 Ohm, M-B) partial_short -> 1.2 Ohm,
    #                 RC5 (50 Ohm, B-gnd) drift -> 67.5 Ohm, simultaneously.
    {"expected": "multi_fault",
     "component_values": '{"RC1": 1.0, "RC2": 15.0, "RC3": 1.2, "RC4": 40.0, "RC5": 67.5}',
     "node_voltages": '{"A": 24.0, "M": 23.698492, "B": 23.336683}',
     "branch_currents": '{"RC1": 0.301508, "RC2": 0.044221, "RC3": 0.301508, "RC4": 0.6, "RC5": 0.345729}'},
    # multi_fault #2: RC1 (1 Ohm, A-M) partial_open -> 50 Ohm,
    #                 RC2 (15 Ohm, A-B) wrong_component_type -> swapped for a
    #                 capacitor (open at DC); RC2's own current is omitted.
    {"expected": "multi_fault",
     "component_values": '{"RC1": 50.0, "RC2": 6.8e-06, "RC3": 10.0, "RC4": 40.0, "RC5": 50.0}',
     "node_voltages": '{"A": 24.0, "M": 13.090909, "B": 10.909091}',
     "branch_currents": '{"RC1": 0.218182, "RC3": 0.218182, "RC4": 0.6, "RC5": 0.218182}'},

    # ===== Circuit D: Example 4.2 / Fig. 4.8 (node-voltage method), Ch.4 =====
    # Single node n1: fed by 50V-through-RD1(5) AND a 3A current source at once;
    # RD2(10) and RD3(40) shunt n1 to ground. RD2 faulted.
    {"expected": "normal",
     "component_values": '{"RD1": 5.0, "RD2": 10.0, "RD3": 40.0}',
     "node_voltages": '{"n1": 40.0, "gnd": 0.0}',
     "branch_currents": '{"RD1": 2.0, "RD2": 4.0, "RD3": 1.0}'},
    {"expected": "drift",
     "component_values": '{"RD1": 5.0, "RD2": 14.0, "RD3": 40.0}',
     "node_voltages": '{"n1": 43.855422, "gnd": 0.0}',
     "branch_currents": '{"RD1": 1.228916, "RD2": 3.13253, "RD3": 1.096386}'},
    {"expected": "partial_short",
     "component_values": '{"RD1": 5.0, "RD2": 1.5, "RD3": 40.0}',
     "node_voltages": '{"n1": 14.579439, "gnd": 0.0}',
     "branch_currents": '{"RD1": 7.084112, "RD2": 9.719626, "RD3": 0.364486}'},
    {"expected": "partial_open",
     "component_values": '{"RD1": 5.0, "RD2": 500.0, "RD3": 40.0}',
     "node_voltages": '{"n1": 57.268722, "gnd": 0.0}',
     "branch_currents": '{"RD1": -1.453744, "RD2": 0.114537, "RD3": 1.431718}'},
    {"expected": "wrong_component_type",
     "component_values": '{"RD1": 5.0, "RD2": 3.3e-06, "RD3": 40.0}',
     "node_voltages": '{"n1": 57.777778, "gnd": 0.0}',
     "branch_currents": '{"RD1": -1.555556, "RD3": 1.444444}'},
]


def main():
    n_correct = 0
    print(f"{'#':4s} {'expected':22s} {'predicted':22s} {'ok?':4s} label confidences")
    print("-" * 100)
    for i, case in enumerate(TEST_CASES, start=1):
        overall_pred, label_probs = predict_one(case)
        ok = (overall_pred == case["expected"])
        n_correct += ok

        conf_str = ", ".join(f"{label}={p:.0%}" for label, p in label_probs.items())
        print(f"{i:<4d} {case['expected']:22s} {overall_pred:22s} "
              f"{'OK' if ok else 'FAIL':4s} {conf_str}")

    print("-" * 100)
    print(f"Accuracy on this battery: {n_correct}/{len(TEST_CASES)} "
          f"({n_correct/len(TEST_CASES):.1%})")
    print(f"(threshold used to decide a label 'fired': {THRESHOLD:.0%})")


if __name__ == "__main__":
    main()