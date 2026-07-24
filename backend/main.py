"""FastAPI Backend for Circuit Fault Detector"""

import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional
import uvicorn

from validators import CircuitValidator, ComponentSpec, validate_circuit_quick
from netlist_generator import generate_netlist
from simulation_runner import SimulationRunner
from structural_faults import detect_structural_faults
from fault_analyzer import FaultAnalyzer

log = logging.getLogger(__name__)

app = FastAPI(
    title="Circuit Fault Detector API",
    description="Backend API for circuit simulation and fault detection",
    version="1.0.0"
)

_fault_analyzer: FaultAnalyzer = None

@app.on_event("startup")
async def load_models():
    global _fault_analyzer
    _fault_analyzer = FaultAnalyzer()
    if _fault_analyzer.is_model_loaded():
        log.info("ML model loaded")
    else:
        log.warning("ML model not available — run python src/train.py")

def get_fault_analyzer() -> FaultAnalyzer:
    return _fault_analyzer

# CORS
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


# ── Data Models ───────────────────────────────────────────────────────────────

class ComponentModel(BaseModel):
    id: str = Field(..., description="Unique component identifier (e.g., 'R1', 'V1')")
    type: str = Field(..., description="Component type: dc_source, current_source, resistor, capacitor, inductor, ground, ammeter, voltmeter, switch, bulb")
    value: Optional[float] = Field(default=0, description="Component value (resistance, capacitance, voltage, etc.)")
    nodes: List[str] = Field(..., description="Connected node IDs [positive, negative]")
    position: Dict[str, float] = Field(default={"x": 0, "y": 0}, description="Canvas position")
    state: Optional[str] = Field(default=None, description="Switch state: 'open' or 'closed' (only for switch type)")
    
    @validator('value', pre=True, always=True)
    def ensure_value(cls, v, values):
        """Ensure value is never None, default to 0 for switches"""
        if v is None:
            component_type = values.get('type')
            if component_type == 'switch':
                return 0  # Switch doesn't use numeric value
            return 0
        return v
    
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
            "icon": "♒",
            "value_range": {"min": 1, "max": 1e8, "default": 1000},
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
        },
        {
            "type": "switch",
            "label": "Switch",
            "icon": "⏻",
            "value_range": None,
            "unit": None,
            "description": "Switch (open/closed state)"
        },
        {
            "type": "bulb",
            "label": "Bulb",
            "icon": "💡",
            "value_range": [1.0, 10000.0],
            "unit": "Ω",
            "description": "Light bulb with resistance"
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
        circuit_dict = circuit.model_dump()
        
        # Ensure all component values are not None to prevent comparison errors
        for comp in circuit_dict.get("components", []):
            if comp.get("value") is None:
                comp["value"] = 0
        
        validator = CircuitValidator()
        is_valid, errors, warnings = validator.validate(circuit_dict)

        floating_node_faults = [w for w in warnings if w.startswith("Floating nodes (single connection):")]

        if floating_node_faults:
            return SimulationResponse(
                success=False,
                netlist=None,
                structural_faults=warnings,
                pattern_faults=None,
                simulation_data=None,
                error=floating_node_faults[0],
            )
        
        if not is_valid:
            return SimulationResponse(
                success=False,
                netlist=None,
                structural_faults=errors,
                pattern_faults=None,
                simulation_data=None,
                error=f"Circuit validation failed: {'; '.join(errors)}"
            )
        
        netlist = generate_netlist(circuit_dict)
        
        pre_sim_faults = detect_structural_faults(circuit_dict, simulation_result={})

        # Separate meter-placement faults (fatal) from everything else (warn).
        meter_faults   = [f for f in pre_sim_faults
                          if 'Ammeter' in f or 'Voltmeter' in f or 'ammeter' in f or 'voltmeter' in f]
        non_meter_pre  = [f for f in pre_sim_faults
                          if 'Ammeter' not in f and 'Voltmeter' not in f]
        
        if meter_faults:
            # Meter placement errors are fatal — abort before running ngspice.
            return SimulationResponse(
                success=False,
                netlist=netlist,
                structural_faults=warnings + meter_faults + non_meter_pre,
                pattern_faults=None,
                simulation_data=None,
                error=meter_faults[0]
            )
        
        runner = SimulationRunner()
        sim_result = runner.run_simulation(netlist, circuit_data=circuit_dict)
        
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

        if structural_faults_detected:
            return SimulationResponse(
                success=False,
                netlist=netlist,
                structural_faults=all_structural_faults,
                pattern_faults=None,
                simulation_data=None,
                error=structural_faults_detected[0],
            )

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

        # Calculate bulb brightness based on power
        BRIGHTNESS_THRESHOLD = 0.01  # Watts - configurable threshold
        components_with_brightness = []
        
        for comp in circuit_dict.get("components", []):
            comp_copy = comp.copy()
            
            if comp.get("type") == "bulb":
                comp_id = comp.get("id")
                nodes = comp.get("nodes", [])
                
                try:
                    if len(nodes) >= 2:
                        v1 = voltages.get(nodes[0])
                        v2 = voltages.get(nodes[1])
                        
                        # Only calculate if both voltages exist
                        if v1 is not None and v2 is not None:
                            voltage = abs(float(v1) - float(v2))
                            
                            # Get current through bulb - bulb uses spice name R{comp_id}
                            # Try multiple possible keys: RL1, L1, @RL1[i]
                            spice_name = f"R{comp_id}"
                            current = currents.get(spice_name) or currents.get(comp_id) or currents.get(f"@{spice_name}[i]") or 0
                            if current is None:
                                current = 0
                            current = abs(float(current))
                            
                            power = voltage * current
                            
                            # Determine brightness
                            if power < 1e-6:  # essentially zero
                                brightness = "off"
                            elif power < BRIGHTNESS_THRESHOLD:
                                brightness = "dim"
                            else:
                                brightness = "bright"
                            
                            comp_copy["brightness"] = brightness
                            comp_copy["power"] = power
                        else:
                            comp_copy["brightness"] = "off"
                            comp_copy["power"] = 0
                    else:
                        comp_copy["brightness"] = "off"
                        comp_copy["power"] = 0
                except Exception as e:
                    print(f"Error calculating bulb brightness for {comp_id}: {e}")
                    comp_copy["brightness"] = "off"
                    comp_copy["power"] = 0
            
            components_with_brightness.append(comp_copy)

        return SimulationResponse(
            success=True,
            netlist=netlist,
            structural_faults=all_structural_faults,
            pattern_faults=pattern_faults,
            simulation_data={
                "voltages":       voltages,
                "currents":       currents,
                "components":     components_with_brightness,
                "meters":         circuit_dict.get("meters", []),
                "drift_warnings": pattern_faults.get("drift_warnings", []) if pattern_faults else [],
            },
            error=None
        )
        
    except Exception as e:
        import traceback
        print("=" * 80)
        print("ERROR in simulate_circuit:")
        print(traceback.format_exc())
        print("=" * 80)
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
