import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCheckpoint, buildRoute } from '../../test/fixtures';

interface HandlerEntry {
  layerId?: string;
  handler: (payload?: unknown) => void;
}

const { mapInstances, MapMock } = vi.hoisted(() => {
  class MapMock {
    static instances: MapMock[] = [];
    options: Record<string, unknown>;
    handlers: Record<string, HandlerEntry[]> = {};
    removed = false;
    sources: Record<string, { data: unknown; setData: (d: unknown) => void }> = {};
    layers: Array<{ id: string }> = [];
    fitBoundsCalls: Array<{ bounds: unknown; options: unknown }> = [];
    canvasStyle = { cursor: '' };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      MapMock.instances.push(this);
    }

    on(event: string, a: unknown, b?: unknown) {
      if (typeof a === 'string') {
        (this.handlers[event] ??= []).push({ layerId: a, handler: b as HandlerEntry['handler'] });
      } else {
        (this.handlers[event] ??= []).push({ handler: a as HandlerEntry['handler'] });
      }
    }

    off(event: string, handler: HandlerEntry['handler']) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((entry) => entry.handler !== handler);
    }

    addSource(id: string, def: { data: unknown }) {
      this.sources[id] = {
        data: def.data,
        setData: vi.fn((data: unknown) => {
          this.sources[id]!.data = data;
        }),
      };
    }

    getSource(id: string) {
      return this.sources[id];
    }

    addLayer(def: { id: string }) {
      this.layers.push(def);
    }

    getCanvas() {
      return { style: this.canvasStyle };
    }

    fitBounds(bounds: unknown, options: unknown) {
      this.fitBoundsCalls.push({ bounds, options });
    }

    project(_lngLat: [number, number]) {
      return { x: 100, y: 80 };
    }

    remove() {
      this.removed = true;
    }

    emit(event: string, layerId?: string, payload?: unknown) {
      for (const entry of this.handlers[event] ?? []) {
        if (layerId === undefined ? entry.layerId !== undefined : entry.layerId !== layerId) continue;
        entry.handler(payload);
      }
    }
  }
  return { mapInstances: MapMock.instances, MapMock };
});

