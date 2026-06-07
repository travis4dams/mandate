// Shared committee parameter types — imported by both fomc.ts and stance.ts to avoid a circular dependency.

export interface CommitteeParams {
  /** Anchor for every member's preferred-rate computation — the rate the committee would set at target inflation and natural unemployment. */
  neutral_rate: number;
  /** Long-run inflation target used to compute the inflation gap. */
  target_inflation: number;
  /** Natural rate of unemployment used to compute the unemployment gap. */
  target_unemployment: number;
  /** Scales how much a member's conviction narrows their effective compromise band.
   *  Full formula: `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`.
   *  conviction_band_factor controls the conviction contribution; bandMod is the sum of band_modifier from the member's traits.
   *  SPEC-COMM-5. */
  conviction_band_factor: number;
}
