"""
Fault Report Generator with Symbolic Circuit Analysis

Generates comprehensive fault reports including:
- Circuit metadata and topology analysis
- Symbolic nodal analysis using SymPy (KCL equations, automatic solving)
- Per-component fault breakdown with ML predictions
- RAG-based explanations from textbook
- Severity rankings and recommendations
"""

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from pathlib import Path
import re

try:
    import sympy as sp
    from sympy import symbols, Eq, solve, simplify
    SYMPY_AVAILABLE = True
except ImportError:
    SYMPY_AVAILABLE = False

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted, Image
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

import base64
import io
import math


# ============================================================================
# Hardcoded Fault Explanations (replaces RAG/Gemini API calls)
# ============================================================================

FAULT_EXPLANATIONS = {
    "partial_open": (
        "A partial open fault can occur when unintended resistance builds up along "
        "the internal path of {component_id}, restricting — but not fully blocking — "
        "normal current flow. This is often caused by corrosion, a degraded solder "
        "joint, or gradual internal damage from thermal or electrical stress. The "
        "measured value of {actual_value} against a nominal {nominal_value} "
        "(a {deviation} deviation) indicates {component_id} is operating well "
        "outside its expected tolerance."
    ),
    "partial_short": (
        "A partial short fault occurs when {component_id} develops an unintended "
        "low-resistance path alongside its normal one, causing more current to flow "
        "than expected without fully bypassing the component. This can stem from "
        "insulation breakdown, moisture ingress, or a manufacturing defect. The "
        "actual value of {actual_value} compared to the nominal {nominal_value} "
        "({deviation} deviation) is consistent with this partial degradation."
    ),
    "wrong_component_type": (
        "This fault indicates {component_id} does not match its expected component "
        "type or specification — the simulated electrical behavior is consistent "
        "with a different type or value than what the circuit design calls for. "
        "This usually points to an assembly error, such as a component being placed "
        "in the wrong footprint, or a mislabeled/miss-picked part during construction. "
        "The nominal value of {nominal_value} does not match the observed behavior "
        "of {actual_value}."
    ),
}

MULTI_FAULT_RECOMMENDATIONS = {
    frozenset(["partial_short", "partial_open"]): {
        "severity": "CRITICAL",
        "explanation": (
            "Two different components show resistance deviations in opposite "
            "directions — {short_component} reads well below its design value, "
            "and {open_component} reads well above it."
        ),
        "actions": [
            "Check {short_component}'s value against what you originally set it to.",
            "Check {open_component}'s value against what you originally set it to.",
            "Reset any unintended changes and resimulate.",
            "Since {short_component}'s deviation changes current flow through the "
            "rest of the circuit, re-check {open_component} after fixing "
            "{short_component} — its deviation may look different once the short is corrected.",
        ]
    },
    frozenset(["partial_short", "wrong_component_type"]): {
        "severity": "CRITICAL",
        "explanation": (
            "{short_component} shows a resistance well below its design value, "
            "and {wrong_component}'s simulated behavior doesn't match its declared type."
        ),
        "actions": [
            "Check {wrong_component}'s type and value first — a mismatched "
            "component can affect current elsewhere in the circuit.",
            "Check {short_component}'s value against what you originally set it to.",
            "Correct {wrong_component}, then resimulate to see if {short_component}'s "
            "deviation persists or was a side effect.",
        ]
    },
    frozenset(["partial_open", "wrong_component_type"]): {
        "severity": "HIGH",
        "explanation": (
            "{open_component} shows a resistance well above its design value, "
            "and {wrong_component}'s simulated behavior doesn't match its declared type."
        ),
        "actions": [
            "Check {wrong_component}'s type and value first — a mismatched "
            "component can change how current reaches other parts of the circuit.",
            "Check {open_component}'s value against what you originally set it to.",
            "Correct {wrong_component}, then resimulate to see if {open_component}'s "
            "deviation persists or was a side effect.",
        ]
    },
    frozenset(["partial_short", "partial_open", "wrong_component_type"]): {
        "severity": "CRITICAL",
        "explanation": (
            "Three separate components show deviations: {short_component} reads "
            "well below its design value, {open_component} reads well above it, "
            "and {wrong_component}'s behavior doesn't match its declared type."
        ),
        "actions": [
            "Check {wrong_component}'s type and value first — it's the most likely "
            "to be affecting the others' readings.",
            "Check {short_component} and {open_component} against their original values.",
            "Correct {wrong_component}, resimulate, and re-check whether the "
            "other two deviations are still present.",
        ]
    },
}


def get_fault_explanation(faults: List['FaultDetail']) -> str:
    """
    Generate fault explanation from hardcoded templates (no API calls).
    
    Args:
        faults: List of FaultDetail objects with fault_type, component_id, etc.
    
    Returns:
        Formatted explanation string
    """
    if not faults:
        return "No faults detected."
    
    # Extract unique fault types
    fault_types = list(set(f.fault_type for f in faults))
    
    # Single fault type
    if len(fault_types) == 1:
        fault = faults[0]  # Use first fault for template
        template_data = FAULT_EXPLANATIONS.get(fault.fault_type, "Fault detected: {fault_type}")
        
        # Format values
        actual_val = format_value_with_unit(
            fault.deviation_metrics.get('actual', 0),
            _get_unit_from_fault(fault)
        )
        nominal_val = format_value_with_unit(
            fault.deviation_metrics.get('nominal', 0),
            _get_unit_from_fault(fault)
        )
        deviation = f"{fault.deviation_metrics.get('deviation_pct', 0):+.1f}%"
        
        return template_data.format(
            component_id=fault.component_id,
            actual_value=actual_val,
            nominal_value=nominal_val,
            deviation=deviation,
            fault_type=fault.fault_type
        )
    
    # Multiple fault types
    fault_set = frozenset(fault_types)
    multi_fault_data = MULTI_FAULT_RECOMMENDATIONS.get(fault_set)
    
    if not multi_fault_data:
        # Fallback for unexpected combinations
        return f"Multiple faults detected: {', '.join(fault_types)}. Each fault should be addressed individually."
    
    # Build component mapping by fault type
    component_map = {}
    for fault in faults:
        if fault.fault_type == "partial_short":
            component_map["short_component"] = fault.component_id
        elif fault.fault_type == "partial_open":
            component_map["open_component"] = fault.component_id
        elif fault.fault_type == "wrong_component_type":
            component_map["wrong_component"] = fault.component_id
    
    # Handle case where same component has multiple fault types
    components_involved = set(component_map.values())
    if len(components_involved) == 1:
        # All faults are on the same component
        single_component = list(components_involved)[0]
        return (
            f"{single_component} exhibits multiple fault patterns simultaneously: "
            f"{', '.join(fault_types)}. This suggests conflicting deviations detected "
            f"by the ML model — check {single_component}'s value against its original "
            f"design specification and verify the circuit behavior is as expected."
        )
    
    return multi_fault_data["explanation"].format(**component_map)


def _get_unit_from_fault(fault: 'FaultDetail') -> str:
    """Extract unit from component ID (R=Ω, V=V, I=A)."""
    comp_id = fault.component_id
    if comp_id.startswith('R'):
        return 'Ω'
    elif comp_id.startswith('V'):
        return 'V'
    elif comp_id.startswith('I'):
        return 'A'
    elif comp_id.startswith('C'):
        return 'F'
    elif comp_id.startswith('L'):
        return 'H'
    return ''


# ============================================================================
# Formatting Utilities
# ============================================================================

def format_scientific(value: float, precision: int = 3) -> str:
    """
    Format a number in scientific notation with proper superscripts for PDF.
    Uses <super> tags for reportlab Paragraph rendering.
    
    Examples:
        100 → "1.000 × 10<super>2</super>"
        0.005 → "5.000 × 10<super>-3</super>"
        5000 → "5.000 × 10<super>3</super>"
    """
    if value == 0:
        return "0.000"
    
    # Get exponent and mantissa
    exponent = int(math.floor(math.log10(abs(value))))
    mantissa = value / (10 ** exponent)
    
    # Format mantissa
    mantissa_str = f"{mantissa:.{precision}f}"
    
    # For small exponents, just show the number directly
    if -2 <= exponent <= 3:
        if abs(value) >= 1:
            return f"{value:.{precision}f}"
        else:
            return f"{value:.{precision}f}"
    
    # Use reportlab's super tag for superscript
    return f"{mantissa_str} × 10<super>{exponent}</super>"


