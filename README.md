# Spotter — Weather-Aware Truck Routing

A trip-planning tool for truck dispatch: given an origin, destination, departure time, load
weight and checkpoint spacing, it returns three real routing alternatives, samples weather at
each checkpoint's **arrival time** (not departure time), classifies risk on a five-level scale,
applies load-weight override rules, and recommends the route that balances safety and time —
in that order. A map shows all routes and checkpoints with risk/ETA, plus a 0–48 h conditions
heatmap with a slider that never triggers a network request.

Built against a fixed-scope spec (`assessment/fs-assessment-spotter.pdf`); `docs/` is the full
planning/spec set this implementation was built from — read `docs/01-requirements.md` through
`docs/09-decisions.md` for the authoritative detail behind every rule summarized below.

## Stack

- **Backend**: Django + Django REST Framework (Python), `domain/` is a pure, framework-free
  rules engine (no Django/requests/httpx imports) with 100% branch coverage.
- **Frontend**: React + TypeScript (Vite), Material UI, TanStack Query, MapLibre GL (OpenFreeMap
  tiles).
- **Providers**: TomTom Routing + Geocoding (truck profile, 3 alternative routes), Open-Meteo
  (forecast weather, no key required).

See `docs/03-architecture.md` for the full stack rationale, module boundaries and data flow.

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp ../.env.example ../.env   # fill in TOMTOM_API_KEY (free tier, no credit card)
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Tests

```bash
# backend (domain + API)
cd backend && pytest

# frontend unit/component
cd frontend && npm test

# frontend e2e (Playwright)
cd frontend && npm run e2e
```

## Environment variables

See `.env.example` for the full list and inline documentation. Required: `TOMTOM_API_KEY`.
`HERE_API_KEY` is only needed if the TomTom Gate-0 validation forces a provider fallback
(it did not — see `docs/gate0-result.md`). `.env` is git-ignored; nothing in it is committed.

## Risk classification

Five levels (Low / Moderate / High / Severe / No Travel), evaluated from No Travel downward —
the first satisfied bound wins, on the **raw, unrounded** sampled value (display rounding never
feeds back into classification):

| Condition | Moderate | High | Severe | No Travel |
|---|---|---|---|---|
| Wind (mph) | ≥ 25 | ≥ 35 | ≥ 45 | ≥ 55 |
| Rain (in/hr) | ≥ 0.10 | > 0.25 | > 0.50 | > 1.00 |
| Snow (in/hr) | ≥ 0.5 | > 1.0 | > 2.0 | > 3.0 |

**Load-weight overrides** (wind only, strict `>` comparisons, overrides only raise the level
never lower it):

| Rule | Condition | Effect |
|---|---|---|
| `wind_ge_55` | wind ≥ 55 mph | No Travel |
| `wind_45_54_over_30000` | 45–54 mph and load > 30,000 lb | No Travel |
| `wind_35_44_over_40000` | 35–44 mph and load > 40,000 lb | Severe |

Checkpoint level = max(wind-after-load, rain, snow). A checkpoint with no usable forecast data
is **Unknown** — never presented as Low — distinguishing missing data from confirmed-mild
conditions on both the checkpoint table and the heatmap.

## Recommendation

Eligibility (safety) and ranking (time) are deliberately separate:

1. Routes are partitioned into `eligible` / `incomplete` (has unknown checkpoints) / `blocked`
   (has a No Travel checkpoint) — `eligible` always ranks above `incomplete` above `blocked`.
2. Within a tier, routes are ranked by the PDF's exact four keys in order: Severe miles → High
   miles → average risk → duration.
3. If no route is `eligible`, the app shows a transparent fallback (`fallback_level`) rather than
   silently recommending an unsafe or incomplete route.

Full rules, worked edge cases and the boundary test catalogue: `docs/05-routing-weather-risk.md`.

## Known limits and assumptions

- **Weather quota**: Open-Meteo's free tier is used as-is; the backend batches/dedups weather
  requests per unique (lat, lng, hour) to stay inside it — see `docs/03-architecture.md` §6.
- **Forecast horizon**: Open-Meteo provides ~16 days of hourly data; a checkpoint whose arrival
  time falls beyond the returned series is `Unknown` (reason `beyond_forecast`), never guessed.
- **TomTom truck profile**: validated live against a 7-trip spike (`docs/gate0-result.md`); no
  HERE fallback was needed.
- A handful of interpretive choices not literal in the PDF (e.g. inclusive/exclusive boundary
  reading, the eligibility/ranking split) are recorded as **ASSUMPTION**/**DERIVED**/**CHOICE**
  in `docs/01-requirements.md` §6 and `docs/09-decisions.md` §3–4, with the reasoning for each.
- Deployment (hosted URL) and the walkthrough recording are tracked separately in
  `docs/08-execution-plan.md` (M7/M8) and are not yet complete as of this commit.

## API

Two endpoints plus a health check — full request/response shapes, error envelope and every
error code in `docs/04-api-contracts.md`:

- `POST /api/trips/analyze` — the main analysis call.
- `GET /api/places/suggest` — debounced place search for the trip form.
- `GET /api/health` — liveness/readiness.

## Repository layout

```
backend/    Django project: domain/ (pure rules engine), providers/, trips/ (API), config/
frontend/   React + TS app: src/, e2e/ (Playwright)
docs/       Full planning/spec set (requirements → architecture → decisions)
tests/      Shared fixtures (e.g. Gate 0 provider-validation evidence)
assessment/ The original spec PDF
```
