import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { AnalysisResult } from '../../api/types';
import { CheckpointDrawer } from './CheckpointDrawer';
import { ForecastSlider } from './ForecastSlider';
import { clampHour } from './forecastTime';

const MapView = lazy(() => import('./MapView').then((mod) => ({ default: mod.MapView })));

interface MapRegionProps {
  result?: AnalysisResult;
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
}

export function MapRegion({ result, selectedRouteId, onSelectRoute }: MapRegionProps) {
  const [selectedCheckpointIndex, setSelectedCheckpointIndex] = useState<number | null>(null);
  // Focus returns to whatever opened the checkpoint details (e.g. its table row) when they close,
  // so keyboard users are not dropped to <body>. Map-click selections have no such element.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectCheckpoint = useCallback((index: number | null) => {
    if (index !== null) {
      if (returnFocusRef.current === null) {
        const active = document.activeElement;
        returnFocusRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
      }
    } else {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target) window.setTimeout(() => target.isConnected && target.focus(), 0);
    }
    setSelectedCheckpointIndex(index);
  }, []);
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
  // The forecast frame belongs to one analysis result. A new result starts back at the departure frame
  // (derived, not stored, so a stale hour can never leak into a fresh result).
  const [hourState, setHourState] = useState<{ result?: AnalysisResult; hour: number }>({ result, hour: 0 });
  const forecastHour =
    hourState.result === result ? clampHour(hourState.hour, (result?.heatmap?.hours ?? 49) - 1) : 0;
  const setForecastHour = (hour: number) => setHourState({ result, hour: clampHour(hour) });

  const selectedRoute = useMemo(
    () => result?.routes.find((route) => route.id === selectedRouteId),
    [result, selectedRouteId],
  );
  // Memoised so moving the forecast slider does not re-render the checkpoint table (G4 frame budget).
  const drawer = useMemo(
    () =>
      selectedRoute && (
        <CheckpointDrawer
          checkpoints={selectedRoute.checkpoints}
          weatherSamples={result?.weather_samples ?? {}}
          selectedIndex={selectedCheckpointIndex}
          onSelectCheckpoint={selectCheckpoint}
        />
      ),
    [selectedRoute, result, selectedCheckpointIndex],
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
            onSelectCheckpoint={selectCheckpoint}
            weatherSamples={result?.weather_samples}
            loadWeightLb={result?.inputs.load_weight_lb}
            heatmap={result?.heatmap}
            forecastHour={forecastHour}
          />
        </Suspense>
      </Box>
      {result?.heatmap && (
        <ForecastSlider startTime={result.heatmap.start_time} hour={forecastHour} onChange={setForecastHour} />
      )}
      {drawer}
    </Box>
  );
}
