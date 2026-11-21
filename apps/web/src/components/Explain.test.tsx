// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXPLAINED } from "../lib/explain";
import Explain from "./Explain";

afterEach(cleanup);

describe("an abbreviation explained on a tap", () => {
  it("is the word alone until tapped, then its name, one sentence and its source", async () => {
    const row = vi.fn();
    const { container } = render(
      // A stand-in for the nav log's row, a row that takes a tap and a key.
      <div role="row" tabIndex={0} onClick={row} onKeyDown={row}>
        <Explain term="MH" /> 334°
      </div>,
    );
    expect(container.textContent).toBe("MH 334°");
    fireEvent.click(screen.getByRole("button", { name: "MH: what it means" }));
    const popover = await screen.findByTestId("explain-popover");
    expect(popover.textContent).toContain("Magnetic Heading");
    expect(popover.textContent).toContain(EXPLAINED.MH.sentence);
    expect(popover.textContent).toContain(EXPLAINED.MH.source);
    // The tap is the word's, not the row's under it.
    expect(row).not.toHaveBeenCalled();
  });

  it("says every term in one sentence with a source", () => {
    for (const [term, what] of Object.entries(EXPLAINED)) {
      expect(what.sentence, term).toMatch(/^[A-Z].*\.$/);
      expect(what.sentence.split(/\.\s/).length, term).toBe(1);
      expect(what.source, term).not.toBe("");
    }
  });
});
