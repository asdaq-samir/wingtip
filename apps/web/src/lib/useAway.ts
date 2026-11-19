import { compassPoint } from "./compass";
import { grouped } from "./format";
import { useGeo, type Geo, type LatLon } from "./geo";
import { useOwnFixShown } from "./map/position/ownShip";
import type { RecentAirport } from "./preferences";

/** How far, as a figure: to a tenth under 10 nm, where a few tenths are
 *  worth saying -- an airplane 2.3 nm off, a field 4.6 nm away -- and whole
 *  miles from there, with the thousands' comma, "1,317", as every summary's
 *  distance (the owner's list, 2026-11-17). One field read "12 nm" on
 *  Nearest's strip and "12.3 nm" in its list and on its card. */
export function nmFigure(nm: number): string {
  const tenths = Math.round(nm * 10) / 10;
  return tenths < 10 ? tenths.toFixed(1) : grouped(nm);
}

/** How far, with its unit: "4.6 nm", "12 nm". */
export const nmAway = (nm: number) => `${nmFigure(nm)} nm`;

/** How far and which way from `from`: "4.6 nm NE". */
export function awayFrom(geo: Geo, from: LatLon, to: LatLon): string {
  return `${nmAway(geo.distanceNm(from, to))} ${compassPoint(geo.bearingDeg(from, to))}`;
}

/** A kept airport's tile's second line -- Home's, the Favorites', the
 *  Recents', the search's and the route pickers' -- how far it is from own
 *  ship's fix as it is, else its town, else its name. Each strip had its
 *  own: the town in one, nothing or Home's ident in another. The fix read
 *  only while in sight (lib/shown): every strip kept hidden under a card
 *  or another tab was drawn again at every fix. */
export function useAway(): (airport: RecentAirport) => string {
  const from = useOwnFixShown();
  // The strips draw at once on a fresh open, before the engine's .wasm:
  // the town until it is there to work out the distance.
  const geo = useGeo();
  return (a) =>
    from && geo && a.lat !== undefined && a.lon !== undefined
      ? nmAway(geo.distanceNm(from, { lat: a.lat, lon: a.lon }))
      : a.municipality || a.name;
}
