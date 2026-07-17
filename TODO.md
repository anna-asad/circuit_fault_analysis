# Circuit Fault Detector — TODO

> Generated July 2026. Items are grouped by area and ordered within each group
> by impact: fix bugs that break existing features first, then fill gaps, then
> add new capabilities.

---

## 1. Critical Bugs (break existing functionality)

### 1.1 ML model never learns the user's circuit topology
**Problem:** The deviation-from-nominal features (`max_deviation_ratio`, etc.) are
the most important ML signals, but they only work for the 11 hardcoded training
circuits stored in `nominal_lookup.joblib`.  Any circuit drawn in the UI that
doesn't match one of those topologies will have all deviation features = 0, and
the model will almost always predict "Normal" regardless of what's wrong.

**Fix needed:**
- `fault_analyzer.py` → `map_to_nominal_values()` (in `topology_matcher.py`):
  when no matching nominal is found, compute nominal values on-the-fly from the
  circuit definition itself (the component values the user set) and store them
  temporarily for that request.
- Longer term: add a "re-train on user circuits" flow, or replace the
  deviation approach with a purely measurement-based feature set that doesn't
  need nominal values.

---

### 1.2 `comp_mean / comp_std / comp_max / comp_min` features are broken
**Problem:** `fault_analyzer.py` explicitly marks these four features as broken
("mixes units — Ω, V, A") and excludes them from the model input.  But
`feature_columns.joblib` was saved with them included, so when the feature
DataFrame is reindexed against `feature_columns` the columns come back as 0.
The model was trained on the full 17-feature vector; it now sees 13 real values
and 4 zeros.  This silently degrades every prediction.

**Fix needed:** Either retrain the model with `comp_*` features removed from
`src/train.py`, or replace them with per-type component statistics
(e.g. `resistor_mean`, `resistor_max`) that are unit-consistent.  Then
regenerate `feature_columns.joblib` and redeploy.

---

### 1.3 `simulation_runner.py` holds the file open while ngspice runs
**Problem:** The `subprocess.run(...)` call is indented inside the
`with open(...) as f:` block.  On Windows, ngspice may fail to open the same
file for reading while Python holds an exclusive write handle.

**Fix:** Dedent `subprocess.run(...)` to run after the `with` block closes.

---

### 1.4 Reversed-polarity check fires on correctly wired circuits
**Problem:** `_check_reversed_polarity` flags any source whose first node is `"0"`.
But which node is "first" depends on union-find traversal order, not on which
physical terminal the user connected to ground.  This produces false positives
for valid circuits where the negative terminal is grounded.

**Fix:** Remove the reversed-polarity check, or replace it with a sign check on
the simulated voltage: if `V(n+) - V(n-) < 0` for a source that has a positive
rated value, flag it.

---

### 1.5 `n_missing_currents` counts incorrectly for mixed circuits
**Problem:** `fault_analyzer.py` infers component type from the ID prefix
(`V` = source, `I` = source, else passive).  User-created IDs like `AM1`
(ammeter) or `VM1` (voltmeter) will be counted as passives, inflating the
missing-current count and triggering false `wrong_component_type` predictions.

**Fix:** Pass the component type explicitly from `circuit_data["components"]`
into `_extract_features()` instead of inferring it from the ID.

---

## 2. Simulation Gaps

### 2.1 DC only — no AC or transient analysis
The entire system runs a single `.op` DC analysis.  Capacitors are open
circuits, inductors are short circuits.  This means:
- Capacitor and inductor fault types cannot be detected by the ML model
- Frequency-dependent behavior (filters, oscillators) cannot be simulated
- The `frequency_response` and `phase_shift` features in the legacy extractor
  are hardcoded to `0.0`

**Next step:** Add an AC sweep endpoint (`POST /api/simulate/ac`) that runs
`.ac dec 100 1 1Meg` and returns magnitude/phase at each node.  This unlocks
capacitor and inductor fault detection.

---

### 2.2 Only one ground node supported
`circuitConverter.js` uses `groundNodes[0]` unconditionally.  If the user
places two ground symbols (a common practice for readability), only the first
one participates in the simulation.  The second is silently ignored, which can
cause open-circuit false positives.

