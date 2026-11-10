package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.engine.generated.fuelEstimate
import app.wingtipmaps.android.engine.generated.windCalm

/**
 * A field's card's facts row and its Fly Here's time, as the engine works
 * them: the distance from where the flight starts (own ship, else the
 * route's departure) by the engine's WGS 84 geodesic (`distance_nm`), the
 * minutes to fly it at the airplane's cruise speed with no wind
 * (`fuel_estimate`: the book's figures before the nav log's), and whether
 * the field's wind is calm (`wind_calm`). The METAR's wind is from the
 * true direction (AC 00-45H, the METAR's wind group). Nothing is worked
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
) {
    companion object {
        fun of(place: AirportPlace, from: Pair<Double, Double>?, cruiseTasKt: Double?): AirportFacts {
            val metar = place.metar
            val distance = from?.let { (lat, lon) -> Engine.distanceNm(lat, lon, place.lat, place.lon).getOrNull() }
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
            )
        }
    }
}
