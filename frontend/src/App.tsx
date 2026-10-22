import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import { useMemo, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MapRegion } from './components/map/MapRegion';
import { TripForm } from './components/trip/TripForm';
import { TripSummary } from './components/trip/TripSummary';
import { isoToLocalDateTimeValue } from './components/trip/datetime';
import type { TripFormValues } from './components/trip/validation';
import { ResultsPanel } from './components/results/ResultsPanel';
import { useAnalyzeTrip } from './hooks/useAnalyzeTrip';
import type { TripInput } from './api/types';

function tripInputToFormValues(input: TripInput): TripFormValues {
  return {
    origin: { label: input.origin.label ?? '', lat: input.origin.lat, lng: input.origin.lng },
    destination: { label: input.destination.label ?? '', lat: input.destination.lat, lng: input.destination.lng },
    departureTime: isoToLocalDateTimeValue(input.departure_time),
    loadWeightLb: String(input.load_weight_lb),
    checkpointIntervalMiles: input.checkpoint_interval_miles,
  };
}

export default function App() {
  const { mutate, data, error, isPending, variables } = useAnalyzeTrip();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [formExpanded, setFormExpanded] = useState(true);

  function handleSubmit(input: TripInput) {
    setSelectedRouteId(null);
    mutate(input, {
      onSuccess: (result) => {
        setSelectedRouteId(result.recommendation.route_id ?? result.routes[0]?.id ?? null);
        setFormExpanded(false);
      },
    });
  }

  const editValues = useMemo(
    () => (data ? tripInputToFormValues(data.inputs) : undefined),
    [data],
  );

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
          {data && !formExpanded ? (
            <TripSummary inputs={data.inputs} onEdit={() => setFormExpanded(true)} />
          ) : (
            <TripForm
              key={data ? 'edit' : 'initial'}
              onSubmit={handleSubmit}
              isSubmitting={isPending}
              initialValues={editValues}
            />
          )}
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
