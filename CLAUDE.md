# CLAUDE.md — project instructions

Spotter weather-aware truck routing assessment. This file is the short entry point; the real content lives in `docs/`. Read it before doing anything in this repo.

## Source of truth

`assessment/fs-assessment-spotter.pdf` is the authoritative spec. Nothing in `docs/` or in code overrides it; where this repo's docs go beyond the PDF, they are explicitly labelled **ASSUMPTION**, **DERIVED**, or **CHOICE** (`docs/01-requirements.md` §6) and most assumptions still need the user's sign-off (`docs/01-requirements.md` §7, `docs/09-decisions.md` §4).

## Reading order

1. `docs/00-skill-strategy.md` — which locally installed Claude Code skills are in use and why (and which were rejected).
2. `docs/01-requirements.md` — requirements traced from the PDF (atomic IDs), derived requirements, acceptance criteria, traceability matrix, assumptions needing approval.
3. `docs/02-user-flows.md` — user journeys, states, failure/degraded behaviour.
4. `docs/03-architecture.md` — stack, provider evidence (TomTom/HERE/Open-Meteo/OpenFreeMap), backend module boundaries, data flow, performance/security/deployment architecture.
5. `docs/04-api-contracts.md` — the two real endpoints (`/api/places/suggest`, `/api/trips/analyze`) and `/api/health`; request/response shapes; error envelope.
6. `docs/05-routing-weather-risk.md` — the executable spec for `backend/domain/`: route selection, checkpoints, ETA/forecast matching, risk classification, load rules, **eligibility policy (separate from ranking)**, ranking (PDF's exact four keys), heatmap, and the full boundary/edge-case test catalogue.
7. `docs/06-ui-ux-spec.md` — design direction, layouts, Material UI component mapping, map/heatmap/slider behaviour, accessibility.
8. `docs/07-test-strategy.md` — test pyramid, every test ID referenced elsewhere, AC → test mapping.
9. `docs/08-execution-plan.md` — the 16-hour task list, Gate 0 provider-validation checklist, milestone gates G0–G7, scope-cut ladder.
10. `docs/09-decisions.md` — architecture decision records, risk register, assumption/question index, and the adversarial review logs (two passes).

## Selected skills

The project-local skill set (copied under `.claude/skills/`, git-ignored) is audited in `docs/00-skill-strategy.md`. In short: `spec-driven-workflow`, `senior-architect`, `senior-backend`, `senior-frontend`, `frontend-design`, `react-best-practices`, `tdd-guide`, `strict-api`, `a11y-audit`, `playwright-pro`, `adversarial-reviewer`, `ship-gate`. Where a skill's default conflicts with the PDF or the user's instructions (e.g. swap Material UI for shadcn, add Postgres/Celery), the override is recorded in `docs/03-architecture.md` §11 and the skill loses.

## Quality gates (must pass to continue; full detail in `docs/08-execution-plan.md` §4)

| Gate | Condition |
|---|---|
| G0 | TomTom (or HERE fallback) passes the explicit checklist in `08` §4.1 — alternative routes, geometry, distance/duration, truck support, quota, failure behaviour |
| G1 | Domain tests green, 100% branch coverage on `domain/`, every `05` §11 case present, adversarial review clean |
| G2 | API tests green; one live analysis with real providers hand-verified |
| G3 | Full trip → 3 routes → recommendation → checkpoints works on desktop and phone width |
| G4 | Slider produces zero network calls; ≥50 fps measured or documented mitigation |
| G5 | E2E suite green, no critical/major accessibility issues, bundle/perf numbers recorded |
| G6 | Hosted URL passes smoke tests from a clean browser and a phone |
| G7 | Loom recorded (5–10 min), README complete |

## Implementation approval policy

**No scaffolding and no application code until the user explicitly approves the current revision of the planning doc set.** This repo has gone through two review cycles (`docs/09-decisions.md` §5 and §5a); approval of an earlier cycle does not carry forward automatically to a later one if the plan changed in response to review feedback — re-approval is sought each time the plan materially changes (as it did after the Phase 1B review this file was added for). When approved, implementation starts at Gate 0 (`08` §1, M0) and proceeds milestone by milestone through the gates above; any change that would alter a requirement, an assumption the user already approved, or the 16-hour budget is raised before being made, not discovered after.

## Non-negotiables carried from the PDF and the user's own instructions

- React (frontend) + Django (backend); Material UI as the component library (explicitly reaffirmed, not swapped for a lighter alternative).
- Three route options from a real routing API; weather sampled at the truck's **arrival time** at each checkpoint, not departure time.
- The five-level risk classification and the load-weight override rules, applied to the **raw unrounded** measurement (display rounding never feeds back into classification — see `05` §4.4).
- Ranking balances risk and time in the PDF's exact order (Severe miles → High miles → average risk → duration); No Travel and missing-data handling is a separate eligibility/safety policy, not an extra ranking key, with a transparent fallback when nothing is safely recommendable.
- Map shows all routes and checkpoints with risk/ETA; a 0–48 h heatmap slider that never triggers a network request and never changes the recommendation.
- 16 working hours, at most 4 days; prioritise correctness and clarity over extra features.
