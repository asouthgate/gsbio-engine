/** Minimal `env` module Vite resolves when the wasm-plugin wires the
 *  AssemblyScript `env.abort` import into the wasm module's instantiation
 *  opts. Throws so a runaway wasm `unreachable()`/bounds-check failure
 *  surfaces as a JS error rather than a silent trap. */
export function abort(): never {
  throw new Error('wasm abort: AssemblyScript runtime reached an unreachable state');
}