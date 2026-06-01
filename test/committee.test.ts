import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCommittee, CommitteeNotFoundError } from "../src/content/committees";
import { loadValidated } from "../src/content/loader";

// SPEC-COMM-1

const COMMITTEE_SCHEMA = new URL("../schemas/committee.schema.json", import.meta.url).pathname;

describe("loadCommittee", () => {
  it("loads the 1979 FOMC committee with ~7 members and valid fields", () => {
    const committee = loadCommittee("comm.fomc_1979");
    expect(committee.id).toBe("comm.fomc_1979");
    expect(committee.members.length).toBeGreaterThanOrEqual(7);
    for (const m of committee.members) {
      expect(typeof m.id).toBe("string");
      expect(typeof m.name).toBe("string");
      expect(["hawkish", "dovish", "neutral"]).toContain(m.lean);
      expect(m.competence).toBeGreaterThanOrEqual(0);
      expect(m.competence).toBeLessThanOrEqual(1);
    }
  });

  it("throws CommitteeNotFoundError for an unknown id", () => {
    expect(() => loadCommittee("comm.unknown")).toThrow(CommitteeNotFoundError);
    expect(() => loadCommittee("comm.unknown")).toThrow(/comm\.unknown/);
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
        members: [
          {
            id: "member.volcker",
            name: "Paul Volcker", // inline English — must fail schema
            lean: "hawkish",
            competence: 0.95,
          },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/name/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a member with an invalid lean value", () => {
    const dir = join(tmpdir(), `mandate-test-comm-lean-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_lean",
        name: "comm.test_lean.name",
        desc: "comm.test_lean.desc",
        members: [
          {
            id: "member.volcker",
            name: "member.volcker.name",
            lean: "moderate", // not in enum
            competence: 0.95,
          },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/lean/);
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
        members: [
          {
            id: "member.volcker",
            name: "member.volcker.name",
            lean: "hawkish",
            competence: 1.5, // > 1 — must fail schema
          },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/competence/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
