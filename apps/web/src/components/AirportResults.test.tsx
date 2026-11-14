// @vitest-environment jsdom
/**
 * A field NASR lists as closed is labelled wherever a search shows it (the
 * owner's hard rule, decision 0043): "Closed indefinitely" or "Closed
 * permanently", the engine's label as the planner and the index send it,
 * before its town; an open field's row says nothing of it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AirportRowFace } from "./AirportResults";

afterEach(cleanup);

describe("an airport's search row", () => {
  test("says a closed field is closed, before its town", () => {
    render(<AirportRowFace airport={{ ident: "9II2", name: "Nelund Field", municipality: "South Bend", closed: "Closed indefinitely" }} />);
    expect(screen.getByTestId("airport-closed").textContent).toBe("Closed indefinitely");
    expect(screen.getByText(/Closed indefinitely/).parentElement?.textContent).toBe("Closed indefinitely · South Bend");
  });

  test("says nothing of it for an open field", () => {
    render(<AirportRowFace airport={{ ident: "C81", name: "Campbell Airport", municipality: "Grayslake", closed: null }} />);
    expect(screen.queryByTestId("airport-closed")).toBeNull();
    expect(screen.getByText("Grayslake")).toBeTruthy();
  });

  test("marks a private, military or joint-use field before its town, and a public one not", () => {
    render(<AirportRowFace airport={{ ident: "IL11", name: "Donald Alfred Gade", municipality: "Antioch", use: "private" }} />);
    expect(screen.getByTestId("airport-use").textContent).toBe("Private · Antioch");
    cleanup();
    render(
      <AirportRowFace airport={{ ident: "KFHU", name: "Sierra Vista Muni-Libby AAF", municipality: "Fort Huachuca", use: "joint" }} />,
    );
    expect(screen.getByTestId("airport-use").textContent).toBe("Joint use · Fort Huachuca");
    cleanup();
    render(
      <AirportRowFace
        airport={{ ident: "00MO", name: "Cooper Flying Service", municipality: "Alba", closed: "Closed indefinitely", use: "private" }}
      />,
    );
    expect(screen.getByText(/Closed indefinitely/).parentElement?.textContent).toBe("Closed indefinitely · Private · Alba");
    cleanup();
    render(<AirportRowFace airport={{ ident: "C81", name: "Campbell Airport", municipality: "Grayslake", use: null }} />);
    expect(screen.queryByTestId("airport-use")).toBeNull();
  });
});
