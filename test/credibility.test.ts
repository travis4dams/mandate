import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CRED_MIN,
  CRED_MAX,
  applyMeetingOutcome,
  expectationsAnchored,
  painMultiplier,
} from "../src/engine/credibility";

// The continuous expectations + mission-tied credibility evolution (SPEC-CRED-4 / SPEC-CRED-6)
// now lives inside applyMacroDynamics and is covered in test/dynamics.test.ts. This file covers
// the remaining standalone credibility helpers.

describe("credibility", () => {
  // SPEC-CRED-1: market surprises erode credibility; on-target outcomes build it.
  it("erodes on surprises, builds on on-target outcomes", () => {
    expect(applyMeetingOutcome(70, { surprisedMarkets: true, onTarget: false })).toBe(65);
    expect(applyMeetingOutcome(70, { surprisedMarkets: false, onTarget: true })).toBe(73);
  });

  // SPEC-CRED-1 (issue #33): dissents are not published, so the meeting outcome carries no
  // dissent term at all — credibility is unchanged by a unanimous vote vs a split one.
  it("does not change credibility for a quiet, on-mandate-neutral meeting", () => {
    expect(applyMeetingOutcome(70, { surprisedMarkets: false, onTarget: false })).toBe(70);
  });

  // SPEC-CRED-1 / SPEC-CRED-5: bounds come from content, so assert against the exported
  // constants, probing AT the bounds so the clamp is exercised for any non-negative weights.
  it("clamps to [CRED_MIN, CRED_MAX]", () => {
    expect(applyMeetingOutcome(CRED_MIN, { surprisedMarkets: true, onTarget: false })).toBe(CRED_MIN);
    expect(applyMeetingOutcome(CRED_MAX, { surprisedMarkets: false, onTarget: true })).toBe(CRED_MAX);
  });

  // SPEC-CRED-2
  it("anchors expectations only at or above the threshold", () => {
    expect(expectationsAnchored(60, 60)).toBe(true);
    expect(expectationsAnchored(59, 60)).toBe(false);
  });

  // SPEC-CRED-3 / SPEC-CRED-5: the 1x-3x guarantee holds over the content-driven range.
  it("raises the pain multiplier as credibility falls", () => {
    expect(painMultiplier(CRED_MAX)).toBe(1);
    expect(painMultiplier((CRED_MIN + CRED_MAX) / 2)).toBe(2);
    expect(painMultiplier(CRED_MIN)).toBe(3);
  });
});

// SPEC-CRED-5: bounds and meeting-outcome weights come from content/engine/credibility.json,
// not from literals in engine code. These assertions read the content file and require the
// engine's behavior to match it, so editing the JSON is sufficient to retune the mechanic.
describe("SPEC-CRED-5: weights and bounds are content-driven", () => {
  const raw = JSON.parse(
    readFileSync("content/engine/credibility.json", "utf8"),
  ) as { cred_min: number; cred_max: number; surprise_penalty: number; on_target_gain: number };

  it("content file declares the four params", () => {
    expect(raw.cred_min).toBeTypeOf("number");
    expect(raw.cred_max).toBeTypeOf("number");
    expect(raw.surprise_penalty).toBeTypeOf("number");
    expect(raw.on_target_gain).toBeTypeOf("number");
  });

  it("exported bounds equal the content values", () => {
    expect(CRED_MIN).toBe(raw.cred_min);
    expect(CRED_MAX).toBe(raw.cred_max);
  });

  it("applyMeetingOutcome deltas equal the content values", () => {
    const mid = (raw.cred_min + raw.cred_max) / 2;
    expect(applyMeetingOutcome(mid, { surprisedMarkets: true, onTarget: false }))
      .toBe(mid - raw.surprise_penalty);
    expect(applyMeetingOutcome(mid, { surprisedMarkets: false, onTarget: true }))
      .toBe(mid + raw.on_target_gain);
  });
});
