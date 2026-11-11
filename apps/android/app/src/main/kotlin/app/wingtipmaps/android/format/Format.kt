package app.wingtipmaps.android.format

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Every figure the app writes, written one way: the web's lib/format and
 * the iPhone's formatter, held to the same examples
 * (apps/web/src/lib/fixtures/formats.json, generated from
 * design/tokens.json's `format` group; FormatTest). A screen asks for the
 * kind of figure, never a format string of its own. The figures are the
 * planner's or the engine's; this only writes them out.
 */
object Format {
    /** No figure, which is not zero. */
    const val NONE = "—"

    /** A cruising altitude on the cruise controls, the route's line and a
     *  leg's row: "FL-045", "FL-___" with none yet. FL below 18,000 ft is
     *  the owner's pick, knowingly against FAA usage (decision 0009). */
    fun cruiseAltitude(ft: Double?): String =
        if (ft == null) "FL-___" else "FL-" + String.format(Locale.US, "%03d", (ft / 100).roundToInt())

    /** An altitude on the map's weather: "FL045" (decision 0009). */
    fun mapLevel(ft: Double): String = "FL" + String.format(Locale.US, "%03d", (ft / 100).roundToInt())

    /** Any other altitude, height or elevation, in grouped feet: "4,500 ft". */
    fun altitude(ft: Double?): String = if (ft == null) NONE else String.format(Locale.US, "%,d ft", ft.roundToLong())

    /** The altitudes a route flies, lowest to highest: "3,500–5,500 ft". */
    fun altitudeRange(low: Double, high: Double): String =
        if (low.roundToLong() == high.roundToLong()) altitude(low)
        else String.format(Locale.US, "%,d–%,d ft", low.roundToLong(), high.roundToLong())

    /** A time aloft, a time left or an age, the narrow style: "1h 5m",
     *  "45m", "3h", "0m". */
    fun duration(minutes: Double): String {
        val whole = minutes.roundToInt()
        val h = whole / 60
        val m = whole % 60
        return when {
            h > 0 && m > 0 -> "${h}h ${m}m"
            h > 0 -> "${h}h"
            else -> "${m}m"
        }
    }

    /** A leg's time as a paper nav log writes it: "0:18", "1:35". */
    fun navLogTime(minutes: Double): String {
        val whole = minutes.roundToInt()
        return String.format(Locale.US, "%d:%02d", whole / 60, whole % 60)
    }

    private val ZULU = DateTimeFormatter.ofPattern("HHmm'Z'", Locale.US).withZone(ZoneOffset.UTC)

    /** A UTC clock time as reports and flight plans give it: "1432Z". */
    fun zulu(at: Instant): String = ZULU.format(at)

    fun zulu(iso: String): String = zulu(Instant.parse(iso))

    /** The clock where the phone is, "14:10", for a time down the strip. */
    fun clock(epochMs: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern("HH:mm", Locale.US).format(Instant.ofEpochMilli(epochMs).atZone(zone))

    /** A course, heading, track, radial or wind direction: three figures,
     *  whole degrees, north as 360 (FAA Order JO 7110.65, 2-4-17), "045°". */
    fun heading(deg: Double): String = headingFigures(deg) + "°"

    /** The same three figures without the degree sign, for a radial said
     *  ("the 360 radial") and the strip's "MH 318". */
    fun headingFigures(deg: Double): String {
        val whole = ((deg.roundToInt() % 360) + 360) % 360
        return String.format(Locale.US, "%03d", if (whole == 0) 360 else whole)
    }

    /** Nautical miles to a tenth, as the planner sends them: "102.4 nm". */
    fun distance(nm: Double?): String = if (nm == null) NONE else String.format(Locale.US, "%.1f nm", nm)

    /** An airspeed, a ground speed or a wind speed in whole knots: "110 kt". */
    fun speed(kt: Double?): String = if (kt == null) NONE else "${kt.roundToInt()} kt"

    /** Fuel in US gallons to a tenth: "12.0 gal". */
    fun fuel(gal: Double?): String = if (gal == null) NONE else String.format(Locale.US, "%.1f gal", gal)

    /** A fuel burn in gallons an hour to a tenth: "8.4 gph". */
    fun burn(gph: Double?): String = if (gph == null) NONE else String.format(Locale.US, "%.1f gph", gph)

    /** A weight in grouped pounds: "2,450 lb". */
    fun weight(lb: Double): String = String.format(Locale.US, "%,d lb", lb.roundToLong())

    /** A wind correction angle: plus to the right, a minus sign to the
     *  left, "+3°", "−3°", "0°". */
    fun windCorrection(deg: Double): String {
        val whole = deg.roundToInt()
        return when {
            whole > 0 -> "+$whole°"
            whole < 0 -> "−${-whole}°"
            else -> "0°"
        }
    }

    /** Magnetic variation as the sectional's isogonic lines write it
     *  (FAA-H-8083-25C, chapter 16): "5° E", "3° W", "0°". */
    fun variation(east: Double): String {
        val n = abs(east)
        val figure = if (n == n.roundToInt().toDouble()) n.roundToInt().toString() else String.format(Locale.US, "%.1f", n)
        return when {
            n == 0.0 -> "0°"
            east < 0 -> "$figure° W"
            else -> "$figure° E"
        }
    }

    /** An altimeter setting in inches of mercury to a hundredth, as ATIS
     *  and the METAR give it (AIM 7-2-2): "29.92 inHg". */
    fun altimeter(inHg: Double): String = String.format(Locale.US, "%.2f inHg", inHg)

    /** A visibility in statute miles as said, quarters as fractions (the
     *  web's lib/atis visibilityWords): "10 sm", "2½ sm", "¾ sm". */
    fun visibility(sm: Double): String {
        val whole = kotlin.math.floor(sm).toInt()
        val frac = sm - whole
        val part = when (frac) {
            0.25 -> "¼"
            0.5 -> "½"
            0.75 -> "¾"
            0.0 -> ""
            else -> String.format(Locale.US, "%.2f", frac).trimEnd('0').removePrefix("0")
        }
        return "${if (whole != 0 || part.isEmpty()) whole.toString() else ""}$part sm"
    }

    /** A forecast's ceiling and visibility, as the web's
     *  ceilingAndVisibility writes them: "800 ft · 2 sm", "no ceiling · 6 sm". */
    fun ceilingAndVisibility(ceilingFt: Double?, visibilitySm: Double?): String =
        (if (ceilingFt == null) "no ceiling" else String.format(Locale.US, "%,d ft", ceilingFt.roundToLong())) + " · " +
            (visibilitySm?.let(::visibility) ?: NONE)

    /** A temperature in whole degrees Celsius: "15 °C", "−3 °C". */
    fun temperature(c: Double): String {
        val whole = c.roundToInt()
        return if (whole < 0) "−${-whole} °C" else "$whole °C"
    }

    /** A frequency's megahertz as the cards write them: "118.3", "121.75",
     *  "122.0" (lib/frequencies mhzText). */
    fun frequency(mhz: Double): String =
        String.format(Locale.US, "%.3f", mhz).replace(Regex("""0{1,2}$"""), "")

    /** A place in degrees and minutes: "41°52.3′ N 87°37.8′ W". */
    fun position(lat: Double, lon: Double): String {
        fun part(v: Double, pos: String, neg: String): String {
            val a = abs(v)
            val d = a.toInt()
            return String.format(Locale.US, "%d°%04.1f′ %s", d, (a - d) * 60, if (v < 0) neg else pos)
        }
        return "${part(lat, "N", "S")} ${part(lon, "E", "W")}"
    }
}
