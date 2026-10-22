// Mirrors backend/domain models and docs/04-api-contracts.md. Keep in sync with that doc.

export type RiskLevel = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel' | 'unknown';

export type EligibilityStatus = 'eligible' | 'incomplete' | 'blocked';

export type FallbackLevel = 'none' | 'incomplete_data' | 'no_safe_route';

export type CheckpointIntervalMiles = 10 | 25 | 50;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceSuggestion extends LatLng {
  id: string;
  label: string;
}

export interface PlaceSuggestResponse {
  results: PlaceSuggestion[];
}

export interface TripInput {
  origin: { label?: string } & LatLng;
  destination: { label?: string } & LatLng;
  departure_time: string;
  load_weight_lb: number;
  checkpoint_interval_miles: CheckpointIntervalMiles;
}

export interface WeatherSample {
  wind_mph: number;
  rain_in_per_hr: number;
  snow_in_per_hr: number;
  wind_time_used: [string, string];
  precip_bucket_end: string;
}

export interface CheckpointRisk {
  level: RiskLevel;
  raw_value: number | null;
  by_condition: Record<'wind' | 'rain' | 'snow', RiskLevel>;
  load_rule: { applied: boolean; rule: string | null; from?: RiskLevel; to?: RiskLevel };
  drivers: string[];
  covers_miles: { from: number; to: number };
  reason?: 'provider_error' | 'beyond_forecast';
}

export interface Checkpoint {
  index: number;
  distance_miles: number;
  lat: number;
  lng: number;
  eta: string;
  weather_sample_id: string | null;
  risk: CheckpointRisk;
}

export interface RiskSegment {
  level: RiskLevel;
  from_miles: number;
  to_miles: number;
  points: string;
}

export interface RouteSummary {
  distance_miles: number;
  duration_seconds: number;
  departure_time: string;
  arrival_time: string;
  max_level: RiskLevel;
  average_risk: number;
  miles_by_level: Record<RiskLevel, number>;
  blocked: boolean;
  complete: boolean;
}

export interface RankingKeys {
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  average_risk: number;
  duration_seconds: number;
}

export interface Route {
  id: string;
  rank: number;
  recommended: boolean;
  name: string;
  via?: string;
  geometry: { encoding: 'polyline5'; points: string; bbox: [number, number, number, number] };
  eligibility: { status: EligibilityStatus; reason: string | null };
  summary: RouteSummary;
  ranking_keys: RankingKeys;
  risk_segments: RiskSegment[];
  checkpoints: Checkpoint[];
}

export interface RecommendationReason {
  key: string;
  text: string;
  decisive: boolean;
}

export interface Recommendation {
  route_id: string | null;
  fallback_level: FallbackLevel;
  blocked: boolean;
  reasons: RecommendationReason[];
  ranking: string[];
}

export type WarningCode =
  | 'ROUTES_FEWER_THAN_3'
  | 'WEATHER_PARTIAL'
  | 'FORECAST_HORIZON_PARTIAL'
  | 'INCOMPLETE_DATA_FALLBACK'
  | 'ALL_ROUTES_BLOCKED'
  | 'ETA_ESTIMATED';

export interface Warning {
  code: WarningCode;
  message: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  route_ids: string[];
  risk: number[];
}

export interface Heatmap {
  start_time: string;
  hours: number;
  legend: RiskLevel[];
  encoding: { risk: string };
  points: HeatmapPoint[];
}

export interface AnalysisResult {
  request_id: string;
  inputs: TripInput;
  recommendation: Recommendation;
  routes: Route[];
  heatmap: Heatmap;
  warnings: Warning[];
  weather: { provider: string; generated_at: string; attribution: string; notes: string[] };
  weather_samples: Record<string, WeatherSample>;
  meta: { routing_provider: string; unique_weather_points: number; cache_hits: number; duration_ms: number };
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NO_ROUTE'
  | 'TOO_MANY_CHECKPOINTS'
  | 'FORECAST_HORIZON'
  | 'RATE_LIMITED'
  | 'WEATHER_UNAVAILABLE'
  | 'ROUTING_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, string[]> | null;
    retryable: boolean;
    retry_after_seconds: number | null;
    request_id: string;
  };
}
