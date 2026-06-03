// SPEC-WEB-2: register all engine content + schemas with the engine's loader registry
// before any Session is constructed. Vite bundles every JSON in content/ and schemas/
// statically via import.meta.glob({ eager: true }) so the browser never needs filesystem
// access. The engine loader normalizes lookup keys to the project-relative form
// (e.g. "content/engine/tick.json"), so the registered keys match what Node-side code
// computes via join(import.meta.url, "../../content/...").

import {
  registerContentFile,
  registerContentDir,
} from "../../src/content/loader";

const schemas = import.meta.glob<{ default: unknown }>(
  "../../schemas/*.json",
  { eager: true },
);
const engineParams = import.meta.glob<{ default: unknown }>(
  "../../content/engine/*.json",
  { eager: true },
);
const localizationFiles = import.meta.glob<{ default: unknown }>(
  "../../content/localization/*.json",
  { eager: true },
);
const scenarioFiles = import.meta.glob<{ default: unknown }>(
  "../../content/scenarios/*.json",
  { eager: true },
);
const committeeFiles = import.meta.glob<{ default: unknown }>(
  "../../content/committees/*.json",
  { eager: true },
);
const replayFiles = import.meta.glob<{ default: unknown }>(
  "../../content/replays/*.json",
  { eager: true },
);
const calibrationFiles = import.meta.glob<{ default: unknown }>(
  "../../content/calibration/*.json",
  { eager: true },
);

// Reject `mod.default === undefined` at registration time rather than letting
// such a value enter the registry and surface later as an opaque AJV
// "data must be object" error with no file pointer. The most likely cause is a
// Vite JSON-import failure during dev/HMR.
function assertDefined(path: string, value: unknown): unknown {
  if (value === undefined) {
    throw new Error(
      `engine-content: "${path}" loaded with default === undefined — ` +
        `Vite likely failed to parse this JSON file. Check the file for a syntax error.`,
    );
  }
  return value;
}

function registerEach(modules: Record<string, { default: unknown }>): void {
  for (const [path, mod] of Object.entries(modules)) {
    registerContentFile(path, assertDefined(path, mod.default));
  }
}

function registerDirEntities(
  modules: Record<string, { default: unknown }>,
  dirSuffix: string,
): void {
  const entries = Object.entries(modules);
  const items: unknown[] = entries.map(([path, m]) => assertDefined(path, m.default));
  if (items.length === 0) {
    throw new Error(
      `engine-content: zero files matched for "${dirSuffix}" — ` +
        `check the import.meta.glob pattern or Vite's server.fs.allow config.`,
    );
  }
  registerContentDir(dirSuffix, items);
}

// Module-load side effect: registration runs once at import time so it always
// completes BEFORE any engine module's eager loaders (e.g. clock.ts's module-level
// loadHistorySize() call) execute. The browser entry points + tests should
// import this file before any engine module to guarantee that ordering.
registerEach(schemas);
registerEach(engineParams);
registerEach(localizationFiles);
registerEach(scenarioFiles);
registerEach(committeeFiles);
registerEach(replayFiles);
registerEach(calibrationFiles);
registerDirEntities(scenarioFiles, "content/scenarios");
registerDirEntities(committeeFiles, "content/committees");
registerDirEntities(replayFiles, "content/replays");
registerDirEntities(calibrationFiles, "content/calibration");
