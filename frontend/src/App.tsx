import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MapRegion } from './components/map/MapRegion';
import { TripForm } from './components/trip/TripForm';
import { ResultsPanel } from './components/results/ResultsPanel';
import { useAnalyzeTrip } from './hooks/useAnalyzeTrip';
import type { TripInput } from './api/types';

export default function App() {
  const { mutate, data, error, isPending, variables } = useAnalyzeTrip();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  function handleSubmit(input: TripInput) {
    setSelectedRouteId(null);
    mutate(input, {
      onSuccess: (result) => {
        setSelectedRouteId(result.recommendation.route_id ?? result.routes[0]?.id ?? null);
      },
    });
  }

  function handleRetry() {
    if (variables) handleSubmit(variables);
  }

  const recommendedRoute = data?.routes.find((route) => route.id === data.recommendation.route_id);
  const summaryChip = recommendedRoute
    ? `Route ${recommendedRoute.rank} recommended`
    : data
      ? 'No route confirmed safe'
      : undefined;

  return (
    <AppShell
      summaryChip={summaryChip}
      panel={
        <Stack spacing={3}>
          <TripForm onSubmit={handleSubmit} isSubmitting={isPending} />
          <Divider />
          <ResultsPanel
            result={data}
            isPending={isPending}
            error={error}
            onRetry={handleRetry}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
          />
        </Stack>
      }
      mapRegion={
        <MapRegion result={data} selectedRouteId={selectedRouteId} onSelectRoute={setSelectedRouteId} />
      }
    />
  );
}
