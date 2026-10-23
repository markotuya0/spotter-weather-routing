import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildCheckpoint } from '../../test/fixtures';
import { CheckpointTable } from './CheckpointTable';

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

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

const weatherSamples = {
  'ws-1': {
    wind_mph: 38.4,
    rain_in_per_hr: 0,
    snow_in_per_hr: 0,
    wind_time_used: ['2026-10-22T23:00:00Z', '2026-10-23T00:00:00Z'] as [string, string],
    precip_bucket_end: '2026-10-23T00:00:00Z',
  },
};

describe('CheckpointTable', () => {
  it('shows an empty-state message when there are no checkpoints', () => {
    render(<CheckpointTable checkpoints={[]} weatherSamples={{}} selectedIndex={null} onSelectCheckpoint={vi.fn()} />);
    expect(screen.getByText(/no checkpoints/i)).toBeInTheDocument();
  });

  it('renders one row per checkpoint with its weather values and selects on click', () => {
    const onSelectCheckpoint = vi.fn();
    const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1, weather_sample_id: null })];

    render(
      <CheckpointTable
        checkpoints={checkpoints}
        weatherSamples={weatherSamples}
        selectedIndex={0}
        onSelectCheckpoint={onSelectCheckpoint}
      />,
    );

    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2
    expect(screen.getByText(/38\.4 mph/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('row')[2]!);
    expect(onSelectCheckpoint).toHaveBeenCalledWith(1);
  });

  it('scrolls the matching row into view when the selected checkpoint changes (e.g. picked on the map)', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1 })];

    const { rerender } = render(
      <CheckpointTable checkpoints={checkpoints} weatherSamples={weatherSamples} selectedIndex={null} onSelectCheckpoint={vi.fn()} />,
    );
    scrollIntoView.mockClear();

    rerender(
      <CheckpointTable checkpoints={checkpoints} weatherSamples={weatherSamples} selectedIndex={1} onSelectCheckpoint={vi.fn()} />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  });

  describe('on a narrow (mobile) viewport', () => {
    it('renders a select-only row per checkpoint with no inline weather detail', () => {
      stubMobileViewport();
      const onSelectCheckpoint = vi.fn();
      const checkpoints = [buildCheckpoint({ index: 0 }), buildCheckpoint({ index: 1, weather_sample_id: null })];

      render(
        <CheckpointTable
          checkpoints={checkpoints}
          weatherSamples={weatherSamples}
          selectedIndex={null}
          onSelectCheckpoint={onSelectCheckpoint}
        />,
      );

      // No table and no inline weather values on mobile — detail lives in the drawer's own
      // mutually-exclusive detail view, not duplicated inline here.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByText(/38\.4 mph/)).not.toBeInTheDocument();

      const [firstRow] = screen.getAllByRole('button');
      fireEvent.click(firstRow!);

      expect(onSelectCheckpoint).toHaveBeenCalledWith(0);
      expect(screen.queryByText(/38\.4 mph/)).not.toBeInTheDocument();
    });

    it('highlights the selected row without a second tap changing the selection', () => {
      stubMobileViewport();
      const onSelectCheckpoint = vi.fn();
      const checkpoints = [buildCheckpoint({ index: 0 })];

      render(
        <CheckpointTable
          checkpoints={checkpoints}
          weatherSamples={weatherSamples}
          selectedIndex={0}
          onSelectCheckpoint={onSelectCheckpoint}
        />,
      );

      const row = screen.getByRole('button');
      expect(row.className).toMatch(/Mui-selected/);

      fireEvent.click(row);
      expect(onSelectCheckpoint).toHaveBeenCalledTimes(1);
      expect(onSelectCheckpoint).toHaveBeenLastCalledWith(0);
    });
  });
});
