/** Where the app's data and maps come from, each with the terms it is
 *  used under (About), in docs/legal/credits.md's words and order, which
 *  the iPhone's and Android's About copy too: change that first. The
 *  FAA's, NOAA's, the USGS's and the Census Bureau's are works of the US
 *  government, which carry no copyright (17 U.S.C. 105); adsb.lol's is
 *  under the Open Database License, whose 4.3 asks for this credit;
 *  adsb.fi's for personal, non-commercial use, credited and linked;
 *  OurAirports puts its data in the public domain; Overture's places are
 *  CDLA Permissive 2.0, whose terms go with the data; Virtual Radar
 *  Server's routes are CC0. */
const PUBLIC_DOMAIN = "Public domain";

export const DATA_SOURCES: { name: string; licence: string; href?: string }[] = [
  { name: "FAA aeronautical charts: sectional, terminal area and IFR enroute", licence: PUBLIC_DOMAIN },
  { name: "FAA NASR: airports, runways, navaids, fixes and airspace", licence: PUBLIC_DOMAIN },
  { name: "FAA CIFP procedures, d-TPP plates and the Digital Obstacle File", licence: PUBLIC_DOMAIN },
  { name: "FAA aircraft registry", licence: PUBLIC_DOMAIN },
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
];

/** The maps and software the web app draws with (credits.md's second
 *  table; Apple MapKit is the iPhone's). */
export const SOFTWARE: { name: string; licence: string; href?: string }[] = [
  { name: "MapLibre GL", licence: "BSD 3-Clause", href: "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt" },
  { name: "Google Maps Platform map tiles", licence: "Google's terms; its attribution is drawn on the map" },
];
