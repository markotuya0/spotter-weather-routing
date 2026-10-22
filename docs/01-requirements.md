# 01 — Requirements

**Source of truth:** `assessment/fs-assessment-spotter.pdf` (2 pages, "Full Stack Developer — Weather-Aware Truck Routing").
Method: `spec-driven-workflow` (RFC 2119 keywords, atomic IDs, Given/When/Then, explicit assumptions).
Rule: anything not in the PDF is labelled **ASSUMPTION** or **DERIVED** and listed in section 6 / 7. Nothing below is promoted to "required" unless the PDF says so.

Legend: **PDF** = stated in the PDF. **DERIVED** = a testable consequence needed to implement a PDF statement. **DELIVERY** = deliverable/evaluation text from the PDF.

---

## 1. PDF requirements (verbatim intent, atomic)

### 1.1 Inputs

| ID | Source | Requirement |
|---|---|---|
| R-IN-01 | PDF | The user MUST be able to enter an **origin** and a **destination**. |
| R-IN-02 | PDF | The user MUST be able to enter a **departure date/time**. |
| R-IN-03 | PDF | The user MUST be able to enter a **load weight**. |

### 1.2 Routing

| ID | Source | Requirement |
|---|---|---|
| R-RT-01 | PDF | The app MUST generate **3 route options** using a routing API. |
| R-RT-02 | PDF | The app MUST NOT need its own routing engine (third-party routing, geocoding, weather APIs are allowed). |

### 1.3 Weather sampling

| ID | Source | Requirement |
|---|---|---|
| R-WX-01 | PDF | The app MUST sample weather along each route at checkpoints spaced **every 10 / 25 / 50 miles**. |
| R-WX-02 | PDF | Weather at each checkpoint MUST be taken for the **truck's estimated arrival time at that checkpoint**, not for departure time. |

### 1.4 Risk calculation

| ID | Source | Requirement |
|---|---|---|
| R-RK-01 | PDF | The app MUST classify weather at each checkpoint using the provided thresholds (Low / Moderate / High / Severe / No Travel) for wind, rain, snow. |
| R-RK-02 | PDF | Wind thresholds: Low <25 mph; Moderate 25–34; High 35–44; Severe 45–54; No Travel ≥55. |
| R-RK-03 | PDF | Rain thresholds (in/hr): Low <0.10; Moderate 0.10–0.25; High 0.25–0.50; Severe 0.50–1.00; No Travel >1.00. |
| R-RK-04 | PDF | Snow thresholds (in/hr): Low <0.5; Moderate 0.5–1.0; High 1.0–2.0; Severe 2.0–3.0; No Travel >3.0. |
| R-RK-05 | DERIVED (Phase 1B) | Classification MUST compare the raw, full-precision, unrounded normalised measurement against the thresholds. Rounding is a display-only operation and MUST NOT influence the assigned risk level (supersedes the Phase 1 "round before classify" rule, previously D-16). |
| R-LD-01 | PDF | Load rule: wind ≥55 mph → **No Travel for any load**. |
| R-LD-02 | PDF | Load rule: wind 45–54 mph **and** load >30,000 lb → **No Travel**. |
| R-LD-03 | PDF | Load rule: wind 35–44 mph **and** load >40,000 lb → **Severe**. |

### 1.5 Recommendation

| ID | Source | Requirement |
|---|---|---|
| R-REC-01 | PDF | The app MUST recommend the best route, balancing weather risk and travel time. |
| R-REC-02 | PDF | Preference order MUST be: (1) fewest Severe miles, (2) fewest High miles, (3) lowest average risk, (4) shortest travel time. |
| R-REC-03 | DERIVED (Phase 1B) | Routes with a No Travel checkpoint ("blocked") and routes with missing weather ("incomplete") MUST be filtered by a separate eligibility policy, run before ranking, never expressed as extra ranking keys; R-REC-02's four keys apply unmodified within whichever eligibility group is being ranked. See R-REC-04 for the fallback when no route is fully eligible. |
| R-REC-04 | DERIVED (Phase 1B) | When no route is fully eligible, the app MUST still produce a recommendation from the best available group (incomplete-data routes preferred over blocked routes), and MUST label it transparently as a fallback (not present it as a safe pick) rather than silently promoting an unsafe or data-poor route to "Recommended." |

