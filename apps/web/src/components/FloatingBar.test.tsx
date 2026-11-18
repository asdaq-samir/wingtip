// @vitest-environment jsdom
/**
 * The one floating bar: a card's tabs and FPL's actions are drawn in the
 * same capsule, the same width and the same items' look (the owner,
 * 2026-11-18: "apply the same height and width for both").
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { Toolbar } from "@base-ui/react/toolbar";
import { Ellipsis, Info, Plane } from "lucide-react";
import { Tabs } from "./ui/tabs";
import { CardTabBar } from "./CardTabBar";
import { FloatingBar, FloatingBarButton } from "./FloatingBar";

afterEach(cleanup);

/** The classes that make an item's height and pill, and the capsule's width. */
const ITEM = ["min-h-12", "rounded-full", "flex-col", "data-active:bg-foreground/10"];
const WIDTH = ["w-fit", "min-w-[min(18.75rem,100%)]", "max-w-full"];

function cardBar() {
  render(
    <Tabs value="info">
      <CardTabBar
        testId="bar"
        tabTestId="tab-"
        onPick={() => {}}
        tabs={[
          { value: "info", label: "Info", icon: Info },
          { value: "flights", label: "Flights", icon: Plane },
        ]}
      />
    </Tabs>,
  );
}

function fplBar() {
  render(
    <Toolbar.Root aria-label="Route" render={<FloatingBar />}>
      <Toolbar.Button render={<FloatingBarButton icon={<Info />} label="Brief" testId="route-brief" />} />
      <Toolbar.Button render={<FloatingBarButton icon={<Ellipsis />} label="More" testId="route-more" />} />
    </Toolbar.Root>,
  );
}

describe("the floating bar", () => {
  test("a card's tabs and FPL's actions sit in the same capsule, the same width", () => {
    cardBar();
    const card = screen.getByTestId("bar").querySelector("[data-floating-bar]")!;
    cleanup();
    fplBar();
    const fpl = screen.getByRole("toolbar");
    expect(fpl.hasAttribute("data-floating-bar")).toBe(true);
    for (const c of WIDTH) {
      expect(card.classList).toContain(c);
      expect(fpl.classList).toContain(c);
    }
    // Only where each sits differs: the card's centred in its block, taps on each.
    const look = (el: Element) => [...el.classList].filter((c) => c !== "mx-auto" && c !== "pointer-events-auto").sort();
    expect(look(card)).toEqual(look(fpl));
  });

  test("a tab and an action are the same item: 48 tall, the soft pill, icon over its word", () => {
    cardBar();
    const tab = screen.getByTestId("tab-info");
    for (const c of ITEM) expect(tab.classList).toContain(c);
    expect(tab.getAttribute("role")).toBe("tab");
    expect(tab.textContent).toBe("Info");
    cleanup();
    fplBar();
    for (const id of ["route-brief", "route-more"]) {
      const action = screen.getByTestId(id);
      for (const c of ITEM) expect(action.classList).toContain(c);
      expect(action.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByTestId("route-more").textContent).toBe("More");
  });

  test("the words are the tab bar's type, regular, on one line", () => {
    cardBar();
    const word = screen.getByText("Info");
    expect(word.className).toContain("text-(length:--type-tab-bar)");
    expect(word.className).toContain("font-normal");
    expect(word.className).toContain("whitespace-nowrap");
  });
});
