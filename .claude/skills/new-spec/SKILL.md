---
name: new-spec
description: Use when adding a new SPEC requirement to spec/requirements.md — picks a non-colliding id, validates it against the spec-trace regex, places the bullet in the right section, and scaffolds the test + content conventions this repo enforces.
---

# Adding a SPEC requirement (the repo loop, mechanized)

The contract (CLAUDE.md): spec first, failing test second, implementation third.
This skill handles the mechanical parts that have caused rework.

## 1. Pick the id

- Find the highest existing N for your prefix:
  `grep -oE "SPEC-<PREFIX>-[0-9]+" spec/requirements.md | sort -V | tail -1`
- New ids MUST round-trip the spec-trace regex. Check with Python (not node —
  node can hang in agent sessions on some workstations, issue #103):
  `python3 -c "import re; print(re.findall(r'\bSPEC-[A-Z]+-\d+\b', 'SPEC-FOO-1'))"`
  Compound suffixes (`-1a`, `-1.1`) will NOT match — split into separate ids.
- Gaps in numbering are fine and load-bearing history — never renumber existing ids.

## 2. Place the bullet

spec/requirements.md is organized by section (Credibility, Scenarios, Committee,
Briefings, Doctrine, Confirmation hearing, Shocks, Fog, Web, …). Insert the new
bullet directly AFTER the highest-numbered existing bullet of the same prefix.
Format: `- **SPEC-XXX-N** \`[testable]\` <one self-contained paragraph>` — name
the files, the functions, and the observable behavior tests will assert. Use
`[design]` instead of `[testable]` only for narrative-only requirements.

## 3. Write the failing test

- The test file comment must contain the LITERAL id (e.g. `// SPEC-XXX-N`) —
  `npm run spec:trace` matches the comment text, not the test name.
- Test-only requirements (property tests, cross-content integrity) may pass
  immediately; that's fine — the test pins the invariant. Say so in the PR.

## 4. Content-type conventions (if the SPEC ships content)

- Schema in `schemas/<type>.schema.json` (JSON Schema 2020-12,
  `additionalProperties: false`, bounded numerics with descriptions).
- Content ids match the schema's pattern (e.g. `^brief\.[a-z0-9_]+$`); all
  `name`/`desc` values are localization KEYS; the strings go in
  `content/localization/en.json`. No real person names anywhere.
- Loader in `src/content/<type>.ts` mirroring an existing one (doctrines.ts is
  the cleanest template: module-level cache + `_reset*Cache()` test helper +
  cwd-safe `import.meta.url` path join).
- **If engine code loads the new type at runtime, register the directory in
  `web/src/engine-content.ts` AND add it to `web/src/engine-content.test.ts`.**
  Node tests read from disk; only that test exercises the browser registry path.
- Good examples to copy: `content/scenarios/2008_gfc.json`,
  `content/doctrines/gradualism.json`, `content/briefings/2008_q4_crisis.json`.

## 5. Before the PR

- One SPEC per PR, titled `SPEC-XXX-N: <description>`; fill the PR template.
- Run the `spec-reviewer` agent (.claude/agents/spec-reviewer.md) on the diff.
- Check no other open PR touches the same content/engine params file or
  en.json — those merges must be serialized (docs/ralph-runbook.md).
