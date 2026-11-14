package app.wingtipmaps.android.about

/**
 * What About credits, in docs/legal/credits.md's order and words: the data
 * the app is made from (the USGS's, the aerial imagery close in,
 * CloseMap), then the maps and software the apps draw and write with
 * (MapLibre GL, Google's tiles, which only the web's overlay draws;
 * Apple MapKit is the iPhone's). Change credits.md first, then the web's
 * components/dataSources.ts, the iPhone's AboutView.swift and this, so the
 * three say the same. Each line says whose it is and the terms it is used
 * under, as the licences ask (ODbL 4.3 for adsb.lol, CDLA for Overture).
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
        Credit("US Census Bureau geocoder and gazetteer", PUBLIC_DOMAIN),
        Credit("OurAirports: fields abroad, fields NASR does not list, and field sizes", PUBLIC_DOMAIN),
        Credit("Overture Maps places: services near a field", "CDLA Permissive 2.0"),
        Credit("adsb.lol ADS-B traffic", "ODbL 1.0"),
        Credit("ADS-B Exchange traffic", "ADS-B Exchange's API terms"),
        Credit("adsb.fi ADS-B traffic", "Personal, non-commercial use, credited and linked"),
        Credit("Virtual Radar Server flight routes", "CC0"),
        Credit("Planespotters.net aircraft photos, each credited to its photographer beside it", "Planespotters.net's photo API terms"),
    )

    val software: List<Credit> = listOf(
        Credit("MapLibre GL", "BSD 3-Clause"),
        Credit("Google Maps Platform map tiles", "Google's terms; its attribution is drawn on the map"),
    )
}
