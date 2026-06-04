import { describe, it, expect } from "vitest";
import {
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

  // SPEC-CRED-1
  it("clamps to [0, 100]", () => {
    expect(applyMeetingOutcome(2, { surprisedMarkets: true, onTarget: false })).toBe(0);
    expect(applyMeetingOutcome(99, { surprisedMarkets: false, onTarget: true })).toBe(100);
  });

  // SPEC-CRED-2
  it("anchors expectations only at or above the threshold", () => {
    expect(expectationsAnchored(60, 60)).toBe(true);
    expect(expectationsAnchored(59, 60)).toBe(false);
  });

  // SPEC-CRED-3
  it("raises the pain multiplier as credibility falls", () => {
    expect(painMultiplier(100)).toBe(1);
    expect(painMultiplier(50)).toBe(2);
    expect(painMultiplier(0)).toBe(3);
  });
});
