import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCommittee, CommitteeNotFoundError, CommitteeDuplicateMemberError } from "../src/content/committees";
import { loadValidated } from "../src/content/loader";

// SPEC-COMM-1 (schema) + SPEC-COMM-3 (per-member coefficient fields).

const COMMITTEE_SCHEMA = new URL("../schemas/committee.schema.json", import.meta.url).pathname;

// Default per-member coefficient fixture matching the empirical median.
const M = (id: string, name: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id,
  name,
  inflation_coef: 1.7,
  output_coef: 0.4,
  inertia: 0.88,
  competence: 0.9,
  compromise_band: 0.005,
  ...overrides,
});

describe("loadCommittee", () => {
  // SPEC-COMM-3: real FOMC has 12 voters (7 governors + NY permanent + 4 rotating regional presidents).
  it("loads the 1979 FOMC committee with 12 members and valid Taylor-rule coefficients", () => {
    const committee = loadCommittee("comm.fomc_1979");
    expect(committee.id).toBe("comm.fomc_1979");
    expect(committee.members).toHaveLength(12);
    for (const m of committee.members) {
      expect(typeof m.id).toBe("string");
      expect(typeof m.name).toBe("string");
      expect(m.inflation_coef).toBeGreaterThan(0);
      expect(m.inflation_coef).toBeLessThanOrEqual(5);
      expect(m.output_coef).toBeGreaterThan(0);
      expect(m.output_coef).toBeLessThanOrEqual(5);
      expect(m.inertia).toBeGreaterThanOrEqual(0);
      expect(m.inertia).toBeLessThanOrEqual(1);
      expect(m.competence).toBeGreaterThanOrEqual(0);
      expect(m.competence).toBeLessThanOrEqual(1);
    }
  });

  it("throws CommitteeNotFoundError for an unknown id", () => {
    expect(() => loadCommittee("comm.unknown")).toThrow(CommitteeNotFoundError);
  });

  it("throws CommitteeDuplicateMemberError when a committee has two members sharing an id", () => {
    const dir = join(tmpdir(), `mandate-test-comm-dup-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const dup = {
        id: "comm.test_dup",
        name: "comm.test_dup.name",
        desc: "comm.test_dup.desc",
        members: [
          M("member.chair", "member.chair.name"),
          M("member.chair", "member.chair.name"),
        ],
      };
      writeFileSync(join(dir, "dup.json"), JSON.stringify(dup));
      expect(() => loadCommittee("comm.test_dup", dir)).toThrow(CommitteeDuplicateMemberError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("committee schema validation", () => {
  it("rejects a member with an inline player-facing name (not a loc key)", () => {
    const dir = join(tmpdir(), `mandate-test-comm-name-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_bad",
        name: "comm.test_bad.name",
        desc: "comm.test_bad.desc",
        members: [M("member.chair", "Dr. Eleanor Voss")],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/name/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC-COMM-3: inflation_coef has an upper bound (5) to keep authoring errors out of the engine.
  it("rejects a member with inflation_coef out of range", () => {
    const dir = join(tmpdir(), `mandate-test-comm-inf-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_inf",
        name: "comm.test_inf.name",
        desc: "comm.test_inf.desc",
        members: [M("member.chair", "member.chair.name", { inflation_coef: 50 })],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/inflation_coef/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC-COMM-3: output_coef shares the [0, 5] upper bound — symmetry with inflation_coef.
  it("rejects a member with output_coef out of range", () => {
    const dir = join(tmpdir(), `mandate-test-comm-out-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_out",
        name: "comm.test_out.name",
        desc: "comm.test_out.desc",
        members: [M("member.chair", "member.chair.name", { output_coef: 50 })],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/output_coef/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC-COMM-3: inertia is a smoothing weight in [0, 1].
  it("rejects a member with inertia > 1", () => {
    const dir = join(tmpdir(), `mandate-test-comm-inertia-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_inertia",
        name: "comm.test_inertia.name",
        desc: "comm.test_inertia.desc",
        members: [M("member.chair", "member.chair.name", { inertia: 1.5 })],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/inertia/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a member with competence out of range (> 1)", () => {
    const dir = join(tmpdir(), `mandate-test-comm-comp-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_comp",
        name: "comm.test_comp.name",
        desc: "comm.test_comp.desc",
        members: [M("member.chair", "member.chair.name", { competence: 1.5 })],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/competence/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an empty members array (schema requires minItems: 1)", () => {
    const dir = join(tmpdir(), `mandate-test-comm-empty-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_empty",
        name: "comm.test_empty.name",
        desc: "comm.test_empty.desc",
        members: [],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/members/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a committee whose top-level desc is inline English (loc-key pattern violation)", () => {
    const dir = join(tmpdir(), `mandate-test-comm-desc-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_desc",
        name: "comm.test_desc.name",
        desc: "The 1979 Federal Open Market Committee.",
        members: [M("member.chair", "member.chair.name")],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/desc/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a member id missing the 'member.' prefix", () => {
    const dir = join(tmpdir(), `mandate-test-comm-id-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_id",
        name: "comm.test_id.name",
        desc: "comm.test_id.desc",
        members: [M("hank", "member.chair.name")],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/id/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
