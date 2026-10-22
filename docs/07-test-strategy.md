# 07 — Test Strategy

Skills: `tdd-guide` (red-green-refactor, table-driven + property-based, mutation testing for the rule engine), `playwright-pro` (golden rules: role-based locators, web-first assertions, no `waitForTimeout`, `baseURL`, retries 2 in CI, traces on first retry, one behaviour per test, mock only third parties), `a11y-audit`, `senior-qa` was rejected (`00`). Rule from your stored preference: **targeted tests per slice; full sweeps only at milestone gates.**

## 1. Principles

1. The 40%-weight logic (`backend/domain`) is written **test-first** from `05` §11. Each rule gets a failing test before code.
2. Third-party APIs are mocked/replayed; **our own app is never mocked in E2E** (Playwright runs the real React app against the real Django app with fixture providers).
3. Fixtures are real recorded provider responses with keys removed, plus clearly labelled synthetic weather edits to create snow/wind/blocked scenarios. Fixture files carry a header comment: source, date, edits.
4. Every acceptance criterion in `01` §4 maps to at least one automated test (matrix §9).
5. No test depends on the clock or network: time is injected (`now` parameter), providers are doubles.

## 2. Test pyramid and tooling

| Layer | Tool | Scope | Run when |
|---|---|---|---|
| Domain unit | pytest, `parametrize`, Hypothesis | risk, load rules, checkpoints, ETA, matching, aggregation, ranking, selection, heatmap | every slice (seconds) |
| Provider adapter | pytest + `responses`/`requests-mock` + recorded fixtures | request construction (units!), response normalisation, retry/error mapping | M2 |
| API integration | pytest-django + DRF `APIClient`, fixture providers | validation, error envelope, throttling, full analyze flow, schema | M2 gate |
| Contract | pytest + TS compile check | recorded analyze response ↔ DRF output serializer ↔ `types.ts` | M2/M3 |
| Frontend unit/component | Vitest + React Testing Library + MSW | form validation, route cards/ribbon, compare table, checkpoint table, slider logic, error states | per component |
| E2E | Playwright (Chromium; desktop + mobile emulation projects) | user journeys on real app with fixture providers | M4/M5/M6 gates |
| Accessibility | `@axe-core/playwright` + `a11y_scanner.py` + `contrast_checker.py` | key screens and states | M6 |
| Performance | Playwright trace/rAF sampling, Lighthouse, bundle analyzer | N-01..N-03 | M5/M6 |
| Deployment smoke | Playwright against production URL + curl script | health, CORS, one real analysis | M7 |
| Review | `adversarial-reviewer`, `ship-gate` | diffs per milestone; pre-deploy | M2, M5, M7 |

Coverage targets: `domain/` 100% line and branch (enforced in CI via `--cov-fail-under`); backend overall ≥ 90%; frontend: critical components covered, no global number. Mutation testing (`mutmut`) on `risk.py` and `ranking.py` as a stretch if time allows (M6): surviving mutants at threshold comparisons indicate missing boundary tests.

## 3. Backend unit tests (domain)

IDs referenced by `01` §5. Cases are the catalogue in `05` §11; counts are minimums.

