package app.wingtipmaps.android.about

/**
 * What About credits, in docs/legal/credits.md's order and words: the data
 * the app is made from (the USGS's, the aerial imagery close in,
 * CloseMap), then the maps and software the apps draw and write with
 * (MapLibre GL; Google's tiles are only the web's overlay's and Apple
 * MapKit the iPhone's, so neither is credited here). Change credits.md first, then the web's
 * components/dataSources.ts, the iPhone's AboutView.swift and this, so the
 * three say the same. Each line says whose it is and the terms it is used
 * under, as the licences ask (ODbL 4.3 for adsb.lol and OpenStreetMap's,
 * CDLA and Apache 2.0 for Overture). The open-source licences of the
 * libraries it ships with are AboutLibraries' (LicencesScreen).
 */
object AboutCredits {
    data class Credit(val what: String, val terms: String)

    private const val PUBLIC_DOMAIN = "Public domain"

    val data: List<Credit> = listOf(
        Credit("FAA aeronautical charts: sectional, terminal area and IFR enroute", PUBLIC_DOMAIN),
        Credit("FAA NASR: airports, runways, navaids, fixes and airspace", PUBLIC_DOMAIN),
        Credit("FAA CIFP procedures, d-TPP plates and the Digital Obstacle File", PUBLIC_DOMAIN),
        Credit("FAA aircraft registry", PUBLIC_DOMAIN),
        Credit("NTSB aviation accident database: accident and incident records", PUBLIC_DOMAIN),
        Credit("FAA SWIM: NOTAMs, flow programs, terminal data and airspace status", PUBLIC_DOMAIN),
        Credit("NOAA Aviation Weather Center: METARs, TAFs, PIREPs, SIGMETs and G-AIRMETs", PUBLIC_DOMAIN),
        Credit("NOAA models: GFS winds and temperatures aloft, GLMP, magnetic declination", PUBLIC_DOMAIN),
        Credit("NWS NEXRAD radar mosaic loop, via the Iowa Environmental Mesonet (Iowa State University); not for navigation, check official weather", PUBLIC_DOMAIN),
        Credit("NOAA GOES East and West satellite loop, via NOAA nowCOAST; not for navigation, check official weather", PUBLIC_DOMAIN),
        Credit("USGS The National Map imagery", PUBLIC_DOMAIN),
        Credit("USGS 3DEP elevation and GNIS place names", PUBLIC_DOMAIN),
        // The ground the altitudes are planned over: Terrain Tiles' attribution
        // list (github.com/tilezen/joerd, docs/attribution.md) asks each source's credit.
        Credit(
            "Terrain Tiles (Mapzen and others): 3DEP, SRTM and GMTED2010 courtesy of the U.S. Geological Survey, ETOPO1 of NOAA, " +
                "Canada's under the Open Government Licence – Canada, Mexico's from INEGI",
            "Each source's terms, credited",
        ),
        Credit("US Census Bureau geocoder and gazetteer", PUBLIC_DOMAIN),
        Credit("OurAirports: fields abroad, fields NASR does not list, and field sizes (runways, elevation and frequencies are NASR's wherever NASR lists the field)", PUBLIC_DOMAIN),
        // Overture's attribution page names each source's licence: Foursquare's are Apache 2.0.
        Credit("Overture Maps places: services near a field; Foursquare's places © 2024 Foursquare Labs, Inc.", "CDLA Permissive 2.0 and Apache 2.0"),
        Credit("OpenStreetMap contributors: airport outlines, through Overture Maps' base theme", "ODbL 1.0"),
        Credit("Time zones: timezone-boundary-builder, from OpenStreetMap contributors", "ODbL 1.0"),
        Credit("adsb.lol ADS-B traffic", "ODbL 1.0"),
        Credit("ADS-B Exchange traffic", "ADS-B Exchange's API terms"),
        Credit("adsb.fi ADS-B traffic", "Personal, non-commercial use, credited and linked"),
        Credit("Virtual Radar Server flight routes", "CC0"),
        Credit("Planespotters.net aircraft photos, each credited to its photographer beside it", "Planespotters.net's photo API terms"),
        // Each photo's author and licence beside it, its credit a link to its page.
        Credit("Wikimedia Commons photos of fields, each credited to its photographer with its licence and linked to its page", "Each photo's own licence"),
        Credit("FAA publications and the eCFR: the documents library's regulations, AIM, handbooks and advisory circulars", PUBLIC_DOMAIN),
    )

    val software: List<Credit> = listOf(
        Credit("MapLibre GL", "BSD 3-Clause"),
    )
}
