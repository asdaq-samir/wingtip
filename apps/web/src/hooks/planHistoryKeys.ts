import { PLAN_KEYS } from "../lib/address";

/** The airplane flown, in the plan's history under this key as its JSON
 *  (it is the preferences', never the address's). */
export const AIRPLANE_KEY = "airplane";

/** The address's keys the history keeps: the plan's, and the departure
 *  time, which is the page's own key but a pilot's edit on FPL. */
export const ADDRESS_HISTORY_KEYS = [...PLAN_KEYS, "depart"] as const;

/** Everything the history keeps: the address's and the airplane. */
export const HISTORY_KEYS: readonly string[] = [...ADDRESS_HISTORY_KEYS, AIRPLANE_KEY];
