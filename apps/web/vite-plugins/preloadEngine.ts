import type { Plugin } from "vite";

// The shared engine's WebAssembly (lib/engine), asked for by the page's
// <head> as the scripts are: main.tsx waits for it before the first
// render, and found only once the entry script ran it was a round trip
// after the scripts instead of beside them. `crossorigin` as fetch()
// asks it (same-origin, credentials), so the fetch takes the preload.
export const preloadEngine: Plugin = {
  name: "preload-engine",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler(_html, ctx) {
      const file = Object.keys(ctx.bundle ?? {}).find((f) => /(^|\/)wingtip-engine-[^/]*\.wasm$/.test(f));
      if (!file) return [];
      return [
        {
          tag: "link",
          attrs: { rel: "preload", href: `/app/${file}`, as: "fetch", type: "application/wasm", crossorigin: "anonymous" },
          injectTo: "head",
        },
      ];
    },
  },
};
