import { dayMonthYear } from "../../lib/format";

/** An ISO date of the FAA's or the NTSB's as the app writes every day: "31 Jan 2033". */
export const day = (iso: string | null | undefined) => (iso ? dayMonthYear(new Date(`${iso}T00:00:00`)) : null);
