import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadValidated, _resetValidateFileCache } from "../src/content/loader";
import { loadTraitCatalog, _resetTraitCatalogCache } from "../src/content/traits";

// SPEC-COMM-5: trait catalog schema + loader.

const TRAITS_SCHEMA = new URL("../schemas/traits.schema.json", import.meta.url).pathname;

afterEach(() => {
  _resetTraitCatalogCache();
  _resetValidateFileCache();
});

describe("trait catalog loader (SPEC-COMM-5)", () => {
  it("loads the committed catalog with at least one trait", () => {
    // SPEC-COMM-5
    const catalog = loadTraitCatalog();
    expect(catalog.length).toBeGreaterThan(0);
  });

  it("every committed trait has a loc-key name and desc, and a valid id prefix", () => {
    // SPEC-COMM-5
    const catalog = loadTraitCatalog();
    for (const t of catalog) {
      expect(t.id).toMatch(/^trait\./);
      expect(t.name).toMatch(/^[a-z][a-z0-9_.]+$/);
      expect(t.desc).toMatch(/^[a-z][a-z0-9_.]+$/);
    }
  });

  it("returns the same reference on repeated calls (cache)", () => {
    // SPEC-COMM-5
    const first = loadTraitCatalog();
    const second = loadTraitCatalog();
    expect(first).toBe(second);
  });
});

describe("trait schema validation (SPEC-COMM-5)", () => {
  it("accepts a well-formed trait with all required fields", () => {
    // SPEC-COMM-5
    const dir = join(tmpdir(), `mandate-test-traits-ok-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const good = [
        {
          id: "trait.test_valid",
          name: "trait.test_valid.name",
          desc: "trait.test_valid.desc",
          effects: { preferred_rate_shift: 0.003 },
          signal_hooks: [{ signal: "sector.energy", direction: 1, magnitude: 0.001 }],
        },
      ];
      writeFileSync(join(dir, "good.json"), JSON.stringify(good));
      const result = loadValidated(TRAITS_SCHEMA, dir);
      expect(result).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a trait missing the required 'effects' field", () => {
    // SPEC-COMM-5
    const dir = join(tmpdir(), `mandate-test-traits-noeff-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = [
        {
          id: "trait.missing_effects",
          name: "trait.missing_effects.name",
          desc: "trait.missing_effects.desc",
          // effects is missing
        },
      ];
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(TRAITS_SCHEMA, dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a trait with a non-loc-key name (inline English string)", () => {
    // SPEC-COMM-5
    const dir = join(tmpdir(), `mandate-test-traits-badname-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = [
        {
          id: "trait.bad_name",
          name: "Inflation Hawk",   // inline English, not a loc key
          desc: "trait.bad_name.desc",
          effects: {},
        },
      ];
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(TRAITS_SCHEMA, dir)).toThrow(/name/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a trait with preferred_rate_shift out of range", () => {
    // SPEC-COMM-5
    const dir = join(tmpdir(), `mandate-test-traits-oor-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      const bad = [
        {
          id: "trait.huge_shift",
          name: "trait.huge_shift.name",
          desc: "trait.huge_shift.desc",
          effects: { preferred_rate_shift: 99 },  // max is 0.5
        },
      ];
      writeFileSync(join(dir, "bad.json"), JSON.stringify(bad));
      expect(() => loadValidated(TRAITS_SCHEMA, dir)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
