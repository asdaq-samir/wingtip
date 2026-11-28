// @vitest-environment jsdom
/**
 * FPL's stops below full (the owner, 2026-11-18: "let's just show the
 * stops as another row in between. And when the card is full, no need to
 * show that because it expands to show all the stops"): two or more are
 * one row between the ends, "2 Stops" and their idents, a tap asking for
 * the sheet all the way up; at full, or with one stop, each its own row.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { listedPoints, stopsTitle } from "./stopsRow";
import { StopsRow } from "./TimelineStopRows";

afterEach(cleanup);

const route = ["C81", "KMSP", "KEAU", "KDLH"];

test("below full, two stops are one row between the ends", () => {
  expect(listedPoints(route, false)).toEqual(["C81", null, "KDLH"]);
});

test("at full there is no stops' row: every stop is its own", () => {
  expect(listedPoints(route, true)).toEqual(route);
});

test("one stop is its own row, a row for it taking the same room", () => {
  expect(listedPoints(["C81", "KMSP", "KDLH"], false)).toEqual(["C81", "KMSP", "KDLH"]);
  expect(listedPoints(["C81", "KDLH"], false)).toEqual(["C81", "KDLH"]);
});

test("the count is a Title Case label", () => {
  expect(stopsTitle(2)).toBe("2 Stops");
  expect(stopsTitle(4)).toBe("4 Stops");
});

test("the row says the count and the idents, is named for a screen reader, and a tap asks for all of them", () => {
  const onShowAll = vi.fn();
  render(<StopsRow idents={["KMSP", "KEAU"]} onShowAll={onShowAll} />);
  const row = screen.getByRole("button", { name: "2 stops: KMSP, KEAU. Show all" });
  expect(row.textContent).toBe("2 StopsKMSP, KEAU");
  expect(screen.getByTestId("timeline-stops-idents").textContent).toBe("KMSP, KEAU");
  fireEvent.click(row);
  expect(onShowAll).toHaveBeenCalledOnce();
});
