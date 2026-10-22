import { useMemo } from 'react';
import type { WeatherSample } from '../api/types';

/** Memoised `weather_samples[id]` lookup (`04` §4) so repeated ids (shared road sections) don't re-render. */
export function useWeatherSample(
  samples: Record<string, WeatherSample> | undefined,
  id: string | null,
): WeatherSample | null {
  return useMemo(() => {
    if (!samples || !id) return null;
    return samples[id] ?? null;
  }, [samples, id]);
}
