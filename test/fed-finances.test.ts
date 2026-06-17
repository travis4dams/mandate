// SPEC-FED-1: Fed balance-sheet finances — portfolio yield EWMA, net income, deferred asset.
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyFedFinances,
  loadFedFinancesParams,
  _resetFedFinancesParamsCache,
  type FedFinancesParams,
} from "../src/engine/fed-finances";
import { makeState } from "../src/engine/state";
import { Session } from "../src/engine/session";
import { registerContentFile, _resetValidateFileCache, _resetRegistries } from "../src/content/loader";

// SPEC-FED-1: reset caches before each test to avoid cross-test state.
beforeEach(() => {
  _resetFedFinancesParamsCache();
  _resetValidateFileCache();
  _resetRegistries();
});

const BASE_PARAMS: FedFinancesParams = {
  portfolio_half_life_months: 84,
  initial_balance_sheet: 0.25,
  initial_portfolio_yield: 0.03,
  initial_deferred_asset: 0,
  initial_operating_budget: 0,
};

// SPEC-FED-1: Params with an effectively infinite half-life so the EWMA barely
// moves portfolio_yield in a single tick. Used by net_income arithmetic tests so
// the expected net_income can be computed directly from the input portfolio_yield.
const FROZEN_EWMA_PARAMS: FedFinancesParams = {
  portfolio_half_life_months: 1e9,
  initial_balance_sheet: 0.25,
  initial_portfolio_yield: 0.03,
  initial_deferred_asset: 0,
  initial_operating_budget: 0,
};

describe("applyFedFinances — portfolio_yield EWMA (SPEC-FED-1)", () => {
  // SPEC-FED-1: cold-start — if portfolio_yield is absent, defaults to policy_rate so first tick = policy_rate.
  it("cold-start: portfolio_yield absent → defaults to policy_rate (cold-start to policy_rate)", () => {
    // SPEC-FED-1: no prior portfolio_yield → prevYield defaults to policy_rate.
    // newYield = (1-λ)*policy_rate + λ*long_rate; when long_rate == policy_rate → policy_rate exactly.
    const state = makeState({ vars: { policy_rate: 0.05, long_rate: 0.05, balance_sheet: 0.25 } });
    const result = applyFedFinances(state, BASE_PARAMS);
    // With prevYield = policy_rate = 0.05 and long_rate = 0.05, EWMA output is 0.05 regardless of λ.
    expect(result.vars.portfolio_yield).toBeCloseTo(0.05, 10);
  });

  // SPEC-FED-1: EWMA formula — portfolio_yield converges toward long_rate.
  it("EWMA: portfolio_yield converges toward long_rate over many months", () => {
    // SPEC-FED-1: after many half-lives the yield should be within 1% of long_rate.
    const params: FedFinancesParams = { ...BASE_PARAMS, portfolio_half_life_months: 6 };
    let state = makeState({ vars: { policy_rate: 0.05, long_rate: 0.08, portfolio_yield: 0.03, balance_sheet: 0.25 } });
    for (let i = 0; i < 60; i++) {
      state = applyFedFinances(state, params);
    }
    expect(Math.abs((state.vars.portfolio_yield as number) - 0.08)).toBeLessThan(0.001);
  });

  // SPEC-FED-1: half-life property — after N ticks at half_life_months=N, halfway converged.
  it("after portfolio_half_life_months ticks, portfolio_yield is 50% of the way to long_rate", () => {
    // SPEC-FED-1: (1-λ)^N = 0.5 by definition.
    const N = 12;
    const params: FedFinancesParams = { ...BASE_PARAMS, portfolio_half_life_months: N };
    let state = makeState({ vars: { policy_rate: 0.05, long_rate: 1.0, portfolio_yield: 0.0, balance_sheet: 0.25 } });
    for (let i = 0; i < N; i++) {
      state = applyFedFinances(state, params);
    }
    expect(state.vars.portfolio_yield).toBeCloseTo(0.5, 5);
  });
});

