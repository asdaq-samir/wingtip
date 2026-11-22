import type { Page } from "@playwright/test";

/** The parked features' switches (src/lib/extras, Settings' Extras), each off by default. */
type Extra = "atcCopilot" | "otherAirplanes" | "modelWeather" | "threeD" | "trainingTools";

/**
 * The parked features a spec exercises turned on before the page loads, as
 * the pilot would in Settings' Extras: written into the store's storage
 * (wingtip.extras, zustand persist's shape) by an init script, so it holds
 * at every load of the test's page, the other switches left as they were.
 */
export async function extrasOn(page: Page, ...keys: Extra[]) {
  await page.addInitScript((on: string[]) => {
    let state: Record<string, boolean> = {};
    try {
      state = (JSON.parse(localStorage.getItem("wingtip.extras") ?? "null") as { state?: Record<string, boolean> } | null)?.state ?? {};
    } catch {
      /* none kept, or not ours: start from all off */
    }
    for (const key of on) state[key] = true;
    localStorage.setItem("wingtip.extras", JSON.stringify({ state, version: 0 }));
  }, keys);
}
