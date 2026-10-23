import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from '../../theme/theme';
import { TripForm } from './TripForm';

function renderForm(onSubmit = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <TripForm onSubmit={onSubmit} isSubmitting={false} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { onSubmit };
}

describe('TripForm example hint', () => {
  it('shows the example-route hint as plain text', () => {
    renderForm();
    expect(
      screen.getByText(
        'Looking for a route to explore? Try Denver, CO → Texarkana, TX to compare alternative paths.',
      ),
    ).toBeInTheDocument();
  });

  it('does not prefill any trip fields', () => {
    renderForm();
    expect(screen.getByLabelText(/Origin/)).toHaveValue('');
    expect(screen.getByLabelText(/Destination/)).toHaveValue('');
    expect(screen.getByLabelText(/Load weight/)).toHaveValue(null);
  });

  it('is not interactive (no link or button)', () => {
    renderForm();
    const hint = screen.getByText(/Looking for a route to explore/);
    expect(hint.closest('a, button')).toBeNull();
  });
});
