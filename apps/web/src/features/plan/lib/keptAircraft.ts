import type { AircraftRegistration, TrafficAircraft } from "../../../lib/api/types";
import { aircraftKind } from "../../../lib/aircraftKind";
import type { KeptAircraft } from "../../../lib/preferences";

/** What is kept of an airplane the FAA's registry names: its address, its
 *  N-number and its model. */
export function keptOf(record: AircraftRegistration & { mode_s_hex: string }): KeptAircraft {
  return { hex: record.mode_s_hex.toLowerCase(), name: record.n_number, type: record.model ?? null, kind: aircraftKind({ faa: record }) };
}

/** What is kept of an airplane heard: its address, the name it is kept by
 *  (its registration first) and its type. */
export function keptPlane(plane: TrafficAircraft): KeptAircraft {
  return {
    hex: plane.hex,
    name: plane.registration ?? plane.callsign ?? plane.hex.toUpperCase(),
    type: plane.type ?? null,
    kind: aircraftKind({ type: plane.type, category: plane.category }),
  };
}
