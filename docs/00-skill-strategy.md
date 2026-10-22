# 00 — Skill Strategy

Phase 0 audit of locally installed engineering skills for the Spotter weather-aware truck routing assessment.
The assessment PDF (`assessment/fs-assessment-spotter.pdf`) is the authoritative spec. Skills only guide *how* to build, never *what*.

## Audit scope

Searched for `SKILL.md` under `~/Downloads/claude-skills-main/`, `~/.claude/skills/`, `~/.agents/skills/`, `~/.cursor/skills*/`, `~/.claude/plugins/`, `~/.codex/`, and `~/Documents/GitHub/claude-skills/` (~1,800 files; the `~/.claude/skills` entries for senior-*, tdd-guide, etc. are symlinks to a clone of the same upstream repo, so they were treated as duplicates). Trashed plugin copies, cached plugin versions, and `.gemini` mirrors were excluded.

**Gap found:** no installed skill covers Django/DRF, Material UI, or geospatial/map work (Leaflet/Mapbox/polylines). Those areas rely on the general skills below plus official docs. Nothing was invented to fill the gap.

## Selected skills (12)

All copied to `.claude/skills/` unmodified (verified byte-identical to source; frontmatter validated). `.claude/skills/` is git-ignored so third-party content is not pushed to a public repo.

| # | Skill | Source | Project-local | Responsibility | Invoke when | License |
|---|---|---|---|---|---|---|
| 1 | `spec-driven-workflow` | `~/Downloads/claude-skills-main/.../engineering/skills/spec-driven-workflow` | `.claude/skills/spec-driven-workflow` | Turn the PDF into traceable requirements and acceptance criteria; keeps invented requirements out | Requirements analysis; before each feature | MIT (upstream repo) |
| 2 | `senior-architect` | `.../engineering-team/skills/senior-architect` | `.claude/skills/senior-architect` | Architecture decisions, ADRs, component/data-flow diagrams | System architecture | MIT (upstream repo) |
| 3 | `senior-backend` | `.../engineering-team/skills/senior-backend` | `.claude/skills/senior-backend` | Django + DRF service design (has a `django-monolith` profile), REST design, validation, auth/hardening, caching | Backend design and implementation | MIT (upstream repo) |
| 4 | `senior-frontend` | `.../engineering-team/skills/senior-frontend` | `.claude/skills/senior-frontend` | React/TypeScript structure, state, bundle analysis | Frontend design and implementation | MIT (upstream repo) |
| 5 | `frontend-design` | `~/.claude/skills/frontend-design` | `.claude/skills/frontend-design` | Visual direction, typography, avoiding templated UI (design is 40% of grading) | Before and during UI build | Apache-2.0 (`LICENSE.txt` inside folder) |
| 6 | `react-best-practices` (`vercel-react-best-practices`) | `~/.claude/skills/react-best-practices` | `.claude/skills/react-best-practices` | Re-render, bundle, and client-side rules for a smooth map/heatmap/slider | Frontend implementation and performance review | MIT (frontmatter, author Vercel) |
| 7 | `tdd-guide` | `.../engineering-team/skills/tdd-guide` | `.claude/skills/tdd-guide` | Test-first for risk thresholds, load rules, ranking, ETA/checkpoint math (pytest + Vitest) | Algorithm design, implementation | MIT (upstream repo) |
| 8 | `strict-api` | `.../engineering/strict-api` | `.claude/skills/strict-api` | Verify routing/geocoding/weather API endpoints, params, units, and library methods actually exist before use | Third-party API integration | MIT (upstream repo) |
| 9 | `a11y-audit` | `.../engineering-team/a11y-audit/skills/a11y-audit` | `.claude/skills/a11y-audit` | WCAG 2.2 AA scan/fix/verify, contrast checker (risk colors must not rely on color alone) | Frontend QA | MIT (declared) |
| 10 | `playwright-pro` | `.../engineering-team/playwright-pro/skills/pw` | `.claude/skills/playwright-pro` | Browser E2E: form → 3 routes → map/slider. Copied the core `pw` skill only (not the TestRail/BrowserStack sub-skills) | Testing and QA | MIT (`_licenses/playwright-pro-MIT.txt`) |
| 11 | `adversarial-reviewer` | `.../engineering-team/skills/adversarial-reviewer` | `.claude/skills/adversarial-reviewer` | Hostile self-review of changes; prompt-only, no dependencies | After each major slice; before submission | MIT (declared) |
| 12 | `ship-gate` | `.../engineering/skills/ship-gate` | `.claude/skills/ship-gate` | Pre-deploy audit across 8 categories (secrets, CORS wildcards, debug logging, deps, etc.; detects Django/React stacks) | Deployment | MIT (declared) |

Upstream MIT license text is at `.claude/skills/_licenses/claude-skills-MIT.txt` (Alireza Rezvani, 2025). Attribution is preserved in each skill's own files; nothing was edited.

### Dependencies and caveats

- **Python helper scripts** in senior-architect, senior-backend, senior-frontend, tdd-guide, a11y-audit, ship-gate: import only the Python standard library (checked), and none were run in Phase 0. Check each script's `--help` before first use.
- **playwright-pro**: slash commands like `/pw:generate` only exist when installed as a plugin; copied as a plain skill, follow its SKILL.md and `reference/` files instead. Needs Playwright installed later (not installed now).
- **ship-gate** intercepts "deploy / push to production" requests and asks whether the gate was run. This is intended, but expect the prompt.
- **frontend-design** is generic; pair it with the spec's data-heavy use case rather than using it for marketing-style flourish.

