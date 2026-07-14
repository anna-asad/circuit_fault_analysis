"""
Fault Analyzer — uses the trained RandomForest model from src/train.py.

Feature extraction mirrors src/predictor.py exactly, so the model sees
the same input schema it was trained on.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Locate model artefacts ────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent.parent / "models"
REQUIRED_FILES = {
    "classifier":      MODEL_DIR / "fault_classifier.joblib",
    "feature_columns": MODEL_DIR / "feature_columns.joblib",
    "label_columns":   MODEL_DIR / "label_columns.joblib",
    "nominal_lookup":  MODEL_DIR / "nominal_lookup.joblib",
}

# Try to import the ML stack (only present in the full venv, not in the
# minimal FastAPI venv).  Fail gracefully so the API still starts.
try:
    import joblib
    import pandas as pd
    _ML_IMPORTS_OK = True
except ImportError:
    _ML_IMPORTS_OK = False

ML_MODEL_AVAILABLE = _ML_IMPORTS_OK and all(f.exists() for f in REQUIRED_FILES.values())

THRESHOLD = 0.5


# ── Feature extraction (must stay in sync with src/train.py) ─────────────────

def _extract_features(
    component_values: Dict[str, float],
    node_voltages:    Dict[str, float],
    branch_currents:  Dict[str, float],
    nominal_lookup:   Dict,
) -> Dict[str, float]:
    """
    Compute the 17 features the RandomForest was trained on.
    Mirrors extract_features() in src/train.py / src/predictor.py exactly.
    """
    comps  = list(component_values.values())
    volts  = list(node_voltages.values())
    currs  = list(branch_currents.values())

    # Deviation-from-nominal features
    key     = frozenset(component_values.keys())
    nominal = nominal_lookup.get(key, {})
    deviations = []
    for name, val in component_values.items():
        nom = nominal.get(name)
        if nom and nom != 0:
            deviations.append(abs(val - nom) / abs(nom))

    devs_sorted = sorted(deviations, reverse=True)
    max_dev    = devs_sorted[0] if devs_sorted else 0.0
    second_dev = devs_sorted[1] if len(devs_sorted) > 1 else 0.0
    dev_ratio  = (second_dev / max_dev) if max_dev > 0 else 0.0
    n_dev_over_20pct = sum(d > 0.20 for d in deviations)

    return {
        "n_components":                      len(comps),
        "comp_mean":                         float(np.mean(comps))        if comps  else 0.0,
        "comp_max":                          float(np.max(comps))         if comps  else 0.0,
        "comp_min":                          float(np.min(comps))         if comps  else 0.0,
        "comp_std":                          float(np.std(comps))         if comps  else 0.0,
        "n_nodes":                           len(volts),
        "volt_mean":                         float(np.mean(volts))        if volts  else 0.0,
        "volt_max":                          float(np.max(volts))         if volts  else 0.0,
        "volt_min":                          float(np.min(volts))         if volts  else 0.0,
        "n_currents":                        len(currs),
        "curr_mean_abs":                     float(np.mean(np.abs(currs))) if currs else 0.0,
        "curr_max_abs":                      float(np.max(np.abs(currs))) if currs  else 0.0,
        "n_missing_currents":                len(comps) - len(currs),
        "max_deviation_ratio":               max_dev,
        "second_deviation_ratio":            second_dev,
        "deviation_ratio_2nd_over_1st":      dev_ratio,
        "n_components_deviated_over_20pct":  float(n_dev_over_20pct),
    }


# ── FaultAnalyzer class ───────────────────────────────────────────────────────

class FaultAnalyzer:
    """Runs the trained RandomForest multi-label classifier."""

    def __init__(self):
        self.model_loaded = ML_MODEL_AVAILABLE
        if self.model_loaded:
            self._clf            = joblib.load(REQUIRED_FILES["classifier"])
            self._feature_cols   = joblib.load(REQUIRED_FILES["feature_columns"])
            self._label_cols     = joblib.load(REQUIRED_FILES["label_columns"])
            self._nominal_lookup = joblib.load(REQUIRED_FILES["nominal_lookup"])

    # ── Public API ────────────────────────────────────────────────────────────

    def analyze(
        self,
        circuit_data:    Dict,
        node_voltages:   Dict[str, float],
        branch_currents: Dict[str, float],
    ) -> Dict:
        """
        Run the full ML prediction pipeline.

        Parameters
        ----------
        circuit_data    : the CircuitModel dict (has .components list)
        node_voltages   : {node_name: voltage}  from ngspice
        branch_currents : {component_id: current} from ngspice

        Returns
        -------
        dict compatible with the existing SimulationResponse.pattern_faults field
        """
        if not self.model_loaded:
            return self._unavailable_response()

        # Build component-values dict from the circuit definition
        component_values: Dict[str, float] = {}
        for comp in circuit_data.get("components", []):
            ctype = comp.get("type", "")
            if ctype in ("resistor", "capacitor", "inductor", "dc_source"):
                cid = comp.get("id", "")
                component_values[cid] = float(comp.get("value", 0))

        # Non-ground node voltages only (ground = 0 V by definition, not a signal)
        ground = circuit_data.get("ground", "0")
        signal_voltages = {k: v for k, v in node_voltages.items() if k != ground}

        try:
            features = _extract_features(
                component_values,
                signal_voltages,
                branch_currents,
                self._nominal_lookup,
            )
            return self._predict(features, component_values)

        except Exception as exc:
            return {
                "predicted_fault": "Error",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "prediction_error",
                "description": f"Feature extraction / prediction error: {exc}",
            }

    # ── Keep old signature for any caller that already passes ml_features ────
    def analyze_pattern_faults(self, ml_features: Dict) -> Dict:
        """
        Legacy shim — called by main.py with the old simple feature dict.
        Forwards to the real model when possible; falls back gracefully.
        """
        if not self.model_loaded:
            return self._unavailable_response()

        # ml_features from old extract_features_for_ml() doesn't have the
        # right schema.  Return a clear message so the caller knows to
        # switch to analyze().
        return {
            "predicted_fault": "Unknown",
            "confidence": 0.0,
            "all_probabilities": {},
            "fault_type": "schema_mismatch",
            "description": (
                "Legacy feature schema detected. "
                "Switch to FaultAnalyzer.analyze(circuit_data, voltages, currents)."
            ),
        }

    def is_model_loaded(self) -> bool:
        return self.model_loaded

    # ── Internals ─────────────────────────────────────────────────────────────

    def _predict(self, features: Dict[str, float], component_values: Dict[str, float]) -> Dict:
        """Run the RandomForest and format a response."""
        X = pd.DataFrame([features]).reindex(columns=self._feature_cols, fill_value=0)

        # Per-label probabilities
        proba_per_label = self._clf.predict_proba(X)
        label_probs: Dict[str, float] = {}
        for i, label in enumerate(self._label_cols):
            arr     = proba_per_label[i][0]
            classes = list(self._clf.classes_[i]) if hasattr(self._clf, "estimators_") else [0, 1]
            p_yes   = arr[classes.index(1)] if 1 in classes else 0.0
            label_probs[label] = float(p_yes)

        # Fired labels (above threshold)
        fired = [lbl for lbl, p in label_probs.items() if p >= THRESHOLD]
        top_label, top_prob = max(label_probs.items(), key=lambda kv: kv[1])

        if not fired:
            predicted = "Normal"
            confidence = 1.0 - top_prob           # confidence *no* fault
            fault_type = "Normal"
        elif len(fired) == 1:
            predicted  = fired[0]
            confidence = label_probs[fired[0]]
            fault_type = fired[0]
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
            "Normal": "Circuit operating within normal parameters.",
            "drift": (
                "Component value drift detected. One or more components have aged "
                "or drifted from their rated value (20–70 % off nominal)."
            ),
            "partial_short": (
                "Partial short circuit detected. A component shows abnormally low "
                "resistance (1–15 % of nominal), indicating a near-short fault."
            ),
            "partial_open": (
                "Partial open circuit detected. A component shows abnormally high "
                "resistance (5–50× nominal), indicating a near-open fault."
            ),
            "wrong_component_type": (
                "Wrong component type detected. The circuit's electrical behaviour "
                "is consistent with a component being replaced by the wrong type "
                "(e.g. a capacitor where a resistor is expected)."
            ),
            "Multiple_Faults": (
                "Multiple simultaneous faults detected: "
                + ", ".join(fired)
                + ". The circuit exhibits signatures of more than one fault class."
            ),
            "prediction_error":  "An error occurred during fault prediction.",
            "schema_mismatch":   "Feature schema mismatch — see description.",
            "model_unavailable": "ML model not loaded. Run python src/train.py first.",
        }
        return descriptions.get(fault_type, f"Fault type: {fault_type}")

    @staticmethod
    def _unavailable_response() -> Dict:
        return {
            "predicted_fault": "Unknown",
            "confidence": 0.0,
            "all_probabilities": {},
            "fault_type": "model_unavailable",
            "description": (
                "ML model not loaded. Install scikit-learn/joblib/pandas "
                "and run: python src/train.py"
            ),
        }


def analyze_faults(ml_features: Dict) -> Optional[Dict]:
    """Legacy convenience wrapper."""
    return FaultAnalyzer().analyze_pattern_faults(ml_features)
