// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Calendar } from "./calendar";
import { DateField } from "./date-field";
import { TimeField } from "./time-field";
import { NumberField } from "./number-field";
import { THREE_FIGURES } from "./numberFormats";
import { parseDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";

afterEach(cleanup);

// The date and time fields (one button each, as iOS's compact pickers)
// and React Aria's number field in place of the native ones: the values going out are the strings and numbers the native fields gave,
// so the forms and the gateway see no change.
describe("the React Aria fields", () => {
  it("a date field is one button showing its day, named with it", () => {
    render(<DateField aria-label="Date flown" value="2026-11-09" onChange={vi.fn()} data-testid="day" />);
    const button = screen.getByTestId("day");
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toBe("9 Nov 2026");
    expect(button.getAttribute("aria-label")).toBe("Date flown, 9 Nov 2026: change");
  });

  it("a date field with nothing in it says so, and nonsense is taken for nothing", () => {
    render(<DateField aria-label="Due" value="not a day" data-testid="day" />);
    expect(screen.getByTestId("day").getAttribute("aria-label")).toBe("Due, none: change");
  });

  it("a time field is one button showing the 24-hour clock's HH:mm and zone, its wheels giving HH:mm", () => {
    const changed = vi.fn();
    render(<TimeField aria-label="Departure time" value="15:05" zone="CST" onChange={changed} data-testid="time" />);
    const button = screen.getByTestId("time");
    expect(button.textContent).toBe("15:05 CST");
    expect(button.getAttribute("aria-label")).toBe("Departure time, 15:05 CST: change");
    expect(screen.queryByTestId("time-hours")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const hours = screen.getByRole("listbox", { name: "Hours" });
    expect(hours.querySelector('[aria-selected="true"]')?.textContent).toBe("15");
    fireEvent.click(within(hours).getByRole("option", { name: "14" }));
    expect(changed).toHaveBeenLastCalledWith("14:05");
  });

  it("a time field's next pick is against the pilot's own, not a time brought back into range", () => {
    const changed = vi.fn();
    const { rerender } = render(<TimeField aria-label="Leaving" value="14:50" onChange={changed} data-testid="time" />);
    fireEvent.click(screen.getByTestId("time"));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hours" })).getByRole("option", { name: "13" }));
    expect(changed).toHaveBeenLastCalledWith("13:50");
    // The caller holds it to the landing, 14:20.
    rerender(<TimeField aria-label="Leaving" value="14:20" onChange={changed} data-testid="time" />);
    fireEvent.click(within(screen.getByRole("listbox", { name: "Minutes" })).getByRole("option", { name: "05" }));
    expect(changed).toHaveBeenLastCalledWith("13:05");
  });

  it("a number field gives its figure as it is left, null when emptied, without grouping", () => {
    const changed = vi.fn();
    render(<NumberField aria-label="Hours Now" defaultValue={2550} onChange={changed} data-testid="n" />);
    const field = screen.getByTestId<HTMLInputElement>("n");
    expect(field.value).toBe("2550");
    // Named once, on the figure: a search by its name finds it alone.
    expect(screen.getAllByLabelText("Hours Now")).toEqual([field]);
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "1262.3" } });
    act(() => field.blur());
    expect(changed).toHaveBeenLastCalledWith(1262.3);
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "" } });
    act(() => field.blur());
    expect(changed).toHaveBeenLastCalledWith(null);
  });

  // The stock audit's W1 (2026-11-11): a hand filter of the text read a
  // comma-decimal phone's "12,5" as 125. React Aria reads it in the locale.
  it("reads a comma decimal as a decimal where the locale writes one", () => {
    const changed = vi.fn();
    const typed = vi.fn();
    render(
      <I18nProvider locale="de-DE">
        <NumberField aria-label="Fuel Burn" defaultValue={null} onChange={changed} onTyped={typed} data-testid="n" />
      </I18nProvider>,
    );
    const field = screen.getByTestId<HTMLInputElement>("n");
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "12,5" } });
    expect(typed).toHaveBeenLastCalledWith(12.5);
    act(() => field.blur());
    expect(changed).toHaveBeenLastCalledWith(12.5);
    expect(field.value).toBe("12,5");
  });

  it("reads a point decimal in a point locale, and gives each figure as it is typed", () => {
    const typed = vi.fn();
    render(
      <I18nProvider locale="en-US">
        <NumberField aria-label="Distance" defaultValue={null} onTyped={typed} data-testid="n" />
      </I18nProvider>,
    );
    const field = screen.getByTestId<HTMLInputElement>("n");
    act(() => field.focus());
    fireEvent.change(field, { target: { value: "12.5" } });
    expect(typed).toHaveBeenLastCalledWith(12.5);
    fireEvent.change(field, { target: { value: "" } });
    expect(typed).toHaveBeenLastCalledWith(null);
  });

  it("writes a course in three figures", () => {
    render(
      <I18nProvider locale="en-US">
        <NumberField aria-label="Course" defaultValue={90} formatOptions={THREE_FIGURES} data-testid="n" />
      </I18nProvider>,
    );
    expect(screen.getByTestId<HTMLInputElement>("n").value).toBe("090");
  });

  it("a calendar marks each day by its ISO date and picks one", () => {
    const picked = vi.fn();
    render(<Calendar aria-label="Flights before a date" value={parseDate("2026-11-09")} onChange={picked} />);
    expect(document.querySelector('[data-slot="calendar"]')).not.toBeNull();
    expect(document.querySelector('[data-day="2026-12-01"]')?.hasAttribute("data-outside-month")).toBe(true);
    const cell = document.querySelector<HTMLElement>('[data-day="2026-11-12"][role="button"]')!;
    fireEvent.click(cell);
    expect(picked.mock.calls.at(-1)?.[0]?.toString()).toBe("2026-11-12");
  });
});