def format_value_with_unit(value: float, unit: str, precision: int = 3) -> str:
    """Format a value with its unit in scientific notation."""
    if value is None:
        return "N/A"
    formatted_val = format_scientific(value, precision)
    return f"{formatted_val} {unit}" if unit else formatted_val


# ============================================================================
# Data Structures
# ============================================================================

@dataclass
class ComponentSnapshot:
    """Snapshot of a single component."""
    id: str
    type: str
    nominal_value: Optional[float]
    actual_value: Optional[float]
    deviation_pct: Optional[float]
    unit: str
    nodes: List[str]


@dataclass
class KCLEquation:
    """Single KCL equation for a node."""
    node: str
    equation_str: str
    currents: List[str]


@dataclass
class SymbolicAnalysis:
    """Results from symbolic circuit analysis."""
    kcl_equations: List[KCLEquation]
    solved_voltages: Dict[str, str]  # node -> symbolic expression
    branch_currents: Dict[str, str]  # component_id -> symbolic expression
    numeric_voltages: Dict[str, float]  # node -> numeric value
    numeric_currents: Dict[str, float]  # component_id -> numeric value
    cross_check_status: str  # "PASS" or "FAIL"
    cross_check_details: List[str]
    error: Optional[str] = None


@dataclass
class FaultDetail:
    """Details of a detected fault."""
    component_id: str
    fault_type: str
    confidence: float
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    deviation_metrics: Dict[str, float]
    explanation: Optional[str] = None


@dataclass
class Recommendation:
    """Action recommendation for a fault."""
    fault_type: str
    severity: str
    actions: List[str]
    priority: int


@dataclass
class FaultReport:
    """Complete fault analysis report."""
    # Header
    circuit_id: str
    timestamp: str
    topology_type: str
    overall_status: str  # "Healthy" or "Fault(s) Detected"
    
    # Circuit snapshot
    components: List[ComponentSnapshot]
    
    # Simulation summary
    node_voltages: Dict[str, float]
    branch_currents: Dict[str, float]
    nominal_baseline: Dict[str, float]
    symbolic_analysis: Optional[SymbolicAnalysis]
    
    # Fault breakdown
    structural_faults: List[str]  # Structural/connectivity faults
    detected_faults: List[FaultDetail]  # ML-detected parametric faults
    ml_predictions: Dict[str, Any]
    
    # Recommendations
    recommendations: List[Recommendation]
    
    # Appendix
    netlist: str
    full_voltage_table: Dict[str, float]
    full_current_table: Dict[str, float]
    
    # Metadata
    generation_time_ms: Optional[float] = None


# ============================================================================
# Symbolic Circuit Analyzer
# ============================================================================

