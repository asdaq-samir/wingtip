import { expect, type Page } from "@playwright/test";
import { closeSidebarWithTheStockKey, frontSheet } from "./helpers";

/* Where a spec starts from that is not the setup's session as it is. */

/** An airplane picked before the page loads, as a pilot picks one (FPL's
 *  airplane): the stock C172 unless another profile is named. The session
 *  every spec starts from has none (auth.setup; the owner, 2026-11-09:
 *  nothing assumes one), so a spec that reads an airplane's times, fuel or
 *  figures picks it with this, in a beforeEach or at its start. Once a
 *  tab: a spec that then picks another, or none, and reloads keeps it. */
export async function pickAirplane(
  page: Page,
  airplane: { profile: string; label: string } = { profile: "c172", label: "C172 · Cessna 172" },
) {
  await page.addInitScript((picked) => {
    if (sessionStorage.getItem("e2e.airplanePicked")) return;
    sessionStorage.setItem("e2e.airplanePicked", "1");
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":7}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, aircraft: picked } }));
  }, airplane);
}

/** The route's checkpoints off, as a pilot has them at first
 *  (lib/preferences; the session every spec starts from turns them on,
 *  helpers' noTips): each is a mark with a near miss's reach of its own,
 *  and one sat at the middle of the test route's last leg, where a tap
 *  for the leg then opened the checkpoint's card. */
export async function noCheckpoints(page: Page) {
  await page.addInitScript(() => {
    const kept = JSON.parse(localStorage.getItem("wingtip.preferences") ?? '{"state":{},"version":7}');
    localStorage.setItem("wingtip.preferences", JSON.stringify({ ...kept, state: { ...kept.state, aeronautical: false } }));
  });
}

/** The panel at rest, as a page opens on a phone: a desktop's side panel
 *  opens out, the search and the plan in it (MapPage, the one-search
 *  design's Desktop, 2026-11-09), so it is put away first there, for a
 *  spec about the panel's pill and what the map does round it. */
export async function fromRest(page: Page) {
  if (page.viewportSize()!.width >= 1024) {
    await expect(frontSheet(page)).toHaveAttribute("data-panel", "half");
    await closeSidebarWithTheStockKey(page);
  }
  await expect(frontSheet(page)).toHaveAttribute("data-panel", "peek");
}
