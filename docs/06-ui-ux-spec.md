# 06 — UI / UX Specification

Skills applied: `frontend-design` (subject-grounded direction, plan-then-critique, restraint), `senior-frontend` (React/TS structure), `react-best-practices` (performance), `a11y-audit` (WCAG 2.2 AA). Stack: React + TypeScript + Material UI + MapLibre GL. Requirement IDs: `01`. Behaviour: `02`.

## 1. Design direction

**Subject:** a weather desk for a dispatcher or driver deciding between three roads. The user's job is to compare risk over distance and time, quickly, often on a phone.
**Audience realities:** glanceable in a cab, one-handed, bright sun and night use, low patience for decoration.
**Memorable element (one place for boldness):** the **risk ribbon** — a thin horizontal strip per route that shows risk by mile with ETA ticks. It appears in each route card, in the compare view, and under the map for the selected route. It encodes the very thing the ranking rule measures (Severe/High miles), so the visual and the algorithm explain each other. Everything else stays quiet.

Avoid (from the `frontend-design` calibration list): cream + terracotta, black + acid accent, identical rounded cards with soft grey shadows, gradient washes, tracked-out ALL-CAPS eyebrows, "word — fragment" labels. Use plain operational copy.

### 1.1 Tokens (plan; verified with `contrast_checker.py` in M6)

| Token | Light value | Use |
|---|---|---|
| `ink` | `#14222B` | text, header band |
| `paper` | `#F2F5F7` | app background (cool, not cream) |
| `surface` | `#FFFFFF` | panels, with 1 px border `#D3DCE2` (borders over shadows) |
| `brand` | `#0E5F70` (deep teal) | primary buttons, focus ring, selected route outline |
| `muted` | `#5A6B77` | secondary text (≥ 4.5:1 on `paper`/`surface`) |
| Risk · low | `#2E8B57` | with ● circle |
| Risk · moderate | `#E3AE00` | with ■ square |
| Risk · high | `#EB6F0A` | with ▲ triangle |
| Risk · severe | `#C62828` | with ◆ diamond |
| Risk · no travel | `#2A1245` + white diagonal hatch | with ✕ |
| Risk · unknown | `#8796A1`, dotted outline | with ? |

Rules: risk is **never** color alone — every level has a color, a shape glyph, and a text label (N-04). Route identity uses numbers and line weight, not hue, so route colors never compete with risk colors. Dark theme is a stretch goal (light only in v1).

### 1.2 Typography

- Headings, numerals, badges: **Overpass** (open-source face modelled on highway signage; fits the domain). Body/UI: **Public Sans**. Both self-hosted through `@fontsource` (no external font request, no layout shift), only the weights used (400/600/700).
- ETAs and miles use tabular numerals. Scale 12/14/16/20/24/32 on a 4 px grid. Body ≥ 16 px on mobile inputs (prevents iOS zoom). Line length < 80 ch.
- Labels are sentence case. No ALL-CAPS labels, no decorative eyebrows.

### 1.3 Shape and spacing

Radius 4 px (controls) and 8 px (panels) only. 4/8-based spacing. Elevation via borders; one soft shadow only for floating map controls and the mobile sheet. Motion: 150–200 ms ease-out for state changes; one orchestrated moment (results panel slides in); nothing animates on its own except the optional slider "play"; `prefers-reduced-motion` disables all non-essential motion.

## 2. Layouts

### 2.1 Desktop (≥ 1200 px)

```
┌───────────────────────────────────────────────────────────────────────┐
│ App bar: name · data attribution link                                 │
├──────────────────────┬────────────────────────────────────────────────┤
│ Trip form / summary  │                                                │
│ ──────────────────── │                MAP (fills)                      │
│ Recommendation       │   routes · checkpoints · heatmap                │
│ Route cards (3)      │                                  [legend]       │
│  ▓▓▒▒░░░ risk ribbon │                                  [layers][fit]  │
│ Compare table        │ ┌──────────────────────────────────────────────┐│
│                      │ │ ◀ ▶ ▮▮  slider 0────●────48 h  Thu 14:00 +6h││
│ (scrolls)            │ └──────────────────────────────────────────────┘│
│  panel 400 px        │ Tabs: Checkpoints · Selected-route ribbon        │
└──────────────────────┴────────────────────────────────────────────────┘
```
Panel is a scrollable column (400 px); the map region has the slider docked at its bottom and a collapsible checkpoint table drawer (≈ 240 px tall).

### 2.2 Tablet (768–1199 px)

