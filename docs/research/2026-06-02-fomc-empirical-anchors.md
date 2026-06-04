# FOMC empirical anchors for MANDATE calibration

Snapshot: 2026-06-02. Compiled from a research pass commissioned during the
player-feedback round on PR #25 (committee spreads were absurd; credibility
ratcheted only down). PR #27 implements SPEC-COMM-3 based on these anchors;
the remaining three follow-up specs are queued.

## 1. Dot-plot dispersion (modern, 2012-2025)

The SEP has 19 participants (7 Governors + 12 Reserve Bank Presidents). Dispersion:

- Current year: full range 25-75bp; central tendency ~30bp.
- 1-2y horizon: full range 125-200bp (occasionally 250bp in regime-change windows);
  central tendency ~50-100bp.
- Standard deviation across dots: ~30-50bp at near horizons, 50-80bp at longer ones.

**Game implication:** typical hawk-vs-dove spread at the same meeting is ~150bp,
not 1500bp. The slice-2 model produced a ~1550bp spread at the 1979 starting
state (hawk preferred ≈ 19% vs dove preferred ≈ 3.6%, evaluated at the 5%
neutral_rate; at the actual 10.75% starting policy rate the absolute numbers
shift to ~24.9% / ~9.3% but the spread is roughly stable). The diagnostic to
track is the spread itself, not the absolute numbers — they depend on what
proposal anchors the math.

## 2. Reaction-function coefficients

Modern empirical median FOMC participant:
- Inflation coefficient: 1.5-2.0 (centered ~1.7, SD ~0.3)
- Output-gap coefficient: 0.25-0.5 (centered ~0.4, SD ~0.2)
- **Inertia (smoothing on lagged rate): ~0.85-0.92**

Inertia is what's currently missing from the model. The FOMC doesn't move from
3% to 20% in one meeting; their preferred rate is mostly the prior rate, with
a small reaction term layered on. That's why dots cluster.

## 3. 1979 FOMC structure + dissent rate

