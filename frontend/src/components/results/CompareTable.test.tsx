import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildRoute } from '../../test/fixtures';
import { CompareTable } from './CompareTable';

describe('CompareTable', () => {
  it('marks the winning route for each deciding metric', () => {
    const fast = buildRoute({
      id: 'r1',
      name: 'Route 1',
      ranking_keys: { no_travel_miles: 0, severe_miles: 0, high_miles: 40.1, average_risk: 0.74, duration_seconds: 30040 },
    });
    const slowButSafer = buildRoute({
      id: 'r2',
      name: 'Route 2',
      ranking_keys: { no_travel_miles: 0, severe_miles: 0, high_miles: 10, average_risk: 0.3, duration_seconds: 35000 },
    });
    render(<CompareTable routes={[fast, slowButSafer]} />);

    const rows = screen.getAllByRole('row');
    const highMilesRow = rows.find((row) => row.textContent?.includes('High miles'));
    expect(highMilesRow?.textContent).toContain('Best');
    // Route 2 has the lower (winning) high-miles value, so its cell should carry the marker.
    const cells = highMilesRow ? Array.from(highMilesRow.querySelectorAll('td')) : [];
    // Route 2 (second td, lower/winning high-miles value) should carry the marker; Route 1 should not.
    expect(cells[1]?.textContent).toContain('Best');
    expect(cells[0]?.textContent).not.toContain('Best');
  });
});