class SymbolicCircuitAnalyzer:
    """Automatic nodal analysis with symbolic KCL equation generation."""
    
    def __init__(self, netlist: str, circuit_data: Dict, ground: str = "0"):
        self.netlist = netlist
        self.circuit_data = circuit_data
        self.ground = ground
        self.components = circuit_data.get("components", [])
        self.nodes = [n for n in circuit_data.get("nodes", []) if n != ground]
        
    def analyze(self) -> SymbolicAnalysis:
        """Perform complete symbolic analysis."""
        if not SYMPY_AVAILABLE:
            return SymbolicAnalysis(
                kcl_equations=[],
                solved_voltages={},
                branch_currents={},
                numeric_voltages={},
                numeric_currents={},
                cross_check_status="SKIPPED",
                cross_check_details=["SymPy not available"],
                error="SymPy not installed"
            )
        
        try:
            # Step 1: Create symbolic voltage variables
            voltage_symbols = {node: symbols(f'V_{node}', real=True) for node in self.nodes}
            
            # Step 2: Generate KCL equations for each node
            kcl_equations, equations_list = self._generate_kcl_equations(voltage_symbols)
            
            # Step 3: Solve the system symbolically
            if not equations_list:
                return self._empty_result("No equations to solve")
            
            solution = solve(equations_list, list(voltage_symbols.values()))
            
            # Step 4: Calculate branch currents from solved voltages
            solved_voltages = {node: str(simplify(solution.get(voltage_symbols[node], 0))) 
                              for node in self.nodes}
            solved_voltages[self.ground] = "0"
            
            branch_currents = self._calculate_branch_currents(voltage_symbols, solution)
            
            # Step 5: Evaluate numerically
            numeric_voltages = self._evaluate_numeric_voltages(voltage_symbols, solution)
            numeric_currents = self._evaluate_numeric_currents(voltage_symbols, solution)
            
            return SymbolicAnalysis(
                kcl_equations=kcl_equations,
                solved_voltages=solved_voltages,
                branch_currents=branch_currents,
                numeric_voltages=numeric_voltages,
                numeric_currents=numeric_currents,
                cross_check_status="READY",
                cross_check_details=[]
            )
            
        except Exception as e:
            return self._empty_result(f"Symbolic analysis failed: {e}")
    
    def _generate_kcl_equations(self, voltage_symbols: Dict) -> Tuple[List[KCLEquation], List]:
        """Generate KCL equations for all non-reference nodes."""
        kcl_list = []
        equations = []
        
        for node in self.nodes:
            currents_leaving = []
            current_terms = []
            
            for comp in self.components:
                comp_type = comp.get("type", "")
                comp_id = comp.get("id", "")
                comp_value = comp.get("value", 0)
                comp_nodes = comp.get("nodes", [])
                
                if len(comp_nodes) < 2:
                    continue
                
                n1, n2 = comp_nodes[0], comp_nodes[1]
                
                # Check if this component connects to the current node
                if node not in (n1, n2):
                    continue
                
                # Determine current direction (leaving node = positive)
                if comp_type == "resistor":
                    if comp_value == 0:
                        continue
                    R = comp_value
                    
                    # Current through resistor: I = (V_n1 - V_n2) / R
                    v1 = voltage_symbols.get(n1, 0) if n1 != self.ground else 0
                    v2 = voltage_symbols.get(n2, 0) if n2 != self.ground else 0
                    
                    if n1 == node:
                        # Current leaving node: I = (V_node - V_other) / R
                        current = (v1 - v2) / R
                        current_terms.append(current)
                        currents_leaving.append(f"I_{comp_id} = (V_{n1} - V_{n2})/{R}")
                    else:  # n2 == node
                        # Current leaving node: I = (V_node - V_other) / R
                        current = (v2 - v1) / R
                        current_terms.append(current)
                        currents_leaving.append(f"I_{comp_id} = (V_{n2} - V_{n1})/{R}")
                
                elif comp_type == "dc_source":
                    # Voltage source: V_n1 - V_n2 = V_source
                    # Current through voltage source is unknown (dependent variable)
                    # For simplicity in DC analysis, we'll use Norton/Thevenin when possible
                    # Here we'll use a symbolic current variable
                    V_source = comp_value
                    I_source_sym = symbols(f'I_{comp_id}', real=True)
                    
                    if n1 == node:
                        current_terms.append(I_source_sym)
                        currents_leaving.append(f"I_{comp_id}")
                    else:
                        current_terms.append(-I_source_sym)
                        currents_leaving.append(f"-I_{comp_id}")
                
                elif comp_type == "current_source":
                    # Independent current source
                    I_source = comp_value
                    
                    if n1 == node:
                        # Current entering at positive terminal
                        current_terms.append(-I_source)
                        currents_leaving.append(f"-{I_source}")
                    else:
                        # Current leaving at negative terminal
                        current_terms.append(I_source)
                        currents_leaving.append(f"{I_source}")
                
                # Capacitors = open circuit (DC steady state)
                # Inductors = short circuit (DC steady state) - but this creates issues
                # For now, skip caps and inductors in symbolic analysis
            
            # KCL: sum of currents leaving = 0
            if current_terms:
                kcl_eq = sum(current_terms)
                equations.append(Eq(kcl_eq, 0))
                
                kcl_list.append(KCLEquation(
                    node=node,
                    equation_str=f"KCL at {node}: " + " + ".join(currents_leaving) + " = 0",
                    currents=currents_leaving
                ))
        
        return kcl_list, equations
    
    def _calculate_branch_currents(self, voltage_symbols: Dict, solution: Dict) -> Dict[str, str]:
        """Calculate branch currents using Ohm's law from solved voltages."""
        branch_currents = {}
        
        for comp in self.components:
            comp_type = comp.get("type", "")
            comp_id = comp.get("id", "")
            comp_value = comp.get("value", 0)
            comp_nodes = comp.get("nodes", [])
            
            if len(comp_nodes) < 2:
                continue
            
            n1, n2 = comp_nodes[0], comp_nodes[1]
            
            if comp_type == "resistor" and comp_value > 0:
                v1 = solution.get(voltage_symbols.get(n1, 0), 0) if n1 != self.ground else 0
                v2 = solution.get(voltage_symbols.get(n2, 0), 0) if n2 != self.ground else 0
                I = (v1 - v2) / comp_value
                branch_currents[comp_id] = str(simplify(I))
            
            elif comp_type == "current_source":
                branch_currents[comp_id] = str(comp_value)
        
        return branch_currents
    
    def _evaluate_numeric_voltages(self, voltage_symbols: Dict, solution: Dict) -> Dict[str, float]:
        """Evaluate symbolic voltages numerically."""
        numeric = {self.ground: 0.0}
        
        for node in self.nodes:
            sym_expr = solution.get(voltage_symbols[node], 0)
            try:
                numeric[node] = float(sym_expr.evalf())
            except:
                numeric[node] = 0.0
        
        return numeric
    
    def _evaluate_numeric_currents(self, voltage_symbols: Dict, solution: Dict) -> Dict[str, float]:
        """Evaluate symbolic currents numerically."""
        numeric = {}
        
        branch_currents = self._calculate_branch_currents(voltage_symbols, solution)
        
        for comp_id, expr_str in branch_currents.items():
            try:
                expr = sp.sympify(expr_str)
                numeric[comp_id] = float(expr.evalf())
            except:
                numeric[comp_id] = 0.0
        
        return numeric
    
    def _empty_result(self, error_msg: str) -> SymbolicAnalysis:
        """Return empty result with error message."""
        return SymbolicAnalysis(
            kcl_equations=[],
            solved_voltages={},
            branch_currents={},
            numeric_voltages={},
            numeric_currents={},
            cross_check_status="ERROR",
            cross_check_details=[error_msg],
            error=error_msg
        )
    
    def cross_check_with_ngspice(self, ngspice_voltages: Dict[str, float], 
                                  ngspice_currents: Dict[str, float],
                                  tolerance: float = 0.01) -> Tuple[str, List[str]]:
        """Cross-check symbolic results against ngspice numerical results."""
        symbolic = self.analyze()
        
        if symbolic.error:
            return "ERROR", [symbolic.error]
        
        details = []
        has_fail    = False
        has_warning = False

        # Zero-threshold: values below this are treated as zero to avoid
        # false mismatches from floating-point noise near the reference node.
        ZERO_THRESHOLD = 1e-9

        def _classify(ng_val, sym_val, label, unit):
            """
            Compare one pair of values and return (severity, message).
            severity: 'pass' | 'warning' | 'fail'
            """
            ng  = 0.0 if abs(ng_val)  < ZERO_THRESHOLD else ng_val
            sym = 0.0 if abs(sym_val) < ZERO_THRESHOLD else sym_val

            # Both effectively zero — trivial match
            if ng == 0.0 and sym == 0.0:
                return 'pass', None

            mag_ng  = abs(ng)
            mag_sym = abs(sym)

            # Magnitude relative difference
            mag_diff     = abs(mag_ng - mag_sym)
            mag_rel_diff = mag_diff / (mag_ng + 1e-9)

            if mag_rel_diff <= tolerance:
                # Magnitudes agree — check sign
                if (ng >= 0) == (sym >= 0):
                    return 'pass', None
                else:
                    return 'warning', (
                        f"Sign convention difference at {label}: "
                        f"ngspice={ng:.6f}{unit}, symbolic={sym:.6f}{unit} "
                        f"(magnitudes match; opposite reference directions)."
                    )
            else:
                return 'fail', (
                    f"Magnitude mismatch at {label}: "
                    f"ngspice={ng:.6f}{unit}, symbolic={sym:.6f}{unit} "
                    f"(diff={mag_diff:.6f}{unit})."
                )

        # Check voltages
        for node, ng_voltage in ngspice_voltages.items():
            sym_voltage = symbolic.numeric_voltages.get(node)
            if sym_voltage is None:
                continue
            sev, msg = _classify(ng_voltage, sym_voltage, f"node {node}", "V")
            if sev == 'fail':
                has_fail = True
                details.append(msg)
            elif sev == 'warning':
                has_warning = True
                details.append(msg)

        # Check currents
        for comp_id, ng_current in ngspice_currents.items():
            sym_current = symbolic.numeric_currents.get(comp_id)
            if sym_current is None:
                continue
            sev, msg = _classify(ng_current, sym_current, comp_id, "A")
            if sev == 'fail':
                has_fail = True
                details.append(msg)
            elif sev == 'warning':
                has_warning = True
                details.append(msg)

        if has_fail:
            status = "FAIL"
        elif has_warning:
            status = "WARNING"
            details.insert(0, "Sign convention difference detected — magnitudes agree.")
        else:
            status = "PASS"
            details.append("All voltages and currents match within tolerance.")

        return status, details


# ============================================================================
# Fault Severity Classifier
# ============================================================================

class SeverityClassifier:
    """Classifies fault severity based on type and metrics."""
    
    SEVERITY_RULES = {
        "partial_short": "CRITICAL",
        "full_short": "CRITICAL",
        "partial_open": "HIGH",
        "full_open": "HIGH",
        "wrong_component_type": "MEDIUM",
        "value_drift": "LOW",
        "Normal": "INFO",
    }
    
    @classmethod
    def classify(cls, fault_type: str, deviation_pct: Optional[float] = None) -> str:
        """Determine severity level for a fault."""
        base_severity = cls.SEVERITY_RULES.get(fault_type, "MEDIUM")
        
        # Adjust based on deviation magnitude
        if deviation_pct is not None:
            if deviation_pct > 500:  # >500% deviation
                return "CRITICAL"
            elif deviation_pct > 100:  # >100% deviation
                return "HIGH"
        
        return base_severity


# ============================================================================
# Recommendation Engine
# ============================================================================

