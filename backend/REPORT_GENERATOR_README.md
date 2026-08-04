# Fault Report Generator

Comprehensive fault analysis report generator with symbolic circuit analysis for the Circuit Fault Detector. **Now supports both JSON and human-readable PDF output!**

## Features

### 1. **Header & Metadata**
- Circuit ID, timestamp, topology classification
- Overall status: "Healthy" or "Fault(s) Detected"

### 2. **Circuit Snapshot**
- Component list with nominal vs actual values
- Deviation percentages
- Component connections (nodes)

### 3. **Simulation Summary**
- Node voltages and branch currents from ngspice
- Comparison against nominal baseline
- **Symbolic Nodal Analysis**:
  - Automatically generates KCL equations for each non-reference node
  - Solves symbolically using SymPy
  - Calculates branch currents via Ohm's Law
  - Cross-checks symbolic results against ngspice numerical output
  - Flags warnings if results diverge

### 4. **Per-Component Fault Breakdown**
- Fault labels and confidence scores from ML classifier
- Deviation metrics (actual vs nominal)
- Severity classification (CRITICAL, HIGH, MEDIUM, LOW)

### 5. **RAG-Based Explanations**
- Plain-language explanations for each detected fault
- Sourced from circuit theory textbook via Supabase + Gemini

### 6. **Severity & Recommendations**
- Faults ranked by severity
- Templated action items keyed to fault type
- Priority-sorted suggestions

### 7. **Appendix**
- Raw SPICE netlist
- Complete voltage/current tables
- ML model probabilities

## Output Formats

### PDF Report (New!)
Generate a professional, human-readable PDF report with:
- Color-coded status banners
- Formatted tables and sections
- KCL equations and symbolic analysis
- Detailed fault breakdowns with explanations
- Actionable recommendations
- Complete appendix with technical details

```python
from report_generator import generate_fault_report, save_report_as_pdf

# Generate report
report = generate_fault_report(
    circuit_id="my_circuit",
    circuit_data=circuit_dict,
    netlist=netlist_str,
    simulation_result=sim_result,
    ml_predictions=ml_predictions,
    nominal_values=design_values,
    add_rag_explanations=True
)

# Save as PDF
save_report_as_pdf(report, "fault_report.pdf")
```

### JSON Report
For programmatic access and data processing:

```python
from dataclasses import asdict
import json

report_dict = asdict(report)
with open("report.json", "w") as f:
    json.dump(report_dict, f, indent=2)
```

## Usage

### Basic Usage

```python
from report_generator import generate_fault_report

# After running simulation and ML analysis
report = generate_fault_report(
    circuit_id="my_circuit",
    circuit_data=circuit_dict,
    netlist=netlist_str,
    simulation_result=sim_result,
    ml_predictions=ml_predictions,
    nominal_values=design_values,
    add_rag_explanations=True  # Optional: add AI explanations
)

# Access report fields
print(f"Status: {report.overall_status}")
print(f"Faults: {len(report.detected_faults)}")
print(f"Recommendations: {len(report.recommendations)}")
```

### API Endpoints

#### Generate PDF Report
```bash
POST http://localhost:8000/api/generate-report-pdf
Content-Type: application/json

{
  "nodes": ["n1", "n2", "0"],
  "components": [...],
  "ground": "0",
  "design_values": {"R1": 1000, "R2": 1000}
}
```
Returns: PDF file download

#### Generate JSON Report
```bash
POST http://localhost:8000/api/generate-report
Content-Type: application/json

{
  "nodes": ["n1", "n2", "0"],
  "components": [...],
  "ground": "0",
  "design_values": {"R1": 1000, "R2": 1000}
}
```
Returns: JSON response with structured report data

### Frontend Integration

Two report download buttons are available in the Results Page header:
- **📄 PDF Report**: Downloads a human-readable PDF document
- **📊 JSON Report**: Downloads structured JSON data
- Both include symbolic analysis and recommendations

## Dependencies

