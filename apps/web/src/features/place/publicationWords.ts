import type { AirportPlace } from "../../lib/api/types";

/** A note in the Charts tab where the FAA could not give the card its
 *  plates or its Chart Supplement page (wingtip.publications.editions): an
 *  outage said where the list is empty, not read as a field with none; a
 *  kept earlier edition shown in its place named by its cycle. */
export interface PublicationNote {
  title: string;
  description?: string;
}

const WHAT = { plates: "Plates", supplement: "Chart Supplement" } as const;

/** The notes for the card's plates and supplement, none while both are of
 *  the editions in force (or from a planner older than the field). */
export function publicationNotes(place: { publications?: AirportPlace["publications"] | null }): PublicationNote[] {
  const notes: PublicationNote[] = [];
  for (const key of ["plates", "supplement"] as const) {
    const edition = place.publications?.[key];
    if (edition?.state === "unavailable") notes.push({ title: `${WHAT[key]} couldn't be fetched from the FAA` });
    if (edition?.state === "kept" && edition.edition)
      notes.push({
        title: `${WHAT[key]} from kept cycle ${edition.edition}`,
        description: "The cycle in force couldn't be fetched from the FAA",
      });
  }
  return notes;
}
