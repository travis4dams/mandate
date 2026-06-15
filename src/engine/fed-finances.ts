// SPEC-FED-1: Fed balance-sheet finances — portfolio yield EWMA, net income, deferred asset.
//
// The Federal Reserve's portfolio yield (book yield of the SOMA) adjusts slowly toward the
// current long_rate via an EWMA. When the policy rate paid on liabilities exceeds the
// portfolio's book yield, net income is negative — the Fed books a "deferred asset" (a
// liability that can only be resolved by future profits).
//
// Mechanics per month:
//   λ = 1 − exp(−ln(2) / portfolio_half_life_months)
//   portfolio_yield_new = (1 − λ) * portfolio_yield + λ * long_rate
//     cold-start: portfolio_yield absent → default to initial_portfolio_yield (params)
//                 long_rate absent → default to policy_rate
//   net_income = (portfolio_yield − policy_rate) * balance_sheet
//   if net_income < 0:
//     deferred_asset += −net_income   (no remittance)
//   else:
//     surplus first retires deferred_asset (floor 0), remainder lifts operating_budget
//
// All vars default from params initial_* when absent from state (SPEC-PROD-1 pattern).
// Pure: returns a new GameState; never mutates the input.
// No Math.random() or Date.now() (SPEC-SIM-1).

import { join } from "node:path";
import { loadValidatedFile } from "../content/loader.js";
import type { GameState } from "./state.js";

export interface FedFinancesParams {
  portfolio_half_life_months: number;
  initial_balance_sheet: number;
  initial_portfolio_yield: number;
  initial_deferred_asset: number;
  initial_operating_budget: number;
}

const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/fed-finances.schema.json",
);
const FILE_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../content/engine/fed-finances.json",
);

let _cachedParams: FedFinancesParams | undefined;

/** Lazy-loaded, cached fed-finances params from content/engine/fed-finances.json. */
export function loadFedFinancesParams(): FedFinancesParams {
  if (_cachedParams !== undefined) return _cachedParams;
  try {
    _cachedParams = loadValidatedFile<FedFinancesParams>(SCHEMA_PATH, FILE_PATH);
  } catch (e) {
    throw new Error(
      "Failed to load fed-finances params from content/engine/fed-finances.json",
      { cause: e },
    );
  }
  return _cachedParams;
}

/** Test-only: clear the cache so the next loadFedFinancesParams() re-reads and re-validates. */
export function _resetFedFinancesParamsCache(): void {
  _cachedParams = undefined;
}

/**
 * Apply one month of Fed balance-sheet finances (SPEC-FED-1).
 *
 * 1. EWMA portfolio_yield toward long_rate (cold-starts to initial_portfolio_yield).
 * 2. net_income = (portfolio_yield − policy_rate) * balance_sheet.
 * 3. If net_income < 0: grow deferred_asset by −net_income (no remittance).
 *    If net_income >= 0: surplus first retires deferred_asset (floor 0),
 *                        remainder lifts operating_budget.
 *
 * All vars default from params initial_* when absent from state.
 * Pure: returns a new GameState; never mutates the input.
 */
export function applyFedFinances(
  state: GameState,
  params: FedFinancesParams,
): GameState {
  const policyRate = state.vars.policy_rate as number;
  // long_rate falls back to policy_rate when term-structure hasn't run yet.
  const longRate = (state.vars.long_rate as number | undefined) ?? policyRate;

  // Cold-start: when portfolio_yield is absent, default to policy_rate so the
  // first tick's EWMA output equals policy_rate (mirroring SPEC-TERM-1 pattern).
  const prevYield =
    (state.vars.portfolio_yield as number | undefined) ?? policyRate;
  const balanceSheet =
    (state.vars.balance_sheet as number | undefined) ??
    params.initial_balance_sheet;
  const prevDeferred =
    (state.vars.deferred_asset as number | undefined) ??
    params.initial_deferred_asset;
  const prevBudget =
    (state.vars.operating_budget as number | undefined) ??
    params.initial_operating_budget;

  // EWMA: portfolio_yield converges toward long_rate.
  const lambda = 1 - Math.exp(-Math.LN2 / params.portfolio_half_life_months);
  const newYield = (1 - lambda) * prevYield + lambda * longRate;

  // Carry: positive when legacy book yield exceeds cost of liabilities.
  const netIncome = (newYield - policyRate) * balanceSheet;

  let newDeferred: number;
  let newBudget: number;

  if (netIncome < 0) {
    // Loss: accumulate deferred asset; no remittance to Treasury.
    newDeferred = prevDeferred + (-netIncome);
    newBudget = prevBudget;
  } else {
    // Surplus: first pay down any deferred asset, then lift operating budget.
    const deferredRepayment = Math.min(netIncome, prevDeferred);
    newDeferred = prevDeferred - deferredRepayment;
    newBudget = prevBudget + (netIncome - deferredRepayment);
  }

  return {
    ...state,
    vars: {
      ...state.vars,
      portfolio_yield: newYield,
      net_income: netIncome,
      balance_sheet: balanceSheet,
      deferred_asset: newDeferred,
      operating_budget: newBudget,
    },
  };
}
