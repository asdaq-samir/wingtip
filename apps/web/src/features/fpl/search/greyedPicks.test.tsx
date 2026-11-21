// @vitest-environment jsdom
/**
 * While the one search picks a point, a tile that cannot be picked is greyed
 * with its reason, and a tap does nothing (the owner, 2026-11-21).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SmallTile } from "../../../components/Favorites";
import { NearestStrip } from "./NearestStrip";

afterEach(cleanup);

describe("a tile a pick refuses", () => {
  test("is aria-disabled, says why, and a tap does nothing", () => {
    const onClick = vi.fn();
    render(<SmallTile mark={<span />} title="KXYZ" detail="3 nm" onClick={onClick} refused="Closed" testId="tile" />);
    const tile = screen.getByTestId("tile");
    expect(tile.getAttribute("aria-disabled")).toBe("true");
    expect(tile.textContent).toContain("Closed");
    expect(tile.textContent).not.toContain("3 nm");
    fireEvent.click(tile);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("is as it was where nothing refuses it", () => {
    const onClick = vi.fn();
    render(<SmallTile mark={<span />} title="KMSN" detail="3 nm" onClick={onClick} testId="tile" />);
    const tile = screen.getByTestId("tile");
    expect(tile.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  test("Nearest greys the field refused and keeps the other pickable", () => {
    const onOpen = vi.fn();
    const field = (ident: string) => ({ ident, name: ident, distance_nm: 3, bearing_deg: 90, airspace_class: null, flight_category: null });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NearestStrip
          fields={[field("KXYZ"), field("KMSN")] as never}
          located
          onOpen={onOpen}
          refusal={(ident) => (ident === "KXYZ" ? "Closed" : null)}
        />
      </QueryClientProvider>,
    );
    const [shut, open] = screen.getAllByTestId("nearest-strip-field");
    fireEvent.click(shut!);
    expect(onOpen).not.toHaveBeenCalled();
    expect(shut!.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(open!);
    expect(onOpen).toHaveBeenCalledWith("KMSN");
  });
});
