import type { Locator, Page } from "@playwright/test";
import { inSheet } from "./helpers";

/**
 * React Aria's date and time fields (components/ui/date-field) are boxes
 * of segments, not inputs a test can fill: each segment is typed into in
 * turn, whatever order the locale lays them out in.
 */
export async function fillDate(field: Locator, iso: string) {
  const [year, month, day] = iso.split("-");
  // The year first and the day last: into an empty field, the day's
  // second digit is the one that makes a whole date, so it is given once,
  // not once a digit of the year (0002, 0020, 0202, 2026).
  for (const [type, digits] of [
    ["year", year],
    ["month", month],
    ["day", day],
  ] as const) {
    await field.locator(`[data-type="${type}"]`).click();
    await field.page().keyboard.type(digits);
  }
}

/** A time field's hours and minutes, "HH:mm" on the 24-hour clock. */
export async function fillTime(field: Locator, hhmm: string) {
  const [hour, minute] = hhmm.split(":");
  await field.locator('[data-type="hour"]').click();
  await field.page().keyboard.type(hour);
  await field.locator('[data-type="minute"]').click();
  await field.page().keyboard.type(minute);
}

/** The departure's time field, the picker's card pulled up to it: the
 *  picker is a card on a phone (ResponsivePopover's SheetCard), opened
 *  half way as every card is, the time under its edge with the calendar
 *  over it. */
export async function departTime(page: Page) {
  const field = page.getByTestId("depart-time");
  await inSheet(page, field);
  return field;
}
