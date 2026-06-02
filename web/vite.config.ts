/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin: rewrite `import.meta.url` in engine source files to a proper
 * `file://` URL literal during the Vitest transform phase.
 *
 * When Vitest runs in jsdom environment, Vite transforms import.meta.url for
 * files outside the web root into browser-style /@fs/... URLs. The engine's
 * schema-loading code uses `new URL(".", import.meta.url).pathname` to derive
 * absolute paths; with a /@fs URL the resulting pathname is unusable by node:fs.
 *
 * This plugin intercepts engine source files during the transform phase and
 * replaces `import.meta.url` with a `file://` URL literal, restoring the
 * filesystem-path semantics the engine expects.
 */
function engineImportMetaUrlFix(): Plugin {
  return {
    name: "vite:engine-import-meta-url-fix",
    enforce: "pre",
    transform(code, id) {
      // Only apply to engine source files (outside web/)
      if (!id.includes("/src/") || id.includes("/web/src/")) return null;
      if (!code.includes("import.meta.url")) return null;

      // Replace import.meta.url with a file:// URL literal for this specific file.
      const fileUrl = JSON.stringify(`file://${id}`);
      const fixed = code.split("import.meta.url").join(fileUrl);
      return { code: fixed, map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), engineImportMetaUrlFix()],
  build: {
    rollupOptions: {
      // The engine uses node:fs / node:path to load JSON schemas at startup —
      // these are Node.js-only APIs. Externalising them lets the Vite browser
      // build complete; a future web-native data layer will replace them.
      external: (id: string) => id.startsWith("node:") || id === "ajv/dist/2020",
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    // Allow the engine imports (which live in the repo root's node_modules) to
    // resolve packages like `ajv` when running vitest from web/.
    deps: {
      moduleDirectories: [
        "node_modules",
        join(__dirname, "..", "node_modules"),
      ],
    },
  },
});
