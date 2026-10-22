# 04 — API Contracts

Django REST Framework, JSON over HTTPS, base path `/api`. Stateless; no authentication (out of scope). Skill: `senior-backend` (validation, error envelope, throttling). These are contracts for implementation; the shapes mirror `domain/models.py` and the TypeScript types in `frontend/src/api/types.ts`.

Conventions
- Field names `snake_case`. Times are ISO 8601 UTC (`2026-10-22T14:20:00Z`) in responses; requests may carry an offset.
- Distances in **miles**, durations in **seconds**, weights in **pounds**, wind **mph**, rain/snow **inches per hour**.
- Coordinates `{ "lat": number, "lng": number }`, WGS84.
- Risk levels (string enum, ordered): `low < moderate < high < severe < no_travel`; plus `unknown` (no data; not part of the ordering).
- Numeric risk score used for averaging: low 0, moderate 1, high 2, severe 3, no_travel 4.

## 1. Endpoints

| Method | Path | Purpose | Throttle |
|---|---|---|---|
| GET | `/api/health` | liveness, no upstream calls | none |
| GET | `/api/places/suggest?q=` | geocode suggestions (autocomplete) | 60/min/IP |
| POST | `/api/trips/analyze` | routes + weather + risk + ranking + heatmap in one call | 20/min/IP |

No other endpoints. A separate heatmap endpoint is deliberately omitted so the slider needs no requests (D-09).

