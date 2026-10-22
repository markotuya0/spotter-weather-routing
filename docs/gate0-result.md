# Gate 0 — Provider Validation Result

Run date: 2026-10-22. Provider under test: **TomTom** (Routing `calculateRoute` v1, truck mode). HERE was not tested — TomTom passed the hard trigger (row 1), so D-05's HERE re-test condition was not met. Raw responses (2–5 MB each) are not committed; the condensed evidence with route-level summaries and the three failure-case bodies is at `tests/fixtures/gate0_tomtom.json`. Credentials never appear in any saved output (checked by grep against the live key before writing this file).

Request shape used on all 7 trips: `maxAlternatives=5&travelMode=truck&vehicleWeight=18000&vehicleLength=16.5&vehicleWidth=2.6&vehicleHeight=4.0&vehicleCommercial=true`. Note: `vehicleLoadType=otherGoods` was tried first and rejected with `BAD_INPUT: Invalid vehicleLoadType` — the param was dropped; TomTom's accepted load-type enum needs checking against docs before `providers/routing/tomtom.py` is written (not blocking, since the param is optional).

## Checklist results

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | Alternative routes | **PASS** | ≥3 distinct routes on 6 of 7 trips (Denver→Omaha 4, LA→Phoenix 6, Chicago→Atlanta 6, Seattle→SLC 6, Dallas→Houston 6, NYC→Boston 6; Boston→LA long-haul only 2). Criterion (≥3 on ≥4 of 7) exceeded. Distinctness confirmed, not assumed: a geometric-overlap sample on Denver→Omaha and Chicago→Atlanta (200-point resample, 500 m match threshold) found pairwise overlap fractions of 0.01–0.18 — genuinely different roads, not near-duplicates. |
| 2 | Geometry | **PASS** | Point spacing avg 66–164 m, max local gap ≤2.6 km, across all 7 trips' primary route. Haversine-summed cumulative distance vs. provider's own `summary.lengthInMeters` differs by 0.05–0.18% on every trip — well inside the ≤0.1 mi/25 mi (0.4%) bound. |
| 3 | Distance & duration | **PASS** | `summary.lengthInMeters` and `summary.travelTimeInSeconds` present on all 38 returned routes across the 7 trips (4+6+6+6+6+6+2). Single-leg responses throughout, so leg-sum vs. summary is trivially exact (0% delta). |
| 4 | Truck-routing support | **PASS** | All 7 trips returned HTTP 200 with `travelMode=truck` + vehicle dimension/weight params; no parameter-rejection error once the invalid `vehicleLoadType` value was removed. |
| 5 | Quota / rate limits | **PARTIAL** | Official pricing page (fetched live) confirms **20K requests/month free** for the Routing API — matches the Phase-1 architecture assumption and meets the ≥20K criterion. No per-second/per-minute rate limit is documented on that page, and no `X-RateLimit-*` response headers were present on any call (only `x-tomtom-attempt-count`, `x-tomtom-upstream-service-time`, `x-tomtom-processed-by`). Third-party sources disagree (some describe a 2,500/day cap, possibly describing a different legacy plan or a stale page) — monthly cap is DOCS-confirmed, per-second throttle setting is not, so `03` §9's backend throttle will be set conservatively (≤2 req/s) pending an account-dashboard check, not blocking. |
| 6 | Failure behaviour | **PASS** | All three deliberate failure cases returned structured JSON with distinguishable HTTP status: invalid coordinates (999,999) → 400 `{"detailedError":{"code":"BAD_INPUT",...}}`; mid-ocean origin (40,-40)→(41,-41), no drivable route → 400 `{"detailedError":{"code":"MAP_MATCHING_FAILURE","message":"...Origin (40, -40)"}}`; bad key → 401 `{"detailedError":{"code":"Unauthorized",...}}`. Each maps cleanly to a distinct `providers/routing/tomtom.py` error branch (`ROUTING_UNAVAILABLE` for `MAP_MATCHING_FAILURE`, `VALIDATION` for `BAD_INPUT`, auth failure for 401). |

**Overall G0 verdict: PASS.** Rows 1, 3, 4 (the hard-requirement rows) are all PASS. Row 5 is PARTIAL per the pre-agreed rule (acceptable — changes a throttle config value, not the provider decision).

## Weather (Open-Meteo) assumption re-check

Re-verified live against the architecture doc's (`03` §2.2) claims, not re-litigated from scratch:

- `wind_speed_unit=mph`, `precipitation_unit=inch` on the request → response `hourly_units` confirms `wind_speed_10m`/`wind_gusts_10m` in `mp/h`, `rain`/`showers`/`snowfall` in `inch` (snowfall correctly follows the precipitation unit override, not its cm default). **Confirmed.**
- `timeformat=unixtime` → integer unix timestamps in `hourly.time`. **Confirmed.**
- 100-location batched request (the planned per-request chunk size) returned HTTP 200 in 2.65 s, 198 KB. **Confirmed workable** — no need to re-run the earlier ~750-location rate-limit-exhaustion test; the chunking/limiter design in `03` §2.2 is unaffected.
- Multi-location requests return an array of per-location result objects (indexed by request order). **Confirmed**, matches the dedup/keying design in `08` task 2.2.

No change to the weather architecture or assumptions is needed.

## Confirmed capabilities

- **Routing provider: TomTom**, truck mode, via `calculateRoute` v1 with `maxAlternatives=5`.
- Up to 6 alternative routes returned per trip (provider cap), genuinely geometrically distinct.
- Full route geometry at ~100 m average resolution, sufficient for RDP simplification and checkpoint placement without a coarser fallback.
- Distance/duration always present at the route-summary level.
- Truck vehicle-dimension parameters accepted without error.
- Structured, status-coded error bodies for all three tested failure modes.
- Weather units, time format, and batching assumptions hold as designed.

## Remaining risks

- **Per-second/per-minute TomTom rate limit is unconfirmed** (row 5). Mitigation already planned: set the backend throttle conservatively below any plausible limit; revisit once the account dashboard is checked or a 429 is observed.
- **Boston→LA (long-haul, ~3,000 mi) only returned 2 routes.** This is the honest-degradation case the design (A-03, AC-02) already plans for — show fewer than 3 with a notice — not a new problem, but confirms it will actually trigger on real long-haul trips, not just in theory.
- `vehicleLoadType` enum is undocumented/narrower than assumed; `providers/routing/tomtom.py` should simply omit it (it is optional) rather than guess a value.
- HERE was not tested (not triggered) — if a future regression drops TomTom's alternative-route count, the HERE fallback adapter (`C-5`) is still unbuilt and would cost the full 0.60 h budgeted for it.

## Architecture change needed?

**No.** TomTom is confirmed as primary with no fallback needed; the only adjustment is a conservative initial throttle value pending rate-limit confirmation, which is a config value, not a design change.

## Recommendation

**Proceed to M1** (domain engine) on the plan as written. TomTom is confirmed; weather assumptions hold; no scope or architecture change required.
