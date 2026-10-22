import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildCheckpoint } from '../../test/fixtures';
import { CheckpointTable } from './CheckpointTable';

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
    expect(screen.getByText('38.4 mph')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('row')[2]!);
    expect(onSelectCheckpoint).toHaveBeenCalledWith(1);
  });
});
