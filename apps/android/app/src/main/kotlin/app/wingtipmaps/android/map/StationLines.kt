package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.format.Format
import java.util.Locale
import kotlin.math.roundToInt

/**
 * A reporting field's weather as the map's marks take it (FieldWx), from
 * the planner's fields in view: its METAR as decoded today (the planner's
 * `weather`, wingtip.map_weather, no new reader), and the two short lines
 * the station model writes beside the field, the visibility with the
 * weather reported with it ("2 sm BR") and the ceiling as the METAR
 * codes its layer: the cover the planner sends (`ceiling_cover`: BKN, OVC
 * or VV, the layers that make a ceiling, 14 CFR 1.1) and its height in
 * hundreds of feet above the ground ("OVC 008", FAA-H-8083-28B 24.4.3.9), or "CIG 008"
 * where no cover came; "///" where the lowest layer was sent with no
 * height. How a figure is written is the app's; every rule the engine's.
 */
object StationLines {
    /** The field's weather, or null where it sends none. */
    fun fieldOf(pin: AirportPin): FieldWx? {
        val w = pin.weather ?: return null
        return FieldWx(
            ident = pin.ident, lat = pin.lat, lon = pin.lon, category = pin.flightCategory,
            windFromDeg = w.windDirTrueDeg, windKt = w.windSpeedKt, gustKt = w.windGustKt,
            leastCrosswindKt = w.crosswindKt,
            visibility = visibility(w.visibilitySm, w.wx),
            ceiling = ceiling(w.ceilingFt, w.ceilingUnknown == true, w.ceilingCover),
        )
    }

    /** "2 sm BR", "10 sm"; the weather alone where no visibility came. */
    fun visibility(sm: Double?, wx: String?): String? =
        listOfNotNull(sm?.let(Format::visibility), wx?.takeIf { it.isNotBlank() }).joinToString(" ").ifEmpty { null }

    /** "OVC 008" with the layer's cover (BKN, OVC, VV), else "CIG 008";
     *  "OVC ///" or "CIG ///" for a ceiling of no known height; none with
     *  no ceiling. */
    fun ceiling(ft: Double?, unknown: Boolean, cover: String? = null): String? {
        val word = cover?.trim()?.uppercase()?.takeIf { it in COVERS } ?: "CIG"
        return when {
            unknown -> "$word ///"
            ft == null -> null
            else -> String.format(Locale.US, "%s %03d", word, (ft / 100).roundToInt())
        }
    }

    /** The covers that make a ceiling (14 CFR 1.1: broken, overcast, or
     *  an obscuration's vertical visibility). */
    private val COVERS = setOf("BKN", "OVC", "VV")
}
