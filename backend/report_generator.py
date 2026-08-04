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

MULTI_FAULT_EXPLANATIONS = {
    frozenset(["partial_short", "partial_open"]): (
        "Multiple faults were detected simultaneously in this circuit: {short_component} "
        "shows signs of a partial short, while {open_component} shows signs of a partial "
        "open. This combination often arises from a single root cause — such as a power "
        "surge or thermal event — stressing several components at once, though it can "
        "also result from two independent failures. Because a short in one branch can "
        "alter the current distribution seen by other components, {open_component}'s "
        "deviation should be re-evaluated once {short_component} is repaired, as its "
        "apparent severity may change."
    ),
    frozenset(["partial_short", "wrong_component_type"]): (
        "Multiple faults were detected simultaneously in this circuit: {short_component} "
        "shows signs of a partial short, and {wrong_component} appears to be the wrong "
        "component type or value for this design. These are typically independent "
        "issues — one electrical degradation, one assembly error — rather than a single "
        "shared cause. It's recommended to first correct {wrong_component}'s type/value, "
        "then re-run analysis to confirm whether the short in {short_component} persists "
        "or was a downstream effect of the incorrect component."
    ),
    frozenset(["partial_open", "wrong_component_type"]): (
        "Multiple faults were detected simultaneously in this circuit: {open_component} "
        "shows signs of a partial open, and {wrong_component} appears to be the wrong "
        "component type or value for this design. An incorrect component can alter "
        "circuit loading in a way that presents as a partial open elsewhere, so it's "
        "worth correcting {wrong_component} first and re-running the analysis before "
        "treating {open_component} as a separate physical defect."
    ),
    frozenset(["partial_short", "partial_open", "wrong_component_type"]): (
        "Multiple faults were detected simultaneously across this circuit: {short_component} "
        "shows signs of a partial short, {open_component} shows signs of a partial open, "
        "and {wrong_component} appears to be the wrong component type or value. This is "
        "an unusual combination and suggests either a significant fault event affecting "
        "several components at once, or that one root-cause fault (most likely the "
        "incorrect component, {wrong_component}) is distorting the simulated behavior of "
        "the others. Address {wrong_component} first, then re-run the analysis to confirm "
        "which of the remaining faults are still present."
    ),
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
        template = FAULT_EXPLANATIONS.get(fault.fault_type, "Fault detected: {fault_type}")
        
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
        
        return template.format(
            component_id=fault.component_id,
            actual_value=actual_val,
            nominal_value=nominal_val,
            deviation=deviation,
            fault_type=fault.fault_type
        )
    
    # Multiple fault types
    fault_set = frozenset(fault_types)
    template = MULTI_FAULT_EXPLANATIONS.get(fault_set)
    
    if not template:
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
    
    return template.format(**component_map)


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

def format_scientific(value: float, precision: int = 2) -> str:
    """
    Format a number in scientific notation with proper superscripts for PDF.
    Uses <super> tags for reportlab Paragraph rendering.
    
    Examples:
        100 → "1.00 × 10<super>2</super>"
        0.005 → "5.00 × 10<super>-3</super>"
        5000 → "5.00 × 10<super>3</super>"
    """
    if value == 0:
        return "0.00"
    
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
            return f"{value:.{precision+2}f}".rstrip('0').rstrip('.')
    
    # Use reportlab's super tag for superscript
    return f"{mantissa_str} × 10<super>{exponent}</super>"


def format_value_with_unit(value: float, unit: str, precision: int = 2) -> str:
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
    detected_faults: List[FaultDetail]
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
        all_passed = True
        
        # Check voltages
        for node, ng_voltage in ngspice_voltages.items():
            sym_voltage = symbolic.numeric_voltages.get(node)
            if sym_voltage is not None:
                diff = abs(ng_voltage - sym_voltage)
                rel_diff = diff / (abs(ng_voltage) + 1e-9)
                
                if rel_diff > tolerance:
                    all_passed = False
                    details.append(
                        f"Voltage mismatch at {node}: ngspice={ng_voltage:.6f}V, "
                        f"symbolic={sym_voltage:.6f}V (diff={diff:.6f}V)"
                    )
        
        # Check currents
        for comp_id, ng_current in ngspice_currents.items():
            sym_current = symbolic.numeric_currents.get(comp_id)
            if sym_current is not None:
                diff = abs(ng_current - sym_current)
                rel_diff = diff / (abs(ng_current) + 1e-9)
                
                if rel_diff > tolerance:
                    all_passed = False
                    details.append(
                        f"Current mismatch in {comp_id}: ngspice={ng_current:.6f}A, "
                        f"symbolic={sym_current:.6f}A (diff={diff:.6f}A)"
                    )
        
        status = "PASS" if all_passed else "FAIL"
        if all_passed and not details:
            details.append("All voltages and currents match within tolerance")
        
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
    def generate(cls, fault_type: str, severity: str) -> Recommendation:
        """Generate recommendation for a fault."""
        template = cls.RECOMMENDATIONS.get(fault_type, cls.RECOMMENDATIONS["Normal"])
        
        return Recommendation(
            fault_type=fault_type,
            severity=severity,
            actions=template["actions"],
            priority=0  # No longer used
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
                 nominal_values: Optional[Dict[str, float]] = None) -> FaultReport:
        """
        Generate complete fault report.
        
        Args:
            circuit_data: Circuit structure from frontend
            netlist: Generated SPICE netlist
            simulation_result: ngspice output (voltages, currents)
            ml_predictions: Fault analyzer ML predictions
            nominal_values: Expected nominal component values
        """
        start_time = datetime.now()
        
        # Determine overall status
        fault_type = ml_predictions.get("fault_type", "Unknown")
        overall_status = "Healthy" if fault_type == "Normal" else "Fault(s) Detected"
        
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
        
        # Generate recommendations
        recommendations = self._generate_recommendations(detected_faults)
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
        
        # Main fault detection
        if fault_type != "Normal":
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
                    explanation=None  # Will be filled by RAG
                ))
        
        return faults
    
    def _generate_recommendations(self, faults: List[FaultDetail]) -> List[Recommendation]:
        """Generate recommendations for all detected faults."""
        recommendations = []
        seen_types = set()
        
        for fault in faults:
            if fault.fault_type not in seen_types:
                rec = RecommendationEngine.generate(fault.fault_type, fault.severity)
                recommendations.append(rec)
                seen_types.add(fault.fault_type)
        
        # Add "Normal" recommendation if no faults
        if not faults:
            recommendations.append(RecommendationEngine.generate("Normal", "INFO"))
        
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
        nominal_values: Expected nominal component values
        add_explanations: Whether to add hardcoded fault explanations (default True)
    
    Returns:
        FaultReport dataclass instance
    """
    generator = FaultReportGenerator(circuit_id)
    report = generator.generate(
        circuit_data, netlist, simulation_result, ml_predictions, nominal_values
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
            spaceAfter=30,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        # Section header
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#2c3e50'),
            spaceAfter=12,
            spaceBefore=20,
            fontName='Helvetica-Bold'
        ))
        
        # Subsection header
        self.styles.add(ParagraphStyle(
            name='SubsectionHeader',
            parent=self.styles['Heading3'],
            fontSize=13,
            textColor=colors.HexColor('#34495e'),
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
        
        fault_count = len(report.detected_faults)
        comp_count = len(report.components)
        
        if fault_count == 0:
            summary_text = f"All {comp_count} components are operating within normal parameters. No faults detected."
        else:
            summary_text = f"Detected {fault_count} fault(s) in circuit with {comp_count} components. "
            summary_text += f"Primary fault type: <b>{report.ml_predictions.get('fault_type', 'Unknown')}</b> "
            summary_text += f"(confidence: {report.ml_predictions.get('confidence', 0)*100:.1f}%)."
        
        elements.append(Paragraph(summary_text, self.styles['ReportBody']))
        
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
        elements.append(Paragraph("4. SIMULATION RESULTS", self.styles['SectionHeader']))
        
        # Node voltages
        elements.append(Paragraph("4.1 Node Voltages", self.styles['SubsectionHeader']))
        
        voltage_data = [['Node', 'Voltage']]
        for node, voltage in sorted(report.node_voltages.items()):
            formatted_value = format_value_with_unit(voltage, 'V', precision=3)
            voltage_data.append([
                node,
                Paragraph(formatted_value, self.styles['ReportBody'])
            ])
        
        voltage_table = Table(voltage_data, colWidths=[2*inch, 2.5*inch])
        voltage_table.setStyle(self._get_professional_table_style())
        elements.append(voltage_table)
        elements.append(Spacer(1, 0.1 * inch))
        
        # Branch currents
        elements.append(Paragraph("4.2 Branch Currents", self.styles['SubsectionHeader']))
        
        current_data = [['Component', 'Current']]
        for comp_id, current in sorted(report.branch_currents.items()):
            formatted_value = format_value_with_unit(current, 'A', precision=3)
            current_data.append([
                comp_id,
                Paragraph(formatted_value, self.styles['ReportBody'])
            ])
        
        current_table = Table(current_data, colWidths=[2*inch, 2.5*inch])
        current_table.setStyle(self._get_professional_table_style())
        elements.append(current_table)
        
        return elements
    
    def _build_symbolic_analysis(self, report: FaultReport) -> List:
        """Build symbolic analysis section."""
        elements = []
        sym = report.symbolic_analysis
        
        elements.append(Paragraph("5. SYMBOLIC CIRCUIT ANALYSIS", self.styles['SectionHeader']))
        
        # KCL Equations
        elements.append(Paragraph("5.1 Kirchhoff's Current Law (KCL) Equations", self.styles['SubsectionHeader']))
        
        if sym.kcl_equations:
            for kcl in sym.kcl_equations:
                eq_text = f"<b>{kcl.node}:</b> {kcl.equation_str}"
                elements.append(Paragraph(eq_text, self.styles['CodeBlock']))
        else:
            elements.append(Paragraph("No KCL equations available.", self.styles['ReportBody']))
        
        elements.append(Spacer(1, 0.1 * inch))
        
        # Solved voltages
        elements.append(Paragraph("5.2 Symbolic Solution", self.styles['SubsectionHeader']))
        
        if sym.solved_voltages:
            voltage_text = "Node voltages (symbolic):<br/>"
            for node, expr in sorted(sym.solved_voltages.items()):
                voltage_text += f"&nbsp;&nbsp;V_{node} = {expr}<br/>"
            elements.append(Paragraph(voltage_text, self.styles['CodeBlock']))
        
        elements.append(Spacer(1, 0.1 * inch))
        
        # Cross-check
        elements.append(Paragraph("5.3 Verification", self.styles['SubsectionHeader']))
        
        status_text = f"<b>Cross-check status:</b> {sym.cross_check_status}"
        if sym.cross_check_status == "PASS":
            status_text = f'<font color="green">{status_text}</font>'
        elif sym.cross_check_status == "FAIL":
            status_text = f'<font color="red">{status_text}</font>'
        
        elements.append(Paragraph(status_text, self.styles['ReportBody']))
        
        if sym.cross_check_details:
            for detail in sym.cross_check_details:
                elements.append(Paragraph(f"• {detail}", self.styles['ReportBody']))
        
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
        
        # ML Predictions
        elements.append(Paragraph("B. ML Model Output", self.styles['SubsectionHeader']))
        
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
