import { describe, it, expect } from "vitest";
import "./engine-content";
import { loadTraitCatalog } from "../../src/content/traits";
import { loadDoctrineCatalog } from "../../src/content/doctrines";
import { loadHearing } from "../../src/content/hearings";
import { loadNamePools } from "../../src/engine/names";
import { loadDivisionCatalog } from "../../src/engine/institution";
import { loadEventCatalog } from "../../src/content/events";

// SPEC-WEB-2: every content type the engine loads at runtime must be pre-registered
// in the browser content registry. Session's meeting flow loads the trait catalog
// (member preferences) and the doctrine catalog (meeting hooks); the hearing flow
// loads hearings. Under the node:fs → node-stubs alias these tests take the same
// registry-only path as the browser bundle, so a missed registration throws here
// instead of breaking committee consensus at runtime.
describe("SPEC-WEB-2: registry covers all engine-loaded content", () => {
  it("trait catalog loads from the registry", () => {
    expect(loadTraitCatalog().length).toBeGreaterThan(0);
  });

  it("doctrine catalog loads from the registry", () => {
    expect(loadDoctrineCatalog().length).toBeGreaterThan(0);
  });

  it("confirmation hearing loads from the registry", () => {
    expect(loadHearing("hearing.confirmation").id).toBe("hearing.confirmation");
  });

  // SPEC-NAME-1: the name generator reads content/names/pools.json at runtime.
  it("name pools load from the registry", () => {
    const pools = loadNamePools();
    expect(pools.given_names.length).toBeGreaterThan(0);
    expect(pools.surnames.length).toBeGreaterThan(0);
  });

  // SPEC-INST-2: the institution layer reads content/divisions/*.json at runtime.
  it("division catalog loads from the registry", () => {
    expect(loadDivisionCatalog().length).toBeGreaterThan(0);
  });

  // SPEC-EVENT-1: Session.advance() loads the event catalog from content/events/*.json.
  it("event catalog loads from the registry", () => {
    expect(loadEventCatalog().length).toBeGreaterThan(0);
  });
});
