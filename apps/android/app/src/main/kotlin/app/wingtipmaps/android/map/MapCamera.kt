package app.wingtipmaps.android.map

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
 */
class MapCamera {
    /** The line last fitted, so a route is fitted once as it arrives. */
    private var fitted: List<List<Double>>? = null

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

        /** Eased to the field where it is out of what the map shows (a card
         *  opened from the search or a link); left as it is where it is in
         *  sight (a tap on the map). */
        fun showField(map: MapLibreMap, lat: Double, lon: Double, reduced: Boolean) {
            val at = LatLng(lat, lon)
            if (map.projection.visibleRegion.latLngBounds.contains(at)) return
            move(map, CameraUpdateFactory.newLatLngZoom(at, maxOf(map.cameraPosition.zoom, MapStyle.glZoom(FIELD_ZOOM))), reduced)
        }

        private fun move(map: MapLibreMap, update: org.maplibre.android.camera.CameraUpdate, reduced: Boolean) {
            if (reduced) map.moveCamera(update) else map.animateCamera(update, OwnShipPuck.FOLLOW_MS)
        }
    }
}
