import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAnalysisResult } from '../../test/fixtures';
import type { AnalysisResult } from '../../api/types';

// MapView pulls in MapLibre; these tests only need the props MapRegion passes to it.
vi.mock('./MapView', () => ({
  MapView: (props: { forecastHour?: number }) => <div data-testid="map-view" data-hour={props.forecastHour ?? 0} />,
}));

import { MapRegion } from './MapRegion';

function resultWithHeatmap(startTime = '2026-10-22T20:00:00Z'): AnalysisResult {
  return buildAnalysisResult({
    heatmap: {
      start_time: startTime,
      hours: 49,
      legend: ['low', 'moderate', 'high', 'severe', 'no_travel'],
      encoding: { risk: '0-4 = low..no_travel, 255 = unknown' },
      points: [{ lat: 40, lng: -100, route_ids: ['r1'], risk: Array.from({ length: 49 }, (_, h) => h % 5) }],
    },
  });
}

describe('MapRegion forecast slider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('network should not be used')));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves the forecast hour from the keyboard and makes no network request', async () => {
    const { getByRole, findByTestId } = render(<MapRegion result={resultWithHeatmap()} />);
    const slider = getByRole('slider', { name: /forecast frame/i });
    const mapView = await findByTestId('map-view');
    expect(mapView).toHaveAttribute('data-hour', '0');

    slider.focus();
    fireEvent.change(slider, { target: { value: '24' } });
    fireEvent.change(slider, { target: { value: '48' } });

    await waitFor(() => expect(mapView).toHaveAttribute('data-hour', '48'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the chosen hour across re-renders of the same result', async () => {
    const result = resultWithHeatmap();
    const { getByRole, findByTestId, rerender } = render(<MapRegion result={result} />);
    await findByTestId('map-view');

    fireEvent.change(getByRole('slider'), { target: { value: '24' } });
    rerender(<MapRegion result={result} selectedRouteId={null} />);

    expect(await findByTestId('map-view')).toHaveAttribute('data-hour', '24');
  });

  it('resets to the departure frame when a new analysis result arrives', async () => {
    const { getByRole, findByTestId, rerender } = render(<MapRegion result={resultWithHeatmap()} />);
    const mapView = await findByTestId('map-view');

    fireEvent.change(getByRole('slider'), { target: { value: '30' } });
    expect(mapView).toHaveAttribute('data-hour', '30');

    rerender(<MapRegion result={resultWithHeatmap('2026-10-23T08:00:00Z')} />);

    await waitFor(() => expect(mapView).toHaveAttribute('data-hour', '0'));
    expect(getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });

  it('hides the slider when there is no heatmap to step through', () => {
    const { queryByRole } = render(<MapRegion result={buildAnalysisResult({ heatmap: undefined as never })} />);

    expect(queryByRole('slider', { name: /forecast frame/i })).not.toBeInTheDocument();
  });
});
