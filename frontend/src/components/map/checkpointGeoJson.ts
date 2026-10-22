import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Checkpoint, RiskLevel } from '../../api/types';

export interface CheckpointFeatureProperties {
  index: number;
  level: RiskLevel;
  selected: boolean;
}

/** Point features for one route's checkpoints (the selected route only — `06` §5). */
export function buildCheckpointFeatureCollection(
  checkpoints: Checkpoint[],
  selectedIndex: number | null,
): FeatureCollection<Point, CheckpointFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: checkpoints.map((checkpoint): Feature<Point, CheckpointFeatureProperties> => ({
      type: 'Feature',
      properties: {
        index: checkpoint.index,
        level: checkpoint.risk.level,
        selected: checkpoint.index === selectedIndex,
      },
      geometry: { type: 'Point', coordinates: [checkpoint.lng, checkpoint.lat] },
    })),
  };
}