### Conflicts and overlaps

- `senior-frontend` recommends replacing `@mui/material` with shadcn/Radix (bundle size). The PDF does not mandate Material UI, so the UI library is a free choice. Decide it explicitly in planning; do not let the skill silently override a decision.
- `senior-architect` / `senior-backend` suggest tech-stack profiles. Stack is already fixed by the PDF (React + Django); use only for structure, not stack selection.
- `senior-frontend` and `react-best-practices` overlap on performance. Use `react-best-practices` for rendering/bundle rules, `senior-frontend` for structure.
- `react-best-practices` is Next.js-heavy; skip `server-*` and `rendering-hydration-*` rules (no SSR here).
- `tdd-guide` and `playwright-pro` overlap lightly: unit/API logic goes to `tdd-guide`, browser flows to `playwright-pro`.

## Used in place, not copied

| Skill | Path | Why not copied | Use |
|---|---|---|---|
| `ui-ux-pro-max` | `~/.claude/skills/ui-ux-pro-max` | 3.7 MB, 73 files, **no LICENSE file found** (redistribution unclear) | Reference only: `python3 -I ~/.claude/skills/ui-ux-pro-max/scripts/search.py ...` for palettes/chart/UX guidance. Has no Material UI stack. |
| VectorLab UX skills (`page-patterns`, `anti-slop`, `viewports`, `ux-audit`) | `~/.claude/plugins/marketplaces/vectorlab/skills/` | MIT and copyable, but 20+ interlinked skills; `ux-audit` expects all of them installed | Optional: read `page-patterns` (dashboard/split pane) during frontend design. Copy later only if wanted. |
| `api-design-reviewer` | `~/Downloads/claude-skills-main/.../engineering/skills/api-design-reviewer` | Needs an OpenAPI spec; lower value for a 2–3 endpoint API | Optional: run its linter on the DRF schema in final review. |

## Rejected

| Skill | Reason |
|---|---|
| `senior-fullstack` | Scaffolder/decision engine targets Next.js, FastAPI, MERN. Django coverage is a passing mention; its tools would generate the wrong stack, and scaffolding is out of scope now. |
| `zero-hallucination-coder` | Mandatory 5-phase loop with up-front questioning conflicts with a 16-hour budget; `strict-api` keeps the useful part. |
| `taste-skill` | Written for marketing/landing pages; its own description excludes dashboards and app screens. |
| `redesign-skill` | For upgrading existing sites; there is no existing site. |
| `web-design-guidelines` | Fetches live rules from GitHub at run time (needs network, not reproducible); `a11y-audit` + `frontend-design` cover the need. |
| `web-perf` | Depends on Chrome DevTools MCP being set up; the Cloudflare-oriented guidance is not needed for this stack. Revisit only for a Lighthouse pass. |
| `performance-profiler` | Thin (74 lines), generic. Backend caching is covered by `senior-backend`. |
| `senior-security`, `senior-secops`, `security-guidance` | Enterprise compliance/threat-modeling scope is too heavy. `senior-backend` and `ship-gate` cover validation, secrets, and hardening. `security-guidance` is an auto-blocking PreToolUse hook, which would interrupt edits. |
| `senior-devops`, `ci-cd-pipeline-builder`, `docker-development` | Deployment here is a single hosted app; `ship-gate` plus the host's docs are enough. Revisit if containerizing. |
| `senior-qa` | Jest/React-Testing-Library stub generator for Next.js; overlaps `tdd-guide` + `playwright-pro`. |
| `code-reviewer`, `pr-review-expert` | Overlap with `adversarial-reviewer`; one reviewer avoids conflicting verdicts. |
| `database-designer`, `database-schema-designer` | Data model is trivial (trip request, route, checkpoint); no durable-storage requirement in the PDF. |
| `tech-stack-evaluator`, `engineering-skills` | Stack is fixed by the PDF. |
| `agenthub`, `agent-harness`, `autoresearch-agent`, memory/self-improving skills, marketing/finance/c-level/ra-qm/product skills | Unrelated, or add orchestration overhead. |
| Cloudflare, Convex, Wix, Figma, Vercel, Stripe skills | Wrong platform or unrelated service. |

## Recommended order of use

1. `spec-driven-workflow` — requirements from the PDF
2. `senior-architect` — architecture and ADRs
3. `strict-api` — verify chosen routing/geocoding/weather APIs
4. `senior-backend` — Django/DRF design
5. `tdd-guide` — risk/ranking/ETA logic, tests first
6. `frontend-design` + `senior-frontend` — UI and map design
7. `react-best-practices` — map/heatmap/slider performance
8. `a11y-audit` — accessibility pass
9. `playwright-pro` — E2E
10. `adversarial-reviewer` — review before each milestone
11. `ship-gate` — before deploy

## Coverage gaps (no skill)

Django/DRF specifics, Material UI, and map libraries/geospatial math (polyline decoding, distance sampling) have no local skill. Use official documentation, verified through `strict-api`.
