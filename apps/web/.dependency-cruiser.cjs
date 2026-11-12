// The web app's layers, held by dependency-cruiser (MIT, .tool-versions'
// version) rather than by review (apps/web/README.md, "Project layout";
// CLAUDE.md, "Simplicity rules"): src/lib and src/hooks are the ground every
// feature stands on, src/components the shared UI above them, and each
// folder of src/features one feature, which the others reach only through
// its entry, features/<name>/index.ts. main.tsx, the root, wires them all.
// It took the place of a local ESLint rule (eslint/boundaries.js) on
// 2026-11-12: a maintained tool over a hand-built one (the owner: "I don't
// want to have bugs with hand built things"). Type-only imports count
// (tsPreCompilationDeps), as do import() and re-exports.
//
//   npx depcruise src --config .dependency-cruiser.cjs
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "lib-below-components",
      severity: "error",
      comment: "lib/ and hooks/ are below components/ and features/: move what it needs down into lib/ (apps/web/README.md).",
      from: { path: "^src/(lib|hooks)/" },
      to: { path: "^src/(components|features)/" },
    },
    {
      name: "feature-through-its-index",
      severity: "error",
      comment:
        "A feature is used by another only through its entry, features/<name>/index.ts: export it there, or move what both need to lib/ or components/.",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/[^/]+/.", pathNot: ["^src/features/$1/", "^src/features/[^/]+/index\\.tsx?$"] },
    },
    {
      name: "components-through-feature-index",
      severity: "error",
      comment:
        "components/ may use a feature only through its entry, features/<name>/index.ts: export it there, or move what both need to lib/ or components/.",
      from: { path: "^src/components/" },
      to: { path: "^src/features/[^/]+/.", pathNot: "^src/features/[^/]+/index\\.tsx?$" },
    },
  ],
  options: {
    includeOnly: "^src/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".json"] },
    // Some of the engine's generated glue is plain JavaScript beside its
    // .wasm, reached by URL rather than by import.
    exclude: { path: "^src/lib/engine/pkg/" },
  },
};
