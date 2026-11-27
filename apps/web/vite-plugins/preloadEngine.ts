import type { Plugin } from "vite";

// The shared engine's WebAssembly (lib/engine), asked for by the page's
// <head> as the scripts are: main.tsx waits for it before the first
// render, and found only once the entry script ran it was a round trip
// after the scripts instead of beside them. `crossorigin` as fetch()
// asks it (same-origin, credentials), so the fetch takes the preload.
// At low priority: the first render does not wait for it (main.tsx,
// lib/engine/engineGate), and at the browser's high for a fetch its
// 1.25 MB shared the connection with the entry and MapLibre, which the
// page does wait for. Low still starts it at once, beside them; it only
// yields to them. A route named in the address waits on both (MapPage's
// boot map needs the entry to ask the engine at all), so it gains too.
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
          attrs: {
            rel: "preload",
            href: `/app/${file}`,
            as: "fetch",
            type: "application/wasm",
            crossorigin: "anonymous",
            fetchpriority: "low",
          },
          injectTo: "head",
        },
      ];
    },
  },
};
