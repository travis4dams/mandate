# MANDATE — Chair Experience: Build Contract

This is the shared contract for the `feat/chair-experience` branch. Every worker MUST follow it.
The vision: make the player *feel like the Chair of the Federal Reserve* — set rates, run the
FOMC, AND build the institution and a legacy. We are delivering this as ONE PR with many commits.

## HARD RULES (CI + PR reviewer reject violations — non-negotiable)
1. **Spec-first / TDD.** Your SPEC id already exists in `spec/requirements.md`. Write the FAILING
   test (with a `// SPEC-XXX-N` comment) BEFORE the implementation. `npm run spec:trace` fails if a
   `[testable]` requirement has no referencing test.
2. **Engine purity / determinism (SPEC-SIM-1).** No `Math.random()` and no `Date.now()` anywhere in
   `src/**`. All randomness goes through a seeded RNG from `src/engine/rng.ts` (`mulberry32`,
   `fnv1a32`). Pure functions return NEW state; never mutate inputs.
3. **No content in engine code.** Numbers/text/catalogs live in `content/`; `src/engine/**` never
   hardcodes a specific division, name, or value. Load via the validated content loader.
4. **No inline player-facing strings.** UI references localization keys via `t()`; the strings live
   in `content/localization/en.json`. The LEAD has already added every key you need (see below) — do
   NOT edit `en.json` yourself.
5. **Schema-governed content (SPEC-CONTENT-1).** New content types need a schema in `schemas/` and
   must pass `npm run validate`. Register the schema in `tools/validate-content.ts`.
6. **No real person names (SPEC-CONTENT-3).** Generated and content names must not match the
   real-person blocklist. Avoid surnames of real Fed chairs/economists in name pools.
7. **Browser content registry (SPEC-WEB-2).** Any NEW content directory the engine loads at runtime
   MUST be registered in `web/src/engine-content.ts` and covered by `web/src/engine-content.test.ts`.
   `content/engine/*.json` is already auto-globbed — params files there need no extra registration.
   NEW dirs (`content/names/`, `content/divisions/`) DO. **The LEAD owns engine-content.ts + its
   test + session.ts integration.** Do not edit those files.
8. **Web tsconfig is stricter** (`noUncheckedIndexedAccess`): guard indexed reads (`arr[i]`,
   `record[key]`) in any `src/**` imported by web, and in `web/**`.

## VERIFY before reporting done
- Engine workers: `npm run validate` (if you added content), `npx vitest run test/<your>.test.ts`,
  and `npm run typecheck`. Report exact commands + output.
- Web workers: `cd web && npx vitest run src/<your>.test.tsx` and `cd web && npx tsc --noEmit`.

## FILE OWNERSHIP (avoid collisions)
- LEAD owns (do NOT touch): `spec/requirements.md`, `content/localization/en.json`,
  `src/engine/session.ts`, `web/src/engine-content.ts`, `web/src/engine-content.test.ts`,
  `web/src/App.tsx`, `tools/validate-content.ts` (lead merges your schema registration).
  → If you need a schema registered or a Session method, note it in your report; the LEAD wires it.
- Each worker creates its OWN new files + OWN test file. Do not edit another worker's files.

## SHARED TYPES / SIGNATURES (implement exactly so the lead can wire them)

### SPEC-NAME-1 — `src/engine/names.ts` + `content/names/pools.json` + `schemas/names.schema.json`
```ts
export interface NamePools { honorifics: string[]; given_names: string[]; surnames: string[]; }
export interface GeneratedName { honorific?: string; given: string; surname: string; full: string; }
export function loadNamePools(): NamePools;                       // validated loader, module-cached
export function generateName(rng: SeededRng, pools: NamePools): GeneratedName;
export function nameForId(seed: number, npcId: string, pools: NamePools): GeneratedName;
```
- `full` is `"<honorific> <given> <surname>"` (honorific optional, ~50% of draws).
- pools.json: ~30 given_names, ~30 surnames (none matching real Fed chairs/economists), a few
  honorifics (e.g. "Dr.", "" — include an empty-string-equivalent by making honorific optional).