### 1.6 Display

| ID | Source | Requirement |
|---|---|---|
| R-MAP-01 | PDF | The map MUST show **all routes**. |
| R-MAP-02 | PDF | The map MUST show **checkpoints**, with **risk levels** and **ETAs**. |
| R-MAP-03 | PDF | The UI MUST show **route summaries**. |
| R-HEAT-01 | PDF | The app MUST show a **weather heatmap along the trip corridor**. |
| R-HEAT-02 | PDF | The heatmap MUST have a **0–48 hour forecast slider**. |

### 1.7 Deliverables and evaluation

| ID | Source | Requirement |
|---|---|---|
| R-DEL-01 | DELIVERY | GitHub repository. |
| R-DEL-02 | DELIVERY | Hosted application. |
| R-DEL-03 | DELIVERY | 5–10 minute Loom walkthrough. |
| R-EVAL-01 | DELIVERY | Evaluation weights: 40% routes/weather/risk/recommendation logic; 40% UI, map and heatmap smoothness and performance; 15% code quality; 5% documentation and walkthrough. |
| R-EVAL-02 | DELIVERY | "Prioritize correctness and clarity over extra features." |
| R-STACK-01 | PDF | The app MUST be built with React (frontend) and Django (backend). |

Also from the task statement (not the PDF): 16 working hours max over at most four days (see `08-execution-plan.md`).

---

## 2. Derived requirements (needed to satisfy the PDF)

| ID | Derives from | Requirement |
|---|---|---|
| D-01 | R-WX-02 | Checkpoint ETA = departure time + travel time to that checkpoint, using route duration data from the routing provider. |
| D-02 | R-WX-02 | Forecast values MUST be matched to the ETA by a deterministic rule documented in `05-routing-weather-risk.md` §4. |
| D-03 | R-RK-01..04 | Threshold boundaries MUST be implemented from one table-driven definition with the interval semantics in `05` §5, and be unit-tested at every boundary. |
| D-04 | R-LD-01..03, R-RK-05 | Load overrides apply on top of the wind level, evaluated against the **raw, unrounded** wind value; final checkpoint level = max(wind, rain, snow) after overrides. |
| D-05 | R-REC-02 | "Severe miles" and "High miles" MUST be measured in miles along the route attributed to checkpoints (method in `05` §7), not counts of checkpoints. |
| D-06 | R-REC-02 | Ranking MUST be deterministic and lexicographic; identical input gives identical order. |
| D-07 | R-REC-03 | "No Travel" has no mileage rule in the PDF. Handling: a separate eligibility policy, not a mileage-based ranking key; see ASSUMPTION A-07 (now describing eligibility, not a ranking tuple entry). |
| D-08 | R-HEAT-01/02 | Heatmap values MUST come from real forecast data at sampled points, classified with the same risk rules as checkpoints (not decorative). |
| D-09 | R-HEAT-02 | Moving the slider MUST NOT trigger new network requests (all 0–48 h data is returned with the analysis). |
| D-10 | R-MAP-02 | Each checkpoint MUST expose: index, distance from origin, coordinates, ETA, wind/rain/snow values used, resulting level, and which condition(s) drove it. |
| D-11 | R-RT-01 | If the provider returns fewer than 3 distinct routes, the app MUST say so and show what exists; it MUST NOT invent routes (see A-03). |
| D-12 | R-IN-01..03 | Inputs MUST be validated on client and server with clear error messages (ranges in A-09). |
| D-13 | R-DEL-02 | API keys MUST stay on the server; no secrets in the repo or the browser bundle. |
| D-14 | R-HEAT-02, D-09 | The 0–48 h heatmap slider is a **client-side read of already-returned data only**. Moving it MUST NOT call `trips/analyze` again and MUST NOT change `recommendation`, `routes[*].rank`, or any checkpoint's `risk` — those are fixed at analysis time and are a different question (arrival-time forecast) from the slider's question (conditions at a chosen absolute time across the whole corridor). |
| D-15 | R-EVAL-02, D-08 | The analyze response MUST NOT repeat an identical weather reading inline for every checkpoint that uses it; readings shared by checkpoints at the same snapped location and matched forecast hour (same route or different routes) MUST be stored once and referenced by id (`weather_samples`, `04` §4). |

