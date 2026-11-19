// @vitest-environment jsdom
/**
 * The airport card's action row in its two ways: as it opens from the map
 * or a search, Fly Here filled and first, then Add Stop, Call and
 * Favorite; opened while the pilot adds a stop (the owner, 2026-11-18:
 * "replace fly here with add stop. And at the add fourth button for
 * address"), Add Stop filled and first, no Fly Here, and Address last,
 * the field in Maps. A closed field's Add Stop stays greyed with its
 * reason either way (decision 0043).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AirportPlace } from "../../lib/api/types";
import PlaceActions from "./PlaceActions";

const FIELD = {
  ident: "KMSN",
  name: "Dane County Regional",
  municipality: "Madison",
  lat: 43.13986,
  lon: -89.33751,
  phone: "608-246-3380",
  address: "4000 International Ln, Madison, WI",
  closed: null,
} as unknown as AirportPlace;

afterEach(cleanup);

/** The row's tiles' test ids, in order. */
const tiles = () => [...screen.getByTestId("place-actions").querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));

describe("PlaceActions", () => {
  test("as it opens, Fly Here first and filled, then Add Stop, Call and Favorite", () => {
    render(<PlaceActions place={FIELD} ident="KMSN" flying={false} onFlyHere={vi.fn()} onAddStop={vi.fn()} />);
    expect(tiles()).toEqual(["fly-here", "place-add-stop", "place-call", "place-favorite"]);
    expect(screen.queryByTestId("place-address-action")).toBeNull();
  });

  test("opened while a stop is asked for, Add Stop takes Fly Here's place and Address is last", () => {
    const onAddStop = vi.fn();
    const onFlyHere = vi.fn();
    render(<PlaceActions place={FIELD} ident="KMSN" flying={false} onFlyHere={onFlyHere} onAddStop={onAddStop} asStop />);
    expect(tiles()).toEqual(["place-add-stop", "place-call", "place-favorite", "place-address-action"]);
    expect(screen.queryByTestId("fly-here")).toBeNull();
    fireEvent.click(screen.getByTestId("place-add-stop"));
    expect(onAddStop).toHaveBeenCalledWith(FIELD);
    expect(onFlyHere).not.toHaveBeenCalled();
    const address = screen.getByTestId("place-address-action");
    expect(address.getAttribute("href")).toMatch(/^https:\/\/maps\.apple\.com\/\?q=Dane%20County%20Regional&address=/);
    expect(address).toHaveProperty("textContent", expect.stringContaining("Address"));
  });

  test("a closed field's Add Stop stays greyed with its reason while a stop is asked for", () => {
    const closed = { ...FIELD, closed: "Closed indefinitely" } as AirportPlace;
    render(<PlaceActions place={closed} ident="KMSN" flying={false} onFlyHere={vi.fn()} onAddStop={vi.fn()} asStop />);
    const add = screen.getByTestId("place-add-stop");
    expect(add).toHaveProperty("disabled", true);
    expect(add.getAttribute("aria-label")).toBe("Add Stop: Closed indefinitely");
  });
});
