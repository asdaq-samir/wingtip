import type { Page } from "@playwright/test";

/**
 * The features Claude writes are off by default (app.claude-features OFF,
 * the owner's decision of 2026-11-10: "To keep the cost low, we only add
 * the claude feature later when we decide about subscription model"), so
 * the stack's own capabilities hide Ask, the narrative, the words and the
 * rest. A spec of one of them answers every assistant call itself (a
 * stub, nothing billed) and turns them on for its page here, the stack's
 * other capabilities kept as it answers them.
 */
export async function claudeFeatures(
  page: Page,
  claude: "OFF" | "DEVELOPERS" | "EVERYONE" = "EVERYONE",
  change: Record<string, unknown> = {},
) {
  await page.route(
    (url) => url.pathname === "/api/auth/capabilities",
    async (route) => {
      const real = await (await route.fetch()).json();
      await route.fulfill({ json: { ...real, claudeFeatures: claude, ...change } });
    },
  );
}
