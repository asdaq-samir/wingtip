import type { Tone } from "../../../components/StatusBadge";

/**
 * What the console knows about a service, as one value. It was
 * `up: boolean | undefined`, and undefined meant in flight, failed, not
 * configured and unknown alike: an agent not configured here read
 * "checking…" for ever, as did every row once /api/status failed.
 */
export type Health = "checking" | "up" | "down" | "no answer" | "not configured";

export const HEALTH: Record<Health, { tone: Tone; label: string }> = {
  checking: { tone: "checking", label: "checking…" },
  up: { tone: "up", label: "up" },
  down: { tone: "down", label: "down" },
  "no answer": { tone: "down", label: "no answer" },
  "not configured": { tone: "checking", label: "not configured" },
};

/** A service the planner's snapshot probed: null there means this
 *  deployment does not run it. */
export function reported(service: { up: boolean } | null | undefined, snapshotFailed: boolean): Health {
  if (snapshotFailed) return "no answer";
  if (service === null) return "not configured";
  if (service === undefined) return "checking";
  return service.up ? "up" : "down";
}
