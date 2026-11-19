// @vitest-environment jsdom
/**
 * Before there is a route the box holds the two route actions FPL's first
 * row's ••• had (the owner, 2026-11-18): half a route's ✕ and, once a
 * route was just cleared, Undo -- each only where it is given and applies.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import RouteBox from "./RouteBox";
import type { RouteBoxProps } from "./routeBoxProps";

beforeAll(() => {
  // Base UI wants these of a browser.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

// The box reads the cruise from the address (nuqs) and asks the planner
// for what is typed (React Query), as the page does.
const box = (over: Partial<RouteBoxProps>) => (
  <QueryClientProvider client={new QueryClient()}>
    <NuqsTestingAdapter>
      <RouteBox
        dep=""
        stops={[]}
        dest=""
        waypoints={new Set()}
        airspaceOf={() => undefined}
        metarColourOf={() => undefined}
        altitudeAt={() => ({ feet: 0, from: "plan" }) as unknown as ReturnType<RouteBoxProps["altitudeAt"]>}
        onAltitudeChange={() => {}}
        onChange={() => {}}
        adding={false}
        onAddingChange={() => {}}
        {...over}
      />
    </NuqsTestingAdapter>
  </QueryClientProvider>
);

describe("the route box's clear and undo", () => {
  test("the empty box offers Undo, and no ✕", () => {
    const onUndo = vi.fn();
    render(box({ onUndo, onClear: () => {} }));
    expect(screen.queryByTestId("route-box-clear")).toBeNull();
    fireEvent.click(screen.getByTestId("route-undo"));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  test("half a route offers its ✕, and no Undo", () => {
    render(box({ dest: "KOSH", onClear: () => {}, onUndo: () => {} }));
    expect(screen.queryByTestId("route-undo")).toBeNull();
    expect(screen.getByTestId("route-box-clear").getAttribute("aria-label")).toBe("Clear the route");
  });

  test("neither where they are not given", () => {
    render(box({ dest: "KOSH" }));
    expect(screen.queryByTestId("route-undo")).toBeNull();
    expect(screen.queryByTestId("route-box-clear")).toBeNull();
  });
});
