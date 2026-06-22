import type { ReactNode } from 'react';
import { Canvas } from '@catshark/react';
import type { Renderer } from '@catshark/core';

export interface MapSceneProps {
  /** Renderer plugin (e.g. from @catshark/renderer-2d). Domain-supplied. */
  renderer: Renderer;
  /** Class for the renderer host (forwarded to <Canvas>). Default `map-view`. */
  className?: string;
  /** Class for the scene wrapper that establishes the overlay positioning context. Default `map-wrapper`. */
  wrapperClassName?: string;
  /** Overlays rendered above the renderer surface (e.g. <DrawToolbar />). */
  children?: ReactNode;
}

/**
 * Canonical "map + overlay" scene: a relatively-positioned wrapper containing
 * the renderer-agnostic <Canvas> plus any absolutely-positioned overlays
 * (draw toolbar, attribution, future result widgets). The renderer instance
 * and tile style remain domain-supplied; this component owns only the layout
 * idiom so consumers don't reinvent it per app.
 */
export function MapScene({
  renderer,
  className = 'map-view',
  wrapperClassName = 'map-wrapper',
  children,
}: MapSceneProps) {
  return (
    <div className={wrapperClassName}>
      <Canvas renderer={renderer} className={className}>
        {children}
      </Canvas>
    </div>
  );
}