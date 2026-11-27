import { useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { RowBadge } from "../../components/RowBadge";
import { SkeletonLine } from "../../components/QueryState";
import type { FlightDetail, FlightRoute, TrafficAircraft } from "../../lib/api/types";
import { departuresQuery } from "../../lib/liveReports";
import { BADGE } from "../../lib/rowBadges";
import { TEXT } from "../../lib/text";
import { departureLine } from "./departureWords";
import { nameCase } from "./nameCase";
import { squawkMeaning } from "./squawks";

/** A row's value from the airplane's record: its words as a name is
 *  written, a line to come while the record is asked for, else a dash. */
const recordValue = (text: string | null | undefined, loading: boolean, testId: string) => (
  <span className="font-semibold text-foreground" data-testid={text ? testId : undefined}>
    {text ? nameCase(text) : loading ? <SkeletonLine className="w-24" /> : "—"}
  </span>
);

/**
 * The airplane card's Flights tab's "Now" group while it flies, over its
 * earlier flights (the owner's word, 2026-11-26, Flight and Flights made
 * one tab): its squawk, who flies it, its flight number's scheduled route
 * and the tower's departure event. Its identifiers (ICAO address, call
 * sign) are Info's, with its other identifiers -- but for traffic the
 * FAA's registry does not hold, whose card has no Info: its registration,
 * type, owner, model, address and call sign are here (`registry`). Nothing
 * where it has none of them.
 */
export default function FlightNowRows({
  hex,
  plane,
  detail,
  detailLoading,
  registered,
  route,
  registry,
}: {
  hex: string;
  plane: TrafficAircraft | null;
  detail: FlightDetail | undefined;
  detailLoading: boolean;
  /** The registry's make and model, where no trace names its type. */
  registered: string | null;
  route: FlightRoute | null | undefined;
  /** Traffic the FAA's registry does not hold: its identifiers here, the card having no Info. */
  registry: boolean;
}) {
  const registration = detail?.registration ?? plane?.registration ?? null;
  const squawk = plane?.squawk ?? null;
  const meaning = squawkMeaning(squawk);
  // Its latest tower departure event, by the ident it files under: its
  // callsign, else its registration.
  const { data: tower } = useQuery(departuresQuery(plane?.callsign ?? registration));
  const towerLine = departureLine(tower?.events[0]);
  const operator = detailLoading || !!detail?.operator;
  if (!registry && !squawk && !operator && !route && !towerLine) return null;
  return (
    <div data-testid="flight-details">
      {/* Its flight now while it flies; on the ground, unregistered traffic's identifiers alone. */}
      <ListGroup title={plane ? "Now" : "Details"}>
        {/* Traffic the FAA's registry does not hold says so (the design's "Unregistered"). */}
        {registry && (
          <ListRow
            title="Registration"
            value={
              <span className="font-semibold text-foreground">
                {[registration, detail && !detail.faa ? "Not in the FAA's registry" : null].filter(Boolean).join(" · ") || "—"}
              </span>
            }
            data-testid="flight-registration"
          />
        )}
        {registry && (
          <ListRow
            title="Type"
            value={
              <span className="font-semibold text-foreground" data-testid="flight-type">
                {[detail?.type ?? plane?.type ?? registered, detail?.year].filter(Boolean).join(" · ") || "—"}
              </span>
            }
          />
        )}
        {squawk && (
          <ListRow
            title="Squawk"
            data-testid="flight-squawk"
            value={
              <span className={cn("font-semibold tabular-nums", meaning ? "text-destructive-ink" : "text-foreground")}>
                {squawk}
                {meaning ? ` · ${meaning}` : ""}
              </span>
            }
          />
        )}
        {/* Every row from the first frame, its value a line to come while
            the record is asked for and a dash where it has none: the rows
            came in as it answered and the card under them jumped (the
            flicker audit's FL-10). */}
        {registry && <ListRow title="Registered To" value={recordValue(detail?.faa?.owner, detailLoading, "flight-owner")} />}
        {registry && <ListRow title="Model" value={recordValue(detail?.description, detailLoading, "flight-model")} />}
        {/* Who flies it, this flight's, where it is known. */}
        {operator && <ListRow title="Operator" value={recordValue(detail?.operator, detailLoading, "flight-operator")} />}
        {route && (
          // Its flight number's scheduled route (Virtual Radar Server's
          // route database), not the flight plan filed, which the FAA does
          // not publish openly: said in the row, not in a footnote.
          <ListRow
            media={
              <RowBadge colour={BADGE.approach}>
                <Route />
              </RowBadge>
            }
            data-testid="flight-route"
            title={<span className="font-semibold">{route.airports.map((a) => a.ident).join(" → ")}</span>}
            description={[
              "Scheduled route",
              route.airports
                .map((a) => a.location ?? a.name)
                .filter(Boolean)
                .join(" to "),
              route.plausible === false ? "not where it is flying now" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
        {/* The tower's departure event, where TDES sent one (features/traffic/departureWords). */}
        {towerLine && <ListRow title="Tower" description={towerLine} />}
        {registry && (
          <ListRow
            title="ICAO Address"
            value={<span className={cn("font-semibold text-foreground uppercase tabular-nums", TEXT.row)}>{hex}</span>}
          />
        )}
        {registry && <ListRow title="Callsign" value={<span className="font-semibold text-foreground">{plane?.callsign ?? "—"}</span>} />}
      </ListGroup>
    </div>
  );
}
