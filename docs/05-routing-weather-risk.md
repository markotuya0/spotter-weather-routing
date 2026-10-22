# 05 — Routing, Weather and Risk Logic

This document is the executable specification for `backend/domain/` (the 40%-weight part of the assessment). Everything here is pure functions over plain data. Skills: `spec-driven-workflow`, `tdd-guide` (tests first, table-driven + property-based), `strict-api` (provider facts in `03` §2).

Legend: **[PDF]** rule stated in the assessment. **[ASSUMPTION]** needs approval (`01` §6). **[CHOICE]** implementation detail with no behavioural ambiguity.

## 1. Pipeline

```
provider routes (≤6) → select ≤3 distinct → per route: geometry, distance D, duration T
 → checkpoints at I-mile spacing (+ destination) → ETA per checkpoint
 → hourly forecast per unique point → sample at ETA (raw, full precision)
 → classify wind/rain/snow on the raw value → apply load rules on the raw value → checkpoint level
 → attribute miles → miles_by_level, average_risk
 → eligibility (blocked / incomplete / eligible, §8) → rank within tier (PDF's 4 keys, §9) → recommendation (+ transparent fallback)
 ‖ heatmap: same sampling + classification at departure + h, h = 0..48 (never re-run by slider movement)
 ‖ display: round raw values for presentation only, after classification has already happened
```

## 2. Route alternatives [R-RT-01]

1. Request `max_alternatives` from the provider (TomTom: `maxAlternatives=5` → up to 6 routes; HERE: `alternatives=6` → up to 7 routes, capped to the first 6 for processing). The provider's first route is "provider best", `provider_index = 0`.
2. Drop **duplicates**: route B is a duplicate of an already-kept route A if `overlap(B, A) ≥ 0.95` **[CHOICE]**, where
   `overlap(X, Y)` = fraction of X's length whose points (sampled every 1 mile along X) lie within 0.5 mi of polyline Y (grid-hashed nearest-vertex test on Y densified to ≤0.25 mi).
3. Drop **detours**: candidates with `duration > 1.5 × fastest` or `distance > 1.5 × shortest` **[CHOICE, configurable]** — a route that long is not a realistic alternative.
4. Select up to 3: keep provider best; then greedily add the candidate with the lowest maximum overlap against the already-selected routes; ties broken by lower duration, then provider order.
5. If fewer than 3 remain, return them and warning `ROUTES_FEWER_THAN_3` [A-03]. If none: `NO_ROUTE`.
6. IDs `r1..r3` are assigned in **provider order of the selected routes** (before ranking), so they are stable for a given provider response. `rank` is assigned afterwards (§9).
7. Provider distance and duration are authoritative for `D` and `T`; geometry is used for positions only.

Why this design: live tests showed providers return 1–3 alternatives depending on the trip (`03` §2.1). Selection by overlap guarantees the routes shown are different roads, not three copies of one.

**Filtering policy and weather-blindness (M1 closeout review, 2026-10-22):** selection runs on §1's pipeline *before* checkpoints/weather exist — it cannot know which candidate is safest, only which are geometrically distinct and not unreasonable detours. This is intentional, not an oversight: computing full checkpoint/weather risk for up to 6 raw provider candidates (instead of the ≤3 selected) to pick on risk would multiply weather-provider calls 2× with no PDF requirement to do so, and the PDF's own framing ("provide alternative routes," `01` traceability) is about choice among reasonable routes, not an exhaustive risk search over every path the provider can return. Three properties bound the actual risk of discarding something materially safer:
1. **Provider best is unconditionally kept** regardless of the detour filter (§2.4; `test_provider_best_always_kept_even_if_it_would_be_a_detour_outlier`), so the seed route is never lost to this policy.
2. **The detour filter's `fastest`/`shortest` reference is computed over the full original candidate pool, including routes later dropped as duplicates** — not recomputed over the deduped survivors — so a very fast near-duplicate still tightens the detour bound for the routes competing against it (`test_detour_fastest_reference_uses_full_original_pool_not_deduped_pool`, added in this review). Using the deduped-only pool would silently loosen the filter and let a true detour through.
3. **The 1.5× factor is deliberately generous [CHOICE, configurable]**: a route that takes 50%+ longer or is 50%+ further is excluded because the PDF asks for "alternative routes," not a brute-force scan of every possible detour a provider could construct to dodge weather at arbitrary cost in time — a user is not well served by a "safer" route that doubles their trip. If the user's sign-off (`01` §7) wants a looser factor to surface more weather-driven detours, `DETOUR_FACTOR` (§12) is one constant to change; no code restructuring is required.