| ID | Subject | Notes |
|---|---|---|
| TS-RK-01 | wind classification | all boundaries on the **raw, unrounded** value (±1e-6 either side), 0, 80, invalid (negative, NaN) → error; a value whose *display* rounding would cross a boundary (e.g. raw 34.996 → displayed "35.0") must classify by the raw value, not the displayed one (`05` §4.4) |
| TS-RK-02 | rain classification | boundaries incl. inclusive upper bounds (0.25, 0.50, 1.00) on the raw value; a `Decimal(repr(...))`-vs-float-`==` comparison test proves binary-float summation error (e.g. a computed `0.25000000000000006`) does not misclassify |
| TS-RK-03 | snow classification | boundaries incl. 1.0, 2.0, 3.0, on the raw value |
| TS-RK-04 | table integrity | thresholds strictly increasing; levels ordered; single source of truth (`THRESHOLDS`); classify() never calls `round()` on its input (static/AST check or a mock that fails the test if `round` is invoked) |
| TS-LD-01..06 | load rules | 30,000/30,000.01; 40,000/40,000.01; each band edge; wind ≥55 with 1 lb; rule only raises; raw-value boundary cases (e.g. 44.996 mph stays in the 35–44 band and does not reach the 45–54 override) replacing the Phase 1 rounding-before-rules cases; rain/snow unaffected by load |
| TS-RK-05 | combination | max of three conditions, driver listing incl. load-rule driver |
| TS-WM-01..06 | forecast matching | on-hour, 14:20 interpolation, 14:59:59, first/last hour, missing/null → unknown, beyond-forecast → unknown reason; rain/snow use the ceil-hour bucket; `rain+showers` |
| TS-ETA-01..05 | ETA | linear profile; ETA(D) = dep + T; knots profile; odd seconds; offsets/DST via UTC |
| TS-CP-01..06 | checkpoints | `D=100,I=25` → 5; `D=101`; `D<I`; exact multiple; 4,000 mi @10 → 401; duplicate vertices; length-scaling to provider `D`; positions inside bounding box |
| TS-AG-01..04 | aggregation | Σ miles = D (Hypothesis); coverage example 12.5/25/25/25/12.5; unknown miles bucket; average risk weights and null case |
| TS-ELIG-01..06 | eligibility (`05` §8, new) | blocked beats incomplete when a route has both a no_travel and an unknown checkpoint; eligible/incomplete/blocked partition is exhaustive and disjoint (Hypothesis); recommendation never comes from an empty group; `fallback_level` is `"none"` iff the recommendation came from the `eligible` group; `rank()` is never invoked with a mixed-tier list (signature-level test) |
| TS-RANK-01..08 | ranking, scoped to one eligibility tier | each of the PDF's 4 keys decisive in isolation; lexicographic precedence; ranking-key rounding thresholds (independent of raw-value classification, `05` §9); provider-index tie-break; permutation invariance; `average_risk = null` only in the all-unknown edge case; reasons text; total-order property within a tier |
| TS-SEL-01..05 | route selection | duplicate removal at 0.95 overlap; detour removal; 3/2/1/0 candidates; greedy distinctness; stable ids |
| TS-HM-01..04 | heatmap | 49 values; equals single-point classification (raw value, `05` §4.4) at `dep + h`; unknown = 255; merged `route_ids`; same load rules as checkpoints |
| TS-UNIT-01 | units | adapter request has `wind_speed_unit=mph` and `precipitation_unit=inch`; response units asserted equal `mp/h` and `inch`; a response in cm/kmh raises |

## 4. Provider adapter and routing/ETA integration tests

| ID | Test |
|---|---|
| TS-RT-01 | Fixture TomTom/HERE response with 4–6 routes → normalised `ProviderRoute` (meters→miles, seconds, geometry decoded) |
| TS-RT-02 | Route selection returns 3 distinct routes from recorded Denver→Omaha, Chicago→Atlanta, Seattle→SLC style fixtures |
| TS-RT-03 | Provider returns 1 or 2 routes → `ROUTES_FEWER_THAN_3` warning, no invented routes |
| TS-RT-04 | Provider error, timeout, 429 (with `Retry-After`), malformed JSON → typed errors; 4xx not retried; 5xx retried twice |
| TS-WX-01 | Weather chunking (≤100 locations per request), dedupe by rounded coordinates, cache hit on second call, limiter spacing |
| TS-WX-02 | One chunk fails → affected checkpoints unknown + `WEATHER_PARTIAL`; all chunks fail → `WEATHER_UNAVAILABLE` |
| TS-WX-03 | Budget exceeded → `TOO_MANY_CHECKPOINTS` with `min_interval_miles` |
| TS-ETA-INT-01 | End-to-end: fixture route + fixture weather → checkpoint ETAs and weather times used match hand-computed values (golden file) |

## 5. API integration tests (DRF)

