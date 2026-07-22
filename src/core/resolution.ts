/** Compute the pixel dimensions of a square study area given roost radius
 *  and resolution (meters per pixel). The study area is 2 × radius on each
 *  side. */
export function computePixelDimensions(
  radiusMeters: number,
  resolutionMPerPx: number,
): { width: number; height: number } {
  const px = Math.round((2 * radiusMeters) / resolutionMPerPx);
  return { width: px, height: px };
}

/** Compute the minimum valid resolution (m/px) that keeps the pixel
 *  dimension at or below `maxPixelDimension`. */
export function computeMinResolution(
  radiusMeters: number,
  maxPixelDimension: number,
): number {
  return Math.ceil((2 * radiusMeters) / maxPixelDimension);
}
