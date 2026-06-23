/// <reference types="vite/client" />

declare module '*.wasm' {
  export const setup: (n: number) => void;
  export const fillRadial: (n: number) => void;
  export const dataStart: () => number;
  export const length: () => number;
  export const memory: WebAssembly.Memory;
}