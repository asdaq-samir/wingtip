// @vitest-environment jsdom
/**
 * A card's tabs: a page built at its first visit is kept once opened, not
 * built again at each return, and the tab picked is kept for the card's
 * key, so a card opened again over the same airplane (back from Figures)
 * is on the tab it was left on.
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useEffect } from "react";
import { CardTabPages, CardTabPanel } from "./CardTabs";
import { useCardTabs } from "../lib/cardTab";
import { Button } from "./ui/button";

afterEach(cleanup);

let built = 0;
function Counted({ name }: { name: string }) {
  useEffect(() => {
    built++;
  }, []);
  return <p>{name}</p>;
}

function Card({ cardKey }: { cardKey: string }) {
  const { tab, pick, top } = useCardTabs<"info" | "flights">(cardKey, "info");
  return (
    <>
      <Button onClick={() => pick(tab === "info" ? "flights" : "info")}>switch</Button>
      <CardTabPages tab={tab} onPick={pick} top={top} bar={null}>
        <CardTabPanel value="info">
          <Counted name="info page" />
        </CardTabPanel>
        <CardTabPanel value="flights">
          <Counted name="flights page" />
        </CardTabPanel>
      </CardTabPages>
    </>
  );
}

describe("a card's tabs", () => {
  test("build a page at its first visit and keep it once opened", () => {
    built = 0;
    render(<Card cardKey="airplane:kept-1" />);
    expect(screen.getByText("info page")).toBeTruthy();
    expect(screen.queryByText("flights page")).toBeNull();
    const toggle = screen.getByRole("button", { name: "switch" });
    act(() => toggle.click());
    act(() => toggle.click());
    act(() => toggle.click());
    // Each built once, however often picked.
    expect(built).toBe(2);
    expect(screen.getByText("info page")).toBeTruthy();
    expect(screen.getByText("flights page")).toBeTruthy();
  });

  test("keep the tab picked for the card's key", () => {
    const first = renderHook(() => useCardTabs<"info" | "flights">("airplane:kept-2", "info"));
    act(() => first.result.current.pick("flights"));
    first.unmount();
    const again = renderHook(() => useCardTabs<"info" | "flights">("airplane:kept-2", "info"));
    expect(again.result.current.tab).toBe("flights");
    const other = renderHook(() => useCardTabs<"info" | "flights">("airplane:other", "info"));
    expect(other.result.current.tab).toBe("info");
  });
});
