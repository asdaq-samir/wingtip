# Credits and attributions

Draft for the owner to review.

The list each app's About screen shows, in this order and these words:
the web's `components/dataSources.ts`, the iPhone's `Views/AboutView.swift`
and Android's `about/AboutCredits.kt` copy it. Change it here first, then in
all three. Each line says what the data or software is, whose it is, and
the terms it is used under.

## Data

| Credit | Terms | Why the credit |
|---|---|---|
| FAA aeronautical charts: sectional, terminal area and IFR enroute | Public domain | Works of the US government carry no copyright (17 U.S.C. 105) |
| FAA NASR: airports, runways, navaids, fixes and airspace | Public domain | As above |
| FAA CIFP procedures, d-TPP plates and the Digital Obstacle File | Public domain | As above |
| FAA aircraft registry | Public domain | As above |
| NTSB aviation accident database: accident and incident records | Public domain | As above |
| FAA SWIM: NOTAMs, flow programs, terminal data and airspace status | Public domain | As above; reached under the FAA's SWIM access agreement, which asks that the aircraft on the FAA's LADD list be left out of what is shown (`wingtip.traffic.ladd`; docs/DATA.md) |
| NOAA Aviation Weather Center: METARs, TAFs, PIREPs, SIGMETs and G-AIRMETs | Public domain | As above |
| NOAA models: GFS winds and temperatures aloft, GLMP, magnetic declination | Public domain | As above |
| NWS NEXRAD radar mosaic loop, via the Iowa Environmental Mesonet (Iowa State University); not for navigation, check official weather | Public domain | IEM's terms put its products in the public domain and ask that it be credited |
| NOAA GOES East and West satellite loop, via NOAA nowCOAST; not for navigation, check official weather | Public domain | As above for NOAA's; nowCOAST asks no fees and sets no constraints |
| USGS The National Map imagery | Public domain | As above; the aerial imagery close in on the web and Android, "Imagery USGS The National Map" |
| USGS 3DEP elevation and GNIS place names | Public domain | As above; the USGS asks to be credited |
| Terrain Tiles (Mapzen and others): 3DEP, SRTM and GMTED2010 courtesy of the U.S. Geological Survey, ETOPO1 of NOAA, Canada's under the Open Government Licence – Canada, Mexico's from INEGI | Each source's terms, credited | The ground the altitudes are planned over and the map's relief and 3D; Terrain Tiles' attribution list asks each source's credit |
| US Census Bureau geocoder and gazetteer | Public domain | As above |
| OurAirports: fields abroad, fields NASR does not list, and field sizes (runways, elevation and frequencies are NASR's wherever NASR lists the field) | Public domain | OurAirports dedicates its data to the public domain |
| Overture Maps places: services near a field; Foursquare's places © 2024 Foursquare Labs, Inc. | CDLA Permissive 2.0 and Apache 2.0 | Overture's attribution page names each source's licence; Foursquare's places come under Apache 2.0 with its notice |
| OpenStreetMap contributors: airport outlines, through Overture Maps' base theme | ODbL 1.0 | ODbL 4.3 asks for this credit where a field's places are told on or off the field by its outline |
| Time zones: timezone-boundary-builder, from OpenStreetMap contributors | ODbL 1.0 | ODbL 4.3; a field's local time (tzfpy carries this data) |
| adsb.lol ADS-B traffic | ODbL 1.0 | ODbL 4.3 asks for this credit; asked with the deployment's key (`ADSBLOL_API_KEY`) within its day's quota, and not again until a 429's Retry-After has passed |
| ADS-B Exchange traffic | ADS-B Exchange's API terms | Credited as its terms ask; its RapidAPI plan is for personal use, so production leaves it off (no `ADSBX_RAPIDAPI_KEY`) until an enterprise agreement with JETNET allows the app's pilots to see it |
| adsb.fi ADS-B traffic | Personal, non-commercial use, credited and linked | adsb.fi's terms; production leaves it off (`ADSBFI_OPEN_DATA=0`) until adsb.fi agrees |
| Virtual Radar Server flight routes | CC0 | None owed; credited by choice |
| Planespotters.net aircraft photos, each credited to its photographer beside it | Planespotters.net's photo API terms | Its terms ask for the photographer's name next to each photo and a link to the photo's page |
| Wikimedia Commons photos of fields, each credited to its photographer with its licence and linked to its page | Each photo's own licence | Commons' licences (CC BY, CC BY-SA) ask for the author, the licence and where it is from |

## Maps and software

| Credit | Terms | Where |
|---|---|---|
| MapLibre GL | BSD 3-Clause | The web map and the Android map |
| Apple MapKit | Apple's terms | The iPhone's map under the chart |
| Google Maps Platform map tiles | Google's terms; its attribution, Google's own Google Maps logo and the data's copyright, is drawn on the map | The web's Google overlay where it is turned on |

## Open-source licences

Each app also lists every open-source library it ships with that library's
own licence and notices, written at build time from the dependencies' own
metadata by a stock tool, never by hand:

- **The web:** `npm run licences` (license-checker-rseidelsohn over the
  production dependencies, then the engine's notices) writes
  `/app/licences.txt`, which About's "Open-Source Licences" opens. The web's
  build runs it first and fails on a licence outside its allow list.
- **The iPhone:** LicensePlist writes the acknowledgements into
  `Settings.bundle` (Settings › Wingtip Maps › Acknowledgements, which
  About's "Acknowledgements" opens) from the Swift packages' checkouts, with
  the engine's notices and the NOTICE files Apache 2.0 asks for
  (`apps/ios/license_plist.yml`); the iPhone's CI job fails where they are
  stale (`scripts/build/licences.sh ios --check`).
- **Android:** AboutLibraries collects every Gradle library's licence as
  the app is built and fails the build on one not allowed
  (`aboutLibraries` in `app/build.gradle.kts`); About's "Open-Source
  Licences" shows them with Material's own list. The engine's notices and
  Inter's (the map's label glyphs) are added from `app/aboutlibraries`.
- **The engine** (in all three): cargo-about writes
  `engine/licences/NOTICES.txt` from `Cargo.lock`, accepting only the
  licences `engine/about.toml` lists; the guards fail where it is stale or
  a crate's licence is not accepted (`scripts/build/licences.sh engine`).

No GPL, LGPL or AGPL code ships in an app. JNA, which Android loads the
engine through, is offered under LGPL 2.1 or Apache 2.0 and is used under
Apache 2.0; uniffi (MPL 2.0) is used unmodified, and its notice names where
its source is. The servers run nothing under the AGPL.

## A planning aid

Every app says the same words, from the web's `components/planningAid.ts`:

> Wingtip Maps is a planning aid for VFR and IFR flight. It does not
> replace an official weather briefing (1800wxbrief.com or 1-800-WX-BRIEF),
> current FAA charts and publications, or the pilot in command's judgement
> and final authority (14 CFR 91.3, 91.103). Its checkpoints are a model's
> suggestions: check them against the chart. Before flight, verify current
> weather, NOTAMs, TFRs, airport status, aircraft performance, and
> applicable regulations (14 CFR 91.103).

and, where there is room for one line only, "A planning aid — not for
navigation."