- Test: determinism, distinct-ids independence, 500-draw blocklist safety (import the blocklist
  used by `test/content-lint.test.ts`), pools contain no blocklisted token, validate accepts/rejects.

### SPEC-INST-1 + SPEC-INST-2 — `src/engine/institution.ts` + content + schemas
```ts
// INST-1
export interface InstitutionParams {
  initial_operating_budget: number; budget_monthly_growth: number;
  initial_political_capital: number; political_capital_baseline: number; political_capital_recovery: number;
}
export function loadInstitutionParams(): InstitutionParams;       // content/engine/institution.json
export function applyInstitutionDynamics(state: GameState, params: InstitutionParams): GameState;
// INST-2
export interface Division { id: string; name: string; desc: string; hire_cost: number; investment: number; }
export type Lean = "hawk" | "dove" | "centrist";
export interface Candidate { name: string; competence: number; lean: Lean; }
export function loadDivisionCatalog(): Division[];                // content/divisions/*.json
export function staffedFlagKey(divisionId: string): string;      // e.g. `staffed.${divisionId}`
export function generateCandidates(divisionId: string, seed: number, pools: NamePools, params: InstitutionParams & { candidate_slate_size: number }): Candidate[];
export function hireStaff(state: GameState, division: Division, candidate: Candidate): GameState;
export function institutionInvestment(state: GameState, catalog: Division[]): number;
export class InsufficientCapitalError extends Error {}
export class DivisionAlreadyStaffedError extends Error {}
```
- `candidate_slate_size` lives in institution.json too (add to schema + InstitutionParams or a
  sibling field — keep all institution params in one file/schema).
- Divisions: research, monetary_affairs, financial_stability, supervision, international (loc keys
  `division.<id>.name`/`.desc` already in en.json). hire_cost in political-capital points (e.g. 8–20),
  investment 0.1–0.3.

### SPEC-LEGACY-1 — `src/engine/legacy.ts` + `content/engine/legacy.json` + `schemas/legacy.schema.json`
```ts
export interface LegacyParams {
  term_length_months: number; reappointment_credibility_min: number;
  legacy_credibility_weight: number; legacy_mandate_bonus: number; legacy_anchor_penalty: number;
}
export function loadLegacyParams(): LegacyParams;
export function termProgress(monthsElapsed: number, params: LegacyParams): {
  termLength: number; termsServed: number; monthsIntoTerm: number; monthsToReappointment: number; reappointmentDue: boolean; };
export function evaluateReappointment(state: GameState, params: LegacyParams): { reappointed: boolean; credibility: number; threshold: number; };
export function computeLegacyScore(state: GameState, monthsElapsed: number, params: LegacyParams): number;
```
- term_length_months = 48. reappointment_credibility_min ~ 50.

## LEAD INTEGRATION (after engine modules land) — for worker awareness only
Session will gain: `npcName(npcId)`, `operatingBudget()`, `politicalCapital()`, `divisionCatalog()`,
`candidatesFor(divisionId)`, `isStaffed(divisionId)`, `institutionInvestment()`,
`hire(divisionId, candidateIndex)`, `termProgress()`, `reappointmentOutlook()`, `legacyScore()`.
`advance()` will call `applyInstitutionDynamics`. Web workers code against THIS Session surface.

## WEB (after Session surface exists)
- `web/src/theme.ts` — shared design tokens (colors, fonts, spacing). Institutional Fed aesthetic:
  deep navy + brass/gold accent + warm parchment surfaces; a serif display face for headers, clean
  sans for data. NO magic colors scattered in components — import from theme.
- SPEC-WEB-11 `AppShell.tsx` (LEAD-coordinated; designer builds it) mounts existing panels into tabs.
- SPEC-WEB-12 `InstitutionPanel.tsx`, SPEC-WEB-13 `LegacyPanel.tsx` — standalone components the shell imports.
- Restyle existing panels (Dashboard, MeetingPanel, PersuasionView, DoctrinePanel, ChartsPanel,
  StartScreen) to the theme. Keep all existing `data-testid`s and loc keys so current tests pass.