- **12 voters: 7 Governors + NY Fed (permanent) + 4 rotating regional presidents** (the
  remaining 7 regional presidents attend and speak but don't vote in a given year).
- 1979-80 was a peak dissent period — Volcker's full tenure averaged ~1 dissent
  per meeting; during the 1979-82 disinflation, 1-3 dissents was normal, often
  split across both flanks at once.

**Game implication:** the current 7-member committee is wrong; should be 12.
"Everyone dissents" is also wrong; 1-3 dissents is the realistic baseline.

## 4. Credibility dynamics (Goodfriend & King and others)

- A single on-target outcome does NOT re-anchor expectations.
- Volcker's announcement (Oct 1979) didn't move 10y yields meaningfully —
  they climbed FURTHER through 1980-81. Markets expected a U-turn.
- Re-anchoring took **3-7 years** of sustained on-target performance plus
  visible willingness to bear costs (the recession).
- About half of the actual disinflation came from expectations re-anchoring,
  not from the direct demand channel.

**Game implication:** the credibility model is sound at the
`applyMeetingOutcome` level — it already applies `+3` on `onTarget: true`. The
slice-2 bug was upstream: `src/engine/session.ts` hardcoded `onTarget: false`
(a leftover SESSION-0 TODO), so the gain lever could never fire. SPEC-CRED-5
wires the existing mechanic to a real check rather than introducing new math.
Sustained-performance gating (Goodfriend-King "incredible disinflation"
finding) emerges naturally because the +3 per meeting is small relative to
the dissent erosion; getting credibility back to anchored takes many on-target
meetings in a row, matching the historical 3-7 year window.

## 5. Volcker rate path (monthly fed funds, ~)

| Date | Eff FF |
|---|---|
| Sep 1979 | 11.4 |
| Oct 1979 | 13.8 |
| Mar 1980 | 17.6 (first peak) |
| Jul 1980 | 9.0 (sharp drop, recession-driven) |
| Aug 1980 | 9.6 (tightening resumes) |
| Dec 1980 | 18-19 |
| Jun 1981 | 19.1 (all-time peak monthly avg) |
| Nov 1981 | 13-14 |
| Apr 1982 | 15 (brief reversal) |
| Jul 1982 | 11.5-12 (sustained easing begins) |
| Dec 1982 | 9.0 |

These are the high-frequency anchors from FRED + Fed historical narratives. The
committed replay (`content/replays/1979_chair_tightening.json`) is a coarser
12-point sequence sampled at meeting cadence; it deliberately omits some
inflection months listed above (Sep 1979, Aug 1980, Nov 1981, Apr 1982) and
rounds Mar 1980 to ~17.0% rather than 17.6%. Both representations are valid:
the replay encodes Chair decisions at meeting boundaries, this table records
the realised monthly fed-funds path. A calibration test should pick one source
as its ground truth — driving the engine through the replay and comparing to
FRED on aligned months — rather than treating this table as a per-month spec
the replay must mirror.

## Application to MANDATE

Concrete changes split into four follow-up SPECs. The first ships with
PR #27; the latter three remain queued.

1. **SPEC-COMM-3 (revised committee model)** *— shipped in PR #27.*
   12 members; per-member reaction coefficients (`inflation_coef`,
   `output_coef`, `inertia`) anchored at `neutral_rate`. Drops the old
   hawkish/dovish/neutral trichotomy. **Schema migration required:**
   `schemas/committee.schema.json` replaces the `lean` enum with three numeric
   coefficient fields; `content/committees/1979.json` is rewritten with all 12
   members; the dropped per-lean weights are removed from
   `schemas/committee-params.schema.json`.

2. **SPEC-CRED-5 (credibility two-way)** *— queued.*
   The `onTarget` wiring in `Session.proposeRate` is already handled by
   SPEC-MANDATE-1 (`src/engine/mandate.ts`). A future SPEC-CRED-5 can add
   `on_target_tolerance` as a schema-governed param if the fixed 50bp
   tolerance band needs to be content-tunable independently of the mandate
   tolerance.

3. **SPEC-CAL-2 (Volcker calibration test)** *— shipped.*
   `test/calibration-volcker.test.ts` drives `Session.fromReplay` through
   `content/replays/1979_chair_tightening.json` and asserts RMSE vs the FRED
   1979-1986 baseline: inflation < 2.5pp, unemployment < 2.0pp (achieved ~1.4pp /
   ~0.9pp). Required redesigning the macro core: SPEC-SIM-5 became a **real-rate
   transmission** model (the policy rate bites only through `policy_rate −
   expectations_anchor`, so 1979's 10.75% nominal rate is barely restrictive but
   Volcker's 19% against falling expectations crushes demand); SPEC-CRED-4 became
   **continuous credibility-weighted adaptive expectations** (replacing the binary
   spiral); and **SPEC-CRED-6** ties credibility to mandate progress, not committee
   votes (issue #33 — dissents no longer cost credibility). The 1979-80 inflation
   peak (second oil shock) is left to content events, so the tolerance is loose.
   Calibrated params: see `content/engine/dynamics.json` + `credibility.json`.

4. **SPEC-WEB-3 (UI Volcker integration test)** *— queued.*
   A vitest-jsdom test that drives the Dashboard through the rate path via the
   Propose Rate button and asserts the displayed end-state matches the
   headless engine's end-state. Pins that the UI/engine wiring (SPEC-WEB-2
   useSession + MeetingPanel SPEC-WEB-4) actually surfaces the engine's
   trajectory, not a divergent copy of it.

## Sources

- Federal Reserve Dec 2025 SEP (https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20251210.htm)
- Clarida, Galí & Gertler (2000), "Monetary Policy Rules and Macroeconomic Stability"
  (NBER 6442) — empirical Taylor-rule estimates with inertia.
- Fed FEDS 2023-070 — modern reaction-function estimates with high inertia.
- Goodfriend & King (2005), NBER 11562 — "The Incredible Volcker Disinflation".
- FRED FEDFUNDS series (https://fred.stlouisfed.org/series/FEDFUNDS).
- St. Louis Fed Review — Managing a New Policy Framework (2021).
- Kansas City Fed — Understanding Hawks and Doves (2018).
