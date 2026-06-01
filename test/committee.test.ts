import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCommittee, CommitteeNotFoundError, CommitteeDuplicateMemberError } from "../src/content/committees";
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
          { id: "member.volcker", name: "member.volcker.name", lean: "hawkish", competence: 0.9 },
          { id: "member.volcker", name: "member.volcker.name", lean: "hawkish", competence: 0.8 },
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
          { id: "member.volcker", name: "member.volcker.name", lean: "hawkish", competence: 1.5 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/competence/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a member with negative competence (< 0)", () => {
    const dir = join(tmpdir(), `mandate-test-comm-neg-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = {
        id: "comm.test_neg",
        name: "comm.test_neg.name",
        desc: "comm.test_neg.desc",
        members: [
          { id: "member.volcker", name: "member.volcker.name", lean: "hawkish", competence: -0.1 },
        ],
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
        desc: "The 1979 Federal Open Market Committee.", // inline English — must fail
        members: [
          { id: "member.volcker", name: "member.volcker.name", lean: "hawkish", competence: 0.9 },
        ],
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
        members: [
          { id: "volcker", name: "member.volcker.name", lean: "hawkish", competence: 0.9 },
        ],
      };
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(COMMITTEE_SCHEMA, dir)).toThrow(/id/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
