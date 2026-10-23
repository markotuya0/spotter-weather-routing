import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
// MapLibre resolves its worker relative to the bundle, but Vite never emits that file into dist, so
// production requests fall back to index.html and fail. Importing the worker as an asset makes Vite
// emit it and gives MapLibre the real URL (works identically in dev and production).
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Heatmap, LatLng, Route, WeatherSample } from '../../api/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { tokens } from '../../theme/theme';
import { RISK_STYLES } from '../../theme/riskColors';
import { CheckpointOverlay } from './CheckpointOverlay';
import { buildCheckpointFeatureCollection } from './checkpointGeoJson';
import { HeatmapLegend } from './HeatmapLegend';
import { buildHeatmapFeatureCollection } from './heatmapGeoJson';
import { buildRiskSegmentFeatureCollection } from './riskSegmentGeoJson';
import {
  buildEndpointFeatureCollection,
  buildRouteFeatureCollection,
  unionBbox,
  type Bbox,
} from './routeGeoJson';

setWorkerUrl(maplibreWorkerUrl);

export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const ROUTES_SOURCE_ID = 'routes';
const ENDPOINTS_SOURCE_ID = 'endpoints';
const RISK_SEGMENTS_SOURCE_ID = 'risk-segments';
const CHECKPOINTS_SOURCE_ID = 'checkpoints';
const HEATMAP_SOURCE_ID = 'heatmap';
const HEATMAP_LAYER_IDS = ['heatmap-blobs', 'heatmap-unknown'];
const ROUTE_CLICK_LAYERS = ['routes-unselected', 'route-selected-casing', 'route-risk-segments', 'route-labels'];
const CHECKPOINT_CLICK_LAYERS = ['checkpoints-minor', 'checkpoints-major'];

const RISK_COLOR_MATCH = [
  'match',
  ['get', 'level'],
  'low',
  RISK_STYLES.low.color,
  'moderate',
  RISK_STYLES.moderate.color,
  'high',
  RISK_STYLES.high.color,
  'severe',
  RISK_STYLES.severe.color,
  'no_travel',
  RISK_STYLES.no_travel.color,
  RISK_STYLES.unknown.color,
] as const;

const RISK_GLYPH_MATCH = [
  'match',
  ['get', 'level'],
  'low',
  RISK_STYLES.low.glyph,
  'moderate',
  RISK_STYLES.moderate.glyph,
  'high',
  RISK_STYLES.high.glyph,
  'severe',
  RISK_STYLES.severe.glyph,
  'no_travel',
  RISK_STYLES.no_travel.glyph,
  RISK_STYLES.unknown.glyph,
] as const;

interface MapViewProps {
  styleUrl?: string;
  routes?: Route[];
  origin?: LatLng;
  destination?: LatLng;
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string) => void;
  selectedCheckpointIndex?: number | null;
  onSelectCheckpoint?: (index: number | null) => void;
  weatherSamples?: Record<string, WeatherSample>;
  loadWeightLb?: number;
  heatmap?: Heatmap;
  /** Forecast frame (hours after departure) to draw from `heatmap.points[].risk`. */
  forecastHour?: number;
}

type MapStatus = 'loading' | 'ready' | 'error';

