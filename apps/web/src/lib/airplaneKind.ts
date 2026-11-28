import type { Aircraft, AirplaneKind, Currency } from "./api/types";

/**
 * An airplane's category, class and gear: what passenger currency is judged
 * by (14 CFR 61.57(a)(1)(ii): landings "in an aircraft of the same
 * category, class, and type", and "if the aircraft to be flown is an
 * airplane with a tailwheel", to a full stop in one). The words are 14 CFR
 * 61.5(b)'s own, as the gateway keeps them and the engine reads them
 * (checked on Cornell LII, 2026-11-27): the category (b)(1)(i), the
 * airplane classes (b)(2)(i)-(iv). The engine compares them without case.
 */
export const AIRPLANE = "Airplane";
const AIRPLANE_CLASSES = ["Single-engine land", "Multiengine land", "Single-engine sea", "Multiengine sea"] as const;

/** A kind's pull-downs' "not said" (the gateway's none), and each one's
 *  choices: every app's form offers the same. */
export const NOT_SAID = "none";
const NOT_SAID_CHOICE = { value: NOT_SAID, label: "Not Said" };
export const KIND_CHOICES = {
  category: [NOT_SAID_CHOICE, { value: AIRPLANE, label: AIRPLANE }],
  aircraftClass: [NOT_SAID_CHOICE, ...AIRPLANE_CLASSES.map((c) => ({ value: c, label: c }))],
  gear: [NOT_SAID_CHOICE, { value: "tricycle", label: "Tricycle" }, { value: "tailwheel", label: "Tailwheel" }],
};

/** The airplane to be flown, as the currency endpoint is asked for it:
 *  its category and class both said, its gear null where not (judged as a
 *  tailwheel, the stricter, by the engine). */
export interface Flying {
  category: string;
  aircraftClass: string;
  tailwheel: boolean | null;
}

/** A saved airplane's kind as the airplane to be flown, or null where it
 *  doesn't say both its category and class (the newest flight's is then
 *  judged). */
export function flyingOf(kind: AirplaneKind | null | undefined): Flying | null {
  if (!kind?.category || !kind.aircraftClass) return null;
  return { category: kind.category, aircraftClass: kind.aircraftClass, tailwheel: kind.tailwheel ?? null };
}

/** Whether a kind says anything at all. */
export const saysKind = (kind: AirplaneKind | null | undefined): kind is AirplaneKind =>
  !!kind && (!!kind.category || !!kind.aircraftClass || kind.tailwheel != null);

/** The saved airplane a logbook entry's Airplane box names, by its tail
 *  number however it is typed ("n123ab " is N123AB), where its profile
 *  says its kind; else null. */
export function savedKindOf(
  airplanes: Aircraft[] | undefined,
  typed: string | null | undefined,
): { tail: string; kind: AirplaneKind } | null {
  const tail = typed?.trim().toUpperCase();
  if (!tail) return null;
  const found = airplanes?.find((a) => a.tailNumber.trim().toUpperCase() === tail);
  return found && saysKind(found.kind) ? { tail: found.tailNumber, kind: found.kind } : null;
}

/** "Single-engine land, tailwheel": a kind in words, for a row's note; ""
 *  where nothing is said. */
export function kindWords(kind: AirplaneKind | null | undefined): string {
  if (!kind) return "";
  const gear = kind.tailwheel == null ? null : kind.tailwheel ? "tailwheel" : "tricycle";
  return [kind.aircraftClass ?? kind.category, gear].filter(Boolean).join(", ");
}

/** "single-engine land, tailwheel": the airplane passenger currency was
 *  judged for, from the engine's "airplane/single-engine land" and its
 *  gear (null: not said, judged as a tailwheel). */
export function judgedWords(c: Pick<Currency, "passengerClass" | "passengerTailwheel">): string | null {
  if (!c.passengerClass) return null;
  const cls = c.passengerClass.split("/").at(-1) ?? c.passengerClass;
  const gear = c.passengerTailwheel === false ? "tricycle" : c.passengerTailwheel ? "tailwheel" : "gear not said, judged as a tailwheel";
  return `${cls}, ${gear}`;
}
