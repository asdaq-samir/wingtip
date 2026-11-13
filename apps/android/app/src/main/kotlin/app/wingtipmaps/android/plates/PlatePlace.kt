package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.api.generated.PlateOverlay
import kotlinx.serialization.Serializable

/** An approach put on the map: its field and its CIFP identifier ("I36"),
 *  as the planner's /api/airport/{ident}/procedures/{procedure}/plate takes them. */
@Serializable
data class PlatePick(val ident: String, val procedure: String) {
    /** The pick as one word, for a layer's or a source's id. */
    val key: String get() = "$ident-$procedure"
}

/** A point on the ground, latitude and longitude in degrees. */
data class LatLon(val lat: Double, val lon: Double)

/**
 * A plate placed: the FAA's page `name` ("ILS OR LOC RWY 36") of d-TPP
 * cycle `cycle`, its picture's path on the planner, and the page's four
 * corners on the ground in MapLibre's image order -- top left, top right,
 * bottom right, bottom left -- where the plate's own georeference puts
 * them (wingtip.plates). Only the plan view is to the ground's scale; the
 * rest of the page goes round it at the same scale and turn, the
 * convention ForeFlight's plates on the map follow. `georeference` is the
 * page's own (wingtip.plate_page.georeference), which puts the pilot on
 * the page full screen (PlatePosition); none where the page is not placed.
 */
data class PlacedPlate(
    val pick: PlatePick,
    val name: String,
    val cycle: String,
    val picture: String,
    val corners: List<LatLon>,
    val georeference: PlateGeoreference? = null,
) {
    companion object {
        /**
         * The planner's answer placed: the whole page by its four corners
         * (its `page`, wingtip.plate_page) and its picture; where the page
         * is not placed (turned in the PDF), the plan view alone, north up
         * in its own box, as before.
         */
        fun of(pick: PlatePick, overlay: PlateOverlay): PlacedPlate? {
            val page = overlay.page
            val corners = if (page != null) {
                listOf(page.topLeft, page.topRight, page.bottomRight, page.bottomLeft).map { LatLon(it.lat, it.lon) }
            } else {
                listOf(
                    LatLon(overlay.north, overlay.west),
                    LatLon(overlay.north, overlay.east),
                    LatLon(overlay.south, overlay.east),
                    LatLon(overlay.south, overlay.west),
                )
            }
            if (!corners.all { it.lat.isFinite() && it.lon.isFinite() }) return null
            val path = if (page != null) "approach-plate-page" else "approach-plate"
            val picture = "/api/$path/${overlay.cycle}/${pick.ident}/${pick.procedure}.png"
            return PlacedPlate(pick, overlay.name, overlay.cycle, picture, corners, page?.georeference)
        }

        /**
         * Whether a tap at `lat`, `lon` is on the page: inside its four
         * corners, taken as a flat quadrilateral (a plate is a few miles
         * across, where the map's projection is as good as flat). A
         * crossing count, so a page turned off north is found as well.
         */
        fun contains(corners: List<LatLon>, lat: Double, lon: Double): Boolean {
            if (corners.size < 3) return false
            var inside = false
            var j = corners.size - 1
            for (i in corners.indices) {
                val a = corners[i]
                val b = corners[j]
                if ((a.lat > lat) != (b.lat > lat) && lon < (b.lon - a.lon) * (lat - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside
                j = i
            }
            return inside
        }
    }
}
