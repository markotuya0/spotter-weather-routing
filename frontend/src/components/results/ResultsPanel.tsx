import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../../api/types';
import { ApiError } from '../../api/client';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
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
  const topRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const prefersReducedMotion = usePrefersReducedMotion();

  // Freshly arrived results bring the recommendation into view (mobile stacks the map below this
  // panel, so without this the user can be left looking at a blank/loading area after submitting).
  useEffect(() => {
    if (result) topRef.current?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [result, prefersReducedMotion]);

  // A route picked on the map scrolls its card into view; a card clicked directly is already
  // visible, so `nearest` is a no-op there instead of an unwanted jump.
  useEffect(() => {
    if (selectedRouteId) {
      cardRefs.current[selectedRouteId]?.scrollIntoView?.({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [selectedRouteId, prefersReducedMotion]);

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
      <Box ref={topRef} />
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
            rootRef={(el) => {
              cardRefs.current[route.id] = el;
            }}
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
