"""Fault Analyzer — RandomForest multi-label classifier + rule-based drift warnings."""

from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from topology_matcher import map_to_nominal_values

MODEL_DIR = Path(__file__).parent.parent / "models"
REQUIRED_FILES = {
    "classifier":      MODEL_DIR / "fault_classifier.joblib",
    "feature_columns": MODEL_DIR / "feature_columns.joblib",
    "label_columns":   MODEL_DIR / "label_columns.joblib",
    "nominal_lookup":  MODEL_DIR / "nominal_lookup.joblib",
}

try:
    import joblib
    import pandas as pd
    _ML_IMPORTS_OK = True
except ImportError:
    _ML_IMPORTS_OK = False

ML_MODEL_AVAILABLE = _ML_IMPORTS_OK and all(f.exists() for f in REQUIRED_FILES.values())
THRESHOLD = 0.5

# Component value drifted more than this from nominal → emit a warning
DRIFT_WARNING_THRESHOLD = 0.20


def _extract_features(
    component_values: Dict[str, float],
    node_voltages:    Dict[str, float],
    branch_currents:  Dict[str, float],
    nominal_lookup:   Dict,
    circuit_data:     Dict = None,
) -> Dict[str, float]:
    """
    Extract features for ML prediction.
    
    IMPORTANT: Feature names and order MUST match train.py's extract_features()
    exactly. Any mismatch will cause prediction errors.
    
    NOTE: comp_mean, comp_std, comp_max, comp_min were removed because they
    incorrectly mixed different units (ohms, amps, volts, farads, henries)
    into single meaningless statistics.
    """
    volts    = list(node_voltages.values())
    currs    = list(branch_currents.values())
    curr_abs = np.abs(currs)

    # Match train.py's n_passive calculation exactly
    n_passive = sum(
        1 for name in component_values
        if not (name.upper().startswith("V") or name.upper().startswith("I"))
    )

    nominal, _ = map_to_nominal_values(component_values, nominal_lookup, circuit_data)

    deviations = []
    for name, val in component_values.items():
        nom = nominal.get(name)
        if nom and nom != 0:
            deviations.append(abs(val - nom) / abs(nom))

    deviations_sorted = sorted(deviations, reverse=True)
    max_dev    = deviations_sorted[0] if deviations_sorted else 0.0
    second_dev = deviations_sorted[1] if len(deviations_sorted) > 1 else 0.0
    dev_ratio  = second_dev / max_dev if max_dev > 0 else 0.0
    n_over_20  = sum(d > 0.20 for d in deviations)

    # CRITICAL: Feature order MUST match train.py exactly
    return {
        "n_components":                     len(component_values),
        "n_nodes":                          len(volts),
        "volt_mean":                        float(np.mean(volts))         if volts else 0.0,
        "volt_max":                         float(np.max(volts))          if volts else 0.0,
        "volt_min":                         float(np.min(volts))          if volts else 0.0,
        "n_currents":                       len(currs),
        "curr_mean_abs":                    float(np.mean(curr_abs))      if currs else 0.0,
        "curr_max_abs":                     float(np.max(curr_abs))       if currs else 0.0,
        "volt_std":                         float(np.std(volts))          if volts else 0.0,
        "volt_range":                       float(np.max(volts) - np.min(volts)) if volts else 0.0,
        "curr_std_abs":                     float(np.std(curr_abs))       if currs else 0.0,
        "curr_range_abs":                   float(np.max(curr_abs) - np.min(curr_abs)) if currs else 0.0,
        "missing_current_ratio":            (n_passive - len(currs)) / max(n_passive, 1),
        "n_missing_currents":               n_passive - len(currs),
        "max_deviation_ratio":              max_dev,
        "second_deviation_ratio":           second_dev,
        "deviation_ratio_2nd_over_1st":     dev_ratio,
        "n_components_deviated_over_20pct": float(n_over_20),
    }


def _compute_drift_warnings(
    component_values: Dict[str, float],
    nominal_lookup:   Dict,
    circuit_data:     Dict = None,
) -> List[Dict]:
    """
    Rule-based drift detection.
    Compares each component's actual value against its nominal value from the
    topology lookup and returns a list of warning dicts for any component whose
    deviation exceeds DRIFT_WARNING_THRESHOLD (default 20%).

    Returns a list of:
        { component_id, actual, nominal, deviation_pct, message }
    Empty list if no topology match is available or no component has drifted.
    """
    nominal, _ = map_to_nominal_values(component_values, nominal_lookup, circuit_data)
    if not nominal:
        return []

    warnings = []
    for comp_id, actual in component_values.items():
        nom = nominal.get(comp_id)
        if not nom or nom == 0:
            continue
        deviation = (actual - nom) / abs(nom)
        if abs(deviation) >= DRIFT_WARNING_THRESHOLD:
            pct = deviation * 100
            direction = "higher" if pct > 0 else "lower"
            warnings.append({
                "component_id":  comp_id,
                "actual":        actual,
                "nominal":       nom,
                "deviation_pct": round(abs(pct), 1),
                "message": (
                    f"{comp_id} has drifted {abs(pct):.1f}% {direction} than its "
                    f"nominal value (actual: {actual:.4g}, nominal: {nom:.4g})."
                ),
            })

    return sorted(warnings, key=lambda w: w["deviation_pct"], reverse=True)


