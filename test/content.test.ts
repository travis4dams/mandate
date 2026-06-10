import { describe, it, expect } from "vitest";
import { loadValidated } from "../src/content/loader";

// SPEC-CONTENT-1: all shipped content must validate against its schema. This test
// is what stops a malformed event or tech from ever reaching a player.
describe("shipped content validates against schema", () => {
  it("events", () => {
    const events = loadValidated("schemas/event.schema.json", "content/events");
    expect(events.length).toBeGreaterThan(0);
  });
  it("techs", () => {
    const techs = loadValidated("schemas/tech.schema.json", "content/tech");
    expect(techs.length).toBeGreaterThan(0);
  });
  // SPEC-CONTENT-4: the backstop covers all shipped content types, not just events/tech.
  // Floor is "at least one validated file" per the spec; content COUNT policy lives with
  // the content specs themselves (e.g. SPEC-SCEN-2), not here.
  it("scenarios", () => {
    const scenarios = loadValidated("schemas/scenario.schema.json", "content/scenarios");
    expect(scenarios.length).toBeGreaterThan(0);
  });
  it("doctrines", () => {
    const doctrines = loadValidated("schemas/doctrine.schema.json", "content/doctrines");
    expect(doctrines.length).toBeGreaterThan(0);
  });
  it("briefings", () => {
    const briefings = loadValidated("schemas/briefing.schema.json", "content/briefings");
    expect(briefings.length).toBeGreaterThan(0);
  });
  it("hearings", () => {
    const hearings = loadValidated("schemas/hearing.schema.json", "content/hearings");
    expect(hearings.length).toBeGreaterThan(0);
  });
});
