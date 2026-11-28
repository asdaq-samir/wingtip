import { ListGroup, ListRow } from "../../components/GroupedList";
import type { AircraftRegistration, AirplaneDetails } from "../../lib/api/types";
import { grouped } from "../../lib/format";
import { day } from "./infoDay";
import AirplaneHistory from "./AirplaneHistory";
import { FirstFew } from "../../components/FirstFew";

type Value = string | number | null | undefined;

/** One fact, left out where the record has none. */
function Fact({ title, value, testId }: { title: string; value: Value; testId?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return <ListRow title={title} value={String(value)} data-testid={testId} />;
}

/** A section's facts as its rows, those the record has none of left out,
 *  for a section of three and the rest on its title (FirstFew). */
const facts = (list: [title: string, value: Value, testId?: string][]) =>
  list
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([title, value, testId]) => <Fact key={title} title={title} value={value} testId={testId} />);

/** The section's title by the registry's Type Aircraft (TYPE-ACFT,
 *  ardata.pdf): an airplane's "Airplane", the app's word; a rotorcraft's
 *  "Helicopter" (TYPE-ACFT 6; a gyroplane its own, 9), the class 14 CFR
 *  61.5(b)(2) gives it; a glider, balloon, airship or the rest "Aircraft"
 *  (the owner's iPhone, 2026-11-27: N812HW, an EC 130, under "Airplane"). */
function kindTitle(type: string | null | undefined): string {
  if (!type || type.startsWith("Fixed wing")) return "Airplane";
  if (type === "Rotorcraft") return "Helicopter";
  if (type === "Gyroplane") return "Gyroplane";
  return "Aircraft";
}

/**
 * The airplane card's Info (the owner's P1, 2026-11-14), each section its
 * first three rows and its title the rest, as the airport card's are
 * (FirstFew; the owner, 2026-11-26): its public
 * record in the order claude/plane-data set out -- Registration, Airplane
 * (its identifiers too: ICAO address, Mode S octal, call sign),
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
  hex,
  callsign,
}: {
  record: AircraftRegistration | null;
  details: AirplaneDetails | undefined;
  detailsFailed: boolean;
  /** Its ICAO address, the registry's or the one its card was opened by. */
  hex: string | null;
  /** Its call sign while it is heard. */
  callsign: string | null;
}) {
  const history = <AirplaneHistory details={details} failed={detailsFailed} />;
  const full = details?.registration ?? record;
  if (!full)
    return (
      <div className="space-y-5" data-testid="airplane-info">
        <ListGroup>
          <ListRow muted title="The FAA's registry has no record of this N-number." />
          <Fact title="ICAO Address" value={hex?.toUpperCase()} />
          <Fact title="Callsign" value={callsign} />
        </ListGroup>
        {history}
      </div>
    );
  const ref = details?.model;
  const type = ref?.aircraft_type ?? full.aircraft_type;
  const engine = details?.engine;
  const hp = engine?.horsepower ?? full.horsepower;
  const thrust = engine?.thrust_lb ?? full.thrust_lb;
  const power = hp ? `${grouped(hp)} hp` : thrust ? `${grouped(thrust)} lb thrust` : null;
  const place = [full.city, full.state ?? (full.country !== "US" ? full.country : null)].filter(Boolean).join(", ");
  return (
    <div className="space-y-5" data-testid="airplane-info">
      <FirstFew
        title="Registration"
        testId="airplane-info-registration"
        rows={facts([
          ["Owner", full.owner ?? "Not in the record", "airplane-info-owner"],
          ["Owner Type", full.owner_type],
          ["Town", place],
          ["Co-owners", full.co_owner_names?.length ? full.co_owner_names.join(", ") : full.co_owners || null],
          ["Status", full.status],
          ["Issued", day(full.certificate_issued)],
          ["Expires", day(full.expires)],
          ["Last Action", day(full.last_action)],
          ["FAA Region", full.region],
          ["Fractional Ownership", full.fractional ? "Yes" : null],
        ])}
      />
      <FirstFew
        title={kindTitle(type)}
        testId="airplane-info-airplane"
        rows={facts([
          ["Model", [full.manufacturer, full.model].filter(Boolean).join(" "), "airplane-info-model"],
          ["Year", full.year],
          // What the registry says, by its own fields: its Type Aircraft ("Rotorcraft",
          // "Fixed wing single engine"), and ACFTREF's AC-CAT, which the FAA calls its
          // category and is where it alights: land, sea or amphibian -- shown as
          // "Category" it read as 61.5's, where an EC 130's is rotorcraft, not land.
          ["Type", type],
          ["Land or Water", ref?.category],
          ["Builder Certification", ref?.builder_certification],
          ["Seats", ref?.seats ?? full.seats],
          ["Engines", ref?.engines ?? full.engines],
          ["Weight Class", ref?.weight_class],
          // The FAA's reference record's average cruise, statute miles an hour (ACFTREF, ardata.pdf):
          // a reference figure, never one to plan with, and said so.
          ["FAA Reference Cruise", ref?.cruise_mph ? `${ref.cruise_mph} mph, not for planning` : null],
          ["Kit", full.kit],
          ["Serial", full.serial],
          // Its identifiers here with the others (the owner, 2026-11-26): the
          // Mode S address is its ICAO address, the one it is heard by.
          ["ICAO Address", (full.mode_s_hex ?? hex)?.toUpperCase()],
          ["Mode S (Octal)", full.mode_s_octal],
          ["Callsign", callsign],
        ])}
      />
      {(full.engine || engine || power) && (
        <FirstFew
          title="Engine"
          testId="airplane-info-engine"
          rows={facts([
            ["Model", [engine?.manufacturer, engine?.model].filter(Boolean).join(" ") || full.engine],
            ["Type", engine?.engine_type ?? full.engine_type],
            [hp ? "Horsepower" : "Thrust", power],
          ])}
        />
      )}
      <FirstFew
        title="Airworthiness"
        testId="airplane-info-airworthiness"
        rows={facts([
          ["Class and Operations", full.airworthiness ?? "Not in the record"],
          ["Issued", day(full.airworthiness_date)],
          ["Type Certificate Data Sheet", ref?.tc_data_sheet, "airplane-info-tcds"],
          ["Holder", ref?.tc_holder],
        ])}
      />
      {history}
    </div>
  );
}
