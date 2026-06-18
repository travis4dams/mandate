// SPEC-SIM-5 (real-rate transmission), SPEC-CRED-4 (continuous adaptive expectations),
// SPEC-CRED-6 (mission-tied credibility) — all evolve in one simultaneous monthly step.
import { describe, it, expect, vi, afterEach } from "vitest";
import { applyMacroDynamics, loadDynamicsParams, _resetDynamicsParamsCache, type MacroDynamicsParams } from "../src/engine/dynamics";
import * as contentLoader from "../src/content/loader";
import { makeState } from "../src/engine/state";

// Base params matching content/engine/dynamics.json + credibility.json for test use.
const BASE: MacroDynamicsParams = {
  inflation_persistence: 0.952,
  phillips_slope: 0.106,
  unemployment_natural_rate: 0.0645,
  real_neutral_rate: 0.027,
  okun_coefficient: 1.14,
  unemployment_adjustment_speed: 0.045,
  target_inflation: 0.02,
  unemployment_target: 0.055,
  expectations_adaptivity: 0.051,
  expectations_anchor_pull: 0.025,
  credibility_mission_gain: 300,
  credibility_unemployment_weight: 0.5,
  anchor_threshold: 60,
  credibility_soft_ceiling: 85,
  credibility_drain_rate: 0.20,
};

const baseVars = {
  policy_rate: 0.05,
  inflation: 0.05,
  unemployment: 0.0645,
  expectations_anchor: 0.05,
  credibility: 50,
  months_below_anchor: 0,
};

describe("applyMacroDynamics — real-rate transmission (SPEC-SIM-5)", () => {
  it("a high REAL rate raises unemployment toward a higher equilibrium", () => {
    // SPEC-SIM-5: policy 15% vs 5% expected inflation = 10% real, well above r* → recession.
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.15, expectations_anchor: 0.05 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment);
  });

  it("a nominal rate that is NOT real-restrictive does not cause a recession", () => {
    // SPEC-SIM-5: 11% nominal against 11% expected inflation is ~0% real — barely restrictive,
    // unlike the slice-1 nominal-gap model which would have driven unemployment up regardless.
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.11, expectations_anchor: 0.11, unemployment: 0.0645 } });
    const result = applyMacroDynamics(state, BASE);
    // realRate 0% < r* (2.7%), so equilibrium unemployment is below natural → unemployment eases, not rises.
    expect(result.vars.unemployment).toBeLessThanOrEqual(state.vars.unemployment);
  });

  it("easing (low real rate) lets an elevated unemployment recover toward natural", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.02, expectations_anchor: 0.05, unemployment: 0.10 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBeLessThan(state.vars.unemployment);
  });

  it("slack (unemployment above natural) reduces inflation via the Phillips curve", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.10, unemployment: 0.12 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation);
  });

  it("has a stable steady state at target inflation, natural unemployment, neutral real rate", () => {
    // SPEC-SIM-5: inflation = anchor = target, unemployment = natural, policy = target + r*.
    const state = makeState({
      vars: {
        policy_rate: BASE.target_inflation + BASE.real_neutral_rate,
        inflation: BASE.target_inflation,
        unemployment: BASE.unemployment_natural_rate,
        expectations_anchor: BASE.target_inflation,
        credibility: 80,
        months_below_anchor: 0,
      },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeCloseTo(BASE.target_inflation, 10);
    expect(result.vars.unemployment).toBeCloseTo(BASE.unemployment_natural_rate, 10);
    expect(result.vars.expectations_anchor).toBeCloseTo(BASE.target_inflation, 10);
  });

  it("clamps unemployment to 1 under absurd real tightening", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 1.1, expectations_anchor: 0.0, unemployment: 0.99 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.unemployment).toBe(1);
  });

  it("clamps inflation to 0 in a severe deflationary scenario", () => {
    // SPEC-SIM-5
    const extreme = { ...BASE, inflation_persistence: 0, phillips_slope: 10 };
    const state = makeState({ vars: { ...baseVars, inflation: 0.001, expectations_anchor: 0, unemployment: 0.99 } });
    const result = applyMacroDynamics(state, extreme);
    expect(result.vars.inflation).toBe(0);
  });

  it("is a pure function and does not mutate the input state", () => {
    // SPEC-SIM-5
    const state = makeState({ vars: { ...baseVars, policy_rate: 0.2, inflation: 0.10, unemployment: 0.08 } });
    const before = { ...state.vars };
    applyMacroDynamics(state, BASE);
    expect(state.vars).toEqual(before);
  });
});