Same structure with a 340 px collapsible panel (handle button); when collapsed, the map is full width and a floating chip shows the recommended route and Analyze/Edit. Checkpoint table opens as a right-side drawer.

### 2.3 Mobile (< 768 px)

```
┌────────────────────────┐
│ ◀ Denver → Omaha  Edit │  compact summary bar (form opens as full-screen sheet)
├────────────────────────┤
│                        │
│          MAP           │
│    (full-bleed)        │
│ ─ slider (44 px) ───── │
├────────────────────────┤
│ ▔▔ drag handle        │  bottom sheet: peek / half / full
│ ★ Route 2 recommended  │
│ ▓▓▓▒▒░░ ribbon         │
│ [Routes][Compare][Pts] │
└────────────────────────┘
```
- Bottom sheet snap points: peek (≈ 96 px: recommendation), half (route cards), full (tabs). The sheet never covers the slider; focus is never hidden behind it (WCAG 2.4.11).
- Form: full-screen sheet with a sticky primary button at the bottom (thumb reach); keyboard-safe via `visualViewport`.
- Popups render as a bottom card (not floating bubbles) with a close button, swipe-down to dismiss.
- Breakpoints use MUI `theme.breakpoints` (`sm` 600, `md` 900 → panel mode switch at 768 via custom value, `lg` 1200).

## 3. Material UI strategy

| Need | Component | Notes |
|---|---|---|
| Theme | `ThemeProvider` + `createTheme` + `CssBaseline` | tokens above; default MUI blue not used; `shape.borderRadius = 4` |
| Place fields | `Autocomplete` + `TextField` | async options, debounced, `filterOptions={x=>x}`, `aria` from MUI, clear/swap buttons |
| Departure | `TextField type="datetime-local"` | native picker is fast, accessible, and mobile-friendly; avoids the date-pickers package weight |
| Load | `TextField type="number"` with `inputMode="decimal"` and `lb` adornment | helper text lists rule thresholds |
| Spacing | `ToggleButtonGroup` (10 / 25 / 50 mi) | exclusive, default 25 |
| Analyze | `LoadingButton`-style `Button` + `CircularProgress` | disabled while loading |
| Results | `Paper variant="outlined"` rows (not identical floating cards): rank badge, name, ribbon, key figures | selected state = 2 px `brand` outline + `aria-current` |
| Compare | `Table size="small"` (desktop) / horizontal `Tabs` swipe (mobile) | winning cell marked with text "Best" |
| Checkpoints | `Table` with sticky header; `Chip` for level | virtualise (`react-window`) only if > 200 rows |
| Sheets | `SwipeableDrawer` (mobile), `Drawer` (tablet) | `keepMounted` for the map sheet |
| Slider | `Slider` with `marks` every 12 h, `aria-label`, `getAriaValueText`, `valueLabelFormat` | thumb 28 px, touch target 44 px via padding |
| Feedback | `Alert` (warnings/errors), `Skeleton`, `LinearProgress`, `Snackbar` | no toast for errors that need action |
| Icons | `@mui/icons-material/<Name>` per-icon imports | no barrel import |

Component tree (src): `App` → `ThemeRoot`, `AppBar`, `TripPanel` (`TripForm`, `TripSummary`, `Recommendation`, `RouteList` → `RouteCard` → `RiskRibbon`, `CompareTable`, `WarningList`), `MapRegion` (lazy: `MapView`, `HeatmapLayer`, `CheckpointLayer`, `RouteLayer`, `MapLegend`, `ForecastSlider`), `CheckpointDrawer` (`CheckpointTable`), `ErrorBoundary`. State: server response in TanStack Query mutation result; UI state (`selectedRouteId`, `hour`, `layersVisible`, `sheetSnap`) in a small `useReducer` context; map state is imperative and not in React state.

## 4. Route cards and comparison (R-MAP-03)

