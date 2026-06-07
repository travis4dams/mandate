// Shared committee parameter types — imported by both fomc.ts and stance.ts to avoid a circular dependency.

export interface CommitteeParams {
  /** Anchor for every member's preferred-rate computation — the rate the committee would set at target inflation and natural unemployment. */
  neutral_rate: number;
  /** Long-run inflation target used to compute the inflation gap. */
  target_inflation: number;
  /** Natural rate of unemployment used to compute the unemployment gap. */
  target_unemployment: number;
}
