import json
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, KFold  # ADDED: KFold
from sklearn.metrics import (
    classification_report, hamming_loss, accuracy_score,
    multilabel_confusion_matrix,  # ADDED
)

DATASET_PATH = "dataset/dataset.csv"
MODEL_PATH = "models/fault_classifier.joblib"
FEATURES_PATH = "models/feature_columns.joblib"
LABELS_PATH = "models/label_columns.joblib"

LABEL_NAMES = ["partial_short", "partial_open", "wrong_component_type"]



def extract_features(row):                       
    comps_dict = json.loads(row["component_values"])
    design_dict = json.loads(row["design_values"])   # NEW: read row's own design values
    volts = list(json.loads(row["node_voltages"]).values())
    volt_abs = np.abs(volts)
    currs = list(json.loads(row["branch_currents"]).values())
    curr_abs = np.abs(currs)
    deviations = []
    for name, val in comps_dict.items():
        nom = design_dict.get(name)
        if nom:
            deviations.append(abs(val - nom) / nom)

    deviations_sorted = sorted(deviations, reverse=True)
    max_dev = deviations_sorted[0] if deviations_sorted else 0
    second_dev = deviations_sorted[1] if len(deviations_sorted) > 1 else 0
    dev_ratio = (second_dev / max_dev) if max_dev > 0 else 0
    n_dev_over_20pct = sum(d > 0.20 for d in deviations)
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
        "curr_mean_abs": np.mean(curr_abs) if currs else 0,
        "curr_max_abs": np.max(curr_abs) if currs else 0, # missing currents: passive components whose @R[i] reading was absent
        # (happens when a resistor is swapped for a capacitor — wrong_component_type)
        "volt_std": np.std(volts) if volts else 0,
        "volt_range": (np.max(volts) - np.min(volts)) if volts else 0,
        "curr_std_abs": np.std(curr_abs) if currs else 0,
        "curr_range_abs": (np.max(curr_abs) - np.min(curr_abs)) if currs else 0,
        "missing_current_ratio":
            (n_passive - len(currs)) / max(n_passive, 1),

        "n_missing_currents": n_passive - len(currs),
        "max_deviation_ratio": max_dev,
        "second_deviation_ratio": second_dev,
        "deviation_ratio_2nd_over_1st": dev_ratio,
        "n_components_deviated_over_20pct": n_dev_over_20pct,
    })


def parse_fault_labels(fault_type, faulted_components):
    kinds = set()
    if fault_type == "normal":
        return kinds
    if fault_type in ("partial_short", "partial_open", "wrong_component_type"):
        kinds.add(fault_type)
        return kinds
    if fault_type == "multi_fault":
        if isinstance(faulted_components, str):
            for part in faulted_components.split(";"):
                if ":" not in part:
                    continue
                _, kind_str = part.split(":", 1)
                for k in kind_str.split("+"):
                    if k in LABEL_NAMES:
                        kinds.add(k)
        return kinds
    return kinds


def load_and_prepare(path):
    df = pd.read_csv(path)
    df = df[df["success"] == True].copy()

    X = df.apply(lambda row: extract_features(row), axis=1)   # no nominal_lookup arg
    
    label_sets = df.apply(
        lambda row: parse_fault_labels(row["fault_type"], row["faulted_components"]),
        axis=1,
    )
    Y = pd.DataFrame(
        {label: label_sets.apply(lambda s: 1 if label in s else 0) for label in LABEL_NAMES}
    )
    return X, Y, df["fault_type"] 


