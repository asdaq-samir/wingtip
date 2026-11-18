import { test, expect } from "@playwright/test";
import { controlsInSight, grabberTo, sideDrawer, slow } from "./helpers";
import { pickAirplane } from "./startState";
test.beforeEach(({ page }) => pickAirplane(page)); // its figures read (the setup picks none)

/**
 * Every pick-one choice is the app's one pull-down (components/PullDown),
 * as iOS's pull-down button is: the one picked on its trigger, a tap a
 * list of them on the light material with a 14-point corner, and the
 * picked one's checkmark on the left of its words. Base UI's Select since
 * 2026-11-17 (ui/select), a listbox, in the app's one menu look.
 */
test("a pick-one is the pull-down: a list of the choices, the picked one's tick on the left", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "judged as a phone");
  await page.goto("/app/plan?dep=C81&dest=C81");
  await grabberTo(page, "full");
  await expect(sideDrawer(page).getByTestId("navlog-ete")).toHaveText("1h", { timeout: slow(30000) });
  await controlsInSight(page);

  const trigger = page.getByTestId("local-duration");
  await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
  await expect(trigger).toHaveAccessibleName("Time aloft: 1h");
  await trigger.click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  // The app's menu look, the same as every action menu's (ui/menuLook), on
  // the popup the listbox sits in (Base UI's Select.List inside its Popup).
  const popup = page.locator("[data-slot=select-content]").filter({ has: menu });
  expect(await popup.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("14px");
  // The one picked ticked, its tick at the row's left and its words after.
  const picked = menu.getByRole("option", { name: "1h", exact: true });
  await expect(picked).toHaveAttribute("aria-selected", "true");
  await expect(menu.locator("[role=option][aria-selected=true]")).toHaveCount(1);
  const tick = await picked.locator("[data-slot=select-item-indicator] svg").boundingBox();
  const row = await picked.boundingBox();
  const words = await picked.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el.lastChild!);
    return range.getBoundingClientRect().left;
  });
  expect(tick && row).toBeTruthy();
  expect(tick!.x - row!.x).toBeLessThan(24);
  expect(tick!.x + tick!.width).toBeLessThanOrEqual(words);

  // Picked from the menu: the trigger says it, the flight follows.
  await menu.getByRole("option", { name: "2h", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/[?&]local_min=120/);
  await expect(trigger).toHaveAccessibleName("Time aloft: 2h");
  // From the keyboard too, as a select is: Enter opens it on the one picked.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "2h", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
});
