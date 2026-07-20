"""
predictor.py

Single source of truth for feature extraction + prediction.
Every test script imports FROM here instead of copy-pasting these
functions -- so there's exactly one place that has to match
train_model_v4.py's feature logic, not five.
"""

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


def register_nominal(component_names, nominal_values):
    """
    Call this once per new circuit topology, if you need to test
    something outside the original 6/11 training circuits, e.g.:

        register_nominal(["RA1","RA2","RA3","RA4"],
                          {"RA1": 4.0, "RA2": 3.0, "RA3": 6.0, "RA4": 18.0})
    """
    nominal_lookup[frozenset(component_names)] = nominal_values


def extract_features(row):
    comps_dict = json.loads(row["component_values"])
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

    # Count only passive components (R/C/L) for n_missing_currents.
    # Must match train.py and fault_analyzer.py exactly.
    n_passive = sum(
        1 for name in comps_dict
        if not (name.upper().startswith('V') or name.upper().startswith('I'))
    )

    return pd.Series({
        "n_components": len(comps_dict),
        "n_nodes": len(volts),
        "volt_mean": np.mean(volts) if volts else 0,
        "volt_max": np.max(volts) if volts else 0,
        "volt_min": np.min(volts) if volts else 0,
        "n_currents": len(currs),
        "curr_mean_abs": np.mean(np.abs(currs)) if currs else 0,
        "curr_max_abs": np.max(np.abs(currs)) if currs else 0,
        "n_missing_currents": n_passive - len(currs),
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
        p_yes = arr[list(classes).index(1)] if 1 in list(classes) else 0.0
        label_probs[label] = float(p_yes)

    fired = [label for label, p in label_probs.items() if p >= threshold]
    if len(fired) == 0:
        overall_pred = "normal"
    elif len(fired) == 1:
        overall_pred = fired[0]
    else:
        overall_pred = "multi_fault (" + " + ".join(fired) + ")"

    return overall_pred, label_probs