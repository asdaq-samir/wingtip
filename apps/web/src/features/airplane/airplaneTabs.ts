/** The airplane card's tabs, in the bar's order (the owner's design, 2026-11-26). */
export type AirplaneTab = "flights" | "info" | "figures";

/**
 * The tabs the one airplane card has, and the one it is on: Flights
 * wherever it has an address or an N-number -- its flight now while it
 * flies, then its earlier ones (Flight and Flights made one at the owner's
 * word, 2026-11-26); Info for an N-number; Figures for an airplane the
 * planner can fly. It opens on Figures where they were asked for, else on
 * Info, in the air too, as the airport's card opens on its Info, the
 * flight now in sight above the tabs in the pictures' row (the owner,
 * 2026-11-26) -- until the pilot picks one -- and on the first it has
 * where that one is not offered: Flights for traffic the FAA's registry
 * does not hold.
 */
export function airplaneTabs(a: {
  hex: string | null;
  tail: string | null;
  flyable: boolean;
  /** Opened on Figures: a figure asked for, or the plan's N-number's ⓘ. */
  figures: boolean;
  picked: AirplaneTab | null;
}): { tabs: AirplaneTab[]; tab: AirplaneTab } {
  const tabs: AirplaneTab[] = [
    ...(a.hex || a.tail ? (["flights"] as const) : []),
    ...(a.tail ? (["info"] as const) : []),
    ...(a.flyable ? (["figures"] as const) : []),
  ];
  const opening: AirplaneTab = a.figures && a.flyable ? "figures" : "info";
  const tab = [a.picked, opening].find((t): t is AirplaneTab => !!t && tabs.includes(t)) ?? tabs[0] ?? "info";
  return { tabs, tab };
}
