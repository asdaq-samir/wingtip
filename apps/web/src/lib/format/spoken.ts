/**
 * Figures as a screen reader says them: the words VoiceOver, TalkBack or
 * a desktop reader is given (an aria-label or sr-only text) for a figure
 * written "4,500 ft" or "346°", which a reader would otherwise say as
 * "four comma five hundred f t" or "three hundred forty-six degree sign".
 * Each form is a row of the shared table (lib/fixtures/formats.json, the
 * spoken- forms of design/tokens.json's `format`), which the phones'
 * Format+Spoken.swift and Spoken.kt are held to as well, so a figure is
 * said the same on every app.
 *
 * Altitudes and directions are said as a pilot hears them from ATC (AIM
 * 4-2-9a, the thousands' digits one by one; AIM 4-2-10, a direction's
 * three digits and "true" where it is not magnetic). A reader is not a
 * radio, so nine is "nine", not the radio's "niner" (AIM 4-2-8). The
 * number words are written here rather than by Intl, which has no
 * spelled-out style.
 */
import { utcFigures } from "./time";

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** What is said for a figure not known, which is not zero. */
export const NOT_KNOWN = "not known";

/** A whole number from 0 to 999 in words: "one hundred two", "forty-five". */
function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100),
    rest = n % 100;
  const restWords = rest < 20 ? ONES[rest]! : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
  if (!hundreds) return restWords;
  return rest ? `${ONES[hundreds]} hundred ${restWords}` : `${ONES[hundreds]} hundred`;
}

/** A whole number in words, "minus" before a negative one: "twelve
 *  thousand five hundred", "one million two hundred thousand". */
function numberWords(n: number): string {
  const whole = Math.round(Math.abs(n));
  if (whole === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000),
    thousands = Math.floor(whole / 1000) % 1000,
    rest = whole % 1000;
  if (millions) parts.push(`${numberWords(millions)} million`);
  if (thousands) parts.push(`${underThousand(thousands)} thousand`);
  if (rest) parts.push(underThousand(rest));
  return `${n < 0 ? "minus " : ""}${parts.join(" ")}`;
}

/** A figure to a tenth in words, with no "point zero" for a whole one:
 *  "one hundred two point four", "twenty-four". Halves away from zero, as
 *  the written form's toFixed reads to a pilot. */
function tenthsWords(x: number): string {
  const tenths = Math.round(Math.abs(x) * 10);
  const whole = Math.floor(tenths / 10),
    tenth = tenths % 10;
  const sign = x < 0 && tenths > 0 ? "minus " : "";
  return `${sign}${numberWords(whole)}${tenth ? ` point ${ONES[tenth]}` : ""}`;
}

/** Each figure said by itself: "one two", "zero four five". */
function digits(s: string): string {
  return [...s].map((d) => ONES[Number(d)]).join(" ");
}

/** "one knot", "two knots". */
const unit = (words: string, one: string, many: string) => `${words} ${words === "one" ? one : many}`;

/**
 * An altitude said: the thousands' digits one by one and "thousand", then
 * the hundreds (AIM 4-2-9a: 12,500 is "one two thousand five hundred");
 * what is left under a hundred in words, as an elevation of 1,234 ft has.
 */
export function spokenAltitude(ft: number | null | undefined): string {
  if (ft === null || ft === undefined || !Number.isFinite(ft)) return NOT_KNOWN;
  const whole = Math.round(Math.abs(ft));
  if (whole === 0) return "zero feet";
  const thousands = Math.floor(whole / 1000),
    hundreds = Math.floor(whole / 100) % 10,
    rest = whole % 100;
  const parts: string[] = [];
  if (thousands) parts.push(`${digits(String(thousands))} thousand`);
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(underThousand(rest));
  return `${ft < 0 ? "minus " : ""}${parts.join(" ")} feet`;
}

/** A direction's three figures said one by one, north as three six zero
 *  as it is written (FAA Order JO 7110.65, 2-4-17; AIM 4-2-10). */
export function spokenHeading(deg: number): string {
  if (!Number.isFinite(deg)) return NOT_KNOWN;
  const whole = ((Math.round(deg) % 360) + 360) % 360;
  return `${digits(String(whole === 0 ? 360 : whole).padStart(3, "0"))} degrees`;
}

/** A magnetic course or heading, with its reference: the nav log's. */
export function spokenHeadingMagnetic(deg: number): string {
  return Number.isFinite(deg) ? `${spokenHeading(deg)} magnetic` : NOT_KNOWN;
}

/** A true course or heading, "true" said as AIM 4-2-10 asks. */
export function spokenHeadingTrue(deg: number): string {
  return Number.isFinite(deg) ? `${spokenHeading(deg)} true` : NOT_KNOWN;
}

/** A distance to the written tenth: "one hundred two point four nautical miles". */
export function spokenDistance(nm: number | null | undefined): string {
  if (nm === null || nm === undefined || !Number.isFinite(nm)) return NOT_KNOWN;
  return unit(tenthsWords(nm), "nautical mile", "nautical miles");
}

/** A speed in whole knots, as written: "one hundred ten knots". */
export function spokenSpeed(kt: number | null | undefined): string {
  if (kt === null || kt === undefined || !Number.isFinite(kt)) return NOT_KNOWN;
  return unit(numberWords(kt), "knot", "knots");
}

/** Fuel to the written tenth: "thirty-two point three gallons". */
export function spokenFuel(gal: number | null | undefined): string {
  if (gal === null || gal === undefined || !Number.isFinite(gal)) return NOT_KNOWN;
  return unit(tenthsWords(gal), "gallon", "gallons");
}

/** A time in minutes, rounded as written: "one hour five minutes". */
export function spokenDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return NOT_KNOWN;
  const whole = Math.max(0, Math.round(minutes));
  const h = Math.floor(whole / 60),
    m = whole % 60;
  const hours = h ? unit(numberWords(h), "hour", "hours") : "";
  const mins = m || !h ? unit(numberWords(m), "minute", "minutes") : "";
  return [hours, mins].filter(Boolean).join(" ");
}

/** A UTC time digit by digit and "zulu" (AIM 4-2-13): "one four three two zulu". */
export function spokenZulu(at: Date): string {
  return `${digits(utcFigures(at))} zulu`;
}
