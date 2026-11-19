/**
 * The Brief's glance: each part of the flight in two or three figures, a
 * card each over its page, at the owner's pick of the redesign (D′,
 * 2026-10-22: "that new D looks fine for Brief") -- before you go (the
 * fuel to spare, the loading), the departure (its weather, the
 * runway, the takeoff over 50 ft, the frequency first called), en route
 * (the lowest ceiling and visibility forecast, the wind aloft) and the
 * arrival (as the departure, with the landing). Worked out where the
 * briefing works out the pages' own (FlightBriefingView, the instance
 * that publishes), and published here, as the Go / No-Go is (lib/verdict).
 */
import { create } from "zustand";
import { callEngine, type EngineAnswer } from "../../lib/engine/engine";
import type { Finding } from "../../lib/findings";
import type { VerdictItem } from "../../lib/verdict";

/** A field's: the departure's, or the destination's. */
export interface FieldGlance {
  ident: string;
  /** Its flight category for when the flight is there (the TAF's, or the
   *  nearest one's), else the METAR's; null where neither says. */
  category: string | null;
  /** When it leaves or lands, ISO. */
  at: string | null;
  /** The runway flown ("24"), its length, and the takeoff or landing over
   *  a 50 ft obstacle on it (features/brief/runwayCheck). */
  runway: string | null;
  runwayFt: number | null;
  overFiftyFt: number | null;
  /** The wind reported there, in words ("090°T 6 kt", "Calm"; features/plan/format's windText). */
  wind: string | null;
  /** The crosswind on that runway, the gusts' where more (features/brief/runwayCheck). */
  crosswindKt: number | null;
  /** Whether that crosswind is past the airplane's demonstrated one: a
   *  caution can be the runway's length past the POH's tables alone. */
  crosswindOver: boolean;
  /** The first station called or listened to there (features/plan/radio). */
  radio: { to: string; mhz: number } | null;
  finding: Finding;
}

export interface BriefGlance {
  before: {
    /** The least the tanks hold over the fuel and its reserve, gallons. */
    spareGal: number | null;
    /** Within its limits, or what is not. */
    balance: { within: boolean; problem: string | null } | null;
    finding: Finding;
  };
  depart: FieldGlance | null;
  enroute: {
    /** The lowest ceiling and visibility forecast along the route. */
    ceilingFt: number | null;
    visibilitySm: number | null;
    /** The first stretch's wind aloft, in words ("350°T 8 kt"). */
    wind: string | null;
    eteMin: number | null;
    /** Its finding, in a line (the weather's on the Go / No-Go). */
    line: string | null;
    finding: Finding;
  };
  arrive: FieldGlance | null;
  /** The reports the briefing holds as sent, for a finding's sources: the
   *  METARs and TAFs at the fields, and the TFRs by their NOTAM. */
  raw: { metars: { ident: string; raw: string }[]; tafs: { ident: string; raw: string }[]; tfrs: string[] };
}

export const useGlance = create<{ glance: BriefGlance | null; set: (glance: BriefGlance | null) => void }>((set) => ({
  glance: null,
  set: (glance) => set({ glance }),
}));

/** A line of the Brief as it opens, as the engine words it
 *  (gonogo_glance_lines): the finding with what to do about it in one
 *  sentence (`line`), the finding alone (`lead`) and what to do (`action`)
 *  for the one-row lines (the owner, 2026-11-16: "How do we make brief
 *  less cluttered?"), why it matters with the rule it rests on, and the
 *  reports it was read from as sent. */
export type GlanceLine = Omit<EngineAnswer<"gonogo_glance_lines">["act"][number], "key" | "finding" | "tab"> & {
  key: VerdictItem["key"];
  finding: Finding;
  tab: VerdictItem["tab"];
};

interface GlanceLines {
  /** The lines a pilot acts on, the stops before the cautions, at most three. */
  act: GlanceLine[];
  /** The rest, folded into one row. */
  rest: { line: string; finding: Finding; items: VerdictItem[] };
}

/**
 * The Brief's lines as it opens (the owner's rule, 2026-11-03: a pilot
 * "doesn't want to spend too much time in studying the briefs"): the
 * engine's gonogo_glance_lines, which words each finding that stops the
 * flight or wants a look, the stops first, and folds the rest into one
 * row. The glance gives it the fields' crosswinds and the reports as sent.
 */
export function glanceLines(items: VerdictItem[], glance: BriefGlance | null): GlanceLines {
  const fields = [glance?.depart, glance?.arrive].flatMap((f) =>
    f ? [{ ident: f.ident, runway: f.runway, crosswind_kt: f.crosswindKt, crosswind_over: f.crosswindOver, finding: f.finding }] : [],
  );
  const raw = glance
    ? { metars: glance.raw.metars.map((m) => m.raw), tafs: glance.raw.tafs.map((t) => t.raw), tfrs: glance.raw.tfrs }
    : null;
  return callEngine("gonogo_glance_lines", { items: items.map((i) => ({ ...i, section: i.section ?? null })), fields, raw }) as GlanceLines;
}