class FaultAnalyzer:
    """Runs the trained RandomForest multi-label classifier."""

    def __init__(self):
        self.model_loaded = ML_MODEL_AVAILABLE
        if self.model_loaded:
            self._clf            = joblib.load(REQUIRED_FILES["classifier"])
            self._feature_cols   = joblib.load(REQUIRED_FILES["feature_columns"])
            self._label_cols     = joblib.load(REQUIRED_FILES["label_columns"])
            self._nominal_lookup = joblib.load(REQUIRED_FILES["nominal_lookup"])

    def analyze(
        self,
        circuit_data:    Dict,
        node_voltages:   Dict[str, float],
        branch_currents: Dict[str, float],
    ) -> Dict:
        if not self.model_loaded:
            return self._unavailable_response()

        component_values: Dict[str, float] = {}
        for comp in circuit_data.get("components", []):
            ctype = comp.get("type", "")
            if ctype in ("resistor", "capacitor", "inductor", "dc_source", "current_source"):
                component_values[comp.get("id", "")] = float(comp.get("value", 0))

        ground = circuit_data.get("ground", "0")
        signal_voltages = {k: v for k, v in node_voltages.items() if k != ground}

        # Rule-based drift warnings (independent of ML)
        drift_warnings = _compute_drift_warnings(
            component_values, self._nominal_lookup, circuit_data
        )

        try:
            features = _extract_features(
                component_values, signal_voltages, branch_currents,
                self._nominal_lookup, circuit_data,
            )
            result = self._predict(features)
        except Exception as exc:
            result = {
                "predicted_fault": "Error",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "prediction_error",
                "description": f"Prediction error: {exc}",
            }

        result["drift_warnings"] = drift_warnings
        return result

    def is_model_loaded(self) -> bool:
        return self.model_loaded

    def _predict(self, features: Dict[str, float]) -> Dict:
        # Safety check: verify all required features exist
        missing_features = set(self._feature_cols) - set(features.keys())
        if missing_features:
            raise ValueError(
                f"Feature schema mismatch! Missing features: {sorted(missing_features)}. "
                f"Expected {len(self._feature_cols)} features but got {len(features)}. "
                f"This usually means train.py and fault_analyzer.py are out of sync. "
                f"Re-train the model with: python src/train.py"
            )
        
        X = pd.DataFrame([features]).reindex(columns=self._feature_cols, fill_value=0)

        proba_per_label = self._clf.predict_proba(X)
        label_probs: Dict[str, float] = {}
        for i, label in enumerate(self._label_cols):
            arr     = proba_per_label[i][0]
            classes = list(self._clf.classes_[i]) if hasattr(self._clf, "estimators_") else [0, 1]
            p_yes   = arr[classes.index(1)] if 1 in classes else 0.0
            label_probs[label] = float(p_yes)

        fired     = [lbl for lbl, p in label_probs.items() if p >= THRESHOLD]
        top_label, top_prob = max(label_probs.items(), key=lambda kv: kv[1])

        if not fired:
            predicted, confidence, fault_type = "Normal", 1.0 - top_prob, "Normal"
        elif len(fired) == 1:
            predicted, confidence, fault_type = fired[0], label_probs[fired[0]], fired[0]
        else:
            predicted  = "Multiple_Faults (" + " + ".join(fired) + ")"
            confidence = float(np.mean([label_probs[f] for f in fired]))
            fault_type = "Multiple_Faults"

        return {
            "predicted_fault":   predicted,
            "confidence":        round(confidence, 4),
            "all_probabilities": label_probs,
            "fault_type":        fault_type,
            "description":       self._describe(fault_type, fired),
        }

    @staticmethod
    def _describe(fault_type: str, fired: List[str]) -> str:
        descriptions = {
            "Normal":               "Circuit operating within normal parameters.",
            "partial_short":        "Partial short circuit detected (1–15% of nominal resistance).",
            "partial_open":         "Partial open circuit detected (5–50× nominal resistance).",
            "wrong_component_type": "Wrong component type — electrical behaviour doesn't match the schematic.",
            "Multiple_Faults":      "Multiple faults: " + ", ".join(fired) + ".",
            "prediction_error":     "An error occurred during fault prediction.",
            "schema_mismatch":      "Feature schema mismatch.",
            "model_unavailable":    "ML model not loaded. Run python src/train.py first.",
        }
        return descriptions.get(fault_type, f"Fault type: {fault_type}")

    @staticmethod
    def _unavailable_response() -> Dict:
        return {
            "predicted_fault": "Unknown",
            "confidence": 0.0,
            "all_probabilities": {},
            "fault_type": "model_unavailable",
            "description": "ML model not loaded. Install dependencies and run: python src/train.py",
            "drift_warnings": [],
        }
