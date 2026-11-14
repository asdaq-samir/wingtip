package app.wingtipmaps.android.emergency

import app.wingtipmaps.android.api.AirportPin
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.generated.EmergencyAirplane
import app.wingtipmaps.android.api.generated.EmergencyField
import app.wingtipmaps.android.api.generated.EmergencyFields
import app.wingtipmaps.android.api.generated.GlideFigures
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.airportsInView
import app.wingtipmaps.android.engine.generated.bearingDeg
import app.wingtipmaps.android.engine.generated.distanceNm
import kotlin.math.cos

/**
 * The fields round the airplane from the cycle packs kept on the phone,
 * for the emergency assistant and Nearest when the planner cannot be
 * reached (the offline audit's gap 2): the same fields the map draws with
 * no signal (InView's airportsInView), each with the engine's miles and
 * course to it (`distance_nm`, `bearing_deg`). The engine's best_fields
 * then ranks them on the phone as it ranks the planner's.
 *
 * What the packs do not hold is left out, never guessed: no METAR (so no
 * wind and no flight category), no runways, no frequencies and no phone.
 * A field's height is the packs' terrain grid under it: the highest
 * ground in the grid's cell with the grid's margin added (the engine's
 * ahead.rs `ground_ft`), never below the field, so a glide's reach worked
 * from it is on the short side, never the long.
 */
object PhoneFields {
    /** Half the box first asked, degrees of latitude: about 30 nm, past a
     *  light single's still-air glide from 10,000 ft above the ground. */
    const val HALF_DEG = 0.5

    /** The widest box asked where the first holds too few fields: about
     *  120 nm each way. */
    const val WIDEST_DEG = 2.0

    /** A field and the engine's miles and course to it from the airplane. */
    data class Near(val pin: AirportPin, val distanceNm: Double, val bearingDeg: Double, val groundFt: Double?)

    /** The `want` nearest fields round the point, nearest first, the box
     *  widened until it holds that many or reaches WIDEST_DEG; null where no
     *  pack covers the point at all. */
    fun near(packs: CyclePacks, lat: Double, lon: Double, want: Int): List<Near>? {
        var half = HALF_DEG
        while (true) {
            // A degree of longitude is shorter by the cosine of the latitude.
            val across = half / cos(Math.toRadians(lat)).coerceAtLeast(0.2)
            val pins = packs.airportsInView(lat - half, lon - across, lat + half, lon + across) ?: return null
            if (pins.size >= want || half >= WIDEST_DEG) return nearest(pins, want) { measure(packs, lat, lon, it) }
            half *= 2
        }
    }

    /** The pins nearest first, at most `want`; one the engine could not
     *  measure left out. */
    fun nearest(pins: List<AirportPin>, want: Int, measure: (AirportPin) -> Near?): List<Near> =
        pins.mapNotNull(measure).sortedBy { it.distanceNm }.take(want)

    private fun measure(packs: CyclePacks, lat: Double, lon: Double, pin: AirportPin): Near? {
        val nm = Engine.distanceNm(lat, lon, pin.lat, pin.lon).getOrNull() ?: return null
        val course = Engine.bearingDeg(lat, lon, pin.lat, pin.lon).getOrNull() ?: return null
        // Standing still at the field: the packs' ahead answers only its ground.
        val ground = packs.ahead(pin.lat, pin.lon, 0.0, 0.0, null)?.groundFt
        return Near(pin, nm, course, ground)
    }

    /** The planner's /api/emergency/fields answer as the packs can give it:
     *  no wind aloft, and the airplane only by the pilot's own glide ratio
     *  (none: no glide is guessed, decision 0011). */
    fun emergency(near: List<Near>, airplaneName: String?, glideRatio: Double?): EmergencyFields =
        EmergencyFields(
            airplane = glideRatio?.let { EmergencyAirplane(name = airplaneName.orEmpty(), glide = GlideFigures(ratio = it)) },
            fields = near.map { n ->
                EmergencyField(
                    bearingDeg = n.bearingDeg, distanceNm = n.distanceNm, elevationFt = n.groundFt, ident = n.pin.ident,
                    // The packs' use as it comes ("military", "joint" or none):
                    // best_fields words a joint-use field as the public one
                    // it is (NASR FACILITY_USE_CODE PU), never "Military field".
                    lat = n.pin.lat, lon = n.pin.lon, military = n.pin.military, name = n.pin.name,
                    isPrivate = n.pin.isPrivate, runways = emptyList(), towered = n.pin.towered,
                )
            },
        )

    /** The planner's /api/nearest rows as the packs can give them. */
    fun nearestRows(near: List<Near>): List<NearestAirport> =
        near.map { n ->
            NearestAirport(
                bearingDeg = n.bearingDeg, distanceNm = n.distanceNm, elevationFt = n.groundFt, ident = n.pin.ident, kind = n.pin.kind,
                lat = n.pin.lat, lon = n.pin.lon, military = n.pin.military, name = n.pin.name, isPrivate = n.pin.isPrivate,
                towered = n.pin.towered, airspaceClass = n.pin.airspaceClass, primaryOf = n.pin.primaryOf,
            )
        }

    /** The fields round the airplane for the emergency assistant, from the
     *  packs; null with none kept there. */
    fun emergencySource(packs: () -> CyclePacks?, airplaneName: () -> String?): EmergencySource =
        EmergencySource { lat, lon, _, _, glideRatio ->
            val kept = packs() ?: throw NoPacks()
            val near = near(kept, lat, lon, EMERGENCY_FIELDS) ?: throw NoPacks()
            emergency(near, airplaneName(), glideRatio)
        }

    /** No cycle pack covers the airplane's position. */
    class NoPacks : Exception("No chart data is kept on this phone for here.")

    /** As many fields as the planner's answer lists. */
    const val EMERGENCY_FIELDS = 20
}
