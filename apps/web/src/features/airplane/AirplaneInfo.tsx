import { ListGroup, ListRow } from "../../components/GroupedList";
import type { AircraftRegistration } from "../../lib/api/types";
import type { AirplaneDetails, AirplanePhoto } from "../../lib/airplane/details";
import AirplaneHistory from "./AirplaneHistory";
import { dayMonthYear, grouped } from "../../lib/format";

/** An ISO date as the app writes every day: "31 Jan 2033". */
const day = (iso: string | null | undefined) => (iso ? dayMonthYear(new Date(`${iso}T00:00:00`)) : null);

/** One fact, left out where the record has none. */
function Fact({ title, value, testId }: { title: string; value: string | number | null | undefined; testId?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return <ListRow title={title} value={String(value)} data-testid={testId} />;
}

/**
 * The airplane card's Info tab (the owner's P1, 2026-11-14): its FAA
 * registry record (wingtip.registry, the FAA's Releasable Aircraft
 * Database) in groups, as the airport card's Info has its facts -- the
 * airplane, its engine, its registration and its owner. The FAA aircraft
 * registry is public data, so its owner is shown for every airplane as the
 * FAA publishes it: name, town and state, the kind of owner and how many
 * co-owners (the owner, 2026-11-14: "For owner info though, it's public
 * info"). The FAA's own record holds the owner's street too; the app shows
 * the town, never the street. An owner who asked the FAA to withhold their
 * name (49 U.S.C. 44114(b)) is not in the record, and its row says so.
 */
export default function AirplaneInfo({
  record,
  details,
  detailsFailed,
  photo,
}: {
  record: AircraftRegistration | null;
  /** The rest of its public record (useAirplaneCard): the reference records, history, base. */
  details: AirplaneDetails | undefined;
  detailsFailed: boolean;
  photo: AirplanePhoto | null | undefined;
}) {
  const history = <AirplaneHistory details={details} failed={detailsFailed} photo={photo} />;
  if (!record)
    return (
      <div className="space-y-5">
        <ListGroup>
          <ListRow muted title="The FAA's registry has no record of this N-number." data-testid="airplane-info-none" />
        </ListGroup>
        {history}
      </div>
    );
  const ref = details?.model;
  const engine = details?.engine;
  const full = details?.registration;
  const power = record.horsepower ? `${grouped(record.horsepower)} hp` : record.thrust_lb ? `${grouped(record.thrust_lb)} lb thrust` : null;
  const place = [record.city, record.state ?? (record.country !== "US" ? record.country : null)].filter(Boolean).join(", ");
  return (
    <div className="space-y-5" data-testid="airplane-info">
      <ListGroup title="Airplane">
        <Fact title="Make and model" value={[record.manufacturer, record.model].filter(Boolean).join(" ")} testId="airplane-info-model" />
        <Fact title="Year" value={record.year} />
        <Fact title="Kind" value={record.aircraft_type} />
        <Fact title="Serial" value={record.serial} />
        <Fact title="Seats" value={record.seats} />
        <Fact title="Kit" value={record.kit} />
        <Fact title="Category" value={ref?.category} />
        <Fact title="Certification" value={ref?.builder_certification} />
        <Fact title="Weight class" value={ref?.weight_class} />
        {/* TODO(claude/plane-data): the data sheet's link, where that branch gives one. */}
        <Fact
          title="Type certificate"
          value={[ref?.tc_data_sheet, ref?.tc_holder].filter(Boolean).join(" · ")}
          testId="airplane-info-tcds"
        />
      </ListGroup>
      {(record.engine || record.engine_type || power || engine) && (
        <ListGroup title="Engine">
          <Fact title="Model" value={[engine?.manufacturer, engine?.model].filter(Boolean).join(" ") || record.engine} />
          <Fact title="Type" value={record.engine_type} />
          <Fact title="Engines" value={record.engines} />
          <Fact title={record.horsepower ? "Horsepower" : "Thrust"} value={power} />
        </ListGroup>
      )}
      <ListGroup title="Registration">
        <Fact title="N-number" value={record.n_number} />
        <Fact title="Status" value={record.status} testId="airplane-info-status" />
        <Fact title="Issued" value={day(record.certificate_issued)} />
        <Fact title="Expires" value={day(record.expires)} />
        <Fact title="Airworthiness" value={record.airworthiness} />
        <Fact title="Airworthy since" value={day(record.airworthiness_date)} />
        <Fact title="Mode S address" value={record.mode_s_hex?.toUpperCase()} />
        <Fact title="Mode S (octal)" value={full?.mode_s_octal} />
        <Fact title="Last action" value={day(full?.last_action)} />
      </ListGroup>
      <ListGroup title="Owner">
        <Fact title="Name" value={record.owner ?? "Not in the record"} testId="airplane-info-owner" />
        <Fact title="Town" value={place} />
        <Fact title="Kind" value={record.owner_type} />
        <Fact title="Co-owners" value={full?.co_owner_names?.length ? full.co_owner_names.join(", ") : record.co_owners || null} />
        {record.fractional && <ListRow title="Fractional ownership" value="Yes" />}
      </ListGroup>
      {history}
    </div>
  );
}
