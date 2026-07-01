import type { ReactNode } from 'react';
import { Canvas } from '../react';
import type { Renderer } from '../core';

export interface MapSceneProps {
  renderer: Renderer;
  className?: string;
  wrapperClassName?: string;
  children?: ReactNode;
}

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