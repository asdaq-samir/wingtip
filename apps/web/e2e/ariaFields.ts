import { expect, type Locator, type Page } from "@playwright/test";
import { inSheet } from "./helpers";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The date and time fields (components/ui/date-field, time-field) are one
 * button each, as iOS's compact pickers are: a date's opens the calendar,
 * a time's the hours and minutes as two wheels under it.
 */
export async function fillDate(field: Locator, iso: string) {
  const [year, month] = iso.split("-");
  const page = field.page();
  // In a card opened half way, the field may be under its edge (inSheet).
  await inSheet(page, field);
  await field.click();
  const calendar = page.locator('[data-slot="calendar"]').last();
  await expect(calendar).toBeVisible();
  // The month and the year by their pull-downs (ui/calendar; ten years
  // either side of the day picked, React Aria's), then the day.
  const pulls = calendar.locator('[aria-haspopup="listbox"]');
  for (const [i, name] of [
    [1, String(Number(year))],
    [0, MONTHS[Number(month) - 1]],
  ] as const) {
    const pull = pulls.nth(i);
    if ((await pull.innerText()).includes(name)) continue;
    await pull.click();
    await page.getByRole("option", { name, exact: true }).click();
  }
  await calendar.locator(`[data-day="${iso}"]:not([data-outside-month])`).click();
  await expect(calendar).toHaveCount(0);
}

/** A time field's hours and minutes, "HH:mm" on the 24-hour clock: its
 *  button opens the wheels, where they are not open already. */
export async function fillTime(field: Locator, hhmm: string) {
  const [hour, minute] = hhmm.split(":");
  const page = field.page();
  if ((await field.getAttribute("aria-expanded")) !== "true") await field.click();
  // Each row scrolled to in its wheel first, as a finger does: a click's
  // own scroll was undone as the pick drew the wheel again.
  for (const [wheel, row] of [
    ["Hours", hour],
    ["Minutes", minute],
  ] as const) {
    const option = page.getByRole("listbox", { name: wheel }).getByRole("option", { name: row, exact: true });
    await option.scrollIntoViewIfNeeded();
    await option.click();
  }
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
