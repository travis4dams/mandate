# FOMC empirical anchors for MANDATE calibration

Snapshot: 2026-06-02. Compiled from a research pass commissioned during the
player-feedback round on PR #25 (committee spreads were absurd; credibility
ratcheted only down).

## 1. Dot-plot dispersion (modern, 2012-2025)

The SEP has 19 participants (7 Governors + 12 Reserve Bank Presidents). Dispersion:

- Current year: full range 25-75bp; central tendency ~30bp.
- 1-2y horizon: full range 125-200bp (occasionally 250bp in regime-change windows);
  central tendency ~50-100bp.
- Standard deviation across dots: ~30-50bp at near horizons, 50-80bp at longer ones.

**Game implication:** typical hawk-vs-dove spread at the same meeting is ~150bp,
not 1500bp. The slice-2 model's preferred-rate spread (hawks @ 19%, doves @ 3.6%
in 1979) is an order of magnitude too wide.

## 2. Reaction-function coefficients

Modern empirical median FOMC participant (per BIS, Fed FEDS, Atlanta Fed):
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

**Game implication:** the current credibility model only goes down. It needs:
- A nonzero `onTarget` signal that fires when inflation is close to target.
- Gating that re-anchoring requires sustained performance, not a single hit.
- A smoothed credibility recovery rate (multi-year decay back to anchored).

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

The committed replay (`content/replays/1979_chair_tightening.json`) only has 12
action points and should be cross-checked against this trajectory; a calibration
test that drives the engine through these monthly rates and compares to FRED is
what the user is asking for.

## Application to MANDATE

Concrete changes the engine needs (each its own SPEC):

1. **SPEC-COMM-N (revised committee model)**: 12 members; per-member reaction
   coefficients sampled from realistic distributions; high inertia on lagged
   rate so preferred rates cluster. Drop the simple "hawkish | dovish | neutral"
   trichotomy in favor of `(inflation_coef, output_coef, inertia)`.
2. **SPEC-CRED-N (credibility two-way)**: wire `onTarget` to a real check
   (e.g., `|inflation - target| < threshold`); require N consecutive on-target
   months to count as anchored; smoothed re-anchor rate.
3. **SPEC-CAL-N (Volcker validation)**: a calibration test that drives the
   engine through the 1979-1982 monthly rate path and asserts inflation,
   unemployment, and credibility evolve in roughly the historical direction
   (loose tolerance: order of magnitude, not exact match).
4. **SPEC-WEB-N (UI Volcker test)**: a vitest-jsdom test that drives the
   Dashboard through the same rate path via the Propose Rate button and
   asserts the displayed end-state matches the headless engine's end-state.

## Sources

- Federal Reserve Dec 2025 SEP (https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20251210.htm)
- BIS WP 1234 — Targeted Taylor Rules (https://www.bis.org/publ/work1234.pdf)
- Fed FEDS 2023-070
- Goodfriend & King NBER 11562 — "The Incredible Volcker Disinflation"
- FRED FEDFUNDS series
- St. Louis Fed Review — Managing a New Policy Framework (2021)
- Kansas City Fed — Understanding Hawks and Doves (2018)
