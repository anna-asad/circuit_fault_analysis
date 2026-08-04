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
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


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
            "priority": 1,
            "actions": [
                "Check for solder bridges or conductive debris between component leads",
                "Verify resistor value with a multimeter (should match nominal ±5%)",
                "Inspect PCB traces for unintended connections",
                "Replace component if damaged or incorrect value installed"
            ]
        },
        "partial_open": {
            "severity": "HIGH",
            "priority": 2,
            "actions": [
                "Check for cold solder joints or intermittent connections",
                "Verify all component leads are properly seated and soldered",
                "Test component continuity with a multimeter",
                "Check for corroded or oxidized contacts"
            ]
        },
        "wrong_component_type": {
            "severity": "MEDIUM",
            "priority": 3,
            "actions": [
                "Verify component marking matches schematic specification",
                "Check if incorrect component value was installed",
                "Review circuit behavior against expected response",
                "Consult circuit schematic for correct component type"
            ]
        },
        "value_drift": {
            "severity": "LOW",
            "priority": 4,
            "actions": [
                "Component may be within tolerance but outside ideal range",
                "Consider replacing with tighter tolerance component if precision is critical",
                "Monitor component over time for further drift",
                "Verify environmental conditions (temperature, humidity) are within spec"
            ]
        },
        "Normal": {
            "severity": "INFO",
            "priority": 99,
            "actions": [
                "Circuit is operating within normal parameters",
                "No action required"
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
            priority=template["priority"]
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
        recommendations.sort(key=lambda r: r.priority)
        
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
    
    def add_rag_explanations(self, report: FaultReport, rag_function) -> FaultReport:
        """Add RAG-generated explanations to fault details."""
        for fault in report.detected_faults:
            try:
                explanation = rag_function(fault.fault_type, fault.component_id)
                fault.explanation = explanation
            except Exception as e:
                fault.explanation = f"Explanation unavailable: {e}"
        
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
                         add_rag_explanations: bool = False) -> FaultReport:
    """
    Convenience function to generate a fault report.
    
    Args:
        circuit_id: Unique identifier for the circuit
        circuit_data: Circuit structure dictionary
        netlist: SPICE netlist string
        simulation_result: Dictionary with 'voltages' and 'currents' from ngspice
        ml_predictions: ML fault predictions from FaultAnalyzer
        nominal_values: Expected nominal component values
        add_rag_explanations: Whether to add RAG explanations (requires rag module)
    
    Returns:
        FaultReport dataclass instance
    """
    generator = FaultReportGenerator(circuit_id)
    report = generator.generate(
        circuit_data, netlist, simulation_result, ml_predictions, nominal_values
    )
    
    if add_rag_explanations:
        try:
            from rag import explain_fault
            report = generator.add_rag_explanations(report, explain_fault)
        except ImportError:
            pass
    
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
    
    def generate_pdf(self, report: FaultReport, output_path: str):
        """
        Generate PDF report from FaultReport.
        
        Args:
            report: FaultReport instance
            output_path: Path to save PDF file
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
        story.append(Spacer(1, 0.3 * inch))
        
        story.extend(self._build_overview(report))
        story.append(Spacer(1, 0.2 * inch))
        
        story.extend(self._build_component_snapshot(report))
        story.append(Spacer(1, 0.2 * inch))
        
        story.extend(self._build_simulation_summary(report))
        story.append(Spacer(1, 0.2 * inch))
        
        if report.symbolic_analysis and not report.symbolic_analysis.error:
            story.extend(self._build_symbolic_analysis(report))
            story.append(Spacer(1, 0.2 * inch))
        
        story.extend(self._build_fault_analysis(report))
        story.append(Spacer(1, 0.2 * inch))
        
        story.extend(self._build_recommendations(report))
        
        # Appendix on new page
        story.append(PageBreak())
        story.extend(self._build_appendix(report))
        
        # Build PDF
        doc.build(story)
    
    def _build_header(self, report: FaultReport) -> List:
        """Build report header section."""
        elements = []
        
        # Title
        elements.append(Paragraph("CIRCUIT FAULT ANALYSIS REPORT", self.styles['ReportTitle']))
        elements.append(Spacer(1, 0.2 * inch))
        
        # Status indicator
        status_color = colors.green if report.overall_status == "Healthy" else colors.red
        status_text = f'<font color="{status_color.hexval()}"><b>STATUS: {report.overall_status.upper()}</b></font>'
        elements.append(Paragraph(status_text, self.styles['ReportBody']))
        elements.append(Spacer(1, 0.1 * inch))
        
        # Metadata table
        meta_data = [
            ['Circuit ID:', report.circuit_id],
            ['Topology:', report.topology_type],
            ['Analysis Date:', datetime.fromisoformat(report.timestamp).strftime('%Y-%m-%d %H:%M:%S')],
            ['Generation Time:', f'{report.generation_time_ms:.2f} ms' if report.generation_time_ms else 'N/A']
        ]
        
        meta_table = Table(meta_data, colWidths=[2*inch, 4*inch])
        meta_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2c3e50')),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
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
    
    def _build_component_snapshot(self, report: FaultReport) -> List:
        """Build component snapshot table."""
        elements = []
        elements.append(Paragraph("2. COMPONENT SNAPSHOT", self.styles['SectionHeader']))
        
        # Build table data
        table_data = [['ID', 'Type', 'Nominal', 'Actual', 'Deviation', 'Nodes']]
        
        for comp in report.components:
            nominal_str = f"{comp.nominal_value:.2e} {comp.unit}" if comp.nominal_value else "N/A"
            actual_str = f"{comp.actual_value:.2e} {comp.unit}" if comp.actual_value else "N/A"
            deviation_str = f"{comp.deviation_pct:+.1f}%" if comp.deviation_pct else "-"
            nodes_str = " - ".join(comp.nodes)
            
            table_data.append([
                comp.id,
                comp.type,
                nominal_str,
                actual_str,
                deviation_str,
                nodes_str
            ])
        
        comp_table = Table(table_data, colWidths=[0.8*inch, 1*inch, 1.2*inch, 1.2*inch, 0.9*inch, 1.4*inch])
        comp_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecf0f1')])
        ]))
        elements.append(comp_table)
        
        return elements
    
    def _build_simulation_summary(self, report: FaultReport) -> List:
        """Build simulation summary section."""
        elements = []
        elements.append(Paragraph("3. SIMULATION RESULTS", self.styles['SectionHeader']))

        # ── 3.1 Node Voltages ─────────────────────────────────────────────────
        elements.append(Paragraph("3.1 Node Voltages", self.styles['SubsectionHeader']))

        voltage_data = [['Node', 'Voltage (V)']]
        for node, voltage in sorted(report.node_voltages.items()):
            voltage_data.append([node, f"{voltage:.6f}"])

        voltage_table = Table(voltage_data, colWidths=[2*inch, 2*inch])
        voltage_table.setStyle(self._get_table_style())
        elements.append(voltage_table)
        elements.append(Spacer(1, 0.15 * inch))

        # ── 3.2 Branch Currents ───────────────────────────────────────────────
        elements.append(Paragraph("3.2 Branch Currents", self.styles['SubsectionHeader']))

        current_data = [['Component', 'Current (A)']]
        for comp_id, current in sorted(report.branch_currents.items()):
            current_data.append([comp_id, f"{current:.6e}"])

        current_table = Table(current_data, colWidths=[2*inch, 2*inch])
        current_table.setStyle(self._get_table_style())
        elements.append(current_table)
        elements.append(Spacer(1, 0.15 * inch))

        # ── 3.3 Component Power ───────────────────────────────────────────────
        # P = |V_drop × I|  for passives (power dissipated)
        # P = |V × I|       for sources  (power supplied)
        elements.append(Paragraph("3.3 Component Power", self.styles['SubsectionHeader']))

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

            power_data.append([
                cid,
                ctype.replace('_', ' ').title(),
                f"{v_drop:+.4f}",
                f"{current:.4e}",
                f"{power:.4e}",
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
                "No component power data available (requires branch current output).",
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
        elements.append(Paragraph("5. FAULT ANALYSIS", self.styles['SectionHeader']))
        
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
            elements.append(Paragraph(f"5.{idx} Fault in {fault.component_id}", self.styles['SubsectionHeader']))
            
            # Fault details table
            fault_data = [
                ['Fault Type:', fault.fault_type],
                ['Severity:', fault.severity],
                ['Confidence:', f"{fault.confidence * 100:.1f}%"],
                ['Deviation:', f"{fault.deviation_metrics.get('deviation_pct', 0):+.1f}%"],
                ['Nominal Value:', f"{fault.deviation_metrics.get('nominal', 0):.2e}"],
                ['Actual Value:', f"{fault.deviation_metrics.get('actual', 0):.2e}"]
            ]
            
            fault_table = Table(fault_data, colWidths=[1.5*inch, 4*inch])
            fault_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            elements.append(fault_table)
            
            # Explanation if available
            if fault.explanation:
                elements.append(Spacer(1, 0.1 * inch))
                elements.append(Paragraph("<b>Explanation:</b>", self.styles['ReportBody']))
                elements.append(Paragraph(fault.explanation, self.styles['ReportBody']))
            
            elements.append(Spacer(1, 0.15 * inch))
        
        return elements
    
    def _build_recommendations(self, report: FaultReport) -> List:
        """Build recommendations section."""
        elements = []
        elements.append(Paragraph("6. RECOMMENDATIONS", self.styles['SectionHeader']))
        
        for idx, rec in enumerate(report.recommendations, 1):
            severity_color = self._get_severity_color(rec.severity)
            header_text = f'<font color="{severity_color.hexval()}"><b>{idx}. {rec.fault_type}</b></font> (Priority: {rec.priority})'
            elements.append(Paragraph(header_text, self.styles['SubsectionHeader']))
            
            for action in rec.actions:
                elements.append(Paragraph(f"• {action}", self.styles['ReportBody']))
            
            elements.append(Spacer(1, 0.1 * inch))
        
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
        
        elements.append(Spacer(1, 0.2 * inch))
        
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
        """Get common table style."""
        return TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3498db')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#ecf0f1')])
        ])
    
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


def save_report_as_pdf(report: FaultReport, output_path: str):
    """
    Save fault report as human-readable PDF.
    
    Args:
        report: FaultReport instance
        output_path: Path to save PDF file (e.g., "report.pdf")
    """
    pdf_gen = PDFReportGenerator()
    pdf_gen.generate_pdf(report, output_path)
    print(f"PDF report saved to: {output_path}")