## 3. Non-functional requirements (derived from R-EVAL-01 — measurable targets, verified in M6)

| ID | Requirement | Target |
|---|---|---|
| N-01 | Slider interaction | Updates map at ≥50 fps on a mid-range laptop and stays responsive on a mid-range phone (no dropped input); no network call per tick. |
| N-02 | Analysis latency | Warm cache: p95 ≤ 3 s. Cold, 500-mile trip, 25-mile interval: ≤ 8 s. Long trips may take longer; UI shows progress (see `02`). |
| N-03 | Initial JS | Entry chunk (excluding map) ≤ 250 KB gzipped; map loaded as a separate chunk. |
| N-04 | Accessibility | WCAG 2.2 AA for the form, route list, checkpoint table, slider; risk is never conveyed by color alone. |
| N-05 | Responsiveness | Usable at 360 px, 768 px, 1280 px widths; no horizontal page scroll. |
| N-06 | Correctness | 100% of risk/ranking branches covered by unit tests; every threshold boundary tested. |
| N-07 | Reliability | Every external failure maps to a typed error with a user-facing message and retry path. |

---

## 4. Acceptance criteria (Given / When / Then)

| AC | Covers | Criterion |
|---|---|---|
| AC-01 | R-IN-01..03, D-12 | **Given** the form is empty, **when** the user submits, **then** each missing/invalid field shows an inline error and no request is sent. |
| AC-02 | R-RT-01, D-11 | **Given** a valid trip with ≥3 distinct provider routes, **when** analysis completes, **then** exactly 3 routes are returned and rendered. **Given** fewer exist, **then** the number returned is shown with a notice. |
| AC-03 | R-WX-01 | **Given** interval = 25 and a 100-mile route, **then** checkpoints are at 0, 25, 50, 75, 100 mi (destination always included as the final checkpoint). |
| AC-04 | R-WX-02, D-01, D-02 | **Given** a checkpoint ETA of 14:20 UTC, **then** wind is interpolated between 14:00 and 15:00; rain/snow use the hour ending 15:00; the response states the times used. |
| AC-05 | R-RK-02, R-RK-05 | **Given** raw (unrounded) wind 24.9 / 25.0 / 34.9 / 35.0 / 44.9 / 45.0 / 54.9 / 55.0 mph (load ≤30,000 lb), **then** levels are Low / Moderate / Moderate / High / High / Severe / Severe / No Travel, decided on the raw value; a value that rounds to a boundary for display (e.g. raw 34.996 → displayed "35.0") does not change which of these levels is assigned. |
| AC-06 | R-RK-03, R-RK-05 | **Given** raw rain 0.09 / 0.10 / 0.25 / 0.26 / 0.50 / 0.51 / 1.00 / 1.01 in/hr, **then** Low / Moderate / Moderate / High / High / Severe / Severe / No Travel, decided on the raw value. |
| AC-07 | R-RK-04, R-RK-05 | **Given** raw snow 0.4 / 0.5 / 1.0 / 1.1 / 2.0 / 2.1 / 3.0 / 3.1 in/hr, **then** Low / Moderate / Moderate / High / High / Severe / Severe / No Travel, decided on the raw value. |
| AC-08 | R-LD-02 | **Given** wind 45 mph and load 30,001 lb, **then** No Travel. **Given** load 30,000 lb, **then** Severe. |
| AC-09 | R-LD-03 | **Given** wind 35 mph and load 40,001 lb, **then** Severe. **Given** 40,000 lb, **then** High. |
| AC-10 | R-LD-01 | **Given** wind ≥55 mph and load 1 lb, **then** No Travel. |
| AC-11 | D-04 | **Given** wind=High, rain=Severe, snow=Low, **then** checkpoint level = Severe, with the drivers listing rain. |
| AC-12 | R-REC-02/03, D-05, D-06 | **Given** routes A (Severe 0 mi, High 40 mi) and B (Severe 0 mi, High 20 mi), both eligible, **then** B outranks A regardless of duration. **Given** equal Severe and High miles, **then** lower average risk wins; **given** all equal, shorter duration wins; final tie-break is provider route order. Ranking never consults No Travel miles or completeness — those are decided beforehand by eligibility (AC-13). |
| AC-13 | D-07, R-REC-03/04 | **Given** a route with any No Travel checkpoint ("blocked") and another with none ("eligible"), **then** the eligible one is recommended even if it has more Severe miles, because eligibility is decided before ranking, not as a ranking key (`05` §8). **Given** every route is blocked, **then** the best-ranked blocked route is still shown, flagged `recommendation.fallback_level = "no_safe_route"` and `blocked: true` (R-REC-04), never silently presented as safe. |
| AC-19 | D-15 | **Given** two checkpoints (same route or different routes) resolve to the same snapped location and matched forecast hour, **when** the analysis response is produced, **then** the reading appears once in `weather_samples` and both checkpoints reference it by `weather_sample_id`; no checkpoint carries an inline duplicate of another checkpoint's weather object. |
| AC-20 | D-14 | **Given** analysis results are on screen, **when** the user drags the heatmap slider, **then** `recommendation`, every `routes[*].rank`, and every checkpoint's `risk` are unchanged (byte-identical to before the drag) and no network request is sent. |
| AC-14 | R-MAP-01..03 | **Given** a result, **then** all routes are drawn on the map, each with an on-map label (route number, duration, distance) and a summary popup on click (distance, duration, ETA, miles by level, average risk); the recommended route is visually distinct; each checkpoint shows level + ETA in a popup; and the same summaries appear as route cards in the panel. |
| AC-15 | R-HEAT-01, D-08 | **Given** a result, **then** the heatmap layer is derived from classified hourly forecast data at sampled corridor points; its legend uses the same five levels. |
| AC-16 | R-HEAT-02, D-09 | **Given** the slider at hour h (0–48), **then** the heatmap shows conditions at departure + h; changing h triggers no network request. |
| AC-17 | N-07 | **Given** routing, geocoding or weather provider failure/timeouts/rate limiting, **then** the user sees a specific message with retry, never a blank screen. |
| AC-18 | R-DEL-01..03 | Repo public/accessible, hosted URL works from a clean browser, Loom 5–10 min. |