Required Python packages:
```bash
pip install reportlab  # For PDF generation
pip install sympy      # For symbolic analysis
```

Existing dependencies:
- `fault_analyzer.py` - ML fault classification
- `rag.py` - RAG-based explanations (optional)
- `netlist_generator.py` - SPICE netlist generation
- `simulation_runner.py` - ngspice integration

## Testing

Run the test script to generate a sample PDF report:
```bash
python test_pdf_report.py
```

This generates a report for a faulty voltage divider circuit and saves it as `test_fault_report.pdf`.

## Symbolic Analysis

The report generator includes automatic symbolic circuit analysis:

### KCL Equation Generation

For each non-reference node, the analyzer:
1. Identifies all connected components
2. Calculates current contributions (Ohm's law for resistors)
3. Writes KCL equation: Σ I_leaving = 0

Example output:
```
KCL at n1: I_R1 = (V_n1 - V_n2)/1000 + I_V1 = 0
KCL at n2: I_R2 = (V_n2 - 0)/1000 - I_R1 = 0
```

### Symbolic Solving

The system is solved using SymPy:
```python
from sympy import symbols, Eq, solve

V_n1, V_n2 = symbols('V_n1 V_n2', real=True)
equations = [
    Eq((V_n1 - V_n2)/1000 + 0.005, 0),
    Eq((V_n2 - 0)/1000 - (V_n1 - V_n2)/1000, 0)
]
solution = solve(equations, [V_n1, V_n2])
```

### Cross-Checking

Symbolic results are cross-checked against ngspice:
- Voltages and currents compared within tolerance (default 1%)
- Mismatches flagged as warnings
- Status: "PASS", "FAIL", or "ERROR"

## Dependencies

Required Python packages:
```bash
pip install sympy  # For symbolic analysis
```

Existing dependencies:
- `fault_analyzer.py` - ML fault classification
- `rag.py` - RAG-based explanations (optional)
- `netlist_generator.py` - SPICE netlist generation
- `simulation_runner.py` - ngspice integration

## Report Structure

```python
@dataclass
class FaultReport:
    # Header
    circuit_id: str
    timestamp: str
    topology_type: str
    overall_status: str
    
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
    
    generation_time_ms: Optional[float]
```

## Severity Classification

Faults are classified into severity levels:

| Severity | Description | Examples |
|----------|-------------|----------|
| CRITICAL | Circuit inoperative or dangerous | Short circuit, full open |
| HIGH | Major malfunction | Partial open, large drift |
| MEDIUM | Incorrect behavior | Wrong component type |
| LOW | Minor deviation | Small value drift |
| INFO | No action required | Normal operation |

## Recommendations Engine

Provides actionable next steps based on fault type:

```python
RECOMMENDATIONS = {
    "partial_short": [
        "Check for solder bridges or conductive debris",
        "Verify resistor value with multimeter",
        "Inspect PCB traces for unintended connections",
        "Replace component if damaged"
    ],
    "partial_open": [
        "Check for cold solder joints",
        "Verify component leads are properly seated",
        "Test component continuity",
        "Check for corroded contacts"
    ],
    # ... more fault types
}
```

## Testing

Run the test script:
```bash
python test_report_generator.py
```

This generates a report for a faulty voltage divider circuit and saves it as JSON.

## Output Formats

### JSON Export
The report can be converted to JSON for storage or transmission:
```python
import json
from dataclasses import asdict

report_json = json.dumps(asdict(report), indent=2)
```

### HTML/PDF Rendering
The structured report can be rendered to HTML or PDF using templates (not included, but structure supports it).

## Notes

- Symbolic analysis requires SymPy
- RAG explanations require configured Supabase + Gemini API
- Cross-checking tolerance can be adjusted (default 1%)
- DC steady-state only: capacitors = open, inductors = short
- Voltage sources treated with symbolic current variables

## Error Handling

The analyzer gracefully handles errors:
- Missing SymPy: returns empty symbolic analysis
- Unsolvable systems: returns error message
- RAG failures: explanation set to "Explanation unavailable"
