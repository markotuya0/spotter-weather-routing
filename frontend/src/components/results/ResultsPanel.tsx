import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
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
  const [compareOpen, setCompareOpen] = useState(false);

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

  const isConfirmedSafe = result.recommendation.fallback_level === 'none';
  const recommendedRoute = isConfirmedSafe
    ? result.routes.find((route) => route.id === result.recommendation.route_id)
    : undefined;

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
            isConfirmedSafe={isConfirmedSafe}
            selected={selectedRouteId === route.id}
            onSelect={onSelectRoute}
            recommendedDurationSeconds={recommendedRoute?.summary.duration_seconds}
          />
        ))}
      </Stack>

      {result.routes.length > 1 && (
        <Stack spacing={1}>
          <Button
            size="small"
            variant="text"
            onClick={() => setCompareOpen((open) => !open)}
            aria-expanded={compareOpen}
            aria-controls="route-compare-table"
            endIcon={
              <ExpandMoreIcon
                fontSize="small"
                sx={{ transform: compareOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
              />
            }
            sx={{ alignSelf: 'flex-start' }}
          >
            {compareOpen ? 'Hide full comparison' : 'Compare all routes'}
          </Button>
          <Collapse in={compareOpen} unmountOnExit id="route-compare-table">
            <CompareTable routes={result.routes} />
          </Collapse>
        </Stack>
      )}
    </Stack>
  );
}
