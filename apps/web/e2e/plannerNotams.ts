import { readFileSync } from "node:fs";

/** KDLH's NOTAMs as the planner reads them for the card (app.notam_reading:
 *  each one's `reading`, `card`, `subject` and `affects`), recorded from the
 *  endpoint's own code by apps/web/scripts/notam_readings.py and keyed by the
 *  NOTAM's text as sent. */
const READ = JSON.parse(readFileSync(new URL("./fixtures/notams/kdlh-read.json", import.meta.url), "utf8")) as Record<
  string,
  Record<string, unknown>
>;

/** A mocked NOTAM of Duluth's as GET /api/airport/{ident}/notams sends it:
 *  its ranking as the spec gives it, and the engine's reading beside it, as
 *  the web reads it unchanged (fieldNotams). A NOTAM not recorded is the
 *  spec's mistake, said at once rather than as a card that never draws. */
export function asPlanner<T extends { raw: string }>(n: T): T & Record<string, unknown> {
  const read = READ[n.raw];
  if (!read)
    throw new Error(`No recorded reading for ${JSON.stringify(n.raw)}: add it to apps/web/scripts/notam_readings.py and record again`);
  return { ...n, ...read };
}
