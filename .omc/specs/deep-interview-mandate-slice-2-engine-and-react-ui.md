# Deep Interview Spec: MANDATE — Vertical Slice 2 (Rich engine + React inspector UI)

## Metadata
- Interview ID: di-2026-06-01-mandate-slice-2
- Rounds: 7 (Round 0 topology + Rounds 1–7 scoring)
- Final Ambiguity Score: ~21% (C2/C3 under gate; C1 Criteria = SPEC enumeration deferred to drafting)
- Type: brownfield (slice 1 complete: 88 tests, 7 content types, 15 testable SPECs; CAL-1 + slice-1 done)
- Generated: 2026-06-01
- Threshold: 0.2
- Threshold Source: default
- Status: PASSED (with the C1 Criteria caveat — SPEC names below are proposed; user-confirmable in spec review)

## Clarity Breakdown (final round)
| Dimension | Goal | Constraints | Criteria | Context | Weighted Ambig |
|-----------|------|-------------|----------|---------|----------------|
| C1 Engine completion | 0.85 | 0.85 | 0.45 | 0.75 | 25% |
| C2 UI / Chassis     | 0.85 | 0.70 | 0.85 | 0.45 | 19% |
| C3 Success criterion| 0.85 | 0.85 | 0.90 | 0.50 | 18% |
| **Overall** | | | | | **~21%** |

## Topology

| Component | Status | Description | Coverage |
|---|---|---|---|
| C1 Engine completion | active | "Finish the simulator." Rich macro dynamics so the slice-1 substrate produces coherent trajectories under play. | §Goal, §Engine SPEC queue. |
| C2 UI / Chassis | active | Web (Vite + React + TS) single-screen dashboard. **Functional inspector**, not polished UX. | §UI SPEC queue. |
| C3 Success criterion | active | Triple: pinned SPECs land green + RMSE bounds vs FRED under canned Volcker + your eyeball-approve of a played session demo. | §Acceptance Criteria. |
| DESIGN.md open forks | DEFERRED | Banking-network granularity, FSOC peer mechanics, reappointment-denial stakes. | Still in source spec §Non-Goals. |

## Goal

