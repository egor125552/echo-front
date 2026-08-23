import * as wasmImports from "@dimforge/rapier3d/rapier_wasm3d_bg.js";
import wasmModule from "@dimforge/rapier3d/rapier_wasm3d_bg.wasm";
import * as RAPIER from "@dimforge/rapier3d";

const wasmInstance = new WebAssembly.Instance(wasmModule, {
  "./rapier_wasm3d_bg.js": wasmImports,
});
wasmImports.__wbg_set_wasm(wasmInstance.exports);

export function getWorkerRapier() {
  return RAPIER;
}
