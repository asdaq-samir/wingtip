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
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.bestFields
import app.wingtipmaps.android.engine.generated.fieldsNear

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
    /** A field and the engine's miles and course to it from the airplane. */
    data class Near(val pin: AirportPin, val distanceNm: Double, val bearingDeg: Double, val groundFt: Double?)

    /** The packs' fields in a box (south, west, north, east); null where no
     *  pack covers it. */
    fun interface Pins {
        fun inBox(south: Double, west: Double, north: Double, east: Double): List<AirportPin>?
    }

    /** The `want` fields round the point, the engine's best_fields' order;
     *  null where no pack covers the point at all; the engine's failure thrown. */
    fun near(packs: CyclePacks, lat: Double, lon: Double, want: Int): List<Near>? {
        val pins = read(lat, lon, want) { s, w, n, e -> packs.airportsInView(s, w, n, e) } ?: return null
        // Standing still at the field: the packs' ahead answers only its ground.
        return ranked(pins, lat, lon, want) { packs.ahead(it.lat, it.lon, 0.0, 0.0, null)?.groundFt }
    }

    /**
     * The packs' fields round the point in the box the engine's fields_near
     * gives, the one rule both phones read their boxes by: asked first with
     * no box, then again with the count found, until it answers null (enough
     * fields, or its widest box). Null where no pack covers a box asked, or
     * the engine gave no first box. The engine's own failure is thrown, as
     * the iPhone's PackFields throws it, never read as no pack here.
     */
    fun read(lat: Double, lon: Double, want: Int, pins: Pins): List<AirportPin>? {
        val at = EngineContract.FieldsNearInputAt(lat, lon)
        var found: List<AirportPin>? = null
        var half: Double? = null
        while (true) {
            val box = Engine.fieldsNear(at, want.toDouble(), half, found?.size?.toDouble()).getOrThrow().box ?: return found
            found = pins.inBox(box.south, box.west, box.north, box.east) ?: return null
            half = box.halfDeg
        }
    }

    /** The pins as best_fields' candidates: no elevation, runway or METAR,
     *  which the packs do not hold, the use as the packs give it. The packs
     *  hold open fields only (NASR ARPT_STATUS O), so no status is sent. */
    fun candidates(pins: List<AirportPin>): List<EngineContract.BestFieldsInputFieldsItem> =
        pins.map {
            EngineContract.BestFieldsInputFieldsItem(
                ident = it.ident, name = it.name, lat = it.lat, lon = it.lon, runways = emptyList(),
                towered = it.towered, private = it.isPrivate, military = it.military,
            )
        }

    /**
     * The pins ranked by the engine's best_fields in glide mode with no
     * airplane, as the iPhone's PackFields ranks them: nearest first, each
     * with the engine's distance and true course; at most `want`. Empty
     * where the engine could not rank them (it logs why).
     */
    fun ranked(pins: List<AirportPin>, lat: Double, lon: Double, want: Int, ground: (AirportPin) -> Double?): List<Near> {
        if (pins.isEmpty()) return emptyList()
        val answer = Engine.bestFields(mode = "glide", at = EngineContract.BestFieldsInputAt(lat, lon), fields = candidates(pins), limit = want.toDouble())
            .getOrNull() ?: return emptyList()
        val byIdent = pins.associateBy { it.ident }
        return answer.fields.mapNotNull { f -> byIdent[f.ident]?.let { Near(it, f.distanceNm, f.courseDeg, ground(it)) } }
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
