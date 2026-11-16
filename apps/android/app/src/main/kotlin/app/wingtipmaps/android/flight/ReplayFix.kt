package app.wingtipmaps.android.flight

/** One end of a stretch between two reports: where, how high, which way, how fast. */
data class ReportEnd(val lat: Double, val lon: Double, val altFt: Double?, val trackDeg: Double?, val gsKt: Double?)

/**
 * The airplane a fraction `f` of the way from report `a` to `b`, at `t` s
 * since 1970, as the map draws own ship: place and height in proportion,
 * track and speed the earlier report's. A replay's or a rehearsal's, not
 * a fix, so its accuracy is nil. One home for the two that play a path.
 */
fun fixBetween(a: ReportEnd, b: ReportEnd, f: Double, t: Double, heights: Boolean = true): OwnShip.Fix {
    val alt = if (!heights) null else if (a.altFt != null && b.altFt != null) a.altFt + (b.altFt - a.altFt) * f else a.altFt
    return OwnShip.Fix(
        lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f, altitudeFt = alt,
        trackDeg = a.trackDeg, groundspeedKt = a.gsKt, accuracyM = 0.0, atMs = (t * 1000).toLong(),
    )
}
