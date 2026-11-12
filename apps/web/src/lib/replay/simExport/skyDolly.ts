import type { SimRow, SimSegment } from "./flight";

/*
 * Sky Dolly's "Flight Recorder" CSV (github.com/till213/SkyDolly, MIT; its
 * reader src/Plugins/Flight/Import/CsvImport/src/FlightRecorderCsvParser.cpp,
 * read 2026-11-12): the file the Flight Recorder add-on writes from
 * Microsoft Flight Simulator's own variables, which Sky Dolly imports
 * (File, Import, CSV, format "Flight Recorder") and replays in MSFS. Of
 * Sky Dolly's imports it is the one that takes the attitude, the gear,
 * the flaps and the lights as given rather than working out its own
 * (Sky Dolly augments only the Flightradar24 and position-only formats),
 * so the engine's smooth estimates are what MSFS flies.
 *
 * Its reader wants all 43 columns by name, a row a frame, milliseconds
 * from the first; SimConnect's units and signs (the MSFS SDK's simulation
 * variables, as Sky Dolly's FlightAugmentation notes): altitude feet
 * above sea level; pitch negative nose up; bank negative right wing down;
 * true heading; body velocities feet a second (Z forward, Y up); lever
 * and surface positions as fractions (Sky Dolly's fromNormalisedPosition,
 * -1 to 1); the spoiler handle in percent; switches 0 or 1. A file is one
 * segment, as Sky Dolly would replay straight across a gap.
 */

const COLUMNS = [
  "Milliseconds",
  "Latitude",
  "Longitude",
  "Altitude",
  "Pitch",
  "Bank",
  "TrueHeading",
  "VelocityBodyX",
  "VelocityBodyY",
  "VelocityBodyZ",
  "RotationVelocityBodyX",
  "RotationVelocityBodyY",
  "RotationVelocityBodyZ",
  "ThrottleLeverPosition1",
  "ThrottleLeverPosition2",
  "ThrottleLeverPosition3",
  "ThrottleLeverPosition4",
  "PropellerLeverPosition1",
  "PropellerLeverPosition2",
  "PropellerLeverPosition3",
  "PropellerLeverPosition4",
  "RudderPosition",
  "ElevatorPosition",
  "AileronPosition",
  "LeadingEdgeFlapsLeftPercent",
  "LeadingEdgeFlapsRightPercent",
  "TrailingEdgeFlapsLeftPercent",
  "TrailingEdgeFlapsRightPercent",
  "SpoilerHandlePosition",
  "FlapsHandleIndex",
  "BrakeLeftPosition",
  "BrakeRightPosition",
  "WaterRudderHandlePosition",
  "GearHandlePosition",
  "LightTaxi",
  "LightLanding",
  "LightStrobe",
  "LightBeacon",
  "LightNav",
  "LightWing",
  "LightLogo",
  "LightRecognition",
  "LightCabin",
] as const;

const FTS_PER_KT = 1852 / 0.3048 / 3600;

/** The flap handle's notch for the estimated flaps: up, a first notch for
 *  takeoff, the third for landing -- a guess for the picture, as the
 *  airplane's notches are not known. */
function flapsNotch(flaps: number): number {
  return flaps <= 0 ? 0 : flaps < 0.5 ? 1 : 3;
}

function row(r: SimRow, start: number): (number | string)[] {
  const bit = (b: boolean) => (b ? 1 : 0);
  // The engine's estimate (sim_flight), for the picture and the sound.
  const thrust = r.throttle;
  const flaps = Number(r.flaps.toFixed(2));
  return [
    Math.round((r.t - start) * 1000),
    r.lat.toFixed(7),
    r.lon.toFixed(7),
    r.alt_ft.toFixed(1),
    (-r.pitch_deg).toFixed(2),
    (-r.bank_deg).toFixed(2),
    r.track_deg.toFixed(2),
    0,
    (r.vs_fpm / 60).toFixed(2),
    (r.gs_kt * FTS_PER_KT).toFixed(2),
    0,
    0,
    0,
    thrust,
    thrust,
    thrust,
    thrust,
    1,
    1,
    1,
    1,
    0,
    0,
    0,
    flaps,
    flaps,
    flaps,
    flaps,
    0,
    flapsNotch(r.flaps),
    0,
    0,
    0,
    bit(r.gear_down),
    bit(r.lights.taxi),
    bit(r.lights.landing),
    bit(r.lights.strobe),
    bit(r.lights.beacon),
    bit(r.lights.nav),
    0,
    bit(r.lights.logo),
    bit(r.lights.nav),
    1,
  ];
}

/** One segment as a Sky Dolly "Flight Recorder" CSV: numbers only, so no
 *  field needs quoting (RFC 4180). */
export function writeSkyDollyCsv(segment: SimSegment): string {
  const start = segment.rows[0]?.t ?? 0;
  return [COLUMNS.join(","), ...segment.rows.map((r) => row(r, start).join(",")), ""].join("\n");
}