class RecommendationEngine:
    """Generates actionable recommendations for detected faults."""
    
    RECOMMENDATIONS = {
        "partial_short": {
            "severity": "CRITICAL",
            "explanation": (
                "The simulated resistance for this component is significantly lower "
                "than its original design value — consistent with a short."
            ),
            "actions": [
                "Check this component's value against what you originally set it to.",
                "If you didn't intend to change it, reset it to the correct value and resimulate.",
                "If the value is correct, the short may be coming from how this component "
                "is wired — check for an unintended low-resistance path in the connections.",
            ]
        },
        "partial_open": {
            "severity": "HIGH",
            "explanation": (
                "The simulated resistance for this component is significantly higher "
                "than its original design value — consistent with an open or near-open path."
            ),
            "actions": [
                "Check this component's value against what you originally set it to.",
                "If you didn't intend to change it, reset it to the correct value and resimulate.",
                "If wiring looks correct and the value is right, verify the component "
                "isn't accidentally disconnected — a fully open connection may also be "
                "flagged separately under Structural Faults.",
            ]
        },
        "wrong_component_type": {
            "severity": "MEDIUM",
            "explanation": (
                "This component's simulated electrical behavior doesn't match what's "
                "expected for its declared type — as if a different kind of component "
                "were sitting in this position."
            ),
            "actions": [
                "Confirm the component type (resistor, capacitor, etc.) matches your design.",
                "Check the component's value is reasonable for its type.",
                "Replace the component if it was swapped by mistake, then resimulate.",
            ]
        },
        "Normal": {
            "severity": "INFO",
            "explanation": "No fault patterns were detected in this circuit.",
            "actions": [
                "No action needed.",
                "Review node voltages and branch currents directly if you want more detail.",
            ]
        }
    }
    
    @classmethod
    def generate(cls, fault_type: str, severity: str, faults: List) -> Recommendation:
        """Generate recommendation for a single fault type."""
        template = cls.RECOMMENDATIONS.get(fault_type, cls.RECOMMENDATIONS["Normal"])
        
        return Recommendation(
            fault_type=fault_type,
            severity=severity,
            actions=template["actions"],
            priority=0
        )
    
    @classmethod
    def generate_multi_fault(cls, faults: List) -> Recommendation:
        """Generate recommendation for multiple fault types."""
        fault_types = list(set(f.fault_type for f in faults))
        fault_set = frozenset(fault_types)
        
        multi_fault_data = MULTI_FAULT_RECOMMENDATIONS.get(fault_set)
        
        if not multi_fault_data:
            # Fallback
            return Recommendation(
                fault_type="Multiple_Faults",
                severity="HIGH",
                actions=["Address each fault type individually."],
                priority=0
            )
        
        # Build component mapping
        component_map = {}
        for fault in faults:
            if fault.fault_type == "partial_short":
                component_map["short_component"] = fault.component_id
            elif fault.fault_type == "partial_open":
                component_map["open_component"] = fault.component_id
            elif fault.fault_type == "wrong_component_type":
                component_map["wrong_component"] = fault.component_id
        
        # Check if all faults are on the same component
        components_involved = set(component_map.values())
        if len(components_involved) == 1:
            # All faults on same component - use simplified recommendation
            single_component = list(components_involved)[0]
            actions = [
                f"Check {single_component}'s value against what you originally set it to.",
                f"The ML model detected conflicting fault patterns for {single_component} — "
                f"this may indicate the component value is far from its design specification, "
                f"causing multiple different electrical behaviors.",
                f"Reset {single_component} to its correct design value and resimulate.",
                f"If the value is already correct, verify your design calculations and "
                f"component selection are appropriate for this circuit."
            ]
        else:
            # Multiple components - use original template
            actions = [action.format(**component_map) for action in multi_fault_data["actions"]]
        
        return Recommendation(
            fault_type="Multiple_Faults",
            severity=multi_fault_data["severity"],
            actions=actions,
            priority=0
        )


# ============================================================================
# Report Generator
# ============================================================================

class FaultReportGenerator:
    """Main report generator orchestrating all analysis components."""
    
    def __init__(self, circuit_id: str = "unnamed_circuit"):
        self.circuit_id = circuit_id
    
    def generate(self,
                 circuit_data: Dict,
                 netlist: str,
                 simulation_result: Dict,
                 ml_predictions: Dict,
                 structural_faults: List[str],
                 nominal_values: Optional[Dict[str, float]] = None) -> FaultReport:
        """
        Generate complete fault report.
        
        Args:
            circuit_data: Circuit structure from frontend
            netlist: Generated SPICE netlist
            simulation_result: ngspice output (voltages, currents)
            ml_predictions: Fault analyzer ML predictions
            structural_faults: List of structural fault messages
            nominal_values: Expected nominal component values
        """
        start_time = datetime.now()
        
        # Determine overall status
        fault_type = ml_predictions.get("fault_type", "Unknown")
        has_ml_faults = fault_type != "Normal"
        has_structural_faults = len(structural_faults) > 0
        overall_status = "Healthy" if (not has_ml_faults and not has_structural_faults) else "Fault(s) Detected"
        
        # Build component snapshots
        components = self._build_component_snapshots(
            circuit_data, nominal_values, ml_predictions.get("drift_warnings", [])
        )
        
        # Extract simulation data
        node_voltages = simulation_result.get("voltages", {})
        branch_currents = simulation_result.get("currents", {})
        
        # Perform symbolic analysis
        symbolic_analyzer = SymbolicCircuitAnalyzer(
            netlist, circuit_data, circuit_data.get("ground", "0")
        )
        symbolic_analysis = symbolic_analyzer.analyze()
        
        # Cross-check if symbolic analysis succeeded
        if not symbolic_analysis.error:
            status, details = symbolic_analyzer.cross_check_with_ngspice(
                node_voltages, branch_currents
            )
            symbolic_analysis.cross_check_status = status
            symbolic_analysis.cross_check_details = details
        
        # Extract fault details
        detected_faults = self._extract_fault_details(
            ml_predictions, nominal_values or {}
        )
        
        # Generate recommendations (considering both structural and parametric faults)
        recommendations = self._generate_recommendations(detected_faults, structural_faults)
        # No sorting needed - display in order detected
        
        # Build final report
        end_time = datetime.now()
        generation_time = (end_time - start_time).total_seconds() * 1000
        
        return FaultReport(
            circuit_id=self.circuit_id,
            timestamp=start_time.isoformat(),
            topology_type=self._infer_topology(circuit_data),
            overall_status=overall_status,
            components=components,
            node_voltages=node_voltages,
            branch_currents=branch_currents,
            nominal_baseline=nominal_values or {},
            symbolic_analysis=symbolic_analysis,
            structural_faults=structural_faults,
            detected_faults=detected_faults,
            ml_predictions=ml_predictions,
            recommendations=recommendations,
            netlist=netlist,
            full_voltage_table=node_voltages,
            full_current_table=branch_currents,
            generation_time_ms=generation_time
        )
    
    def _build_component_snapshots(self, circuit_data: Dict, 
                                   nominal_values: Optional[Dict[str, float]],
                                   drift_warnings: List[Dict]) -> List[ComponentSnapshot]:
        """Build component snapshot list."""
        snapshots = []
        drift_map = {d["component_id"]: d for d in drift_warnings}
        
        for comp in circuit_data.get("components", []):
            comp_id = comp.get("id", "")
            comp_type = comp.get("type", "")
            actual_value = comp.get("value")
            nominal_value = nominal_values.get(comp_id) if nominal_values else actual_value
            
            drift_info = drift_map.get(comp_id)
            deviation_pct = drift_info.get("deviation_pct") if drift_info else None
            
            unit = self._get_unit_for_type(comp_type)
            
            snapshots.append(ComponentSnapshot(
                id=comp_id,
                type=comp_type,
                nominal_value=nominal_value,
                actual_value=actual_value,
                deviation_pct=deviation_pct,
                unit=unit,
                nodes=comp.get("nodes", [])
            ))
        
        return snapshots
    
    def _extract_fault_details(self, ml_predictions: Dict, 
                               nominal_values: Dict[str, float]) -> List[FaultDetail]:
        """Extract detailed fault information from ML predictions."""
        faults = []
        
        fault_type = ml_predictions.get("fault_type", "Unknown")
        confidence = ml_predictions.get("confidence", 0.0)
        all_probs = ml_predictions.get("all_probabilities", {})
        drift_warnings = ml_predictions.get("drift_warnings", [])
        
        # Check if Multiple_Faults - need to extract individual fault types
        if fault_type == "Multiple_Faults":
            # Get the fired fault types (those with probability >= 0.5)
            fired_faults = [ft for ft, prob in all_probs.items() if prob >= 0.5 and ft != "Normal"]
            
            # Track which components have been assigned to which faults
            used_components = set()
            
            # First pass: match faults to components with strong deviation signals
            for fired_fault_type in fired_faults:
                for drift in drift_warnings:
                    comp_id = drift["component_id"]
                    if comp_id in used_components:
                        continue  # Already assigned to another fault
                    
                    deviation_pct = drift["deviation_pct"]
                    
                    # Determine if this component matches this fault type
                    # Deviation is: (actual - nominal) / nominal * 100
                    # Negative deviation = actual < nominal = SHORT (lower resistance)
                    # Positive deviation = actual > nominal = OPEN (higher resistance)
                    component_matches = False
                    if fired_fault_type == "partial_short" and deviation_pct < -10:
                        component_matches = True
                    elif fired_fault_type == "partial_open" and deviation_pct > 10:
                        component_matches = True
                    elif fired_fault_type == "wrong_component_type":
                        # Wrong component type can have any deviation
                        component_matches = True
                    
                    if component_matches:
                        severity = SeverityClassifier.classify(fired_fault_type, abs(deviation_pct))
                        
                        faults.append(FaultDetail(
                            component_id=comp_id,
                            fault_type=fired_fault_type,
                            confidence=all_probs.get(fired_fault_type, confidence),
                            severity=severity,
                            deviation_metrics={
                                "deviation_pct": deviation_pct,
                                "actual": drift["actual"],
                                "nominal": drift["nominal"]
                            },
                            explanation=None
                        ))
                        used_components.add(comp_id)
                        break  # Found a match for this fault type
            
            # Second pass: assign any unmatched fired faults to the most deviated component
            # (This handles cases where ML detects multiple faults but only one component shows deviation)
            if len(faults) < len(fired_faults) and drift_warnings:
                # Find the most deviated component
                most_deviated = max(drift_warnings, key=lambda d: abs(d["deviation_pct"]))
                
                # Get fault types that haven't been matched yet
                matched_fault_types = {f.fault_type for f in faults}
                unmatched_faults = [ft for ft in fired_faults if ft not in matched_fault_types]
                
                # Assign all unmatched faults to the most deviated component
                for fired_fault_type in unmatched_faults:
                    severity = SeverityClassifier.classify(
                        fired_fault_type, 
                        abs(most_deviated["deviation_pct"])
                    )
                    
                    faults.append(FaultDetail(
                        component_id=most_deviated["component_id"],
                        fault_type=fired_fault_type,
                        confidence=all_probs.get(fired_fault_type, confidence),
                        severity=severity,
                        deviation_metrics={
                            "deviation_pct": most_deviated["deviation_pct"],
                            "actual": most_deviated["actual"],
                            "nominal": most_deviated["nominal"]
                        },
                        explanation=None
                    ))
        elif fault_type != "Normal":
            # Single fault type
            for drift in drift_warnings:
                comp_id = drift["component_id"]
                deviation_pct = drift["deviation_pct"]
                
                severity = SeverityClassifier.classify(fault_type, deviation_pct)
                
                faults.append(FaultDetail(
                    component_id=comp_id,
                    fault_type=fault_type,
                    confidence=confidence,
                    severity=severity,
                    deviation_metrics={
                        "deviation_pct": deviation_pct,
                        "actual": drift["actual"],
                        "nominal": drift["nominal"]
                    },
                    explanation=None
                ))
        
        return faults
    
    def _generate_recommendations(self, faults: List[FaultDetail], structural_faults: List[str]) -> List[Recommendation]:
        """Generate recommendations for all detected faults."""
        # If structural faults exist, those take priority
        if structural_faults:
            actions = ["Resolve all structural faults before performing parametric analysis:"]
            for fault_msg in structural_faults:
                # Extract actionable recommendation from fault message
                if "open" in fault_msg.lower() and "switch" in fault_msg.lower():
                    actions.append("Close the open switch to allow current to flow through the circuit.")
                elif "open circuit" in fault_msg.lower():
                    actions.append(f"Fix: {fault_msg}")
                elif "short circuit" in fault_msg.lower():
                    actions.append(f"Fix: {fault_msg}")
                elif "ammeter" in fault_msg.lower():
                    actions.append(f"Fix meter placement: {fault_msg}")
                elif "voltmeter" in fault_msg.lower():
                    actions.append(f"Fix meter placement: {fault_msg}")
                else:
                    actions.append(fault_msg)
            
            return [Recommendation(
                fault_type="Structural Faults",
                severity="CRITICAL",
                actions=actions,
                priority=0
            )]
        
        # No structural faults - proceed with parametric fault recommendations
        if not faults:
            return [RecommendationEngine.generate("Normal", "INFO", [])]
        
        # Check if multiple fault types exist
        fault_types = list(set(f.fault_type for f in faults))
        
        if len(fault_types) > 1:
            # Multi-fault case - generate combined recommendation
            return [RecommendationEngine.generate_multi_fault(faults)]
        else:
            # Single fault type - generate individual recommendations
            recommendations = []
            seen_types = set()
            
            for fault in faults:
                if fault.fault_type not in seen_types:
                    rec = RecommendationEngine.generate(fault.fault_type, fault.severity, faults)
                    recommendations.append(rec)
                    seen_types.add(fault.fault_type)
            
            return recommendations
    
    def _infer_topology(self, circuit_data: Dict) -> str:
        """Infer circuit topology type from structure."""
        components = circuit_data.get("components", [])
        
        resistor_count = sum(1 for c in components if c.get("type") == "resistor")
        source_count = sum(1 for c in components if c.get("type") in ("dc_source", "current_source"))
        
        if resistor_count == 0:
            return "Source-Only"
        elif resistor_count == 1 and source_count == 1:
            return "Simple Series"
        elif resistor_count == 2 and source_count == 1:
            return "Voltage Divider / Series"
        elif resistor_count >= 3:
            return "Complex Network"
        else:
            return "Custom"
    
    @staticmethod
    def _get_unit_for_type(comp_type: str) -> str:
        """Get unit string for component type."""
        units = {
            "resistor": "Ω",
            "capacitor": "F",
            "inductor": "H",
            "dc_source": "V",
            "current_source": "A",
            "voltmeter": "V",
            "ammeter": "A"
        }
        return units.get(comp_type, "")
    
    def to_dict(self, report: FaultReport) -> Dict:
        """Convert report to dictionary for JSON serialization."""
        return asdict(report)
    
    def add_rag_explanations(self, report: FaultReport) -> FaultReport:
        """Add explanations to fault details (using hardcoded templates, not RAG/API)."""
        if report.detected_faults:
            explanation = get_fault_explanation(report.detected_faults)
            # Add same explanation to all faults (or first fault for single-fault case)
            for fault in report.detected_faults:
                fault.explanation = explanation
        
        return report


