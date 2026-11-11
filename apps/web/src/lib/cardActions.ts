import { ICON } from "./icons";

/**
 * Each kind of card's actions, in order, with one name and one glyph per
 * action across every card and app (docs/design/icons.md): the UI audit
 * (2026-11-09) found the same action named two ways and each app with
 * its own set. The first of a card's actions is its filled one.
 *
 * - Fly Here: a new route from the airplane to this field.
 * - Direct To: from the airplane to the point, then on along the route.
 * - Add Stop: the field a landing on the way (stops=), as Maps' Add
 *   Stop (the one-search design's name for it, 2026-11-09).
 * - Add to Route: the point a turn on the way, where it bends the route
 *   least; not a landing.
 * - Hold Here: a hold at the point (AIM 5-3-8).
 */
export const ACTION = {
  flyHere: { label: "Fly Here", icon: ICON.flyHere },
  directTo: { label: "Direct To", icon: ICON.directTo },
  addStop: { label: "Add Stop", icon: ICON.addToRoute },
  addToRoute: { label: "Add to Route", icon: ICON.addToRoute },
  holdHere: { label: "Hold Here", icon: ICON.holdHere },
  call: { label: "Call", icon: ICON.call },
  address: { label: "Address", icon: ICON.address },
  copy: { label: "Copy", icon: ICON.copy },
} as const;

type ActionName = keyof typeof ACTION;

/** The actions each card kind offers, in order. */
export const CARD_ACTIONS = {
  airport: ["flyHere", "addStop", "call", "address"],
  /** A point held on the map: the airspace card's. */
  point: ["directTo", "addToRoute", "holdHere"],
  /** A VOR, a fix or a VFR waypoint. */
  navaid: ["directTo", "addToRoute", "copy"],
} as const satisfies Record<string, readonly ActionName[]>;
