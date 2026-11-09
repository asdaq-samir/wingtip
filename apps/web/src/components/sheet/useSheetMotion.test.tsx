// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useCallback, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapInsets, PanelState } from "../mapChrome";
import type { Detents } from "./engine";
import { useSheetMotion, type SheetParts } from "./useSheetMotion";

// A phone's bottom sheet: the pill to half is SETTLE_POINTS (273), the
// distance the owner's 0.3 s is set for.
const detents: Detents = { peek: 100, half: 373, full: 646 };
const EASE = "cubic-bezier(0, 0, 0.58, 1)";

/** The sheet as MapPanel holds it: its size and motion state, its element,
 *  and a grabber that asks for a size and drags. */
function Sheet({ pageState, tellPage, tellInsets, onPhone = true }: {
  pageState: PanelState; tellPage: (s: PanelState) => void; tellInsets: (i: MapInsets) => void; onPhone?: boolean;
}) {
  const [size, setSize] = useState(pageState);
  const sizeRef = useRef(size);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(moving);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const setPanelNode = useCallback((node: HTMLElement | null) => { panelRef.current = node; setPanel(node); }, []);
  const parts = useRef<SheetParts>({ head: null, body: null, inner: null, foot: null });
  const landed = useCallback(() => {}, []);
  const { ask, startDrag } = useSheetMotion({
    size, setSize, sizeRef, moving, setMoving, movingRef, detents, pageState, tellPage, tellInsets,
    onPhone, fromBottom: true, floating: false, footShown: false, safeTop: 0,
    panel, panelRef, partsRef: parts, pillHeight: detents.peek, atPill: size === "peek", landed,
  });
  return (
    <section ref={setPanelNode} data-testid="sheet" data-size={size} data-moving={moving || undefined}>
      <button type="button" data-testid="grabber" onClick={() => ask("half", true)} onPointerDown={startDrag}>grab</button>
    </section>
  );
}

/** A pointer event at `y`, `at` ms into the gesture. */
function pointer(target: EventTarget, type: string, y: number, at: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
  Object.defineProperty(event, "timeStamp", { value: at });
  act(() => { target.dispatchEvent(event); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSheetMotion", () => {
  it("rests at the page's size, slid off its edge by what is past it", () => {
    const { getByTestId } = render(<Sheet pageState="peek" tellPage={vi.fn()} tellInsets={vi.fn()} />);
    expect(getByTestId("sheet").style.transform).toBe("translate3d(0, 546px, 0)");
  });

  it("eases to a size asked for in 0.3 s with no spring, and tells the page once it has landed", () => {
    const tellPage = vi.fn(), tellInsets = vi.fn();
    const { getByTestId } = render(<Sheet pageState="peek" tellPage={tellPage} tellInsets={tellInsets} />);
    const sheet = getByTestId("sheet");
    tellInsets.mockClear();
    act(() => { getByTestId("grabber").click(); });
    expect(sheet.style.transform).toBe("translate3d(0, 273px, 0)");
    expect(sheet.style.transition).toBe(`transform 0.3s ${EASE}`);
    act(() => { vi.advanceTimersByTime(16); });
    expect(tellPage).not.toHaveBeenCalled();
    expect(tellInsets).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(340); });
    expect(tellPage).toHaveBeenCalledExactlyOnceWith("half");
    expect(sheet.style.transition).toBe("");
    expect(sheet.dataset.size).toBe("half");
    expect(tellInsets).toHaveBeenLastCalledWith({ top: 0, bottom: 373, left: 0, out: true, up: false });
  });

  it("says where it is going as it sets off, for the map to follow", () => {
    const turned = vi.fn();
    const { getByTestId } = render(<Sheet pageState="peek" tellPage={vi.fn()} tellInsets={vi.fn()} />);
    getByTestId("sheet").addEventListener("sheetturn", event => turned((event as CustomEvent).detail.insets));
    act(() => { getByTestId("grabber").click(); });
    act(() => { vi.advanceTimersByTime(16); });
    expect(turned).toHaveBeenCalledExactlyOnceWith({ top: 0, bottom: 373, left: 0, out: true, up: false });
  });

  it("goes to the page's own size without telling it back", () => {
    const tellPage = vi.fn();
    const { getByTestId, rerender } = render(<Sheet pageState="peek" tellPage={tellPage} tellInsets={vi.fn()} />);
    rerender(<Sheet pageState="full" tellPage={tellPage} tellInsets={vi.fn()} />);
    // Pill to full is past the longest settle: clamped to 0.35 s.
    expect(getByTestId("sheet").style.transition).toBe(`transform 0.35s ${EASE}`);
    act(() => { vi.advanceTimersByTime(400); });
    expect(getByTestId("sheet").style.transform).toBe("translate3d(0, 0px, 0)");
    expect(tellPage).not.toHaveBeenCalled();
  });

  it("follows a finger and lets a flick from the pill go one size, to half", () => {
    // Where it is on its way, read from its transform: jsdom has no DOMMatrix.
    vi.stubGlobal("DOMMatrix", class { m42: number; constructor(t: string) { this.m42 = Number(/,\s*(-?[\d.]+)px/.exec(t)?.[1] ?? 0); } });
    const tellPage = vi.fn();
    const { getByTestId } = render(<Sheet pageState="peek" tellPage={tellPage} tellInsets={vi.fn()} />);
    const sheet = getByTestId("sheet");
    pointer(getByTestId("grabber"), "pointerdown", 600, 0);
    pointer(window, "pointermove", 580, 10);
    pointer(window, "pointermove", 560, 20);
    act(() => { vi.advanceTimersByTime(16); });
    expect(sheet.style.transform).toBe("translate3d(0, 506px, 0)");
    expect(sheet.dataset.moving).toBe("true");
    // Thrown up at 2 pt/ms: far enough for full, but a throw goes one size.
    pointer(window, "pointerup", 560, 21);
    act(() => { vi.advanceTimersByTime(400); });
    expect(tellPage).toHaveBeenCalledExactlyOnceWith("half");
    expect(sheet.style.transform).toBe("translate3d(0, 273px, 0)");
  });

  it("moves the map's buttons with a phone's bottom sheet, on its curve", () => {
    const { getByTestId } = render(<Sheet pageState="peek" tellPage={vi.fn()} tellInsets={vi.fn()} />);
    act(() => { getByTestId("grabber").click(); });
    const rule = [...document.styleSheets].flatMap(sheet => [...sheet.cssRules] as CSSStyleRule[])
      .find(r => r.selectorText?.includes("[data-map-food][data-rides]"));
    expect(rule?.style.getPropertyValue("transition")).toBe(`translate 0.3s ${EASE}, opacity 0.2s`);
  });
});
