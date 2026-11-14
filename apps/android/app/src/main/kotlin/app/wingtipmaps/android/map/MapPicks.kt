package app.wingtipmaps.android.map

import kotlinx.serialization.Serializable

/**
 * What a tap on the map picked, from the tapped feature's own fields, as
 * the web's glOverlays builds a card from a feature (volumeOfTile,
 * vorOfTile, pointOf): the overlay tiles carry what each card needs
 * (wingtip.vector_tiles' fields), so nothing is asked of the planner for
 * a VOR, a fix, a waypoint or an airspace volume; a field's card asks the
 * planner for the field as it opens (AirportModel.open), as the web's.
 * Plain Kotlin from a feature's properties as a map, so the tests read
 * them with no map. Serializable, so a thing's card keeps its place on
 * the sheet's back stack (SheetPage.Thing) across a rotation.
 */
@Serializable
sealed interface MapPick {
    /** A field, by its ident. */
    @Serializable
    data class Airport(val ident: String) : MapPick

    /** A VOR, with the fields its card shows (NASR NAV_BASE as
     *  wingtip.fixes reads it, its remarks NAV_RMK one a line). */
    @Serializable
    data class Vor(
        val ident: String,
        val name: String?,
        val kind: String,
        val lat: Double,
        val lon: Double,
        val freq: String?,
        val channel: String?,
        val serviceVolume: String?,
        val magVar: Double?,
        val elevationFt: Double?,
        val hours: String?,
        val restricted: Boolean,
        val remarks: List<String>,
    ) : MapPick

    /** A low enroute fix or a VFR waypoint: where it is, and the VORs in
     *  the tiles loaded round it, for its place off the nearest. */
    @Serializable
    data class Point(val ident: String, val vfr: Boolean, val lat: Double, val lon: Double, val vors: List<Vor>) : MapPick

    /** A Class B, C or D volume (NASR's Class Airspace shapefile as the
     *  tiles carry it: CLASS, NAME, IDENT, the floor and ceiling, TNI,
     *  WKHR_CODE and WKHR_RMK), and where it was tapped, the point its
     *  card's actions send the route to. */
    @Serializable
    data class Airspace(
        val id: String,
        val name: String,
        val ident: String?,
        val airspaceClass: String,
        val floorFt: Double,
        val ceilingFt: Double?,
        val ceilingExcluded: Boolean,
        val hoursCode: String?,
        val hoursRemark: String?,
        val lat: Double = 0.0,
        val lon: Double = 0.0,
    ) : MapPick {
        /** The surface where the floor is 0 ft, as the planner's floor_sfc. */
        val floorSfc: Boolean get() = floorFt == 0.0
    }

    /** An airplane of the traffic, by its ICAO address. */
    @Serializable
    data class Plane(val hex: String) : MapPick

    /** A point a finger was held on, or the map's centre asked of by
     *  TalkBack: What's Here, the airspace over it from the ground up. */
    @Serializable
    data class Here(val lat: Double, val lon: Double) : MapPick

    /** A leg of the route's line, by its number from the departure. */
    @Serializable
    data class RouteLeg(val index: Int) : MapPick

    /** An approach plate laid on the chart (PlateLayer), by its field and
     *  its CIFP identifier: its card's settings (SheetPage.Plate). */
    @Serializable
    data class Plate(val ident: String, val procedure: String) : MapPick

    /** A temporary flight restriction, by its FDC NOTAM number as
     *  tfr.faa.gov lists it ("6/4116"): its card reads it from the list
     *  the map draws (TfrLayer), as a tap and a link `tfr=` both open it. */
    @Serializable
    data class Tfr(val notamId: String) : MapPick

    /** A VOR asked for by a link (`navaid=OBK@42.2214,-87.9517`), its
     *  ident and place, as one ident names navaids in more than one
     *  place: the map is taken there and its card filled from the tiles
     *  once they are in (NavaidFind), as the web's link does. */
    @Serializable
    data class NavaidAt(val ident: String, val lat: Double, val lon: Double) : MapPick

    companion object {
        private fun text(v: Any?): String? = v?.toString()?.takeIf { it.isNotEmpty() }
        private fun number(v: Any?): Double? = when (v) {
            is Number -> v.toDouble()
            is String -> v.toDoubleOrNull()
            else -> null
        }
        private fun flag(v: Any?): Boolean = v == true || v == "true"

        /** A tapped ring of the tiles' `airspace` layer (the web's volumeOfTile). */
        fun airspace(p: Map<String, Any?>, lat: Double = 0.0, lon: Double = 0.0): Airspace {
            val floor = number(p["floor_ft"]) ?: 0.0
            val cls = p["class"].toString()
            return Airspace(
                id = "tile-${text(p["number"]) ?: "$cls-${text(p["ident"]).orEmpty()}-${text(p["name"]).orEmpty()}-${floor.toLong()}"}",
                name = text(p["name"]).orEmpty(),
                ident = text(p["ident"]),
                airspaceClass = cls,
                floorFt = floor,
                ceilingFt = number(p["ceiling_ft"]),
                ceilingExcluded = flag(p["ceiling_excluded"]),
                hoursCode = text(p["hours_code"]),
                hoursRemark = text(p["hours_remark"]),
                lat = lat,
                lon = lon,
            )
        }

        /** A VOR of the tiles' `navaids` layer (the web's vorOfTile). */
        fun vor(p: Map<String, Any?>, lat: Double, lon: Double): Vor = Vor(
            ident = p["ident"].toString(),
            name = text(p["name"]),
            kind = p["kind"].toString(),
            lat = lat,
            lon = lon,
            freq = text(p["freq"]),
            channel = text(p["channel"]),
            serviceVolume = text(p["service_volume"]),
            magVar = number(p["mag_var"]),
            elevationFt = number(p["elevation_ft"]),
            hours = text(p["hours"]),
            restricted = flag(p["restricted"]),
            remarks = text(p["remarks"])?.split("\n").orEmpty(),
        )
    }
}
