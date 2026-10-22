import { describe, expect, it } from 'vitest';
import { buildCheckpoint } from '../../test/fixtures';
import { buildCheckpointFeatureCollection } from './checkpointGeoJson';

describe('buildCheckpointFeatureCollection', () => {
  it('builds one point feature per checkpoint, marking the selected one', () => {
    const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1, lat: 41, lng: -101 })];

    const fc = buildCheckpointFeatureCollection(checkpoints, 1);

    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties).toMatchObject({ index: 0, level: 'high', selected: false });
    expect(fc.features[1]!.properties).toMatchObject({ index: 1, selected: true });
    expect(fc.features[1]!.geometry.coordinates).toEqual([-101, 41]);
  });

  it('returns no features for an empty list', () => {
    expect(buildCheckpointFeatureCollection([], null).features).toHaveLength(0);
  });
});