## 3. Checkpoints [R-WX-01]

Inputs: route geometry (list of points), provider distance `D` miles, interval `I ∈ {10, 25, 50}`.

1. Compute cumulative haversine distance along the geometry; scale all cumulative values by `D / geometry_length` so the last vertex is at exactly `D`.
2. Checkpoint distances: `d_k = k·I` for `k = 0, 1, …` while `d_k < D`; then append `D`. (If `D` is an exact multiple of `I`, the final regular checkpoint is `D` itself and no duplicate is added.)
3. Therefore: index 0 is the origin, the last checkpoint is the destination, and `n = floor((D − ε)/I) + 2` checkpoints (ε = 1e-9).
4. Position at distance `d`: binary-search the segment `[c_j, c_{j+1}] ∋ d`, linear interpolation of lat/lng (segments are short; error negligible). Zero-length segments are skipped.
5. Examples: `D=100, I=25 → [0,25,50,75,100]` (AC-03); `D=101, I=25 → [0,25,50,75,100,101]`; `D=8, I=10 → [0,8]`; `D=100, I=10 → 11 checkpoints`.
6. Checkpoints keep full float distance; display rounds to 0.1 mi.

## 4. ETA and forecast matching [R-WX-02, D-01, D-02]

### 4.1 ETA

`ETA(d) = departure + time_at(d)`.
- Default time profile: `time_at(d) = T · d / D` (constant average speed). `ETA(D) = departure + T` exactly. **[ASSUMPTION A-06]**
- If the provider supplies cumulative knots `(d_i, t_i)` (Gate 0 decides), `time_at` is piecewise-linear over those knots, with `(0,0)` and `(D,T)` enforced.
- All internal times are UTC; the browser localises for display [A-10]. The departure in the request is converted to UTC on receipt.

### 4.2 Forecast series

Weather is looked up at the checkpoint coordinates **snapped to a 0.05° grid** (about 3.5 miles). This lets shared road sections and cache entries collapse and stays below the forecast model's own resolution; the response still reports the checkpoint's true coordinates. Each point has hourly UTC timestamps `h_i` (hour starts at :00) and arrays `wind_speed_10m` (instant), `rain`, `showers`, `snowfall` (each a **sum over the hour ending at its timestamp**, per Open-Meteo docs). Requested units: mph and inch.

### 4.3 Sampling rule at arrival time `t`

Let `h0 = floor_hour(t)`, `h1 = ceil_hour(t)` (`h1 = h0` if `t` is exactly on the hour).
- **Wind (instantaneous):** linear interpolation between `wind(h0)` and `wind(h1)` weighted by `(t − h0)/1h`.
- **Rain and snow (preceding-hour sums):** use the hour **ending at `h1`**, i.e. the interval `(h1 − 1h, h1]` which contains `t`. `rain_rate = rain(h1) + showers(h1)` and `snow_rate = snowfall(h1)`. The depth of a one-hour sum equals an inch-per-hour rate.
- If any value needed is missing or `null`, or `h0`/`h1` is outside the returned series → sample is **unknown** with reason `provider_error` or `beyond_forecast` (never zero).
- The response reports `wind_time_used = [h0, h1]` and `precip_bucket_end = h1` (AC-04).

Worked example: ETA 14:20Z, wind(14:00)=30.0, wind(15:00)=36.0 → wind = 32.0 mph; rain/snow from the 15:00 value.

### 4.4 Precision handling [A-02, D-03] — classify raw, round only for display

