/**
 * How the ATC copilot's card writes a call's items (the figures are the
 * engine's, atc_call; the words are this app's): "Descend 3,000 ft",
 * "Left heading 270", "Hold NE of GOPHER, 045 radial, left turns, EFC
 * 1430Z". Altitudes as ATC says them (lib/readback's altitudeWords, AIM
 * 4-2-9), headings in three figures (AIM 4-2-10), times in UTC with a Z
 * (AIM 4-2-12).
 */
import { altitudeWords } from "../../lib/readback";
import type { AtcItem } from "./atcEngine";
import { threeFigures } from "../../lib/format";

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
/** A place as said: spelled idents as they are, words in capitals as a
 *  chart names a fix. */
const place = (said: string) => said.toUpperCase();

/** The eight points a hold is said from, as a chart abbreviates them. */
const POINTS: Record<string, string> = {
  north: "N",
  northeast: "NE",
  east: "E",
  southeast: "SE",
  south: "S",
  southwest: "SW",
  west: "W",
  northwest: "NW",
};

/** One item in words, as the card's row and the line write it. */
export function itemWords(item: AtcItem): string {
  switch (item.kind) {
    case "altitude":
      return `${capital(item.verb)}${item.limit ? ` ${item.limit}` : ""} ${altitudeWords(item.ft)}`;
    case "expect":
      return `Expect ${altitudeWords(item.ft)}${item.min != null ? ` ${item.min} min after departure` : ""}`;
    case "heading":
      if (item.by_deg != null) return `Turn ${item.turn ?? ""} ${item.by_deg}°`.replace("  ", " ");
      if (item.deg == null) return "Runway heading";
      return `${item.turn ? `${capital(item.turn)} heading` : "Heading"} ${threeFigures(item.deg)}`;
    case "direct":
      return `Direct ${place(item.said)}`;
    case "route": {
      const via = item.places.map(place).join(", ");
      const limit = item.limit ? `Cleared to ${capital(item.limit)}` : "Cleared";
      return `${limit}${via ? ` via ${via}` : ""}${item.as_filed ? ", then as filed" : ""}`;
    }
    case "class_b":
      return "Cleared into Class B";
    case "hold": {
      if (item.published) return `Hold at ${place(item.fix)} as published${item.efc ? `, EFC ${item.efc}Z` : ""}`;
      const parts = [`Hold${item.direction ? ` ${POINTS[item.direction] ?? item.direction}` : ""} of ${place(item.fix)}`];
      if (item.on && item.on_deg != null) parts.push(`${threeFigures(item.on_deg)} ${item.on}`);
      if (item.turns) parts.push(`${item.turns} turns`);
      if (item.efc) parts.push(`EFC ${item.efc}Z`);
      return parts.join(", ");
    }
    case "frequency":
      return `${item.facility ? `${capital(item.facility)} ` : "Contact "}${item.mhz}`;
    case "squawk":
      return `Squawk ${item.code}`;
    case "altimeter":
      return `Altimeter ${item.inhg}`;
    case "approach":
      return `${item.cleared ? "Cleared" : "Expect"} ${item.name}${item.runway ? ` ${item.runway}` : ""} approach`;
    case "runway": {
      const what = {
        land: "cleared to land",
        takeoff: "cleared for takeoff",
        option: "cleared for the option",
        "hold short": "hold short",
        "line up and wait": "line up and wait",
      } as const;
      if (item.what === "hold short") return `Hold short runway ${item.runway}`;
      return `Runway ${item.runway}${item.what ? `, ${what[item.what]}` : ""}`;
    }
  }
}

/** The call's one line for the copilot's banner: its items, a middle dot
 *  between, or what was said where nothing was read. */
export function callLine(items: AtcItem[], text: string): string {
  return items.length ? items.map(itemWords).join(" · ") : text;
}

/** What a tap can do with an item, by what the app has: fly the
 *  altitude (the plan's), fly direct, keep the next frequency or the code
 *  in sight, or enter a clearance's route. Null where nothing. */
export type ItemAction = "fly" | "direct" | "frequency" | "squawk" | "route";

export function actionOf(item: AtcItem): ItemAction | null {
  switch (item.kind) {
    case "altitude":
      return "fly";
    case "direct":
      return "direct";
    case "frequency":
      return "frequency";
    case "squawk":
      return "squawk";
    case "route":
      return "route";
    default:
      return null;
  }
}

/** The action's button, in Title Case (the app's labels). */
export const ACTION_LABEL: Record<ItemAction, string> = {
  fly: "Set Altitude",
  direct: "Direct To",
  frequency: "Set Next",
  squawk: "Set Code",
  route: "Enter Route",
};
