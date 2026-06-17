# MANDATE — PR A "Institution That Matters": Build Contract

Branch: `feat/institution-depth`. Goal: make staffing + supervision the load-bearing core —
divisions drive real economic channels, a banking-fragility system erupts into endogenous
crises when neglected, and the Fed's balance sheet can flip to a loss that drags the Chair
before Congress. Full design: `docs/superpowers/specs/2026-06-15-institution-that-matters-design.md`.

## HARD RULES (CI + PR reviewer reject violations)
1. **Spec-first/TDD.** Your SPEC id is in `spec/requirements.md`. Write the FAILING test first
   (with `// SPEC-XXX-N` comments), then implement. `npm run spec:trace` enforces a test per `[testable]`.
2. **Engine purity (SPEC-SIM-1).** No `Math.random()`/`Date.now()` in `src/**`. Randomness via the
   caller's seeded `rng` (`mulberry32`/`fnv1a32` from `src/engine/rng.ts`). Pure functions return NEW
   state; never mutate inputs (copy `state.vars`/`state.flags` before writing).
3. **No content in engine code.** All numbers/text/catalogs in `content/`; load via the validated loader.
4. **No inline player-facing strings.** UI uses `t()`; strings live in `en.json` — the LEAD already
   added every key you need. Do NOT edit `en.json`.
5. **Schema-governed content.** New content types get a schema in `schemas/`; assert accept/reject in
   your test via `loadValidatedFile`/ajv directly. Do NOT edit `tools/validate-content.ts` (lead owns it).
6. **No real person names (SPEC-CONTENT-3).**
7. **Browser registry / web tsconfig** — lead handles `engine-content.ts`; web workers guard indexed reads.

## STATE CONVENTIONS (so independent modules compose without importing each other)
`state.vars` is `Record<string, number>`; `state.flags` is booleans. New keys:
- `staff.<divId>.competence` (exists), `staff.<divId>.eff` (effectiveness, SPEC-STAFF-1), `staff.<divId>.lean` (numeric: hawk=+1, centrist=0, dove=-1, SPEC-STAFF-1 stores it).
- `bank_fragility` ∈[0,1]; `balance_sheet`, `portfolio_yield`, `net_income`, `deferred_asset`; `independence` ∈[0,100]; `culture.policy_lean` ∈[-1,1]; `culture.supervisory_rigor` ∈[0,1].
- flags: `staffed.<divId>` (exists), `crisis` (a crisis is active this month), `pending_inquiry.deferred_asset`. Var `crisis_cooldown` (months remaining) is fine if you need it (lead wires the loop).
All new vars **default from content `initial_*`** when absent (SPEC-PROD-1 pattern) so existing scenarios/tests are unaffected.

## FILE OWNERSHIP
- **LEAD owns (do not touch):** `spec/requirements.md`, `content/localization/en.json`,
  `src/engine/session.ts`, `web/src/engine-content.ts`(+test), `web/src/App.tsx`,
  `tools/validate-content.ts`, all `content/scenarios/*.json` (lead seeds new starting vars).
- **worker-staff owns:** `src/engine/institution.ts`, `schemas/division.schema.json`,
  ALL `content/divisions/*.json` (incl. the 5 new), `content/engine/institution.json` if needed,
  `test/staff.test.ts`. (SPEC-STAFF-1 + SPEC-DIV-2.)
- Each other worker creates its OWN new module + content + schema + test (listed below).

## SIGNATURES (implement EXACTLY; modules stay independent by taking deps as params)

### SPEC-STAFF-1 + SPEC-DIV-2 — extend `src/engine/institution.ts` (worker-staff)
```ts
export interface DirectorSkills { forecasting:number; markets:number; supervision:number; communication:number; crisis:number; }
// Candidate gains: skills: DirectorSkills
// Division gains: skill_weights: DirectorSkills; channel: DivisionChannel; unlocked_by?: string
export type DivisionChannel = "fog"|"transmission"|"fragility_visibility"|"fragility_mitigation"|"crisis_severity"|"external_shock"|"org"|"political"|"oversight";
export function directorEffectiveness(skills: DirectorSkills, weights: DirectorSkills): number; // Σw·s / Σw ∈ [0,1]
// generateCandidates: also draw `skills` deterministically from the per-candidate seeded stream.
// hireStaff: also set state.vars[`staff.${div.id}.eff`] = directorEffectiveness(candidate.skills, div.skill_weights)
//            and state.vars[`staff.${div.id}.lean`] = (candidate.lean==="hawk"?1: candidate.lean==="dove"?-1:0)
```
- SPEC-DIV-2: ship ≥10 divisions in `content/divisions/` (research, monetary_affairs, financial_stability, supervision, international, rbops, consumer_community, legal, coo, oig), each with `skill_weights` (all five skills) + `channel`. Map channels: research→fog, monetary_affairs→transmission, financial_stability→fragility_visibility, supervision→fragility_mitigation, international→external_shock, rbops→crisis_severity, consumer_community→political, legal→political, coo→org, oig→oversight. Keep existing `hire_cost`/`investment`/loc keys; loc keys for the 5 new divisions already exist in en.json.

