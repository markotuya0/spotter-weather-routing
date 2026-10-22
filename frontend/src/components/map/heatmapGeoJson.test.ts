import { describe, expect, it } from 'vitest';
import type { Heatmap } from '../../api/types';
import { buildHeatmapFeatureCollection, heatmapLevel } from './heatmapGeoJson';

function buildHeatmap(overrides: Partial<Heatmap> = {}): Heatmap {
  return {
    start_time: '2026-10-22T20:00:00Z',
    hours: 3,
    legend: ['low', 'moderate', 'high', 'severe', 'no_travel'],
    encoding: { risk: '0-4 = low..no_travel, 255 = unknown' },
    points: [
      { lat: 40.1, lng: -103.2, route_ids: ['r1'], risk: [0, 1, 2] },
      { lat: 41.5, lng: -100.0, route_ids: ['r1', 'r2'], risk: [3, 4, 255] },
    ],
    ...overrides,
  };
}

describe('heatmapLevel', () => {
  it.each([
    [0, 'low'],
    [1, 'moderate'],
    [2, 'high'],
    [3, 'severe'],
    [4, 'no_travel'],
  ])('maps code %i to %s', (code, level) => {
    expect(heatmapLevel(code)).toBe(level);
  });

  it('maps 255 (unknown) to unknown', () => {
    expect(heatmapLevel(255)).toBe('unknown');
  });

  it('never maps a missing or unrecognised value to low', () => {
    expect(heatmapLevel(undefined)).toBe('unknown');
    expect(heatmapLevel(5)).toBe('unknown');
    expect(heatmapLevel(-1)).toBe('unknown');
    expect(heatmapLevel(1.5)).toBe('unknown');
    expect(heatmapLevel(Number.NaN)).toBe('unknown');
  });
});

describe('buildHeatmapFeatureCollection', () => {
  it('returns an empty collection when there is no heatmap', () => {
    expect(buildHeatmapFeatureCollection(undefined, 0)).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('builds one point per heatmap point with [lng, lat] coordinates', () => {
    const collection = buildHeatmapFeatureCollection(buildHeatmap(), 0);

    expect(collection.features).toHaveLength(2);
    expect(collection.features[0]!.geometry).toEqual({ type: 'Point', coordinates: [-103.2, 40.1] });
    expect(collection.features[1]!.geometry).toEqual({ type: 'Point', coordinates: [-100.0, 41.5] });
  });

  it('reads only the requested hour', () => {
    const atHour0 = buildHeatmapFeatureCollection(buildHeatmap(), 0);
    const atHour1 = buildHeatmapFeatureCollection(buildHeatmap(), 1);

    expect(atHour0.features.map((f) => f.properties.level)).toEqual(['low', 'severe']);
    expect(atHour1.features.map((f) => f.properties.level)).toEqual(['moderate', 'no_travel']);
  });

  it('keeps unknown points as unknown rather than low', () => {
    const collection = buildHeatmapFeatureCollection(buildHeatmap(), 2);

    expect(collection.features[0]!.properties.level).toBe('high');
    expect(collection.features[1]!.properties.level).toBe('unknown');
  });

  it('marks a point as unknown when the requested hour is outside the array', () => {
    const collection = buildHeatmapFeatureCollection(buildHeatmap(), 48);

    expect(collection.features.every((f) => f.properties.level === 'unknown')).toBe(true);
  });

  it('gives each feature a stable numeric id', () => {
    const collection = buildHeatmapFeatureCollection(buildHeatmap(), 0);

    expect(collection.features.map((f) => f.id)).toEqual([0, 1]);
  });
});