Card contents (top to bottom): rank badge + name + **Recommended** chip (shown only when `recommendation.route_id === route.id` **and** `recommendation.fallback_level === "none"`); duration and distance; arrival time (local time + zone abbreviation); **risk ribbon**; "Severe 0 mi · High 40 mi · Avg risk 0.74"; worst level chip; eligibility state read from `route.eligibility.status` (`04` §4) — `blocked` shows `No Travel near mile 142`, `incomplete` shows an incomplete-data notice; `eligible` shows nothing extra.
Recommendation block above the cards: when `fallback_level === "none"`, one sentence from `recommendation.reasons` plus the trade-off note when the recommended route is not the fastest (`05` §9). When `fallback_level` is `"incomplete_data"` or `"no_safe_route"`, this block is replaced entirely by a `warning`/`error`-severity banner carrying the fallback text from `05` §8.3 and a visible **"Not confirmed safe"** label on the top card instead of **Recommended** — the two states are visually distinct so a fallback pick can never be mistaken for a normal recommendation at a glance.
Compare table rows: Duration, Distance, No Travel miles, Severe miles, High miles, Average risk, Arrival; columns = routes; the deciding row is marked. This mirrors the ranking keys, so the page makes the algorithm auditable.

**Risk ribbon spec:** width 100%, height 12 px (24 px on the selected route under the map); one rectangle per merged coverage segment, width ∝ miles, fill = level color plus level pattern (hatch for no_travel, dots for unknown, thin top-border shape cues for others); ETA ticks every 6 h with labels in the large variant; `role="img"` with an `aria-label` summarising miles by level; tooltip/click shows the segment's mile range and level.

## 5. Map behaviour (R-MAP-01/02)

- Engine: MapLibre GL JS (lazy chunk) with OpenFreeMap "liberty" style; attribution control always visible (OpenFreeMap, OpenMapTiles, OpenStreetMap contributors).
- Layers: `routes-unselected` (neutral slate, 3 px, numbered label at midpoint), `route-selected-casing` (white 8 px), `route-selected-risk` (risk-colored segments from `risk_segments`, 6 px), `checkpoints` (shape icons by level, sized by zoom), `endpoints` (origin A / destination B pins), `heatmap` (below routes).
- Route labels: each route has a symbol label at its midpoint ("2 · 8 h 40 min · 546 mi"); clicking the line or label selects the route and opens a summary popup (distance, duration, arrival, miles by level, average risk, link to checkpoints). Labels are deduplicated by `symbol-spacing` and hidden below zoom 5 to avoid clutter.
- Selection: clicking a route line or a card selects it; unselected routes stay visible; hover/focus raises route line.
- Fit: after analysis `fitBounds` on the union of route bboxes with padding that accounts for the panel/sheet; "Fit routes" button re-fits.
- Checkpoint declutter: at zoom < 7 show only origin, destination and Moderate+ checkpoints; at zoom ≥ 8 all.
- Popup / card content: `Mile 75 · ETA 7:10 PM EDT`, level badge with shape, wind/rain/snow values with units (looked up once via `weather_samples[checkpoint.weather_sample_id]`, `04` §4 — the component never receives duplicated inline weather), "Driven by: wind", "Load rule applied: wind 35–44 mph and load > 40,000 lb → Severe" when applicable, "Forecast hour used: 7:00–8:00 PM". When `weather_sample_id` is `null`, render the Unknown state (§7) instead, never a zeroed/"Low" reading. Checkpoints within 0.05 (mph/in-hr) of a threshold show a small note: "Classified at the measured value before rounding for display" (`05` §4.4) — the one place the UI must admit a displayed number and its risk level can sit on opposite sides of a boundary by a hair, because classification never rounds and display always does. Keyboard users reach the same content via the checkpoint table.
- Touch: pinch/drag; rotation and pitch disabled; two-finger scroll hint is not needed because the map is the full-bleed content area; page scroll belongs to the panel/sheet.
- Failure: if tiles/style fail to load, the list/ribbon/table remain usable and a banner explains (`02` §3).

## 6. Weather heatmap and slider (R-HEAT-01/02)

