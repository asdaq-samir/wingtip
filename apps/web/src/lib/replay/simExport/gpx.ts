import { altitudeWords, ESTIMATED_WORDS, isoTime, type SimMeta, type SimSegment } from "./flight";
import { M_PER_FT } from "../../geo";
import { xmlDocument, xmlText } from "./xml";

/*
 * GPX 1.1 (topografix.com/GPX/1/1, its schema gpx.xsd): a track, <trk>,
 * of segments, <trkseg>, "a Track Segment holds a list of Track Points
 * which are logically connected in order. To represent a single GPS track
 * where GPS reception was lost, or the GPS receiver was turned off, start
 * a new Track Segment for each continuous span of track data": so one
 * <trkseg> for each run of reports between gaps. Each <trkpt> has its lat
 * and lon (WGS84 degrees), then, in the schema's order, <ele> ("Elevation
 * (in meters) of the point") and <time> (UTC). Built with the browser's
 * own XML document and serializer, as kml's.
 */

const GPX = "http://www.topografix.com/GPX/1/1";

/** The flight as GPX, a track segment for each run of reports. */
export function writeGpx(segments: SimSegment[], meta: SimMeta): string {
  const doc = xmlDocument(GPX, "gpx");
  const gpx = doc.documentElement;
  gpx.setAttribute("version", "1.1");
  gpx.setAttribute("creator", "Wingtip Maps");
  const desc = [
    meta.model && `Airplane: ${meta.model}${meta.icaoType ? ` (${meta.icaoType})` : ""}.`,
    meta.credit && `Reports: ${meta.credit}.`,
    segments[0] && altitudeWords(segments[0]).replace("feet", "metres"),
    ESTIMATED_WORDS,
  ]
    .filter(Boolean)
    .join(" ");
  const metadata = gpx.appendChild(doc.createElementNS(GPX, "metadata"));
  metadata.appendChild(xmlText(doc, GPX, "name", meta.title));
  metadata.appendChild(xmlText(doc, GPX, "desc", desc));
  const start = segments[0]?.rows[0];
  if (start) metadata.appendChild(xmlText(doc, GPX, "time", isoTime(start.t)));
  const trk = gpx.appendChild(doc.createElementNS(GPX, "trk"));
  trk.appendChild(xmlText(doc, GPX, "name", meta.tail ?? meta.title));
  for (const s of segments) {
    const seg = trk.appendChild(doc.createElementNS(GPX, "trkseg"));
    for (const r of s.rows) {
      const pt = seg.appendChild(doc.createElementNS(GPX, "trkpt"));
      pt.setAttribute("lat", r.lat.toFixed(7));
      pt.setAttribute("lon", r.lon.toFixed(7));
      pt.appendChild(xmlText(doc, GPX, "ele", (r.alt_ft * M_PER_FT).toFixed(1)));
      pt.appendChild(xmlText(doc, GPX, "time", isoTime(r.t)));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}\n`;
}