**Fix:** Treat all ground nodes as the same electrical node `"0"` — union them
all together before processing edges.

---

### 2.3 ngspice not bundled — users must install separately
The backend hard-fails if `ngspice_con` / `ngspice` is not on PATH with no
guidance in the UI.

**Fix:** `/api/health` already checks for ngspice.  Wire that check into the
frontend: on app load, call `/api/health` and if `ngspice.installed` is false,
show a one-time banner with install instructions rather than letting the user
build a circuit and hit a cryptic error on simulate.

---

## 3. Circuit Editor UX

### 3.1 Wire routing still produces diagonal lines in some cases
The canvas uses `smoothstep` edges with `borderRadius: 0`, which produces
orthogonal elbows most of the time.  But when a component is rotated and its
handle is at the top or bottom, the router sometimes produces a diagonal
segment before it finds the orthogonal path.

**Fix:** Investigate ReactFlow's `StraightEdge` or a custom orthogonal edge
type that enforces horizontal/vertical-only segments.

---

### 3.2 No way to label wires / nodes
Users have no way to name a node (e.g. "Vout") for reference in the results.
This makes it hard to correlate the results panel with the drawn circuit.

**Next step:** Add an optional text label that can be placed on any wire,
stored in edge `data.label`, and displayed as a small floating tag.

---

### 3.3 No undo / redo
There is no Ctrl+Z support.  A misplaced component or accidental delete cannot
be recovered without clearing the whole canvas.

**Fix:** Use ReactFlow's built-in history hooks or a lightweight `useReducer`
with an undo stack on `nodes` + `edges`.

---

### 3.4 No "clear canvas" button
The only way to start over is to reload the page.

**Fix:** Add a "Clear" button (with confirmation dialog) to the toolbar.

---

### 3.5 No save / load circuit
Built circuits are lost on page reload.

**Next step:** Serialize `{ nodes, edges }` to JSON and save to
`localStorage` on every change.  Add an "Export .json" / "Import .json" pair
of buttons to the toolbar for sharing circuits.

---

### 3.6 Component value input doesn't support SI prefixes
Users must type raw numbers (`1000` for 1 kΩ, `0.000001` for 1 µF).

**Fix:** Parse SI prefix shorthand in the inline value editor — `1k` → 1000,
`4.7u` → 4.7e-6, `100n` → 1e-7, etc.

---

