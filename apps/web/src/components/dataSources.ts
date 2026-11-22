/** Where the app's data and maps come from, each with the terms it is
 *  used under (About), in docs/legal/credits.md's words and order, which
 *  the iPhone's and Android's About copy too: change that first. The
 *  FAA's, NOAA's, the USGS's and the Census Bureau's are works of the US
 *  government, which carry no copyright (17 U.S.C. 105); adsb.lol's is
 *  under the Open Database License, whose 4.3 asks for this credit, as do
 *  OpenStreetMap's airport outlines and the time zones;
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
  { name: "USGS 3DEP elevation and GNIS place names", licence: PUBLIC_DOMAIN },
  // The ground the altitudes are planned over, and the map's relief and 3D
  // (the planner's /api/terrain-tile): Terrain Tiles' attribution list
  // (github.com/tilezen/joerd, docs/attribution.md) asks each source's credit.
  {
    name: "Terrain Tiles (Mapzen and others): 3DEP, SRTM and GMTED2010 courtesy of the U.S. Geological Survey, ETOPO1 of NOAA, Canada's under the Open Government Licence – Canada, Mexico's from INEGI",
    licence: "Each source's terms, credited",
    href: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md",
  },
  { name: "US Census Bureau geocoder and gazetteer", licence: PUBLIC_DOMAIN },
  {
    name: "OurAirports: fields abroad, fields NASR does not list, and field sizes",
    licence: PUBLIC_DOMAIN,
    href: "https://ourairports.com/data/",
  },
  // Overture's places come from several sources (docs.overturemaps.org/attribution):
  // most CDLA Permissive 2.0, Foursquare's Apache 2.0 with its notice.
  {
    name: "Overture Maps places: services near a field; Foursquare's places © 2024 Foursquare Labs, Inc.",
    licence: "CDLA Permissive 2.0 and Apache 2.0",
    href: "https://docs.overturemaps.org/attribution/",
  },
  // A place on or off the field by the airport's outline: OpenStreetMap's, ODbL 4.3.
  {
    name: "OpenStreetMap contributors: airport outlines, through Overture Maps' base theme",
    licence: "ODbL 1.0",
    href: "https://www.openstreetmap.org/copyright",
  },
  // A field's local time (the planner's tzfpy, whose data is this, ODbL).
  {
    name: "Time zones: timezone-boundary-builder, from OpenStreetMap contributors",
    licence: "ODbL 1.0",
    href: "https://github.com/evansiroky/timezone-boundary-builder",
  },
  { name: "adsb.lol ADS-B traffic", licence: "ODbL 1.0", href: "https://opendatacommons.org/licenses/odbl/1-0/" },
  { name: "ADS-B Exchange traffic", licence: "ADS-B Exchange's API terms", href: "https://www.adsbexchange.com" },
  { name: "Virtual Radar Server flight routes", licence: "CC0", href: "https://creativecommons.org/publicdomain/zero/1.0/" },
  // Its terms ask for the photographer's name next to each photo and a link to the photo's page.
  {
    name: "Planespotters.net aircraft photos, each credited to its photographer beside it",
    licence: "Planespotters.net's photo API terms",
    href: "https://www.planespotters.net",
  },
  // Each photo's author, licence and page beside it (PhotoSlide's credit).
  {
    name: "Wikimedia Commons photos of fields, each credited to its photographer with its licence and linked to its page",
    licence: "Each photo's own licence",
    href: "https://commons.wikimedia.org",
  },
];

/** The maps and software the web app draws with (credits.md's second
 *  table; Apple MapKit is the iPhone's). */
export const SOFTWARE: { name: string; licence: string; href?: string }[] = [
  { name: "MapLibre GL", licence: "BSD 3-Clause", href: "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt" },
  { name: "Google Maps Platform map tiles", licence: "Google's terms; its attribution is drawn on the map" },
];

/** The open-source licences of every package the page is made with, the
 *  engine's crates among them, which each build writes beside the page
 *  (vite-plugins/licences.ts; docs/legal/credits.md, "Open-source
 *  licences"). */
export const LICENCES_HREF = "/app/licences.txt";

/** What the Open Database License asks of a map that draws adsb.lol's
 *  data: its source and the licence, named. Not a link: on the map's edge
 *  over the panel a link has no room for a 44-point hit area, and the
 *  console's About links adsb.lol with its licence. */
const ATTRIBUTION = "Traffic adsb.lol, ODbL";

/** Each source the planner names (wingtip.traffic: "adsb.lol and ADS-B
 *  Exchange"), credited as its terms ask. */
const CREDITS: Record<string, string> = { "adsb.lol": ATTRIBUTION, "ADS-B Exchange": "ADS-B Exchange" };

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
