import { fileURLToPath, URL } from "node:url";
import type { InlineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The engine's WebAssembly, left out of the view: its host's sandbox runs
// none (its Content-Security-Policy has no wasm-unsafe-eval), and inlined
// it was 1.7 MB of the page. What the view draws comes worked out by the
// planner (app/mcp/flight_view: the strip's fuel among it).
const noEngine: Plugin = {
  name: "claude-view-no-engine",
  enforce: "pre",
  resolveId: (id) => (id.endsWith("wingtip-engine.wasm?url") ? "\0claude-view-no-engine" : null),
  load: (id) => (id === "\0claude-view-no-engine" ? 'export default "";' : null),
};

/**
 * The connector's live view (claude-view.html, features/claude-view) as
 * one self-contained page, its script and styles inlined
 * (vite-plugin-singlefile): an MCP App's host renders the page's text in
 * a sandbox that loads no script or style from Wingtip, only what its
 * Content-Security-Policy names (the chart's tiles). Built inside the
 * app's own build (vite-plugins/claudeView), so it is published, kept and
 * served with it at /app/claude-view.html.
 */
export const claudeViewConfig: InlineConfig = {
  configFile: false,
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  logLevel: "warn",
  plugins: [noEngine, react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    write: false,
    emptyOutDir: false,
    // One file by design, the whole view in it (1.8 MB, 2026-11-22).
    chunkSizeWarningLimit: 3000,
    rolldownOptions: {
      input: fileURLToPath(new URL("./claude-view.html", import.meta.url)),
      checks: { bundlerTimings: false },
      // A warning fails it, as the app's build (strictBuild), but one: a
      // dynamic import beside a static one, which says only that the
      // module stays in its chunk -- and here every module is in the one.
      onwarn(warning) {
        if (warning.code === "INEFFECTIVE_DYNAMIC_IMPORT") return;
        throw new Error(`The live view's build warned, and a warning fails it: ${warning.code ?? ""} ${warning.message}`);
      },
    },
  },
};
