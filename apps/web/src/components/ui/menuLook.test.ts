import { describe, expect, it } from "vitest";
import { MENU_CONTENT, MENU_ITEM, MENU_SEPARATOR } from "./menuLook";

/** In the Native look every menu is shadcn's stock dropdown menu
 *  (base-vega), over Wingtip's iOS menu, which the brand looks keep: the
 *  native: classes (index.css) put each part back. */
describe("the menus in the Native look", () => {
  it("are shadcn's stock dropdown menu, the iOS menu kept for the brand looks", () => {
    expect(MENU_CONTENT).toContain("rounded-(--radius-control) p-0");
    expect(MENU_CONTENT).toContain("native:p-1 native:bg-popover");
    expect(MENU_ITEM).toContain("native:rounded-sm native:px-2 native:py-1.5 native:border-t-0 native:text-sm");
    expect(MENU_SEPARATOR).toContain("native:h-px native:bg-border");
  });
});
