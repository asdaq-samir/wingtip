// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Calendar } from "./calendar";
import { DateField, TimeField } from "./date-field";
import { NumberField } from "./number-field";
import { THREE_FIGURES } from "./numberFormats";
import { parseDate } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";

afterEach(cleanup);

// React Aria's date, time and number fields in place of the native ones:
// the values going out are the strings and numbers the native fields gave,
// so the forms and the gateway see no change.
describe("the React Aria fields", () => {
  it("a date field shows its ISO day and gives one back, a step of a segment by the arrow keys", () => {
    const changed = vi.fn();
    render(<DateField aria-label="Date flown" value="2026-11-09" onChange={changed} data-testid="day" />);
    const box = screen.getByTestId("day");
    const day = box.querySelector<HTMLElement>('[data-type="day"]')!;
    expect(day.textContent).toBe("9");
    act(() => day.focus());
    fireEvent.keyDown(day, { key: "ArrowUp" });
    expect(changed).toHaveBeenLastCalledWith("2026-11-10");
  });

  it("a date field with nothing in it says so, and nonsense is taken for nothing", () => {
    render(<DateField aria-label="Due" value="not a day" data-testid="day" />);
    expect(screen.getByTestId("day").querySelector('[data-type="year"]')?.hasAttribute("data-placeholder")).toBe(true);
  });

  it("a time field reads and gives the 24-hour clock's HH:mm", () => {
    const changed = vi.fn();
    render(<TimeField aria-label="Departure time" value="15:05" onChange={changed} data-testid="time" />);
    const hour = screen.getByTestId("time").querySelector<HTMLElement>('[data-type="hour"]')!;
    expect(hour.textContent).toBe("15");
    act(() => hour.focus());
    fireEvent.keyDown(hour, { key: "ArrowDown" });
    expect(changed).toHaveBeenLastCalledWith("14:05");
  });

  it("a number field gives its figure as it is left, null when emptied, without grouping", () => {
    const changed = vi.fn();
    render(<NumberField aria-label="Hours now" defaultValue={2550} onChange={changed} data-testid="n" />);
    const field = screen.getByTestId<HTMLInputElement>("n");
    expect(field.value).toBe("2550");
    // Named once, on the figure: a search by its name finds it alone.
    expect(screen.getAllByLabelText("Hours now")).toEqual([field]);
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
        <NumberField aria-label="Fuel burn" defaultValue={null} onChange={changed} onTyped={typed} data-testid="n" />
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
