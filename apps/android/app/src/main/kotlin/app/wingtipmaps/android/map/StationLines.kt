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
 * weather reported with it ("2 sm BR") and the ceiling ("CIG 008", in
 * hundreds of feet above the ground as the METAR codes a layer, AC
 * 00-45H; "CIG ///" where the lowest layer was sent with no height, 14
 * CFR 1.1). How a figure is written is the app's; every rule the engine's.
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
            ceiling = ceiling(w.ceilingFt, w.ceilingUnknown == true),
        )
    }

    /** "2 sm BR", "10 sm"; the weather alone where no visibility came. */
    fun visibility(sm: Double?, wx: String?): String? =
        listOfNotNull(sm?.let(Format::visibility), wx?.takeIf { it.isNotBlank() }).joinToString(" ").ifEmpty { null }

    /** "CIG 008"; "CIG ///" for a ceiling of no known height; none with
     *  no ceiling. */
    fun ceiling(ft: Double?, unknown: Boolean): String? = when {
        unknown -> "CIG ///"
        ft == null -> null
        else -> String.format(Locale.US, "CIG %03d", (ft / 100).roundToInt())
    }
}
