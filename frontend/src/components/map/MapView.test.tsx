import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Heatmap } from '../../api/types';
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
    flyToCalls: Array<Record<string, unknown>> = [];
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

    layoutCalls: Array<{ id: string; name: string; value: unknown }> = [];

    setLayoutProperty(id: string, name: string, value: unknown) {
      this.layoutCalls.push({ id, name, value });
    }

    getCanvas() {
      return { style: this.canvasStyle };
    }

    fitBounds(bounds: unknown, options: unknown) {
      this.fitBoundsCalls.push({ bounds, options });
    }

    flyTo(options: Record<string, unknown>) {
      this.flyToCalls.push(options);
    }

    getZoom() {
      return 6;
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
  setWorkerUrl: vi.fn(),
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: '/worker.mjs' }));
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

  it('reframes to just the newly selected route when the selection changes from a card (not a fresh route list)', async () => {
    const routeA = buildRoute({ id: 'r1', geometry: { encoding: 'polyline5', points: '', bbox: [-110, 38, -100, 42] } });
    const routeB = buildRoute({ id: 'r2', geometry: { encoding: 'polyline5', points: '', bbox: [-105, 35, -95, 40] } });
    const routes = [routeA, routeB];

    const { rerender } = render(<MapView routes={routes} selectedRouteId="r1" />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.fitBoundsCalls).toHaveLength(1));

    rerender(<MapView routes={routes} selectedRouteId="r2" />);

    expect(instance.fitBoundsCalls).toHaveLength(2);
    expect(instance.fitBoundsCalls[1]!.bounds).toEqual([
      [-105, 35],
      [-95, 40],
    ]);
    const routesData = instance.sources.routes!.data as { features: Array<{ properties: { id: string; selected: boolean } }> };
    expect(routesData.features.find((f) => f.properties.id === 'r2')?.properties.selected).toBe(true);
  });

  it('does not re-fit the map when a route selection came from clicking the map itself', async () => {
    const routeA = buildRoute({ id: 'r1' });
    const routeB = buildRoute({ id: 'r2' });
    const routes = [routeA, routeB];
    const onSelectRoute = vi.fn();

    const { rerender } = render(<MapView routes={routes} selectedRouteId="r1" onSelectRoute={onSelectRoute} />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.fitBoundsCalls).toHaveLength(1));

    instance.emit('click', 'routes-unselected', { features: [{ properties: { id: 'r2' } }] });
    expect(onSelectRoute).toHaveBeenCalledWith('r2');
    rerender(<MapView routes={routes} selectedRouteId="r2" onSelectRoute={onSelectRoute} />);

    expect(instance.fitBoundsCalls).toHaveLength(1);
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

  it('flies to a checkpoint picked from outside the map (e.g. the sidebar table)', async () => {
    const checkpoint = buildCheckpoint({ index: 4, lat: 41.1, lng: -99.4 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });

    const { rerender } = render(<MapView routes={[route]} selectedRouteId="r1" selectedCheckpointIndex={null} />);
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.sources['checkpoints']!.setData).toHaveBeenCalled());

    rerender(<MapView routes={[route]} selectedRouteId="r1" selectedCheckpointIndex={4} />);

    expect(instance.flyToCalls).toHaveLength(1);
    expect(instance.flyToCalls[0]!.center).toEqual([-99.4, 41.1]);
  });

  it('does not fly the map when the checkpoint selection came from clicking its own marker', async () => {
    const checkpoint = buildCheckpoint({ index: 4, lat: 41.1, lng: -99.4 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });
    const onSelectCheckpoint = vi.fn();

    const { rerender } = render(
      <MapView
        routes={[route]}
        selectedRouteId="r1"
        selectedCheckpointIndex={null}
        onSelectCheckpoint={onSelectCheckpoint}
      />,
    );
    const instance = mapInstances[0]!;
    instance.emit('load');
    await waitFor(() => expect(instance.sources['checkpoints']!.setData).toHaveBeenCalled());

    instance.emit('click', 'checkpoints-major', { features: [{ properties: { index: 4 } }] });
    expect(onSelectCheckpoint).toHaveBeenCalledWith(4);
    rerender(
      <MapView
        routes={[route]}
        selectedRouteId="r1"
        selectedCheckpointIndex={4}
        onSelectCheckpoint={onSelectCheckpoint}
      />,
    );

    expect(instance.flyToCalls).toHaveLength(0);
  });

  it('closes the checkpoint popup on Escape', async () => {
    const checkpoint = buildCheckpoint({ index: 1 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });
    const onSelectCheckpoint = vi.fn();

    const { getByRole } = render(
      <MapView routes={[route]} selectedRouteId="r1" selectedCheckpointIndex={1} onSelectCheckpoint={onSelectCheckpoint} />,
    );
    mapInstances[0]!.emit('load');

    await waitFor(() => expect(getByRole('dialog', { name: 'Checkpoint details' })).toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onSelectCheckpoint).toHaveBeenCalledWith(null);
  });

  it('keeps the checkpoint popup inside the map viewport near the top edge', async () => {
    const checkpoint = buildCheckpoint({ index: 1 });
    const route = buildRoute({ id: 'r1', checkpoints: [checkpoint] });

    const { getByRole, container } = render(
      <MapView routes={[route]} selectedRouteId="r1" selectedCheckpointIndex={1} />,
    );
    const instance = mapInstances[0]!;
    instance.emit('load');
    vi.spyOn(instance, 'project').mockReturnValue({ x: 100, y: 5 });

    const mapBox = container.querySelector('[data-testid="maplibre-container"]')!;
    vi.spyOn(mapBox, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(mapBox, 'clientHeight', 'get').mockReturnValue(300);
    instance.emit('move');

    const dialog = await waitFor(() => getByRole('dialog', { name: 'Checkpoint details' }));
    const top = Number.parseFloat(getComputedStyle(dialog).top);
    expect(top).toBeGreaterThanOrEqual(56);
  });

  describe('conditions heatmap', () => {
    const heatmap: Heatmap = {
      start_time: '2026-10-22T20:00:00Z',
      hours: 49,
      legend: ['low', 'moderate', 'high', 'severe', 'no_travel'],
      encoding: { risk: '0-4 = low..no_travel, 255 = unknown' },
      points: [
        { lat: 40.1, lng: -103.2, route_ids: ['r1'], risk: [2, 0] },
        { lat: 41.5, lng: -100.0, route_ids: ['r1'], risk: [255, 3] },
      ],
    };

    it('draws hour 0 below the route lines and checkpoints', async () => {
      render(<MapView routes={[buildRoute({ id: 'r1' })]} heatmap={heatmap} />);
      const instance = mapInstances[0]!;
      instance.emit('load');

      const layerIds = instance.layers.map((layer) => layer.id);
      expect(layerIds.indexOf('heatmap-blobs')).toBeLessThan(layerIds.indexOf('routes-unselected'));
      expect(layerIds.indexOf('heatmap-unknown')).toBeLessThan(layerIds.indexOf('checkpoints-major'));

      await waitFor(() => expect(instance.sources.heatmap!.setData).toHaveBeenCalled());
      const data = instance.sources.heatmap!.data as { features: Array<{ geometry: { coordinates: number[] }; properties: { level: string } }> };
      expect(data.features.map((f) => f.geometry.coordinates)).toEqual([
        [-103.2, 40.1],
        [-100.0, 41.5],
      ]);
      expect(data.features.map((f) => f.properties.level)).toEqual(['high', 'unknown']);
    });

    it('hides and restores heatmap layers from the toggle without refetching anything', async () => {
      const { getByRole } = render(<MapView heatmap={heatmap} />);
      const instance = mapInstances[0]!;
      instance.emit('load');

      const toggle = await waitFor(() => getByRole('button', { name: /conditions heatmap: on/i }));
      expect(toggle).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(toggle);

      expect(getByRole('button', { name: /conditions heatmap: off/i })).toHaveAttribute('aria-pressed', 'false');
      expect(instance.layoutCalls.filter((c) => c.value === 'none').map((c) => c.id)).toEqual([
        'heatmap-blobs',
        'heatmap-unknown',
      ]);

      fireEvent.click(getByRole('button', { name: /conditions heatmap: off/i }));

      expect(instance.layoutCalls.slice(-2).map((c) => c.value)).toEqual(['visible', 'visible']);
    });

    it('shows the legend with unknown labelled as not Low, and hides it with the layer', async () => {
      const { getByRole, queryByRole, getByText } = render(<MapView heatmap={heatmap} loadWeightLb={38000} />);
      const instance = mapInstances[0]!;
      instance.emit('load');

      const legend = await waitFor(() => getByRole('region', { name: /conditions heatmap legend/i }));
      expect(legend).toHaveTextContent('Unknown is not Low: no forecast there.');
      expect(legend).toHaveTextContent('38,000 lb load');
      for (const label of ['Low', 'Moderate', 'High', 'Severe', 'No travel', 'Unknown']) {
        expect(legend).toHaveTextContent(label);
      }

      const detailsToggle = getByRole('button', { name: /about unknown data/i });
      expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(detailsToggle);
      expect(getByRole('button', { name: /hide details/i })).toHaveAttribute('aria-expanded', 'true');
      expect(legend).toHaveTextContent('not shown as Low. No blob: no forecast point there, so it is not confirmed safe.');

      fireEvent.click(getByRole('button', { name: /conditions heatmap: on/i }));
      expect(queryByRole('region', { name: /conditions heatmap legend/i })).not.toBeInTheDocument();
      expect(getByText(/conditions heatmap: off/i)).toBeInTheDocument();
    });

    it('draws the selected forecast frame and labels the legend with that frame time', async () => {
      const risk = Array.from({ length: 49 }, () => 255);
      risk[0] = 2;
      risk[24] = 0;
      const { getByRole, rerender } = render(
        <MapView heatmap={{ ...heatmap, points: [{ lat: 40, lng: -100, route_ids: ['r1'], risk }] }} forecastHour={0} />,
      );
      const instance = mapInstances[0]!;
      instance.emit('load');
      const legend = await waitFor(() => getByRole('region', { name: /conditions heatmap legend/i }));
      expect(legend).toHaveTextContent('(departure)');

      rerender(
        <MapView heatmap={{ ...heatmap, points: [{ lat: 40, lng: -100, route_ids: ['r1'], risk }] }} forecastHour={24} />,
      );

      const data = instance.sources.heatmap!.data as { features: Array<{ properties: { level: string } }> };
      expect(data.features[0]!.properties.level).toBe('low');
      expect(legend).toHaveTextContent(/· \+24 h/);
      expect(legend).not.toHaveTextContent('(departure)');
    });

    it('explains an empty corridor instead of drawing nothing silently', async () => {
      const { getByRole } = render(<MapView heatmap={{ ...heatmap, points: [] }} />);
      mapInstances[0]!.emit('load');

      const legend = await waitFor(() => getByRole('region', { name: /conditions heatmap legend/i }));
      expect(legend).toHaveTextContent('No forecast points for this corridor.');
    });

    it('does not render the heatmap controls when the analysis has no heatmap', async () => {
      const { queryByRole } = render(<MapView routes={[buildRoute({ id: 'r1' })]} />);
      mapInstances[0]!.emit('load');

      await waitFor(() => expect(mapInstances[0]!.sources.routes!.setData).toHaveBeenCalled());
      expect(queryByRole('button', { name: /conditions heatmap/i })).not.toBeInTheDocument();
      expect(queryByRole('region', { name: /conditions heatmap legend/i })).not.toBeInTheDocument();
    });
  });
});
