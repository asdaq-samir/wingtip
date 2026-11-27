// @vitest-environment jsdom
/**
 * The foot on a phone's bottom sheet in flight and in a dry run stands
 * beside the sheet's popup (SheetFoot's BesideSheet), as FPL's foot bar
 * does, not held in the popup against its slide: its ground passes a drag
 * on to the sheet under it, and a tap there raises the sheet at the pill
 * and goes no further from half up (useGroundTaps).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PanelState } from "../../lib/mapChrome";
import { SheetFoot } from "./SheetFoot";
import type { SheetLayout } from "./sheetLayout";

afterEach(cleanup);

const layout = (size: PanelState, footBar: boolean, footShown = true): SheetLayout => ({
  layer: "tab",
  flying: true,
  size,
  atPill: size === "peek",
  fromBottom: true,
  onPhone: true,
  desktop: false,
  footShown,
  footBar,
  cardsUp: false,
  barShown: false,
  toEdge: false,
});

function Viewport({
  size,
  footBar = true,
  footShown = true,
  tap,
}: {
  size: PanelState;
  footBar?: boolean;
  footShown?: boolean;
  tap: () => void;
}) {
  return (
    <div data-testid="viewport">
      <div data-testid="popup" />
      <SheetFoot
        foot={<span>figures</span>}
        pillFoot={size === "peek"}
        floats={false}
        layout={layout(size, footBar, footShown)}
        onFootTap={tap}
      />
    </div>
  );
}

test("beside the sheet it is a bar of its own over the screen's foot, out of sight under a card", () => {
  const { rerender } = render(<Viewport size="half" tap={() => {}} />);
  const bar = screen.getByTestId("panel-foot").parentElement!;
  expect(bar.hasAttribute("data-foot-bar")).toBe(true);
  expect(bar.classList).toContain("absolute");
  expect(bar.classList).toContain("pointer-events-none");
  expect(bar.classList).not.toContain("invisible");
  rerender(<Viewport size="half" footShown={false} tap={() => {}} />);
  expect(screen.getByTestId("panel-foot").parentElement!.classList).toContain("invisible");
  // Beside the side panel and on a top sheet it is the sheet's own foot.
  rerender(<Viewport size="half" footBar={false} tap={() => {}} />);
  expect(screen.getByTestId("panel-foot").parentElement).toBe(screen.getByTestId("viewport"));
});

test("a tap on its ground raises the sheet at the pill and goes no further from half up", () => {
  const tap = vi.fn();
  const { rerender } = render(<Viewport size="peek" tap={tap} />);
  fireEvent.click(screen.getByTestId("popup"));
  expect(tap).toHaveBeenCalledTimes(1);
  rerender(<Viewport size="half" tap={tap} />);
  const reached = vi.fn();
  screen.getByTestId("popup").addEventListener("click", reached);
  fireEvent.click(screen.getByTestId("popup"));
  expect(tap).toHaveBeenCalledTimes(1);
  expect(reached).not.toHaveBeenCalled();
});
