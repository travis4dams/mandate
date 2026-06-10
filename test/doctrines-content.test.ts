import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadDoctrineCatalog,
  getDoctrine,
  _resetDoctrineCatalogCache,
} from "../src/content/doctrines.js";

// SPEC-DOCT-3: the catalog carries a third, purely-generic doctrine (no meeting hook),
// proving doctrines can ship as content without engine changes.
describe("SPEC-DOCT-3: gradualism doctrine", () => {
  afterEach(() => {
    _resetDoctrineCatalogCache();
  });

  it("is in the catalog", () => {
    const catalog = loadDoctrineCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    expect(catalog.map((d) => d.id)).toContain("doctrine.gradualism");
  });

  it("resolves with generic fields only", () => {
    const d = getDoctrine("doctrine.gradualism");
    expect(d.flip_flop_cost).toBeGreaterThan(0);
    expect(d.meeting_hook).toBeUndefined();
    expect(d.standing_effects?.length).toBeGreaterThan(0);
  });

  it("localization keys resolve", () => {
    const locale = JSON.parse(
      readFileSync("content/localization/en.json", "utf8"),
    ) as Record<string, string>;
    const d = getDoctrine("doctrine.gradualism");
    expect(locale[d.name]).toBeTypeOf("string");
    expect(locale[d.description]).toBeTypeOf("string");
  });
});