describe("applyFedFinances — net_income and deferred_asset (SPEC-FED-1)", () => {
  // SPEC-FED-1: hiking policy_rate above portfolio_yield on a large balance sheet → net_income < 0.
  it("policy_rate > portfolio_yield → net_income < 0 and deferred_asset grows", () => {
    // SPEC-FED-1: net_income = (portfolio_yield - policy_rate) * balance_sheet.
    // With policy_rate=0.10, portfolio_yield=0.03, balance_sheet=1.0:
    // net_income = (0.03 - 0.10) * 1.0 = -0.07 → deferred_asset grows by 0.07.
    // Use FROZEN_EWMA_PARAMS so EWMA barely moves portfolio_yield in one tick.
    const state = makeState({
      vars: { policy_rate: 0.10, long_rate: 0.10, portfolio_yield: 0.03, balance_sheet: 1.0, deferred_asset: 0 },
    });
    const result = applyFedFinances(state, FROZEN_EWMA_PARAMS);
    expect(result.vars.net_income).toBeLessThan(0);
    expect(result.vars.deferred_asset).toBeGreaterThan(0);
  });

  // SPEC-FED-1: deferred_asset grows by exactly -net_income when net_income < 0.
  it("deferred_asset grows by exactly -net_income when net_income < 0", () => {
    // SPEC-FED-1: if net_income < 0 → deferred_asset += -net_income.
    // Use FROZEN_EWMA_PARAMS so EWMA barely moves portfolio_yield.
    const state = makeState({
      vars: { policy_rate: 0.10, long_rate: 0.10, portfolio_yield: 0.03, balance_sheet: 1.0, deferred_asset: 0.05 },
    });
    const result = applyFedFinances(state, FROZEN_EWMA_PARAMS);
    const netIncome = result.vars.net_income as number;
    expect(netIncome).toBeLessThan(0);
    // deferred_asset should have grown by -netIncome
    const expectedDeferred = 0.05 + (-netIncome);
    expect(result.vars.deferred_asset).toBeCloseTo(expectedDeferred, 10);
  });

  // SPEC-FED-1: positive carry first pays deferred_asset down before lifting operating_budget.
  it("positive carry: surplus pays deferred_asset down to 0 before lifting operating_budget", () => {
    // SPEC-FED-1: surplus = net_income; first retire deferred_asset, then lift budget.
    // Use FROZEN_EWMA_PARAMS so portfolio_yield=0.07 is effectively unchanged.
    // net_income ≈ (0.07 - 0.03) * 1.0 = 0.04; deferred_asset starts at 0.02.
    // → deferred_asset → 0, remaining surplus ≈ 0.02 → operating_budget.
    const state = makeState({
      vars: {
        policy_rate: 0.03, long_rate: 0.03, portfolio_yield: 0.07, balance_sheet: 1.0,
        deferred_asset: 0.02, operating_budget: 0,
      },
    });
    const result = applyFedFinances(state, FROZEN_EWMA_PARAMS);
    // net_income is based on post-EWMA portfolio_yield; with frozen EWMA it's ~0.04.
    const netIncome = result.vars.net_income as number;
    expect(netIncome).toBeGreaterThan(0);
    expect(result.vars.deferred_asset).toBeCloseTo(0, 10);
    // operating_budget = netIncome - deferred_repayment (0.02)
    expect(result.vars.operating_budget as number).toBeCloseTo(netIncome - 0.02, 10);
  });

  // SPEC-FED-1: positive carry smaller than deferred_asset partially pays it down.
  it("positive carry smaller than deferred_asset: partially pays it down, budget unchanged", () => {
    // SPEC-FED-1: surplus < deferred_asset → deferred_asset decreases, budget unchanged.
    // Use FROZEN_EWMA_PARAMS so portfolio_yield=0.04 is effectively unchanged.
    // net_income ≈ (0.04 - 0.03) * 1.0 = 0.01 < 0.05 deferred → partial paydown.
    const state = makeState({
      vars: {
        policy_rate: 0.03, long_rate: 0.03, portfolio_yield: 0.04, balance_sheet: 1.0,
        deferred_asset: 0.05, operating_budget: 0.10,
      },
    });
    const result = applyFedFinances(state, FROZEN_EWMA_PARAMS);
    const netIncome = result.vars.net_income as number;
    expect(netIncome).toBeGreaterThan(0);
    expect(netIncome).toBeLessThan(0.05); // less than deferred_asset
    expect(result.vars.deferred_asset as number).toBeCloseTo(0.05 - netIncome, 10);
    expect(result.vars.operating_budget).toBeCloseTo(0.10, 10); // unchanged
  });

  // SPEC-FED-1: when no deferred_asset, positive carry goes entirely to operating_budget.
  it("positive carry with no deferred_asset: entire surplus lifts operating_budget", () => {
    // SPEC-FED-1: deferred=0, net_income > 0 → operating_budget += net_income.
    // Use FROZEN_EWMA_PARAMS so portfolio_yield=0.05 is effectively unchanged.
    const state = makeState({
      vars: {
        policy_rate: 0.03, long_rate: 0.03, portfolio_yield: 0.05, balance_sheet: 1.0,
        deferred_asset: 0, operating_budget: 0.10,
      },
    });
    const result = applyFedFinances(state, FROZEN_EWMA_PARAMS);
    const netIncome = result.vars.net_income as number;
    expect(netIncome).toBeGreaterThan(0);
    expect(result.vars.deferred_asset).toBeCloseTo(0, 10);
    expect(result.vars.operating_budget as number).toBeCloseTo(0.10 + netIncome, 10);
  });
});

