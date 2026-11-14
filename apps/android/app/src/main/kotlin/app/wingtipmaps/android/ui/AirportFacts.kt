package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.engine.generated.frequenciesInOrder
import app.wingtipmaps.android.engine.generated.fuelEstimate
import app.wingtipmaps.android.engine.generated.windCalm

/**
 * A field's card's facts row and its Fly Here's time, as the engine works
 * them: the distance from where the flight starts (own ship, else the
 * route's departure) by the engine's WGS 84 geodesic (`distance_nm`), the
 * minutes to fly it at the airplane's cruise speed with no wind
 * (`fuel_estimate`: the book's figures before the nav log's), and whether
 * the field's wind is calm (`wind_calm`). The distance is always said
 * where there is a start: from own ship, else "From KMSN" (`fromIdent`),
 * but not from the field itself: its own card, the departure, says no
 * "From KMSN 0 nm" with no fix to measure from. The METAR's wind is from the
 * true direction (FAA-H-8083-28B 24.4.3.5, the METAR's wind group). Nothing is worked
 * out here: with no airplane there is no time, and with nowhere to start
 * no distance. A rule that fails leaves its figure out.
 */
data class AirportFacts(
    val category: String?,
    val windFromDeg: Double?,
    val windKt: Double?,
    val gustKt: Double?,
    val calm: Boolean,
    val longestRunwayFt: Int?,
    val distanceNm: Double?,
    val minutes: Double?,
    /** The departure the distance is from; null where it is own ship's. */
    val fromIdent: String? = null,
    /** NASR's field elevation, feet MSL. */
    val elevationFt: Double? = null,
    /** How many runways are open with a length, so the strip says
     *  "Longest" over more than one and "Runway" over one. */
    val openRunways: Int = 0,
    /** Where the field has no report of its own, the category the strip
     *  shows marked "≈": the model's for this field, else a near station's. */
    val approximate: Approximate? = null,
) {
    /** Where the distance starts: own ship (no ident), else a departure. */
    data class From(val lat: Double, val lon: Double, val ident: String? = null)

    /** A category not the field's own: the National Weather Service's
     *  Gridded LAMP for the field (wingtip.glmp), or the nearest station's
     *  report within ten statute miles (`near`; wingtip.weather), named. */
    data class Approximate(val category: String, val station: String? = null)

    companion object {
        /** The field's frequencies in the order a pilot dials them, the
         *  engine's frequencies_in_order (the field's weather first); null
         *  where the engine could not say, and then as the planner sent them. */
        fun frequencyOrder(place: AirportPlace): List<Int>? =
            Engine.frequenciesInOrder(place.frequencies.map { EngineContract.FieldFrequency(type = it.type, description = it.description, frequencyMhz = it.frequencyMhz) })
                .getOrNull()?.filter { it in place.frequencies.indices }

        /** The category the card shows where the field has no report: the
         *  model's for the field first, as it is of this field, then a near
         *  station's (the web's PlaceCard). */
        fun approximate(place: AirportPlace): Approximate? {
            if (place.metar != null) return null
            place.modelledWeather?.let { return Approximate(it.flightCategory) }
            val near = place.nearbyMetar?.takeIf { it.near } ?: return null
            return near.metar.flightCategory?.let { Approximate(it, near.ident) }
        }

        /** `unusable`: the runways a NOTAM in force closes, by index, left
         *  out of the longest as the Runways tab leaves them. */
        fun of(place: AirportPlace, from: From?, cruiseTasKt: Double?, unusable: Set<Int> = emptySet()): AirportFacts {
            val metar = place.metar
            val open = place.runways.filterIndexed { i, r -> !r.closed && i !in unusable }
            val start = from?.takeUnless { it.ident != null && it.ident.equals(place.ident, ignoreCase = true) }
            val distance = start?.let { Engine.distanceNm(it.lat, it.lon, place.lat, place.lon).getOrNull() }
            val minutes = distance?.takeIf { cruiseTasKt != null }?.let { Engine.fuelEstimate(it, cruiseTasKt = cruiseTasKt).getOrNull()?.minutes }
            return AirportFacts(
                category = metar?.flightCategory,
                windFromDeg = metar?.windDirTrueDeg,
                windKt = metar?.windSpeedKt,
                gustKt = metar?.windGustKt,
                calm = metar?.windSpeedKt != null && Engine.windCalm(metar.windSpeedKt).getOrNull() == true,
                longestRunwayFt = open.mapNotNull { it.lengthFt }.maxOrNull(),
                distanceNm = distance,
                minutes = minutes,
                fromIdent = start?.ident,
                elevationFt = place.elevationFt,
                openRunways = open.count { it.lengthFt != null },
                approximate = approximate(place),
            )
        }
    }
}
