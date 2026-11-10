// @vitest-environment jsdom
/**
 * An icon button keeps its keys: Enter and Space on it are the browser's
 * own press, which clicks a button. React Aria's long press (the label
 * held up on a finger) once took both, its keydown's default prevented,
 * and no icon button -- a card's ✕ among them -- could be pressed from a
 * keyboard.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TooltipProvider } from "../ui/tooltip";
import { IconTip } from "./IconTip";

afterEach(cleanup);

test.each(["Enter", " "])("%j on an icon button is left to the browser", (key) => {
  render(
    <TooltipProvider>
      <IconTip label="Close" onClick={() => {}} />
    </TooltipProvider>,
  );
  const button = screen.getByRole("button", { name: "Close" });
  button.focus();
  // dispatchEvent's answer: false had a handler prevented its default.
  expect(fireEvent.keyDown(button, { key })).toBe(true);
  expect(fireEvent.keyUp(button, { key })).toBe(true);
});
