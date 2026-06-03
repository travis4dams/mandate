/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// SPEC-WEB-2: stub node:fs and node:path so the engine's loader.ts bundles cleanly
// for the browser. Engine code resolves content via the pre-populated registry
// (see web/src/engine-content.ts) and the stubbed Node APIs are never invoked at
// runtime — they only exist to satisfy Vite's module graph.
const nodeStubs = fileURLToPath(new URL("./src/node-stubs.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "node:fs": nodeStubs,
      "node:path": nodeStubs,
    },
  },
  // Allow Vite to read content/* and schemas/* from the repo root, one level above web/.
  // Without this, import.meta.glob("../../content/...") silently returns no matches.
  server: {
    fs: {
      allow: [fileURLToPath(new URL("..", import.meta.url))],
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    server: {
      deps: {
        // ensure JSON imports outside web/ are processable by Vite during tests
        inline: [],
      },
    },
  },
});
