import type { Plugin } from "vite";

// A warning fails the build (the owner's rule: no warnings): the
// bundler's (rolldownOptions.onwarn) and Vite's own (its logger) are
// gathered as the build runs and fail it at the end, before
// publish-build moves anything into place. Gathered, not thrown where
// they arise: a throw from inside Vite's native reporter, which warns of
// large chunks, is swallowed there and the build went on as if nothing
// had been said. Only in a build; the dev server warns and carries on.
// ALLOWED_BUILD_WARNINGS is the allow-list, by code, each with why it
// cannot be helped; none yet, every warning the build gave being fixed
// at its cause.
const ALLOWED_BUILD_WARNINGS = new Set<string>([]);
const buildWarnings: string[] = [];
export const warningsFail: Plugin = {
  name: "warnings-fail",
  apply: "build",
  configResolved(config) {
    const gather = (message: string) => void buildWarnings.push(message);
    config.logger.warn = gather;
    config.logger.warnOnce = gather;
  },
  closeBundle: {
    order: "post",
    sequential: true,
    handler() {
      if (buildWarnings.length === 0) return;
      const said = buildWarnings.splice(0).join("\n\n");
      throw new Error(`The build warned, and a warning fails it:\n\n${said}`);
    },
  },
};

/** The bundler's options for it (build.rolldownOptions): its warnings
 *  gathered with Vite's own unless allowed above, and not its timing
 *  report, which says only that Babel (the React Compiler) is most of the
 *  build's time, as it is by choice, and as a warning would fail every
 *  build. */
export const strictRolldown = {
  checks: { bundlerTimings: false },
  onwarn(warning: { code?: string; message: string }) {
    if (ALLOWED_BUILD_WARNINGS.has(warning.code ?? "")) return;
    buildWarnings.push(`${warning.code ?? "(no code)"}: ${warning.message}`);
  },
};

/** build.chunkSizeWarningLimit, kB: above the largest chunk that cannot be
 *  split, MapLibre GL's own (1.1 MB minified, a chunk of its own, cached a
 *  year), so that Vite's large-chunk warning is not said of it only for
 *  being one library. What the page loads first is held by its own budget
 *  (scripts/first-load.mjs, in CI). */
export const CHUNK_SIZE_LIMIT = 1200;
