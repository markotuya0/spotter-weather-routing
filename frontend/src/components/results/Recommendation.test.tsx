import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAnalysisResult, buildRoute } from '../../test/fixtures';
import { Recommendation } from './Recommendation';

describe('Recommendation', () => {
  it('shows the decisive reason when fallback_level is none', () => {
    const result = buildAnalysisResult();
    render(<Recommendation recommendation={result.recommendation} routes={result.routes} />);
    expect(screen.getByText(/Recommended: Route 1/)).toBeInTheDocument();
    expect(screen.getByText(/0.0 Severe miles vs 24.5 on Route 2/)).toBeInTheDocument();
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