| ID | Test |
|---|---|
| TS-API-01 | Health returns 200 without upstream calls |
| TS-API-02 | Validation matrix: missing fields, bad types, lat/lng range, same origin/destination, naive datetime, departure in the past / > 7 days, load 0 / 100,001 / "abc", interval 15, unknown field → 400 with field details |
| TS-API-03 | Happy path: response validates against output serializer; routes ordered by rank; `ranking_keys` consistent with `summary`; heatmap lengths = 49; payload size < budget |
| TS-API-04 | Error envelope for every code in `04` §2 (status, `retryable`, request id header) |
| TS-API-05 | Determinism: same input twice → identical ranking keys and order |
| TS-API-06 | Throttle: 21st analyze in a minute → 429 `RATE_LIMITED` with `retry_after_seconds` |
| TS-API-07 | Suggest endpoint: min length, limit, US restriction, empty results, upstream failure mapping |
| TS-SEC-01 | No API key or upstream URL in any response/error/log line (assert on captured logs) |
| TS-SEC-02 | CORS: allowed origin passes preflight, other origin does not; `DEBUG=False` settings test; request body size limit |
| TS-SEC-03 | Frontend production bundle contains no provider key strings (grep in CI/deploy script) |
| TS-API-08 | `weather_samples` dedup: on a fixture with two routes sharing a road section, count of distinct `weather_sample_id` values referenced ≤ count of unique (snapped location, matched hour-pair) pairs in the fixture; every id in `weather_samples` is referenced by ≥1 checkpoint; no checkpoint carries inline weather |

## 6. Frontend component tests (Vitest + RTL + MSW)

| ID | Test |
|---|---|
| TS-UI-01 | Form validation messages for each rule (same wording as server); first invalid field focused; submit disabled while loading |
| TS-UI-02 | `RouteCard`/`RiskRibbon`: widths ∝ miles; `aria-label` summary; shape + label for every level; blocked and incomplete states |
| TS-UI-03 | `CompareTable` marks the deciding row/winner; trade-off note shown when recommended ≠ fastest |
| TS-UI-04 | `CheckpointTable`: values/units/time formatting; row selection callback; unknown row rendering |
| TS-UI-05 | `ForecastSlider`: keyboard steps, `aria-valuetext`, label time, debounced live region, play/pause honours reduced motion, no fetch on change (MSW asserts zero calls) |
| TS-UI-06 | Error and warning rendering for every API code; retry button re-submits same inputs |
| TS-UI-07 | Time formatting helpers (zone abbreviation, 12/24 h), `Miles`/`Duration` helpers |
| TS-UI-08 | Map layer wiring with MapLibre mocked at the boundary (third-party): sources/layers created once; selection restyles; hour change calls the update function once per animation frame |

## 7. Playwright E2E scenarios

Config: `baseURL` from env; projects `desktop-chromium` (1280×800) and `mobile-chromium` (Pixel 5 emulation); retries 2 in CI / 0 locally; `trace: 'on-first-retry'`; WebGL enabled via SwiftShader flags (risk R-06 in `09`). Backend runs with `PROVIDER_MODE=fixture` and named scenarios selected by a header/query param understood only in fixture mode. Basemap tile requests are intercepted with `page.route` returning a tiny static style (third-party mocked), plus one non-mocked smoke run for the real basemap.

| ID | Scenario | Key assertions (web-first) |
|---|---|---|
| E2E-01 | Happy path: fill form, Analyze | three route cards, Recommended chip on rank 1, map canvas visible, no console errors |
| E2E-02 | Compare and select | clicking card B selects it on map (via `aria-current` + layer state exposed through a test hook) and in table; compare table winners match fixture; clicking a route label opens its summary popup with the fixture's distance, duration and miles by level |
| E2E-03 | Checkpoint details | open popup/table row: mile, ETA, wind/rain/snow, level, driver text equal fixture values (incl. load rule text) |
| E2E-04 | Forecast slider | drag/keys to +6 h: label updates, heatmap hour state changes, **zero network requests** during interaction (`page.on('request')` count), no long task > 50 ms in trace; **recommendation and route-card rank text are pixel/text-identical before and after the drag** (D-14, AC-20) |
| E2E-05 | Validation | empty submit shows all errors; fix one-by-one; keyboard-only submission |
| E2E-06 | Provider failure | `weather_down` scenario → specific message + Retry; retry succeeds on next scenario |
| E2E-07 | Fewer than 3 routes | notice visible, two routes rendered |
| E2E-08 | Blocked and incomplete fallback | `all_blocked` scenario → `fallback_level="no_safe_route"`, banner "No safe route…", least-bad route flagged "Not confirmed safe" (never "Recommended"); `all_incomplete` scenario → `fallback_level="incomplete_data"` with its own banner; mixed scenario ranks eligible first, then incomplete, then blocked |
| E2E-09 | Mobile | bottom sheet snap points, slider reachable, popup becomes bottom card, no horizontal scroll at 360 px |
| E2E-10 | Keyboard and screen-reader semantics | tab order, focus not hidden by sheets, `getByRole` for all main controls |
| E2E-11 | Accessibility | axe scan (no serious/critical violations) on empty, loading, results, error, slider-open states |
| E2E-12 | Cold start | delayed first response → "Waking up the server" message after 5 s, then success |
| E2E-13 | Production smoke | on the hosted URL: health, one real analysis for a short trip, results render, no key in bundle |

