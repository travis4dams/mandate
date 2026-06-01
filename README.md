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

```
schemas/     JSON Schemas — the contract for every content type (the "observable structure")
content/     The game, as data:
  events/      weighted, condition-gated events
  tech/        the three research trees (theory / applied / infrastructure)
  localization/ all player-facing text, keyed (never inline in logic)
src/
  engine/      deterministic simulation core (no I/O, no wall clock, seeded RNG)
  content/     the interpreters: condition evaluator, effect applier, schema loader
tools/       validate-content (schema gate) and spec-trace (requirements traceability)
spec/        DESIGN.md (the vision) + requirements.md (ID'd, testable requirements)
test/        the test suite; every test cites the SPEC id it covers
.github/     CI: TDD gate, content validation, spec traceability, optional AI review
```

Three patterns are borrowed directly from Paradox modding: logic is separated from
display text (localization keys), content is split by type into predictable folders,
and everything is validated by external tooling (here, JSON Schema in place of CWTools).

## Develop

```bash
npm ci
npm run check     # typecheck + validate content + spec traceability + tests
npm run test:watch
```

Adding content (e.g. a new event) is just dropping a JSON object into
`content/events/` and its strings into `content/localization/en.json`;
`npm run validate` confirms it conforms.

## How development works (built for agents)

See **[CLAUDE.md](./CLAUDE.md)** (the canonical guidelines; `AGENTS.md` points to
it). In short: spec first, failing test second, implementation third; engine stays
pure and content-free; CI enforces all of it. Every pull request also gets an
automated review from the official PR Review Toolkit
(`.github/workflows/claude-review.yml`), which checks compliance against CLAUDE.md.
