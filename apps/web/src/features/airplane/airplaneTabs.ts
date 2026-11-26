/** The airplane card's tabs, in the bar's order (the owner's design, 2026-11-26). */
export type AirplaneTab = "flight" | "flights" | "info" | "figures";

/**
 * The tabs the one airplane card has, and the one it is on: Flight with an
 * ICAO address to follow it by; Flights where its history is offered;
 * Info for an N-number; Figures for an airplane the planner can fly. It
 * opens on Figures where they were asked for, on Flight while it flies,
 * else on Info -- until the pilot picks one --
 * and on the first it has where that one is not offered.
 */
export function airplaneTabs(a: {
  hex: string | null;
  tail: string | null;
  history: boolean;
  flyable: boolean;
  /** Opened on Figures: a figure asked for, or the plan's N-number's ⓘ. */
  figures: boolean;
  airborne: boolean;
  picked: AirplaneTab | null;
}): { tabs: AirplaneTab[]; tab: AirplaneTab } {
  const tabs: AirplaneTab[] = [
    ...(a.hex ? (["flight"] as const) : []),
    ...(a.history && (a.hex || a.tail) ? (["flights"] as const) : []),
    ...(a.tail ? (["info"] as const) : []),
    ...(a.flyable ? (["figures"] as const) : []),
  ];
  // On Flight only while it flies: opened from traffic heard an hour ago it
  // opened on an empty Flight (the owner's screenshot, 2026-11-26).
  const opening: AirplaneTab = a.figures && a.flyable ? "figures" : a.airborne ? "flight" : "info";
  const tab = [a.picked, opening].find((t): t is AirplaneTab => !!t && tabs.includes(t)) ?? tabs[0] ?? "info";
  return { tabs, tab };
}
