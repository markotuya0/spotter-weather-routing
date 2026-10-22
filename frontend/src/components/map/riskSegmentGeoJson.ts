import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { RiskLevel, Route } from '../../api/types';
import { decodePolyline } from '../../lib/polyline';

export interface RiskSegmentFeatureProperties {
  level: RiskLevel;
  fromMiles: number;
  toMiles: number;
}

/** Risk-colored segments for one route (the selected route), decoded from `risk_segments[].points`. */
export function buildRiskSegmentFeatureCollection(
  route: Route | undefined,
): FeatureCollection<LineString, RiskSegmentFeatureProperties> {
  if (!route) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: route.risk_segments.map((segment): Feature<LineString, RiskSegmentFeatureProperties> => ({
      type: 'Feature',
      properties: { level: segment.level, fromMiles: segment.from_miles, toMiles: segment.to_miles },
      geometry: { type: 'LineString', coordinates: decodePolyline(segment.points) },
    })),
  };
}
