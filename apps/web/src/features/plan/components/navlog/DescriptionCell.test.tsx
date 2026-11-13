// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Description } from "../../hooks/useCheckpointNotes";
import { DescriptionCell } from "./DescriptionCell";

afterEach(cleanup);

const note = (text: string): Description => ({ text });

function cell(description: Description | undefined, onSave = vi.fn(() => Promise.resolve())) {
  const view = render(<DescriptionCell description={description} onSave={onSave} selected={false} onFocus={() => {}} />);
  const box = screen.getByRole("textbox") as HTMLTextAreaElement;
  const rerender = (next: Description | undefined) =>
    view.rerender(<DescriptionCell description={next} onSave={onSave} selected={false} onFocus={() => {}} />);
  return { box, onSave, rerender };
}

describe("a checkpoint's note box", () => {
  test("an untouched box shows the note as it changes", () => {
    const { box, rerender } = cell(undefined);
    rerender(note("the water tower"));
    expect(box.value).toBe("the water tower");
  });

  test("a note that changes while the pilot types does not replace the typing, and the typing is saved", () => {
    const { box, onSave, rerender } = cell(undefined);
    fireEvent.change(box, { target: { value: "red barn by the bend" } });
    rerender(note("a river bend"));
    expect(box.value).toBe("red barn by the bend");

    fireEvent.blur(box);
    expect(onSave).toHaveBeenCalledWith("red barn by the bend");
  });

  test("a save that fails leaves the typing in the box", async () => {
    let fail!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = () => reject(new Error("502"));
        }),
    );
    const { box } = cell(note("a town"), onSave);
    fireEvent.change(box, { target: { value: "the grain elevator" } });
    fireEvent.blur(box);
    await act(async () => {
      fail();
    });
    expect(box.value).toBe("the grain elevator");
  });

  test("once saved, the box goes back to showing the note as it stands", async () => {
    const { box, rerender } = cell(note("a town"));
    fireEvent.change(box, { target: { value: "the grain elevator" } });
    await act(async () => {
      fireEvent.blur(box);
    });
    rerender(note("the grain elevator"));
    rerender(note("the grain elevator, north side"));
    expect(box.value).toBe("the grain elevator, north side");
  });

  test("emptied and left, it shows the stored note again and saves nothing", () => {
    const { box, onSave } = cell(note("a town"));
    fireEvent.change(box, { target: { value: "   " } });
    fireEvent.blur(box);
    expect(onSave).not.toHaveBeenCalled();
    expect(box.value).toBe("a town");
  });
});
