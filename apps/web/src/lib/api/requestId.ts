/**
 * The id a call to the servers goes with (`X-Request-Id`): the gateway
 * writes it on the call's log lines and its trace (RequestIdFilter), and
 * passes it to the planner, so with tracing on a slow
 * or failed call is found in Jaeger by the id the page sent
 * (docs/LOCAL-DEV.md, "Tracing"). A new one each call.
 *
 * `crypto.randomUUID` is only there in a secure context: the phone's
 * http address on the Wi-Fi is not one, and gets a random token instead.
 */
export const REQUEST_ID_HEADER = "X-Request-Id";

/** The zone this device keeps (an IANA name), sent with every call so the
 *  gateway reads the pilot's currency and paperwork on the pilot's own
 *  day, not UTC's, which turns over in the U.S. evening (PilotDay). */
export const TIME_ZONE_HEADER = "X-Time-Zone";

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
