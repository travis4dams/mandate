# MANDATE

A data-driven central-banking grand-strategy game, in the Paradox / 4X tradition.
You chair a Federal-Reserve-style central bank; you read a fogged economy, win over
a committee, steer policy, and defend your credibility and independence.

This repository is the **engine and content pipeline**, structured so that game
content is authored as readable, schema-governed data files and the engine code
stays content-agnostic.

## The core architectural rule

> **Engine code contains no game content. All content lives in `content/`,
> governed by JSON Schemas in `schemas/`.**

The engine knows *how* an event fires or a tech unlocks; the data files say *which*
events and techs exist. You can retune the whole game by editing JSON — no
recompile — exactly like a Paradox game's `common/` and `events/` folders.

## Layout

<!-- gen:layout -->
```
schemas/     JSON Schemas — the contract for every content type
content/     The game, as data:
  briefings/   staff briefings with raise/hold/lower forecast branches
  calibration/ FRED baseline data for engine calibration
  committees/  FOMC-style voting committees
  doctrines/   adoptable policy frameworks
  engine/      engine parameter files (tick, fog, credibility, dynamics, …)
  events/      weighted, condition-gated events
  hearings/    confirmation-hearing questions and answers
  localization/ all player-facing text, keyed (never inline in logic)
  replays/     committed player-strategy artifacts (policy sequences)
  scenarios/   starting game states
  tech/        the three research trees (theory / applied / infrastructure)
  traits/      committee-member trait catalog
src/
  engine/      deterministic simulation core (no I/O, no wall clock, seeded RNG)
  content/     the interpreters: condition evaluator, effect applier, schema loader
web/
  src/         React 18 + Vite UI — Dashboard, MeetingPanel, ChartsPanel
tools/       CLI scripts: validate-content, spec-trace, gen-state, gen-docs, calibrate
spec/        DESIGN.md (the vision) + requirements.md (ID'd, testable requirements)
test/        the test suite; every test cites the SPEC id it covers
.github/     CI: TDD gate, content validation, spec traceability, state/docs freshness
```
<!-- /gen:layout -->

<!-- gen:content -->
Engine code contains no game content. All content lives in `content/`,
governed by JSON Schemas in `schemas/`. Adding content (e.g. a new event) is
just dropping a JSON object into the right subdirectory and its strings into
`content/localization/en.json`; `npm run validate` confirms it conforms.

Three patterns are borrowed directly from Paradox modding: logic is separated
from display text (localization keys), content is split by type into predictable
folders, and everything is validated by external tooling (here, JSON Schema in
place of CWTools).
<!-- /gen:content -->

## Play it

```bash
npm run web:install   # once — installs web/ dependencies
npm run web:dev       # start the Vite dev server (localhost:5173)
```

The web UI surfaces the Dashboard, FOMC MeetingPanel, and ChartsPanel. For a
headless engine run, see the calibration harness: `npm run calibrate`.

## Develop

```bash
npm ci
npm run check     # typecheck + validate content + spec traceability + tests + freshness
npm run test:watch
```

## Commands

<!-- gen:commands -->
| Command | What it does |
| --- | --- |
| `npm run calibrate` | tsx tools/calibrate.ts |
| `npm run check` | npm run typecheck && (cd web && tsc --noEmit) && npm run validate && npm run spec:trace && npm test && npm run web:test && npm run web:build && test -f web/dist/index.html && npm run state:check && npm run docs:check |
| `npm run docs:check` | tsx tools/gen-docs.ts --check |
| `npm run docs:gen` | tsx tools/gen-docs.ts |
| `npm run spec:trace` | tsx tools/spec-trace.ts |
| `npm run state:check` | tsx tools/gen-state.ts --check |
| `npm run state:gen` | tsx tools/gen-state.ts |
| `npm run test` | vitest run |
| `npm run test:watch` | vitest |
| `npm run typecheck` | tsc --noEmit |
| `npm run validate` | tsx tools/validate-content.ts |
| `npm run web:build` | cd web && npm run build |
| `npm run web:dev` | cd web && npm run dev |
| `npm run web:install` | cd web && npm ci |
| `npm run web:test` | cd web && npm test |
<!-- /gen:commands -->

## How development works (built for agents)

See **[CLAUDE.md](./CLAUDE.md)** (the canonical guidelines; `AGENTS.md` points to
it). In short: spec first, failing test second, implementation third; engine stays
pure and content-free; CI enforces all of it. Every pull request also gets an
automated review from the official PR Review Toolkit
(`.github/workflows/claude-review.yml`), which checks compliance against CLAUDE.md.
