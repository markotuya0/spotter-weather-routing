import { describe, expect, it } from 'vitest';
import { buildRoute } from '../../test/fixtures';
import { buildRiskSegmentFeatureCollection } from './riskSegmentGeoJson';

describe('buildRiskSegmentFeatureCollection', () => {
  it('decodes each segment and carries its level and mile range', () => {
    const route = buildRoute({
      risk_segments: [
        { level: 'low', from_miles: 0, to_miles: 400, points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
        { level: 'high', from_miles: 400, to_miles: 546.3, points: '' },
      ],
    });

    const fc = buildRiskSegmentFeatureCollection(route);

    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toEqual({ level: 'low', fromMiles: 0, toMiles: 400 });
    expect(fc.features[0]!.geometry.coordinates).toHaveLength(3);
    expect(fc.features[1]!.properties.level).toBe('high');
  });

  it('returns no features when there is no route', () => {
    expect(buildRiskSegmentFeatureCollection(undefined).features).toHaveLength(0);
  });
});
