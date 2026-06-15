# MANDATE — "The Institution That Matters" (design spec)

*Status: approved direction (user delegated operational/creative decisions 2026-06-15).*
*Builds on the `feat/chair-experience` work (PR #130): name generator, institution
resources, divisions, legacy, Office-of-the-Chair shell.*

## Goal
Turn staffing and supervision from flavor into the load-bearing core of the game.
The Chair manages **monetary policy, supervision of the banking system, relationships
with Congress/President, and the organization itself** — and those four are
intertwined: who you hire shapes institutional *culture*, culture shapes the economy,
the economy shapes your standing, and your standing funds the institution. The target
feel is Victoria-3 "line go up": long-run compounding stats (credibility, legacy,
institutional capacity, financial stability) with visible trend lines and real
trade-offs, plus punctuating set-pieces (crises, testimony).

Fidelity anchors (researched 2026-06-15): the Fed's real Board divisions; the post-2022
**deferred asset** mechanics (net income negative when the policy rate exceeds the
legacy portfolio yield; remittances to Treasury halt until repaid); **CAMELS**/**LFI**
supervisory rating vocabulary; semiannual **Monetary Policy Report** + Humphrey-Hawkins
testimony (Feb/Jun report, Mar/Jul testimony) to Senate Banking & House Financial Services.

## Delivery: two reviewable PRs
- **PR A — Institution & economy** (this spec, full detail): director skill model, per-division function effects, institutional culture, banking fragility + endogenous crises, balance sheet / net income / deferred asset, Congressional pressure on political capital AND independence. Engine + content + UI.
- **PR B — Monetary Policy Report & testimony** (outlined here, detailed in its own pass): semiannual testimony set-piece reusing the hearing Q&A mechanic, state-driven questions, outcomes feeding political capital / credibility / reappointment.

---

## PR A

### A1. Director skill vectors + division fit — `SPEC-STAFF-1`
Candidates (already generated names, SPEC-NAME-1) gain a **skill vector** in [0,1]:
`forecasting`, `markets`, `supervision`, `communication`, `crisis`. Each is drawn
deterministically from the candidate's seeded stream (extend `generateCandidates`).
`lean` (hawk/dove/centrist) stays.

Each division declares **`skill_weights`** (a map over the five skills, summing to 1) in
its content file. A director's **effectiveness** for a division:
`E = Σ skill_weights[s] * director.skills[s]` ∈ [0,1].

`directorEffectiveness(skills, weights): number` is pure. The same person is excellent in
one division and mediocre in another → the matching choice has teeth. A mismatch isn't
just weaker; below a content `competence_floor` the division **underperforms** (effects
can go slightly negative — e.g. a light-touch supervisor lets fragility build).

Content: each `content/divisions/*.json` gains `skill_weights`. New schema fields.
`hireStaff` stores the chosen director's skills + effectiveness in state
(`staff.<id>.eff`, and per-skill if needed). Pure; existing INST-2 behavior preserved.

### A2. Per-division function effects — `SPEC-DIV-1`
A pure resolver `divisionEffects(state, catalog): DivisionEffects` returns the live
modifiers contributed by *staffed* divisions, each scaled by its director's effectiveness
`E` and a content `effect_strength`. Channels:
- **Research & Statistics** → `fog_factor` (multiplies observation + forecast noise down) — finally wires `applyForecastQuality` into the briefing via institutional investment.
- **Monetary Affairs** → `transmission` (reduces the credibility penalty on market surprises; tightens real-rate→output reliability).
- **Financial Stability** → `fragility_visibility` (lifts fog on the fragility gauge) + partial `fragility_mitigation`.
- **Supervision & Regulation** → primary `fragility_mitigation` and `crisis_severity_reduction`.
- **International Finance** → `external_shock_damp` (scales `supply_shock_sigma` down).

Effects are content-governed (no magic numbers in engine). `Session` exposes the resolved
effects so the UI can show "what this division is doing for you." Where a channel maps to
an existing param (fog noise, supply sigma, surprise penalty, forecast noise), the effect
multiplies/offsets that param at the call site in `Session.advance()` / `proposeRate()`.

### A3. Institutional culture — `SPEC-CULTURE-1`
Two slow-moving culture aggregates persisted in state, recomputed as an EWMA toward the
staffed directors' traits each month (so culture *lags* and *persists* — replacing people
shifts it gradually):
- `culture.policy_lean` ∈ [-1,1] — mean `lean` of staffed directors (hawkish↔dovish). Biases committee drift slightly and expectations re-anchoring.
- `culture.supervisory_rigor` ∈ [0,1] — weighted by Supervision/Financial-Stability effectiveness. Feeds fragility accumulation (lax culture → faster build) independent of the current director, modelling institutional memory.

Pure `applyCultureDrift(state, catalog, params)`. Content params for EWMA half-life and
the feedback weights. This is the "choices shape culture shapes economy" loop.

### A4. Banking fragility — `SPEC-FRAG-1`
A `bank_fragility` var ∈ [0,1] (read as a CAMELS-like composite; 0 = pristine, 1 = crisis-prone).
Pure `applyFragilityDynamics(state, effects, culture, params)`:
`fragility += accumulation − mitigation`, where
- `accumulation = base + loose_policy_weight * max(0, −realGap) + credit_growth_weight * easing_speed + (1 − supervisory_rigor) * lax_weight` (loose policy and sustained easing breed fragility; FIH-style),
- `mitigation = supervision_mitigation * E_supervision + finstab_mitigation * E_finstab + natural_decay`.
Clamped [0,1]. Content-governed. Runs each month in `advance()`.

### A5. Endogenous financial crises — `SPEC-CRISIS-1`
Each month, a **seeded** Bernoulli draw (session RNG, SPEC-SIM-1) with
`p = crisis_base + crisis_slope * max(0, fragility − crisis_threshold)`. On a hit, a pure
`applyFinancialCrisis(state, effects, params, rng)` injects a credit/demand shock:
unemployment jumps, inflation falls, credibility takes a hit, `output_gap` craters,
and `fragility` partially resets (the cleansing). Severity scaled **down** by
`crisis_severity_reduction` (Supervision). A `crisis_active`/cooldown flag prevents
back-to-back. Deterministic given seed. Surfaced as a flagged event in the UI + a chart marker.

### A6. Balance sheet, net income, deferred asset — `SPEC-FED-1`
New vars (scenario-set with defaults; 1979 small balance sheet, 2008/2020 large):
- `balance_sheet` (SOMA size, normalized units),
- `portfolio_yield` — book yield, EWMA toward `long_rate` with a **long** half-life (portfolio rolls slowly); cold-starts to `policy_rate`.
- Derived each month: `net_income = (portfolio_yield − policy_rate) * balance_sheet` (carry on the balance sheet — when short funding cost exceeds book yield, negative).
- `deferred_asset` — when `net_income < 0`, `deferred_asset += −net_income`; when positive, pays down `deferred_asset` first, remainder is "remittable surplus." `operating_budget` (division funding) grows with surplus and is squeezed while a deferred asset is outstanding (you can't easily fund new hires when the Fed is losing money).
Pure `applyFedFinances(state, params)` each month after `applyTermStructure` (needs `long_rate`).

### A7. Congressional pressure — `SPEC-CONGRESS-1`
When `deferred_asset` exceeds a content threshold (or net income is negative ≥ K months),
a pure `applyCongressionalPressure(state, params)` drains `political_capital`, applies a
small **independence** pressure (a new `independence` var ∈ [0,100], the fiscal-dominance
axis from DESIGN.md — high government attention erodes it), and sets a
`flag: pending_inquiry.deferred_asset` that PR B's testimony reads to spawn a pointed
question. Independence also gates: very low independence amplifies the credibility cost of
caving and is a lose-condition seed (captured). Content-governed thresholds.

### A8. Wiring + UI
- `Session` getters: `divisionEffects()`, `culture()`, `bankFragility()`, `netIncome()`, `deferredAsset()`, `balanceSheet()`, `independence()`, and crisis status. `advance()` runs the new pure steps in a deterministic order (finances after term structure; fragility after macro; crisis draw after fragility; culture drift; congressional pressure).
- Candidate cards show the **skill vector** and the computed **fit** for *that* division (so the matching choice is legible — "this econometrician is a poor fit for Supervision").
- The Institution tab shows division effects ("what each is doing"), the culture readout, balance sheet / net income / deferred asset, and a Congressional-pressure indicator.
- The Desk tab adds a **Financial Stability** readout (fragility gauge, fogged by Financial-Stability staffing) + the new vars; crises surface as event banners + chart markers; `independence` joins credibility as a headline gauge.
- All strings are loc keys; all numbers are content.

### A9. Scenario seeding
The three scenarios get sensible `balance_sheet` / `bank_fragility` / `independence`
starting values (1979: small sheet, moderate fragility, solid independence; 2008: large
sheet, **high** fragility, crisis regime; 2020: large sheet). Defaults cover absence.

---

## PR B (outline — own detailed spec later)

### Monetary Policy Report + testimony — `SPEC-MPR-1` (+ web)
- Schedule-gated semiannual set-piece (Feb/Jul) like meeting months.
- Reuse/extend the hearing schema: a `testimony` content type whose question pool is
  **filtered by live state** — a large inflation gap, an active deferred asset
  (`pending_inquiry.deferred_asset`), recent financial stress / high fragility each
  unlock a pointed question; a `communication`-strong institution softens the difficulty.
- `resolveTestimony(answers, testimony, state): modifiers` → political capital +
  credibility + independence deltas; some answers commit a stance (doctrine-like).
- Feeds reappointment. UI: a testimony flow modeled on the confirmation hearing, surfaced
  as a scheduled obligation on the Desk/Committee.

---

## Determinism, purity, governance (applies to everything)
- All randomness via the session's seeded RNG (`mulberry32`/`fnv1a32`); no `Math.random`/`Date.now` in `src/**`.
- All pure functions return new state; never mutate inputs.
- All numbers/text live in `content/`; new content types get schemas + `validate-content` registration + browser-registry registration (`engine-content.ts`) + its test for any new directory.
- Spec-first: each `SPEC-*` gets a failing test first, then implementation; `npm run check` green before PR.
- New player-facing strings are localization keys only.

## "Line go up" loop (why it's fun)
Hire well → divisions effective → fog lifts, fragility falls, shocks dampened → smoother
cycle, mandate on-target more often → credibility & legacy rise, reappointment secure →
political capital + surplus → fund more/better hires → culture compounds. Neglect
supervision or over-ease → fragility builds → a crisis erupts → unemployment spikes,
credibility craters, Congress circles, deferred asset bites independence → harder game.
The trend lines (credibility, legacy, fragility inverted, institutional capacity,
independence) are the dashboard you watch climb.
