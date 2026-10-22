import { describe, expect, it } from 'vitest';
import { buildRoute } from '../../test/fixtures';
import { describeRecommendationReason } from './recommendationReason';
import type { Recommendation } from '../../api/types';

const BASE_RECOMMENDATION: Recommendation = {
  route_id: 'r1',
  fallback_level: 'none',
  blocked: false,
  reasons: [{ key: 'severe_miles', text: 'raw backend text with r2 and 123s', decisive: true }],
  ranking: ['r1', 'r2'],
};

describe('describeRecommendationReason', () => {
  it('returns null for fallback states (handled by the fallback banner instead)', () => {
    expect(
      describeRecommendationReason({ ...BASE_RECOMMENDATION, fallback_level: 'incomplete_data' }, [buildRoute()]),
    ).toBeNull();
  });

  it('never surfaces raw provider route IDs or raw seconds', () => {
    const winner = buildRoute({ id: 'r1', rank: 1 });
    const runnerUp = buildRoute({ id: 'r2', rank: 2, name: 'Route 2' });
    const text = describeRecommendationReason(BASE_RECOMMENDATION, [winner, runnerUp]);
    expect(text).not.toMatch(/\br2\b/);
    expect(text).not.toMatch(/\d+s\b/);
  });

  it('compares severe miles using mi units for the severe_miles key', () => {
    const winner = buildRoute({ id: 'r1', rank: 1, ranking_keys: { no_travel_miles: 0, severe_miles: 1.2, high_miles: 0, average_risk: 0.1, duration_seconds: 100 } });
    const runnerUp = buildRoute({ id: 'r2', rank: 2, ranking_keys: { no_travel_miles: 0, severe_miles: 5.6, high_miles: 0, average_risk: 0.1, duration_seconds: 100 } });
    const text = describeRecommendationReason(BASE_RECOMMENDATION, [winner, runnerUp]);
    expect(text).toBe('1.2 mi of severe-risk road, versus 5.6 mi on the next-best route.');
  });

  it('formats a duration_seconds decision in hours/minutes, not raw seconds', () => {
    const winner = buildRoute({ id: 'r1', rank: 1, summary: { ...buildRoute().summary, duration_seconds: 3600 } });
    const runnerUp = buildRoute({ id: 'r2', rank: 2, summary: { ...buildRoute().summary, duration_seconds: 3600 + 1800 } });
    const recommendation: Recommendation = {
      ...BASE_RECOMMENDATION,
      reasons: [{ key: 'duration_seconds', text: 'irrelevant', decisive: true }],
    };
    const text = describeRecommendationReason(recommendation, [winner, runnerUp]);
    expect(text).toBe('About 30 min faster than the next-best route, with equal risk mileage.');
  });

  it('falls back to a generic statement when there is only one route', () => {
    const text = describeRecommendationReason(BASE_RECOMMENDATION, [buildRoute({ id: 'r1', rank: 1 })]);
    expect(text).toBe('Only route returned for this trip.');
  });
});
