import { expect, type Page } from "@playwright/test";
import { slow } from "./sheetHelpers";

/**
 * Time in the browser specs, in the three ways a spec may want it, and
 * the only home of page.waitForTimeout (eslint.config.js refuses it
 * anywhere else). A time slept before a one-shot measure is none of
 * them: wait on what the page says instead -- a web-first assertion,
 * expect.poll or toPass, its own marks (data-panel, data-moving,
 * data-revealed, data-drawn), sheetHelpers' settled -- since a sleep long
 * enough on the Mac was short on a loaded runner, and long everywhere
 * else (78 of them in 41 specs; CI audit 2026-11-23, M5).
 */

/** Time as the test's input: a finger held this long, or the beat
 *  between a gesture's moves, as a hand makes them. */
export const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

/** A window of time the claim is about: nothing may happen in it (no
 *  second alert, no ask made, the run's points not grown), or what does
 *  is what is recorded (a frame recorder's run). Only waited out can it
 *  be seen. Prefer page.clock where the page lets its timers be run
 *  ahead. */
export const watchFor = (page: Page, ms: number) => page.waitForTimeout(ms);

/** `read`'s answer once it has stopped changing: the same in two reads
 *  `gap` ms apart, read as often as it takes, and that answer. For what
 *  has no mark of its own to say it is at rest. */
export async function steady<T>(read: () => Promise<T>, { gap = 300, timeout = slow(10_000), message = "" } = {}): Promise<T> {
  let last: string | undefined;
  let value: T | undefined;
  await expect
    .poll(
      async () => {
        value = await read();
        const now = JSON.stringify(value);
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [gap], timeout, message: message || "the same in two reads" },
    )
    .toBe(true);
  return value as T;
}
