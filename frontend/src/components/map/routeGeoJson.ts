import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { LatLng, Route } from '../../api/types';
import { formatDuration, formatMiles } from '../common/format';
import { decodePolyline } from '../../lib/polyline';

export interface RouteFeatureProperties {
  id: string;
  rank: number;
  selected: boolean;
  label: string;
}

export function buildRouteFeatureCollection(
  routes: Route[],
  selectedRouteId: string | null,
): FeatureCollection<LineString, RouteFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route): Feature<LineString, RouteFeatureProperties> => ({
      type: 'Feature',
      properties: {
        id: route.id,
        rank: route.rank,
        selected: route.id === selectedRouteId,
        label: `${route.rank} · ${formatDuration(route.summary.duration_seconds)} · ${formatMiles(route.summary.distance_miles)}`,
      },
      geometry: {
        type: 'LineString',
        coordinates: decodePolyline(route.geometry.points),
      },
    })),
  };
}

export interface EndpointFeatureProperties {
  role: 'origin' | 'destination';
  label: 'A' | 'B';
}

export function buildEndpointFeatureCollection(
  origin: LatLng,
  destination: LatLng,
): FeatureCollection<Point, EndpointFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { role: 'origin', label: 'A' },
        geometry: { type: 'Point', coordinates: [origin.lng, origin.lat] },
      },
      {
        type: 'Feature',
        properties: { role: 'destination', label: 'B' },
        geometry: { type: 'Point', coordinates: [destination.lng, destination.lat] },
      },
    ],
  };
}

export type Bbox = [number, number, number, number];

export function unionBbox(routes: Route[]): Bbox | null {
  if (routes.length === 0) return null;
  const [firstWest, firstSouth, firstEast, firstNorth] = routes[0]!.geometry.bbox;
  let west = firstWest;
  let south = firstSouth;
  let east = firstEast;
  let north = firstNorth;
  for (const route of routes.slice(1)) {
    const [w, s, e, n] = route.geometry.bbox;
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
  }
  return [west, south, east, north];
}
