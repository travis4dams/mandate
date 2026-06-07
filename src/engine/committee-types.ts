// Shared committee parameter types — imported by both fomc.ts and stance.ts to avoid a circular dependency.

export interface CommitteeParams {
  /** Anchor for every member's preferred-rate computation — the rate the committee would set at target inflation and natural unemployment. */
  readonly neutral_rate: number;
  /** Long-run inflation target used to compute the inflation gap. */
  readonly target_inflation: number;
  /** Natural rate of unemployment used to compute the unemployment gap. */
  readonly target_unemployment: number;
  /** Scales how much a member's conviction narrows their effective compromise band.
   *  Full formula: `effectiveBand = Math.max(0, compromise_band * (1 - conviction * conviction_band_factor) * (1 + bandMod))`.
   *  conviction_band_factor controls the conviction contribution; (1 + bandMod) is the trait scale factor where
   *  bandMod is the sum of band_modifier from the member's traits — a bandMod of -0.5 halves the band, +0.5 widens it by 50%.
   *  SPEC-COMM-5. Valid range: [0, 1]. */
  readonly conviction_band_factor: number;
}
