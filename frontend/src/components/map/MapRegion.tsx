import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { AnalysisResult } from '../../api/types';
import { CheckpointDrawer } from './CheckpointDrawer';

const MapView = lazy(() => import('./MapView').then((mod) => ({ default: mod.MapView })));

interface MapRegionProps {
  result?: AnalysisResult;
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
}

export function MapRegion({ result, selectedRouteId, onSelectRoute }: MapRegionProps) {
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState<number | null>(null);
  // Reset the checkpoint selection whenever the analysis result or the selected route changes
  // (adjusting state during render instead of an effect — https://react.dev/learn/you-might-not-need-an-effect).
  const [resetKey, setResetKey] = useState<[AnalysisResult | undefined, string | null | undefined]>([
    result,
    selectedRouteId,
  ]);
  if (resetKey[0] !== result || resetKey[1] !== selectedRouteId) {
    setResetKey([result, selectedRouteId]);
    setSelectedCheckpointIndex(null);
  }

  const selectedRoute = useMemo(
    () => result?.routes.find((route) => route.id === selectedRouteId),
    [result, selectedRouteId],
  );

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 280 }}>
        <Suspense
          fallback={
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                minHeight: 280,
              }}
            >
              <CircularProgress aria-label="Loading map" />
            </Box>
          }
        >
          <MapView
            routes={result?.routes}
            origin={result?.inputs.origin}
            destination={result?.inputs.destination}
            selectedRouteId={selectedRouteId}
            onSelectRoute={onSelectRoute}
            selectedCheckpointIndex={selectedCheckpointIndex}
            onSelectCheckpoint={setSelectedCheckpointIndex}
            weatherSamples={result?.weather_samples}
            loadWeightLb={result?.inputs.load_weight_lb}
          />
        </Suspense>
      </Box>
      {selectedRoute && (
        <CheckpointDrawer
          checkpoints={selectedRoute.checkpoints}
          weatherSamples={result?.weather_samples ?? {}}
          selectedIndex={selectedCheckpointIndex}
          onSelectCheckpoint={setSelectedCheckpointIndex}
        />
      )}
    </Box>
  );
}
