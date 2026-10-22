import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, Route, WeatherSample } from '../../api/types';
import { tokens } from '../../theme/theme';
import { RISK_STYLES } from '../../theme/riskColors';
import { CheckpointOverlay } from './CheckpointOverlay';
import { buildCheckpointFeatureCollection } from './checkpointGeoJson';
import { buildRiskSegmentFeatureCollection } from './riskSegmentGeoJson';
import {
  buildEndpointFeatureCollection,
  buildRouteFeatureCollection,
  unionBbox,
  type Bbox,
} from './routeGeoJson';

export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const ROUTES_SOURCE_ID = 'routes';
const ENDPOINTS_SOURCE_ID = 'endpoints';
const RISK_SEGMENTS_SOURCE_ID = 'risk-segments';
const CHECKPOINTS_SOURCE_ID = 'checkpoints';
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
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRouteRef = useRef(onSelectRoute);
  const onSelectCheckpointRef = useRef(onSelectCheckpoint);
  const lastFittedRoutesRef = useRef<Route[] | undefined>(undefined);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [projectedPoint, setProjectedPoint] = useState<{ x: number; y: number } | null>(null);
  const isMobile = useMediaQuery('(max-width:767.98px)');

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
          if (routeId) onSelectRouteRef.current?.(routeId);
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
          if (index !== undefined) onSelectCheckpointRef.current?.(index);
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
      { padding: 48, duration: 500 },
    );
  }, []);

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
    const riskSource = map.getSource(RISK_SEGMENTS_SOURCE_ID) as GeoJSONSource | undefined;
    const checkpointsSource = map.getSource(CHECKPOINTS_SOURCE_ID) as GeoJSONSource | undefined;
    riskSource?.setData(buildRiskSegmentFeatureCollection(selectedRoute));
    checkpointsSource?.setData(
      buildCheckpointFeatureCollection(selectedRoute?.checkpoints ?? [], selectedCheckpointIndex),
    );
  }, [status, selectedRoute, selectedCheckpointIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !selectedCheckpoint) {
      setProjectedPoint(null);
      return;
    }
    function updatePoint() {
      const { x, y } = map!.project([selectedCheckpoint!.lng, selectedCheckpoint!.lat]);
      setProjectedPoint({ x, y });
    }
    updatePoint();
    map.on('move', updatePoint);
    map.on('zoom', updatePoint);
    return () => {
      map.off('move', updatePoint);
      map.off('zoom', updatePoint);
    };
  }, [status, selectedCheckpoint]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 280 }}>
      <Box
        ref={containerRef}
        data-testid="maplibre-container"
        sx={{ width: '100%', height: '100%' }}
      />
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
      {status === 'ready' && selectedCheckpoint && (
        <CheckpointOverlay
          checkpoint={selectedCheckpoint}
          weatherSample={weatherSample}
          loadWeightLb={loadWeightLb}
          point={projectedPoint}
          isMobile={isMobile}
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
