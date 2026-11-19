import type { AircraftChoice, AircraftProfileSummary, HandbookFigures } from "../api/types";
import { FIGURE_FIELDS, type FigureKey } from "./figureFields";
import { callEngine, type EngineAnswer, type EngineInput } from "../engine/engine";

/**
 * An airplane's figures and where each comes from, and what a figure on a
 * screen lacks: the shared engine's airplane_figures and airplane_needs
 * (engine/crates/pilot/src/aircraft/figures.rs), asked by the same names
 * as the iPhone and Android ask them. Nothing assumes a Cessna 172 (the
 * owner, 2026-11-09): a figure none of the type's book, its photographed
 * handbook page or its pilot has is missing, and the app asks for it where
 * it is needed (components/airplane/AskFigure).
 */

/** A pilot's own airplane of no stock type, as the planner plans it: on
 *  the figures its record gives alone (the planner's OWN_AIRPLANE,
 *  wingtip.planning). */
export const OWN_AIRPLANE = "own";

export { FIGURE_FIELDS, type FigureKey, type OwnFigureValues } from "./figureFields";
export type AirplaneFigures = EngineAnswer<"airplane_figures">;
export type AirplaneFigure = AirplaneFigures["figures"][number];
/** What a screen shows of an airplane: the engine's airplane_needs' names. */
export type NeedsFigure = EngineInput<"airplane_needs">["figure"];

const FIGURE_KEYS = Object.keys(FIGURE_FIELDS) as FigureKey[];

export const isFigureKey = (key: string): key is FigureKey => key in FIGURE_FIELDS;

/** The pilot's own figures of a choice, by the engine's names. */
export function ownOf(choice: AircraftChoice): Partial<Record<FigureKey, number>> {
  const own: Partial<Record<FigureKey, number>> = {};
  for (const key of FIGURE_KEYS) {
    const value = choice[FIGURE_FIELDS[key]];
    if (value != null) own[key] = value;
  }
  return own;
}

/** The type's book figures: its stock profile, where the planner has one. */
export function bookOf(profile: string, profiles: AircraftProfileSummary[] | undefined): AircraftProfileSummary | null {
  return (profile && profiles?.find((p) => p.name === profile)) || null;
}

/** A record's confirmed handbook page in the engine's shape (its
 *  handbook_figures': each figure a `value`): the usable fuel, the one the
 *  record's page and the engine's both carry by name. */
export function handbookOf(handbook: HandbookFigures | null | undefined): Record<string, { value: number }> | null {
  if (handbook?.usable_fuel_gal == null) return null;
  return { usableFuelGal: { value: handbook.usable_fuel_gal } };
}

/** Every figure of the airplane with its source, and the profile every
 *  other rule takes (null with no airplane). */
export function airplaneFigures(
  book: AircraftProfileSummary | null,
  handbook: Record<string, { value: number }> | null,
  own: Partial<Record<FigureKey, number>> | null,
): AirplaneFigures {
  return callEngine("airplane_figures", { book, handbook, own: own && Object.keys(own).length ? own : null });
}

/** The figures of the airplane picked; no airplane, none. */
export function figuresOfChoice(choice: AircraftChoice, profiles: AircraftProfileSummary[] | undefined): AirplaneFigures {
  if (choice.none) return airplaneFigures(null, null, null);
  return airplaneFigures(bookOf(choice.profile, profiles), null, ownOf(choice));
}

/** One figure's value; null where the airplane has none. */
export function figureValue(figures: AirplaneFigures, key: FigureKey): number | null {
  return figures.figures.find((f) => f.key === key)?.value ?? null;
}

/** The inputs `figure` needs that `profile` lacks: figure keys, tables
 *  (loading, takeoff, landing), or ["airplane"] with none. */
export function needsOf(profile: object | null | undefined, figure: NeedsFigure): string[] {
  return callEngine("airplane_needs", { profile: profile ?? null, figure }).missing;
}
