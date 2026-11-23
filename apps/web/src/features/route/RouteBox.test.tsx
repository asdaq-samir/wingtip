// @vitest-environment jsdom
/**
 * Before there is a route the box holds the two route actions FPL's first
 * row's ••• had (the owner, 2026-11-18): half a route's ✕ and, once a
 * route was just cleared, Undo -- each only where it is given and applies.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
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

describe("the route box's clear", () => {
  test("the empty box offers no ✕", () => {
    render(box({ onClear: () => {} }));
    expect(screen.queryByTestId("route-box-clear")).toBeNull();
  });

  test("half a route offers its ✕", () => {
    render(box({ dest: "KOSH", onClear: () => {} }));
    expect(screen.getByTestId("route-box-clear").getAttribute("aria-label")).toBe("Clear the route");
  });

  test("none where it is not given", () => {
    render(box({ dest: "KOSH" }));
    expect(screen.queryByTestId("route-box-clear")).toBeNull();
  });
});
