# Circuit Fault Detector Backend

FastAPI backend for circuit simulation and fault detection.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python main.py
```

Server: http://localhost:8000  
API Docs: http://localhost:8000/docs

## Core Files

- `main.py` - FastAPI server & API endpoints
- `validators.py` - Circuit validation & value ranges
- `netlist_generator.py` - SPICE netlist generation
- `simulation_runner.py` - ngspice execution
- `structural_faults.py` - Wiring fault detection
- `fault_analyzer.py` - ML model integration

## API Endpoints

**GET** `/api/health` - System status  
**GET** `/api/components` - Available components  
**POST** `/api/simulate` - Run simulation & fault detection  
**POST** `/api/validate` - Validate circuit only
