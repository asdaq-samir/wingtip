package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors

/**
 * What a reporting field's symbol wears for its weather, by the airport
 * weather setting (AirportWeather): the "pip" part of its picture's id
 * (MapStyle.airportMarkId), which OverlayPictures draws. "" is the bare
 * symbol; "h" and a colour a ring in that colour round the symbol (every
 * choice but Off; the station model sits beside the ring). The ring is
 * part of the symbol's own picture, so a field the
 * chart's give-way hides (MapLibre's collision in `rank` order) hides its
 * weather with it.
 */
object AirportWeatherMarks {
    /** Each flight category's colour, the brand's category tokens (the
     *  web's lib/map/flightCategory CATEGORY_COLOURS): green good, blue
     *  marginal, red instrument, purple worse, in the colours a pilot
     *  already reads them in. The category itself is the engine's
     *  (`flight_category`, AIM 7-1-7), asked by the planner; only its
     *  colour is the app's. */
    val CATEGORY_COLOURS: Map<String, String> = linkedMapOf(
        "VFR" to WingtipColors.Category.VFR_HEX,
        "MVFR" to WingtipColors.Category.MVFR_HEX,
        "IFR" to WingtipColors.Category.IFR_HEX,
        "LIFR" to WingtipColors.Category.LIFR_HEX,
    )

    private const val HALO = "h"

    /** A mark whose METAR was heard longer ago than the engine's freshness
     *  for a METAR (kept_age's "weather", the routine report's hour, AIM
     *  7-1-28): the chart's grey for a field not known, in place of its
     *  category's colour, so an old category is never read as now's. */
    const val STALE = WingtipColors.Chart.FIELD_UNKNOWN_HEX

    /** Every pip a symbol can wear, for its pictures: none, and each
     *  category's ring, and the stale grey's. */
    val PIPS: List<String> = listOf("") + (CATEGORY_COLOURS.values + STALE).map { HALO + it }

    /** A field's pip by its METAR's category and the setting; none where
     *  the weather is off, it has no report, or a category the map has
     *  no colour for. */
    fun pipOf(category: String?, mode: AirportWeatherMode, stale: Boolean = false): String {
        val colour = category?.let { CATEGORY_COLOURS[it] }?.let { if (stale) STALE else it } ?: return ""
        return if (mode == AirportWeatherMode.OFF) "" else HALO + colour
    }

    /** Each field's pip by ident, from each field's category by ident; a
     *  field in `stale` greyed. */
    fun pips(categories: Map<String, String>, mode: AirportWeatherMode, stale: Set<String> = emptySet()): Map<String, String> =
        if (mode == AirportWeatherMode.OFF) emptyMap() else categories.mapValues { pipOf(it.value, mode, it.key in stale) }.filterValues { it.isNotEmpty() }

    /** A pip's colour, "#rrggbb"; null for none. */
    fun inkOf(pip: String): String? = pip.drop(1).takeIf { it.startsWith("#") }
}
