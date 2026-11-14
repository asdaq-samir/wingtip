// @vitest-environment jsdom
/**
 * The shared status badge says its status in words a screen reader hears
 * (its own text, nothing hidden), its default word unless the caller says
 * more, and a flight category in the category's chip colour.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import StatusBadge from "./StatusBadge";

afterEach(cleanup);

describe("StatusBadge", () => {
  test("says each status's own word when given none", () => {
    render(
      <>
        <StatusBadge variant="active" />
        <StatusBadge variant="out-of-service" />
        <StatusBadge variant="inAir" />
      </>,
    );
    expect(screen.getByText("Active").dataset.status).toBe("active");
    expect(screen.getByText("Out of service").dataset.status).toBe("out-of-service");
    expect(screen.getByText("In the air").dataset.status).toBe("inAir");
  });

  test("says the caller's words where the status needs more", () => {
    render(<StatusBadge variant="closed">Closed indefinitely</StatusBadge>);
    const badge = screen.getByText("Closed indefinitely");
    expect(badge.getAttribute("aria-hidden")).toBeNull();
    expect(badge.className).toContain("--badge-status-closed");
  });

  test("fills a flight category in its chip colour", () => {
    render(<StatusBadge category="LIFR" />);
    expect(screen.getByText("LIFR").style.backgroundColor).toBe("rgb(126, 63, 184)");
  });
});
