import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { AnalysisResult } from '../../api/types';
import { ApiError } from '../../api/client';
import { ApiErrorAlert } from './ApiErrorAlert';
import { Recommendation } from './Recommendation';
import { RouteCard } from './RouteCard';
import { WarningList } from './WarningList';
import { CompareTable } from './CompareTable';

interface ResultsPanelProps {
  result: AnalysisResult | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
}

export function ResultsPanel({
  result,
  isPending,
  error,
  onRetry,
  selectedRouteId,
  onSelectRoute,
}: ResultsPanelProps) {
  if (isPending) {
    return (
      <Stack spacing={2} aria-live="polite" aria-busy="true">
        <Typography variant="body2" color="text.secondary">
          Analyzing trip…
        </Typography>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} variant="rounded" height={140} />
        ))}
      </Stack>
    );
  }

  if (error) {
    const apiError = error instanceof ApiError ? error : null;
    if (apiError) return <ApiErrorAlert error={apiError} onRetry={onRetry} />;
    return (
      <Stack role="alert">
        <Typography color="error">Something went wrong. Please try again.</Typography>
      </Stack>
    );
  }

  if (!result) {
    return (
      <Typography variant="body2" color="text.secondary">
        Enter a trip to compare routes.
      </Typography>
    );
  }

  return (
    <Stack spacing={2}>
      <WarningList warnings={result.warnings} />
      <Recommendation recommendation={result.recommendation} routes={result.routes} />

      <Stack component="ul" spacing={2} sx={{ p: 0, m: 0 }} aria-label="Route options">
        {result.routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            isTopPick={result.recommendation.route_id === route.id}
            isConfirmedSafe={result.recommendation.fallback_level === 'none'}
            selected={selectedRouteId === route.id}
            onSelect={onSelectRoute}
          />
        ))}
      </Stack>

      {result.routes.length > 1 && <CompareTable routes={result.routes} />}
    </Stack>
  );
}
