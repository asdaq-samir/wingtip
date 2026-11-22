import { callEngine, engineReady } from "../../lib/engine/engine";
import { useSharedLink } from "./store";

/** A route file's endings, as the file picker and a drop take them: a
 *  flight plan's .fpl (Garmin's FlightPlan v1, which Garmin Pilot,
 *  ForeFlight and the panel's Flight Stream write) and a GPX route. */
export const ROUTE_FILE_ENDINGS = [".fpl", ".gpx"] as const;

/** Their types where a browser gives one: GPX's registered type, and XML. */
export const ROUTE_FILE_TYPES = ["application/gpx+xml", "application/xml", "text/xml"] as const;

/**
 * A route file opened -- picked or dropped -- read by the engine
 * (route_file_read) and put up for its preview, as a shared flight's link
 * is (SharedFlightSheet): nothing in the pilot's plan changes until Use
 * This Plan. A file that is not one is said in the same sheet, in place.
 */
export async function openRouteFile(file: File): Promise<void> {
  const [text] = await Promise.all([file.text(), engineReady]);
  const read = callEngine("route_file_read", { text });
  useSharedLink.setState({ link: { kind: "file", fileName: file.name, read } });
}
