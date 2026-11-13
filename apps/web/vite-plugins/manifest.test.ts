import { describe, expect, it } from "vitest";
import type { IndexHtmlTransformHook } from "vite";
import { MANIFEST, themeColor } from "./manifest.ts";
import { BRAND } from "../src/lib/tokens.ts";

describe("the installed app's colours", () => {
  it("come from the launch tokens, a theme-color meta for each scheme", () => {
    expect(MANIFEST.theme_color).toBe(BRAND.launch);
    const tags = (themeColor.transformIndexHtml as IndexHtmlTransformHook)("", {} as never);
    expect(tags).toEqual([
      { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: light)", content: BRAND.launch }, injectTo: "head" },
      { tag: "meta", attrs: { name: "theme-color", media: "(prefers-color-scheme: dark)", content: BRAND.launchNight }, injectTo: "head" },
    ]);
  });
});