---

## 5. Traceability matrix

| Requirement | Design doc section | Components | Tests (`07`) |
|---|---|---|---|
| R-IN-01..03, D-12 | 02 §2.1; 04 §3 | `TripForm`, `GeocodeAutocomplete`, DRF `TripRequestSerializer` | AC-01; TS-API-02/03; TS-UI-01 |
| R-RT-01/02, D-11 | 03 §4; 05 §2 | `RoutingProvider` (TomTom adapter), route selection | AC-02; TS-RT-01..04 |
| R-WX-01 | 05 §3 | `checkpoints.generate()` | AC-03; TS-CP-01..06 |
| R-WX-02, D-01, D-02 | 05 §4 | `eta.at_distance()`, `weather.match()` | AC-04; TS-ETA-*, TS-WM-* |
| R-RK-01..04, D-03 | 05 §5 | `risk.classify()` (table-driven) | AC-05..07; TS-RK-* |
| R-LD-01..03, D-04 | 05 §6 | `risk.apply_load_rules()` | AC-08..11; TS-LD-* |
| R-REC-01/02, D-05..07 | 05 §9 | `ranking.rank()` (PDF's 4 keys only, scoped to one eligibility tier) | AC-12; TS-RANK-* |
| R-REC-03/04, D-07 | 05 §8 | `eligibility.assess()`, `selection.partition_by_eligibility()` | AC-13; TS-ELIG-* |
| R-MAP-01..03, D-10 | 06 §5–§7 | `MapView`, `RouteCard`, `CheckpointPopup`, `CheckpointTable` | AC-14; TS-UI-02..05; E2E-02/03 |
| R-HEAT-01/02, D-08/09/14 | 05 §10; 06 §8 | `heatmap.build()`, `HeatmapLayer`, `ForecastSlider` | AC-15/16/20; TS-HM-*; E2E-04 |
| D-15 | 04 §4 | `weather_samples` dedup map | AC-19; TS-API-08 |
| R-STACK-01 | 03 §1 | Vite+React+TS+MUI; Django+DRF | — |
| D-13 | 03 §9 | settings, env vars, proxy endpoints | TS-SEC-*, ship-gate |
| R-DEL-01..03 | 08 §6 | README, deploy, Loom script | AC-18 |
| N-01..07 | 03 §7; 06 §10 | perf budget, a11y audit | TS-PERF-*, TS-A11Y-* |

---

## 6. Assumptions (not in the PDF; proposed defaults)

| ID | Assumption | Why | Impact if wrong |
|---|---|---|---|
| A-01 | The 10 / 25 / 50-mile spacing is a **user-selectable option** (default 25), one spacing per analysis. Other readings: all three at once, or spacing chosen automatically by trip length. | PDF wording "every 10 / 25 / 50 miles" is ambiguous; a selector lets the user exercise all three values without tripling API cost. | Low: a multi-resolution or automatic mode is a small UI/service change. |
| A-02 | Risk rule boundary semantics: wind uses half-open intervals `[25,35)` etc. (table uses integers); rain/snow upper bounds are **inclusive** (`Moderate = [0.10, 0.25]`, `High = (0.25, 0.50]`) because "No Travel" is stated as strictly `>1.00` / `>3.0`. Classification compares the **raw, unrounded** value against these bounds (R-RK-05); values are rounded to display precision (wind 0.1 mph, rain 0.01 in/hr, snow 0.1 in/hr) only for what is shown to the user, **after** classification (Phase 1B change — Phase 1 rounded before classifying; see `05` §4.4). | PDF ranges touch at their endpoints (0.25 appears in two columns); rounding before comparing was found to risk misclassifying values near a boundary. | Boundary results differ only at exact boundary values; a displayed figure can now sit exactly on a boundary without "looking like" the level shown, disclosed via a tooltip (`06` §5). |
| A-03 | If the provider cannot return 3 distinct routes, show fewer with a notice. We do not synthesise routes via fake waypoints. | Honesty; PDF says routing API generates the routes. | If graders expect always 3, the fallback in `09` D-05 (provider swap) applies. |
| A-04 | Wind metric = sustained 10 m wind speed (`wind_speed_10m`), not gusts. Rain = `rain + showers`. Snow = hourly snowfall depth in inches. | PDF says "Wind" and gives no gust rule. | Gust-based would be stricter; one-line change. |
| A-05 | Truck routing profile: provider "truck" mode with default dimensions; load weight is **not** sent to the router. | PDF uses load weight only for risk rules. | Weight-restricted roads are not avoided. |
| A-06 | ETAs assume continuous driving at provider-estimated speeds (no rests, no HOS limits, no traffic beyond what the provider includes). | Not in the PDF; adding HOS is scope creep. | Long-trip ETAs optimistic. Disclosed in UI. |
| A-07 | "No Travel" has no mileage rule. A route with any No Travel checkpoint is **blocked** — an eligibility status decided by a separate policy step (`05` §8), not a ranking key. Blocked routes are never recommended over an eligible or incomplete-but-unblocked route. If every route is blocked, the least-bad blocked route (by the PDF's 4 ranking keys applied within the blocked group) is shown with an explicit "No safe route" warning and `fallback_level = "no_safe_route"`. | PDF says No Travel exists but not how it enters ranking. Treating it as milder than Severe would be unsafe; mixing it into the ranking tuple (Phase 1) also obscured that the PDF's 4 keys were being preceded by a 5th — Phase 1B asked for the two concerns to be separated. | Only affects which group a route sits in, never the ordering of the PDF's 4 keys inside a group. Needs user approval. |
| A-08 | Slider hour h = hours **after the entered departure time** (not after "now"). | Keeps heatmap aligned with the trip. | If "now" is meant, the label and offset change. |
| A-09 | Validation ranges: US locations; departure within [now − 1 h, now + 7 days]; load 1–100,000 lb (integer or decimal). | Forecast quality drops with horizon; 100,000 lb is a sanity cap above the 80,000 lb US gross limit. | Limits are config. |
| A-10 | Times are entered in the browser's timezone, sent as ISO 8601 with offset, and shown in that timezone with the abbreviation. | Avoids per-point timezone lookups. | Cross-timezone trips show browser-local clock times. |
| A-11 | Weather source is a forecast model, not observations. Forecasts beyond ~7 days are lower quality; UI discloses forecast source and generation time. | Honest limitation. | None. |
| A-12 | A route with any `unknown` checkpoint (weather missing, and no `no_travel` checkpoint — that combination is `blocked`, A-07) is **incomplete** — a second, distinct eligibility status, decided by the same separate policy step as A-07, never by a ranking key. Incomplete routes are recommended only when no fully eligible route exists; among incomplete routes the PDF's 4 keys apply (`average_risk` over known checkpoints only). Unknown is never treated as Low **or** as No Travel — it is its own status on its own axis, distinct from the blocked/eligible axis. | A recommendation as "safest" cannot rest on missing data; conflating "missing data" with "confirmed hazard" (no_travel) would misrepresent both. | Only affects partial-failure cases. Needs your approval with Q-02. |

## 7. Unresolved ambiguities requiring your approval (recommendation in bold)

| ID | Question | Options | Recommendation |
|---|---|---|---|
| Q-01 | Spacing (A-01) | selector / all three at once / automatic by trip length | **selector, default 25** |
| Q-02 | No Travel and unknown-data handling (A-07, A-12) — as a separate eligibility policy (blocked / incomplete / eligible groups, ranked independently) rather than extra ranking keys | separate eligibility policy / treat No Travel as Severe / fold into ranking tuple (Phase 1 approach) | **separate eligibility policy (Phase 1B direction)** |
| Q-03 | Boundary semantics and rounding (A-02) — classify on the raw unrounded value, round only for display | raw-value classification (Phase 1B direction) / round before classifying (Phase 1 approach) / all lower-inclusive | **raw-value classification** |
| Q-04 | Slider origin (A-08) | after departure / after now | **after departure** |
| Q-05 | Wind metric (A-04) | sustained / gusts | **sustained** |
| Q-06 | Routing provider and API key | TomTom (no card) / HERE (card) | **TomTom primary, HERE fallback; you must create the key** |
| Q-07 | <3 routes behaviour (A-03) | show fewer / fabricate | **show fewer** |
| Q-08 | Hosting | Render API + static frontend host / single service | **Render API + static host** |

## 8. Out of scope (explicit)

Authentication/accounts, saved trips, database persistence, traffic/incident routing, hours-of-service planning, fuel/toll cost, turn-by-turn navigation, mobile native app, multi-stop trips, historical weather, AI/LLM features, admin UI, internationalisation.
