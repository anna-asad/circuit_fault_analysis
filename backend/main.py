"""FastAPI Backend for Circuit Fault Detector"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uvicorn

# Import all components
from validators import CircuitValidator, ComponentSpec, validate_circuit_quick
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from structural_faults import detect_structural_faults
from fault_analyzer import FaultAnalyzer

# Initialize FastAPI app
app = FastAPI(
    title="Circuit Fault Detector API",
    description="Backend API for circuit simulation and fault detection",
    version="1.0.0"
)

# ============================================================================
# Global Model Cache - Load once at startup, reuse for all requests
# ============================================================================
_fault_analyzer: FaultAnalyzer = None

@app.on_event("startup")
async def load_models():
    """Load ML model once at startup to avoid reloading on every request."""
    global _fault_analyzer
    print("🔄 Loading ML model...")
    _fault_analyzer = FaultAnalyzer()
    if _fault_analyzer.is_model_loaded():
        print("✅ ML model loaded successfully")
    else:
        print("⚠️  ML model not available (install dependencies and run train.py)")

def get_fault_analyzer() -> FaultAnalyzer:
    """Get the cached fault analyzer instance."""
    return _fault_analyzer

# CORS middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Data Models (Pydantic schemas)
# ============================================================================

class ComponentModel(BaseModel):
    """Represents a single circuit component."""
    id: str = Field(..., description="Unique component identifier (e.g., 'R1', 'V1')")
    type: str = Field(..., description="Component type: dc_source, current_source, resistor, capacitor, inductor, ground, ammeter, voltmeter")
    value: float = Field(..., description="Component value (resistance, capacitance, voltage, etc.)")
    nodes: List[str] = Field(..., description="Connected node IDs [positive, negative]")
    position: Dict[str, float] = Field(default={"x": 0, "y": 0}, description="Canvas position")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "R1",
                "type": "resistor",
                "value": 1000,
                "nodes": ["n1", "n2"],
                "position": {"x": 300, "y": 200}
            }
        }


class CircuitModel(BaseModel):
    """Represents the complete circuit for simulation."""
    nodes: List[str] = Field(..., description="List of all node IDs in the circuit")
    components: List[ComponentModel] = Field(..., description="List of all components")
    ground: str = Field(default="0", description="Ground node reference")
    # Meter metadata forwarded by the frontend converter so we can echo it back
    # in simulation_data for the ResultsPanel to resolve readings.
    meters: List[Dict[str, Any]] = Field(
        default=[],
        description="Ammeter/voltmeter metadata: [{id, type, spiceName, nodes}]"
    )


class SimulationResponse(BaseModel):
    """Response from simulation endpoint."""
    success: bool
    netlist: Optional[str] = None
    structural_faults: List[str] = []
    pattern_faults: Optional[Dict[str, Any]] = None
    simulation_data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "online",
        "service": "Circuit Fault Detector API",
        "version": "1.0.0"
    }


@app.get("/api/health")
async def health_check():
    """Detailed health check with system status."""
    
    # Check ngspice
    runner = SimulationRunner()
    ngspice_installed, ngspice_version = runner.check_ngspice_installed()
    
    # Check ML model (use cached instance)
    analyzer = get_fault_analyzer()
    ml_model_loaded = analyzer.is_model_loaded() if analyzer else False
    
    return {
        "status": "healthy",
        "backend": "running",
        "ml_model": "loaded" if ml_model_loaded else "not_loaded",
        "ngspice": {
            "installed": ngspice_installed,
            "version": ngspice_version if ngspice_installed else None
        }
    }


@app.get("/api/components")
async def get_components():
    """Get list of available circuit components with their properties."""
    
    components = [
        {
            "type": "dc_source",
            "label": "DC Source",
            "icon": "⚡",
            "value_range": {"min": 0.1, "max": 100, "default": 5.0},
            "unit": "V",
            "description": "DC voltage source (battery)"
        },
        {
            "type": "resistor",
            "label": "Resistor",
            "icon": "🔲",
            "value_range": {"min": 1, "max": 1e6, "default": 1000},
            "unit": "Ω",
            "description": "Resistor component"
        },
        {
            "type": "capacitor",
            "label": "Capacitor",
            "icon": "▯",
            "value_range": {"min": 1e-12, "max": 1e-3, "default": 1e-7},
            "unit": "F",
            "description": "Capacitor component"
        },
        {
            "type": "inductor",
            "label": "Inductor",
            "icon": "⏦",
            "value_range": {"min": 1e-9, "max": 1e-3, "default": 1e-6},
            "unit": "H",
            "description": "Inductor component"
        },
        {
            "type": "ground",
            "label": "Ground",
            "icon": "⏚",
            "value_range": None,
            "unit": None,
            "description": "Ground reference (node 0)"
        },
        {
            "type": "ammeter",
            "label": "Ammeter",
            "icon": "Ⓐ",
            "value_range": None,
            "unit": "A",
            "description": "Current measurement device (must be in series)"
        },
        {
            "type": "voltmeter",
            "label": "Voltmeter",
            "icon": "Ⓥ",
            "value_range": None,
            "unit": "V",
            "description": "Voltage measurement device (must be in parallel)"
        }
    ]
    
    return {"components": components}


@app.post("/api/simulate", response_model=SimulationResponse)
async def simulate_circuit(circuit: CircuitModel):
    """
    Simulate circuit and detect faults.
    
    Steps:
    1. Validate circuit structure
    2. Generate SPICE netlist
    3. Run ngspice DC analysis
    4. Detect structural faults
    5. Run ML model for pattern faults
    6. Return combined results
    """
    
    try:
        # Step 1: Validate circuit
        circuit_dict = circuit.model_dump()
        validator = CircuitValidator()
        is_valid, errors, warnings = validator.validate(circuit_dict)
        
        if not is_valid:
            return SimulationResponse(
                success=False,
                netlist=None,
                structural_faults=errors,
                pattern_faults=None,
                simulation_data=None,
                error=f"Circuit validation failed: {'; '.join(errors)}"
            )
        
        # Step 2: Generate SPICE netlist
        netlist = generate_netlist(circuit_dict)
        
        # Step 2.5: Pre-simulation structural checks (catch fatal errors before ngspice)
        # These checks don't need simulation results and can prevent ngspice crashes
        pre_sim_faults = detect_structural_faults(circuit_dict, simulation_result={})
        critical_pre_faults = [f for f in pre_sim_faults if 'Ammeter' in f or 'Voltmeter' in f]
        
        if critical_pre_faults:
            # Meter placement errors are fatal — abort before running ngspice
            return SimulationResponse(
                success=False,
                netlist=netlist,
                structural_faults=warnings + critical_pre_faults,
                pattern_faults=None,
                simulation_data=None,
                error="Circuit has structural faults that prevent simulation. Fix meter placement."
            )
        
        # Step 3: Run ngspice simulation
        runner = SimulationRunner()
        sim_result = runner.run_simulation(netlist)
        
        if not sim_result["success"]:
            return SimulationResponse(
                success=False,
                netlist=netlist,
                structural_faults=warnings,
                pattern_faults=None,
                simulation_data=None,
                error=f"Simulation failed: {sim_result['error']}"
            )
        
        # Step 4: Detect structural faults from simulation results
        structural_faults_detected = detect_structural_faults(circuit_dict, sim_result)
        all_structural_faults = warnings + structural_faults_detected

        # Step 5: ML pattern fault classification
        # Only run ML model if we have valid voltage/current data
        pattern_faults = None
        voltages = sim_result.get("voltages", {})
        currents = sim_result.get("currents", {})
        
        if voltages or currents:
            # We have some simulation data, run ML analysis
            analyzer = get_fault_analyzer()
            pattern_faults = analyzer.analyze(
                circuit_data    = circuit_dict,
                node_voltages   = voltages,
                branch_currents = currents,
            )
        else:
            # No simulation data - provide a clear message
            pattern_faults = {
                "predicted_fault": "No Data",
                "confidence": 0.0,
                "all_probabilities": {},
                "fault_type": "no_simulation_data",
                "description": "Simulation completed but returned no voltage or current data. This may indicate an ngspice parsing issue or an unusual circuit configuration.",
            }

        return SimulationResponse(
            success=True,
            netlist=netlist,
            structural_faults=all_structural_faults,
            pattern_faults=pattern_faults,
            simulation_data={
                "voltages":   voltages,
                "currents":   currents,
                "components": circuit_dict.get("components", []),
                "meters":     circuit_dict.get("meters", []),
            },
            error=None
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/validate")
async def validate_circuit(circuit: CircuitModel):
    """
    Validate circuit structure without running simulation.
    Quick structural fault check only.
    """
    
    try:
        circuit_dict = circuit.model_dump()
        result = validate_circuit_quick(circuit_dict)
        
        return {
            "valid": result["valid"],
            "errors": result["errors"],
            "warnings": result["warnings"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Server Entry Point
# ============================================================================

if __name__ == "__main__":
    print("🚀 Starting Circuit Fault Detector API...")
    print("📡 API documentation: http://localhost:8000/docs")
    print("🔍 Health check: http://localhost:8000/api/health")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Auto-reload on code changes
    )