## 2. Error envelope (all non-2xx)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": { "load_weight_lb": ["Must be between 1 and 100000."] },
    "retryable": false,
    "retry_after_seconds": null,
    "request_id": "01HZX..."
  }
}
```

| HTTP | `code` | Meaning | `retryable` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | schema/range/unknown-field errors; `details` is field → messages | no |
| 422 | `NO_ROUTE` | provider found no drivable route | no |
| 422 | `TOO_MANY_CHECKPOINTS` | weather budget exceeded; `details.min_interval_miles` gives the smallest feasible option | no |
| 422 | `FORECAST_HORIZON` | departure + trip is beyond forecast coverage entirely (partial coverage is a warning, not an error) | no |
| 429 | `RATE_LIMITED` | our throttle or an upstream limit; includes `retry_after_seconds` | yes |
| 502 | `WEATHER_UNAVAILABLE` | weather provider failed after retries; nothing can be scored | yes |
| 502 | `ROUTING_UNAVAILABLE` | routing provider failed after retries | yes |
| 504 | `UPSTREAM_TIMEOUT` | provider timeout after retries | yes |
| 500 | `INTERNAL_ERROR` | bug; only `request_id` is exposed | yes |

Every response includes header `X-Request-ID`. Upstream keys and URLs never appear in errors.

## 3. `GET /api/places/suggest`

Query: `q` (string, 3–100 chars after trimming), optional `limit` (1–8, default 5).

200:
```json
{
  "results": [
    { "id": "tt:12345", "label": "Denver, CO, United States", "lat": 39.7392, "lng": -104.9903 }
  ]
}
```
Rules: results restricted to the United States (A-09); empty array is a valid 200; upstream failure → `RATE_LIMITED` / `UPSTREAM_TIMEOUT` as above.

## 4. `POST /api/trips/analyze`

### Request

```json
{
  "origin":      { "label": "Denver, CO", "lat": 39.7392, "lng": -104.9903 },
  "destination": { "label": "Omaha, NE",  "lat": 41.2565, "lng": -95.9345 },
  "departure_time": "2026-10-22T14:00:00-06:00",
  "load_weight_lb": 38000,
  "checkpoint_interval_miles": 25
}
```

| Field | Type | Rule |
|---|---|---|
| `origin`, `destination` | object | `lat` ∈ [-90,90], `lng` ∈ [-180,180] (US bounding box check, A-09); `label` optional string ≤120; origin ≠ destination (> 1 mile apart) |
| `departure_time` | ISO 8601 datetime with offset | within [now − 1 h, now + 7 days]; naive datetimes rejected |
| `load_weight_lb` | number | 1 ≤ x ≤ 100,000; stored as given, not rounded |
| `checkpoint_interval_miles` | integer enum | one of 10, 25, 50 (A-01); default 25 |
| unknown fields | — | rejected (`VALIDATION_ERROR`) |

### Response 200

```json
{
  "request_id": "01HZX...",
  "inputs": { "origin": {...}, "destination": {...}, "departure_time": "2026-10-22T20:00:00Z",
              "load_weight_lb": 38000, "checkpoint_interval_miles": 25 },
  "recommendation": {
    "route_id": "r2",
    "fallback_level": "none",
    "blocked": false,
    "reasons": [
      { "key": "severe_miles", "text": "0.0 Severe miles vs 24.5 on Route 1", "decisive": true }
    ],
    "ranking": ["r2", "r1", "r3"]
  },
  "routes": [ Route, Route, Route ],
  "heatmap": Heatmap,
  "warnings": [ { "code": "ROUTES_FEWER_THAN_3", "message": "Only 2 distinct routes are available for this trip." } ],
  "weather": {
    "provider": "open-meteo",
    "generated_at": "2026-10-22T10:00:00Z",
    "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)",
    "notes": ["Forecast model data, not observations."]
  },
  "meta": { "routing_provider": "tomtom", "unique_weather_points": 212, "cache_hits": 40, "duration_ms": 3100 }
}
```

`routes` is ordered by `rank` ascending (rank 1 = recommended within its eligibility tier — see `05` §8). `recommendation.fallback_level` ∈ `none` (recommended route is fully eligible), `incomplete_data` (no eligible route existed; best-available route has missing weather), `no_safe_route` (every route is blocked; `recommendation.blocked = true`). The UI reads `fallback_level`, never `rank` alone, to decide whether to present the pick as safe. `warnings[].code` ∈ `ROUTES_FEWER_THAN_3`, `WEATHER_PARTIAL`, `FORECAST_HORIZON_PARTIAL`, `INCOMPLETE_DATA_FALLBACK`, `ALL_ROUTES_BLOCKED`, `ETA_ESTIMATED` (always present: "ETAs assume continuous driving", A-06).

### Route

```json
{
  "id": "r2",
  "rank": 1,
  "recommended": true,
  "name": "Route 2",
  "via": "I-76 E, I-80 E",
  "geometry": { "encoding": "polyline5", "points": "_p~iF~ps|U_ulLnnqC_mqNvxq`@", "bbox": [-105.0, 39.7, -95.9, 41.3] },
  "eligibility": { "status": "eligible", "reason": null },
  "summary": {
    "distance_miles": 546.3,
    "duration_seconds": 30040,
    "departure_time": "2026-10-22T20:00:00Z",
    "arrival_time": "2026-10-23T04:20:40Z",
    "max_level": "high",
    "average_risk": 0.74,
    "miles_by_level": { "low": 410.2, "moderate": 96.0, "high": 40.1, "severe": 0.0, "no_travel": 0.0, "unknown": 0.0 },
    "blocked": false,
    "complete": true
  },
  "ranking_keys": { "no_travel_miles": 0.0, "severe_miles": 0.0, "high_miles": 40.1, "average_risk": 0.74, "duration_seconds": 30040 },
  "risk_segments": [
    { "level": "low", "from_miles": 0.0, "to_miles": 62.5, "points": "_p~iF~ps|U_ulLnnqC" },
    { "level": "high", "from_miles": 62.5, "to_miles": 87.5, "points": "_ulLnnqC_mqNvxq`@" }
  ],
  "checkpoints": [ Checkpoint ]
}
```

- `geometry.points`: Google encoded polyline (precision 5) of the simplified route; the frontend decodes it. `bbox` = [west, south, east, north].
- `name`/`via` are display strings derived from provider data; if absent, `via` is omitted.
- `eligibility.status` ∈ `eligible`, `incomplete`, `blocked` (`05` §8); `eligibility.reason` is a short machine string (e.g. `"no_travel_at_mile_142"`, `"unknown_at_3_checkpoints"`) or `null` when eligible. `summary.blocked`/`summary.complete` are convenience booleans derived from `eligibility.status` (`blocked` ⇔ status `blocked`; `complete` ⇔ status `eligible`) kept for simple UI binding; `eligibility.status` is the field of record if the two are ever read together.
- `summary.complete = false` when any checkpoint is `unknown`.
- `risk_segments`: the route cut at the coverage boundaries of `05` §7, adjacent segments of the same level merged, each with its own polyline5 geometry. The server produces them so the client never re-implements distance math (no drift between the ribbon, the colored line and the checkpoint table). They cover `[0, distance_miles]` without gaps.

### Checkpoint

```json
{
  "index": 3,
  "distance_miles": 75.0,
  "lat": 40.1021,
  "lng": -103.2188,
  "eta": "2026-10-22T23:10:12Z",
  "weather_sample_id": "ws_40.10_-103.22_2026-10-22T23",
  "risk": {
    "level": "severe",
    "raw_value": 38.411200000002,
    "by_condition": { "wind": "high", "rain": "low", "snow": "low" },
    "load_rule": { "applied": true, "rule": "wind_35_44_over_40000", "from": "high", "to": "severe" },
    "drivers": ["wind"],
    "covers_miles": { "from": 62.5, "to": 87.5 }
  }
}
```

Weather readings are returned **once per unique (rounded location, matched hour-pair) combination**, not re-embedded on every checkpoint that uses them, in a top-level `weather_samples` map keyed by `weather_sample_id`:

```json
{
  "weather_samples": {
    "ws_40.10_-103.22_2026-10-22T23": {
      "wind_mph": 38.4,
      "rain_in_per_hr": 0.00,
      "snow_in_per_hr": 0.0,
      "wind_time_used": ["2026-10-22T23:00:00Z", "2026-10-23T00:00:00Z"],
      "precip_bucket_end": "2026-10-23T00:00:00Z"
    }
  }
}
```

- `checkpoint.weather_sample_id` is `null` and `risk.level` is `"unknown"` when data is unavailable for this checkpoint's ETA, with `risk.reason` ∈ `provider_error`, `beyond_forecast` (no entry is created in `weather_samples` for an unknown checkpoint).
- The id is deterministic (rounded-location + matched-hour-pair, `05` §4.2/§4.3), so two checkpoints — on the same route or on different routes — that resolve to the same snapped point and the same `[h0, h1]` pair share one `weather_samples` entry; the frontend looks it up once and reuses it for both. This removes the inline-weather duplication the Phase 1B review flagged: a 3-route trip with a shared 100-mile final approach previously repeated the same wind/rain/snow numbers in every route's `checkpoints[]`; now that stretch contributes one `weather_samples` entry referenced by `weather_sample_id` from each route's checkpoint, typically cutting the duplicated-weather portion of the payload by the overlap fraction computed in `05` §2 (commonly 40–60% shared-overlap on the two kept alternates, per the live measurements in `03` §2.1).
- `risk.raw_value` is the full-precision value (before display rounding, `05` §4.4) that was actually compared against the thresholds for the condition named first in `drivers` — exposed for audit of boundary cases; `weather_samples[*].wind_mph` etc. are the display-rounded figures.
- `load_rule.rule` ∈ `wind_ge_55`, `wind_45_54_over_30000`, `wind_35_44_over_40000`, or `null` with `applied: false`.
- `covers_miles` is the segment attributed to this checkpoint for mileage totals (`05` §7).

### Heatmap

```json
{
  "start_time": "2026-10-22T20:00:00Z",
  "hours": 49,
  "legend": ["low", "moderate", "high", "severe", "no_travel"],
  "encoding": { "risk": "0-4 = low..no_travel, 255 = unknown" },
  "points": [
    { "lat": 40.1, "lng": -103.2, "route_ids": ["r1", "r2"], "risk": [1,1,1,2,2,2,3,"... 49 values ..."] }
  ]
}
```
- `risk[h]` is the risk level at `start_time + h hours` using the same classification and the request's load weight (D-08). `risk` is sent as an int array; points are deduplicated across routes.
- Every `points[i].risk.length === hours`.

## 5. Validation and error-handling rules (backend)

1. Validate in DRF serializers; `extra fields → error`; datetime parsing strict; all bounds from `settings.TRIP_LIMITS` (single place).
2. Business exceptions are typed; views never catch broadly. The exception handler is the only place producing the error envelope.
3. Provider adapters: timeout (connect 3 s, read 8 s), 2 retries with jittered backoff on timeouts/5xx/429 (respect `Retry-After`), no retry on 4xx. Mapping: upstream 429 → `RATE_LIMITED`; 5xx/timeouts → `*_UNAVAILABLE`/`UPSTREAM_TIMEOUT`.
4. Partial weather failures (some chunks fail) → `unknown` checkpoints plus `WEATHER_PARTIAL`; total failure → 502.
5. Idempotent and side-effect free: same input and same cached provider data → byte-identical `routes[*].ranking_keys` (D-06).
6. **Response size and caching strategy (reviewed, Phase 1B):**
   - `Cache-Control: no-store` stays on `POST /api/trips/analyze` responses — a POST response is not cacheable by browsers/CDNs regardless of header (no `Content-Location`), and results legitimately depend on a time-varying forecast, so there is nothing to gain from trying to make it cacheable at the HTTP layer; `no-store` just makes that explicit rather than leaving default (browser-dependent) behaviour.
   - The caching that matters happens one layer down, in the provider-data cache (`03` §6: weather TTL 30 min, geocode TTL 24 h, routes TTL 30 min, keyed by rounded coordinates/date-range/units) — repeated analyses for the same rounded trip within the TTL window reuse provider data and therefore reuse `weather_samples` entries without a new upstream call. This is unchanged from Phase 1 and is the right place for caching on a single-POST-endpoint design.
   - The one new saving is **intra-response**: `weather_samples` deduplication (see the Checkpoint section above) removes the inline repetition of identical weather readings across checkpoints and across routes within one response — previously each route's `checkpoints[]` carried a full inline weather object even when two routes shared a road section (and therefore a snapped point and matched hour). Measured against the `03` §2.1 overlap data (0.24–0.64 overlap fraction between kept alternates on the 7-trip spike), this is expected to meaningfully shrink the weather portion of the payload on trips where the kept routes share a long common corridor (the common case for a "there and mostly back the same way" alternate); it has no effect on trips whose three kept routes are fully disjoint, since there is nothing to dedupe there.
   - The existing 400 KB uncompressed budget (`03` §5) is unchanged as an upper bound; `weather_samples` dedup is a reduction within that budget, not a reason to raise it.

## 6. TypeScript types (frontend mirror, abbreviated)

```ts
export type RiskLevel = 'low'|'moderate'|'high'|'severe'|'no_travel'|'unknown';
export type EligibilityStatus = 'eligible'|'incomplete'|'blocked';
export interface WeatherSample { wind_mph: number; rain_in_per_hr: number; snow_in_per_hr: number;
  wind_time_used: [string, string]; precip_bucket_end: string }
export interface Checkpoint { index: number; distance_miles: number; lat: number; lng: number; eta: string;
  weather_sample_id: string | null;
  risk: { level: RiskLevel; raw_value: number | null; by_condition: Record<'wind'|'rain'|'snow', RiskLevel>;
          load_rule: { applied: boolean; rule: string | null; from?: RiskLevel; to?: RiskLevel };
          drivers: string[]; covers_miles: { from: number; to: number } } }
export interface AnalysisResult { weather_samples: Record<string, WeatherSample>; /* + routes, recommendation, heatmap, warnings, meta */ }
```
The frontend resolves a checkpoint's weather via `weather_samples[checkpoint.weather_sample_id]` (or renders the Unknown state when `weather_sample_id` is `null`); a shared `useWeatherSample(id)` selector memoises the lookup so repeated ids (shared road sections) do not re-render.
The contract is enforced by one test that validates a recorded real response against the TypeScript types (compile-time) and DRF output serializers (runtime), plus a dedup assertion: the number of distinct `weather_sample_id` values referenced is ≤ the number of unique (snapped location, matched hour-pair) pairs across the whole response, and `weather_samples` never contains an entry nobody references.
