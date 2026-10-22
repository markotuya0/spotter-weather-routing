import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme/theme';
import { TripSummary } from './TripSummary';
import type { TripInput } from '../../api/types';

const INPUTS: TripInput = {
  origin: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  destination: { label: 'Omaha, NE', lat: 41.2565, lng: -95.9345 },
  departure_time: '2026-10-22T20:00:00Z',
  load_weight_lb: 38000,
  checkpoint_interval_miles: 25,
};

describe('TripSummary', () => {
  it('shows origin, destination, load weight and checkpoint spacing', () => {
    render(
      <ThemeProvider theme={theme}>
        <TripSummary inputs={INPUTS} onEdit={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/Denver, CO/)).toBeInTheDocument();
    expect(screen.getByText(/Omaha, NE/)).toBeInTheDocument();
    expect(screen.getByText(/38,000 lb load/)).toBeInTheDocument();
    expect(screen.getByText(/every 25 mi/)).toBeInTheDocument();
  });

  it('calls onEdit when the Edit trip button is activated', () => {
    const onEdit = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <TripSummary inputs={INPUTS} onEdit={onEdit} />
      </ThemeProvider>,
    );
    screen.getByRole('button', { name: /edit trip/i }).click();
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
