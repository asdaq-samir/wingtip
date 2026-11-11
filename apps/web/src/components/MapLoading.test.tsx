// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MapLoading from "./MapLoading";

afterEach(cleanup);

const insets = { top: 10, bottom: 300, left: 0 };

describe("MapLoading", () => {
  it("shows the spinner in the middle of what the sheet leaves", () => {
    render(<MapLoading shown insets={insets} />);
    const mark = screen.getByRole("status", { name: "Loading the map" });
    expect(mark.className).toContain("opacity-100");
    expect(mark.style.bottom).toBe("300px");
    expect(mark.style.top).toBe("10px");
  });

  it("fades as the map comes in, then leaves the tree", () => {
    const { rerender } = render(<MapLoading shown insets={insets} />);
    rerender(<MapLoading shown={false} insets={insets} />);
    const mark = screen.getByTestId("map-loading");
    expect(mark.className).toContain("opacity-0");
    fireEvent.transitionEnd(mark);
    expect(screen.queryByTestId("map-loading")).toBeNull();
  });
});