# ============================================================================
# Export Functions
# ============================================================================

def generate_fault_report(circuit_id: str,
                         circuit_data: Dict,
                         netlist: str,
                         simulation_result: Dict,
                         ml_predictions: Dict,
                         structural_faults: List[str] = None,
                         nominal_values: Optional[Dict[str, float]] = None,
                         add_explanations: bool = True) -> FaultReport:
    """
    Convenience function to generate a fault report.
    
    Args:
        circuit_id: Unique identifier for the circuit
        circuit_data: Circuit structure dictionary
        netlist: SPICE netlist string
        simulation_result: Dictionary with 'voltages' and 'currents' from ngspice
        ml_predictions: ML fault predictions from FaultAnalyzer
        structural_faults: List of structural fault messages (disconnections, shorts, etc.)
        nominal_values: Expected nominal component values
        add_explanations: Whether to add hardcoded fault explanations (default True)
    
    Returns:
        FaultReport dataclass instance
    """
    generator = FaultReportGenerator(circuit_id)
    report = generator.generate(
        circuit_data, netlist, simulation_result, ml_predictions, 
        structural_faults or [], nominal_values
    )
    
    if add_explanations:
        report = generator.add_rag_explanations(report)
    
    return report


# ============================================================================
# PDF Report Generator
# ============================================================================

