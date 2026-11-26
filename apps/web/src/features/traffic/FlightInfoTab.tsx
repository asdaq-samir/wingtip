import { useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { PillSection } from "../../components/Favorites";
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
 * The airplane card's Flight tab's details (FlightTab; the owner's design
 * of 2026-11-26): what it is -- its registration, type, year and squawk,
 * who it is registered to, its model, operator, ICAO address, callsign and
 * the tower's departure event -- then its flight number's scheduled route.
 * Its FAA registration in full is the card's Info tab (AirplaneInfo), one
 * card for the airplane, so its N-number here opens nothing more.
 */
export default function FlightInfoTab({
  hex,
  plane,
  detail,
  detailLoading,
  registered,
  route,
  registry = true,
}: {
  hex: string;
  plane: TrafficAircraft | null;
  detail: FlightDetail | undefined;
  detailLoading: boolean;
  /** The registry's make and model, where no trace names its type. */
  registered: string | null;
  route: FlightRoute | null | undefined;
  /** Its registration, type, owner and model: only where the card
   *  has no Info tab to hold them (traffic the FAA's registry does not
   *  hold); an N-number's card says them once, under Info, where the Flight
   *  tab repeated them, blank once it had landed (2026-11-26). */
  registry?: boolean;
}) {
  const registration = detail?.registration ?? plane?.registration ?? null;
  const squawk = plane?.squawk ?? null;
  const meaning = squawkMeaning(squawk);
  // Its latest tower departure event, by the ident it files under: its
  // callsign, else its registration.
  const { data: tower } = useQuery(departuresQuery(plane?.callsign ?? registration));
  const towerLine = departureLine(tower?.events[0]);
  return (
    <>
      <PillSection title="Details" testId="flight-details">
        <ListGroup>
          {/* Traffic the FAA's registry does not hold says so (the design's "Unregistered"). */}
          {registry && (
            <>
              <ListRow
                title="Registration"
                value={
                  <span className="font-semibold text-foreground">
                    {[registration, detail && !detail.faa ? "Not in the FAA's registry" : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                }
                data-testid="flight-registration"
              />
              <ListRow
                title="Type"
                value={
                  <span className="font-semibold text-foreground" data-testid="flight-type">
                    {[detail?.type ?? plane?.type ?? registered, detail?.year].filter(Boolean).join(" · ") || "—"}
                  </span>
                }
              />
            </>
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
              the record is asked for and a dash where it has none: the
              rows came in as it answered and the card under them jumped
              (the flicker audit's FL-10). */}
          {registry && (
            <>
              <ListRow title="Registered To" value={recordValue(detail?.faa?.owner, detailLoading, "flight-owner")} />
              <ListRow title="Model" value={recordValue(detail?.description, detailLoading, "flight-model")} />
            </>
          )}
          {/* Who flies it, this flight's, on every card, where it is known. */}
          {(detailLoading || detail?.operator) && (
            <ListRow title="Operator" value={recordValue(detail?.operator, detailLoading, "flight-operator")} />
          )}
          <ListRow
            title="ICAO Address"
            value={<span className={cn("font-semibold text-foreground uppercase tabular-nums", TEXT.row)}>{hex}</span>}
          />
          <ListRow title="Callsign" value={<span className="font-semibold text-foreground">{plane?.callsign ?? "—"}</span>} />
          {/* The tower's departure event, where TDES sent one (features/traffic/departureWords). */}
          {towerLine && <ListRow title="Tower" description={towerLine} />}
        </ListGroup>
      </PillSection>
      {route && (
        // Its flight number's scheduled route (Virtual Radar Server's
        // route database), not the flight plan filed, which the FAA does
        // not publish openly: said in the row, not in a footnote.
        <ListGroup title="Scheduled Route">
          <ListRow
            media={
              <RowBadge colour={BADGE.approach}>
                <Route />
              </RowBadge>
            }
            data-testid="flight-route"
            title={<span className="font-semibold">{route.airports.map((a) => a.ident).join(" → ")}</span>}
            description={[
              route.airports
                .map((a) => a.location ?? a.name)
                .filter(Boolean)
                .join(" to "),
              route.plausible === false ? "not where it is flying now" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </ListGroup>
      )}
    </>
  );
}
