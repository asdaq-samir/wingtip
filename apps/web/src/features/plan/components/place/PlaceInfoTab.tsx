import type { ReactNode } from "react";
import PlaceAge from "./PlaceAge";
import { Lightbulb, Radio } from "lucide-react";
import { PillSection } from "../../../../components/Favorites";
import { FirstFew } from "../../../../components/FirstFew";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { feet } from "../../../../lib/format";
import { FrequencyRow } from "../FrequencyRow";
import { StopServices } from "../StopServices";
import { mapsLink } from "./mapsLink";
import { PlaceNotamsSection } from "./PlaceNotams";

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
 * An airport's card's Info tab (PlaceCard): its details first --
 * elevation, airspace, distance, the address -- then its frequencies, its
 * NOTAMs, its lights, and what it offers on the ground.
 */
export function PlaceInfoTab({
  place,
  where,
  distance,
}: {
  place: AirportPlace;
  /** Its town and state, for the address where the FAA lists none. */
  where: string | null;
  /** How far it is ("18 nm NE of C81"); null with nothing to measure from. */
  distance: string | null;
}) {
  return (
    <>
      <PlaceAge ident={place.ident} kind="airports" />
      {/* The Details first, then the radio (the owner, 2026-11-11:
          "move the details before frequency"). */}
      <CardSection title="Details" testId="place-details">
        <ListGroup>
          <ListRow
            title="Elevation"
            data-testid="place-elevation"
            value={<span className="font-semibold text-foreground">{feet(place.elevation_ft)}</span>}
          />
          {/* The class of the airspace it sits in (its airspace_class,
              from the FAA's NASR), the class alone: its radio is in
              Frequencies under it (the owner, 2026-11-11). */}
          {place.airspace_class && (
            <ListRow
              title="Airspace"
              data-testid="place-airspace"
              value={<span className="font-semibold text-foreground">Class {place.airspace_class}</span>}
            />
          )}
          {/* How far it is, from own ship's fix or else the route's
              departure (PlaceCard's distanceOf), moved here from the head
              (the owner, 2026-11-11: "Add distance to details"). */}
          {distance && (
            <ListRow
              title="Distance"
              data-testid="place-distance"
              value={<span className="font-semibold text-foreground">{distance}</span>}
            />
          )}
          {/* Where it is on the ground, in Maps: an action of the
              card's until the star took its place (A2). */}
          {/* The address written out, the way to it in Maps, at the
              owner's ask (2026-10-29: "write the address in
              details"); the town where the FAA lists none. */}
          <ListRow title="Address" description={place.address ?? where ?? undefined} href={mapsLink(place)} data-testid="place-address" />
        </ListGroup>
      </CardSection>
      {/* The first few frequencies, the title the way to every one, as
          every section's title is the way to its list in full
          (PillSection); how many of how many at its right. */}
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

      {place.lighting.length > 0 && (
        // The field's lights, from its Chart Supplement remarks: the
        // ones a pilot turns on from the cockpit by keying the mic, and
        // with no count of clicks of their own, the standard one --
        // after the radio, as it is the mic that turns them on.
        <div className="pt-5">
          <FirstFew
            key={place.ident}
            title="Lights"
            rows={place.lighting.map((note) => (
              <ListRow
                key={note}
                media={
                  <RowBadge colour={BADGE.lights}>
                    <Lightbulb />
                  </RowBadge>
                }
                title={note}
                data-testid="place-lighting"
              />
            ))}
            after={
              place.standard_keying && (
                // The standard keying (AIM 2-1-9): the mic keyed 7 times
                // within 5 seconds for high intensity, 5 for medium, 3 for
                // low -- a row, where it was a footnote.
                <ListRow
                  title="Keying"
                  value={<span className="text-foreground">7 high · 5 medium · 3 low</span>}
                  data-testid="place-keying"
                />
              )
            }
          />
        </div>
      )}
      {/* What the field offers on the ground (StopServices), after
          the radio and the lights, at the owner's ask for food, fuel
          and rest stops: its fuel first in its On the field. */}
      <StopServices ident={place.ident} />
    </>
  );
}
