import { useQuery } from "@tanstack/react-query";
import { Route } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { PillSection } from "../../../components/Favorites";
import { RowBadge } from "../../../components/RowBadge";
import { SkeletonLine } from "../../../components/QueryState";
import type { FlightDetail, FlightRoute, TrafficAircraft } from "../../../lib/api/types";
import { openAirplaneProfile } from "../../../lib/airplane/profileStore";
import { departuresQuery } from "../../../lib/liveReports";
import { BADGE } from "../../../lib/rowBadges";
import { TEXT } from "../../../lib/text";
import { departureLine } from "../lib/departureWords";
import { nameCase } from "../lib/nameCase";
import { squawkMeaning } from "../lib/squawks";
import FaaRegistration from "./FaaRegistration";

/** A row's value from the airplane's record: its words as a name is
 *  written, a line to come while the record is asked for, else a dash. */
const recordValue = (text: string | null | undefined, loading: boolean, testId: string) => (
  <span className="font-semibold text-foreground" data-testid={text ? testId : undefined}>
    {text ? nameCase(text) : loading ? <SkeletonLine className="w-24" /> : "—"}
  </span>
);

/**
 * The tracked flight's card's Info tab (FlightCard; the owner, 2026-11-14:
 * "make sure the airplane card looks similar to airport card"), what was
 * its one scroll's middle: what it is -- its N-number (which opens its
 * profile, features/airplane), type, year and squawk, who it is registered
 * to, its model, operator, ICAO address, callsign and the tower's departure
 * event -- then its flight number's scheduled route and its FAA
 * registration (FaaRegistration).
 */
export default function FlightInfoTab({
  hex,
  plane,
  detail,
  detailLoading,
  registered,
  route,
}: {
  hex: string;
  plane: TrafficAircraft | null;
  detail: FlightDetail | undefined;
  detailLoading: boolean;
  /** The registry's make and model, where no trace names its type. */
  registered: string | null;
  route: FlightRoute | null | undefined;
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
          <ListRow
            title="Registration"
            value={<span className="font-semibold text-tint">{registration ?? "—"}</span>}
            onClick={registration ? () => openAirplaneProfile(registration) : undefined}
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
          <ListRow title="Registered to" value={recordValue(detail?.faa?.owner, detailLoading, "flight-owner")} />
          <ListRow title="Model" value={recordValue(detail?.description, detailLoading, "flight-model")} />
          <ListRow title="Operator" value={recordValue(detail?.operator, detailLoading, "flight-operator")} />
          <ListRow
            title="ICAO address"
            value={<span className={cn("font-semibold text-foreground uppercase tabular-nums", TEXT.row)}>{hex}</span>}
          />
          <ListRow title="Callsign" value={<span className="font-semibold text-foreground">{plane?.callsign ?? "—"}</span>} />
          {/* The tower's departure event, where TDES sent one (features/plan/lib/departureWords). */}
          {towerLine && <ListRow title="Tower" description={towerLine} data-testid="flight-tower" />}
        </ListGroup>
      </PillSection>
      {route && (
        // Its flight number's scheduled route (Virtual Radar Server's
        // route database), not the flight plan filed, which the FAA does
        // not publish openly: said in the row, not in a footnote.
        <ListGroup title="Scheduled route">
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
      {detail?.faa && <FaaRegistration faa={detail.faa} />}
    </>
  );
}