vi.mock('maplibre-gl', () => ({
  Map: MapMock,
}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import { MapView } from './MapView';

afterEach(() => {
  mapInstances.length = 0;
  vi.clearAllMocks();
});

describe('MapView', () => {
  it('initializes a MapLibre map against the given style and shows a loading state first', async () => {
    const { getByLabelText, queryByLabelText } = render(<MapView styleUrl="https://example.test/style.json" />);

    expect(getByLabelText('Loading map')).toBeInTheDocument();
    expect(mapInstances).toHaveLength(1);
    const instance = mapInstances[0]!;
    expect(instance.options.style).toBe('https://example.test/style.json');

    instance.emit('load');

    await waitFor(() => expect(queryByLabelText('Loading map')).not.toBeInTheDocument());
  });

  it('shows an error fallback when the map emits an error', async () => {
    const { getByText } = render(<MapView />);

    mapInstances[0]!.emit('error');

    await waitFor(() => expect(getByText(/map tiles are unavailable/i)).toBeInTheDocument());
  });

  it('removes the map instance on unmount', () => {
    const { unmount } = render(<MapView />);
    const instance = mapInstances[0]!;

    unmount();

    expect(instance.removed).toBe(true);
  });

  it('defaults to the OpenFreeMap liberty style', () => {
    render(<MapView />);

    expect(mapInstances[0]!.options.style).toBe('https://tiles.openfreemap.org/styles/liberty');
  });

  it('loads route and endpoint data and fits bounds once routes arrive', async () => {
    const routeA = buildRoute({ id: 'r1', rank: 1, geometry: { encoding: 'polyline5', points: '', bbox: [-110, 38, -100, 42] } });
    const routeB = buildRoute({ id: 'r2', rank: 2, geometry: { encoding: 'polyline5', points: '', bbox: [-105, 35, -95, 40] } });
    const origin = { lat: 39.7, lng: -105 };
    const destination = { lat: 41.3, lng: -95.9 };

    render(
      <MapView
        routes={[routeA, routeB]}
        origin={origin}
        destination={destination}
        selectedRouteId="r1"
      />,
    );
    const instance = mapInstances[0]!;
    instance.emit('load');

    await waitFor(() => expect(instance.sources.routes!.setData).toHaveBeenCalled());

    const routesData = instance.sources.routes!.data as { features: Array<{ properties: { id: string; selected: boolean } }> };
    expect(routesData.features).toHaveLength(2);
    expect(routesData.features.find((f) => f.properties.id === 'r1')?.properties.selected).toBe(true);
    expect(routesData.features.find((f) => f.properties.id === 'r2')?.properties.selected).toBe(false);

    const endpointsData = instance.sources.endpoints!.data as { features: unknown[] };
    expect(endpointsData.features).toHaveLength(2);

    expect(instance.fitBoundsCalls).toHaveLength(1);
    expect(instance.fitBoundsCalls[0]!.bounds).toEqual([
      [-110, 35],
      [-95, 42],
    ]);
  });

  it('does not refit when only the selection changes', async () => {
    const routes = [buildRoute({ id: 'r1' }), buildRoute({ id: 'r2' })];

    const { rerender } = render(<MapView routes={routes} selectedRouteId="r1" />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.fitBoundsCalls).toHaveLength(1));

    rerender(<MapView routes={routes} selectedRouteId="r2" />);

    expect(instance.fitBoundsCalls).toHaveLength(1);
    const routesData = instance.sources.routes!.data as { features: Array<{ properties: { id: string; selected: boolean } }> };
    expect(routesData.features.find((f) => f.properties.id === 'r2')?.properties.selected).toBe(true);
  });

  it('selects a route when its line is clicked', async () => {
    const routes = [buildRoute({ id: 'r1' }), buildRoute({ id: 'r2' })];
    const onSelectRoute = vi.fn();

    render(<MapView routes={routes} selectedRouteId="r1" onSelectRoute={onSelectRoute} />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.sources.routes!.setData).toHaveBeenCalled());

    instance.emit('click', 'routes-unselected', { features: [{ properties: { id: 'r2' } }] });

    expect(onSelectRoute).toHaveBeenCalledWith('r2');
  });

  it('shows a Fit routes button once routes are loaded and refits on click', async () => {
    const routes = [buildRoute({ id: 'r1' })];
    const { getByRole } = render(<MapView routes={routes} />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.fitBoundsCalls).toHaveLength(1));

    fireEvent.click(getByRole('button', { name: 'Fit routes' }));

    expect(instance.fitBoundsCalls).toHaveLength(2);
  });

  it('loads the selected route risk segments and checkpoints into their sources', async () => {
    const checkpoint = buildCheckpoint({ index: 2 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });

    render(<MapView routes={[route]} selectedRouteId="r1" />);
    const instance = mapInstances[0]!;
    instance.emit('load');

    await waitFor(() => expect(instance.sources['checkpoints']!.setData).toHaveBeenCalled());

    const checkpointsData = instance.sources['checkpoints']!.data as { features: Array<{ properties: { index: number } }> };
    expect(checkpointsData.features).toHaveLength(1);
    expect(checkpointsData.features[0]!.properties.index).toBe(2);

    const riskData = instance.sources['risk-segments']!.data as { features: unknown[] };
    expect(riskData.features).toHaveLength(route.risk_segments.length);
  });

  it('selects a checkpoint when its marker is clicked and opens an overlay with its details', async () => {
    const checkpoint = buildCheckpoint({ index: 1, distance_miles: 75 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });
    const onSelectCheckpoint = vi.fn();

    const { getByText } = render(
      <MapView
        routes={[route]}
        selectedRouteId="r1"
        selectedCheckpointIndex={1}
        onSelectCheckpoint={onSelectCheckpoint}
        loadWeightLb={38000}
      />,
    );
    const instance = mapInstances[0]!;
    instance.emit('load');

    await waitFor(() => expect(getByText(/Mile 75\.0/)).toBeInTheDocument());

    instance.emit('click', 'checkpoints-major', { features: [{ properties: { index: 3 } }] });
    expect(onSelectCheckpoint).toHaveBeenCalledWith(3);
  });
});
