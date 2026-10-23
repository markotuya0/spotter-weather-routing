import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoute } from '../../test/fixtures';
import { CompareTable } from './CompareTable';

/** Forces MUI's `useMediaQuery('(max-width:767.98px)')` to report mobile, matching the real narrow-viewport case. */
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  describe('on a narrow (mobile) viewport', () => {
    it('renders a collapsed accordion row per route, expanding its metrics on tap', () => {
      stubMobileViewport();
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

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText('High miles')).not.toBeInTheDocument();

      const [route1Row] = screen.getAllByRole('button');
      fireEvent.click(route1Row!);

      expect(route1Row).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('High miles')).toBeInTheDocument();

      fireEvent.click(route1Row!);
      expect(route1Row).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