describe("applyFedFinances — cold-start defaults from content (SPEC-FED-1)", () => {
  // SPEC-FED-1: all vars default from content initial_* when absent.
  it("all vars absent → defaults from params initial_* fields applied", () => {
    // SPEC-FED-1: cold-start with no vars set.
    const params: FedFinancesParams = {
      portfolio_half_life_months: 84,
      initial_balance_sheet: 0.30,
      initial_portfolio_yield: 0.025,
      initial_deferred_asset: 0,
      initial_operating_budget: 0.005,
    };
    const state = makeState({ vars: { policy_rate: 0.025, long_rate: 0.025 } });
    const result = applyFedFinances(state, params);
    // balance_sheet should be params.initial_balance_sheet since not in state
    expect(result.vars.balance_sheet).toBeCloseTo(params.initial_balance_sheet, 10);
    expect(result.vars.portfolio_yield).toBeCloseTo(params.initial_portfolio_yield, 5);
    expect(typeof result.vars.net_income).toBe("number");
    expect(typeof result.vars.deferred_asset).toBe("number");
    expect(typeof result.vars.operating_budget).toBe("number");
  });
});

describe("applyFedFinances — purity (SPEC-FED-1)", () => {
  // SPEC-FED-1 / SPEC-SIM-1: pure function — never mutates input.
  it("is a pure function: does not mutate the input state", () => {
    // SPEC-FED-1: returns new state, input unchanged.
    const state = makeState({
      vars: {
        policy_rate: 0.05, long_rate: 0.06, portfolio_yield: 0.03,
        balance_sheet: 0.5, deferred_asset: 0, operating_budget: 0,
      },
    });
    const varsBefore = { ...state.vars };
    applyFedFinances(state, BASE_PARAMS);
    expect(state.vars).toEqual(varsBefore);
  });

  // SPEC-FED-1: other vars are preserved untouched.
  it("preserves all unrelated vars unchanged", () => {
    // SPEC-FED-1: spreading state should leave unrelated vars intact.
    const state = makeState({
      vars: {
        policy_rate: 0.05, long_rate: 0.06, portfolio_yield: 0.03,
        balance_sheet: 0.5, inflation: 0.04, unemployment: 0.05,
        deferred_asset: 0, operating_budget: 0,
      },
    });
    const result = applyFedFinances(state, BASE_PARAMS);
    expect(result.vars.inflation).toBe(0.04);
    expect(result.vars.unemployment).toBe(0.05);
    expect(result.vars.policy_rate).toBe(0.05);
  });
});

