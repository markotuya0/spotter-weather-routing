import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import type { ErrorCode } from '../../api/types';

const MESSAGES: Record<ErrorCode, { title: string; body: (error: ApiError) => string }> = {
  VALIDATION_ERROR: {
    title: 'Check the trip details',
    body: () => 'Please correct the highlighted fields.',
  },
  NO_ROUTE: {
    title: 'No route found',
    body: () => 'No driving route found between these places.',
  },
  TOO_MANY_CHECKPOINTS: {
    title: 'Trip is too long for this checkpoint spacing',
    body: (error) =>
      `Choose a wider checkpoint spacing${
        error.details?.min_interval_miles ? ` (at least ${error.details.min_interval_miles} mi)` : ''
      }.`,
  },
  FORECAST_HORIZON: {
    title: 'Departure is too far ahead',
    body: () => 'This trip falls entirely outside the weather forecast window.',
  },
  RATE_LIMITED: {
    title: 'Too many requests',
    body: (error) =>
      error.retryAfterSeconds
        ? `Too many requests right now. Try again in ${error.retryAfterSeconds} s.`
        : 'Too many requests right now. Please try again shortly.',
  },
  WEATHER_UNAVAILABLE: {
    title: 'Weather forecast is unavailable',
    body: () => 'The weather provider is temporarily unavailable, so risk cannot be computed right now.',
  },
  ROUTING_UNAVAILABLE: {
    title: 'Routing service is unavailable',
    body: () => 'The routing provider is temporarily unavailable.',
  },
  UPSTREAM_TIMEOUT: {
    title: 'The request timed out',
    body: () => 'A provider took too long to respond.',
  },
  INTERNAL_ERROR: {
    title: 'Something went wrong',
    body: (error) => `An unexpected error occurred. Reference: ${error.requestId}`,
  },
};

export function ApiErrorAlert({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const config = MESSAGES[error.code] ?? MESSAGES.INTERNAL_ERROR;
  const [countdown, setCountdown] = useState(error.retryAfterSeconds ?? 0);

  useEffect(() => {
    setCountdown(error.retryAfterSeconds ?? 0);
    if (!error.retryAfterSeconds) return;
    const interval = setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [error]);

  return (
    <Alert severity="error" role="alert">
      <AlertTitle>{config.title}</AlertTitle>
      <Stack spacing={1}>
        <Typography variant="body2">{config.body(error)}</Typography>
        {error.code === 'VALIDATION_ERROR' && error.details && (
          <ul style={{ margin: 0 }}>
            {Object.entries(error.details).map(([field, messages]) => (
              <li key={field}>
                {field}: {messages.join(' ')}
              </li>
            ))}
          </ul>
        )}
        {error.retryable && (
          <Button
            size="small"
            variant="outlined"
            onClick={onRetry}
            disabled={countdown > 0}
          >
            {countdown > 0 ? `Retry in ${countdown}s` : 'Retry'}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
