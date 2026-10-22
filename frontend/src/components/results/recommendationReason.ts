import type { Recommendation, Route } from '../../api/types';
import { formatDuration, formatMiles } from '../common/format';

/** Builds a user-facing explanation for the recommended route purely from
 * structured fields already shown elsewhere in the UI (ranking keys, summary
 * durations) — never the backend's internal debug `reasons[].text`, which can
 * carry raw seconds and provider route IDs (docs 02 §2.4 / the "recommendation
 * clarity" UX pass). */
export function describeRecommendationReason(
  recommendation: Recommendation,
  routes: Route[],
): string | null {
  if (recommendation.fallback_level !== 'none') return null;

  const winner = routes.find((route) => route.id === recommendation.route_id);
  if (!winner) return null;

  const runnerUp = routes.find((route) => route.rank === winner.rank + 1);
  const key = recommendation.reasons[0]?.key;

  if (!runnerUp || !key || key === 'tie') {
    return routes.length > 1
      ? 'Lowest combined risk and travel time among the available routes.'
      : 'Only route returned for this trip.';
  }

  switch (key) {
    case 'severe_miles':
      return `${formatMiles(winner.ranking_keys.severe_miles)} of severe-risk road, versus ${formatMiles(
        runnerUp.ranking_keys.severe_miles,
      )} on the next-best route.`;
    case 'high_miles':
      return `${formatMiles(winner.ranking_keys.high_miles)} of high-risk road, versus ${formatMiles(
        runnerUp.ranking_keys.high_miles,
      )} on the next-best route.`;
    case 'average_risk':
      return `Lower average risk (${winner.ranking_keys.average_risk.toFixed(2)} vs ${runnerUp.ranking_keys.average_risk.toFixed(
        2,
      )}) than the next-best route, with equal risk mileage.`;
    case 'duration_seconds': {
      const deltaSeconds = Math.abs(runnerUp.summary.duration_seconds - winner.summary.duration_seconds);
      return `About ${formatDuration(deltaSeconds)} faster than the next-best route, with equal risk mileage.`;
    }
    default:
      return null;
  }
}
