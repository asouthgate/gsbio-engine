import { useEffect, useRef, type ReactNode } from 'react';
import type { Renderer, SimulationEngine } from '../core';
import { useEngine } from './useEngine';

export interface CanvasProps {
  renderer: Renderer;
  className?: string;
  children?: ReactNode;
}

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