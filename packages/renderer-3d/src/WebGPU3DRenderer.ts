import type { Renderer } from '@gsbio/core';

export type WebGPU3DOptions = Record<string, unknown>;

/**
 * Placeholder 3D renderer. Implements the `Renderer` port so it can be
 * mounted by `@gsbio/react`'s `<Canvas>` even before WebGL/WebGPU code is
 * written. All methods currently throw — implementations land later.
 */
export class WebGPU3DRenderer implements Renderer {
  constructor(_options: WebGPU3DOptions = {}) {}

  mount(_container: HTMLElement, _engine: unknown): Promise<void> {
    return Promise.reject(new Error('WebGPU3DRenderer is not implemented yet.'));
  }

  unmount(): void {
    // No-op until implemented.
  }
}

export function createWebGPU3DRenderer(options: WebGPU3DOptions = {}): WebGPU3DRenderer {
  return new WebGPU3DRenderer(options);
}