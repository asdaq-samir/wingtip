import { pointName } from "../../lib/identSchema";

/**
 * The points FPL's timeline lists, in order, `null` where the stops'
 * one row is (the owner, 2026-11-18: "let's just show the stops as
 * another row in between. And when the card is full, no need to show that
 * because it expands to show all the stops"). Below full, two stops or
 * more are one row between the ends; one stop is its own row, as a
 * "1 Stop" row would take the same room as the stop. `all`: every stop
 * listed -- the sheet at full, the route read in flight or a dry run, a
 * stop's line open, a stop that cannot be flown to (its why always in
 * sight, decision 0043).
 */
export function listedPoints<P>(points: P[], all: boolean): (P | null)[] {
  if (all || points.length < 4) return points;
  return [points[0]!, null, points.at(-1)!];
}

/** The stops' row's words: "2 Stops", Title Case as a label (decision 0021). */
export function stopsTitle(count: number): string {
  return `${count} ${count === 1 ? "Stop" : "Stops"}`;
}

/** The stops' idents as the row lists them, and its name to a screen
 *  reader: "2 stops: KMSP, KEAU. Show all". */
export function stopsNames(idents: string[]): { line: string; label: string } {
  const line = idents.map(pointName).join(", ");
  return { line, label: `${stopsTitle(idents.length).toLowerCase()}: ${line}. Show all` };
}
