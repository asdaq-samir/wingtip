import { altitudeWords, ESTIMATED_WORDS, isoTime, type SimMeta, type SimSegment } from "./flight";
import { M_PER_FT } from "../../geo";
import { xmlDocument, xmlText } from "./xml";

/*
 * KML tracks (OGC KML 2.2 and Google's gx extensions,
 * developers.google.com/kml/documentation/kmlreference#gxtrack): a
 * gx:Track is a list of <when> times and, in the same order and number,
 * <gx:coord> positions "longitude latitude altitude", altitude in metres
 * above sea level with altitudeMode "absolute" (gx:Track's default,
 * clampToGround, would lay the airplane on the ground). Built with the
 * browser's own XML document and serializer, which escape and close every
 * element, not by joining strings.
 *
 * Two shapes:
 * - Google Earth's: the whole flight as a gx:MultiTrack, one gx:Track a
 *   segment, gx:interpolate 0 so Google Earth leaves each gap empty
 *   rather than joining it.
 * - FlightAware's, which FlightControlReplay imports into Microsoft
 *   Flight Simulator (simMARKET's product page: "FlightAware KML") and
 *   Sky Dolly reads too (its FlightAwareKmlParser: a Placemark's gx:Track,
 *   only the first): one segment, one gx:Track, as FlightAware's own
 *   files have it.
 */

const KML = "http://www.opengis.net/kml/2.2";
const GX = "http://www.google.com/kml/ext/2.2";

function track(doc: XMLDocument, segment: SimSegment): Element {
  const el = doc.createElementNS(GX, "gx:Track");
  el.appendChild(xmlText(doc, KML, "altitudeMode", "absolute"));
  for (const r of segment.rows) el.appendChild(xmlText(doc, KML, "when", isoTime(r.t)));
  for (const r of segment.rows)
    el.appendChild(xmlText(doc, GX, "gx:coord", `${r.lon.toFixed(7)} ${r.lat.toFixed(7)} ${(r.alt_ft * M_PER_FT).toFixed(1)}`));
  return el;
}

function words(segments: SimSegment[], meta: SimMeta): string {
  return [
    `${meta.title}, exported from Wingtip Maps' Studio.`,
    meta.model && `Airplane: ${meta.model}${meta.icaoType ? ` (${meta.icaoType})` : ""}.`,
    meta.credit && `Reports: ${meta.credit}.`,
    segments[0] && altitudeWords(segments[0]).replace("feet", "metres"),
    ESTIMATED_WORDS,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The flight as KML: every segment for Google Earth, or the one segment
 *  as FlightAware writes it for FlightControlReplay. */
export function writeKml(segments: SimSegment[], meta: SimMeta, shape: "earth" | "flightaware"): string {
  const doc = xmlDocument(KML, "kml");
  const kml = doc.documentElement;
  kml.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:gx", GX);
  const top = kml.appendChild(doc.createElementNS(KML, "Document"));
  top.appendChild(xmlText(doc, KML, "name", meta.title));
  top.appendChild(xmlText(doc, KML, "description", words(segments, meta)));
  const placemark = top.appendChild(doc.createElementNS(KML, "Placemark"));
  placemark.appendChild(xmlText(doc, KML, "name", shape === "flightaware" ? (meta.tail ?? meta.title) : meta.title));
  if (shape === "flightaware") {
    if (segments[0]) placemark.appendChild(track(doc, segments[0]));
  } else {
    const multi = placemark.appendChild(doc.createElementNS(GX, "gx:MultiTrack"));
    multi.appendChild(xmlText(doc, KML, "altitudeMode", "absolute"));
    multi.appendChild(xmlText(doc, GX, "gx:interpolate", "0"));
    for (const s of segments) multi.appendChild(track(doc, s));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}\n`;
}
