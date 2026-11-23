/**
 * Whether the app offers filing a flight plan: off until filing works
 * (the owner, 2026-11-22: "For now hide the file button as we don't
 * support it"). Filing goes through Leidos Flight Service, whose
 * agreement is not in place yet. Off, FPL has no File button beside its
 * tab bar and the Brief no Flight Plan form; the code for both stays, to
 * come back by this one switch the day filing does.
 */
export const FILING_OFFERED = false;
