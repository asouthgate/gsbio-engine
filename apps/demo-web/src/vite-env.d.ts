/// <reference types="vite/client" />

declare module '*.wasm' {
  export const MAX_COST: number;
  export const setup: (rows: number, cols: number) => void;
  export const markSource: (r: number, c: number, cols: number) => void;
  export const markBarrier: (r: number, c: number, cols: number) => void;
  export const relax: (rows: number, cols: number, iters: number) => void;
  export const dataStart: () => number;
  export const length: () => number;
  export const memory: WebAssembly.Memory;
}