Make MANDATE *playable* in a web browser end-to-end. Slice 1 produced a deterministic substrate (clock, fog, scenarios, replays, credibility spiral, FOMC committee/vote) that emits constants under canned policy. Slice 2 adds the **macro dynamics** (Phillips curve, Okun's law, expectations, distributed lags, stochastic shocks, productivity, term structure) so a player's rate proposals actually move inflation and unemployment on lags they can feel — and ships a **single-screen Vite + React inspector UI** that exposes the engine enough to make those dynamics visible while playing.

The slice answers a narrower version of DESIGN.md's "is reading noisy data, persuading the room, and betting on a forecast satisfying?" — narrower because **slice 2 doesn't promise the UI is beautiful or fun**; it promises the engine is coherent and the UI surfaces enough state for that coherence to be visible.

## Constraints

- **CLAUDE.md hard rules carry over.** Engine purity (no `Math.random()` / `Date.now()` in `src/**`); no game content hardcoded in `src/engine/**`; no inline player-facing strings; new content types need a schema in `schemas/`; every `[testable]` SPEC must have a referencing test (`tools/spec-trace.ts`).
- **Web stack is Vite + React + TypeScript.** No SSR (it's a single-player game); deploy as static assets. Initial framework default chosen for ecosystem coverage; if React-heavy boilerplate gets noisy, contributors can write thin custom hooks rather than reaching for state-management libraries.
- **UI is a functional inspector, not polished UX.** Care most about *exposing the engine enough to see it working*. Use the `/frontend-design:frontend-design` skill in a **future** post-slice-2 spec to polish the inspector into a real player UI.
- **Calibration baseline ships with the engine.** `SPEC-CAL-1` (merged) provides real 1979–1986 FRED data + a `npm run calibrate` harness. Slice 2 engine ACs include RMSE thresholds against this baseline under the canned Volcker strategy.
- **Engine remains deterministic.** Stochastic shocks use `mulberry32(seed)`; same seed + same strategy + same scenario → bit-identical trajectory. The "shocks" are pseudo-random; the engine itself is pure.
- **Slice 2 is large.** ~8 engine SPECs + ~6 UI SPECs + the calibration thresholds. Author should expect 4–8 weeks elapsed, depending on AI-reviewer round count.

## Non-Goals (explicit for slice 2)

- **Polish.** No design system, no animation, no responsive design beyond "desktop-only single screen." Frontend-design polish is post-slice-2.
- **Multiple scenarios.** The slice-2 UI ships the 1979 Volcker scenario only; multi-scenario picker is post-slice.
- **The DESIGN.md "financial-system map" view.** Banking-network granularity stays deferred.
- **The four open DESIGN.md forks** — still deferred.
- **Multiplayer, save/load, persistence.** Refresh = new run.
- **Mobile.** Desktop browser only.
- **Forward guidance as a player-facing lever in the UI.** The engine models it (`SPEC-GUIDE-1`) but the UI exposes the rate-only lever in slice 2; the stance lever lights up in the polish slice.
- **Authentication, accounts, telemetry.** None.

## Acceptance Criteria (triple done-test)

### A) AC-1..AC-N: pinned SPEC list lands green

All proposed SPECs below merge with `claude-review` `VERDICT: APPROVE` and `npm run check` green on every PR. `spec:trace` reports every `[testable]` requirement covered.

**Engine SPECs (proposed order — ralph picks SIM-5 first as the substrate):**

- **SPEC-SIM-5** *output-gap state var* — extend `GameState.vars` with `output_gap` (default 0); `tick` updates it based on prior real rate via a simple AR(1)-ish dynamic. Bridge between rate decisions and the rest of the macro model.
- **SPEC-PHILLIPS-1** *Phillips curve* — `applyPhillipsCurve(state, params): GameState`. Inflation_t+1 = expectations_anchor + α × output_gap + β × shock. Pure; params in `content/engine/params.json#phillips`.
- **SPEC-OKUN-1** *Okun's law* — `applyOkun(state, params): GameState`. Unemployment_t+1 = natural_rate − γ × output_gap. Pure.
- **SPEC-SHOCK-1** *stochastic shock mechanism* — seeded random shocks to the Phillips curve's supply-shock term; calibrated so the variance approximates 1979-era oil price volatility. Reuses `mulberry32`. Content: `content/engine/params.json#shocks`.
- **SPEC-LAG-1** *distributed lags* — rate impact on output_gap is distributed over 6–12 months via a small fixed-lag kernel (param in content). Today's "tick advance" becomes a multi-step transformation.
- **SPEC-PROD-1** *productivity state var* — `productivity` drifts slowly with a small content-driven rate; feeds the natural unemployment rate over multi-year windows.
- **SPEC-TERM-1** *term structure* — a `long_rate` state var that follows `policy_rate` with a smoothing parameter; readable in the UI but doesn't yet feed back into the engine (slice 3 wires it to mortgage/credit channels).
- **SPEC-GUIDE-1** *forward-guidance stance* — `state.vars.forward_guidance_stance ∈ {hawkish, dovish, neutral}`; biases the expectations_anchor recovery rate. Engine model only; UI exposes it post-slice.
- **SPEC-SESSION-1** *Session façade* — `Session` class that wraps the full month-tick: applies policy decision → distributed-lag → output_gap → Phillips + Okun → expectations spiral → fog → meeting eligibility check. One pure API call per simulated month. The UI consumes this.

**UI SPECs (proposed order — ralph blocks on SESSION-1 before any UI starts):**

- **SPEC-WEB-1** *Vite + React + TS scaffolding* — `web/` directory (or root-level depending on layout), `package.json` workspace setup if needed, `npm run dev`/`npm run build`/`npm run preview`, deploy to GitHub Pages or similar (deployment is a follow-up; build artifact only in slice 2).
- **SPEC-WEB-2** *Dashboard layout* — single page: 4 chart panels + meeting panel + control bar.
- **SPEC-WEB-3** *Time-series charts* — `@observablehq/plot` (small, framework-agnostic) or recharts; renders 4 series (inflation, unemployment, policy_rate, credibility) with fog overlay. Charts consume `Session` trajectory data.
- **SPEC-WEB-4* *FOMC meeting panel* — shows current `comm.fomc_1979` members, current `state.date`, proposed-rate input, "vote" button that calls `vote()` + `applyMeetingOutcome` and displays dissent count + credibility delta.
- **SPEC-WEB-5** *Control bar* — "advance 1 month" / "advance to next FOMC meeting" buttons that call `Session.advance()`. Optional speed slider.
- **SPEC-WEB-6** *Four-question hover tooltip* — hover over any number to see (what it measures / how it connects / how your levers move it / how much you trust it now). Slice 2 = sparse text strings; polish slice replaces them with proper UX.

That's 9 engine SPECs + 6 UI SPECs = **15 SPECs**. (Slice 1 was 6 SPECs + post-review fixes; slice 2 is roughly 2.5× larger by SPEC count.)

### B) AC-CAL: calibration RMSE thresholds against FRED

Under the canned `replay.1979_volcker_chair_strategy` strategy applied through the new `Session` API:

- `policy_rate` RMSE vs FRED `fed_funds_rate` ≤ 0.005 (this is essentially exact since the player follows the script; threshold catches replay-machinery regressions).
- `inflation` RMSE vs FRED CPI YoY ≤ 0.03 (3 percentage points — directional, not predictive).
- `unemployment` RMSE vs FRED UNRATE ≤ 0.025.

`tools/calibrate.ts` (extended from CAL-1) prints these three RMSEs alongside the comparison CSV. The thresholds are tunable in `content/engine/calibration_thresholds.json` (or similar — content-driven so re-calibration doesn't require code change).

### C) AC-DEMO: user demo + sign-off

After ralph completes A and B, you (the user) play one full 1979 Volcker session in the browser (`npm run dev`) and:

1. Advance through ~89 months, proposing rates at each FOMC meeting.
2. Observe inflation come down (or not), unemployment rise (or not), credibility track or crater.
3. Comment "looks plausible" (or specific feedback) on the integration PR or in the conversation.

This AC is intentionally subjective. The two automated gates (A + B) handle the rest.

## Implementation Steps

### Phase 0 — Pre-slice prep

- Confirm `npm run check` and `npm run calibrate` are green on `main` (CAL-1 merged).
- Add `web/` directory placeholder (or decide on root-level layout) — pick layout in SPEC-WEB-1's planning.
- Decide deployment: GitHub Pages? Netlify? Cloudflare Pages? For slice 2, "produces a build artifact" is enough; deploy step is a follow-up.

### Phase 1 — Engine substrate (sequential, no UI yet)

1. `SPEC-SIM-5` output_gap
2. `SPEC-LAG-1` distributed lags
3. `SPEC-PHILLIPS-1` Phillips curve (depends on SIM-5)
4. `SPEC-OKUN-1` Okun's law (depends on SIM-5)
5. `SPEC-SHOCK-1` shocks (depends on PHILLIPS-1)
6. `SPEC-PROD-1` productivity drift
7. `SPEC-TERM-1` term structure
8. `SPEC-GUIDE-1` forward-guidance stance
9. `SPEC-SESSION-1` Session façade (depends on all engine SPECs above)

`SPEC-SHOCK-1`, `SPEC-PROD-1`, `SPEC-TERM-1`, `SPEC-GUIDE-1` are parallelizable after SIM-5 + PHILLIPS-1 land. Serialization rule still applies to `content/engine/params.json`.

### Phase 2 — Calibration extension

10. Extend `tools/calibrate.ts` to emit the three RMSEs against FRED. Add content `content/engine/calibration_thresholds.json` + schema. Bake into `npm run check` as a soft gate (warn on threshold breach; not fail-CI in slice 2 — your sign-off is the gate).

### Phase 3 — Web UI

11. `SPEC-WEB-1` Vite + React + TS scaffolding
12. `SPEC-WEB-2` Dashboard layout
13. `SPEC-WEB-3` Time-series charts (depends on SESSION-1 + WEB-2)
14. `SPEC-WEB-4` FOMC meeting panel (depends on SESSION-1 + WEB-2)
15. `SPEC-WEB-5` Control bar
16. `SPEC-WEB-6` Four-question hover tooltip (sparse — frontend-design slice replaces)

WEB-3 / WEB-4 / WEB-5 / WEB-6 are parallelizable after WEB-1 + WEB-2 land.

### Phase 4 — Demo + sign-off

User plays one session; signs off in the integration PR or chat; ralph stops.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Engine calibration consistently misses RMSE thresholds | Medium | Medium | Thresholds live in content; re-tune coefficients (no code change). Honest about model limits — slice 2 isn't a research-grade DSGE model. |
| Slice 2 turns into a 3-month project | Medium | Medium | Pinned SPEC list + 3-retry budget per SPEC + park-and-report on hard failures. Same ralph rhythm as slice 1. |
| React stack choice was wrong (slow dev) | Low | Low | Vite + React + TS is the well-known default; if it bites, switching to a thinner stack within the same Vite host is a 1–2 day refactor. |
| UI exposes engine bugs that didn't surface in golden replays | High | Medium | Good — the UI is exactly the inspector we need to catch them. Each bug becomes a follow-up SPEC or a content tuning PR. |
| Four-question tooltips become a UX rabbit-hole | Medium | Low | Slice 2 ships sparse plain-text tooltips. Polish slice uses `/frontend-design` to make them real. |
| `web/` directory layout fights `npm`/`tsc` config | Low | Medium | Likely solved by Vite's defaults; if not, slice 2 makes the call (workspace vs root vs subdir) in SPEC-WEB-1's plan. |
| Forward-guidance modeling overcommits to a specific transmission channel | Medium | Low | SPEC-GUIDE-1 biases the expectations recovery rate only; doesn't claim Taylor-rule-with-FG. Content-tunable. |

## Tradeoff Tensions (acknowledged)

1. **UI polish vs engine fidelity.** Slice 2 is "Rich engine + functional UI." The user explicitly chose this orientation: care most about *exposing the engine enough to see it working*. Future polish slice uses `/frontend-design` to invert: "polish the inspector, no engine changes."
2. **Calibration as gate vs calibration as signal.** AC-CAL gates merge with RMSE thresholds — but only as soft thresholds (warn, not fail) in slice 2. The user's eyeball is the hard gate. Avoids the trap of fighting calibration RMSE chasing decimals.
3. **Distributed lags vs single-period lags.** Slice 1 used one-period everywhere. Slice 2 introduces distributed lags via SPEC-LAG-1 — adds a small ring buffer to state for the lag kernel. Future modelers can tune the kernel; the architecture supports it.

## Ontology (Key Entities — new/extended in slice 2)

Existing (from slice 1): GameState, GameStateSnapshot, Scenario, Replay, ReplayAction, Committee, CommitteeMember, FomcVote, CredibilityParams, FogParams, Calibration.

**New in slice 2:**

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| OutputGap | core domain | `state.vars.output_gap` (number, signed) | drives Phillips + Okun |
| PhillipsCurveParams | content | α (output_gap coeff), β (shock coeff), expectations_anchor weight | populates `content/engine/params.json#phillips` |
| OkunParams | content | γ (output_gap → unemployment coeff), natural_rate (drifts via productivity) | `content/engine/params.json#okun` |
| ShockParams | content | variance, autocorrelation, jump prob | seeded shock generation |
| LagKernel | content | array of weights summing to 1 | how rate impacts output_gap over time |
| Productivity | core domain | `state.vars.productivity` | slow drift; feeds natural_rate |
| LongRate | core domain | `state.vars.long_rate` | follows policy_rate with smoothing |
| ForwardGuidanceStance | core domain | `state.vars.forward_guidance_stance ∈ {hawkish, dovish, neutral}` | biases expectations recovery |
| Session | runtime | wraps tick + apply* + meeting | UI consumes; tests can drive |
| WebApp | runtime | Vite + React + TS in `web/` (or root) | consumes Session API |
| DashboardLayout | runtime | single-page React component tree | hosts charts + meeting panel |
| ChartSeries | runtime | observable Plot or recharts data | renders state trajectory |
| MeetingPanel | runtime | React component | propose rate → vote() → applyMeetingOutcome |
| FourQuestionTooltip | runtime | sparse text per number | replaces in polish slice |
| RMSEThresholds | content | per-series RMSE caps | calibration gate |

## Interview Transcript

<details>
<summary>Full Q&A (7 rounds + Round 0 topology)</summary>

### Round 0 — Topology
**Q:** Is the 3-component topology right? **A:** "Affixing not fixing" — slice 2 = finishing engine + building chassis (UI); user determines success criterion; open forks stay deferred.

### Round 1 — C3 / Goal
**Q:** When you say 'play it some,' what's the moment that tells you slice 2 is done? **A:** Coherent macro dynamics + readouts.

### Round 2 — C2 / Goal
**Q:** Runtime platform for slice 2? **A:** Web (Vite + framework).

### Round 3 — C1 / Goal
**Q:** Engine fidelity? **A:** Rich (stochastic shocks + multiple lags).

### Round 4 — C2 / Constraints (Contrarian mode)
**Q:** Stack within Vite? **A:** React (familiar default).

### Round 5 — C2 / Criteria
**Q:** UI scope? **A:** Single-screen dashboard.

### Round 6 — C1+C3 (Simplifier mode)
**Q:** Trim Rich to Standard or smaller? **A:** Keep Rich — explicit sign-up.

### Round 7 — C3 / Criteria
**Q:** Done-test rubric? **A:** Triple — AC list + RMSE + your demo.

**Mid-interview clarification (after Round 7):** "Use `/frontend-design:frontend-design` skill in a future spec to improve the UI. Care most about exposing the engine enough to see it working." Recorded as: slice 2 = functional inspector; frontend-design slice = polish.

</details>

## Open items flagged for spec review

1. **Engine SPEC names are proposed.** `SPEC-SIM-5`, `SPEC-PHILLIPS-1`, `SPEC-OKUN-1`, etc. — confirm prefixes are right vs the existing `SPEC-XXX-N` style. (Look at how slice 1's SPEC ids were grouped; `SPEC-CRED-4` lives under the credibility namespace, so `SPEC-PHILLIPS-1` may be fine, or you may want `SPEC-MACRO-1`/`SPEC-MACRO-2`/etc. instead.)
2. **Layout choice for `web/`.** Workspace? Root-level package overhaul? Submodule? Defer to SPEC-WEB-1 planner.
3. **Deployment target.** GitHub Pages is simplest (static); could also do Netlify or Cloudflare Pages. Build artifact only in slice 2; deploy is post-slice.
4. **RMSE thresholds (0.03, 0.025, 0.005).** Strawman values. Should be tunable in content; tune-only-no-code if calibration drifts.
5. **Forward-guidance stance values.** Currently three (hawkish/dovish/neutral). Future could parameterize on a continuous scale.
6. **Frontend-design slice timing.** Right after slice 2 ships? Or interleaved? You said "future spec" — could be slice 3 entirely focused on UI polish (uses `/frontend-design` skill); could also be a smaller cleanup PR after slice 2 demo if you have specific complaints.

## Follow-ups (post-slice-2, not gating)

- **Frontend-design slice** — invoke `/frontend-design:frontend-design` skill on the inspector UI; produce a real player UX (typography, layout, color, animation, tooltip polish). Engine untouched.
- **DESIGN.md open forks** — banking-network granularity, FSOC peer mechanics, reappointment stakes. Each is its own slice.
- **Multi-scenario support** — 2008 GFC, COVID, 1913 founding-era. Slice-2 UI ships 1979 Volcker only.
- **Save/load / session persistence.**
- **Multiplayer.**
- **`SPEC-CRED-5`** — move `CRED_MIN`/`CRED_MAX` + meeting-outcome weights to content (flagged in slice 1).
- **`SPEC-SIM-3` ANCHOR_THRESHOLD references** in `spec/requirements.md` SPEC-CRED-4 description — stale; refresh.
- **`.github/workflows/claude-review.yml` `--max-turns`** — 25 was too tight for medium PRs; bump to 50.
- **Engine variables registry** (`docs/engine-vars.md`) — catalogue every `state.vars[*]` key, who writes, who reads, expected range. Slice 2 adds 4+ new vars (output_gap, productivity, long_rate, forward_guidance_stance); registry due.
- **Distribution-property tests for SPEC-FOG-1** — verify mean ≈ truth, variance ≈ noise_scale². Pair with SHOCK-1's shock-distribution tests.

## Things flagged for your review

1. **15 SPECs in slice 2** is large. The interview confirmed your appetite for it. If the AI-reviewer rounds add 3× the wall-clock per SPEC vs slice 1, this is a multi-month slice. Confirm or trim before ralph starts.
2. **Soft-vs-hard RMSE gate.** I proposed soft (warn, your demo is hard gate). If you'd rather hard-fail CI on threshold breach, say so.
3. **Web UI layout.** Subdir `web/` vs workspace vs root-level package overhaul — first call ralph makes in SPEC-WEB-1.
4. **`/frontend-design` polish slice cadence** — after slice 2 or interleaved?
