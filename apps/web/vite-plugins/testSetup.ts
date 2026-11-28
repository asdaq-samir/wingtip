/** What every unit test file runs first under jsdom, in order: the
 *  storage, animations and Range boxes jsdom lacks, the engine's
 *  WebAssembly loaded, then the guards that fail a test on a stray error. */
export const TEST_SETUP = [
  "src/test/storage.ts",
  "src/test/animations.ts",
  "src/test/ranges.ts",
  "src/lib/engine/vitestSetup.ts",
  "src/test/guards.ts",
];
