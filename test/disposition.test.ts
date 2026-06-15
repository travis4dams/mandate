import { describe, it, expect } from "vitest";
import {
  generateCandidates,
  hireStaff,
  loadInstitutionParams,
  type Division,
} from "../src/engine/institution.js";
import { loadNamePools } from "../src/engine/names.js";
import { divisionEffects, type DivisionEffectsParams } from "../src/engine/division-effects.js";
import { applyCultureDrift, type CultureParams } from "../src/engine/culture.js";
import type { GameState } from "../src/engine/state.js";

// SPEC-STAFF-2: directors carry a HIDDEN hawkish/dovish disposition that slightly
// colors their division's work and is not surfaced on the candidate card.

const SKILLS = { forecasting: 0.5, markets: 0.5, supervision: 0.5, communication: 0.5, crisis: 0.5 };

function div(id: string, channel: Division["channel"]): Division {
  return { id, name: `division.${id}.name`, desc: `division.${id}.desc`, hire_cost: 5, investment: 0.2, channel, skill_weights: SKILLS };
}
function makeState(vars: Record<string, number>, flags: Record<string, boolean> = {}): GameState {
  return { date: "1979-08", vars: { ...vars }, flags: { ...flags }, history: [] };
}

const EFFECTS_PARAMS: DivisionEffectsParams = {
  competence_floor: 0.3,
  disposition_influence: 0.1,
  effect_strength: {
    fog: 0.6, transmission: 0.5, fragility_visibility: 0.5, fragility_mitigation: 0.6,
    crisis_severity: 0.5, external_shock: 0.4, org: 0.3, political: 0.3, oversight: 0.3,
  },
};
const CULTURE_PARAMS: CultureParams = {
  policy_lean_halflife: 12,
  supervisory_rigor_halflife: 12,
  initial_supervisory_rigor: 0.4,
  disposition_lean_weight: 0.5,
};

describe("SPEC-STAFF-2: hidden director disposition", () => {
  it("generateCandidates draws disposition deterministically in [-1,1]", () => {
    const pools = loadNamePools();
    const params = loadInstitutionParams();
    const a = generateCandidates("supervision", 42, pools, params);
    const b = generateCandidates("supervision", 42, pools, params);
    expect(a.map((c) => c.disposition)).toEqual(b.map((c) => c.disposition));
    for (const c of a) {
      expect(c.disposition).toBeGreaterThanOrEqual(-1);
      expect(c.disposition).toBeLessThanOrEqual(1);
    }
  });

  it("disposition is independent of the visible lean", () => {
    const pools = loadNamePools();
    const params = loadInstitutionParams();
    // Collect (lean, disposition) across many divisions to show disposition is not
    // a function of the lean encoding.
    const pairs: { lean: string; disposition: number }[] = [];
    for (const id of ["research", "supervision", "monetary_affairs", "international", "legal", "coo"]) {
      for (const c of generateCandidates(id, 7, pools, params)) {
        pairs.push({ lean: c.lean, disposition: c.disposition ?? 0 });
      }
    }
    // There exist two candidates sharing a lean but with opposite-signed dispositions.
    const byLean = new Map<string, number[]>();
    for (const p of pairs) {
      const arr = byLean.get(p.lean) ?? [];
      arr.push(p.disposition);
      byLean.set(p.lean, arr);
    }
    const hasOppositeWithinALean = [...byLean.values()].some(
      (ds) => ds.some((d) => d > 0.05) && ds.some((d) => d < -0.05),
    );
    expect(hasOppositeWithinALean).toBe(true);
  });

  it("hireStaff stores staff.<id>.disposition", () => {
    const candidate = { name: "X", competence: 0.6, lean: "centrist" as const, skills: SKILLS, disposition: 0.7 };
    const state = makeState({ political_capital: 50 });
    const result = hireStaff(state, div("supervision", "fragility_mitigation"), candidate);
    expect(result.vars["staff.supervision.disposition"]).toBeCloseTo(0.7);
  });

  it("a hawkish vs dovish Supervision head (same skills) yield different fragility mitigation", () => {
    const catalog = [div("supervision", "fragility_mitigation")];
    const base = { "staff.supervision.eff": 0.6 };
    const hawk = divisionEffects(makeState({ ...base, "staff.supervision.disposition": 1 }, { "staffed.supervision": true }), catalog, EFFECTS_PARAMS);
    const dove = divisionEffects(makeState({ ...base, "staff.supervision.disposition": -1 }, { "staffed.supervision": true }), catalog, EFFECTS_PARAMS);
    expect(hawk.fragilityMitigation).toBeGreaterThan(dove.fragilityMitigation);
    // The whole gap comes from disposition and is bounded by 2 * disposition_influence.
    expect(hawk.fragilityMitigation - dove.fragilityMitigation).toBeCloseTo(2 * EFFECTS_PARAMS.disposition_influence);
  });

  it("a hawkish Research head biases forecasts up; dovish biases down; bounded", () => {
    const catalog = [div("research", "fog")];
    const base = { "staff.research.eff": 0.6 };
    const hawk = divisionEffects(makeState({ ...base, "staff.research.disposition": 1 }, { "staffed.research": true }), catalog, EFFECTS_PARAMS);
    const dove = divisionEffects(makeState({ ...base, "staff.research.disposition": -1 }, { "staffed.research": true }), catalog, EFFECTS_PARAMS);
    expect(hawk.forecastBias).toBeCloseTo(EFFECTS_PARAMS.disposition_influence);
    expect(dove.forecastBias).toBeCloseTo(-EFFECTS_PARAMS.disposition_influence);
    expect(Math.abs(hawk.forecastBias)).toBeLessThanOrEqual(EFFECTS_PARAMS.disposition_influence + 1e-9);
  });

  it("a hawkish-disposition cohort pulls institutional policy_lean hawkish even at centrist lean", () => {
    const catalog = [div("monetary_affairs", "transmission")];
    // centrist visible lean (0), but hidden hawkish disposition (+1).
    const flags = { "staffed.monetary_affairs": true };
    const hawkState = applyCultureDrift(
      makeState({ "staff.monetary_affairs.lean": 0, "staff.monetary_affairs.disposition": 1, "staff.monetary_affairs.eff": 0.6 }, flags),
      catalog, CULTURE_PARAMS,
    );
    const neutralState = applyCultureDrift(
      makeState({ "staff.monetary_affairs.lean": 0, "staff.monetary_affairs.disposition": 0, "staff.monetary_affairs.eff": 0.6 }, flags),
      catalog, CULTURE_PARAMS,
    );
    expect(hawkState.vars["culture.policy_lean"] as number).toBeGreaterThan(neutralState.vars["culture.policy_lean"] as number);
  });
});