- Data: `heatmap.points[].risk[0..48]` from the analyze response (no network on slider change).
- Rendering: GeoJSON point source with feature ids; a blurred-circle layer (`circle-blur` ≈ 0.9, radius scaled by zoom so adjacent points overlap by about 30%, derived from the chosen interval and route latitude) colored by risk level via feature-state; a "?" symbol for unknown points; opacity 0.55 so the basemap and routes remain legible. This is an honest rendering of real sampled values (each blob = one sample); blending is visual only and the legend says "Conditions sampled along the routes".
- Slider update path: on `onChange` → `requestAnimationFrame`-coalesced loop applies `setFeatureState` for all points; React updates only the label and live region. M5 includes a 15-minute spike comparing feature-state against rebuilding the paint expression/`setData`; pick the faster one against N-01. Numbers: ≤ 600 points on a 3,000-mile trip at 10 mi spacing.
- Controls: range 0–48 step 1; absolute time label; play/pause (600 ms per step, off under `prefers-reduced-motion`); `Home/End/PageUp/PageDown/Arrow` keys; the label announces via a polite live region debounced 400 ms.
- Legend (bottom-left over the map, collapsible on mobile): five levels with shapes and labels, "Unknown", forecast source, "Classified for your load: 38,000 lb".
- Stretch S-01: lateral sample points to give the corridor width (`05` §10).
- Honesty rules: never render "no data" as Low; the heatmap label says "Conditions at [time]"; checkpoint popups say "Conditions at arrival".
- **Invariant (Phase 1B, `05` §10):** the slider only indexes into `heatmap.points[].risk[h]`, already fully computed and present in the analyze response. It never triggers a request, never recomputes `recommendation`/`routes[*].rank`/checkpoint `risk`, and the recommendation panel, route cards and checkpoint table are not subscribed to the slider's state at all — they read only the `AnalysisResult` from the mutation, which does not change while the slider moves. This is deliberately a *different question* from checkpoint risk: the slider asks "what will conditions be at time T across the whole corridor", checkpoint risk asks "what will conditions be when the truck actually reaches this point" — the two can legitimately show different levels for the same spot at the same clock time if the truck isn't there yet, and the UI's copy (§6, `02` §2.5) says so explicitly so a user does not read the heatmap colour under a checkpoint as a contradiction of that checkpoint's own badge.

## 7. Loading, empty, error states

As specified in `02` §3–§4. Visual rules: skeletons match final layout (no layout shift, N-03); errors use `Alert` with a specific headline ("Weather forecast is unavailable"), cause in plain language, and a primary action (Retry / Edit trip); partial-data warnings use `warning` severity and remain dismissible only after the user expands details; cold-start message at 5 s with the elapsed time.

## 8. Accessibility (N-04)

- Landmarks: `header`, `main` (panel), map region (`role="region"` with `aria-label="Route map"`), results list as `ul`/`li` with headings. A "Skip to results" link is first in tab order.
- Form: labels visible (no placeholder-only labels), errors tied with `aria-describedby`, `aria-invalid`, focus moves to the first invalid field on submit; error text uses the same wording as the server.
- Color independence: shape + label + pattern on every risk representation (map, ribbon, chips, legend).
- Contrast: text ≥ 4.5:1, UI components and risk fills ≥ 3:1 against adjacent colors — verified with `a11y-audit/scripts/contrast_checker.py` against the final tokens; marker outlines (white casing) keep map markers ≥ 3:1 over any basemap tile.
- Focus: visible 3 px `brand` ring offset 2 px; focus never hidden by sheets or sticky elements (WCAG 2.2: 2.4.11); target size ≥ 44 px for touch controls (2.5.8 asks 24 px, we exceed).
- Alternatives to dragging (WCAG 2.2: 2.5.7): the slider is keyboard/click operable; the map pan has buttons and keyboard handlers; the checkpoint table replaces map-only information.
- Live regions: analysis status (polite), errors (assertive), slider time (polite, debounced).
- Motion: reduced-motion honoured; no flashing.
- Zoom/reflow: usable at 400% zoom / 320 px width (panel becomes full-width sheet).
- Language and units: all units spelled in the UI (`mph`, `in/hr`, `lb`, `mi`).

## 9. Visual consistency checklist

One type scale, two radii, one border color, one focus style, level icon set used identically in chips, map, ribbon, legend, and popups, one time format (`h:mm a zzz`), miles always with one decimal, durations as `8 h 20 min`. Enforced by shared components (`RiskBadge`, `TimeText`, `Miles`, `Duration`) and a Playwright screenshot review at 360/768/1280 px in M6.

## 10. Performance budget and techniques (N-01..N-03; `react-best-practices`)

- Entry chunk ≤ 250 KB gzip; map chunk loaded on idle after first paint (`bundle-preload`/`bundle-dynamic-imports`); fonts: 3 weights, `font-display: swap`, preloaded.
- Memoise derived data (decoded geometry, ribbon segments) once per response (`useMemo` keyed on the response); no inline component definitions; stable callbacks; `startTransition` for card selection.
- Large response handling: decode polylines in a Web Worker only if profiling shows > 16 ms main-thread cost (not by default).
- Autocomplete: debounce 300 ms, `AbortController` for stale requests, cached suggestions by query.
- Measure in M6: Lighthouse mobile (performance, accessibility ≥ 90 targets), React Profiler on slider drag (no component re-render per tick except label), Chrome performance trace for frame time while dragging (N-01).
