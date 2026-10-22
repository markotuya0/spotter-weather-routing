import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, analyzeTrip, suggestPlaces } from './client';
import type { TripInput } from './types';

const tripInput: TripInput = {
  origin: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  destination: { label: 'Omaha, NE', lat: 41.2565, lng: -95.9345 },
  departure_time: '2026-10-22T20:00:00Z',
  load_weight_lb: 38000,
  checkpoint_interval_miles: 25,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeTrip', () => {
  it('returns the parsed result on success', async () => {
    const payload = { request_id: 'abc' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })),
    );
    const result = await analyzeTrip(tripInput);
    expect(result).toEqual(payload);
  });

  it('throws an ApiError with the server envelope on failure', async () => {
    const errorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please correct the highlighted fields.',
        details: { load_weight_lb: ['Must be between 1 and 100000.'] },
        retryable: false,
        retry_after_seconds: null,
        request_id: 'req-1',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(errorBody), { status: 400 })),
    );

    await expect(analyzeTrip(tripInput)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      retryable: false,
    });
  });

  it('exposes retry_after_seconds for RATE_LIMITED', async () => {
    const errorBody = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        details: null,
        retryable: true,
        retry_after_seconds: 12,
        request_id: 'req-2',
      },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(errorBody), { status: 429 })),
    );

    try {
      await analyzeTrip(tripInput);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).retryAfterSeconds).toBe(12);
    }
  });
});

describe('suggestPlaces', () => {
  it('sends the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await suggestPlaces('Denver');

    const calledUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(calledUrl.searchParams.get('q')).toBe('Denver');
  });
});
