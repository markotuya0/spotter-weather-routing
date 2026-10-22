# 08 — Execution Plan

Budget: **16 working hours maximum over at most 4 days.** The plan totals **16.0 h including a 0.55 h contingency** (reduced from 0.75 h in Phase 1B to fund the eligibility-policy and weather-dedup scope added by that review, §1), with deployment and the Loom reserved (1.5 h). Skills: `spec-driven-workflow` (scope control), `tdd-guide` (test-first slices), `adversarial-reviewer` (milestone reviews), `ship-gate` (deploy gate).

Timing was a point in your previous feedback, so every milestone has a time box, a gate, and a pre-agreed cut line (§5). Estimates assume one developer working with Claude Code; they include writing tests.

## 1. Task list (dependency ordered)

| # | Task | Depends | Est. (h) | Gate output |
|---|---|---|---|---|
| **M0** | **Gate 0: keys and provider spike** | approval | **1.00** | |
| 0.1 | Create TomTom key (and HERE key only if TomTom fails); `.env`, `.env.example`, secrets hygiene | — | 0.10 | keys in env, none in git |
| 0.2 | Spike script (throwaway, not committed as app code): run the Gate 0 checklist (§4.1) against TomTom truck mode on the 7-trip table of `03` §2.1 | 0.1 | 0.40 | checklist verdict + decision TomTom vs HERE |
| 0.3 | Weather spike: verify per-location rate counting (one 100-location request; observe), URL/response size, null behaviour | — | 0.15 | measured budget |
| 0.4 | Record fixtures (real responses, keys stripped); confirm OpenFreeMap tiles load and terms | 0.2 | 0.20 | `tests/fixtures/*` |
| 0.5 | Repo scaffold: Django project, Vite React TS app, lint/format/test configs, CI skeleton, README stub | — | 0.15 | repo builds, empty tests pass |
| **M1** | **Domain engine (test-first)** | M0 | **3.60** | |
| 1.1 | Models, geo (haversine, point-at-distance, RDP, polyline), checkpoints | 0.5 | 0.80 | TS-CP, TS-AG-01 |
| 1.2 | Risk table, classify (raw-value, `Decimal`-safe), display-rounding helper, load rules, checkpoint level | 0.5 | 0.80 | TS-RK, TS-LD (100% branch) |
| 1.3 | ETA, forecast matching | 1.1 | 0.60 | TS-ETA, TS-WM |
| 1.4 | Aggregation, **eligibility policy (new module, separate from ranking)**, ranking (PDF's 4 keys only), reasons, fallback ladder | 1.2, 1.3 | 0.80 | TS-AG, TS-ELIG, TS-RANK |
| 1.5 | Route selection, heatmap builder, risk segments | 1.1–1.4 | 0.60 | TS-SEL, TS-HM |
| **Gate G1** | domain tests green, coverage gate, `adversarial-reviewer` on `domain/` | | (in tasks) | no open BLOCK |
| **M2** | **API and providers** | M1, M0 | **2.35** | |
| 2.1 | Provider adapters (TomTom routing + geocoding, Open-Meteo, fixture doubles), HTTP client (timeouts/retries/redaction) | 0.4, 1.* | 0.90 | TS-RT, TS-WX, TS-UNIT |
| 2.2 | Orchestration service, weather chunking/limiter/cache, budget logic, **`weather_samples` dedup keying** | 2.1 | 0.70 | TS-ETA-INT-01, TS-API-08 |
| 2.3 | DRF serializers/views/error envelope/throttles/CORS/settings; OpenAPI check | 2.2 | 0.50 | TS-API, TS-SEC |
| 2.4 | Real end-to-end run with live providers on 3 trips; save golden outputs | 2.3 | 0.25 | live proof |
| **Gate G2** | API integration tests green, one live analysis works, `adversarial-reviewer` | | | |
| **M3** | **Frontend foundation** | M2 | **1.75** | |
| 3.1 | Theme/tokens/fonts, layout shells (desktop/tablet/mobile), API client + types, TanStack Query mutation with abort | 0.5 | 0.60 | shell renders |
| 3.2 | Trip form + geocode autocomplete + validation + states | 3.1, 2.3 | 0.75 | TS-UI-01 |
| 3.3 | Results panel: recommendation, route cards, ribbon, compare table, warnings/errors | 3.1 | 0.40 | TS-UI-02/03/06 |
| **M4** | **Map, routes, checkpoints** | M3 | **2.25** | |
| 4.1 | MapLibre lazy chunk, basemap, route layers, endpoints, fit, selection sync | 3.3 | 0.90 | E2E-01/02 |
| 4.2 | Checkpoint layer (icons, declutter), popup / mobile card, checkpoint table + drawer, selected-route risk segments | 4.1 | 0.90 | TS-UI-04, E2E-03 |
| 4.3 | Mobile bottom sheet + tablet drawer behaviours | 4.1, 3.* | 0.45 | E2E-09 |
| **Gate G3** | Journey works end to end locally with live providers; adversarial review of frontend diff | | | |
| **M5** | **Heatmap and slider** | M4 | **1.50** | |
| 5.1 | Heatmap layer + legend + unknown handling | 4.1, 1.5 | 0.60 | TS-HM, E2E-04 |
| 5.2 | Slider (keyboard, play, aria, live region) + 15-min feature-state vs setData spike | 5.1 | 0.50 | TS-UI-05, N-01 measured |
| 5.3 | Stretch S-01 lateral corridor points (only if on schedule) | 5.1 | 0.40 | **cuttable** |
| **M6** | **QA, accessibility, performance, polish** | M5 | **1.50** | |
| 6.1 | Playwright suite (E2E-01..12), fixture scenarios | M4, M5 | 0.60 | green on desktop + mobile |
| 6.2 | a11y pass (`a11y-audit`, axe, contrast), keyboard pass | 6.1 | 0.30 | no critical/major |
| 6.3 | Performance measurement + fixes (bundle, slider, payload) | 6.1 | 0.30 | N-01..N-03 recorded |
| 6.4 | Visual consistency pass at 360/768/1280, copy review | 6.1 | 0.30 | screenshots reviewed |
| **M7** | **Deploy and smoke** | M6 | **0.75** | |
| 7.1 | Render API + static SPA, env vars, CORS, health, cold-start check | 6.* | 0.35 | live URL |
| 7.2 | `ship-gate`, audits, smoke tests (E2E-13), real-phone check | 7.1 | 0.40 | AC-18 (2) |
| **M8** | **Docs and Loom** | M7 | **0.75** | |
| 8.1 | README (setup, architecture, risk rules, assumptions, limits, provider terms), API docs link | — | 0.30 | |
| 8.2 | Loom rehearsal + recording (5–10 min) | 7.* | 0.45 | AC-18 (3) |
| — | **Contingency** | | **0.55** | |
| | **Total** | | **16.00** | |

Sum check: 1.00 + 3.60 + 2.35 + 1.75 + 2.25 + 1.50 + 1.50 + 0.75 + 0.75 + 0.55 = **16.00 h**. Task 5.3 (0.40 h) is inside M5's 1.50 h only if everything else is on time; otherwise it is dropped and its time returns to contingency. Phase 1B added 0.20 h of real new scope (the eligibility module in 1.4, `weather_samples` dedup in 2.2); it is funded by reducing contingency from 0.75 h to 0.55 h, not by growing the 16 h budget — if that proves too tight, S-01 (`08` §5 C-0) is the first thing to go, as already planned.

## 2. Critical path

`M0 provider decision → provider adapters (2.1) → orchestration (2.2) → API (2.3) → frontend API client (3.1) → map (4.1) → checkpoints (4.2) → heatmap/slider (5.*) → QA (6.*) → deploy (7.*) → Loom (8.2)`.
Parallelisable if you want to compress calendar time: M1 (domain) and 3.1 (theme/layout shells, which need only the contract in `04`) can run concurrently; M3's form/cards can be built against the fixture response while M2 finishes.

## 3. Suggested schedule (≤ 4 days; calendar, not extra hours)

| Day | Content | Hours |
|---|---|---|
| 1 | M0, M1 | 4.6 |
| 2 | M2, M3 | 4.1 |
| 3 | M4, M5 | 3.75 |
| 4 | M6, M7, M8, contingency | 3.55 |

## 4. Milestone acceptance gates (must pass to continue)

| Gate | Must be true |
|---|---|
| G0 | See the explicit TomTom validation checklist below. **If not met**, switch provider (HERE) once (cost ≤ 0.5 h) and re-run the checklist; if still failing, trigger scope item C-1 (§5) and tell you. |
| G1 | All domain tests green, 100% branch coverage on `domain/`, every `05` §11 case present, adversarial review clean |
| G2 | API tests green; one live analysis with real providers produces plausible numbers (hand-verify 3 checkpoints: ETA, matched hour, level) |
| G3 | A user can plan a trip, see 3 routes + recommendation + checkpoints on a map on desktop and phone width |
| G4 (after M5) | Slider produces zero network calls; ≥ 50 fps measured or documented mitigation |
| G5 (after M6) | E2E suite green, a11y no critical/major, bundle and perf numbers recorded |
| G6 (after M7) | Hosted URL passes smoke tests from a clean browser and a phone; `ship-gate` clean or exceptions listed |
| G7 | Loom recorded 5–10 min, README complete |

### 4.1 Gate 0 provider validation checklist — TomTom (run in task 0.2, ≤ 0.40 h)

Each row is checked against the live spike's 7-trip table (`03` §2.1) with the user's TomTom key. A row is **PASS** / **PARTIAL** / **FAIL**; overall G0 verdict rules follow the table.

| # | Check | Method | PASS criterion | On FAIL |
|---|---|---|---|---|
| 1 | Alternative routes | `maxAlternatives=5` on all 7 spike trips; count distinct routes after dedup/detour filtering (`05` §2) | ≥ 3 distinct routes on ≥ 4 of 7 trips | Re-run with `maxAlternatives` raised to its max (5) if not already; if still failing, this is the **hard trigger** to switch to HERE (D-05) |
| 2 | Geometry | Inspect the response's route geometry field (points/legs) | Resolution sufficient that RDP-simplified cumulative distance error ≤ 0.1 mi per 25 mi segment (sanity check against the response's own `summary.lengthInMeters`) | Fall back to coarser checkpoint-position interpolation only (no change to API shape); document the error bound in README |
| 3 | Distance & duration | Read `summary.lengthInMeters`, `summary.travelTimeInSeconds` (or TomTom's actual field names) on each returned route | Present on every route; sum of leg distances matches the summary within 1% | If absent, compute distance from geometry (haversine) as fallback — slower, still correct |
| 4 | Truck-routing support | Send `travelMode=truck` (or documented equivalent) with `vehicleWeight`/`vehicleLength/Width/Height` params on ≥ 2 spike trips | HTTP 200, no parameter-rejection error | If truck mode errors, fall back to car profile with a disclosed limitation (ASSUMPTION, needs your approval before use — this is a scope change, not silent) |
| 5 | Quota / rate limits | Check response headers (`X-RateLimit-*` or account dashboard) and the free-tier numeric cap | Monthly cap ≥ 20K as advertised; a documented per-second/per-minute rate exists so the backend's own throttle (`03` §9) can be set below it | If materially lower, lower `TRIP_LIMITS`/DRF throttle accordingly and note it in README as a live constraint, not a bug |
| 6 | Failure behaviour | Deliberately send: invalid coordinates, an origin/destination with no drivable route (e.g. mid-ocean), and a bad/omitted key | Each returns a structured JSON error with a distinguishable HTTP status, so `providers/routing/tomtom.py`'s error mapping (`04` §5.3) can be built from real shapes, not guesses | If errors are unstructured/opaque, pin the exact status+body seen and map conservatively to `ROUTING_UNAVAILABLE`/`UPSTREAM_TIMEOUT` |

**Overall G0 verdict:** PASS (continue with TomTom) requires rows 1, 3, and 4 at PASS. Row 1 at FAIL is the sole trigger for an immediate HERE re-test (no other row failing forces a provider switch on its own). Rows 2, 5, 6 at PARTIAL are acceptable — they change a config value or a fallback behaviour, not the provider decision — and are recorded as PARTIAL in `docs/worklog.md` with the measured number, never silently assumed to meet the Phase 1 estimate. The checklist and its verdict are the first fixture committed (`tests/fixtures/gate0_tomtom.json` + a one-paragraph `docs/gate0-result.md`), so a reviewer can see exactly what was measured before any application code was written.

## 5. Scope reduction strategy (cut in this order)

| Order | Cut | Saves | What remains |
|---|---|---|---|
| C-0 | S-01 lateral corridor points | 0.40 h | along-route heatmap (still real data) |
| C-1 | Autocomplete suggestions → geocode on submit only | 0.50 h | place search by Enter/button |
| C-2 | Compare table (keep cards with ribbon + reasons) | 0.30 h | cards still show all ranking keys |
| C-3 | Playback animation, tablet-specific drawer (use mobile sheet pattern) | 0.30 h | slider + keyboard |
| C-4 | Lighthouse polish, mutation testing | 0.30 h | recorded measurements |
| C-5 | HERE fallback adapter (do not implement unless G0 fails) | 0.60 h | TomTom only |
| Never cut | domain rules and tests, 3-route selection, ETA-based weather, recommendation order, heatmap with slider, error states, accessibility basics, deploy, Loom |

Rule: if a milestone overruns by > 25% of its time box, stop adding scope, use contingency, then cut from the list above. Time is tracked per task in a `docs/worklog.md` (one line per task: start, end, notes) so the 16 h claim is auditable.

## 6. Reserved time and deliverables

- Deployment 0.75 h and Loom 0.75 h (incl. README 0.30 h) are **never borrowed** by earlier milestones.
- Loom script (5–10 min): 1 min problem and input; 2 min results and recommendation reasoning on a trip where the safest route is not the fastest; 2 min checkpoints, ETAs, load rule demo (same trip at 25,000 vs 45,000 lb); 1.5 min heatmap and slider; 1.5 min architecture and risk engine tests; 1 min limits (free weather quota, forecast model data, assumptions) and what you would do next.
- Repository: public GitHub repo, `README.md`, `docs/` planning set, `.env.example`, no secrets, third-party skills excluded (`.claude/skills/` ignored).

## 7. Approvals needed before M0 starts

1. Plan approval (this document set).
2. Decisions in `09` §4 (Q-01 … Q-08).
3. You create the TomTom API key (no credit card) and, only if needed later, a HERE key; provide them via local `.env` — never in chat or git.
4. Choice of hosting accounts (Render for API is assumed; static host choice).
