// @vitest-environment jsdom
/**
 * The route before it is whole, drawn as the timeline draws a whole one
 * (the owner, 2026-11-18): the two ends to pick, each asking the one
 * search, and the box's toggle at the Destination's end, opening the
 * route's field in the box's place -- no row of its own, no Undo or ✕
 * beside it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { usePlanUndo } from "../../../lib/planUndo";
import type { PlanSlices } from "../vm/planSlices";
import { BoxToggle, EmptyRoute, MissingEnd } from "./RouteStart";

afterEach(cleanup);
beforeEach(() => usePlanUndo.setState({ undoName: null, undo: () => {} }));

function slices({ hasPoints = false, routed = false, boxOpen = false } = {}) {
  const routeList = { boxOpen, clearRoute: vi.fn(), typeInPlace: vi.fn(), pickEnd: vi.fn() };
  const vm = { route: { hasPoints, routed }, routeList } as unknown as PlanSlices<"route" | "routeList">;
  return { vm, routeList };
}

describe("the empty route", () => {
  test("is the timeline's card: the two ends in a placeholder's words, the box's toggle at its end", () => {
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

describe("the box's toggle", () => {
  test("sits in the Destination's row, the card's last, with no row of its own, opening the field", () => {
    const { vm, routeList } = slices();
    render(<EmptyRoute vm={vm} />);
    const toggle = screen.getByRole("button", { name: "Type the route" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("timeline-type-row")).toBeNull();
    const dest = screen.getByTestId("timeline-pick-dest").parentElement!;
    expect(dest.contains(toggle)).toBe(true);
    fireEvent.click(toggle);
    expect(routeList.typeInPlace).toHaveBeenCalledOnce();
  });

  test("opens the route's field and puts the focus in it", () => {
    const { vm, routeList } = slices();
    const field = document.createElement("input");
    field.dataset.testid = "route-type";
    document.body.append(field);
    render(<BoxToggle vm={vm} />);
    fireEvent.click(screen.getByTestId("route-type-open"));
    expect(routeList.typeInPlace).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  test("is not on the card while the field is open under it: the field's own is", () => {
    const { vm } = slices({ boxOpen: true });
    render(<EmptyRoute vm={vm} />);
    expect(screen.queryByTestId("route-type-open")).toBeNull();
  });

  test("no Undo or ✕ beside it: they are the field's, or the toast's", () => {
    usePlanUndo.setState({ undoName: "Route", undo: vi.fn() });
    const { vm } = slices();
    render(<EmptyRoute vm={vm} />);
    expect(screen.queryByTestId("route-undo")).toBeNull();
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
