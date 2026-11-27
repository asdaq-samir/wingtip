import type { Plugin } from "vite";
import { firstFrameScript } from "../src/lib/prefs/firstFrame.ts";

const FILE = "first-frame.js";

/**
 * The first frame's blocking head script, written from the app's own
 * names (src/lib/prefs/firstFrame.ts): served by the dev server and
 * emitted into the build, so it is staged, compressed and served as the
 * app's other files are, and put last in index.html's head under the
 * app's base (/app/first-frame.js), a plain script of the page's own
 * origin, as the CSP allows.
 */
export function firstFrame(): Plugin {
  let base = "/";
  return {
    name: "first-frame",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${base}${FILE}`) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(firstFrameScript());
      });
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { src: `${base}${FILE}` }, injectTo: "head" }];
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: FILE, source: firstFrameScript() });
    },
  };
}
