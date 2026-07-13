# 36 sample tests
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
label_columns = joblib.load(LABELS_PATH)
nominal_lookup = joblib.load(NOMINAL_LOOKUP_PATH)


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
    # source: current_source_single_R
    {"expected": "normal",
     "component_values": '{"Rx": 416.67}',
     "node_voltages": '{"p": 5.00004}',
     "branch_currents": '{"Rx": 0.012}'},
    {"expected": "drift",
     "component_values": '{"Rx": 132.015642}',
     "node_voltages": '{"p": 1.584188}',
     "branch_currents": '{"Rx": 0.012}'},
    {"expected": "partial_short",
     "component_values": '{"Rx": 41.642223}',
     "node_voltages": '{"p": 0.4997067}',
     "branch_currents": '{"Rx": 0.012}'},
    {"expected": "partial_open",
     "component_values": '{"Rx": 9138.418483}',
     "node_voltages": '{"p": 109.661}',
     "branch_currents": '{"Rx": 0.012}'},
    {"expected": "wrong_component_type",
     "component_values": '{"Rx": 5.41e-06}',
     "node_voltages": '{"p": 0.02218115}',
     "branch_currents": '{}'},
    {"expected": "multi_fault",
     "component_values": '{"Rx": 5940.23796}',
     "node_voltages": '{"p": 71.28286}',
     "branch_currents": '{"Rx": 0.012}'},

    # source: kvl_series_loop_ABCDEF
    {"expected": "normal",
     "component_values": '{"R_FA": 8000, "R_AB": 6000, "R_BC": 12000, "R_DE": 4000}',
     "node_voltages": '{"A": 8.0, "B": 14.0, "C": 26.0, "D": 2.0, "E": 6.0}',
     "branch_currents": '{"R_FA": -0.001, "R_AB": -0.001, "R_BC": -0.001, "R_DE": -0.001}'},
    {"expected": "drift",
     "component_values": '{"R_FA": 8000, "R_AB": 6000, "R_BC": 12000, "R_DE": 5283.351962}',
     "node_voltages": '{"A": 7.671812, "B": 13.42567, "C": 24.93339, "D": 0.9333895, "E": 6.0}',
     "branch_currents": '{"R_FA": -0.000958977, "R_AB": -0.000958977, "R_BC": -0.000958977, "R_DE": -0.000958977}'},
    {"expected": "partial_short",
     "component_values": '{"R_FA": 8000, "R_AB": 6000, "R_BC": 657.653182, "R_DE": 4000}',
     "node_voltages": '{"A": 12.86335, "B": 22.51087, "C": 23.56832, "D": -0.431677, "E": 6.0}',
     "branch_currents": '{"R_FA": -0.00160792, "R_AB": -0.00160792, "R_BC": -0.00160792, "R_DE": -0.00160792}'},
    {"expected": "partial_open",
     "component_values": '{"R_FA": 8000, "R_AB": 6000, "R_BC": 555225.439029, "R_DE": 4000}',
     "node_voltages": '{"A": 0.4186834, "B": 0.732696, "C": 29.79066, "D": 5.790658, "E": 6.0}',
     "branch_currents": '{"R_FA": -5.23354e-05, "R_AB": -5.23354e-05, "R_BC": -5.23354e-05, "R_DE": -5.23354e-05}'},
    {"expected": "wrong_component_type",
     "component_values": '{"R_FA": 8000, "R_AB": 6000, "R_BC": 7.46e-06, "R_DE": 4000}',
     "node_voltages": '{"A": 0.0, "B": 0.0, "C": 30.0, "D": 6.0, "E": 6.0}',
     "branch_currents": '{"R_FA": 0.0, "R_AB": 0.0, "R_DE": 0.0}'},
    {"expected": "multi_fault",
     "component_values": '{"R_FA": 3904.469365, "R_AB": 225482.788965, "R_BC": 12000, "R_DE": 4000}',
     "node_voltages": '{"A": 0.4773438, "B": 28.04391, "C": 29.51098, "D": 5.510977, "E": 6.0}',
     "branch_currents": '{"R_FA": -0.000122256, "R_AB": -0.000122256, "R_BC": -0.000122256, "R_DE": -0.000122256}'},

    # source: multisource_5R_network
    {"expected": "normal",
     "component_values": '{"R1": 2000, "R2": 2000, "R3": 1000, "R4": 1500, "R5": 4000}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 2619.13}',
     "branch_currents": '{"R1": 0.005, "R2": -0.0025, "R3": -2.60913, "R4": -1.73609, "R5": 0.6547826}'},
    {"expected": "drift",
     "component_values": '{"R1": 2000, "R2": 3117.380408, "R3": 1000, "R4": 1500, "R5": 4000}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 2619.13}',
     "branch_currents": '{"R1": 0.005, "R2": -0.00160391, "R3": -2.60913, "R4": -1.73609, "R5": 0.6547826}'},
    {"expected": "partial_short",
     "component_values": '{"R1": 2000, "R2": 224.541276, "R3": 1000, "R4": 1500, "R5": 4000}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 2619.13}',
     "branch_currents": '{"R1": 0.005, "R2": -0.0222676, "R3": -2.60913, "R4": -1.73609, "R5": 0.6547826}'},
    {"expected": "partial_open",
     "component_values": '{"R1": 2000, "R2": 2000, "R3": 24150.48983, "R4": 1500, "R5": 4000}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 5229.675}',
     "branch_currents": '{"R1": 0.005, "R2": -0.0025, "R3": -0.216131, "R4": -3.47645, "R5": 1.307419}'},
    {"expected": "wrong_component_type",
     "component_values": '{"R1": 2000, "R2": 2000, "R3": 1000, "R4": 1500, "R5": 5.77e-06}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 3012.0}',
     "branch_currents": '{"R1": 0.005, "R2": -0.0025, "R3": -3.002, "R4": -1.998}'},
    {"expected": "multi_fault",
     "component_values": '{"R1": 681.088617, "R2": 2000, "R3": 45921.774837, "R4": 1500, "R5": 4000}',
     "node_voltages": '{"A": 10.0, "B": 15.0, "C": 5338.863}',
     "branch_currents": '{"R1": 0.01468238, "R2": -0.0025, "R3": -0.116042, "R4": -3.54924, "R5": 1.334716}'},

    # source: series_parallel_R1R2R3R4
    {"expected": "normal",
     "component_values": '{"R1": 1000, "R2": 2000, "R3": 3000, "R4": 1500}',
     "node_voltages": '{"a": 7.297297, "b": 4.054054, "in": 10.0}',
     "branch_currents": '{"R1": 0.002702703, "R2": 0.001621622, "R3": 0.001081081, "R4": 0.002702703}'},
    {"expected": "drift",
     "component_values": '{"R1": 1000, "R2": 2000, "R3": 3000, "R4": 2400.040381}',
     "node_voltages": '{"a": 7.826106, "b": 5.217433, "in": 10.0}',
     "branch_currents": '{"R1": 0.002173894, "R2": 0.001304336, "R3": 0.0008695576, "R4": 0.002173894}'},
    {"expected": "partial_short",
     "component_values": '{"R1": 91.377805, "R2": 2000, "R3": 3000, "R4": 1500}',
     "node_voltages": '{"a": 9.672643, "b": 5.37369, "in": 10.0}',
     "branch_currents": '{"R1": 0.00358246, "R2": 0.002149476, "R3": 0.001432984, "R4": 0.00358246}'},
    {"expected": "partial_open",
     "component_values": '{"R1": 1000, "R2": 2000, "R3": 112869.644941, "R4": 1500}',
     "node_voltages": '{"a": 7.760448, "b": 3.359329, "in": 10.0}',
     "branch_currents": '{"R1": 0.002239552, "R2": 0.002200559, "R3": 3.899294e-05, "R4": 0.002239552}'},
    {"expected": "wrong_component_type",
     "component_values": '{"R1": 3.41e-06, "R2": 2000, "R3": 3000, "R4": 1500}',
     "node_voltages": '{"a": 0.0, "b": 0.0, "in": 10.0}',
     "branch_currents": '{"R2": 0.0, "R3": 0.0, "R4": 0.0}'},
    {"expected": "multi_fault",
     "component_values": '{"R1": 59.633488, "R2": 1144.785619, "R3": 3000, "R4": 1500}',
     "node_voltages": '{"a": 9.750303, "b": 6.280801, "in": 10.0}',
     "branch_currents": '{"R1": 0.004187201, "R2": 0.0030307, "R3": 0.001156501, "R4": 0.004187201}'},

    # source: vdr_parallel_network
    {"expected": "normal",
     "component_values": '{"R1": 6000, "R2": 12000, "R3": 12000}',
     "node_voltages": '{"T": 36.0}',
     "branch_currents": '{"R1": 0.006, "R2": 0.003, "R3": 0.003}'},
    {"expected": "drift",
     "component_values": '{"R1": 6000, "R2": 12000, "R3": 20011.830842}',
     "node_voltages": '{"T": 40.00394}',
     "branch_currents": '{"R1": 0.006667324, "R2": 0.003333662, "R3": 0.001999015}'},
    {"expected": "partial_short",
     "component_values": '{"R1": 6000, "R2": 12000, "R3": 478.466309}',
     "node_voltages": '{"T": 5.12818}',
     "branch_currents": '{"R1": 0.0008546967, "R2": 0.0004273484, "R3": 0.01071795}'},
    {"expected": "partial_open",
     "component_values": '{"R1": 98121.602014, "R2": 12000, "R3": 12000}',
     "node_voltages": '{"T": 67.85101}',
     "branch_currents": '{"R1": 0.0006914992, "R2": 0.00565425, "R3": 0.00565425}'},
    {"expected": "wrong_component_type",
     "component_values": '{"R1": 6.54e-06, "R2": 12000, "R3": 12000}',
     "node_voltages": '{"T": 72.0}',
     "branch_currents": '{"R2": 0.006, "R3": 0.006}'},
    {"expected": "multi_fault",
     "component_values": '{"R1": 6000, "R2": 165779.857887, "R3": 7531.909895}',
     "node_voltages": '{"T": 39.28409}',
     "branch_currents": '{"R1": 0.006547348, "R2": 0.0002369654, "R3": 0.005215687}'},

    # source: voltage_divider_12k_9k
    {"expected": "normal",
     "component_values": '{"R1": 12000, "R2": 9000}',
     "node_voltages": '{"o": 3.0, "s": 7.0}',
     "branch_currents": '{"R1": 0.0003333333, "R2": 0.0003333333}'},
    {"expected": "drift",
     "component_values": '{"R1": 12000, "R2": 12485.387528}',
     "node_voltages": '{"o": 3.569382, "s": 7.0}',
     "branch_currents": '{"R1": 0.0002858848, "R2": 0.0002858848}'},
    {"expected": "partial_short",
     "component_values": '{"R1": 1341.996506, "R2": 9000}',
     "node_voltages": '{"o": 6.091667, "s": 7.0}',
     "branch_currents": '{"R1": 0.0006768519, "R2": 0.0006768519}'},
    {"expected": "partial_open",
     "component_values": '{"R1": 259735.864408, "R2": 9000}',
     "node_voltages": '{"o": 0.2344309, "s": 7.0}',
     "branch_currents": '{"R1": 2.604788e-05, "R2": 2.604788e-05}'},
    {"expected": "wrong_component_type",
     "component_values": '{"R1": 6.17e-06, "R2": 9000}',
     "node_voltages": '{"o": 0.0, "s": 7.0}',
     "branch_currents": '{"R2": 0.0}'},
    {"expected": "multi_fault",
     "component_values": '{"R1": 142068.42402, "R2": 221.570099}',
     "node_voltages": '{"o": 0.01090021, "s": 7.0}',
     "branch_currents": '{"R1": 4.919531e-05, "R2": 4.919531e-05}'},
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