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
});
