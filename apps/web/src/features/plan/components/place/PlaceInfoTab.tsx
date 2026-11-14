import type { ReactNode } from "react";
import PlaceAge from "./PlaceAge";
import { Radio } from "lucide-react";
import { PillSection } from "../../../../components/Favorites";
import { FirstFew } from "../../../../components/FirstFew";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import { RowBadge } from "../../../../components/RowBadge";
import type { AirportPlace } from "../../../../lib/api/types";
import { BADGE } from "../../../../lib/rowBadges";
import { feet } from "../../../../lib/format";
import { callEngine } from "../../../../lib/engine/engine";
import { inUseOrder } from "../../../../lib/frequencies";
import { FrequencyRow } from "../FrequencyRow";
import { StopServices } from "../StopServices";
import { mapsLink } from "./mapsLink";
import { PlaceLights } from "./PlaceLights";
import { PlaceNotamsSection } from "./PlaceNotams";
import { NotamBadge, NotamSheet } from "./NotamBadge";
import { useNotamMarks, useNotamSheet } from "./notamBadges";

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
 * NOTAMs, its lights, and what it offers on the ground. A frequency, a
 * light or the fuel a NOTAM addresses has its badge by its name, and a tap
 * opens that NOTAM over the card (notamBadges).
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
  const marks = useNotamMarks(place.ident, place);
  const sheet = useNotamSheet();
  const fuel = marks.fuel;
  // How far its figures are to be trusted ("Owner-reported, last updated
  // Aug 2023": NASR's 5010 mailout, never inspected), and what its empty
  // NOTAM list says where NASR gives it no NOTAM_ID, a private field
  // outside the NOTAM system: each the engine's words (airport_data_words,
  // airport_notams_none), as every app's card says them.
  const data = callEngine("airport_data_words", { data_source: place.data_source ?? null, info_date: place.info_date ?? null });
  const noNotams = callEngine("airport_notams_none", {
    private: place.private,
    military: place.military ?? null,
    notam_id: place.notam_id ?? null,
  });
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
          {data && <ListRow muted title={data} data-testid="place-data-source" />}
        </ListGroup>
      </CardSection>
      {/* The first few frequencies, in the order they are dialled (the
          engine's, lib/frequencies inUseOrder), the title the way to every one, as
          every section's title is the way to its list in full
          (PillSection); how many of how many at its right. */}
      <div className="pt-5 first:pt-0">
        <FirstFew
          key={place.ident}
          title="Frequencies"
          testId="place-frequencies"
          rows={
            place.frequencies.length
              ? inUseOrder(place.frequencies).map((i) => {
                  const f = place.frequencies[i]!;
                  const mark = marks.frequency.get(i);
                  return (
                    <FrequencyRow
                      key={`${f.type}-${f.frequency_mhz}-${i}`}
                      type={f.type}
                      description={f.description}
                      mhz={f.frequency_mhz}
                      testId="place-frequency"
                      notam={mark && <NotamBadge mark={mark} kind="frequency" onOpen={() => sheet.show(mark)} />}
                    />
                  );
                })
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
      <PlaceNotamsSection ident={place.ident} none={noNotams} />

      {/* The field's lights, after the radio, as it is the mic that
          turns most of them on (PlaceLights). */}
      <PlaceLights place={place} notams={marks.light} onNotam={sheet.show} />
      {/* What the field offers on the ground (StopServices), after
          the radio and the lights, at the owner's ask for food, fuel
          and rest stops: its fuel first in its On the field. */}
      <StopServices
        ident={place.ident}
        fuelNotam={fuel && { badge: <NotamBadge mark={fuel} kind="fuel" />, onClick: () => sheet.show(fuel) }}
      />
      {sheet.shown && <NotamSheet notams={sheet.shown} ident={place.ident} onClose={sheet.close} />}
    </>
  );
}
