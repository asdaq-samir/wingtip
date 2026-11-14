import { BadgeCheck, Fan, IdCard, Plane, UserRound } from "lucide-react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../../components/GroupedList";
import { RowBadge } from "../../../components/RowBadge";
import type { AircraftRegistration } from "../../../lib/api/types";
import { BADGE } from "../../../lib/rowBadges";
import { dayMonthYear, grouped } from "../../../lib/format";

/** An ISO date as a day, as the app writes every one: "31 Jan 2033"
 *  (lib/format days; it was the phone's own form, CODE-33). */
const day = (iso: string) => dayMonthYear(new Date(`${iso}T00:00:00`));

/**
 * A US airplane's FAA registration, at the pilot's ask: who it is
 * registered to and where, whether the registration is in effect and
 * till when, what it is and its engine, and its airworthiness
 * certificate -- the registry's own record (wingtip.registry), as the FAA's
 * N-number inquiry shows it, the owner's town and never the street.
 */
export default function FaaRegistration({ faa }: { faa: AircraftRegistration }) {
  const place = [faa.city, faa.state ?? (faa.country !== "US" ? faa.country : null)].filter(Boolean).join(", ");
  const power = faa.horsepower ? `${grouped(faa.horsepower)} hp` : faa.thrust_lb ? `${grouped(faa.thrust_lb)} lb thrust` : null;
  return (
    // The registry's own record; an owner who asked the FAA to withhold
    // their name (49 U.S.C. 44114) is not in it, and the row is left out.
    <ListGroup title="FAA registration">
      {faa.owner && (
        <ListRow
          media={
            <RowBadge colour={BADGE.ground}>
              <UserRound />
            </RowBadge>
          }
          title="Registered to"
          data-testid="faa-owner"
          description={[
            faa.owner,
            faa.owner_type,
            place,
            faa.co_owners ? `and ${faa.co_owners} more` : null,
            faa.fractional ? "fractional" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      <ListRow
        media={
          <RowBadge colour={faa.standing === "lapsed" ? BADGE.hazard : BADGE.ground}>
            <BadgeCheck />
          </RowBadge>
        }
        title={faa.n_number}
        data-testid="faa-status"
        description={
          [faa.certificate_issued && `Issued ${day(faa.certificate_issued)}`, faa.expires && `expires ${day(faa.expires)}`]
            .filter(Boolean)
            .join(", ") || undefined
        }
        value={
          <span className={cn("font-semibold", faa.standing === "lapsed" ? "text-destructive-ink" : "text-foreground")}>
            {faa.status ?? "—"}
          </span>
        }
      />
      {(faa.manufacturer || faa.model) && (
        <ListRow
          media={
            <RowBadge colour={BADGE.tower}>
              <Plane />
            </RowBadge>
          }
          title={[faa.manufacturer, faa.model].filter(Boolean).join(" ")}
          data-testid="faa-aircraft"
          description={[
            faa.year,
            faa.aircraft_type,
            faa.seats ? `${faa.seats} seats` : null,
            faa.kit ? `kit ${faa.kit}` : null,
            faa.serial ? `serial ${faa.serial}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      {faa.engine && (
        <ListRow
          media={
            <RowBadge colour={BADGE.runway}>
              <Fan />
            </RowBadge>
          }
          title={faa.engine}
          data-testid="faa-engine"
          description={[faa.engines && faa.engines > 1 ? `${faa.engines} engines` : null, faa.engine_type, power]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      {faa.airworthiness && (
        <ListRow
          media={
            <RowBadge colour={BADGE.rule}>
              <IdCard />
            </RowBadge>
          }
          title="Airworthiness"
          data-testid="faa-airworthiness"
          description={[faa.airworthiness, faa.airworthiness_date && `since ${day(faa.airworthiness_date)}`].filter(Boolean).join(" · ")}
        />
      )}
    </ListGroup>
  );
}
