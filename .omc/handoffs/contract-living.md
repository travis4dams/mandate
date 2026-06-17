# MANDATE — "Living Institution" Build Contract

Branch: `feat/living-institution` (stacked on `feat/institution-depth`). This push answers
direct playtest feedback: the game felt shallow ("press a button and wait"); staffing was
gated by political capital and couldn't be done in month 1; directors couldn't be fired;
their hawk/dove was wrongly shown; the committee distribution was opaque; chair persuasion
capital felt static; the hearing was dull.

## HARD RULES (CI + reviewer reject violations)
1. Spec-first/TDD: your SPEC id is in `spec/requirements.md`; write the FAILING test first
   (`// SPEC-XXX-N` comments), then implement. `npm run spec:trace` enforces it.
2. Engine purity (SPEC-SIM-1): no `Math.random()`/`Date.now()` in `src/**`; randomness via
   the caller's seeded `rng` (`mulberry32`/`fnv1a32`). Pure fns return NEW state, never mutate.
3. No content in engine code; load via the validated loader. No inline player-facing strings —
   the LEAD has added every loc key already; do NOT edit `en.json`.
4. Schema-governed content; assert accept/reject in your test via `loadValidatedFile`/ajv
   directly. Do NOT edit `tools/validate-content.ts` (lead owns it).
5. No real person names. Web workers guard indexed reads (`noUncheckedIndexedAccess`).

## FILE OWNERSHIP
- LEAD owns: `spec/requirements.md`, `content/localization/en.json`, `src/engine/session.ts`,
  `web/src/engine-content.ts`(+test), `web/src/App.tsx`, `tools/validate-content.ts`, scenarios.
- worker-events owns: `src/content/events.ts`, `src/engine/event-engine.ts`, ALL
  `content/events/*.json`, `test/event-engine.test.ts`.
- worker-staff-econ owns: `src/engine/institution.ts` (hire/fire economy), `src/engine/chair-capital.ts`,
  `content/engine/chair-capital.json`, `test/staff-economy.test.ts`, `test/chair-capital.test.ts` (extend).
- worker-web owns the web components for SPEC-WEB-15 (see below).

## SIGNATURES

