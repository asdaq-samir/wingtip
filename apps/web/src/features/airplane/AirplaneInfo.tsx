import { ListGroup, ListRow } from "../../components/GroupedList";
import type { AircraftRegistration, AirplaneDetails } from "../../lib/api/types";
import { grouped } from "../../lib/format";
import { day } from "./infoDay";
import AirplaneHistory from "./AirplaneHistory";

/** One fact, left out where the record has none. */
function Fact({ title, value, testId }: { title: string; value: string | number | null | undefined; testId?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return <ListRow title={title} value={String(value)} data-testid={testId} />;
}

/**
 * The airplane card's Info tab (the owner's P1, 2026-11-14): its public
 * record in the order claude/plane-data set out -- Registration, Airplane,
 * Engine, Airworthiness, then where it is usually based, its safety and
 * ownership history and the documents filed (AirplaneHistory). The FAA
 * aircraft registry is public data, so its owner is shown for every airplane
 * as the FAA publishes it: name, kind, town and state, co-owners (the owner,
 * 2026-11-14: "For owner info though, it's public info"); the town, never
 * the street. An owner who asked the FAA to withhold their name (49 U.S.C.
 * 44114(b)) is not in the record, and its row says so. `record` is the
 * registry's, at once (/api/traffic/registered); `details` the rest
 * (/api/airplanes/{n_number}), undefined while it is asked.
 */
export default function AirplaneInfo({
  record,
  details,
  detailsFailed,
}: {
  record: AircraftRegistration | null;
  details: AirplaneDetails | undefined;
  detailsFailed: boolean;
}) {
  const history = <AirplaneHistory details={details} failed={detailsFailed} />;
  const full = details?.registration ?? record;
  if (!full)
    return (
      <div className="space-y-5" data-testid="airplane-info">
        <ListGroup>
          <ListRow muted title="The FAA's registry has no record of this N-number." data-testid="airplane-info-none" />
        </ListGroup>
        {history}
      </div>
    );
  const ref = details?.model;
  const engine = details?.engine;
  const hp = engine?.horsepower ?? full.horsepower;
  const thrust = engine?.thrust_lb ?? full.thrust_lb;
  const power = hp ? `${grouped(hp)} hp` : thrust ? `${grouped(thrust)} lb thrust` : null;
  const place = [full.city, full.state ?? (full.country !== "US" ? full.country : null)].filter(Boolean).join(", ");
  return (
    <div className="space-y-5" data-testid="airplane-info">
      <ListGroup title="Registration">
        <Fact title="Owner" value={full.owner ?? "Not in the record"} testId="airplane-info-owner" />
        <Fact title="Owner type" value={full.owner_type} />
        <Fact title="Town" value={place} />
        <Fact title="Co-owners" value={full.co_owner_names?.length ? full.co_owner_names.join(", ") : full.co_owners || null} />
        <Fact title="Status" value={full.status} testId="airplane-info-status" />
        <Fact title="Issued" value={day(full.certificate_issued)} />
        <Fact title="Expires" value={day(full.expires)} />
        <Fact title="Last action" value={day(full.last_action)} />
        <Fact title="FAA region" value={full.region} />
        {full.fractional && <ListRow title="Fractional ownership" value="Yes" />}
      </ListGroup>
      <ListGroup title="Airplane">
        <Fact title="Type" value={[full.manufacturer, full.model].filter(Boolean).join(" ")} testId="airplane-info-model" />
        <Fact title="Year" value={full.year} />
        <Fact title="Category" value={ref?.category ?? full.aircraft_type} />
        <Fact title="Builder certification" value={ref?.builder_certification} />
        <Fact title="Seats" value={ref?.seats ?? full.seats} />
        <Fact title="Engines" value={ref?.engines ?? full.engines} />
        <Fact title="Weight class" value={ref?.weight_class} />
        {/* The FAA's reference record's average cruise, statute miles an hour (ACFTREF, ardata.pdf):
            a reference figure, never one to plan with, and said so. */}
        <Fact title="FAA reference cruise" value={ref?.cruise_mph ? `${ref.cruise_mph} mph, not for planning` : null} />
        <Fact title="Kit" value={full.kit} />
        <Fact title="Serial" value={full.serial} />
        <Fact title="Mode S address" value={full.mode_s_hex?.toUpperCase()} />
        <Fact title="Mode S (octal)" value={full.mode_s_octal} />
      </ListGroup>
      {(full.engine || engine || power) && (
        <ListGroup title="Engine">
          <Fact title="Model" value={[engine?.manufacturer, engine?.model].filter(Boolean).join(" ") || full.engine} />
          <Fact title="Type" value={engine?.engine_type ?? full.engine_type} />
          <Fact title={hp ? "Horsepower" : "Thrust"} value={power} />
        </ListGroup>
      )}
      <ListGroup title="Airworthiness">
        <Fact title="Class and operations" value={full.airworthiness ?? "Not in the record"} />
        <Fact title="Issued" value={day(full.airworthiness_date)} />
        <Fact title="Type certificate data sheet" value={ref?.tc_data_sheet} testId="airplane-info-tcds" />
        <Fact title="Holder" value={ref?.tc_holder} />
      </ListGroup>
      {history}
    </div>
  );
}
