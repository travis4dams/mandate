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

// node:path `join` — resolves `..` segments the same way Node's path.posix.join does
// so engine code like `join(new URL(".", import.meta.url).pathname, "../../content/...")`
// produces a clean path the registry's normalizer can key on. Without `..` resolution,
// any path that doesn't happen to contain a `schemas/` or `content/` segment would
// silently miss the registry and fire the stub error.
export function join(...segments: string[]): string {
  const combined = segments.join("/").replace(/\/+/g, "/");
  const isAbsolute = combined.startsWith("/");
  const parts: string[] = [];
  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (!isAbsolute) {
        parts.push("..");
      }
      continue;
    }
    parts.push(segment);
  }
  return (isAbsolute ? "/" : "") + parts.join("/");
}
