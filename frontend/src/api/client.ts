import type { AnalysisResult, ApiErrorBody, ErrorCode, PlaceSuggestResponse, TripInput } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, string[]> | null;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string;

  constructor(body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.code = body.code;
    this.details = body.details;
    this.retryable = body.retryable;
    this.retryAfterSeconds = body.retry_after_seconds;
    this.requestId = body.request_id;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return new ApiError(body.error);
  } catch {
    return new ApiError({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
      details: null,
      retryable: true,
      retry_after_seconds: null,
      request_id: 'unknown',
    });
  }
}

export async function suggestPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestResponse> {
  const url = new URL(`${BASE_URL}/places/suggest`, window.location.origin);
  url.searchParams.set('q', query);
  const response = await fetch(url, { signal });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as PlaceSuggestResponse;
}

export async function analyzeTrip(input: TripInput, signal?: AbortSignal): Promise<AnalysisResult> {
  const response = await fetch(`${BASE_URL}/trips/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as AnalysisResult;
}