export function MapView({
  styleUrl = OPENFREEMAP_LIBERTY_STYLE,
  routes,
  origin,
  destination,
  selectedRouteId = null,
  onSelectRoute,
  selectedCheckpointIndex = null,
  onSelectCheckpoint,
  weatherSamples,
  loadWeightLb = 0,
  heatmap,
  forecastHour = 0,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onSelectCheckpointRef = useRef(onSelectCheckpoint);
  const lastFittedRoutesRef = useRef<Route[] | undefined>(undefined);
  // Set right before a map click calls back up, so the "selection changed" effects below can tell a
  // click on the map itself (already in view — no reason to re-animate) from a card/table selection.
  const lastRouteClickRef = useRef<string | null>(null);
  const lastCheckpointClickRef = useRef<number | null>(null);
  const prevRouteSelectionRef = useRef<{ routes?: Route[]; routeId: string | null }>({
    routes: undefined,
    routeId: null,
  });
  const prevCheckpointSelectionRef = useRef<{ routeId: string | null; index: number | null }>({
    routeId: null,
    index: null,
  });
  const [status, setStatus] = useState<MapStatus>('loading');
  const [projectedPoint, setProjectedPoint] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(true);
  const isMobile = useMediaQuery('(max-width:767.98px)');
  const prefersReducedMotion = usePrefersReducedMotion();

  const selectedRoute = useMemo(
    () => routes?.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const selectedCheckpoint = useMemo(
    () => selectedRoute?.checkpoints.find((checkpoint) => checkpoint.index === selectedCheckpointIndex) ?? null,
    [selectedRoute, selectedCheckpointIndex],
  );
  const weatherSample = useMemo(() => {
    const id = selectedCheckpoint?.weather_sample_id;
    return id ? weatherSamples?.[id] ?? null : null;
  }, [selectedCheckpoint, weatherSamples]);

  useEffect(() => {
    onSelectRouteRef.current = onSelectRoute;
  }, [onSelectRoute]);

  useEffect(() => {
    onSelectCheckpointRef.current = onSelectCheckpoint;
  }, [onSelectCheckpoint]);

  useEffect(() => {
    if (!containerRef.current) return;

    setStatus('loading');
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: [-98.5, 39.8],
      zoom: 3.5,
      attributionControl: {},
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;

    function handleLoad() {
      map.addSource(ROUTES_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource(ENDPOINTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource(RISK_SEGMENTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource(CHECKPOINTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource(HEATMAP_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Heatmap sits beneath routes and checkpoints (`06` §5). Known levels are soft blobs at 55%
      // opacity; unknown points get a '?' glyph instead of a colour, so missing data never looks Low.
      map.addLayer({
        id: 'heatmap-blobs',
        type: 'circle',
        source: HEATMAP_SOURCE_ID,
        filter: ['!=', ['get', 'level'], 'unknown'],
        paint: {
          'circle-color': RISK_COLOR_MATCH as unknown as string,
          // Radius doubles per zoom level (exponential base 2). At zoom 6 it is ~20 px, about 60% of the
          // spacing between ~25 mi samples, so each blob stays close to the point it represents.
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 4, 5, 11, 640],
          'circle-blur': 0.9,
          'circle-opacity': 0.55,
        },
      });
      map.addLayer({
        id: 'heatmap-unknown',
        type: 'symbol',
        source: HEATMAP_SOURCE_ID,
        filter: ['==', ['get', 'level'], 'unknown'],
        minzoom: 6,
        layout: {
          'text-field': RISK_STYLES.unknown.glyph,
          'text-size': 13,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': RISK_STYLES.unknown.color,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });

      map.addLayer({
        id: 'routes-unselected',
        type: 'line',
        source: ROUTES_SOURCE_ID,
        filter: ['==', ['get', 'selected'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': tokens.muted, 'line-width': 3 },
      });
      map.addLayer({
        id: 'route-selected-casing',
        type: 'line',
        source: ROUTES_SOURCE_ID,
        filter: ['==', ['get', 'selected'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 8 },
      });
      map.addLayer({
        id: 'route-risk-segments',
        type: 'line',
        source: RISK_SEGMENTS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paint: { 'line-color': RISK_COLOR_MATCH as any, 'line-width': 6 },
      });
      map.addLayer({
        id: 'route-labels',
        type: 'symbol',
        source: ROUTES_SOURCE_ID,
        minzoom: 5,
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': tokens.ink,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'endpoints-circle',
        type: 'circle',
        source: ENDPOINTS_SOURCE_ID,
        paint: {
          'circle-radius': 9,
          'circle-color': ['match', ['get', 'role'], 'origin', tokens.brand, '#B23A48'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      });
      map.addLayer({
        id: 'endpoints-label',
        type: 'symbol',
        source: ENDPOINTS_SOURCE_ID,
        layout: { 'text-field': ['get', 'label'], 'text-size': 11 },
        paint: { 'text-color': '#FFFFFF' },
      });

      // Declutter (`06` §5): below zoom 7 only non-low checkpoints show; at/above, everything does.
      map.addLayer({
        id: 'checkpoints-minor',
        type: 'symbol',
        source: CHECKPOINTS_SOURCE_ID,
        filter: ['==', ['get', 'level'], 'low'],
        minzoom: 7,
        layout: {
          'text-field': RISK_GLYPH_MATCH as unknown as string,
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 12, 12, 18],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': RISK_COLOR_MATCH as unknown as string,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });
      map.addLayer({
        id: 'checkpoints-major',
        type: 'symbol',
        source: CHECKPOINTS_SOURCE_ID,
        filter: ['!=', ['get', 'level'], 'low'],
        layout: {
          'text-field': RISK_GLYPH_MATCH as unknown as string,
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 14, 12, 20],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': RISK_COLOR_MATCH as unknown as string,
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      });

      for (const layerId of ROUTE_CLICK_LAYERS) {
        map.on('click', layerId, (event: MapLayerMouseEvent) => {
          const routeId = event.features?.[0]?.properties?.id as string | undefined;
          if (routeId) {
            lastRouteClickRef.current = routeId;
            onSelectRouteRef.current?.(routeId);
          }
        });
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      for (const layerId of CHECKPOINT_CLICK_LAYERS) {
        map.on('click', layerId, (event: MapLayerMouseEvent) => {
          const index = event.features?.[0]?.properties?.index as number | undefined;
          if (index !== undefined) {
            lastCheckpointClickRef.current = index;
            onSelectCheckpointRef.current?.(index);
          }
        });
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      setStatus('ready');
    }
    function handleError() {
      setStatus('error');
    }

    map.on('load', handleLoad);
    map.on('error', handleError);

    return () => {
      map.off('load', handleLoad);
      map.off('error', handleError);
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  const fitToRoutes = useCallback((targetRoutes: Route[]) => {
    const map = mapRef.current;
    const bbox: Bbox | null = unionBbox(targetRoutes);
    if (!map || !bbox) return;
    const [west, south, east, north] = bbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 48, duration: prefersReducedMotion ? 0 : 500 },
    );
  }, [prefersReducedMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const source = map.getSource(ROUTES_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(buildRouteFeatureCollection(routes ?? [], selectedRouteId));

    if (routes && routes.length > 0 && routes !== lastFittedRoutesRef.current) {
      lastFittedRoutesRef.current = routes;
      fitToRoutes(routes);
    }
  }, [status, routes, selectedRouteId, fitToRoutes]);

  useEffect(() => {
    const map = mapRef.current;
    const prev = prevRouteSelectionRef.current;
    const sameRouteList = prev.routes === routes;
    prevRouteSelectionRef.current = { routes, routeId: selectedRouteId };
    if (status !== 'ready' || !map) return;
    // Skip the very first time a route list/selection shows up (handled by the fit-all-routes effect
    // above) and skip when the map's own click just produced this selection (it is already in view).
    if (!sameRouteList || prev.routeId === selectedRouteId) return;
    if (lastRouteClickRef.current === selectedRouteId) {
      lastRouteClickRef.current = null;
      return;
    }
    if (!selectedRoute) return;
    const [west, south, east, north] = selectedRoute.geometry.bbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 64, duration: prefersReducedMotion ? 0 : 500 },
    );
  }, [status, routes, selectedRouteId, selectedRoute, prefersReducedMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const source = map.getSource(ENDPOINTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(
      origin && destination
        ? buildEndpointFeatureCollection(origin, destination)
        : { type: 'FeatureCollection', features: [] },
    );
  }, [status, origin, destination]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const source = map.getSource(HEATMAP_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(buildHeatmapFeatureCollection(heatmap, forecastHour));
  }, [status, heatmap, forecastHour]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const visibility = heatmapVisible ? 'visible' : 'none';
    for (const layerId of HEATMAP_LAYER_IDS) {
      map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }, [status, heatmapVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const riskSource = map.getSource(RISK_SEGMENTS_SOURCE_ID) as GeoJSONSource | undefined;
    const checkpointsSource = map.getSource(CHECKPOINTS_SOURCE_ID) as GeoJSONSource | undefined;
    riskSource?.setData(buildRiskSegmentFeatureCollection(selectedRoute));
    checkpointsSource?.setData(
      buildCheckpointFeatureCollection(selectedRoute?.checkpoints ?? [], selectedCheckpointIndex),
    );
  }, [status, selectedRoute, selectedCheckpointIndex]);

  useEffect(() => {
    const map = mapRef.current;
    const prev = prevCheckpointSelectionRef.current;
    const sameRoute = prev.routeId === selectedRouteId;
    prevCheckpointSelectionRef.current = { routeId: selectedRouteId, index: selectedCheckpointIndex };
    if (status !== 'ready' || !map || selectedCheckpointIndex === null || !selectedCheckpoint) return;
    // Skip when nothing actually changed, when the route was just swapped (the route-fit effect
    // already reframes the view), or when this selection came from clicking the marker itself.
    if (sameRoute && prev.index === selectedCheckpointIndex) return;
    if (lastCheckpointClickRef.current === selectedCheckpointIndex) {
      lastCheckpointClickRef.current = null;
      return;
    }
    map.flyTo({
      center: [selectedCheckpoint.lng, selectedCheckpoint.lat],
      // Leaves room below the map's vertical center for the popup, which anchors above the point.
      offset: isMobile ? [0, 0] : [0, 90],
      zoom: Math.max(map.getZoom(), 7),
      duration: prefersReducedMotion ? 0 : 600,
    });
  }, [status, selectedRouteId, selectedCheckpointIndex, selectedCheckpoint, isMobile, prefersReducedMotion]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !selectedCheckpoint) {
      setProjectedPoint(null);
      return;
    }
    function updatePoint() {
      const { x, y } = map!.project([selectedCheckpoint!.lng, selectedCheckpoint!.lat]);
      setProjectedPoint({ x, y });
      const container = containerRef.current;
      if (container) {
        setContainerSize({ width: container.clientWidth, height: container.clientHeight });
      }
    }
    updatePoint();
    map.on('move', updatePoint);
    map.on('zoom', updatePoint);
    window.addEventListener('resize', updatePoint);
    return () => {
      map.off('move', updatePoint);
      map.off('zoom', updatePoint);
      window.removeEventListener('resize', updatePoint);
    };
  }, [status, selectedCheckpoint]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 280 }}>
      {/* MapLibre adds `position: relative` to its container, so the absolute sizing lives on this wrapper. */}
      <Box sx={{ position: 'absolute', inset: 0 }}>
        <Box ref={containerRef} data-testid="maplibre-container" sx={{ width: '100%', height: '100%' }} />
      </Box>
      {status === 'ready' && routes && routes.length > 0 && (
        <Button
          variant="contained"
          size="small"
          onClick={() => fitToRoutes(routes)}
          sx={{ position: 'absolute', top: 12, right: 12 }}
        >
          Fit routes
        </Button>
      )}
      {status === 'ready' && heatmap && (
        <Button
          variant={heatmapVisible ? 'contained' : 'outlined'}
          color={heatmapVisible ? 'primary' : 'inherit'}
          size="small"
          aria-pressed={heatmapVisible}
          onClick={() => setHeatmapVisible((visible) => !visible)}
          sx={{
            position: 'absolute',
            top: 12,
            left: 12,
            backgroundColor: heatmapVisible ? undefined : 'background.paper',
            '&:focus-visible': { outline: '2px solid', outlineColor: tokens.brand, outlineOffset: 2 },
          }}
        >
          Conditions heatmap: {heatmapVisible ? 'on' : 'off'}
        </Button>
      )}
      {status === 'ready' && heatmap && heatmapVisible && (
        <HeatmapLegend
          startTime={heatmap.start_time}
          hour={forecastHour}
          pointCount={heatmap.points.length}
          loadWeightLb={loadWeightLb > 0 ? loadWeightLb : undefined}
        />
      )}
      {status === 'loading' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.default',
          }}
        >
          <CircularProgress aria-label="Loading map" />
        </Box>
      )}
      {/* On mobile, CheckpointDrawer's own bottom sheet owns the list/details views (mutually
          exclusive), so a second popup here would overlap it; skip rendering this one there. */}
      {status === 'ready' && selectedCheckpoint && !isMobile && (
        <CheckpointOverlay
          key={selectedCheckpoint.index}
          checkpoint={selectedCheckpoint}
          weatherSample={weatherSample}
          loadWeightLb={loadWeightLb}
          point={projectedPoint}
          containerSize={containerSize}
          onClose={() => onSelectCheckpointRef.current?.(null)}
        />
      )}
      {status === 'error' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
            backgroundColor: 'background.default',
          }}
        >
          <Alert severity="warning" sx={{ maxWidth: 420 }}>
            Map tiles are unavailable right now. Route and checkpoint details below are still
            usable.
          </Alert>
        </Box>
      )}
    </Box>
  );
}
