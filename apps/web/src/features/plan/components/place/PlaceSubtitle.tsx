import { cn } from "cn";
import type { AirportPlace } from "../../../../lib/api/types";
import { TEXT } from "../../../../lib/text";
import FitLine from "../../../../components/FitLine";
import { mapsLink } from "./mapsLink";

/**
 * The lines under an airport card's ident: its name on a line of its own,
 * its type set smaller to fit that line rather than wrapping (FitLine),
 * and its town on the next as a link in the tint (the owner, 2026-11-11:
 * "Can airport move the city to next line after the name? And fit the
 * airport name to its line"). The town opens the field in Maps, as the
 * card's Address does (mapsLink); before the card's answer is in, the
 * town is words alone.
 */
export default function PlaceSubtitle({ name, where, place }: { name?: string; where: string | null; place: AirportPlace | null }) {
  return (
    <>
      {name && <FitLine testId="place-full-name">{name}</FitLine>}
      {where && (
        <span className="block truncate">
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
        </span>
      )}
    </>
  );
}
