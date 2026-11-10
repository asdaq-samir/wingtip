import { test, expect } from "@playwright/test";
import { settle, slow } from "./helpers";

/**
 * Ask by voice (features/voice), apart from the radio (the owner,
 * 2026-11-10: "the mic is a speaking feature for a pilot to ask anything
 * vs radio listening is a separate feature"): the search's mic is a
 * toggle, pressed while it listens, the field asks to "Speak your
 * question", the words appear in the field as they are said, and none of
 * the radio's pill, words or log comes up.
 */
test("the search's mic types what is said into the field, with nothing of the radio's", { tag: "@smoke" }, async ({ page }) => {
  // A recognizer that hears the pilot a word at a time, then the whole
  // settled, and ends when stopped (the pause after the words).
  await page.addInitScript(() => {
    class Heard {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        const say = (transcript: string, isFinal: boolean, at: number) =>
          setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] }), at);
        say("Duluth", false, 600);
        say("Duluth weather", true, 1400);
      }
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
    }
    // `available`, Chrome's on-device ask (lib/speechLocal): voice is offered only where speech stays on the device.
    Object.assign(window, {
      SpeechRecognition: Object.assign(Heard, { available: async () => "available" }),
      webkitSpeechRecognition: Heard,
    });
  });
  await page.goto("/app/plan");
  await settle(page);
  const mic = page.getByTestId("one-search-mic");
  const field = page.getByTestId("search-airports");
  await expect(mic).toBeVisible({ timeout: slow(30_000) });
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  // The page's first tap can land before its handlers are in on a slow
  // load: tapped again until it listens.
  await expect(async () => {
    if ((await mic.getAttribute("aria-pressed")) !== "true") await mic.click();
    await expect(mic).toHaveAttribute("aria-pressed", "true", { timeout: 1000 });
  }).toPass({ timeout: slow(20_000) });
  await expect(field).toHaveAttribute("placeholder", "Speak your question");
  // The words in the field as they are said, then the whole.
  await expect(field).toHaveValue("Duluth", { timeout: slow(5000) });
  await expect(field).toHaveValue("Duluth weather", { timeout: slow(5000) });
  // The pause ends it: the toggle let go, the words kept in the field.
  await expect(mic).toHaveAttribute("aria-pressed", "false", { timeout: slow(10_000) });
  await expect(field).toHaveValue("Duluth weather");
  // Nothing of the radio's: no pill, no captions, Comms assist not pressed.
  await expect(page.getByTestId("radio-pill")).toHaveCount(0);
  await expect(page.getByTestId("radio-captions")).toHaveCount(0);
  await expect(page.getByTestId("radio-button")).toHaveAttribute("aria-pressed", "false");
});
