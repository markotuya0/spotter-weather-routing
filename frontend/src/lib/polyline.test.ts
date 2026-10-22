import { describe, expect, it } from 'vitest';
import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('decodes the standard Google polyline algorithm example', () => {
    const coordinates = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');

    expect(coordinates).toHaveLength(3);
    const [[lng0, lat0], [lng1, lat1], [lng2, lat2]] = coordinates as [
      [number, number],
      [number, number],
      [number, number],
    ];
    expect(lat0).toBeCloseTo(38.5, 5);
    expect(lng0).toBeCloseTo(-120.2, 5);
    expect(lat1).toBeCloseTo(40.7, 5);
    expect(lng1).toBeCloseTo(-120.95, 5);
    expect(lat2).toBeCloseTo(43.252, 5);
    expect(lng2).toBeCloseTo(-126.453, 5);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