describe("applyMacroDynamics — adaptive expectations (SPEC-CRED-4)", () => {
  it("at low credibility, expectations chase realized inflation upward (de-anchoring)", () => {
    // SPEC-CRED-4: credibility 0 → fully adaptive; inflation above anchor pulls anchor up.
    const state = makeState({ vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.05, credibility: 0 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.expectations_anchor).toBeGreaterThan(state.vars.expectations_anchor);
  });

  it("at high credibility, expectations are pulled toward target (re-anchoring)", () => {
    // SPEC-CRED-4: credibility 100 → anchor above target is pulled down toward it.
    const state = makeState({ vars: { ...baseVars, inflation: 0.06, expectations_anchor: 0.06, credibility: 100 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.expectations_anchor).toBeLessThan(state.vars.expectations_anchor);
    expect(result.vars.expectations_anchor).toBeGreaterThan(BASE.target_inflation);
  });

  it("months_below_anchor increments below the threshold and freezes at/above it", () => {
    // SPEC-CRED-4
    const below = makeState({ vars: { ...baseVars, credibility: 50, months_below_anchor: 3 } });
    expect(applyMacroDynamics(below, BASE).vars.months_below_anchor).toBe(4);
    const above = makeState({ vars: { ...baseVars, credibility: 70, months_below_anchor: 3 } });
    expect(applyMacroDynamics(above, BASE).vars.months_below_anchor).toBe(3);
  });
});

describe("applyMacroDynamics — over-range credibility clamp (SPEC-DOCT-1)", () => {
  it("credibility above CRED_MAX does not invert the adaptive-expectations term", () => {
    // SPEC-DOCT-1: adoptDoctrine intentionally stores credibility > 100 so abandonDoctrine
    // can reverse the exact delta. applyMacroDynamics must clamp c = credibility/CRED_MAX to 1
    // so (1 - c) stays >= 0 and the adaptive term never inverts sign.
    const stateOver = makeState({
      vars: { ...baseVars, credibility: 103, inflation: 0.05, expectations_anchor: 0.05 },
    });
    const stateAt = makeState({
      vars: { ...baseVars, credibility: 100, inflation: 0.05, expectations_anchor: 0.05 },
    });
    const resultOver = applyMacroDynamics(stateOver, BASE);
    const resultAt = applyMacroDynamics(stateAt, BASE);
    // Anchor should move in the same direction (toward target) for both — not inverted.
    expect(Math.sign(resultOver.vars.expectations_anchor! - stateOver.vars.expectations_anchor!))
      .toBe(Math.sign(resultAt.vars.expectations_anchor! - stateAt.vars.expectations_anchor!));
    // Credibility is clamped back to CRED_MAX by dynamics on the first tick.
    expect(resultOver.vars.credibility).toBeLessThanOrEqual(100);
  });
});

describe("applyMacroDynamics — soft-ceiling drain (SPEC-CRED-7)", () => {
  // Fixed-point state: inflation=target, unemployment=natural_rate, policy=target+r*, anchor=target.
  // Although unemployment_natural_rate (6.45%) ≠ unemployment_target (5.5%), this is a dynamics
  // fixed point (realGap=0, slack=0), so distBefore === distAfter === 0.00475 and
  // credibility_mission_gain × (distBefore − distAfter) = 0. Only the drain moves credibility.
  const fixedPointVars = {
    policy_rate: BASE.target_inflation + BASE.real_neutral_rate,
    inflation: BASE.target_inflation,
    unemployment: BASE.unemployment_natural_rate,
    expectations_anchor: BASE.target_inflation,
    months_below_anchor: 0,
  };

  it("credibility at cred_max drains to 97.0 when economy is at the macro steady state (zero mission-distance change)", () => {
    // SPEC-CRED-7: drain = credibility_drain_rate × max(0, min(credibility, CRED_MAX) − credibility_soft_ceiling)
    //            = 0.20 × max(0, min(100, 100) − 85) = 0.20 × 15 = 3.0  →  newCredibility = 100 − 3.0 = 97.0.
    const state = makeState({ vars: { ...fixedPointVars, credibility: 100 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.credibility).toBeCloseTo(97.0, 10);
  });

  it("credibility at cred_max drains below cred_max when economy is exactly on the dual-mandate target (SPEC-CRED-7 literal)", () => {
    // SPEC-CRED-7 literal: inflation=target, unemployment=unemployment_target → distBefore=0.
    // Economy will drift away from unemployment_target in one tick (toward natural_rate), so
    // distAfter > 0 and mission_gain is negative — but drain alone guarantees credibility < cred_max.
    const onTargetVars = {
      policy_rate: BASE.target_inflation + BASE.real_neutral_rate,
      inflation: BASE.target_inflation,
      unemployment: BASE.unemployment_target,
      expectations_anchor: BASE.target_inflation,
      months_below_anchor: 0,
    };
    const state = makeState({ vars: { ...onTargetVars, credibility: 100 } });
    expect(applyMacroDynamics(state, BASE).vars.credibility).toBeLessThan(100);
  });

  it("drain is proportional: credibility=90 drains to 89.0", () => {
    // SPEC-CRED-7: drain = 0.20 × (90 − 85) = 1.0  →  newCredibility = 90 − 1.0 = 89.0.
    const state = makeState({ vars: { ...fixedPointVars, credibility: 90 } });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.credibility).toBeCloseTo(89.0, 10);
  });

  it("drain is zero when credibility is below the soft ceiling", () => {
    // SPEC-CRED-7: max(0, 50 − 85) = 0, so drain_rate has no effect for any valid rate.
    const lowDrainParams = { ...BASE, credibility_drain_rate: 0.05 };
    const belowState = makeState({ vars: { ...baseVars, credibility: 50 } });
    expect(applyMacroDynamics(belowState, lowDrainParams).vars.credibility)
      .toBe(applyMacroDynamics(belowState, BASE).vars.credibility);
  });

  it("drain is zero when credibility is exactly at the soft ceiling", () => {
    // SPEC-CRED-7: max(0, 85 − 85) = 0, so drain_rate has no effect at the boundary for any valid rate.
    const lowDrainParams = { ...BASE, credibility_drain_rate: 0.05 };
    const atCeilingState = makeState({ vars: { ...baseVars, credibility: BASE.credibility_soft_ceiling } });
    expect(applyMacroDynamics(atCeilingState, lowDrainParams).vars.credibility)
      .toBe(applyMacroDynamics(atCeilingState, BASE).vars.credibility);
  });

  it("drain fires at exactly soft_ceiling + 1 (off-by-one check, SPEC-CRED-7)", () => {
    // SPEC-CRED-7: max(0, 86 − 85) = 1; drain = 0.20 × 1 = 0.20.
    // At fixed-point state distBefore = distAfter = 0 → missionGain = 0; result = 86 − 0.20 = 85.80.
    // Catches an off-by-one in Math.max(0, effectiveCred − soft_ceiling) (e.g. > vs >=).
    const atCeilingPlusOne = makeState({ vars: { ...fixedPointVars, credibility: 86 } });
    const result = applyMacroDynamics(atCeilingPlusOne, BASE);
    expect(result.vars.credibility).toBeCloseTo(85.80, 10);
  });

  it("drain is nonzero above the soft ceiling: higher drain_rate produces less credibility", () => {
    // SPEC-CRED-7: positive test that the drain is actually active and subtracts credibility above the ceiling.
    // A sign error (+drain instead of -drain) would make the higher-rate result larger, not smaller.
    const lowDrainParams = { ...BASE, credibility_drain_rate: 0.05 };
    const aboveState = makeState({ vars: { ...fixedPointVars, credibility: 95 } });
    expect(applyMacroDynamics(aboveState, BASE).vars.credibility)
      .toBeLessThan(applyMacroDynamics(aboveState, lowDrainParams).vars.credibility);
  });

  it("drain_rate=0 and drain_rate=0.20 diverge above the soft ceiling (positive test that the drain fires)", () => {
    // SPEC-CRED-7: drain_rate=0 disables the soft-ceiling drain; above the ceiling the two must diverge.
    // This is the complement to the below/at-ceiling tests: those show drain_rate doesn't matter there;
    // this shows it does matter above the ceiling.
    const nodrainParams = { ...BASE, credibility_drain_rate: 0 };
    const aboveState = makeState({ vars: { ...fixedPointVars, credibility: 95 } });
    expect(applyMacroDynamics(aboveState, nodrainParams).vars.credibility)
      .not.toBe(applyMacroDynamics(aboveState, BASE).vars.credibility);
  });

  it("over-range credibility drains at on-cap rate, not proportional to excess (SPEC-CRED-7 + SPEC-DOCT-1)", () => {
    // credibility=102 (just over CRED_MAX=100): effectiveCred=100, drain = 0.20×(100−85) = 3.0.
    // Without the cap, drain would be 0.20×(102−85) = 3.4 → result 98.6.
    // With the cap: clamp(102 − 3.0, 0, 100) = 99.0.
    const overState = makeState({ vars: { ...fixedPointVars, credibility: 102 } });
    const result = applyMacroDynamics(overState, BASE);
    expect(result.vars.credibility).toBeCloseTo(99.0, 5);
  });

  it("throws when credibility is NaN (primary-input finiteness guard)", () => {
    // Guard catches NaN from upstream bugs (e.g. a miscalculated doctrine delta) before it
    // propagates silently through the entire dynamics step.
    const nanState = makeState({ vars: { ...fixedPointVars, credibility: NaN } });
    expect(() => applyMacroDynamics(nanState, BASE)).toThrow("not finite");
  });

  it("throws when credibility is Infinity (primary-input finiteness guard)", () => {
    const infState = makeState({ vars: { ...fixedPointVars, credibility: Infinity } });
    expect(() => applyMacroDynamics(infState, BASE)).toThrow("not finite");
  });

  it("throws when inflation is NaN (primary-input finiteness guard)", () => {
    // Guard extends to all primary inputs — NaN from a miscalculated event delta propagates
    // through the Phillips curve silently without this check.
    const nanState = makeState({ vars: { ...fixedPointVars, inflation: NaN } });
    expect(() => applyMacroDynamics(nanState, BASE)).toThrow("not finite");
  });

  it("throws when unemployment is NaN (primary-input finiteness guard)", () => {
    const nanState = makeState({ vars: { ...fixedPointVars, unemployment: NaN } });
    expect(() => applyMacroDynamics(nanState, BASE)).toThrow("not finite");
  });

  it("drain uses prior credibility, not post-gain credibility (SPEC-CRED-7)", () => {
    // Economy improving (inflation=0.025 above target=0.02) → positive mission gain.
    // Exact expected: newInflation = 0.952×0.025 + 0.048×0.02 − 0.106×(0.0645 − 0.0645) = 0.02476.
    // distBefore=0.00975, distAfter=0.00951 → missionGain = 300×0.00024 = 0.072.
    // priorDrain = 0.20 × (92 − 85) = 1.4   →   newCred = 92 + 0.072 − 1.4 = 90.672.
    // If drain used post-gain cred (92.072): drain = 0.20×7.072 = 1.4144 → newCred = 90.6576.
    // Difference = 0.0144 > toBeCloseTo-2 tolerance (0.005), so this catches the ordering bug.
    const improvingState = makeState({
      vars: { ...fixedPointVars, credibility: 92, inflation: 0.025 },
    });
    const result = applyMacroDynamics(improvingState, BASE);
    expect(result.vars.credibility).toBeCloseTo(90.672, 2);
  });
});

describe("applyMacroDynamics — mission-tied credibility (SPEC-CRED-6)", () => {
  it("rises when the economy moves toward the dual-mandate target", () => {
    // SPEC-CRED-6: high inflation falling + elevated unemployment easing → distance shrinks.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.04, expectations_anchor: 0.04, unemployment: 0.10, policy_rate: 0.067, credibility: 50 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation);
    expect(result.vars.credibility).toBeGreaterThan(state.vars.credibility);
  });

  it("falls when the economy moves away from target", () => {
    // SPEC-CRED-6: anchor above inflation drives inflation up, away from target.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.04, expectations_anchor: 0.08, unemployment: 0.0645, policy_rate: 0.107, credibility: 50 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeGreaterThan(state.vars.inflation);
    expect(result.vars.credibility).toBeLessThan(state.vars.credibility);
  });

  it("is inflation-dominant: disinflation builds credibility even as a recession deepens", () => {
    // SPEC-CRED-6: unemployment_weight 0.5 means a big inflation improvement outweighs a
    // simultaneous unemployment worsening — credibility rises while unemployment rises.
    const state = makeState({
      vars: { ...baseVars, inflation: 0.10, expectations_anchor: 0.10, unemployment: 0.12, policy_rate: 0.20, credibility: 30 },
    });
    const result = applyMacroDynamics(state, BASE);
    expect(result.vars.inflation).toBeLessThan(state.vars.inflation); // disinflating
    expect(result.vars.unemployment).toBeGreaterThan(state.vars.unemployment); // recession deepening
    expect(result.vars.credibility).toBeGreaterThan(state.vars.credibility); // yet credibility earned
  });
});

describe("loadDynamicsParams — soft-ceiling guard (SPEC-CRED-7)", () => {
  const DYNAMICS_MOCK = {
    inflation_persistence: 0.952, phillips_slope: 0.106,
    unemployment_natural_rate: 0.0645, real_neutral_rate: 0.027,
    okun_coefficient: 1.14, unemployment_adjustment_speed: 0.045,
  } as const;
  const CRED_MOCK_BASE = {
    target_inflation: 0.02, unemployment_target: 0.055,
    expectations_adaptivity: 0.051, expectations_anchor_pull: 0.025,
    credibility_mission_gain: 300, credibility_unemployment_weight: 0.5,
    anchor_threshold: 60, credibility_soft_ceiling: 85, credibility_drain_rate: 0.20,
  };

  function mockParams(overrides: Partial<typeof CRED_MOCK_BASE>): void {
    vi.spyOn(contentLoader, "loadValidatedFile")
      .mockReturnValueOnce(DYNAMICS_MOCK as any)
      .mockReturnValueOnce({ ...CRED_MOCK_BASE, ...overrides } as any);
  }

  afterEach(() => {
    _resetDynamicsParamsCache();
    vi.restoreAllMocks();
  });

  it("throws when credibility_soft_ceiling >= CRED_MAX", () => {
    // SPEC-CRED-7: runtime guard fires if soft_ceiling >= cred_max (100) so the drain
    // cannot be silently disabled by a misconfigured content file.
    mockParams({ credibility_soft_ceiling: 100 });
    expect(() => loadDynamicsParams()).toThrow("credibility_soft_ceiling");
  });

  it("does not poison the cache on a failed load", () => {
    // SPEC-CRED-7: _cachedParams is assigned only after the guard passes, so a failed
    // call leaves the cache empty and a subsequent call with valid data succeeds.
    mockParams({ credibility_soft_ceiling: 100 });
    expect(() => loadDynamicsParams()).toThrow();
    // Restore spy so the next call uses real files (valid soft_ceiling = 85).
    vi.restoreAllMocks();
    const result = loadDynamicsParams();
    expect(result.credibility_soft_ceiling).toBe(85);
    expect(result.credibility_drain_rate).toBe(0.20);
  });

  it("throws when credibility_drain_rate <= 0", () => {
    // SPEC-CRED-7: zero drain_rate silently disables the soft-ceiling drain; guard must reject it.
    mockParams({ credibility_drain_rate: 0 });
    expect(() => loadDynamicsParams()).toThrow("credibility_drain_rate");
  });

  it("throws when credibility_drain_rate is negative", () => {
    // SPEC-CRED-7: guard is <= 0, not just == 0; a negative rate inverts the drain into a gain.
    mockParams({ credibility_drain_rate: -0.1 });
    expect(() => loadDynamicsParams()).toThrow("credibility_drain_rate");
  });

  it("throws when credibility_drain_rate >= 1", () => {
    // SPEC-CRED-7 × SPEC-SIM-6: rate >= 1 breaks the 1-(1-r)^(1/n) geometric cadence scaling
    // (rate=1 gives pow(0,1/n)=0 so per-tick rate stays 1; rate>1 gives NaN via pow(negative,fraction)).
    mockParams({ credibility_drain_rate: 1.0 });
    expect(() => loadDynamicsParams()).toThrow("credibility_drain_rate");
  });

  it("throws when credibility_soft_ceiling <= CRED_MIN", () => {
    // SPEC-CRED-7: soft_ceiling=0 makes max(0, cred - 0) = cred, firing the drain at all credibility levels.
    mockParams({ credibility_soft_ceiling: 0 });
    expect(() => loadDynamicsParams()).toThrow("credibility_soft_ceiling");
  });

  it("throws when credibility_drain_rate is NaN (bypasses <= 0 / >= 1 without isFinite guard)", () => {
    // SPEC-CRED-7: NaN <= 0 and NaN >= 1 are both false, so a bare range check lets NaN through.
    // The isFinite guard is required to reject it explicitly.
    mockParams({ credibility_drain_rate: NaN });
    expect(() => loadDynamicsParams()).toThrow("credibility_drain_rate");
  });

  it("returned params are frozen — mutation throws in strict mode", () => {
    // Prevents a caller from silently corrupting every subsequent loadDynamicsParams() call by
    // mutating the cached object reference. Object.freeze ensures immediate error on mutation.
    const params = loadDynamicsParams();
    expect(() => {
      (params as Record<string, unknown>).credibility_drain_rate = 0.999;
    }).toThrow(TypeError);
  });
});

describe("applyMacroDynamics — content-driven pin-prevention (SPEC-CRED-7)", () => {
  afterEach(() => {
    _resetDynamicsParamsCache();
  });

  it("one tick at cred_max with zero mission progress produces credibility < 100 using production params (SPEC-CRED-7)", () => {
    // SPEC-CRED-7: production params must have drain large enough to move credibility strictly
    // below 100 in a single tick when the economy is at the macro fixed point (zero mission-
    // distance change). Complements the exact-value test against hardcoded BASE; survives
    // param retuning that would break an exact-value assertion.
    const params = loadDynamicsParams();
    const fixedPt = {
      policy_rate: params.target_inflation + params.real_neutral_rate,
      inflation: params.target_inflation,
      unemployment: params.unemployment_natural_rate,
      expectations_anchor: params.target_inflation,
      credibility: 100,
      months_below_anchor: 0,
    };
    const result = applyMacroDynamics(makeState({ vars: { ...fixedPt } }), params);
    expect(result.vars.credibility as number).toBeLessThan(100);
  });
});
