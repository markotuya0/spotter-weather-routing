import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import type { ComponentProps } from 'react';
import { theme } from '../../theme/theme';
import { buildRoute } from '../../test/fixtures';
import { RouteCard } from './RouteCard';

function renderCard(props: Partial<ComponentProps<typeof RouteCard>> = {}) {
  const route = props.route ?? buildRoute();
  return render(
    <ThemeProvider theme={theme}>
      <ul>
        <RouteCard
          route={route}
          isTopPick={false}
          isConfirmedSafe={true}
          selected={false}
          onSelect={vi.fn()}
          {...props}
        />
      </ul>
    </ThemeProvider>,
  );
}

describe('RouteCard', () => {
  it('shows the Recommended chip only for the confirmed-safe top pick', () => {
    renderCard({ isTopPick: true, isConfirmedSafe: true });
    expect(screen.getByText('Recommended')).toBeInTheDocument();
  });

  it('shows "Not confirmed safe" instead of Recommended for a fallback pick', () => {
    renderCard({ isTopPick: true, isConfirmedSafe: false });
    expect(screen.getByText('Not confirmed safe')).toBeInTheDocument();
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('shows no pick chip for a non-top route', () => {
    renderCard({ isTopPick: false });
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
    expect(screen.queryByText('Not confirmed safe')).not.toBeInTheDocument();
  });

  it('shows a plain-language blocked notice derived from the machine reason code', () => {
    renderCard({ route: buildRoute({ eligibility: { status: 'blocked', reason: 'no_travel_at_mile_142' } }) });
    expect(screen.getByText('No Travel near mile 142')).toBeInTheDocument();
    expect(screen.queryByText(/no_travel_at_mile/)).not.toBeInTheDocument();
  });

  it('renders severe/high mile summary and average risk', () => {
    renderCard();
    expect(screen.getByText(/Severe 0\.0 mi · High 40\.1 mi · Avg risk 0\.74/)).toBeInTheDocument();
  });

  it('calls onSelect when the header is clicked', async () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });
    screen.getByText('Route 1').click();
    expect(onSelect).toHaveBeenCalledWith('r1');
  });
});