### SPEC-DIV-1 — new `src/engine/division-effects.ts` (worker-diveffects; depends on staff's schema/conventions)
```ts
export interface DivisionEffects { fogFactor:number; transmission:number; fragilityVisibility:number; fragilityMitigation:number; crisisSeverityReduction:number; externalShockDamp:number; }
export function loadDivisionEffectsParams(): DivisionEffectsParams; // content/engine/division-effects.json
export function divisionEffects(state: GameState, catalog: Division[], params: DivisionEffectsParams): DivisionEffects;
```
Identity when nothing staffed: `{ fogFactor:1, transmission:0, fragilityVisibility:0, fragilityMitigation:0, crisisSeverityReduction:0, externalShockDamp:1 }`. Each staffed division adds its channel contribution = `effect_strength[channel] * eff` (read `state.vars["staff.<id>.eff"]`); a fit below `competence_floor` yields a reduced/slightly-negative contribution. fogFactor/externalShockDamp are `1 − Σcontribution` clamped to (0,1].

### SPEC-CULTURE-1 — new `src/engine/culture.ts` (worker-culture)
```ts
export function loadCultureParams(): CultureParams; // content/engine/culture.json
export function applyCultureDrift(state: GameState, catalog: Division[], params: CultureParams): GameState;
```
EWMA `culture.policy_lean` toward mean `staff.<id>.lean` over staffed divisions (baseline 0 if none); `culture.supervisory_rigor` toward effectiveness-weighted `staff.supervision.eff`+`staff.financial_stability.eff` (baseline from content). Half-life in content.

### SPEC-FRAG-1 — new `src/engine/fragility.ts` (worker-frag)
```ts
export function loadFragilityParams(): FragilityParams; // content/engine/fragility.json
export function applyFragilityDynamics(state: GameState, inputs: { realGap:number; easingSpeed:number; supervisoryRigor:number; fragilityMitigation:number }, params: FragilityParams): GameState;
```
`fragility += base + loose_policy_weight*max(0,−realGap) + easing_weight*max(0,easingSpeed) + lax_weight*(1−supervisoryRigor) − (supervisory_decay*fragilityMitigation + natural_decay)`, clamp [0,1], default `initial_fragility`.

### SPEC-CRISIS-1 — new `src/engine/crisis.ts` (worker-crisis)
```ts
export function loadCrisisParams(): CrisisParams; // content/engine/crisis.json
export function crisisProbability(fragility: number, params: CrisisParams): number; // clamp(base+slope*max(0,frag−threshold),0,1)
export function applyFinancialCrisis(state: GameState, severityReduction: number, params: CrisisParams, rng: SeededRng): GameState;
```
Crisis: unemployment += severity*(1−severityReduction) (+ small rng jitter), inflation −=, credibility −=, output_gap −=, bank_fragility → post_crisis_fragility. Pure; clamp vars to valid ranges.

### SPEC-FED-1 — new `src/engine/fed-finances.ts` (worker-fed)
```ts
export function loadFedFinancesParams(): FedFinancesParams; // content/engine/fed-finances.json
export function applyFedFinances(state: GameState, params: FedFinancesParams): GameState;
```
`portfolio_yield` EWMA toward `long_rate` (cold-start `policy_rate`); `net_income=(portfolio_yield−policy_rate)*balance_sheet`; if <0 grow `deferred_asset`, else pay it down then lift `operating_budget`. Defaults from content.

### SPEC-CONGRESS-1 — new `src/engine/congress.ts` (worker-congress)
```ts
export function loadCongressParams(): CongressParams; // content/engine/congress.json
export function applyCongressionalPressure(state: GameState, params: CongressParams): GameState;
```
If `deferred_asset>inquiry_threshold`: drain `political_capital` + `independence` (clamp), set flag `pending_inquiry.deferred_asset`. Below: no-op; clear flag when `deferred_asset<=0`. Default `independence` from content.

## LEAD INTEGRATION (after modules land) — for awareness only
`Session.advance()` order each month: …existing… → `applyTermStructure` → `applyFedFinances` →
`applyProductivityDrift` → `applyInstitutionDynamics` → `applyCultureDrift` → compute
`divisionEffects` → `applyFragilityDynamics`(inputs from effects+culture+realGap+easingSpeed) →
seeded Bernoulli `crisisProbability` → maybe `applyFinancialCrisis` → `applyCongressionalPressure`.
`divisionEffects.fogFactor` scales fog/forecast noise; `externalShockDamp` scales supply-shock sigma;
`transmission` softens the surprise credibility penalty. Lead adds Session getters + scenario seeding
+ schema registration + browser registry.

## VERIFY before reporting done
Engine: `npx vitest run test/<your>.test.ts`, `npm run validate` (exit 0), `npm run typecheck`. Report exact commands + output + final signatures + any content dir/schema the lead must register.
