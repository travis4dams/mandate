// SPEC-WEB-2: browser-side stubs for the Node-only modules the engine's loader.ts
// imports. The engine's loader normalizes lookup keys against the pre-registered
// content registry, so readFileSync / readdirSync are NEVER invoked in the browser
// path — these stubs only exist to satisfy Vite's bundler when it follows the
// `import { readFileSync, readdirSync } from "node:fs"` statement.

function unreachable(symbol: string): never {
  throw new Error(
    `${symbol} called in browser bundle — engine content registry missed a registration. ` +
      `Ensure web/src/engine-content.ts is imported before any Session is constructed.`,
  );
}

// node:fs surface that loader.ts uses.
export function readFileSync(_path: string, _encoding?: string): string {
  unreachable("readFileSync");
}
export function readdirSync(_path: string): string[] {
  unreachable("readdirSync");
}

// node:path surface that loader.ts uses.
export function join(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/");
}
