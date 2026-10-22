import { describe, expect, it } from 'vitest';
import { buildRoute } from '../../test/fixtures';
import { buildEndpointFeatureCollection, buildRouteFeatureCollection, unionBbox } from './routeGeoJson';

describe('buildRouteFeatureCollection', () => {
  it('marks only the selected route and labels it with rank, duration and distance', () => {
    const routeA = buildRoute({ id: 'r1', rank: 1 });
    const routeB = buildRoute({ id: 'r2', rank: 2 });

    const fc = buildRouteFeatureCollection([routeA, routeB], 'r2');

    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties.selected).toBe(false);
    expect(fc.features[1]!.properties.selected).toBe(true);
    expect(fc.features[0]!.properties.label).toBe('1 · 8 h 21 min · 546.3 mi');
  });

  it('decodes each route geometry into a LineString', () => {
    const route = buildRoute({ geometry: { encoding: 'polyline5', points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', bbox: [-126.453, 38.5, -120.2, 43.252] } });

    const fc = buildRouteFeatureCollection([route], null);

    expect(fc.features[0]!.geometry.coordinates).toHaveLength(3);
  });
});

describe('buildEndpointFeatureCollection', () => {
  it('builds an origin (A) and destination (B) point pair', () => {
    const fc = buildEndpointFeatureCollection({ lat: 39.7, lng: -105 }, { lat: 41.3, lng: -95.9 });

    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toMatchObject({ properties: { role: 'origin', label: 'A' }, geometry: { coordinates: [-105, 39.7] } });
    expect(fc.features[1]).toMatchObject({ properties: { role: 'destination', label: 'B' }, geometry: { coordinates: [-95.9, 41.3] } });
  });
});

describe('unionBbox', () => {
  it('returns null for no routes', () => {
    expect(unionBbox([])).toBeNull();
  });

  it('unions bounding boxes across routes', () => {
    const routeA = buildRoute({ geometry: { encoding: 'polyline5', points: '', bbox: [-110, 38, -100, 42] } });
    const routeB = buildRoute({ geometry: { encoding: 'polyline5', points: '', bbox: [-105, 35, -95, 40] } });

    expect(unionBbox([routeA, routeB])).toEqual([-110, 35, -95, 42]);
  });
});
