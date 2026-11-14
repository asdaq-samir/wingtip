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
) {
    /** Where the distance starts: own ship (no ident), else a departure. */
    data class From(val lat: Double, val lon: Double, val ident: String? = null)

    companion object {
        /** The field's frequencies in the order a pilot dials them, the
         *  engine's frequencies_in_order (the field's weather first); null
         *  where the engine could not say, and then as the planner sent them. */
        fun frequencyOrder(place: AirportPlace): List<Int>? =
            Engine.frequenciesInOrder(place.frequencies.map { EngineContract.FieldFrequency(type = it.type, description = it.description, frequencyMhz = it.frequencyMhz) })
                .getOrNull()?.filter { it in place.frequencies.indices }

        fun of(place: AirportPlace, from: From?, cruiseTasKt: Double?): AirportFacts {
            val metar = place.metar
            val start = from?.takeUnless { it.ident != null && it.ident.equals(place.ident, ignoreCase = true) }
            val distance = start?.let { Engine.distanceNm(it.lat, it.lon, place.lat, place.lon).getOrNull() }
            val minutes = distance?.takeIf { cruiseTasKt != null }?.let { Engine.fuelEstimate(it, cruiseTasKt = cruiseTasKt).getOrNull()?.minutes }
            return AirportFacts(
                category = metar?.flightCategory,
                windFromDeg = metar?.windDirTrueDeg,
                windKt = metar?.windSpeedKt,
                gustKt = metar?.windGustKt,
                calm = metar?.windSpeedKt != null && Engine.windCalm(metar.windSpeedKt).getOrNull() == true,
                longestRunwayFt = place.runways.filterNot { it.closed }.mapNotNull { it.lengthFt }.maxOrNull(),
                distanceNm = distance,
                minutes = minutes,
                fromIdent = start?.ident,
            )
        }
    }
}
