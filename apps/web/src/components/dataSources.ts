/** Where the app's data and maps come from, each with the terms it is
 *  used under (About), in docs/legal/credits.md's words and order, which
 *  the iPhone's and Android's About copy too: change that first. The
 *  FAA's, NOAA's, the USGS's and the Census Bureau's are works of the US
 *  government, which carry no copyright (17 U.S.C. 105); adsb.lol's is
 *  under the Open Database License, whose 4.3 asks for this credit;
 *  adsb.fi's for personal, non-commercial use, credited and linked;
 *  OurAirports puts its data in the public domain; Overture's places are
 *  CDLA Permissive 2.0, whose terms go with the data; Virtual Radar
 *  Server's routes are CC0; the NTSB's records are a
 *  government work too, and Planespotters.net's photos are credited to each
 *  photographer beside the photo, as its terms ask. */
const PUBLIC_DOMAIN = "Public domain";

export const DATA_SOURCES: { name: string; licence: string; href?: string }[] = [
  { name: "FAA aeronautical charts: sectional, terminal area and IFR enroute", licence: PUBLIC_DOMAIN },
  { name: "FAA NASR: airports, runways, navaids, fixes and airspace", licence: PUBLIC_DOMAIN },
  { name: "FAA CIFP procedures, d-TPP plates and the Digital Obstacle File", licence: PUBLIC_DOMAIN },
  { name: "FAA aircraft registry", licence: PUBLIC_DOMAIN },
  { name: "NTSB aviation accident database: accident and incident records", licence: PUBLIC_DOMAIN },
  { name: "FAA SWIM: NOTAMs, flow programs, terminal data and airspace status", licence: PUBLIC_DOMAIN },
  { name: "NOAA Aviation Weather Center: METARs, TAFs, PIREPs, SIGMETs and G-AIRMETs", licence: PUBLIC_DOMAIN },
  { name: "NOAA models: GFS winds and temperatures aloft, GLMP, magnetic declination", licence: PUBLIC_DOMAIN },
  // The map's radar and satellite loop (features/weather-loop): IEM asks to be credited.
  {
    name: "NWS NEXRAD radar mosaic loop, via the Iowa Environmental Mesonet (Iowa State University); not for navigation, check official weather",
    licence: PUBLIC_DOMAIN,
    href: "https://mesonet.agron.iastate.edu/disclaimer.php",
  },
  {
    name: "NOAA GOES East and West satellite loop, via NOAA nowCOAST; not for navigation, check official weather",
    licence: PUBLIC_DOMAIN,
    href: "https://nowcoast.noaa.gov",
  },
  { name: "USGS The National Map imagery", licence: PUBLIC_DOMAIN },
  { name: "US Census Bureau geocoder and gazetteer", licence: PUBLIC_DOMAIN },
  {
    name: "OurAirports: fields abroad, fields NASR does not list, and field sizes",
    licence: PUBLIC_DOMAIN,
    href: "https://ourairports.com/data/",
  },
  { name: "Overture Maps places: services near a field", licence: "CDLA Permissive 2.0", href: "https://cdla.dev/permissive-2-0/" },
  { name: "adsb.lol ADS-B traffic", licence: "ODbL 1.0", href: "https://opendatacommons.org/licenses/odbl/1-0/" },
  { name: "ADS-B Exchange traffic", licence: "ADS-B Exchange's API terms", href: "https://www.adsbexchange.com" },
  // Its terms ask for its name and a link to its home page.
  { name: "adsb.fi ADS-B traffic", licence: "Personal, non-commercial use, credited and linked", href: "https://adsb.fi" },
  { name: "Virtual Radar Server flight routes", licence: "CC0", href: "https://creativecommons.org/publicdomain/zero/1.0/" },
  // Its terms ask for the photographer's name next to each photo and a link to the photo's page.
  {
    name: "Planespotters.net aircraft photos, each credited to its photographer beside it",
    licence: "Planespotters.net's photo API terms",
    href: "https://www.planespotters.net",
  },
];

/** The maps and software the web app draws with (credits.md's second
 *  table; Apple MapKit is the iPhone's). */
export const SOFTWARE: { name: string; licence: string; href?: string }[] = [
  { name: "MapLibre GL", licence: "BSD 3-Clause", href: "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt" },
  { name: "Google Maps Platform map tiles", licence: "Google's terms; its attribution is drawn on the map" },
];

/** What the Open Database License asks of a map that draws adsb.lol's
 *  data: its source and the licence, named. Not a link: on the map's edge
 *  over the panel a link has no room for a 44-point hit area, and the
 *  console's About links adsb.lol with its licence. */
const ATTRIBUTION = "Traffic adsb.lol, ODbL";

/** Each source the planner names (wingtip.traffic: "adsb.lol and adsb.fi"),
 *  credited as its terms ask: adsb.fi's by its name, linked in the
 *  console's About. */
const CREDITS: Record<string, string> = { "adsb.lol": ATTRIBUTION, "ADS-B Exchange": "ADS-B Exchange", "adsb.fi": "adsb.fi" };

/** The map's traffic credit for the planner's `source`: adsb.lol's
 *  where it names none it knows. */
export function trafficCredit(source: string | undefined): string {
  const named = (source ?? "adsb.lol")
    .split(" and ")
    .map((s) => CREDITS[s])
    .filter((c): c is string => !!c);
  if (!named.length) return ATTRIBUTION;
  return named[0] === ATTRIBUTION ? [ATTRIBUTION, ...named.slice(1)].join(" · ") : `Traffic ${named.join(" · ")}`;
}
