import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { init, type ModuleInfos } from "license-checker-rseidelsohn";
import type { Plugin } from "vite";

/**
 * The open-source licences of the code the web app ships, as About's
 * "Open-Source Licences" opens them (/app/licences.txt; docs/legal/credits.md,
 * "Open-source licences"): written by every build from the installed
 * packages' own metadata and licence files by license-checker-rseidelsohn,
 * then the engine's crates' (engine/licences/NOTICES.txt, cargo-about), so
 * every way the page is built (npm run build, the gateway's image, the live
 * stack's watch, CI) carries them, and none is kept by hand.
 */

/** The licences the page's code may come under. A production package under
 *  any other (GPL, LGPL, AGPL, SSPL, none at all) stops the build: the
 *  checker exits on it, naming it. Its match is by name within the
 *  package's licence, so "(MIT OR CC0-1.0)" passes on its MIT and "BSD"
 *  takes in every BSD. CC-BY-4.0 is caniuse-lite's data; OFL-1.1 the fonts
 *  (@fontsource), whose licence these notices carry with them; MPL-2.0
 *  mediabunny's and weatherlayers-gl's (by its choice of MPL-2.0 or its
 *  own terms), used unmodified, its source at its package. */
export const ALLOWED_LICENCES = [
  "MIT",
  "ISC",
  "BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "CC-BY-4.0",
  "Python-2.0",
  "Unlicense",
  "Zlib",
  "OFL-1.1",
  "MPL-2.0",
];

/** Production packages that never reach the page: sharp, its native
 *  libvips builds (LGPL-3.0) and ONNX Runtime's Node build, which
 *  @huggingface/transformers names for Node alone; in the browser it uses
 *  onnxruntime-web and the canvas. */
export const NOT_SHIPPED = ["@img/sharp-", "sharp", "onnxruntime-node"];

/** The notices as one plain text: each package with its licence, its
 *  licence file's words and its NOTICE file's (Apache-2.0 4(d)), then the
 *  engine's. */
export function noticesText(packages: ModuleInfos, readFile: (path: string) => string, engine: string): string {
  const each = Object.entries(packages).map(([name, info]) => {
    const licences = Array.isArray(info.licenses) ? info.licenses.join(", ") : (info.licenses ?? "UNKNOWN");
    // A clarified package's licence file is named from its own folder
    // (licence-clarifications.json), every other one by its whole path.
    const file = info.licenseFile && info.path && !isAbsolute(info.licenseFile) ? join(info.path, info.licenseFile) : info.licenseFile;
    const words = file ? readFile(file).trim() : `${licences}; no licence file in the package.`;
    const notice = info.noticeFile ? `\n\n${readFile(info.noticeFile).trim()}` : "";
    return `${name}\n${licences}\n${info.repository ? `${info.repository}\n` : ""}\n${words}${notice}`;
  });
  return ["Wingtip Maps for the web: the open-source software it is made with, and their licences", ...each, engine.trim()]
    .join(`\n\n${"=".repeat(80)}\n\n`)
    .concat("\n");
}

function collect(start: string): Promise<ModuleInfos> {
  return new Promise((resolve, reject) =>
    init(
      {
        start,
        production: true,
        excludePrivatePackages: true,
        excludePackagesStartingWith: NOT_SHIPPED.join(";"),
        onlyAllow: ALLOWED_LICENCES.join(";"),
        // A package whose own licence field the checker cannot read as SPDX:
        // weatherlayers-gl's "(MPL-2.0 OR LicenseRef-LICENSE_TERMS_OF_USE.md)"
        // (an underscore is no SPDX idstring), which it then guesses from
        // LICENSE.md as "Custom: <MPL's URL>". Clarified as the MPL-2.0 it
        // offers, its LICENSE.md by checksum, so a change of terms fails.
        clarificationsFile: fileURLToPath(new URL("./licence-clarifications.json", import.meta.url)),
        color: false,
      },
      (err, packages) => (err ? reject(err) : resolve(packages)),
    ),
  );
}

export const licences: Plugin = {
  name: "licences",
  apply: "build",
  async generateBundle() {
    const packages = await collect(fileURLToPath(new URL("..", import.meta.url)));
    const engine = readFileSync(new URL("../../../engine/licences/NOTICES.txt", import.meta.url), "utf8");
    this.emitFile({ type: "asset", fileName: "licences.txt", source: noticesText(packages, (path) => readFileSync(path, "utf8"), engine) });
  },
};
