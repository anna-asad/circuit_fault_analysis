"""Simulation Runner - ngspice execution and result parsing"""

import subprocess
import tempfile
import os
import re
from typing import Dict, List, Tuple, Optional
from pathlib import Path


class SimulationRunner:
    """Runs ngspice simulations and parses output."""
    
    def __init__(self, ngspice_command=None, timeout=10):
        """
        Initialize simulation runner.
        
        Args:
            ngspice_command: Command to run ngspice (default: auto-detect)
            timeout: Maximum execution time in seconds
        """
        # Auto-detect ngspice command (Windows uses ngspice_con)
        if ngspice_command is None:
            import platform
            if platform.system() == "Windows":
                ngspice_command = "ngspice_con"
            else:
                ngspice_command = "ngspice"
        
        self.ngspice_command = ngspice_command
        self.timeout = timeout
        self.temp_dir = Path(tempfile.gettempdir()) / "circuit_fault_detector"
        self.temp_dir.mkdir(exist_ok=True)
    
    def check_ngspice_installed(self) -> Tuple[bool, Optional[str]]:
        """
        Check if ngspice is installed and accessible.
        
        Returns:
            (is_installed, version_string)
        """
        try:
            result = subprocess.run(
                [self.ngspice_command, "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0] if result.stdout else "unknown"
                return True, version
            else:
                return False, None
                
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False, None
    
    def run_simulation(self, netlist: str) -> Dict:
        """
        Run ngspice simulation with given netlist.
        
        Args:
            netlist: SPICE netlist string
            
        Returns:
            Dictionary with simulation results:
            {
                "success": bool,
                "voltages": {node: value},
                "currents": {source: value},
                "raw_output": str,
                "error": Optional[str]
            }
        """
        # Write netlist to temporary file
        netlist_file = self.temp_dir / f"circuit_{os.getpid()}.cir"
        
        try:
            with open(netlist_file, 'w') as f:
                f.write(netlist)
            
            # Run ngspice in batch mode
            result = subprocess.run(
                [self.ngspice_command, "-b", str(netlist_file)],
                capture_output=True,
                text=True,
                timeout=self.timeout
            )
            
            # Parse output
            if result.returncode == 0:
                voltages, currents = self._parse_output(result.stdout)
                
                return {
                    "success": True,
                    "voltages": voltages,
                    "currents": currents,
                    "raw_output": result.stdout,
                    "error": None
                }
            else:
                return {
                    "success": False,
                    "voltages": {},
                    "currents": {},
                    "raw_output": result.stdout + "\n" + result.stderr,
                    "error": f"ngspice exited with code {result.returncode}: {result.stderr}"
                }
        
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "voltages": {},
                "currents": {},
                "raw_output": "",
                "error": f"Simulation timed out after {self.timeout} seconds"
            }
        
        except Exception as e:
            return {
                "success": False,
                "voltages": {},
                "currents": {},
                "raw_output": "",
                "error": f"Simulation error: {str(e)}"
            }
        
        finally:
            # Clean up temporary file
            try:
                if netlist_file.exists():
                    netlist_file.unlink()
            except:
                pass
    
    def _parse_output(self, output: str) -> Tuple[Dict[str, float], Dict[str, float]]:
        """
        Parse ngspice output to extract voltages and currents.
        
        Args:
            output: Raw ngspice stdout
            
        Returns:
            (voltages_dict, currents_dict)
        """
        voltages = {}
        currents = {}
        
        lines = output.split('\n')
        
        for i, line in enumerate(lines):
            line = line.strip()
            
            # Skip empty lines and headers
            if not line or line.startswith('Note:') or line.startswith('Circuit:') or line.startswith('Doing'):
                continue
            
            # Parse node voltages - Format 1: "v(n1) = 5.000000e+00"
            voltage_match = re.search(r'v\(([^)]+)\)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if voltage_match:
                node = voltage_match.group(1)
                value = float(voltage_match.group(2))
                voltages[node] = value
                continue
            
            # Parse node voltages - Format 2: "n1 = 5.000000e+00" (Windows ngspice_con format)
            # Match node names like n1, n2, node1, etc. (but not special keywords)
            simple_voltage_match = re.match(r'([a-z_]\w*)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if simple_voltage_match:
                node = simple_voltage_match.group(1)
                value = float(simple_voltage_match.group(2))
                
                # Skip special keywords that aren't node names
                if node.lower() not in ['allv', 'alli', 'all', 'temp', 'tnom']:
                    voltages[node] = value
                continue
            
            # Parse currents - Format 1: "i(v1) = 5.000000e-03"
            current_match = re.search(r'i\(([^)]+)\)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if current_match:
                source = current_match.group(1).upper()
                value = float(current_match.group(2))
                currents[source] = value
                continue
            
            # Parse currents - Format 2: "v1#branch = -5.000000e-03" (Windows ngspice_con format)
            branch_match = re.search(r'([a-z]\w*)#branch\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if branch_match:
                source = branch_match.group(1).upper()
                value = float(branch_match.group(2))
                currents[source] = value
                continue
        
        return voltages, currents
    
    def extract_features_for_ml(self, voltages: Dict[str, float], currents: Dict[str, float], 
                                 circuit_data: Dict) -> Dict[str, float]:
        """
        Extract features from simulation results for ML model.
        
        This prepares data in the format expected by your trained model.
        
        Args:
            voltages: Node voltages from simulation
            currents: Source currents from simulation
            circuit_data: Original circuit definition
            
        Returns:
            Feature dictionary for ML model
        """
        features = {}
        
        # Extract component values
        for component in circuit_data.get("components", []):
            comp_type = component.get("type")
            comp_value = component.get("value", 0)
            
            if comp_type == "dc_source":
                features["voltage_supply"] = comp_value
            elif comp_type == "resistor":
                features["resistor_value"] = comp_value
            elif comp_type == "capacitor":
                features["capacitor_value"] = comp_value
            elif comp_type == "inductor":
                features.get("inductor_value", comp_value)
        
        # Extract measured values from simulation
        # Get voltage at first non-ground node
        non_ground_nodes = [n for n in voltages.keys() if n != "0"]
        if non_ground_nodes:
            features["voltage_out"] = voltages.get(non_ground_nodes[0], 0)
        else:
            features["voltage_out"] = 0
        
        # Get current draw (from first voltage source)
        source_currents = list(currents.values())
        if source_currents:
            features["current_draw"] = abs(source_currents[0])  # Absolute value
        else:
            features["current_draw"] = 0
        
        # For DC analysis, frequency response and phase shift are not applicable
        # Set to default values (these would come from AC analysis)
        features["frequency_response"] = 0.0
        features["phase_shift"] = 0.0
        
        return features


def run_simulation(netlist: str, circuit_data: Dict = None) -> Dict:
    """
    Convenience function to run simulation.
    
    Args:
        netlist: SPICE netlist string
        circuit_data: Optional circuit definition for feature extraction
        
    Returns:
        Simulation results dictionary
    """
    runner = SimulationRunner()
    result = runner.run_simulation(netlist)
    
    # If simulation succeeded and circuit data provided, extract ML features
    if result["success"] and circuit_data:
        features = runner.extract_features_for_ml(
            result["voltages"],
            result["currents"],
            circuit_data
        )
        result["ml_features"] = features
    
    return result


if __name__ == "__main__":
    runner = SimulationRunner()
    is_installed, version = runner.check_ngspice_installed()
    if is_installed:
        print(f"✓ ngspice: {version}")
    else:
        print("✗ ngspice not installed")
