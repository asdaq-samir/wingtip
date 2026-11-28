package app.wingtipmaps.android.map

import app.wingtipmaps.android.AppClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.maplibre.android.maps.Style
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The airplanes heard on the map (ChartMap's holder): drawn as an answer
 * comes and carried on a step a second until the next answer cancels the
 * carrying. Where each is carried to is worked out off the main thread
 * (TrafficDrawing asks the engine for every airplane); the features are
 * set on the map's sources only when they changed, so an airplane parked
 * or none heard sets nothing each second.
 */
internal class TrafficOnMap {
    private var features: Pair<String, String>? = null
    private var set: Pair<String, String>? = null

    /** `targets` drawn and carried on while `alive`, `draw` asking the
     *  map for its style to set them on. */
    suspend fun carry(targets: List<TrafficDrawing.Target>, tracked: String?, alive: () -> Boolean, draw: () -> Unit) {
        while (alive()) {
            features = withContext(Dispatchers.Default) {
                TrafficDrawing.features(targets, tracked, AppClock.nowMs()).let { (p, t) -> p.toString() to t.toString() }
            }
            if (alive()) draw()
            if (targets.isEmpty()) return
            delay(CARRY_MS)
        }
    }

    /** A new style's sources are empty: the next draw sets them whatever was set. */
    fun restyled() {
        set = null
    }

    fun draw(style: Style) {
        val drawn = features ?: return
        if (drawn == set) return
        set = drawn
        style.getSourceAs<GeoJsonSource>(MapStyle.TRAFFIC)?.setGeoJson(drawn.first)
        style.getSourceAs<GeoJsonSource>(MapStyle.TRAFFIC_TREND)?.setGeoJson(drawn.second)
    }

    companion object {
        /** How often each airplane is carried on between answers, while the map is started. */
        const val CARRY_MS = 1_000L
    }
}