def run_kfold_cv(X, Y, k=5, random_state=42):  # ADDED: whole function
    """
    K-fold cross-validation. Splits the data into k chunks, trains on k-1,
    tests on the 1 left out, rotates k times, and reports the spread of
    scores across folds (not just a single train/test number).
    """
    kf = KFold(n_splits=k, shuffle=True, random_state=random_state)
    fold_accuracies = []
    fold_hamming = []

    print(f"\n=== {k}-Fold Cross-Validation ===")
    for fold_idx, (train_idx, test_idx) in enumerate(kf.split(X), start=1):
        X_train_fold, X_test_fold = X.iloc[train_idx], X.iloc[test_idx]
        Y_train_fold, Y_test_fold = Y.iloc[train_idx], Y.iloc[test_idx]

        fold_clf = RandomForestClassifier(
            n_estimators=200, random_state=random_state, class_weight="balanced"
        )
        fold_clf.fit(X_train_fold, Y_train_fold)
        Y_pred_fold = pd.DataFrame(
            fold_clf.predict(X_test_fold), columns=LABEL_NAMES, index=X_test_fold.index
        )

        acc = accuracy_score(Y_test_fold, Y_pred_fold)
        ham = hamming_loss(Y_test_fold, Y_pred_fold)
        fold_accuracies.append(acc)
        fold_hamming.append(ham)

        print(f"Fold {fold_idx}: exact-match accuracy = {acc:.2%}, hamming loss = {ham:.4f}")

    print(f"\nMean accuracy across {k} folds: {np.mean(fold_accuracies):.2%} "
          f"(std: {np.std(fold_accuracies):.2%})")
    print(f"Mean hamming loss across {k} folds: {np.mean(fold_hamming):.4f} "
          f"(std: {np.std(fold_hamming):.4f})")
    # A high std relative to the mean means performance is unstable across
    # folds -- worth flagging in your report, not just hiding behind the mean.


def main():
    X, Y, fault_type_col = load_and_prepare(DATASET_PATH)
    feature_columns = list(X.columns)

    print(f"Loaded {len(X)} samples")
    print(f"Feature columns ({len(feature_columns)}): {feature_columns}\n")
    print("Original fault_type counts (for reference only, not what we train on):")
    print(fault_type_col.value_counts(), "\n")
    print("How often each of the 4 labels is 'yes':")
    print(Y.sum(), "\n")

    run_kfold_cv(X, Y, k=5)  # ADDED: run cross-validation before the final fit

    X_train, X_test, Y_train, Y_test = train_test_split(
        X, Y, test_size=0.3, random_state=42
    )
    clf = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
    )
    clf.fit(X_train, Y_train)

    importance = pd.Series(
        clf.feature_importances_, index=feature_columns).sort_values(ascending=False)

    print("\n=== Feature Importance ===")
    print(importance)

    Y_pred = pd.DataFrame(clf.predict(X_test), columns=LABEL_NAMES, index=X_test.index)

    print("=== Per-label classification report (test split) ===")
    for label in LABEL_NAMES:
        print(f"--- {label} ---")
        print(classification_report(Y_test[label], Y_pred[label], zero_division=0))

    # ADDED: confusion matrix per label
    print("=== Per-label confusion matrices (test split) ===")
    mcm = multilabel_confusion_matrix(Y_test, Y_pred)
    for label, cm in zip(LABEL_NAMES, mcm):
        tn, fp, fn, tp = cm.ravel()
        print(f"--- {label} ---")
        print(f"              predicted 0   predicted 1")
        print(f"actual 0      {tn:<13}{fp}")
        print(f"actual 1      {fn:<13}{tp}")
        print(f"  -> TP={tp}, FP={fp}, FN={fn}, TN={tn}\n")

    print("=== Overall multi-label metrics ===")
    print(f"Hamming loss (lower is better, 0=perfect): {hamming_loss(Y_test, Y_pred):.4f}")
    print(f"Exact-match accuracy (all 4 labels correct at once): "f"{accuracy_score(Y_test, Y_pred):.2%}")

    joblib.dump(clf, MODEL_PATH)
    joblib.dump(feature_columns, FEATURES_PATH)
    joblib.dump(LABEL_NAMES, LABELS_PATH)

    print(f"\nSaved model to {MODEL_PATH}")
    print(f"Saved feature column order to {FEATURES_PATH}")
    print(f"Saved label order to {LABELS_PATH}")


if __name__ == "__main__":
    main()