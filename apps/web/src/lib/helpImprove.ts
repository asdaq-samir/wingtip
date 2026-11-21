import { keptStore } from "./storage";

/**
 * Help Improve Wingtip Maps, Settings' switch under Help & About: whether
 * this device sends the gateway its faults and speed figures (lib/
 * errorReports, lib/longTasks, lib/speed), which carry nothing of the
 * pilot's (docs/privacy-inventory.md, Diagnostics). On unless the pilot
 * turns it off, as on the iPhone and Android; off, nothing is sent from
 * that moment. Kept on this device, not with the account: a report is
 * no one's, so the choice is the device's too.
 */
export const useHelpImprove = keptStore<boolean>("wingtip.helpImprove", true);

export function setHelpImprove(value: boolean) {
  useHelpImprove.setState({ value });
}

/** Whether a report may be sent now. */
export const helpImproveOn = () => useHelpImprove.getState().value !== false;

/** The share of page loads whose speed figures are sent: enough for a
 *  day's 75th percentile, a quarter of the reports otherwise (the faults
 *  are not sampled: each is wanted). */
export const SPEED_SAMPLE = 0.25;

let sampled: boolean | undefined;

/** Whether this page load is one of the sampled: drawn once a load, so
 *  a page's Core Web Vitals and long tasks go together or not at all. */
export function inSpeedSample(random: () => number = Math.random): boolean {
  sampled ??= random() < SPEED_SAMPLE;
  return sampled;
}

/** For the tests: as at a fresh load. */
export function resetSpeedSample() {
  sampled = undefined;
}
