// The browser specs a change can break (decision 0048): every spec in
// e2e/ whose screens a changed file draws or feeds, so a pull request runs
// those and "CI passed" waits for them. Three days of redesign once ran no
// browser test because none of its spec files had changed, and the specs
// found about 25 app bugs at the end (#585, #586).
//
// A spec reaches the source files that hold the test ids it asks for
// (getByTestId, as a literal or a template's fixed start, in the spec or
// the e2e helpers it imports), and everything those files import, by
// dependency-cruiser's graph (.dependency-cruiser.cjs's resolution). A
// changed spec or helper reaches the specs that import it. A change the
// graph cannot place (the page's HTML, the styles, the build's config, the
// packages, the API documents) runs the @smoke set; a spec with no test id
// to follow runs on every web change.
//
//   node scripts/reached-specs.mjs [--json] <changed path from the repo root>...
//   git diff --name-only origin/main... | node scripts/reached-specs.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const json = args.includes("--json");
let changed = args.filter((a) => !a.startsWith("--"));
if (changed.length === 0 && !process.stdin.isTTY) changed = readFileSync(0, "utf8").split("\n");
const WEB = "apps/web/";
changed = changed.map((p) => p.trim()).filter(Boolean);

// What no import reaches but every screen stands on: the @smoke set.
const SMOKE_ON = [
  /^apps\/web\/(index\.html|package(-lock)?\.json|vite\.config\.ts|playwright\.config\.ts|tsconfig[^/]*\.json)$/,
  /^apps\/web\/(src\/index\.css|src\/styles\/|public\/|vite-plugins\/)/,
  /^design\/tokens\.json$/,
  /^services\/(planner|gateway)\/openapi\.json$/,
  /^engine\/contract\/engine\.schema\.json$/,
];

const graph = JSON.parse(
  // Through npx: the web's packages are ./node_modules on CI and the check
  // image's /node_modules (on its PATH) on the Mac.
  execFileSync(
    "npx",
    [
      "--no-install",
      "depcruise",
      "src",
      "e2e",
      "--config",
      ".dependency-cruiser.cjs",
      "--include-only",
      "^(src|e2e)/",
      "--output-type",
      "json",
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ),
);
const imports = new Map(graph.modules.map((m) => [m.source, m.dependencies.map((d) => d.resolved)]));
const specs = [...imports.keys()].filter((s) => /^e2e\/.+\.spec\.ts$/.test(s)).sort();

/** Every file `from` reaches through its imports, itself included. */
function closure(from, within) {
  const seen = new Set();
  const todo = [...from];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file) || !within(file)) continue;
    seen.add(file);
    todo.push(...(imports.get(file) ?? []));
  }
  return seen;
}

// A literal's fixed start: the whole string, or a template's text before
// its first ${. Shorter than four characters says nothing.
const LITERAL = /"([^"\n\\]{4,})"|'([^'\n\\]{4,})'|`([^`$\n\\]{4,})(?:`|\$\{)/g;
const literals = (text) =>
  [...text.matchAll(LITERAL)].map((m) => ({ text: m[1] ?? m[2] ?? m[3], open: m[3] !== undefined && !m[0].endsWith("`") }));
// getByTestId("x"), getByTestId(`x-${i}`), and a CSS [data-testid=x] or
// [data-testid^="x"] in a locator.
const TESTID = /getByTestId\(\s*(["'`])([^"'`$\n]{4,})(\$\{)?|data-testid(\^?)=["']?([\w-]{4,})/g;
const asked = (m) => (m[2] ? { id: m[2], open: m[1] === "`" && !!m[3] } : { id: m[5], open: m[4] === "^" });

// Each source literal, to the files that write it: a test id is drawn by
// the file that holds its string, whether as data-testid or as a prop.
const writers = new Map();
const opens = [];
for (const file of imports.keys()) {
  if (!file.startsWith("src/") || /\.test\.tsx?$/.test(file)) continue;
  for (const lit of literals(readFileSync(file, "utf8"))) {
    if (lit.open) opens.push([lit.text, file]);
    else writers.set(lit.text, [...(writers.get(lit.text) ?? []), file]);
  }
}

function drawnBy(id, open) {
  const files = new Set(writers.get(id) ?? []);
  for (const [start, file] of opens) if (id.startsWith(start)) files.add(file);
  if (open) for (const [text, those] of writers) if (text.startsWith(id)) those.forEach((f) => files.add(f));
  return files;
}

const featureOf = (file) => /^src\/features\/[^/]+/.exec(file)?.[0];
const reach = new Map();
for (const spec of specs) {
  const own = closure([spec], (f) => f.startsWith("e2e/"));
  const roots = new Set();
  for (const file of own) {
    for (const m of readFileSync(file, "utf8").matchAll(TESTID)) {
      const { id, open } = asked(m);
      drawnBy(id, open).forEach((f) => roots.add(f));
    }
  }
  // Through the shared ground (lib, hooks, components) and the features the
  // spec's own test ids are in, never into another feature: every spec taps
  // the shell, which imports every feature, so following it would reach
  // the whole app from any spec. No test id to follow: the spec could be
  // anywhere, so any web change runs it.
  const features = new Set([...roots].map(featureOf).filter(Boolean));
  const inside = (f) => f.startsWith("src/") && (!featureOf(f) || features.has(featureOf(f)));
  const app = roots.size ? closure(roots, inside) : null;
  reach.set(spec, { own, app });
}

const chosen = new Map();
const pick = (spec, why) => chosen.has(spec) || chosen.set(spec, why);
for (const path of changed) {
  if (SMOKE_ON.some((re) => re.test(path))) {
    for (const spec of specs) if (/["']@smoke["']/.test(readFileSync(spec, "utf8"))) pick(spec, path);
    continue;
  }
  if (!path.startsWith(WEB)) continue;
  const file = path.slice(WEB.length);
  if (file.startsWith("e2e/") && !imports.has(file)) {
    // A fixture or other data file: the specs that name it.
    const name = file.split("/").pop();
    for (const spec of specs) for (const f of reach.get(spec).own) if (readFileSync(f, "utf8").includes(name)) pick(spec, path);
    continue;
  }
  for (const spec of specs) {
    const { own, app } = reach.get(spec);
    if (own.has(file) || (file.startsWith("src/") && !/\.test\.tsx?$/.test(file) && (app === null || app.has(file)))) pick(spec, path);
  }
}

const list = [...chosen.keys()].sort();
if (json) console.log(JSON.stringify(Object.fromEntries(list.map((s) => [s, chosen.get(s)])), null, 2));
else console.log(list.join(" "));
console.error(`reached-specs: ${changed.length} changed files reach ${list.length} of ${specs.length} specs`);
