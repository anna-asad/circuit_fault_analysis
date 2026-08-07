#!/usr/bin/env node
/** Quick preset → backend converter smoke test (run from frontend/). */
import { loadPresetCircuit, listPresetCircuitKeys } from '../src/utils/presetCircuitLoader.js';
import { convertCircuitToBackendFormat } from '../src/utils/circuitConverter.js';

const keys = listPresetCircuitKeys();
let failed = 0;

for (const key of keys) {
  try {
    const preset = loadPresetCircuit(key);
    const result = convertCircuitToBackendFormat(preset.nodes, preset.edges);
    const hasGndOnSrc = result.components
      .filter((c) => c.type === 'dc_source')
      .some((c) => c.nodes.includes('0'));
    if (hasGndOnSrc) {
      console.error(`FAIL ${key}: DC source terminal on ground node`, result.components.find(c=>c.type==='dc_source'));
      failed++;
    } else {
      console.log(`OK   ${key} (${result.components.length} components)`);
    }
  } catch (e) {
    console.error(`FAIL ${key}:`, e.message);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