### SPEC-EVENT-1 + SPEC-EVENT-2 — worker-events
Reuse the existing condition/effect engine: import the condition evaluator from
`src/content/conditions.ts` and the effect applier from `src/content/effects.ts` (read both
first to get exact export names + signatures). The event schema already exists at
`schemas/event.schema.json`; `content/events/oil_shock.json` is an ARRAY of events — the
loader must flatten arrays across files.
```ts
// src/content/events.ts
export interface EventOption { id: string; name: string; effects: Effect[]; }
export interface GameEvent { id: string; category: string; title: string; desc?: string;
  fires_once?: boolean; trigger?: Condition; mean_time_to_happen?: { base_days: number; modifiers?: { condition: Condition; factor: number }[] }; options: EventOption[]; }
export function loadEventCatalog(): GameEvent[];   // validates content/events/*.json, flattens arrays
// src/engine/event-engine.ts
export function eligibleEvents(state: GameState, catalog: GameEvent[], firedOnce: ReadonlySet<string>): GameEvent[];
export function eventFireProbability(event: GameEvent, state: GameState, daysPerMonth?: number): number; // no MTTH => 1; else 1 - 0.5^(daysPerMonth/effectiveDays), effectiveDays = base_days * Π factors whose condition holds
```
Author **8 events** in `content/events/` (keep oil_shock; add the rest) using ONLY existing
state vars/flags for triggers (inflation, unemployment, credibility, bank_fragility,
deferred_asset, independence, political_capital, policy_rate, culture.supervisory_rigor; flags
like `crisis`, `staffed.<id>`). Loc keys ALREADY in en.json — match these ids exactly:
`evt.regional_bank_distress` (trigger bank_fragility>=0.5; options intervene[sub bank_fragility, sub operating_budget]/monitor[add bank_fragility small]),
`evt.staff_poached` (trigger any staffed.<id>; counter[sub operating_budget]/let_go[note: cannot fire via effect — just flavor + small political_capital]),
`evt.congressional_letter` (trigger inflation>=0.05; defend[add independence, sub political_capital]/accommodate[add political_capital, sub independence]),
`evt.market_jitters` (exogenous, MTTH; reassure[add credibility small]/stay_silent[]),
`evt.fiscal_stimulus` (fiscal_political, MTTH; lean_against[add credibility]/accommodate[add political_capital]),
`evt.bank_lobby` (trigger culture.supervisory_rigor>=0.5; hold_firm[add bank_fragility? no — sub, add nothing, sub political_capital]/ease[add political_capital, add bank_fragility]),
`evt.foreign_crisis` (exogenous MTTH; swap_lines[sub operating_budget, sub bank_fragility]/stand_back[add bank_fragility]),
`evt.deferred_asset_press` (trigger deferred_asset>=1; explain[add credibility small]/deflect[sub credibility small]).
Effects must use targets that exist; keep magnitudes small + sensible. Each option needs id+name(loc key)+effects.
Tests (`// SPEC-EVENT-1`, `// SPEC-EVENT-2`): eligibility honors trigger + fires_once; probability=1 w/o MTTH and in (0,1) with, rising as effective days shrink; loader flattens + validates; (EVENT-2 is mostly Session-level — assert the effect engine applies an option's effects to a state, and that loadEventCatalog options carry effects). VERIFY: npx vitest run test/event-engine.test.ts; npm run validate; npm run typecheck.

### SPEC-STAFF-3 + SPEC-COMM-9 — worker-staff-econ
```ts
// institution.ts
export class InsufficientBudgetError extends Error {}     // new
// hireStaff: deduct division.hire_cost from operating_budget (default from InstitutionParams.initial_operating_budget when absent); throw InsufficientBudgetError if budget < cost; DO NOT touch political_capital; keep DivisionAlreadyStaffedError. Keep storing competence/eff/lean/disposition as today.
export function fireStaff(state: GameState, division: Division): GameState; // clears staffed.<id> flag + deletes staff.<id>.competence/.eff/.lean/.disposition vars; pure
// chair-capital.ts
export function computeChairCapital(credibility: number, params: ChairCapitalParams, consensusCapital?: number): number; // base + floor(credibility_weight*cred) + floor(consensus_weight*(consensusCapital ?? 0))
// ChairCapitalParams gains: consensus_gain, consensus_penalty, consensus_weight, dissent_penalty_threshold (add to content/engine/chair-capital.json + schema)
```
NOTE: hireStaff currently deducts political_capital + throws InsufficientCapitalError and
test/institution.test.ts asserts that — you must UPDATE those institution.test.ts assertions
to the budget model (you may edit test/institution.test.ts for the hire-economy tests only).
Keep `InsufficientCapitalError` exported (other code imports it) but no longer thrown by hire.
Tests (`// SPEC-STAFF-3`, `// SPEC-COMM-9`): hire deducts operating_budget not political_capital; starting budget (1000) affords all 10 divisions; InsufficientBudgetError when budget short; fireStaff clears + allows rehire; computeChairCapital consensus term raises the budget and defaults to old value when omitted. VERIFY: npx vitest run test/staff-economy.test.ts test/chair-capital.test.ts test/institution.test.ts; npm run validate; npm run typecheck.

### LEAD integration (session.ts) — for awareness
fire(divisionId); escalations(): readonly GameEvent[]; resolveEscalation(eventId, optionId);
advance() draws eligible events via mulberry32(fnv1a32(`${seed}|event|${date}|${eventId}`)) and
appends fired ones to the pending queue; proposeRate updates consensus_capital from dissents and
chairCapital() passes it to computeChairCapital. hire() uses budget; getters as needed.

### SPEC-WEB-15 — worker-web (after lead integration lands the Session surface)
web/src/EscalationsPanel.tsx (in-tray; session.escalations() + resolveEscalation; testids
escalation-<id>, escalation-opt-<id>-<optId>; empty state) mounted on The Desk above the economy;
InstitutionPanel edits: REMOVE the hawk/dove (`lean`) display from candidate cards + staffed rows;
add a Dismiss button (fire-<divId>) → session.fire; label hire cost as operating-budget cost;
PersuasionView: add committee-legend caption + per-row above/below-proposal label. Loc keys exist.
Tests (`// SPEC-WEB-15`): escalation renders + resolve removes it; no hawk/dove label present;
Dismiss fires session.fire and division becomes unstaffed; legend renders.

## VERIFY before reporting: your tests + npm run validate + typecheck. Report commands+output+signatures+new schema/dir to register.
