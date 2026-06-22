import { useEffect, useRef, type ReactNode } from 'react';
import type { Renderer, SimulationEngine } from '@catshark/core';
import { useEngine } from './useEngine';

export interface CanvasProps {
  /** Renderer plugin that draws the engine state into the host element. */
  renderer: Renderer;
  className?: string;
  /** Optional overlay (e.g. draw toolbar) rendered above the renderer surface. */
  children?: ReactNode;
}

/**
 * Renderer-agnostic view host. Owns a container `<div>` and asks the supplied
 * `Renderer` to mount/unmount against the current `SimulationEngine`. The
 * host itself has zero knowledge of maplibre / WebGL / WebGPU.
 *
 * The `Renderer` port contract is that `mount` is re-entrant: a second
 * `mount` on the same instance must safely tear down any state left by a
 * prior (e.g. React 19 StrictMode dev double-invoke) mount. This host only
 * adds the `cancelled` guard so a mount that resolves after its cleanup
 * unmounts what it just mounted.
 */
export function Canvas({ renderer, className, children }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engine: SimulationEngine = useEngine();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    void Promise.resolve(renderer.mount(container, engine)).then(() => {
      if (cancelled) void renderer.unmount();
    });
    return () => {
      cancelled = true;
      void renderer.unmount();
    };
  }, [renderer, engine]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {children}
    </div>
  );
}