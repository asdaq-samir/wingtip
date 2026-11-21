import { WORDING } from "./wording/generated/wording";
/**
 * What the app's abbreviations and figures mean, one plain sentence each,
 * for a pilot who does not know them yet (the FPL redesign, the owner
 * 2026-11-17: "easier for every pilot, new and experienced"): shown on a
 * tap on the abbreviation where it is read (components/Explain), never as
 * a label beside it, so an experienced pilot's screen is as it was.
 *
 * Words, not rules: no figure here is worked out or judged, and each
 * names where it comes from, in its `source` (shown under the sentence)
 * and in the comment above it. Every one is the FAA's own meaning; where
 * the app writes a thing its own way (FL for every cruise altitude, the
 * owner's pick, decision 0009) the sentence says so.
 */
export type Explained = {
  /** The abbreviation's whole name, the popover's title. */
  name: string;
  /** One plain sentence. */
  sentence: string;
  /** Where it comes from, as a pilot would look it up. */
  source: string;
};

/** The Pilot's Handbook of Aeronautical Knowledge, whose Navigation
 *  chapter defines the courses, headings and speeds of a nav log. */
const PHAK = "FAA-H-8083-25C, Navigation";

export const EXPLAINED = {
  // PHAK, Navigation: the true course measured from true north on the chart.
  TC: { name: WORDING.trueCourse, sentence: "The course drawn on the chart, measured from true north.", source: PHAK },
  // PHAK, Navigation: the true course corrected for magnetic variation.
  MC: {
    name: WORDING.magneticCourse,
    sentence: "The true course corrected for magnetic variation: the course over the ground as a magnetic compass reads it.",
    source: PHAK,
  },
  // PHAK, Navigation: the wind correction angle, applied to the true course.
  WCA: {
    name: "Wind Correction Angle",
    sentence: "How far to turn into the wind so the airplane tracks the course: plus to the right, minus to the left.",
    source: PHAK,
  },
  // PHAK, Navigation: true heading is true course plus the wind correction.
  TH: {
    name: WORDING.trueHeading,
    sentence: "The true course with the wind correction: where the nose points, from true north.",
    source: PHAK,
  },
  // PHAK, Navigation: magnetic heading is the true heading less (or plus) the variation.
  MH: {
    name: WORDING.magneticHeading,
    sentence: "The heading to fly by the magnetic compass: the magnetic course corrected for the wind.",
    source: PHAK,
  },
  // PHAK, Navigation: groundspeed, the true airspeed with the wind's effect.
  GS: {
    name: WORDING.groundSpeed,
    sentence: "The airplane's speed over the ground: its true airspeed with the wind's push or pull.",
    source: PHAK,
  },
  // PHAK, Navigation (and Flight Instruments): true airspeed, corrected for altitude and temperature.
  TAS: {
    name: WORDING.trueAirspeed,
    sentence: "The airplane's speed through the air, the indicated airspeed corrected for altitude and temperature.",
    source: PHAK,
  },
  // PHAK, Navigation: the time en route, distance over groundspeed.
  ETE: { name: "Estimated Time En Route", sentence: "How long the flight or leg takes: the distance over the groundspeed.", source: PHAK },
  // PHAK, Navigation: the departure time plus the time en route.
  ETA: {
    name: "Estimated Time of Arrival",
    sentence: "When the airplane gets there: the departure time plus the time en route.",
    source: PHAK,
  },
  // PHAK, Navigation: a cross-country's plan works the climb out to its top,
  // then the cruise.
  TOC: { name: WORDING.topOfClimb, sentence: "Where the climb ends and the cruise begins, at the altitude planned.", source: PHAK },
  // AC 90-66C 11.2-11.3: level at pattern altitude before entering the
  // pattern; the engine plans each descent to it (navlog_with_descents).
  TOD: {
    name: WORDING.topOfDescent,
    sentence: "Where to start down so the airplane is level at the pattern altitude, or the approach's, before it gets there.",
    source: "AC 90-66C",
  },
  // 14 CFR 1.1 "Flight level": three digits, hundreds of feet, on 29.92 inHg;
  // 14 CFR 91.121(a): the standard setting at and above 18,000 ft MSL. The
  // app's FL-045 for any cruise altitude is the owner's (decision 0009).
  FL: {
    name: "Flight Level",
    sentence:
      "An altitude in hundreds of feet, as the app writes every cruise altitude (FL-045 is 4,500 feet on the local altimeter setting), where the FAA's own flight levels, from 18,000 feet up, are read on the standard setting, 29.92.",
    source: "14 CFR 1.1, 91.121",
  },
  // 14 CFR 91.159(a): more than 3,000 ft above the surface, below 18,000 ft
  // MSL, by magnetic course: 0-179 odd thousands + 500, 180-359 even + 500.
  VFR: {
    name: "VFR Cruising Altitudes",
    sentence:
      "More than 3,000 feet over the ground, a VFR flight cruises at odd thousands plus 500 feet flying east (magnetic course 0 to 179) and even thousands plus 500 flying west.",
    source: "14 CFR 91.159",
  },
  // 14 CFR 91.179: in controlled airspace the altitude ATC assigns; in
  // uncontrolled airspace below 18,000 ft MSL, by magnetic course: 0-179 odd
  // thousands, 180-359 even thousands.
  IFR: {
    name: "IFR Cruising Altitudes",
    sentence:
      "The altitude ATC assigns; where none is assigned, below 18,000 feet, odd thousands flying east (magnetic course 0 to 179) and even thousands flying west.",
    source: "14 CFR 91.179",
  },
  // 14 CFR 91.151 (VFR) and 91.167 (IFR): fuel to the destination (and the
  // alternate, IFR) plus a reserve; the figures are the engine's.
  "Fuel req": {
    name: WORDING.fuelRequired,
    sentence: "The fuel the flight needs by the airplane's figures, start to landing, plus the reserve the rules ask for.",
    source: "14 CFR 91.151, 91.167",
  },
} as const satisfies Record<string, Explained>;

export type ExplainedTerm = keyof typeof EXPLAINED;
