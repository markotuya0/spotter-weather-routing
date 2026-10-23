import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '../../theme/theme';
import { EMPTY_PLACE } from './validation';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import * as apiClient from '../../api/client';

function renderField(onChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <PlaceAutocomplete label="Origin" value={EMPTY_PLACE} onChange={onChange} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...utils, onChange };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlaceAutocomplete', () => {
  it('requests and shows only the suggestions matching the typed query, not stale/fixture options', async () => {
    const suggestSpy = vi.spyOn(apiClient, 'suggestPlaces').mockResolvedValue({
      results: [
        { id: 'tt:1', label: 'Texas, MI', lat: 42.2, lng: -85.7 },
        { id: 'tt:2', label: 'Texas City, TX', lat: 29.38, lng: -94.9 },
      ],
    });
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByLabelText('Origin'), 'texas');

    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('texas', expect.anything()));
    expect(await screen.findByText('Texas, MI')).toBeInTheDocument();
    expect(screen.getByText('Texas City, TX')).toBeInTheDocument();
    expect(screen.queryByText('Denver, CO')).not.toBeInTheDocument();
    expect(screen.queryByText('Omaha, NE')).not.toBeInTheDocument();
  });

  it('does not let a slower, stale response overwrite a newer query\'s results', async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof apiClient.suggestPlaces>>) => void;
    const suggestSpy = vi.spyOn(apiClient, 'suggestPlaces').mockImplementation((query: string) => {
      if (query === 'tex') {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ results: [{ id: 'tt:texas', label: 'Texas, MI', lat: 42.2, lng: -85.7 }] });
    });
    const user = userEvent.setup({ delay: null });
    renderField();

    const input = screen.getByLabelText('Origin');
    await user.type(input, 'tex');
    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('tex', expect.anything()));
    await user.type(input, 'as');
    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('texas', expect.anything()));
    expect(await screen.findByText('Texas, MI')).toBeInTheDocument();

    // The slow 'te' request finally resolves after 'texas' already rendered — it must not clobber it.
    resolveFirst({ results: [{ id: 'tt:stale', label: 'Stale Place', lat: 0, lng: 0 }] });
    await waitFor(() => expect(screen.queryByText('Stale Place')).not.toBeInTheDocument());
    expect(screen.getByText('Texas, MI')).toBeInTheDocument();
  });

  it('shows an honest error state instead of fixture/placeholder results when the provider fails', async () => {
    vi.spyOn(apiClient, 'suggestPlaces').mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderField();

    await user.type(screen.getByLabelText('Origin'), 'texas');

    expect(await screen.findByText(/couldn't search places/i)).toBeInTheDocument();
    expect(screen.queryByText('Denver, CO')).not.toBeInTheDocument();
  });

  it('shows no options at all (never a fixture fallback) for a query with zero real results', async () => {
    const suggestSpy = vi.spyOn(apiClient, 'suggestPlaces').mockResolvedValue({ results: [] });
    const user = userEvent.setup();
    renderField();

    const input = screen.getByLabelText('Origin');
    await user.type(input, 'zzqxnonexistent');
    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('zzqxnonexistent', expect.anything()));

    expect(screen.queryByText('Denver, CO')).not.toBeInTheDocument();
    expect(screen.queryByText('Omaha, NE')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('stores the selected suggestion\'s own coordinates, not stale/default ones', async () => {
    vi.spyOn(apiClient, 'suggestPlaces').mockResolvedValue({
      results: [{ id: 'tt:austin', label: 'Austin, TX', lat: 30.2672, lng: -97.7431 }],
    });
    const user = userEvent.setup();
    const { onChange } = renderField();

    await user.type(screen.getByLabelText('Origin'), 'austin');
    const option = await screen.findByText('Austin, TX');
    await user.click(option);

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ label: 'Austin, TX', lat: 30.2672, lng: -97.7431 }),
    );
  });

  it('keeps origin and destination fields independent', async () => {
    const suggestSpy = vi.spyOn(apiClient, 'suggestPlaces').mockImplementation((query: string) =>
      Promise.resolve({
        results: [{ id: `tt:${query}`, label: `${query} result`, lat: 1, lng: 2 }],
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(
      <ThemeProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <PlaceAutocomplete label="Origin" value={EMPTY_PLACE} onChange={vi.fn()} />
          <PlaceAutocomplete label="Destination" value={EMPTY_PLACE} onChange={vi.fn()} />
        </QueryClientProvider>
      </ThemeProvider>,
    );

    await user.type(screen.getByLabelText('Origin'), 'dallas');
    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('dallas', expect.anything()));
    await user.type(screen.getByLabelText('Destination'), 'austin');
    await waitFor(() => expect(suggestSpy).toHaveBeenCalledWith('austin', expect.anything()));

    expect(await screen.findByText('austin result')).toBeInTheDocument();
    expect(screen.getByLabelText('Origin')).toHaveValue('dallas');
  });
});
