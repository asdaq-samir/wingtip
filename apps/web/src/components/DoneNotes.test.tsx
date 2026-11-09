// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import DoneNotes from "./DoneNotes";
import { done } from "../lib/doneNote";

describe("a confirmation said where it happened", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("shows beside the control just tapped, says it to a reader, and goes in two seconds", () => {
    vi.useFakeTimers();
    render(<><button type="button">Save</button><DoneNotes /></>);
    const save = screen.getByRole("button", { name: "Save" });
    save.getBoundingClientRect = () => ({ left: 100, top: 300, width: 80, height: 40, right: 180, bottom: 340, x: 100, y: 300, toJSON: () => ({}) });
    save.focus();
    act(() => done("Flight Saved"));
    const note = screen.getByTestId("done-note");
    expect(note.textContent).toBe("Flight Saved");
    // Over the button's middle, a little above it.
    expect(note.style.left).toContain("140px");
    expect(note.style.top).toBe("292px");
    expect(screen.getByRole("status").textContent).toContain("Flight Saved");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByTestId("done-note")).toBeNull();
  });
});