class PDFReportGenerator:
    """Generate human-readable PDF report from FaultReport."""
    
    def __init__(self):
        if not REPORTLAB_AVAILABLE:
            raise ImportError("reportlab is required for PDF generation. Install with: pip install reportlab")
        
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles."""
        # Title style
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            backColor=colors.white,
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#1a1a1a'),
            backColor=colors.white,
            spaceAfter=12,
            spaceBefore=20,
            fontName='Helvetica-Bold'
        ))
        
        # Subsection header
        self.styles.add(ParagraphStyle(
            name='SubsectionHeader',
            parent=self.styles['Heading3'],
            fontSize=13,
            textColor=colors.HexColor('#1a1a1a'),
            backColor=colors.white,
            spaceAfter=10,
            spaceBefore=15,
            fontName='Helvetica-Bold'
        ))
        
        # Normal text
        self.styles.add(ParagraphStyle(
            name='ReportBody',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=6,
            alignment=TA_JUSTIFY
        ))
        
        # Code style
        self.styles.add(ParagraphStyle(
            name='CodeBlock',
            parent=self.styles['Code'],
            fontSize=8,
            textColor=colors.HexColor('#2c3e50'),
            leftIndent=20,
            fontName='Courier'
        ))

        # Equation style — indented monospace block, larger than CodeBlock
        self.styles.add(ParagraphStyle(
            name='Equation',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#1a1a1a'),
            fontName='Courier',
            leftIndent=36,
            spaceAfter=4,
            spaceBefore=2,
        ))

        # Equation label — bold node name flush-left above the equation
        self.styles.add(ParagraphStyle(
            name='EquationLabel',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=colors.HexColor('#2c3e50'),
            fontName='Helvetica-Bold',
            leftIndent=18,
            spaceBefore=8,
            spaceAfter=1,
        ))
    
    def generate_pdf(self, report: FaultReport, output_path: str, circuit_image_base64: str = None):
        """
        Generate PDF report from FaultReport.
        
        Args:
            report: FaultReport instance
            output_path: Path to save PDF file
            circuit_image_base64: Optional base64 encoded circuit diagram image
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18
        )
        
        story = []
        
        # Build report sections
        story.extend(self._build_header(report))
        story.append(Spacer(1, 0.15 * inch))
        
        story.extend(self._build_overview(report))
        story.append(Spacer(1, 0.1 * inch))
        
        # Add circuit diagram if provided
        if circuit_image_base64:
            story.extend(self._build_circuit_diagram(circuit_image_base64))
            story.append(Spacer(1, 0.1 * inch))
        
        story.extend(self._build_component_snapshot(report))
        story.append(Spacer(1, 0.1 * inch))
        
        story.extend(self._build_simulation_summary(report))
        story.append(Spacer(1, 0.1 * inch))
        
        if report.symbolic_analysis and not report.symbolic_analysis.error:
            story.extend(self._build_symbolic_analysis(report))
            story.append(Spacer(1, 0.1 * inch))
        
        story.extend(self._build_fault_analysis(report))
        story.append(Spacer(1, 0.1 * inch))
        
        story.extend(self._build_recommendations(report))
        story.append(Spacer(1, 0.15 * inch))
        
        # Appendix (no page break, just more space)
        story.extend(self._build_appendix(report))
        
        # Build PDF
        doc.build(story)
    
    def _build_header(self, report: FaultReport) -> List:
        """Build report header section."""
        elements = []
        
        # Title
        elements.append(Paragraph("CIRCUIT FAULT ANALYSIS REPORT", self.styles['ReportTitle']))
        elements.append(Spacer(1, 0.1 * inch))
        
        # Status indicator
        status_color = colors.green if report.overall_status == "Healthy" else colors.red
        status_text = f'<font color="{status_color.hexval()}"><b>STATUS: {report.overall_status.upper()}</b></font>'
        elements.append(Paragraph(status_text, self.styles['ReportBody']))
        elements.append(Spacer(1, 0.08 * inch))
        
        # Metadata table
        meta_data = [
            ['Circuit ID:', report.circuit_id],
            ['Topology:', report.topology_type],
            ['Analysis Date:', datetime.fromisoformat(report.timestamp).strftime('%Y-%m-%d %H:%M:%S')],
            ['Generation Time:', f'{report.generation_time_ms:.2f} ms' if report.generation_time_ms else 'N/A']
        ]
        
        meta_table = Table(meta_data, colWidths=[2.5*inch, 3.5*inch])
        meta_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2c3e50')),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),   # Labels left-aligned
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),   # Values left-aligned
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ]))
        elements.append(meta_table)
        
        return elements
    
    def _build_overview(self, report: FaultReport) -> List:
        """Build overview section."""
        elements = []
        elements.append(Paragraph("1. EXECUTIVE SUMMARY", self.styles['SectionHeader']))
        
        structural_count = len(report.structural_faults)
        parametric_count = len(report.detected_faults)
        comp_count = len(report.components)
        
        if structural_count == 0 and parametric_count == 0:
            summary_text = f"All {comp_count} components are operating within normal parameters. No faults detected."
        else:
            summary_parts = []
            if structural_count > 0:
                summary_parts.append(f"{structural_count} structural fault(s)")
            if parametric_count > 0:
                summary_parts.append(f"{parametric_count} parametric fault(s)")
            
            summary_text = f"Detected {' and '.join(summary_parts)} in circuit with {comp_count} components. "
            
            if parametric_count > 0:
                summary_text += f"Primary ML fault type: <b>{report.ml_predictions.get('fault_type', 'Unknown')}</b> "
                summary_text += f"(confidence: {report.ml_predictions.get('confidence', 0)*100:.1f}%)."
        
        elements.append(Paragraph(summary_text, self.styles['ReportBody']))
        
        # Add structural faults section if any exist
        if structural_count > 0:
            elements.append(Spacer(1, 0.1 * inch))
            elements.append(Paragraph("<b>Structural Faults Detected:</b>", self.styles['ReportBody']))
            for i, fault in enumerate(report.structural_faults, 1):
                elements.append(Paragraph(f"{i}. {fault}", self.styles['ReportBody']))
        
        return elements
    
    def _build_circuit_diagram(self, circuit_image_base64: str) -> List:
        """Build circuit diagram section from base64 image."""
        elements = []
        elements.append(Paragraph("2. CIRCUIT DIAGRAM", self.styles['SectionHeader']))
        
        try:
            # Decode base64 image (remove data:image/png;base64, prefix if present)
            if ',' in circuit_image_base64:
                image_data = base64.b64decode(circuit_image_base64.split(',')[1])
            else:
                image_data = base64.b64decode(circuit_image_base64)
            
            # Create image buffer
            image_buffer = io.BytesIO(image_data)
            
            # Add image to PDF (fit to page width with aspect ratio)
            img = Image(image_buffer, width=6.5*inch, height=4*inch)
            elements.append(img)
            
        except Exception as e:
            elements.append(Paragraph(
                f"<i>Circuit diagram could not be embedded: {str(e)}</i>",
                self.styles['ReportBody']
            ))
        
        return elements
    
    def _build_component_snapshot(self, report: FaultReport) -> List:
        """Build component snapshot table."""
        elements = []
        elements.append(Paragraph("3. COMPONENT SNAPSHOT", self.styles['SectionHeader']))
        
        # Build table data
        table_data = [['ID', 'Type', 'Nominal', 'Actual', 'Deviation', 'Nodes']]
        
        for comp in report.components:
            nominal_str = format_value_with_unit(comp.nominal_value, comp.unit) if comp.nominal_value else "N/A"
            actual_str = format_value_with_unit(comp.actual_value, comp.unit) if comp.actual_value else "N/A"
            deviation_str = f"{comp.deviation_pct:+.1f}%" if comp.deviation_pct else "—"
            nodes_str = " ↔ ".join(comp.nodes)
            
            table_data.append([
                comp.id,
                comp.type.replace('_', ' ').title(),
                Paragraph(nominal_str, self.styles['ReportBody']),
                Paragraph(actual_str, self.styles['ReportBody']),
                deviation_str,
                nodes_str
            ])
        
        comp_table = Table(table_data, colWidths=[0.8*inch, 1*inch, 1.3*inch, 1.3*inch, 0.9*inch, 1.2*inch])
        comp_table.setStyle(TableStyle([
            # Header row
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
            
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # ID column centered
            ('ALIGN', (1, 1), (1, -1), 'LEFT'),     # Type column left
            ('ALIGN', (2, 1), (4, -1), 'CENTER'),   # Numeric columns centered
            ('ALIGN', (5, 1), (5, -1), 'CENTER'),   # Nodes column centered
            ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
            
            # Padding and spacing
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            
            # Grid and background
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')])
        ]))
        elements.append(comp_table)
        
        return elements
    
    def _build_simulation_summary(self, report: FaultReport) -> List:
        """Build simulation summary section."""
        elements = []
        elements.append(Paragraph("3. SIMULATION RESULTS", self.styles['SectionHeader']))
        
        # If no simulation data (due to structural faults), show message
        if not report.node_voltages and not report.branch_currents:
            elements.append(Paragraph(
                "Simulation could not complete due to structural faults. "
                "Resolve all structural issues to obtain simulation results.",
                self.styles['ReportBody']
            ))
            return elements

        # ── 3.1 Node Voltages ─────────────────────────────────────────────────
        elements.append(Paragraph("3.1 Node Voltages", self.styles['SubsectionHeader']))

        if report.node_voltages:
            voltage_data = [['Node', 'Voltage (V)']]
            for node, voltage in sorted(report.node_voltages.items()):
                voltage_data.append([node, Paragraph(format_scientific(voltage, 3), self.styles['ReportBody'])])

            voltage_table = Table(voltage_data, colWidths=[2*inch, 2*inch])
            voltage_table.setStyle(self._get_table_style())
            elements.append(voltage_table)
        else:
            elements.append(Paragraph("No voltage data available.", self.styles['ReportBody']))
        
        elements.append(Spacer(1, 0.15 * inch))

        # ── 3.2 Branch Currents ───────────────────────────────────────────────
        elements.append(Paragraph("3.2 Branch Currents", self.styles['SubsectionHeader']))

        if report.branch_currents:
            current_data = [['Component', 'Current (A)']]
            for comp_id, current in sorted(report.branch_currents.items()):
                current_data.append([comp_id, Paragraph(format_scientific(current, 3), self.styles['ReportBody'])])

            current_table = Table(current_data, colWidths=[2*inch, 2*inch])
            current_table.setStyle(self._get_table_style())
            elements.append(current_table)
        else:
            elements.append(Paragraph("No current data available.", self.styles['ReportBody']))
        
        elements.append(Spacer(1, 0.15 * inch))

        # ── 3.3 Component Power ───────────────────────────────────────────────
        # P = |V_drop × I|  for passives (power dissipated)
        # P = |V × I|       for sources  (power supplied)
        elements.append(Paragraph("3.3 Component Power", self.styles['SubsectionHeader']))

        if not report.node_voltages or not report.branch_currents:
            elements.append(Paragraph(
                "No power data available (simulation incomplete).",
                self.styles['ReportBody']
            ))
            return elements

        power_data = [['Component', 'Type', 'Voltage Drop (V)', 'Current (A)', 'Power (W)', 'Role']]

        for comp in report.components:
            ctype  = comp.type
            cid    = comp.id
            nodes  = comp.nodes

            if ctype in ('junction', 'ground', 'ammeter', 'voltmeter'):
                continue
            if len(nodes) < 2:
                continue

            v_plus  = report.node_voltages.get(nodes[0], 0.0)
            v_minus = report.node_voltages.get(nodes[1], 0.0)
            v_drop  = v_plus - v_minus

            current = report.branch_currents.get(cid)
            if current is None:
                # Try uppercase key (ngspice uppercases source names)
                current = report.branch_currents.get(cid.upper(), 0.0)

            power = abs(v_drop * current)

            if ctype in ('dc_source', 'current_source'):
                role = 'Supplying'
            else:
                role = 'Dissipating'

            # Format voltage drop with sign
            v_drop_formatted = f"{'+' if v_drop >= 0 else ''}{format_scientific(abs(v_drop), 3)}"
            
            power_data.append([
                cid,
                ctype.replace('_', ' ').title(),
                Paragraph(v_drop_formatted, self.styles['ReportBody']),
                Paragraph(format_scientific(current, 3), self.styles['ReportBody']),
                Paragraph(format_scientific(power, 3), self.styles['ReportBody']),
                role,
            ])

        if len(power_data) > 1:
            power_table = Table(
                power_data,
                colWidths=[0.8*inch, 1.1*inch, 1.2*inch, 1.2*inch, 1.0*inch, 1.0*inch],
            )
            power_table.setStyle(self._get_table_style())
            elements.append(power_table)
        else:
            elements.append(Paragraph(
                "No component power data available.",
                self.styles['ReportBody']
            ))

        return elements
    
    @staticmethod
    def _fmt_equation(raw: str) -> str:
        """
        Translate a raw equation_str from SymbolicCircuitAnalyzer into
        readable mathematical notation for display in the PDF.

        Transformations applied:
          V_n1  → V_n1  (subscript notation: V_{n1})
          I_R1  → I_R1  (subscript notation: I_{R1})
          *     → ×  (multiplication)
          -     → − (Unicode minus, only between operands)
          /R    → (÷R) fractions shown as "/ R_value"
          KCL at node: → stripped, node shown separately as label
        """
        import re as _re

        s = raw

        # 1. Strip the "KCL at <node>: " prefix — caller renders node separately
        s = _re.sub(r'^KCL at \w+:\s*', '', s)

        # 2. Replace explicit multiplication sign
        s = s.replace('*', ' × ')

        # 3. Subscript-style variable names: V_n1 → V_n1, I_R1 → I_R1
        #    Rewrite as V_{n1} display form using Unicode subscript digits where possible
        def _subscript(m):
            prefix = m.group(1)   # V or I
            name   = m.group(2)   # e.g. n1, R1, V1
            # Use parenthesis notation — V(n1), I(R1) — avoids Unicode glyphs
            # that Courier lacks, which render as black replacement squares.
            return f"{prefix}({name})"

        s = _re.sub(r'\b([VI])_([A-Za-z0-9]+)', _subscript, s)

        # 4. Replace ASCII minus between terms with Unicode minus sign
        #    Match " - " (space-hyphen-space) but not inside negative numbers
        s = s.replace(' - ', ' − ')

        # 5. Format inline fractions: (V_x − V_y)/R → show as "(V_x − V_y) / R"
        #    Already readable; add thin spaces around / for clarity
        s = _re.sub(r'\)\s*/\s*([0-9.]+)', r') / \1', s)
        s = _re.sub(r'\)\s*/\s*([A-Za-z_]\w*)', r') / \1', s)

        # 6. Clean up multiple spaces
        s = _re.sub(r'  +', ' ', s).strip()

        return s

    def _build_symbolic_analysis(self, report: FaultReport) -> List:
        """Build symbolic analysis section with textbook-style equation formatting."""
        elements = []
        sym = report.symbolic_analysis

        elements.append(Paragraph("4. SYMBOLIC CIRCUIT ANALYSIS", self.styles['SectionHeader']))

        # ── KCL Equations ─────────────────────────────────────────────────────
        elements.append(Paragraph(
            "4.1 Kirchhoff's Current Law (KCL) Equations",
            self.styles['SubsectionHeader']
        ))

        if sym.kcl_equations:
            elements.append(Paragraph(
                "Applying KCL (sum of currents leaving each node = 0):",
                self.styles['ReportBody']
            ))
            elements.append(Spacer(1, 0.05 * inch))

            # Render each node equation as: label line + indented equation line
            for kcl in sym.kcl_equations:
                # Node label
                elements.append(Paragraph(
                    f"Node {kcl.node}:",
                    self.styles['EquationLabel']
                ))

                # Build the formatted equation from individual current terms
                formatted_terms = [self._fmt_equation(term) for term in kcl.currents]

                # Join terms — use "+" between positive terms; negative terms
                # already start with "−" after formatting so no extra sign needed
                parts = []
                for t in formatted_terms:
                    if parts and not t.startswith('−'):
                        parts.append('+ ' + t)
                    else:
                        parts.append(t)

                eq_body = '  ' + '  '.join(parts) + '  =  0'
                elements.append(Paragraph(eq_body, self.styles['Equation']))

        else:
            elements.append(Paragraph("No KCL equations available.", self.styles['ReportBody']))

        elements.append(Spacer(1, 0.15 * inch))

        # ── Symbolic Solution ─────────────────────────────────────────────────
        elements.append(Paragraph("4.2 Symbolic Solution", self.styles['SubsectionHeader']))

        if sym.solved_voltages:
            elements.append(Paragraph(
                "Solved node voltages (expressed in terms of circuit parameters):",
                self.styles['ReportBody']
            ))
            elements.append(Spacer(1, 0.05 * inch))

            # Align "V_xx = expression" lines in a two-column table for neatness
            eq_rows = []
            for node in sorted(sym.solved_voltages.keys()):
                expr = sym.solved_voltages[node]
                # Use V(node) notation — avoids Unicode subscript glyphs
                # that Courier cannot render (they show as black squares).
                lhs = f"V({node})"
                rhs = expr.replace('*', ' x ').replace(' - ', ' - ')
                eq_rows.append([lhs, '=', rhs])

            if eq_rows:
                # Use a 3-column table: LHS | = | RHS — keeps equations aligned
                sol_table = Table(
                    eq_rows,
                    colWidths=[0.9 * inch, 0.3 * inch, 4.3 * inch],
                    hAlign='LEFT'
                )
                sol_table.setStyle(TableStyle([
                    ('FONTNAME',  (0, 0), (-1, -1), 'Courier'),
                    ('FONTSIZE',  (0, 0), (-1, -1), 9),
                    ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#1a1a1a')),
                    ('ALIGN',     (0, 0), (0, -1), 'RIGHT'),   # LHS right-aligned
                    ('ALIGN',     (1, 0), (1, -1), 'CENTER'),  # = centred
                    ('ALIGN',     (2, 0), (2, -1), 'LEFT'),    # RHS left-aligned
                    ('VALIGN',    (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING',  (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING',   (0, 0), (-1, -1), 3),
                    ('BOTTOMPADDING',(0, 0), (-1, -1), 3),
                    ('ROWBACKGROUNDS', (0, 0), (-1, -1),
                     [colors.HexColor('#f8f9fa'), colors.white]),
                ]))
                elements.append(sol_table)

        elements.append(Spacer(1, 0.15 * inch))

        # ── Verification ──────────────────────────────────────────────────────
        elements.append(Paragraph(
            "4.3 Verification",
            self.styles['SubsectionHeader']
        ))
        elements.append(Spacer(1, 0.05 * inch))

        status_color = (
            'green'  if sym.cross_check_status == 'PASS'
            else '#b8860b' if sym.cross_check_status == 'WARNING'   # dark amber
            else 'red'
        )
        status_text = (
            f'<font color="{status_color}"><b>Cross-check status: '
            f'{sym.cross_check_status}</b></font>'
        )
        elements.append(Paragraph(status_text, self.styles['ReportBody']))

        for detail in (sym.cross_check_details or []):
            elements.append(Paragraph(f"\u2022 {detail}", self.styles['ReportBody']))

        return elements
    
    def _build_fault_analysis(self, report: FaultReport) -> List:
        """Build fault analysis section."""
        elements = []
        elements.append(Paragraph("6. FAULT ANALYSIS", self.styles['SectionHeader']))
        
        if not report.detected_faults:
            elements.append(Paragraph(
                "No faults detected. All components are operating within normal parameters.",
                self.styles['ReportBody']
            ))
            return elements
        
        # Sort faults by severity
        severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
        sorted_faults = sorted(report.detected_faults, key=lambda f: severity_order.get(f.severity, 99))
        
        for idx, fault in enumerate(sorted_faults, 1):
            elements.append(Paragraph(f"6.{idx} Fault in {fault.component_id}", self.styles['SubsectionHeader']))
            
            # Get unit for this component
            unit = self._get_unit_for_component(fault.component_id, report)
            
            # Fault details table
            fault_data = [
                ['Fault Type:', fault.fault_type.replace('_', ' ').title()],
                ['Severity:', fault.severity],
                ['Confidence:', f"{fault.confidence * 100:.1f}%"],
                ['Deviation:', f"{fault.deviation_metrics.get('deviation_pct', 0):+.1f}%"],
                ['Nominal Value:', Paragraph(format_value_with_unit(
                    fault.deviation_metrics.get('nominal', 0), unit
                ), self.styles['ReportBody'])],
                ['Actual Value:', Paragraph(format_value_with_unit(
                    fault.deviation_metrics.get('actual', 0), unit
                ), self.styles['ReportBody'])]
            ]
            
            fault_table = Table(fault_data, colWidths=[1.5*inch, 4*inch])
            fault_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            elements.append(fault_table)
            
            # Explanation if available
            if fault.explanation:
                elements.append(Spacer(1, 0.06 * inch))
                elements.append(Paragraph("<b>Explanation:</b>", self.styles['ReportBody']))
                elements.append(Paragraph(fault.explanation, self.styles['ReportBody']))
            
            elements.append(Spacer(1, 0.1 * inch))
        
        return elements
    
    def _build_recommendations(self, report: FaultReport) -> List:
        """Build recommendations section."""
        elements = []
        elements.append(Paragraph("7. RECOMMENDATIONS", self.styles['SectionHeader']))
        
        for idx, rec in enumerate(report.recommendations, 1):
            severity_color = self._get_severity_color(rec.severity)
            header_text = f'<font color="{severity_color.hexval()}"><b>{idx}. {rec.fault_type.replace("_", " ").title()}</b></font>'
            elements.append(Paragraph(header_text, self.styles['SubsectionHeader']))
            
            for action in rec.actions:
                elements.append(Paragraph(f"• {action}", self.styles['ReportBody']))
            
            elements.append(Spacer(1, 0.08 * inch))
        
        return elements
    
    def _build_appendix(self, report: FaultReport) -> List:
        """Build appendix section."""
        elements = []
        elements.append(Paragraph("APPENDIX", self.styles['SectionHeader']))
        
        # SPICE Netlist
        elements.append(Paragraph("A. SPICE Netlist", self.styles['SubsectionHeader']))
        
        netlist_lines = report.netlist.split('\n')
        for line in netlist_lines:
            elements.append(Preformatted(line, self.styles['CodeBlock']))
        
        elements.append(Spacer(1, 0.15 * inch))
        
        # ML Predictions - show "Not Applicable" if structural faults exist
        elements.append(Paragraph("B. ML Model Output", self.styles['SubsectionHeader']))
        
        if report.structural_faults:
            # Circuit has structural faults - ML classification not applicable
            ml_text = "<b>Status:</b> Not Applicable<br/><br/>"
            ml_text += "The circuit is inactive because structural faults prevent normal operation. "
            ml_text += "Fault classification is skipped until all structural issues are resolved.<br/><br/>"
            ml_text += "<b>Structural Issues Detected:</b><br/>"
            for fault in report.structural_faults:
                ml_text += f"&nbsp;&nbsp;• {fault}<br/>"
        else:
            # Normal ML output
            ml_text = f"<b>Predicted Fault Type:</b> {report.ml_predictions.get('fault_type', 'Unknown')}<br/>"
            ml_text += f"<b>Confidence:</b> {report.ml_predictions.get('confidence', 0)*100:.2f}%<br/><br/>"
            ml_text += "<b>All Probabilities:</b><br/>"
            
            for fault_type, prob in report.ml_predictions.get('all_probabilities', {}).items():
                ml_text += f"&nbsp;&nbsp;{fault_type}: {prob*100:.2f}%<br/>"
        
        elements.append(Paragraph(ml_text, self.styles['ReportBody']))
        
        return elements
    
    def _get_table_style(self):
        """Get common table style (deprecated - use _get_professional_table_style)."""
        return self._get_professional_table_style()
    
    def _get_professional_table_style(self):
        """Get professional table style with proper spacing and alignment."""
        return TableStyle([
            # Header row
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2c3e50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
            
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # First column centered
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'), # Other columns centered
            ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
            
            # Padding
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            
            # Grid and alternating rows
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bdc3c7')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')])
        ])
    
    def _get_unit_for_component(self, component_id: str, report: FaultReport) -> str:
        """Get the unit for a component based on its ID."""
        for comp in report.components:
            if comp.id == component_id:
                return comp.unit
        return ""
    
    def _get_severity_color(self, severity: str):
        """Get color for severity level."""
        colors_map = {
            "CRITICAL": colors.red,
            "HIGH": colors.orange,
            "MEDIUM": colors.yellow,
            "LOW": colors.blue,
            "INFO": colors.green
        }
        return colors_map.get(severity, colors.black)


def save_report_as_pdf(report: FaultReport, output_path: str, circuit_image_base64: str = None):
    """
    Save fault report as human-readable PDF.
    
    Args:
        report: FaultReport instance
        output_path: Path to save PDF file (e.g., "report.pdf")
        circuit_image_base64: Optional base64 encoded circuit diagram image
    """
    pdf_gen = PDFReportGenerator()
    pdf_gen.generate_pdf(report, output_path, circuit_image_base64=circuit_image_base64)
    print(f"PDF report saved to: {output_path}")