**Classification and load-rule evaluation use the unrounded, full-precision value** produced by §4.3 (interpolated wind; summed rain/snow). Rounding is **display-only**: when a value is returned for the user to read (`weather_samples[*].wind_mph` etc., `06` tooltips), it is rounded half-up — wind to 0.1 mph, rain to 0.01 in/hr, snow to 0.1 in/hr — but that rounded figure never feeds back into `risk.classify()` or `risk.apply_load_rules()`.

Comparisons against the threshold table (§5) are done in `Decimal`, constructed as `Decimal(repr(raw_float))` (full precision of the float's own decimal representation, not a rounded approximation) against `Decimal` threshold constants. This avoids two failure modes at once: (a) throwing away precision by rounding before comparing (a raw 24.96 mph no longer silently becomes "25.0 → Moderate"; it correctly stays Low until it is actually ≥ 25), and (b) binary-float drift across an exact decimal boundary (comparing `float` 0.1 directly against a `float` 0.10 threshold is safe in Python because both parse to the same IEEE-754 value, but intermediate sums like `rain + showers` can land a hair below/above a boundary purely from floating-point addition order; `Decimal(repr(...))` on the *final* summed value, compared against `Decimal` thresholds, removes that class of bug without inventing a tolerance/epsilon).

Consequence the UI must disclose: because display rounding happens *after* the level is decided, a displayed figure can sit exactly on a boundary without "looking like" the level shown (e.g. a raw 34.996 mph classifies Moderate but rounds for display to "35.0 mph", which a user might expect to read as High). `06` §5 adds a tooltip on checkpoints within 0.05 of a threshold: "Classified at the measured value before rounding for display." The full-precision raw value is available via `risk.raw_value` in the API (`04` §4) for anyone auditing a specific checkpoint. This replaces the Phase 1 "round before classify" rule (previously D-16/A-02) and removes the rounding-order ambiguity it created (previously tracked as review finding F-02) — there is no longer a "before or after load rules" question, because rounding is not part of classification at all.

Values below 0 are treated as invalid provider data (`unknown`), not clamped.

## 5. Thresholds [R-RK-02..04]

Single table-driven definition (`risk.py`):

| Condition | Moderate | High | Severe | No Travel |
|---|---|---|---|---|
| Wind (mph) | ≥ 25 | ≥ 35 | ≥ 45 | ≥ 55 |
| Rain (in/hr) | ≥ 0.10 | > 0.25 | > 0.50 | > 1.00 |
| Snow (in/hr) | ≥ 0.5 | > 1.0 | > 2.0 | > 3.0 |

Below the Moderate bound → Low. Evaluate from No Travel downward; first satisfied bound wins.

Interpretation [ASSUMPTION A-02]: wind rows are integer ranges that tile the number line (`25–34`, `35–44`, …), so each bound is "≥ lower". For rain and snow the PDF writes ranges that touch (`0.10–0.25`, `0.25–0.50`) and states No Travel as strictly `>1.00` / `>3.0`; the consistent reading is that interval **upper bounds are inclusive** (`High = (0.25, 0.50]`), so 1.00 in/hr is Severe and 1.01 is No Travel. These bounds are compared directly against the raw, full-precision value (§4.4) — not a rounded one. Exact boundary values are the only inputs where the alternative reading differs; every boundary is tested (§11) and the table is one constant to change.

## 6. Load rules [R-LD-01..03, D-04]

Let `w` be the normalised wind, `L` the load in lb, `base = classify_wind(w)`.

| Rule | Condition | Effect |
|---|---|---|
| `wind_ge_55` | `w ≥ 55` | No Travel (already the table result; any load) |
| `wind_45_54_over_30000` | `45 ≤ w < 55` and `L > 30,000` | wind level = No Travel |
| `wind_35_44_over_40000` | `35 ≤ w < 45` and `L > 40,000` | wind level = Severe |

- Weight comparisons are strict (`>`), so exactly 30,000 and 40,000 lb do **not** trigger (AC-08/09).
- The effect is `wind_level = max(base, override)`; overrides only raise, never lower.
- Rain and snow are unaffected by load (the PDF attaches load rules to wind speeds only).
- Evaluate on the **raw, unrounded** wind value (§4.4) — e.g. 44.996 mph stays in the 35–44 band (eligible for the >40,000 lb Severe override) and does **not** enter the 45–54 band; only a value that is actually ≥45 (raw) enters it.
- A load over 40,000 lb in the 45–54 band is No Travel (it is also > 30,000).

**Checkpoint level** = max(wind_after_load, rain_level, snow_level). `drivers` = every condition whose level equals the checkpoint level (including `"wind (load rule)"` when an override produced it). Combinations of conditions are **not** escalated beyond the maximum — the PDF defines no combination rule, and none is invented.

## 7. Mile attribution and aggregation [D-05]

For checkpoints with distances `d_0 < … < d_{n-1}` (`d_0 = 0`, `d_{n-1} = D`):

```
lo_i = 0                 if i = 0     else (d_{i-1} + d_i) / 2
hi_i = D                 if i = n-1   else (d_i + d_{i+1}) / 2
miles_i = hi_i − lo_i
```
`Σ miles_i = D` by telescoping (property test). Example `D=100, I=25`: coverage 12.5 / 25 / 25 / 25 / 12.5.

- `miles_by_level[level] += miles_i` for each level including `unknown`.
- **Severe miles** = `miles_by_level[severe]`; **High miles** = `miles_by_level[high]`; **No Travel miles** = `miles_by_level[no_travel]`. No Travel miles are *not* added to Severe miles (they are a separate, stricter bucket; see §8).
- **Average risk** = `Σ(score_i · miles_i) / Σ(miles_i over known checkpoints)`, scores low 0, moderate 1, high 2, severe 3, no_travel 4. If no checkpoint is known, `average_risk = null`.
- A coarser interval means a coarser estimate of miles; the UI states the interval used.

## 8. Eligibility and safety policy [supersedes Phase 1 ASSUMPTION A-07/A-12 — now a separate step, not a ranking key]

The PDF defines four ranking priorities for comparing routes (§9) and separately defines a No Travel level, but never says how No Travel or missing data should affect *which* route is offered as the recommendation. Phase 1 answered that by prepending two extra keys (`incomplete`, `no_travel_miles`) to the ranking tuple. Per Phase 1B direction, that is now a **separate policy step**, run before ranking and never folded into the ranking tuple, so "the PDF's four priorities" refers to exactly four keys, unchanged, with no silent fifth or sixth key ahead of them.

1. `eligibility.assess(route) -> {status, reason}`, evaluated per route, checked in this order:
   - `status = "blocked"` if any checkpoint's level is `no_travel` (checked first; a route with both a `no_travel` checkpoint and an `unknown` checkpoint is `blocked`, not `incomplete`, because an unknown data point does not excuse the confirmed hazard elsewhere on the route).
   - else `status = "incomplete"` if any checkpoint's level is `unknown`.
   - else `status = "eligible"`.
2. `selection.partition_by_eligibility(routes) -> {eligible: [...], incomplete: [...], blocked: [...]}` — a pure grouping; order within each group is untouched until §9 ranks it.
3. **Recommendation selection** (transparent fallback ladder):
   - `eligible` non-empty → recommend `rank(eligible)[0]` (§9). `recommendation.fallback_level = "none"`.
   - else `incomplete` non-empty → recommend `rank(incomplete)[0]`, `recommendation.fallback_level = "incomplete_data"`, warning `INCOMPLETE_DATA_FALLBACK`, UI text "No route has complete weather data; showing the best available with partial data."
   - else (every route `blocked`) → recommend `rank(blocked)[0]`, `recommendation.fallback_level = "no_safe_route"`, warning `ALL_ROUTES_BLOCKED`, UI text "No safe route for this departure time and load.", `recommendation.blocked = true`.
4. `rank()` (§9) is called **once per non-empty group**, never across groups — it is not told that blocked or incomplete routes exist, so it cannot be tempted to compare a blocked route's severe-miles against an eligible route's. This is the literal meaning of "preserve the PDF's exact four-level priorities": those four keys decide order *inside* a tier; a separate, explicitly named and separately tested function decides which tier is reachable at all.
5. Display: all routes, in all groups, are still always returned (never hidden) and still get a single, total `rank` ordering for the route-card list — eligible routes first (internally ordered by §9), then incomplete, then blocked, each internally ordered by §9 — **except** that `recommendation.fallback_level` (not "is this route's rank 1") is the one authoritative signal of whether the top-ranked route is actually safe to recommend; the UI reads that field, never infers safety from rank alone.
6. The first blocked checkpoint (distance, ETA, driver) and the count/location of unknown checkpoints are exposed for display on any route in those groups.

## 9. Ranking — the PDF's exact four keys [R-REC-02, D-06]

Applied **within one eligibility tier at a time** (§8.4). Sort ascending by the tuple:

```
( severe_miles,         # PDF priority 1
  high_miles,           # PDF priority 2
  average_risk,         # PDF priority 3
  duration_seconds,      # PDF priority 4
  provider_index )       # deterministic tie-break; not a PDF key, used only once all four tie
```

- Miles are compared after rounding to 0.1 mi, `average_risk` after rounding to 0.01, `duration_seconds` as integer; rounding is half-up decimal. This is rounding of an *aggregate ranking key* for tie-stability only, unrelated to §4.4's rule that raw weather values are never rounded before classification — by the time `rank()` runs, every checkpoint already has its final level, and these keys are sums/means over levels and miles, not weather readings.
- Strict lexicographic order is what "Prefer 1, 2, 3, 4" means: a later key is consulted only when all earlier keys tie. "Balancing weather risk and travel time" [R-REC-01] is satisfied by the order: risk first, time as the last decisive key.
- `average_risk` is well-defined (never `null`) inside the `eligible` and `blocked` tiers, because both are complete by construction (§8.1: a route only lands in `blocked` or `eligible` if it has no `unknown` checkpoints at all — `incomplete` absorbs every route with any unknown checkpoint). Inside the `incomplete` tier, `average_risk` is computed over known checkpoints only (§7) and is `null` only in the edge case where *every* checkpoint on that route is unknown; such routes sort last within that tier by the `average_risk`-null rule, falling through to `duration_seconds`/`provider_index`.
- Trade-off note (SHOULD): when the recommended route is not the fastest, the UI states the extra time and the risk saved ("+42 min, avoids 24.5 Severe miles"). Computed from the keys, no new rule.
- **Reasons** are generated deterministically from whichever tier was ranked: find the first key where rank 1 differs from rank 2 in that tier; text = that key's values ("0.0 Severe miles vs 24.5 on Route 1"); if all keys tie, "Same risk and time as Route N". If the recommendation came from a fallback tier (§8.3), the reason text is replaced entirely by the fallback explanation — a fallback pick is never described as if it won on risk/time, because it did not compete against the routes that would have been safer.

Worked example (eligible tier, illustrative numbers; unchanged from Phase 1 except that no_travel/incomplete routes are never in this table — they were removed in §8, not ranked here):

| Route | severe | high | avg risk | duration | Rank |
|---|---|---|---|---|---|
| r1 | 24.5 | 10.0 | 1.21 | 8h 20m | 3 |
| r2 | 0.0 | 40.1 | 0.74 | 8h 40m | **1** |
| r3 | 0.0 | 40.1 | 0.74 | 8h 55m | 2 |
r2 beats r1 on severe miles despite more High miles; r2 beats r3 only at the last key (duration).

## 10. Heatmap data [R-HEAT-01/02, D-08/09]

- Points: the unique checkpoint locations across all selected routes (deduplicated at 0.05° ≈ 3.5 mi; routes sharing a road share points; `route_ids` records which). Stretch (S-01, `08` M5): lateral points ±15 mi from the recommended route at every second checkpoint if the weather budget allows, to give the corridor real width.
- For each point and each hour `h = 0..48` (49 values): `t = departure + h hours`; sample the forecast at `t` with the rule in §4.3, classify on the raw unrounded value (§4.4), apply load rules, record the score (0–4) or 255 for unknown. The heatmap uses the identical classification function as checkpoints — same raw-value rule, same thresholds, same load rules — so the two surfaces can never silently disagree.
- Weather window requested from the provider: UTC dates covering `[departure, max(departure + 48h, last ETA)]` plus one hour (so that `ceil_hour` buckets exist).
- The heatmap shows **conditions at a time**, whereas checkpoint risk shows **conditions when the truck arrives**. Both labels appear in the UI.
- Rendering rule (`06`): value = level at that point and hour; blending between nearby points is visual only. A point with unknown data is drawn hatched, never as Low.
- **Invariant:** the heatmap array is computed once, at analysis time, for all 49 hours. Moving the slider only changes which already-computed index `h` the client reads (`06` §6, `02` §2.5); it is a pure client-side array lookup. It never re-invokes `checkpoints`, `eta`, `risk`, `aggregate`, `eligibility`, or `ranking`, so `recommendation`, `routes[*].rank`, and `routes[*].checkpoints[*].risk` are byte-identical before and after any slider movement in the same session (frontend test: `TS-UI-05` asserts the `recommendation` object reference/value is unchanged after a slider drag).

## 11. Boundary and edge-case test catalogue (feeds `07`)

Table-driven tests (pytest `parametrize`, plus Hypothesis properties).

**Wind** (load 1 lb), raw unrounded input → level: 0, 24.9, 24.999999, 25.0, 25.000001, 34.9, 34.999999, 35.0, 44.9, 44.999999, 45.0, 54.9, 54.999999, 55.0, 80 → low, low, low, moderate, moderate, moderate, moderate, high, high, high, severe, severe, severe, no_travel, no_travel. Display-rounding is tested separately and asserted **not** to affect these results: a raw `34.996` classifies High and the same input's *displayed* value independently rounds to `35.0`; a test asserts both facts hold simultaneously (`risk.classify(34.996) == HIGH` and `format_display(34.996) == "35.0"`).
**Rain**: raw 0, 0.09, 0.099999, 0.10, 0.100001, 0.249999, 0.25, 0.25000001, 0.499999, 0.50, 0.50000001, 0.999999, 1.00, 1.00000001, 1.01 → low, low, low, moderate, moderate, moderate, moderate, high, high, high, severe, severe, severe, no_travel, no_travel. (Corrected 2026-10-22 per `09` §4 Q-10: the previous list placed `0.25` before `0.249999` and `0.50` before `0.499999`, a non-monotonic transcription slip that produced the wrong level for the smaller value in each pair. §5's upper-bound-inclusive rule is unchanged and is what this corrected list encodes: `0.25` and `0.499999` are both ≤ their bound and classify with the lower tier, matching `backend/tests/domain/test_risk.py::RAIN_CASES`.)
**Snow**: raw 0, 0.4, 0.499999, 0.5, 0.500001, 0.999999, 1.0, 1.000001, 1.999999, 2.0, 2.000001, 2.999999, 3.0, 3.000001, 3.1 → low, low, low, moderate, moderate, moderate, moderate, high, high, high, severe, severe, severe, no_travel, no_travel. (Same correction as rain, same date/reason: the previous list placed `1.0` before `0.999999` and `2.0` before `1.999999` and `3.0` before `2.999999`; matches `backend/tests/domain/test_risk.py::SNOW_CASES`.)
**Decimal-safety**: a value constructed as `0.1 + 0.2 + ...` summation chains that in raw IEEE-754 land a few ULPs off an exact threshold (e.g. a summed rain rate that binary-float arithmetic renders as `0.25000000000000006` for a true `0.25`) classifies identically to the exact `Decimal("0.25")` input — proves the `Decimal(repr(...))` comparison, not a float `==`/`>=`, decides the boundary.
**Load**: (w=45.0, L=30,000)→severe; (45.0, 30,000.01)→no_travel; (54.9, 30,001)→no_travel; (35.0, 40,000)→high; (35.0, 40,000.01)→severe; (44.9, 40,001)→severe; (34.9, 100,000)→moderate; (55, 1)→no_travel; (44.996, 35,000)→ raw wind stays in 35–44 band (does **not** round up to 45), 35,000 > 30,000 is irrelevant to that band but > nothing triggers the 40,000 rule either → high (no override, since 35,000 ≤ 40,000); (44.996, 40,001)→ severe via the 35–44/>40,000 rule; (45.004, 1)→ raw wind is in the 45–54 band (true ≥45, base classification severe per §5) and a 1 lb load does not satisfy the `wind_45_54_over_30000` override (`L > 30,000`), so the result stays severe, not no_travel — confirming the boundary is decided on the raw value and that an override only raises the level when its own load condition is actually met, not merely because the wind band changed. (Corrected 2026-10-22 per `09` §4 Q-10: the previous text claimed this case was no_travel "for any load," which contradicts §6's load table; `backend/tests/domain/test_risk.py::test_load_rule_boundary_45_004_with_trivial_load_stays_severe_not_no_travel` asserts severe.) These replace the Phase 1 "rounding-before-rules" cases (no longer applicable — rounding is not part of classification).
**Combination**: wind high + rain severe + snow low → severe, drivers [rain]; wind high(load→severe) + rain severe → severe, drivers [wind (load rule), rain].
**Matching**: ETA exactly on the hour; 14:20; 14:59:59; last series hour; first hour; `null` in any of the four variables → unknown; ETA beyond series → unknown `beyond_forecast`.
**Checkpoints**: `D<I`, `D=I`, `D` exact multiple, `D` = multiple + 0.01, `D` huge (4,000 mi at 10 → 401), duplicate vertices, geometry shorter/longer than provider `D` (scaling), 2-point geometry.
**ETA**: `T` odd seconds; ETA(D) equals departure + T; knots profile equals linear profile when knots are collinear; crossing midnight/DST (UTC internal).
**Attribution**: Σ miles = D for random geometries (Hypothesis); single-checkpoint-pair route; unknown miles tracked separately.
**Eligibility** (§8, new): blocked beats incomplete when a route has both a no_travel and an unknown checkpoint; eligible/incomplete/blocked partition is exhaustive and disjoint for any route set (property test); recommendation never selects from an empty group; `fallback_level` is `"none"` iff the recommended route came from the `eligible` group (property test linking the two).
**Ranking** (§9, scoped to one tier at a time): each of the four PDF keys decides in isolation within a tier; ties through to provider_index; permutation of input list changes nothing except provider-index ties; `rank()` never receives a mixed-tier list (type-level test: the function signature takes one already-partitioned group); all-eligible, all-incomplete, all-blocked, and mixed cases each produce the documented group ordering; `average_risk = null` only in the all-unknown-checkpoints edge case; rounding boundary on ranking-key rounding (0.049 vs 0.051 mi difference) is unrelated to and does not interact with §4.4's raw-value classification rule (a test asserts changing a checkpoint's *raw* weather value changes its *level* without needing to also change any rounded *ranking-key* miles figure, and vice versa for a tie-only rounding change); property: ordering within a tier is a total order (antisymmetric, transitive).
**Selection**: duplicate geometry removed; detour removed; exactly 3, 2, 1, 0 candidates; stable ids.
**Heatmap**: length 49 per point; hour h value equals single-point classification (on the raw value, §4.4) at `departure + h`; unknown encoded 255; shared points merge `route_ids`; slider movement triggers no re-computation of any of the above (frontend test, cross-referenced in `07` E2E-04).
**Units**: the weather request URL contains `wind_speed_unit=mph` and `precipitation_unit=inch`; a contract test fails if either is missing.

## 12. Parameters (all in settings, tested defaults)

`CHECKPOINT_INTERVALS=(10,25,50)`, `DUPLICATE_OVERLAP=0.95`, `DETOUR_FACTOR=1.5`, `MAX_ALTERNATIVES=5`, `HEATMAP_HOURS=48`, `WEATHER_MAX_UNIQUE_POINTS=450`, `LOAD_RULE_THRESHOLDS=(30000, 40000)`, `RISK_THRESHOLDS` (§5).
