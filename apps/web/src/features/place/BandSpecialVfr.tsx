import type { AirspaceBand } from "../../lib/api/types";
import { SpecialVfr } from "../../components/SpecialVfr";
import { fromSurface } from "../../lib/airspace";

/** The classes whose surface area special VFR is asked of (91.157(a)). */
const surfaceClass = (c: AirspaceBand["class"]): c is "B" | "C" | "D" => c === "B" || c === "C" || c === "D";

/** Special VFR over a held point, as the airspace volume's card says it:
 *  for the Class B, C or D band from the surface, asked of the engine with
 *  the band's class and its primary airport (`ident`); nothing for a point
 *  with no such band. */
export function BandSpecialVfr({ bands, ground }: { bands: AirspaceBand[]; ground: number | null }) {
  const band = bands.find((b) => surfaceClass(b.class) && fromSurface(b, ground));
  if (!band || !surfaceClass(band.class)) return null;
  return <SpecialVfr airspaceClass={band.class} airport={band.ident ?? null} testId="point-special-vfr" />;
}
