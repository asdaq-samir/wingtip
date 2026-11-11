import type { ReactNode } from "react";
import PlaceAge from "./PlaceAge";
import { Radio } from "lucide-react";
import { PillSection } from "../../../../components/Favorites";
import { FirstFew } from "../../../../components/FirstFew";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { ctafOf, frequencyOf, mhzText } from "../../../../lib/frequencies";
import { BADGE } from "../../../../lib/rowBadges";
import { feet } from "../../../../lib/format";
import { FrequencyRow } from "../FrequencyRow";
import { StopServices } from "../StopServices";
import { mapsLink } from "./mapsLink";
import { PlaceLights } from "./PlaceLights";
import { PlaceNotamsSection } from "./PlaceNotams";

/** The radio a pilot calls the field on, beside its airspace: the tower's
 *  where it has one, else the CTAF -- a UNICOM that is also the CTAF, or
 *  MULTICOM's 122.9 where none is listed (AC 90-66C 9.6, ctafOf). */
function radioOf(place: AirportPlace): string {
  // Every tower frequency the FAA lists, where a field splits its runways
  // between two (KPHX: 118.7 for 08/26, 120.9 for 07L/25R and 07R/25L):
  // the first alone read as the field's one tower, against the other in
  // Frequencies just above it (the owner's screenshot, 2026-10-29).
  const towers = place.towered
    ? [...new Set(place.frequencies.filter((f) => f.type === "TWR" && f.frequency_mhz != null).map((f) => mhzText(f.frequency_mhz!)))]
    : [];
  if (towers.length) return `Tower ${towers.join(", ")}`;
  const tower = place.towered ? frequencyOf(place.frequencies, "TWR") : null;
  if (tower?.frequency_mhz != null) return `Tower ${mhzText(tower.frequency_mhz)}`;
  const ctaf = ctafOf(place.frequencies);
  return `${ctaf.type === "MULTICOM" ? "MULTICOM" : "CTAF"} ${mhzText(ctaf.frequency_mhz!)}`;
}

/** A section of the Info tab, which has several: its title over its rows
 *  (PillSection), the title the way to its list in full where it has more. */
function CardSection({
  title,
  onMore,
  right,
  children,
  testId,
}: {
  title: string;
  onMore?: () => void;
  right?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="pt-5 first:pt-0">
      <PillSection title={title} onMore={onMore} right={right} testId={testId}>
        {children}
      </PillSection>
    </div>
  );
}

/**
 * An airport's card's Info tab (PlaceCard): its frequencies first, then
 * its details -- elevation, airspace and radio, fuel
 * and its remarks, the address -- its lights, and what it offers on the
 * ground.
 */
export function PlaceInfoTab({
  place,
  where,
}: {
  place: AirportPlace;
  /** Its town and state, for the address where the FAA lists none. */
  where: string | null;
}) {
  return (
    <>
      <PlaceAge ident={place.ident} kind="airports" />
      {/* Before the Details, at the owner's ask (2026-10-29: "move
          details after frequencies"). The first few, the title the
          way to every one, as every
          section's title is the way to its list in full (PillSection);
          how many of how many at its right. */}
      <div className="pt-5 first:pt-0">
        <FirstFew
          key={place.ident}
          title="Frequencies"
          testId="place-frequencies"
          rows={
            place.frequencies.length
              ? place.frequencies.map((f, i) => (
                  <FrequencyRow
                    key={`${f.type}-${f.frequency_mhz}-${i}`}
                    type={f.type}
                    description={f.description}
                    mhz={f.frequency_mhz}
                    testId="place-frequency"
                  />
                ))
              : [<ListRow key="none" title="None listed" />]
          }
          // What some fields read out on so many clicks of the mic on
          // the CTAF: the weather, a radio check (wingtip.remarks).
          after={place.radio_notes.map((note) => (
            <ListRow
              key={note}
              media={
                <RowBadge colour={BADGE.traffic}>
                  <Radio />
                </RowBadge>
              }
              title={note}
            />
          ))}
        />
      </div>

      {/* The field's own NOTAMs and the TFRs near it, the engine's order
          (PlaceNotams), after its radio, before its details. */}
      <PlaceNotamsSection ident={place.ident} />

      <CardSection title="Details" testId="place-details">
        <ListGroup>
          <ListRow
            title="Elevation"
            data-testid="place-elevation"
            value={<span className="font-semibold text-foreground">{feet(place.elevation_ft)}</span>}
          />
          {/* The class of the airspace it sits in (its airspace_class,
              from the FAA's NASR) and the radio a pilot calls it on. */}
          <ListRow
            title="Airspace"
            data-testid="place-airspace"
            value={
              <span className="font-semibold text-foreground">
                {[place.airspace_class && `Class ${place.airspace_class}`, radioOf(place)].filter(Boolean).join(" · ")}
              </span>
            }
          />
          {/* Where it is on the ground, in Maps: an action of the
              card's until the star took its place (A2). */}
          {/* The address written out, the way to it in Maps, at the
              owner's ask (2026-10-29: "write the address in
              details"); the town where the FAA lists none. */}
          <ListRow title="Address" description={place.address ?? where ?? undefined} href={mapsLink(place)} data-testid="place-address" />
        </ListGroup>
      </CardSection>
      {/* The field's lights, after the radio, as it is the mic that
          turns most of them on (PlaceLights). */}
      <PlaceLights place={place} />
      {/* What the field offers on the ground (StopServices), after
          the radio and the lights, at the owner's ask for food, fuel
          and rest stops: its fuel first in its On the field. */}
      <StopServices ident={place.ident} />
    </>
  );
}