Fixture scenarios: `clear` (all Low/Moderate), `snow_corridor` (Severe on one route), `wind_load` (High wind where load rules matter: same trip with 35,000 vs 45,000 lb), `fewer_routes`, `all_blocked`, `all_incomplete` (every route has ≥1 unknown checkpoint, none blocked), `weather_partial`, `weather_down`, `slow_start`.

## 8. Performance and quality checks

| ID | Check | Pass criterion |
|---|---|---|
| TS-PERF-01 | Domain analysis of a 3,000-mile fixture (3 routes, 10 mi) | < 500 ms excluding I/O |
| TS-PERF-02 | Analyze API with warm cache (fixtures) | p95 < 3 s locally |
| TS-PERF-03 | Slider drag, 600 points | ≥ 50 fps average, no long task > 50 ms (Playwright trace / rAF sampling) on desktop; recorded numbers on throttled CPU (4×) |
| TS-PERF-04 | Bundle | entry ≤ 250 KB gzip; map chunk separate; report in CI |
| TS-PERF-05 | Lighthouse mobile on results screen | perf ≥ 85 and accessibility ≥ 90 as targets (reported, not gated; map WebGL skews performance) |
| TS-A11Y-01 | `contrast_checker.py` on token pairs | all ≥ AA |
| TS-A11Y-02 | `a11y_scanner.py` + axe | 0 critical/major open |
| TS-QA-01 | `adversarial-reviewer` on each milestone diff | no BLOCK verdicts open |

## 9. Deployment smoke tests (M7)

1. `curl /api/health` → 200 (and note cold-start time).
2. CORS preflight from the production frontend origin succeeds; a foreign origin fails.
3. One real analysis (short trip, interval 50) returns three routes or the fewer-routes warning; check `meta.routing_provider`.
4. Production bundle scanned for key strings; response headers checked (`X-Request-ID`, gzip, no `Server` secrets).
5. `ship-gate` scan clean or exceptions documented; `pip-audit` and `npm audit` reviewed.
6. Playwright E2E-13 against the production URL; manual check on a real phone.

## 10. Acceptance criteria → tests

| AC | Tests |
|---|---|
| AC-01 | TS-UI-01, TS-API-02, E2E-05 |
| AC-02 | TS-SEL-*, TS-RT-02/03, TS-API-03, E2E-01/07 |
| AC-03 | TS-CP-01..06 |
| AC-04 | TS-WM-*, TS-ETA-INT-01 |
| AC-05..07 | TS-RK-01..04 |
| AC-08..10 | TS-LD-* |
| AC-11 | TS-RK-05 |
| AC-12 | TS-RANK-* |
| AC-13 | TS-ELIG-*, E2E-08 |
| AC-14 | TS-UI-02..04, E2E-02/03 |
| AC-15/16 | TS-HM-*, TS-UI-05, E2E-04 |
| AC-17 | TS-RT-04, TS-WX-02, TS-API-04, TS-UI-06, E2E-06 |
| AC-18 | M7/M8 checklist (`08`) |
| AC-19 | TS-API-08 |
| AC-20 | TS-UI-05, E2E-04 |

## 11. CI

GitHub Actions: backend (ruff, mypy on `domain/`, pytest with coverage gate), frontend (eslint, tsc, vitest, build + size report), Playwright against fixture backend on pull requests; secrets only for the manual production smoke job. All steps are fast enough to run on every push (targeted subsets locally).
