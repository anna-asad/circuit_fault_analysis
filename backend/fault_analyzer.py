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
    design_values:    Dict[str, float] = None,
) -> Dict[str, float]:
    """
    Extract features for ML prediction.
    
    IMPORTANT: Feature names and order MUST match train.py's extract_features()
    exactly. Any mismatch will cause prediction errors.
    """
    volts    = list(node_voltages.values())
    currs    = list(branch_currents.values())
    curr_abs = np.abs(currs)

    PASSIVE_TYPES = {"resistor", "capacitor", "inductor"}
    if circuit_data:
        n_passive = sum(
            1 for c in circuit_data.get("components", [])
            if c.get("type") in PASSIVE_TYPES
        )
    else:
        n_passive = sum(
            1 for name in component_values
            if not (name.upper().startswith("V") or name.upper().startswith("I"))
        )

    # design_values = the original intended component values (set at drop time in
    # the frontend and sent in every /api/simulate payload).
    # 
    # CRITICAL FIX: For first-time simulations, component_values ARE the nominal
    # values (no deviation). Only compare against design_values if they differ
    # from the actual values (meaning the user edited them after creation).
    # 
    # This prevents false positives where a 12kΩ resistor is flagged as "1100%
    # deviated" just because it was created with a 1kΩ default value initially.
    print("=" * 80)
    print("NOMINAL VALUE SELECTION DEBUG")
    print("=" * 80)
    print(f"component_values received: {component_values}")
    print(f"design_values received: {design_values}")
    print(f"circuit_data components: {[c.get('id') for c in circuit_data.get('components', [])]}")
    
    if design_values:
        # Check if design_values are actually different from component_values.
        # If they're the same (or very close), this is a first-time simulation
        # and we should treat component_values as nominal (no deviation).
        values_are_identical = all(
            abs(component_values.get(k, 0) - v) < 1e-9
            for k, v in design_values.items()
            if v and v != 0
        )
        
        if values_are_identical:
            # First simulation: actual values ARE the nominal values
            nominal = {k: v for k, v in component_values.items()}
            print(f"\nFIRST SIMULATION: Using component_values as nominal (no deviation)")
            print(f"nominal = {nominal}")
        else:
            # Subsequent simulation: user changed values after creation
            nominal = {k: v for k, v in design_values.items() if v and v != 0}
            print(f"\nSUBSEQUENT SIMULATION: Using DESIGN_VALUES as nominal")
            print(f"nominal = {nominal}")
    else:
        print(f"\nNo design_values provided, attempting NOMINAL LOOKUP...")
        nominal, match_info = map_to_nominal_values(component_values, nominal_lookup, circuit_data)
        print(f"Nominal lookup returned: {nominal}")
        print(f"Match info: {match_info}")
    
    print("=" * 80)

    deviations = []
    for name, val in component_values.items():
        nom = nominal.get(name)
        if nom and nom != 0:
            dev = abs(val - nom) / abs(nom)
            deviations.append(dev)

    deviations_sorted = sorted(deviations, reverse=True)
    max_dev    = deviations_sorted[0] if deviations_sorted else 0.0
    second_dev = deviations_sorted[1] if len(deviations_sorted) > 1 else 0.0
    dev_ratio  = second_dev / max_dev if max_dev > 0 else 0.0
    n_over_20  = sum(d > 0.20 for d in deviations)

    features = {
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
    
    # DEBUG: Print complete feature vector
    print("=" * 80)
    print("FEATURE VECTOR DEBUG")
    print("=" * 80)
    print(f"Component values: {component_values}")
    print(f"Nominal values used: {nominal}")
    print(f"Deviations: {deviations}")
    print("\nFeatures:")
    for key, value in features.items():
        print(f"  {key:35s}: {value}")
    print("=" * 80)
    
    return features


def _compute_drift_warnings(
    component_values: Dict[str, float],
    nominal_lookup:   Dict,
    circuit_data:     Dict = None,
    design_values:    Dict[str, float] = None,
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
    # Use design_values if provided (circuit-specific nominals), but only if they
    # differ from the actual component_values (to avoid false positives on first sim).
    if design_values:
        values_are_identical = all(
            abs(component_values.get(k, 0) - v) < 1e-9
            for k, v in design_values.items()
            if v and v != 0
        )
        
        if values_are_identical:
            # First simulation: no drift (actual = nominal)
            return []
        else:
            # Subsequent simulation: compare against design_values
            nominal = {k: v for k, v in design_values.items() if v and v != 0}
    else:
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
                "deviation_pct": round(pct, 1),  # Keep sign: negative = SHORT, positive = OPEN
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
        self._clf = None
        self._feature_cols = None
        self._label_cols = None
        self._nominal_lookup = None
    
    def _ensure_loaded(self):
        """Lazy load model files only when first needed."""
        if self.model_loaded and self._clf is None:
            self._clf            = joblib.load(REQUIRED_FILES["classifier"])
            self._feature_cols   = joblib.load(REQUIRED_FILES["feature_columns"])
            self._label_cols     = joblib.load(REQUIRED_FILES["label_columns"])
            self._nominal_lookup = joblib.load(REQUIRED_FILES["nominal_lookup"])

    def analyze(
        self,
        circuit_data:    Dict,
        node_voltages:   Dict[str, float],
        branch_currents: Dict[str, float],
        design_values:   Dict[str, float] = None,
    ) -> Dict:
        if not self.model_loaded:
            return self._unavailable_response()
        
        self._ensure_loaded()

        component_values: Dict[str, float] = {}
        for comp in circuit_data.get("components", []):
            ctype = comp.get("type", "")
            if ctype in ("resistor", "capacitor", "inductor", "current_source"):
                component_values[comp.get("id", "")] = float(comp.get("value", 0))

        ground = circuit_data.get("ground", "0")
        signal_voltages = {k: v for k, v in node_voltages.items() if k != ground}

        drift_warnings = _compute_drift_warnings(
            component_values, self._nominal_lookup, circuit_data, design_values
        )

        try:
            features = _extract_features(
                component_values, signal_voltages, branch_currents,
                self._nominal_lookup, circuit_data, design_values,
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

        # ── POST-PROCESSING CONSTRAINTS ──────────────────────────────────────
        # 1. Mutual exclusion: partial_short and partial_open are physically
        #    incompatible (opposite deviations). If both fire, keep only the
        #    one with higher probability.
        if (label_probs.get("partial_short", 0) >= THRESHOLD and 
            label_probs.get("partial_open", 0) >= THRESHOLD):
            if label_probs["partial_short"] > label_probs["partial_open"]:
                label_probs["partial_open"] = 0.0  # Suppress the weaker one
            else:
                label_probs["partial_short"] = 0.0  # Suppress the weaker one
        
        # 2. Minimum margin rule: For labels that cleared threshold, check if
        #    they have sufficient margin over the "Normal" baseline (the absence
        #    of that specific fault). This prevents borderline flip-flops where
        #    predictions are barely above threshold with no confidence.
        #    
        #    Rule: A label only fires if it's at least MIN_MARGIN above the
        #    threshold itself, giving a "buffer zone" for uncertain predictions.
        MIN_MARGIN = 0.10  # 10% minimum gap above threshold
        MIN_CONFIDENCE = THRESHOLD + MIN_MARGIN  # 0.5 + 0.1 = 0.6
        
        # Apply minimum confidence threshold to prevent borderline predictions
        for label, prob in label_probs.items():
            if THRESHOLD <= prob < MIN_CONFIDENCE:
                # Prediction is above threshold but not confident enough
                label_probs[label] = THRESHOLD - 0.01  # Drop below threshold

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
