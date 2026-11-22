/**
 * The scratchpad's pages, ForeFlight's templates (its Scratchpads, 12.9;
 * the market-gap report's item 5, 2026-11-21): a blank page to write on,
 * and pages with the boxes a pilot copies into -- a clearance in CRAFT's
 * order, an ATIS, the takeoff and landing figures. Words only: what a box
 * is called, never a figure; the pilot writes what they were told or
 * worked out, by hand or typed (Safari's Scribble turns an Apple Pencil's
 * writing in a box to text), and ink goes anywhere on the page under them.
 */

export type TemplateId = "blank" | "craft" | "atis" | "takeoff-landing";

export interface Field {
  key: string;
  label: string;
  /** What a box takes, as the keyboard should offer it. */
  input?: "text" | "numeric";
}

export interface Template {
  id: TemplateId;
  title: string;
  fields: readonly Field[];
}

export const TEMPLATES: readonly Template[] = [
  { id: "blank", title: "Blank", fields: [] },
  {
    // A clearance as it is copied: Clearance limit, Route, Altitude,
    // Frequency, Transponder (CRAFT), the items AIM 4-4-3 says an ATC
    // clearance normally holds -- its limit, route, altitude, and the
    // departure frequency and beacon code.
    id: "craft",
    title: "Clearance (CRAFT)",
    fields: [
      { key: "clearance", label: "Clearance limit" },
      { key: "route", label: "Route" },
      { key: "altitude", label: "Altitude" },
      { key: "frequency", label: "Frequency", input: "numeric" },
      { key: "transponder", label: "Transponder", input: "numeric" },
    ],
  },
  {
    id: "atis",
    title: "ATIS",
    fields: [
      { key: "information", label: "Information" },
      { key: "wind", label: "Wind" },
      { key: "altimeter", label: "Altimeter", input: "numeric" },
      { key: "runway", label: "Runway" },
      { key: "remarks", label: "Remarks" },
    ],
  },
  {
    id: "takeoff-landing",
    title: "Takeoff & Landing",
    fields: [
      { key: "runway", label: "Runway" },
      { key: "wind", label: "Wind" },
      { key: "altimeter", label: "Altimeter", input: "numeric" },
      { key: "temperature", label: "Temperature", input: "numeric" },
      { key: "takeoffRoll", label: "Takeoff ground roll", input: "numeric" },
      { key: "takeoffObstacle", label: "Takeoff over 50 ft", input: "numeric" },
      { key: "landingRoll", label: "Landing ground roll", input: "numeric" },
      { key: "landingObstacle", label: "Landing over 50 ft", input: "numeric" },
    ],
  },
];

export function templateOf(id: TemplateId): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}
