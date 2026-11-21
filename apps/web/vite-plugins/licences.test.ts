import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_LICENCES, NOT_SHIPPED, noticesText } from "./licences.ts";

describe("the web's open-source notices", () => {
  it("give each package's licence, its licence file and its NOTICE, then the engine's", () => {
    const files: Record<string, string> = { "/a/LICENSE": "MIT text\n", "/b/LICENSE": "Apache text", "/b/NOTICE": "Copyright B\n" };
    const text = noticesText(
      {
        "a@1.0.0": { licenses: "MIT", licenseFile: "/a/LICENSE", repository: "https://example.org/a" },
        "b@2.0.0": { licenses: ["Apache-2.0"], licenseFile: "/b/LICENSE", noticeFile: "/b/NOTICE" },
        "c@3.0.0": { licenses: "ISC" },
      },
      (path) => files[path]!,
      "The engine's crates\n",
    );
    expect(text).toContain("a@1.0.0\nMIT\nhttps://example.org/a\n\nMIT text");
    expect(text).toContain("b@2.0.0\nApache-2.0\n\nApache text\n\nCopyright B");
    expect(text).toContain("c@3.0.0\nISC\n\nISC; no licence file in the package.");
    expect(text.trimEnd().endsWith("The engine's crates")).toBe(true);
  });

  it("let no copyleft licence through, and leave out only what never reaches the page", () => {
    // The checker passes a package whose licence contains an allowed name.
    for (const copyleft of ["GPL-3.0-only", "LGPL-2.1-or-later", "AGPL-3.0-only", "SSPL-1.0"]) {
      expect(ALLOWED_LICENCES.some((allowed) => copyleft.includes(allowed))).toBe(false);
    }
    expect(NOT_SHIPPED).toEqual(["@img/sharp-", "sharp", "onnxruntime-node"]);
  });

  it("take the engine's notices from the file cargo-about writes", () => {
    const engine = readFileSync(new URL("../../../engine/licences/NOTICES.txt", import.meta.url), "utf8");
    expect(engine).toMatch(/^The Wingtip Maps engine's Rust crates and their licences/);
    expect(engine).toContain("- uniffi <https://github.com/mozilla/uniffi-rs>");
  });
});
