import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAnalysisResult, buildRoute } from '../../test/fixtures';
import { Recommendation } from './Recommendation';

describe('Recommendation', () => {
  it('shows a plain-language reason with no raw seconds or route IDs when fallback_level is none', () => {
    const winner = buildRoute();
    const runnerUp = buildRoute({
      id: 'r2',
      rank: 2,
      name: 'Route 2',
      ranking_keys: { no_travel_miles: 0, severe_miles: 24.5, high_miles: 40.1, average_risk: 0.9, duration_seconds: 31000 },
    });
    const result = buildAnalysisResult({ routes: [winner, runnerUp] });
    render(<Recommendation recommendation={result.recommendation} routes={result.routes} />);
    expect(screen.getByText(/Recommended: Route 1/)).toBeInTheDocument();
    expect(screen.getByText(/0.0 mi of severe-risk road, versus 24.5 mi on the next-best route/)).toBeInTheDocument();
    expect(screen.queryByText(/\br2\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/30040s/)).not.toBeInTheDocument();
  });

  it('falls back to a generic reason when only one route is returned', () => {
    const result = buildAnalysisResult();
    render(<Recommendation recommendation={result.recommendation} routes={result.routes} />);
    expect(screen.getByText('Only route returned for this trip.')).toBeInTheDocument();
  });

  it('replaces the reason with fallback copy for incomplete_data', () => {
    const route = buildRoute({ eligibility: { status: 'incomplete', reason: 'unknown_at_3_checkpoints' } });
    const result = buildAnalysisResult({
      routes: [route],
      recommendation: {
        route_id: route.id,
        fallback_level: 'incomplete_data',
        blocked: false,
        reasons: [],
        ranking: [route.id],
      },
    });
    render(<Recommendation recommendation={result.recommendation} routes={result.routes} />);
    expect(screen.getByText(/best available with partial data/)).toBeInTheDocument();
  });

  it('shows the no-safe-route copy when every route is blocked', () => {
    const result = buildAnalysisResult({
      recommendation: {
        route_id: 'r1',
        fallback_level: 'no_safe_route',
        blocked: true,
        reasons: [],
        ranking: ['r1'],
      },
    });
    render(<Recommendation recommendation={result.recommendation} routes={result.routes} />);
    expect(screen.getByText(/No safe route for this departure time and load/)).toBeInTheDocument();
  });
});
