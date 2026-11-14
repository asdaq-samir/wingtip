import { callEngine } from "../../../../lib/engine/engine";
import { useGeo, type LatLon } from "../../../../lib/geo";
import { useCruiseTas } from "../../../../lib/map/useCruiseTas";
import { useOwnShipNear } from "../../../../lib/map/position/ownShip";
import { sameField } from "../../../../lib/procedures";

/** Fly Here's time (the owner, 2026-11-14, after Apple Maps' "9 min" on its
 *  Directions tile; canvas V1d9RDbmY1aczc4LfXed7a, "Airport card after
 *  Apple Maps", C1): the minutes from where the airplane is -- own ship's
 *  fix, else the route's departure -- to the field, as the engine works
 *  them from the airplane's book alone (fuel_estimate: the great-circle
 *  distance at its cruise true airspeed, no wind, no climb), so it is an
 *  estimate and said as one. Null with no airplane picked or none of its
 *  speed (the owner, 2026-11-09: nothing assumed), with nothing to measure
 *  from, or from the field itself. */
export function useFlyHereMinutes(
  field: { ident: string; lat: number; lon: number } | null,
  from: { point: LatLon; name: string | null } | null,
): { minutes: number; tasKt: number } | null {
  const geo = useGeo();
  const tasKt = useCruiseTas();
  // The fix to a hundredth of a degree: the tile is not drawn again at every fix.
  const fix = useOwnShipNear();
  const start = fix ?? from?.point ?? null;
  if (!field || !geo || !tasKt || !start) return null;
  if (!fix && from?.name && sameField(from.name, field.ident)) return null;
  const distanceNm = geo.distanceNm(start, field);
  if (distanceNm < 0.5) return null;
  const { minutes } = callEngine("fuel_estimate", {
    distance_nm: distanceNm,
    cruise_tas_kt: tasKt,
    fuel_burn_gph: null,
    taxi_fuel_gal: null,
  });
  return minutes == null ? null : { minutes, tasKt };
}
