// The web app's layers, held by the lint rather than by review
// (apps/web/README.md, "Project layout"): src/lib and src/hooks are the
// ground every feature stands on, src/components the shared UI above them,
// and each folder of src/features one feature, which the others reach only
// through its entry, features/<name>/index.ts.
//
//   lib/, hooks/      may not import components/ or features/
//   components/       may import a feature's index only
//   features/<a>/     may import features/<b>/index only
//   main.tsx          the root that wires them: anything
//
// A local rule rather than eslint-plugin-boundaries: the specifiers here
// are relative ("../../pilot/PilotPanel"), which no-restricted-imports'
// patterns cannot place, and the rule is this one short file. Every way a
// module is named counts: import and export ... from, import(), the type
// position's import("..."), and vi.mock() in a test.
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");

/** The layer a file under src/ is in: ["features", name], [top folder], or null outside src. */
function zoneOf(file) {
  const rel = path.relative(SRC, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts[0] === "features" && parts.length > 2) return { layer: "features", feature: parts[1], rest: parts.slice(2).join("/") };
  return { layer: parts.length > 1 ? parts[0] : "root", feature: null, rest: parts.slice(1).join("/") };
}

function targetOf(file, spec) {
  if (spec.startsWith("@/")) return path.join(SRC, spec.slice(2));
  if (spec.startsWith("./") || spec.startsWith("../")) return path.resolve(path.dirname(file), spec.split("?")[0]);
  return null;
}

/** A feature's entry: the folder itself, or its index. */
function isEntry(target, feature) {
  const rel = path.relative(path.join(SRC, "features", feature), target).replace(/\.(tsx?|jsx?)$/, "");
  return rel === "" || rel === "index";
}

function problem(file, spec) {
  const from = zoneOf(file);
  const target = targetOf(file, spec);
  // main.tsx, the app's root, wires the features together and may name any.
  if (!from || !target || from.layer === "root") return null;
  const rel = path.relative(SRC, target);
  if (rel.startsWith("..")) return null;
  const parts = rel.split(path.sep);
  const layer = parts[0];
  const feature = layer === "features" ? parts[1] : null;
  if (from.layer === "lib" || from.layer === "hooks") {
    if (layer === "features" || layer === "components") {
      return `${from.layer}/ is below components/ and features/: move what it needs from ${rel} down into lib/.`;
    }
    return null;
  }
  if (!feature) return null;
  if (from.layer === "features" && from.feature === feature) return null;
  if (isEntry(target, feature)) return null;
  const who = from.layer === "features" ? `features/${from.feature}` : `${from.layer}/`;
  return `${who} may use features/${feature} only through its entry, features/${feature}/index.ts, not ${rel}: export it there, or move what both need to lib/ or components/.`;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Keep lib/, components/ and each feature in its layer (apps/web/README.md)." },
    schema: [],
  },
  create(context) {
    const file = context.filename;
    const check = (node, spec) => {
      if (typeof spec !== "string") return;
      const message = problem(file, spec);
      if (message) context.report({ node, message });
    };
    const fromSource = node => node.source && check(node.source, node.source.value);
    return {
      ImportDeclaration: fromSource,
      ExportNamedDeclaration: fromSource,
      ExportAllDeclaration: fromSource,
      ImportExpression: node => node.source.type === "Literal" && check(node.source, node.source.value),
      TSImportType: node => {
        const literal = node.argument?.literal ?? node.argument;
        if (literal?.type === "Literal") check(node, literal.value);
      },
      CallExpression: node => {
        const callee = node.callee;
        const mocked = callee.type === "MemberExpression" && callee.object.name === "vi"
          && ["mock", "doMock", "importActual", "unmock"].includes(callee.property.name);
        if (mocked && node.arguments[0]?.type === "Literal") check(node.arguments[0], node.arguments[0].value);
      },
    };
  },
};

export default { rules: { layers: rule } };
