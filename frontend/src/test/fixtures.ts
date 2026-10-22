import type { AnalysisResult, Checkpoint, Route } from '../api/types';

export function buildCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    index: 0,
    distance_miles: 75,
    lat: 40.5,
    lng: -102.3,
    eta: '2026-10-22T23:10:00Z',
    weather_sample_id: 'ws-1',
    risk: {
      level: 'high',
      raw_value: 38.4,
      by_condition: { wind: 'high', rain: 'low', snow: 'low' },
      load_rule: { applied: false, rule: null },
      drivers: ['wind'],
      covers_miles: { from: 62.5, to: 87.5 },
    },
    ...overrides,
  };
}

export function buildRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'r1',
    rank: 1,
    recommended: true,
    name: 'Route 1',
    via: 'I-76 E, I-80 E',
    geometry: { encoding: 'polyline5', points: '', bbox: [-105, 39.7, -95.9, 41.3] },
    eligibility: { status: 'eligible', reason: null },
    summary: {
      distance_miles: 546.3,
      duration_seconds: 30040,
      departure_time: '2026-10-22T20:00:00Z',
      arrival_time: '2026-10-23T04:20:40Z',
      max_level: 'high',
      average_risk: 0.74,
      miles_by_level: { low: 410.2, moderate: 96.0, high: 40.1, severe: 0, no_travel: 0, unknown: 0 },
      blocked: false,
      complete: true,
    },
    ranking_keys: {
      no_travel_miles: 0,
      severe_miles: 0,
      high_miles: 40.1,
      average_risk: 0.74,
      duration_seconds: 30040,
    },
    risk_segments: [
      { level: 'low', from_miles: 0, to_miles: 400, points: '' },
      { level: 'high', from_miles: 400, to_miles: 546.3, points: '' },
    ],
    checkpoints: [],
    ...overrides,
  };
}

export function buildAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const routes = overrides.routes ?? [buildRoute()];
  return {
    request_id: 'req-1',
    inputs: {
      origin: { label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
      destination: { label: 'Omaha, NE', lat: 41.2565, lng: -95.9345 },
      departure_time: '2026-10-22T20:00:00Z',
      load_weight_lb: 38000,
      checkpoint_interval_miles: 25,
    },
    recommendation: {
      route_id: routes[0]?.id ?? null,
      fallback_level: 'none',
      blocked: false,
      reasons: [{ key: 'severe_miles', text: '0.0 Severe miles vs 24.5 on Route 2', decisive: true }],
      ranking: routes.map((r) => r.id),
    },
    routes,
    heatmap: { start_time: '2026-10-22T20:00:00Z', hours: 49, legend: [], encoding: { risk: '' }, points: [] },
    warnings: [],
    weather: {
      provider: 'open-meteo',
      generated_at: '2026-10-22T10:00:00Z',
      attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
      notes: [],
    },
    weather_samples: {},
    meta: { routing_provider: 'tomtom', unique_weather_points: 1, cache_hits: 0, duration_ms: 100 },
    ...overrides,
  };
}
