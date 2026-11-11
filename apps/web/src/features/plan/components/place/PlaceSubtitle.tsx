import { cn } from "cn";
import type { AirportPlace } from "../../../../lib/api/types";
import { TEXT } from "../../../../lib/text";
import { mapsLink } from "./mapsLink";

/**
 * The line under an airport card's ident: its name, then its town as a
 * link in the tint, on one line, as Apple Maps' place card on the web
 * writes "Pier · Streeterville, Chicago" with the place a link (the
 * owner's screenshot, 2026-11-10). The town opens the field in Maps, as
 * the card's Address does (mapsLink); before the card's answer is in, the
 * town is words alone.
 */
export default function PlaceSubtitle({ name, where, place }: { name: string; where: string | null; place: AirportPlace | null }) {
  return (
    <>
      {name}
      {where && (
        <>
          {" · "}
          {place ? (
            <a
              href={mapsLink(place)}
              target="_blank"
              rel="noreferrer"
              className={cn("text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring", TEXT.prose)}
              data-testid="place-town"
            >
              {where}
            </a>
          ) : (
            <span data-testid="place-town">{where}</span>
          )}
        </>
      )}
    </>
  );
}
