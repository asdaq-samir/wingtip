// @vitest-environment jsdom
/**
 * The N-number's and the altitude's field is shadcn's InputGroup round its
 * InputGroupInput, the owner's rules for it kept: its fixed start in the
 * field's own text with the grey blanks after it, one width whatever is in
 * it, the words the group's size, and the stock ring's slot.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { InlineField } from "./InlineField";

afterEach(cleanup);

function field(value: string) {
  render(
    <InlineField
      label="Cruise altitude"
      testId="altitude-group"
      widest="FL-000"
      placeholder=""
      hint={{ start: "FL-", words: "___" }}
      input={{ value, onChange: () => {}, "aria-label": "Cruise altitude", "data-testid": "altitude-input" }}
    />,
  );
  return { group: screen.getByTestId("altitude-group"), input: screen.getByTestId("altitude-input") };
}

describe("InlineField", () => {
  test("is the stock input group, named, its input the group's control", () => {
    const { group, input } = field("FL-");
    expect(group.getAttribute("data-slot")).toBe("input-group");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Cruise altitude");
    expect(input.getAttribute("data-slot")).toBe("input-group-control");
    // The pill's 28 and its own fill, not the stock group's 36 and line.
    expect(group.className).toMatch(/\bh-7\b/);
    expect(group.className).toMatch(/\bborder-0\b/);
    expect(group.className).not.toMatch(/\bh-9\b|\bshadow-xs\b/);
    // The words the group's, never the stock input's 14 from md up.
    expect(input.className).toContain("md:text-[length:inherit]");
    expect(input.className).not.toMatch(/\bmd:text-sm\b/);
  });

  test("shows the grey blanks after its fixed start while nothing is typed", () => {
    field("FL-");
    expect(screen.getByTestId("altitude-group-hint").textContent).toBe("FL-___");
    cleanup();
    field("FL-085");
    expect(screen.queryByTestId("altitude-group-hint")).toBeNull();
  });

  test("keeps one width: the widest value and the example laid out unseen in its cell", () => {
    const { group } = field("FL-");
    const unseen = [...group.querySelectorAll<HTMLElement>("span.invisible")].map((s) => s.textContent);
    expect(unseen).toContain("FL-000");
    expect(unseen).toContain("FL-___");
  });
});