describe("loadFedFinancesParams (SPEC-FED-1)", () => {
  // SPEC-FED-1: content/engine/fed-finances.json loads and validates.
  it("loadFedFinancesParams returns valid params with portfolio_half_life_months > 0", () => {
    // SPEC-FED-1: schema-governed content file must load cleanly.
    const params = loadFedFinancesParams();
    expect(params.portfolio_half_life_months).toBeGreaterThan(0);
    expect(Number.isFinite(params.portfolio_half_life_months)).toBe(true);
  });

  it("returns the same object reference on repeated calls (cache)", () => {
    // SPEC-FED-1: loader caches params.
    const first = loadFedFinancesParams();
    const second = loadFedFinancesParams();
    expect(first).toBe(second);
  });

  it("cache can be reset so next call re-reads", () => {
    // SPEC-FED-1
    const first = loadFedFinancesParams();
    _resetFedFinancesParamsCache();
    const second = loadFedFinancesParams();
    expect(second.portfolio_half_life_months).toBe(first.portfolio_half_life_months);
    expect(first).not.toBe(second);
  });

  it("schema rejects portfolio_half_life_months = 0 (must be > 0)", () => {
    // SPEC-FED-1: schema enforces exclusiveMinimum: 0.
    registerContentFile("content/engine/fed-finances.json", {
      portfolio_half_life_months: 0,
      initial_balance_sheet: 0.25,
      initial_portfolio_yield: 0.03,
      initial_deferred_asset: 0,
      initial_operating_budget: 0,
    });
    expect(() => loadFedFinancesParams()).toThrow();
  });

  it("schema rejects negative initial_balance_sheet", () => {
    // SPEC-FED-1: balance_sheet must be non-negative.
    registerContentFile("content/engine/fed-finances.json", {
      portfolio_half_life_months: 84,
      initial_balance_sheet: -1,
      initial_portfolio_yield: 0.03,
      initial_deferred_asset: 0,
      initial_operating_budget: 0,
    });
    expect(() => loadFedFinancesParams()).toThrow();
  });

  it("schema rejects missing required fields", () => {
    // SPEC-FED-1: all required fields must be present.
    registerContentFile("content/engine/fed-finances.json", {
      portfolio_half_life_months: 84,
    });
    expect(() => loadFedFinancesParams()).toThrow();
  });
});

describe("Session.advance integration (SPEC-FED-1)", () => {
  // SPEC-FED-1: Session.advance(12) yields finite finances vars.
  it("Session.advance(12) produces finite portfolio_yield, net_income, deferred_asset", () => {
    // SPEC-FED-1: applyFedFinances is called each month inside Session.advance().
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(12);
    const { portfolio_yield, net_income, deferred_asset } = session.current.vars;
    for (const [name, val] of [["portfolio_yield", portfolio_yield], ["net_income", net_income], ["deferred_asset", deferred_asset]] as [string, unknown][]) {
      expect(typeof val, `${name} should be a number`).toBe("number");
      expect(Number.isFinite(val as number), `${name} should be finite`).toBe(true);
    }
  });

  // SPEC-FED-1: deferred_asset must be >= 0 (non-negative accumulator).
  it("Session.advance(12) deferred_asset is non-negative", () => {
    // SPEC-FED-1: deferred_asset only accumulates losses, never goes negative.
    const session = Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
    session.advance(12);
    expect(session.current.vars.deferred_asset as number).toBeGreaterThanOrEqual(0);
  });
});
