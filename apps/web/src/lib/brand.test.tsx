// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrandLook, followKeptBrand } from "./brand";
import { usePreferences } from "./preferences";

/** The browser's bar in the page's own ground, whatever the look and
 *  Setup's theme make it. */
describe("BrandLook's theme colour", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.removeAttribute("style");
    vi.unstubAllGlobals();
  });

  it("puts the page's ground in both theme-color metas", () => {
    vi.stubGlobal("requestAnimationFrame", (go: FrameRequestCallback) => {
      go(0);
      return 0;
    });
    document.head.innerHTML =
      '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">' +
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1422">';
    document.body.style.backgroundColor = "rgb(11, 20, 34)";
    render(<BrandLook />);
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    expect(metas.map((meta) => meta.content)).toEqual(["rgb(11, 20, 34)", "rgb(11, 20, 34)"]);
  });
});

/** The one writer of the look on <html>: the kept look at once, before
 *  React draws, and each change after (the themes audit, 2026-11-27). */
describe("followKeptBrand", () => {
  it("puts the kept look on <html> at once and follows a change", () => {
    usePreferences.setState({ brand: "ink" });
    const stop = followKeptBrand();
    expect(document.documentElement.dataset.brand).toBe("ink");
    usePreferences.setState({ brand: "cockpit" });
    expect(document.documentElement.dataset.brand).toBe("cockpit");
    stop();
    usePreferences.setState({ brand: "wingtip" });
    expect(document.documentElement.dataset.brand).toBe("cockpit");
  });
});
