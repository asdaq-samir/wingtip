package app.wingtipmaps.android.map

import android.graphics.PointF
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap

/** The field whose card is open, by its ident and where it is. */
data class MapField(val ident: String, val lat: Double, val lon: Double)

/**
 * Where the map goes as the sheet's content changes (the owner's
 * map-follows-sheet rule; the Android audit's AND-2): a new route fitted
 * to what the sheet leaves of the map, and an open card's field brought
 * into sight, never while the map follows own ship; and the map's credits.
 *
 * The web's camera rules of 2026-11-14 (981c31a56, e8688073e; the flicker
 * audit's FL-7 and FL-8): a mark tapped is never flown to; the map moves
 * once, eased with its zoom kept, only where the card hides it, and not
 * at all where it is in the room the sheet leaves. A field out of sight
 * (opened from the search or a link) is eased to at a region's zoom. The
 * sheet's room is taken as the map's padding with the chart kept still,
 * so a card coming up, or going, moves nothing on the screen: a tracked
 * airplane, or any mark, stays where it was rather than drawn to the
 * middle of what the card leaves.
 */
class MapCamera {
    /** The line last fitted, so a route is fitted once as it arrives. */
    private var fitted: List<List<Double>>? = null

    /** The open card's field, kept in the room as the sheet's room changes. */
    private var picked: LatLng? = null

    /** Where a point on the screen is against the room the sheet leaves. */
    enum class Sight { InRoom, Hidden, Away }

    /** The open card's field (none once it closes), eased into the room
     *  only where the sheet hides it, or to at a region's zoom where it is
     *  off the screen. */
    fun show(map: MapLibreMap, field: MapField?, widthPx: Int, heightPx: Int, roomPx: Int, density: Float, reduced: Boolean) {
        picked = field?.let { LatLng(it.lat, it.lon) }
        picked?.let { bring(map, it, widthPx, heightPx, roomPx, density, reduced) }
    }

    /** The sheet's room taken as the map's padding with the chart kept
     *  still, then the open card's field brought out from under it. */
    fun room(map: MapLibreMap, widthPx: Int, heightPx: Int, roomPx: Int, density: Float, reduced: Boolean) {
        if (widthPx > 0 && heightPx > roomPx) {
            val centre = map.projection.fromScreenLocation(PointF(widthPx / 2f, (heightPx - roomPx) / 2f))
            val still = CameraPosition.Builder(map.cameraPosition).target(centre).padding(0.0, 0.0, 0.0, roomPx.toDouble()).build()
            map.moveCamera(CameraUpdateFactory.newCameraPosition(still))
        }
        picked?.let { bring(map, it, widthPx, heightPx, roomPx, density, reduced) }
    }

    private fun bring(map: MapLibreMap, at: LatLng, widthPx: Int, heightPx: Int, roomPx: Int, density: Float, reduced: Boolean) {
        val p = map.projection.toScreenLocation(at)
        when (sight(p.x, p.y, widthPx, heightPx, roomPx, EDGE_DP * density)) {
            Sight.InRoom -> {}
            Sight.Hidden -> move(map, CameraUpdateFactory.newLatLng(at), reduced)
            Sight.Away -> move(map, CameraUpdateFactory.newLatLngZoom(at, maxOf(map.cameraPosition.zoom, MapStyle.glZoom(FIELD_ZOOM))), reduced)
        }
    }

    /** A new route's course line fitted, its bounds with the sheet's
     *  height as the bottom padding; not while own ship is followed. */
    fun fit(map: MapLibreMap, line: List<List<Double>>, sheetPx: Int, density: Float, following: Boolean, reduced: Boolean) {
        val pts = line.filter { it.size == 2 }
        if (pts.size < 2 || pts == fitted || following) return
        fitted = pts
        val bounds = LatLngBounds.Builder().includes(pts.map { LatLng(it[0], it[1]) }).build()
        val margin = (FIT_MARGIN_DP * density).toInt()
        move(map, CameraUpdateFactory.newLatLngBounds(bounds, margin, margin, margin, sheetPx + margin), reduced)
    }

    companion object {
        /** Room round a fitted route, dp, so its ends' marks are not cut. */
        private const val FIT_MARGIN_DP = 48f

        /** The app's zoom a field's card brings the map to at least: a
         *  region's, where its runways and its neighbours are read. */
        private const val FIELD_ZOOM = 9.0

        /** No logo and no attribution button on the map (the Android audit's
         *  AND-15): rules.md §7.2-7.3 keeps only Google's credit on the map,
         *  while its tiles are drawn, and this map draws none; MapLibre's logo
         *  sat half under the floating toolbar and its (i) was a 21-dp target.
         *  The chart's and MapLibre's credits are Help & About's (AboutCredits). */
        fun noCredits(map: MapLibreMap) {
            map.uiSettings.isLogoEnabled = false
            map.uiSettings.isAttributionEnabled = false
        }

        /** A mark this close to an edge of the room, dp, is taken as hidden:
         *  under the status bar, or half under the sheet's top. */
        private const val EDGE_DP = 32f

        /** Where a point on the screen is: in the room the sheet leaves
         *  (`roomPx` from the foot covered), under the sheet or at an edge,
         *  or off the screen. Pure, for a unit test. */
        fun sight(x: Float, y: Float, widthPx: Int, heightPx: Int, roomPx: Int, edgePx: Float): Sight = when {
            x < 0 || y < 0 || x > widthPx || y > heightPx -> Sight.Away
            x < edgePx || y < edgePx || x > widthPx - edgePx || y > heightPx - roomPx - edgePx -> Sight.Hidden
            else -> Sight.InRoom
        }

        private fun move(map: MapLibreMap, update: org.maplibre.android.camera.CameraUpdate, reduced: Boolean) {
            if (reduced) map.moveCamera(update) else map.animateCamera(update, OwnShipPuck.FOLLOW_MS)
        }
    }
}
