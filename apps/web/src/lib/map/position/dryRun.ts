import { ownShipAvailable, simulation, startWatching, stopWatching, useOwnShip } from "./ownShip";

/**
 * The planned flight's dry run flying own ship (TracksGl): the GPS set
 * aside while it runs and own ship given back as the pilot had it after.
 * Its own file beside the store it drives (ownShip), which keeps what it
 * gives back so the store never saves a dry run's own ship as the pilot's.
 */

/** How often the dry run reports a fix to own ship, ms: four a second, as
 *  a GPS might, not every frame -- each fix moves what follows own ship.
 *  Own ship glides from one to the next over it (OwnShipGl). */
export const SIMULATED_FIX_MS = 250;

/** The zoom a dry run starts at, on its airplane: some fifty miles across
 *  a phone, the route's checkpoints and fields round it named, at the
 *  owner's ask ("When play is pressed it should also zoom into plane on
 *  the route"). */
export const DRY_RUN_ZOOM = 10;

/** A point of the planned flight's dry run (features/plan/map/pastFlight's). */
interface SimulatedPoint {
  t: number;
  lat: number;
  lon: number;
  alt_ft?: number | null;
  gs_kt?: number | null;
  track_deg?: number | null;
}

/**
 * Own ship flown by the dry run, as if a pilot were flying the route, at
 * the owner's ask ("simulate with the current location plane as if a
 * pilot was flying the route"): on, followed, the GPS set aside, each
 * point a fix -- the plan's true course as its track, its ground speed
 * and the profile's height -- reported as a GPS's would be (to 5 m, so
 * nothing calls it approximate). Never kept as the pilot's last position.
 */
export function simulateFix(point: SimulatedPoint) {
  const s = useOwnShip.getState();
  if (!s.simulated) {
    simulation.before = { enabled: s.enabled, follow: s.follow };
    stopWatching();
    useOwnShip.setState((s) => ({
      simulated: true,
      enabled: true,
      follow: true,
      error: null,
      recentred: s.recentred + 1,
      recentreZoom: DRY_RUN_ZOOM,
    }));
  }
  useOwnShip.setState({
    fix: {
      lat: point.lat,
      lon: point.lon,
      accuracyM: 5,
      headingDeg: point.track_deg ?? null,
      speedKt: point.gs_kt ?? null,
      // The flight's own clock, not the page's: a climb read over these
      // (what is ahead's vertical speed) is the plan's, whatever the
      // replay's speed.
      altitudeFt: point.alt_ft ?? null,
      at: point.t * 1000,
    },
  });
}

/** The dry run over: own ship as the pilot had it, the GPS watched again
 *  if it was on. */
export function endSimulation() {
  if (!useOwnShip.getState().simulated) return;
  const was = simulation.before ?? { enabled: false, follow: true };
  simulation.before = null;
  useOwnShip.setState({ simulated: false, enabled: was.enabled, follow: was.follow, fix: null, error: null });
  if (was.enabled && ownShipAvailable()) startWatching((patch) => useOwnShip.setState(patch));
}
