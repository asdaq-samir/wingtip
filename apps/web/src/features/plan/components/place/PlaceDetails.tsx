import { useQuery } from "@tanstack/react-query";
import { ListGroup, ListRow } from "../../../../components/GroupedList";
import type { AirportPlace } from "../../../../lib/api/types";
import { servicesQuery } from "../../../../lib/queryClient";
import { dial, hostOf } from "./contactLinks";
import { mapsLink } from "./mapsLink";

/**
 * The airport card's Details, in Apple Maps' row form, a grey label at the
 * left and the value at the right in the tint, each a tap (the owner,
 * 2026-11-14: "we can add phone numbers, website and address in details"):
 *  - each phone NASR holds for the field, by whose it is (APT_CON's
 *    Manager, Owner; `phones`), dialled on a tap;
 *  - its website, the airport's own listing on the field in Overture's
 *    places (the services' answer, wingtip.nearby), opened in a new tab;
 *  - its address, the way to it in Maps (the owner, 2026-10-29: "write the
 *    address in details"), the town where the FAA lists none.
 * A row with nothing to say is left out; how far its figures are to be
 * trusted after them, in grey (`data`).
 */
export function PlaceDetails({ place, where, data }: { place: AirportPlace; where: string | null; data: string | null }) {
  const { data: services } = useQuery(servicesQuery(place.ident));
  const phones = place.phones?.length ? place.phones : place.phone ? [{ who: "Phone", number: place.phone }] : [];
  const site = services?.website ?? null;
  // The street on its line and the town under it, as Maps writes an address.
  const address = (place.address ?? where ?? "").replace(", ", "\n");
  const value = (words: string) => <span className="whitespace-pre-line text-tint">{words}</span>;
  return (
    <ListGroup>
      {phones.map((p) => (
        <ListRow key={`${p.who}-${p.number}`} muted title={p.who} value={value(p.number)} href={dial(p.number)} data-testid="place-phone" />
      ))}
      {site && <ListRow muted title="Website" value={value(hostOf(site))} href={site} data-testid="place-website" />}
      {address && <ListRow muted title="Address" value={value(address)} href={mapsLink(place)} data-testid="place-address" />}
      {data && <ListRow muted title={data} data-testid="place-data-source" />}
    </ListGroup>
  );
}
