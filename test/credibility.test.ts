import { describe, it, expect } from "vitest";
import {
  applyMeetingOutcome,
  expectationsAnchored,
  painMultiplier,
  ANCHOR_THRESHOLD,
} from "../src/engine/credibility";

describe("credibility", () => {
  // SPEC-CRED-1
  it("erodes on dissents and surprises, builds on on-target outcomes", () => {
    expect(applyMeetingOutcome(70, { dissents: 3, surprisedMarkets: true, onTarget: false })).toBe(59);
    expect(applyMeetingOutcome(70, { dissents: 0, surprisedMarkets: false, onTarget: true })).toBe(73);
  });

  // SPEC-CRED-1
  it("clamps to [0, 100]", () => {
    expect(applyMeetingOutcome(2, { dissents: 9, surprisedMarkets: true, onTarget: false })).toBe(0);
    expect(applyMeetingOutcome(99, { dissents: 0, surprisedMarkets: false, onTarget: true })).toBe(100);
  });

  // SPEC-CRED-2
  it("anchors expectations only at or above the threshold", () => {
    expect(expectationsAnchored(ANCHOR_THRESHOLD)).toBe(true);
    expect(expectationsAnchored(ANCHOR_THRESHOLD - 1)).toBe(false);
  });

  // SPEC-CRED-3
  it("raises the pain multiplier as credibility falls", () => {
    expect(painMultiplier(100)).toBe(1);
    expect(painMultiplier(50)).toBe(2);
    expect(painMultiplier(0)).toBe(3);
  });

  // SPEC-CRED-4 (de-anchoring spiral over multiple periods) is specced but not yet
  // implemented — this is the next red test in the TDD loop.
  it.todo("models a self-reinforcing de-anchoring spiral once credibility is lost");
});