### 3.7 No keyboard shortcut reference
The only hint is the canvas instruction banner ("Del to delete, Ctrl+R to
rotate"), which disappears after the first component is placed.

**Fix:** Add a `?` icon in the toolbar that opens a small shortcut reference
overlay.

---

## 4. Results Display

### 4.1 Component cards don't distinguish "no data from ngspice" from "value is 0"
When ngspice doesn't report a current for a component (e.g. a capacitor in DC),
`resolveCurrent()` returns `0`.  The card shows "0 A" which looks like a real
measurement, not a missing one.

**Fix:** Return `null` explicitly for components where DC current is always
undefined (capacitor, inductor), and display "— (DC open)" instead of "0 A".

---

### 4.2 No per-component fault highlighting on the canvas
The results page shows a read-only canvas, but faulted components look
identical to healthy ones.  The user has to cross-reference the fault text
with the component ID.

**Next step:** When `structural_faults` is non-empty, parse the component IDs
mentioned in each fault message and highlight those nodes on the results canvas
(e.g. red border or pulsing glow).

---

### 4.3 ML confidence shown but not explained
The confidence number (e.g. "87%") is shown with no explanation of what it
means.  Users often interpret it as "87% sure the circuit is broken" when it
actually means "87% sure the fault is *this specific type*".

**Fix:** Add a tooltip on the confidence badge explaining: "Confidence that
the predicted fault type is correct — not the overall circuit health score."

---

### 4.4 No history of past simulations
Each simulate replaces the previous result.  There is no way to compare two
runs (e.g. before and after changing a resistor value).

**Next step:** Keep the last N results in a `simulationHistory` array in
`App.jsx` and add a small history dropdown to the results header.

---

## 5. ML Model

### 5.1 Retrain with a larger, more diverse dataset
The current dataset has 1,320 samples across 11 topologies.  The model
performs well on those topologies but poorly on anything new.

**Next steps:**
- Add 20+ more circuit topologies to `dataset_generator.py`
- Include parallel RC, RL, RLC, bridge rectifier, and common op-amp topologies
- Increase samples per fault type from 20 to 100+
- Add a `current_source_fault` fault type (currently all faults are resistor
  mutations)

---

### 5.2 Add a "no fault / unknown topology" confidence floor
The model currently returns "Normal" with high confidence for any unknown
topology because all deviation features are 0 (looks exactly like a nominal
circuit).  It should instead return "Unknown topology — cannot assess" when
the nominal lookup has no match.

**Fix:** In `fault_analyzer.py`, check whether `map_to_nominal_values` found
a match. If it didn't, return a special response with `fault_type:
"unknown_topology"` and a message explaining that the ML assessment is
unreliable for this circuit.

---

### 5.3 Replace `MultiOutputClassifier` with a proper multi-label model
`RandomForestClassifier` in sklearn wraps each label in a separate binary
classifier when used with `MultiOutputClassifier`.  This ignores label
correlations (e.g. `partial_short` and `drift` rarely co-occur).

**Next step:** Evaluate `ClassifierChain` or a gradient-boosted multi-label
model (XGBoost with multi-output), or reformulate as a single 6-class problem
(`normal`, `drift`, `partial_short`, `partial_open`, `wrong_type`,
`multiple_faults`).

---

## 6. Code Quality & Infrastructure

### 6.1 Remove debug `print` statements from `fault_analyzer.py`
`fault_analyzer.py` prints an 80-character debug block to stdout on every
single simulation request.  This pollutes the server logs and slows down
responses when log levels are captured.

**Fix:** Replace all `print()` calls in `fault_analyzer.py` with
`logging.debug()` calls.  Set the log level to WARNING in production.

---

### 6.2 Add a test suite
There are two test files (`tests/test_36_samples.py`,
`tests/test_model_ch3.py`) but no continuous test runner configured.

**Next steps:**
- Add `pytest` to `backend/requirements.txt` (already there as a comment)
- Write unit tests for `structural_faults.py` covering every check with a
  minimal circuit fixture
- Write unit tests for `circuitConverter.js` (Vitest, already in the Vite
  project)
- Add a GitHub Actions workflow that runs both test suites on every push

---

### 6.3 Pin all dependency versions
`requirements.txt` uses `>=` version bounds.  A future breaking release of
scikit-learn, pandas, or FastAPI could silently break the project.

**Fix:** Run `pip freeze > requirements.lock` and commit the lockfile.
Use `pip install -r requirements.lock` in the README quick-start.

---

### 6.4 Add a `docker-compose.yml`
Setup currently requires manual installation of Python venv, Node, ngspice,
and the correct PATH configuration.  This is a significant onboarding barrier.

**Next step:** Add a `docker-compose.yml` with:
- A `backend` service (Python image with ngspice installed from apt)
- A `frontend` service (Node image running `npm run dev`)
- Volume mount for live reload during development

---

### 6.5 Move API URL out of hardcoded string
`SimulateButton.jsx` hardcodes `http://localhost:8000`.  Deploying to any
other host or port silently breaks the frontend.

**Fix:** Read from `import.meta.env.VITE_API_URL` with a fallback of
`http://localhost:8000`, and document `VITE_API_URL` in a `.env.example` file.

---

## 7. New Features (after bugs are fixed)

| Feature | Why | Effort |
|---|---|---|
| AC sweep simulation | Enables capacitor/inductor fault detection | Large |
| Transient simulation | Time-domain behaviour of RC/RL circuits | Large |
| Export circuit as PNG / SVG | Share circuit diagrams without the editor | Small |
| Export netlist as `.cir` file | Let advanced users run ngspice manually | Small |
| Diode component | Enables rectifier and protection circuits | Medium |
| NPN/PNP transistor | Enables amplifier and switch circuits | Large |
| Op-amp (ideal) | Enables filter and amplifier topologies | Large |
| Multi-page canvas | Multiple sub-circuits with shared ground bus | Large |
| Fault injection mode | Let user manually set a component to "faulty" and check if ML catches it | Medium |
| PDF report export | Generate a one-page simulation report with circuit image + results | Medium |
