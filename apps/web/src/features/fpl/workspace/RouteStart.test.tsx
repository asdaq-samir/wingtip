// @vitest-environment jsdom
/**
 * The route before it is whole, drawn as the timeline draws a whole one
 * (the owner, 2026-11-18): the two ends to pick, each asking the one
 * search, and the route box's toggle last, opening the route's field --
 * with half a route's ✕ and a cleared route's Undo at its end while the
 * field is folded.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { usePlanUndo } from "../../../lib/planUndo";
import type { PlanSlices } from "../vm/planSlices";
import { EmptyRoute, MissingEnd, TypeRow } from "./RouteStart";

afterEach(cleanup);
beforeEach(() => usePlanUndo.setState({ undoName: null, undo: () => {} }));

function slices({ hasPoints = false, routed = false, boxOpen = false } = {}) {
  const routeList = { boxOpen, clearRoute: vi.fn(), setRouteOpen: vi.fn(), pickEnd: vi.fn() };
  const vm = { route: { hasPoints, routed }, routeList } as unknown as PlanSlices<"route" | "routeList">;
  return { vm, routeList };
}

describe("the empty route", () => {
  test("is the timeline's card: the two ends in a placeholder's words, the route box's toggle at its end", () => {
    const { vm } = slices();
    render(<EmptyRoute vm={vm} />);
    const card = screen.getByRole("group", { name: "The route" });
    expect(card.textContent).toBe("DepartureDestination");
    expect(screen.getByRole("button", { name: "Pick the departure" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pick the destination" })).toBeTruthy();
  });

  test("an end's row asks the one search for that end", () => {
    const { vm, routeList } = slices();
    render(<EmptyRoute vm={vm} />);
    fireEvent.click(screen.getByTestId("timeline-pick-dest"));
    expect(routeList.pickEnd).toHaveBeenCalledWith("Destination");
    fireEvent.click(screen.getByTestId("timeline-pick-dep"));
    expect(routeList.pickEnd).toHaveBeenCalledWith("Departure");
  });

  test("the departure's row runs the course's line down to the destination's", () => {
    const { vm } = slices();
    render(<EmptyRoute vm={vm} />);
    const [dep, dest] = [screen.getByTestId("timeline-pick-dep"), screen.getByTestId("timeline-pick-dest")];
    expect(dep.querySelector(".border-course")).toBeTruthy();
    expect(dest.querySelector(".border-course")).toBeNull();
  });
});

describe("The route box's toggle", () => {
  test("has the route box's toggle at its end, even on an empty route, opening the field", () => {
    const { vm, routeList } = slices();
    render(<EmptyRoute vm={vm} />);
    const toggle = screen.getByRole("button", { name: "Type the route" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(routeList.setRouteOpen).toHaveBeenCalledWith(true);
  });

  test("opens the route's field and puts the focus in it", () => {
    const { vm, routeList } = slices();
    const field = document.createElement("input");
    field.dataset.testid = "route-type";
    document.body.append(field);
    render(<TypeRow vm={vm} />);
    fireEvent.click(screen.getByTestId("route-type-open"));
    expect(routeList.setRouteOpen).toHaveBeenCalledWith(true);
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  test("is not drawn while the field is open: the field is the row then", () => {
    const { vm } = slices({ boxOpen: true });
    render(<TypeRow vm={vm} />);
    expect(screen.queryByTestId("route-type-open")).toBeNull();
  });

  test("half a route: the field's ✕ at its end clears it", () => {
    const { vm, routeList } = slices({ hasPoints: true });
    render(<TypeRow vm={vm} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear the route" }));
    expect(routeList.clearRoute).toHaveBeenCalled();
    expect(screen.queryByTestId("route-undo")).toBeNull();
  });

  test("a route just cleared: Undo at its end puts it back; nothing to undo, none", () => {
    const { vm } = slices();
    const { rerender } = render(<TypeRow vm={vm} />);
    expect(screen.queryByTestId("route-undo")).toBeNull();
    const undo = vi.fn();
    usePlanUndo.setState({ undoName: "Route", undo });
    rerender(<TypeRow vm={vm} />);
    fireEvent.click(screen.getByTestId("route-undo"));
    expect(undo).toHaveBeenCalled();
    expect(screen.queryByTestId("route-box-clear")).toBeNull();
  });
});

test("half a route's missing departure starts the card, its line on to the destination", () => {
  const { vm, routeList } = slices({ hasPoints: true });
  render(<MissingEnd vm={vm} end="Departure" />);
  const row = screen.getByTestId("timeline-pick-dep");
  expect(row.querySelector(".border-t")).toBeNull();
  expect(row.querySelector(".border-course")).toBeTruthy();
  fireEvent.click(row);
  expect(routeList.pickEnd).toHaveBeenCalledWith("Departure");
});
