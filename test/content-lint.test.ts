import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// SPEC-CONTENT-3: Content files MUST NOT contain ids whose slug matches a
// blocklist of real historical/famous public figures.

const BLOCKLIST = [
  "volcker",
  "wallich",
  "partee",
  "teeters",
  "coldwell",
  "schultz",
  "rice",
  "burns",
  "miller",
  "greenspan",
  "bernanke",
  "yellen",
  "powell",
  "taylor",
];

function collectJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectJsonFiles(full));
    } else if (entry.endsWith(".json")) {
      results.push(full);
    }
  }
  return results;
}

function collectIds(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  const ids: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      ids.push(...collectIds(item));
    }
  } else {
    const obj = value as Record<string, unknown>;
    if (typeof obj["id"] === "string") {
      ids.push(obj["id"]);
    }
    for (const v of Object.values(obj)) {
      if (typeof v === "object" && v !== null) {
        ids.push(...collectIds(v));
      }
    }
  }
  return ids;
}

function slugAfterDot(id: string): string {
  const dot = id.lastIndexOf(".");
  return dot >= 0 ? id.slice(dot + 1) : id;
}

describe("content id blocklist (SPEC-CONTENT-3)", () => {
  it("no content id slug matches a real-person blocklist entry", () => {
    const contentDir = join(__dirname, "..", "content");
    const files = collectJsonFiles(contentDir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
      const ids = collectIds(parsed);
      for (const id of ids) {
        const slug = slugAfterDot(id).toLowerCase();
        for (const blocked of BLOCKLIST) {
          expect(
            slug.includes(blocked),
            `id "${id}" in ${file} matches blocklist entry "${blocked}"`
          ).toBe(false);
        }
      }
    }
  });
});
