import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Heatmap, RiskLevel } from '../../api/types';

export interface HeatmapFeatureProperties {
  level: RiskLevel;
}

/** Encoded heatmap values 0-4 = low..no_travel (`04` heatmap, docs/05 §10). 255 = unknown. */
const HEATMAP_LEVEL_BY_CODE: Record<number, RiskLevel> = {
  0: 'low',
  1: 'moderate',
  2: 'high',
  3: 'severe',
  4: 'no_travel',
};

/**
 * Maps one encoded heatmap value to a risk level. Anything not recognised (255, a missing hour,
 * a non-integer) is `unknown`. It is never coerced to `low` (`06` §6, honesty rules).
 */
export function heatmapLevel(code: number | undefined): RiskLevel {
  if (code === undefined) return 'unknown';
  return HEATMAP_LEVEL_BY_CODE[code] ?? 'unknown';
}

/**
 * Point features for the corridor heatmap at one forecast hour (`h` = hours after departure).
 * Coordinates are `[lng, lat]`. The slider (M5.2) will reuse this with a different `hour`.
 */
export function buildHeatmapFeatureCollection(
  heatmap: Heatmap | undefined,
  hour: number,
): FeatureCollection<Point, HeatmapFeatureProperties> {
  if (!heatmap) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: heatmap.points.map((point, index): Feature<Point, HeatmapFeatureProperties> => ({
      type: 'Feature',
      id: index,
      properties: { level: heatmapLevel(point.risk[hour]) },
      geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
    })),
  };
}
