// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Pending } from "./BriefingBits";

afterEach(cleanup);

describe("Pending", () => {
  it("shows the briefing's shape while it comes, its words for a screen reader", () => {
    render(<Pending coming>Fetching METARs…</Pending>);
    const status = screen.getByRole("status");
    expect(status.querySelector(".sr-only")?.textContent).toBe("Fetching METARs…");
    expect(status.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2);
  });

  it("says in words why it is not there when it is not coming", () => {
    render(<Pending>The briefing follows once the route's course is drawn.</Pending>);
    expect(screen.getByRole("status").textContent).toBe("The briefing follows once the route's course is drawn.");
    expect(screen.getByRole("status").querySelectorAll("[data-slot=skeleton]")).toHaveLength(0);
  });
});
