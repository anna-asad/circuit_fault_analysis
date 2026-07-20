"""ngspice execution and result parsing."""

import subprocess
import tempfile
import os
import re
from typing import Dict, List, Tuple, Optional
from pathlib import Path


class SimulationRunner:
    def __init__(self, ngspice_command=None, timeout=10):
        if ngspice_command is None:
            import platform
            ngspice_command = "ngspice_con" if platform.system() == "Windows" else "ngspice"
        self.ngspice_command = ngspice_command
        self.timeout = timeout
        self.temp_dir = Path(tempfile.gettempdir()) / "circuit_fault_detector"
        self.temp_dir.mkdir(exist_ok=True)

    def check_ngspice_installed(self) -> Tuple[bool, Optional[str]]:
        try:
            result = subprocess.run(
                [self.ngspice_command, "--version"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0] if result.stdout else "unknown"
                return True, version
            return False, None
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False, None

    def run_simulation(self, netlist: str, circuit_data: Dict = None) -> Dict:
        netlist_file = self.temp_dir / f"circuit_{os.getpid()}.cir"
        try:
            with open(netlist_file, 'w', encoding='utf-8') as f:
                f.write(netlist)

            result = subprocess.run(
                [self.ngspice_command, "-b", str(netlist_file)],
                capture_output=True, text=True, timeout=self.timeout
            )

            if result.returncode == 0:
                voltages, currents = self._parse_output(result.stdout)

                if '0' not in voltages:
                    voltages['0'] = 0.0

                # ngspice doesn't report current source branch currents in DC;
                # inject them directly from the circuit definition.
                if circuit_data:
                    for comp in circuit_data.get("components", []):
                        if comp.get("type") == "current_source":
                            cid = comp.get("id", "").upper()
                            if cid not in currents:
                                currents[cid] = comp.get("value", 0)

                return {"success": True, "voltages": voltages, "currents": currents,
                        "raw_output": result.stdout, "error": None}
            else:
                return {"success": False, "voltages": {}, "currents": {},
                        "raw_output": result.stdout + "\n" + result.stderr,
                        "error": f"ngspice exited with code {result.returncode}: {result.stderr}"}

        except subprocess.TimeoutExpired:
            return {"success": False, "voltages": {}, "currents": {}, "raw_output": "",
                    "error": f"Simulation timed out after {self.timeout} seconds"}
        except Exception as e:
            return {"success": False, "voltages": {}, "currents": {}, "raw_output": "",
                    "error": f"Simulation error: {e}"}
        finally:
            try:
                if netlist_file.exists():
                    netlist_file.unlink()
            except Exception:
                pass

    def _parse_output(self, output: str) -> Tuple[Dict[str, float], Dict[str, float]]:
        voltages: Dict[str, float] = {}
        currents: Dict[str, float] = {}

        for line in output.split('\n'):
            line = line.strip()
            if not line or line.startswith(('Note:', 'Circuit:', 'Doing')):
                continue

            # v(n1) = 5.000000e+00
            m = re.search(r'v\(([^)]+)\)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if m:
                voltages[m.group(1)] = float(m.group(2))
                continue

            # n1 = 5.000000e+00  (Windows ngspice_con)
            m = re.match(r'([a-z_]\w*)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if m and m.group(1).lower() not in ('allv', 'alli', 'all', 'temp', 'tnom'):
                voltages[m.group(1)] = float(m.group(2))
                continue

            # i(v1) = 5.000000e-03
            m = re.search(r'i\(([^)]+)\)\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if m:
                currents[m.group(1).upper()] = float(m.group(2))
                continue

            # v1#branch = -5.000000e-03  (Windows ngspice_con)
            m = re.search(r'([a-z]\w*)#branch\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if m:
                currents[m.group(1).upper()] = float(m.group(2))
                continue

            # @r1[i] = 5.000000e-03
            m = re.search(r'@([a-z]\w*)\[i\]\s*=\s*([-+]?[\d.]+(?:[eE][-+]?\d+)?)', line, re.IGNORECASE)
            if m:
                currents[m.group(1).upper()] = float(m.group(2))

        return voltages, currents


if __name__ == "__main__":
    runner = SimulationRunner()
    ok, ver = runner.check_ngspice_installed()
    print(f"{'✓' if ok else '✗'} ngspice{': ' + ver if ok else ' not found'}")
