import { useRef, useState, type ComponentProps } from "react";
import type { AirportPlace } from "../../lib/api/types";
import { prefersReducedMotion } from "../../lib/motion";
import { useMinuteClock } from "../../lib/useMinuteClock";
import { AirspaceHours } from "./AirspaceHours";
import { surfaceHoursAt } from "./surfaceHoursWords";
import { PlaceFacts } from "./PlaceFacts";
import { PlaceInfoTab } from "./PlaceInfoTab";
import { PlacePictures } from "./PlacePictures";

/**
 * The airport card's Info tab, its page alone starting with the facts and
 * the pictures (the owner, 2026-11-14: "Info tab should start from the
 * info strip and images and the rest. Switching tabs should not show
 * those"): the facts (PlaceFacts), the pictures, then the rest
 * (PlaceInfoTab), a part-time surface area's hours (AirspaceHours) after
 * its frequencies. The
 * Airspace fact tapped scrolls to the hours and opens the week, as Apple
 * Maps' Hours fact does. The hours are read at the field's own clock each
 * minute, by this page's own clock, so the minute draws the page and not
 * the whole card, and stops while it is out of
 * sight (lib/shown).
 */
export function PlaceInfoPage({
  place,
  where,
  facts,
  pictures,
}: {
  place: AirportPlace;
  /** Its town and state, for the address where the FAA lists none. */
  where: string | null;
  facts: Omit<ComponentProps<typeof PlaceFacts>, "place" | "hours" | "onAirspace">;
  pictures: Omit<ComponentProps<typeof PlacePictures>, "place">;
}) {
  const hours = surfaceHoursAt(place, useMinuteClock());
  const [open, setOpen] = useState(false);
  const section = useRef<HTMLDivElement>(null);
  const showHours = () => {
    setOpen(true);
    requestAnimationFrame(() => section.current?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" }));
  };
  const surface = place.surface_airspace;
  return (
    <>
      <PlaceFacts place={place} hours={hours} onAirspace={showHours} {...facts} />
      <PlacePictures place={place} {...pictures} />
      <PlaceInfoTab
        place={place}
        where={where}
        hours={
          surface?.part_time ? (
            <AirspaceHours
              surface={surface}
              hours={hours}
              line={place.airspace_hours ?? null}
              open={open}
              onOpenChange={setOpen}
              sectionRef={section}
            />
          ) : null
        }
      />
    </>
  );
}
