import FitLine from "../../../components/FitLine";

/**
 * An airplane card's head's second line: what it is and who flies it,
 * centred under the callsign and fitted to the line, as the airport card's
 * full name is under its ident (PlaceSubtitle, 122ede375), so the two cards
 * have one layout (the owner: "Do airport and aircraft cards have same
 * layouts?"). A space until it is known, so the head keeps its height.
 */
export default function FlightWhat({ what }: { what: string }) {
  return (
    <span className="flex min-w-0 justify-center" data-testid="flight-what">
      <FitLine className="min-w-0">{what || " "}</FitLine>
    </span>
  );
}
