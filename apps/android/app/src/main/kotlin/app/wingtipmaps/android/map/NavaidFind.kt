package app.wingtipmaps.android.map

import android.os.Handler
import android.os.Looper
import android.view.View
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.sources.VectorSource
import kotlin.math.abs

/**
 * A VOR asked for by a link (`navaid=OBK@42.2214,-87.9517`), found in the
 * overlay tiles as a tap finds it, as the web's NavaidsGl does: the map is
 * taken there, close enough for the VORs' tiles, and once they are in the
 * station with that ident at that place is its card's (MapPick.Vor), or
 * none (Missing), which its card says in place. It follows its own flow
 * as TfrLayer does, so the map's holder only hands it the view.
 */
object NavaidFind {
    sealed interface Found {
        data object Looking : Found

        data class Station(val vor: MapPick.Vor) : Found

        data object Missing : Found
    }

    private val asked = MutableStateFlow<MapPick.NavaidAt?>(null)
    private val _found = MutableStateFlow<Pair<MapPick.NavaidAt, Found>?>(null)

    /** What the last link asked for, and what was found of it. */
    val found: StateFlow<Pair<MapPick.NavaidAt, Found>?> = _found.asStateFlow()

    /** The link's place to look at, four decimal places as the link
     *  writes it, so a station within a few metres of it is the one. */
    private const val SAME_PLACE_DEG = 0.001

    /** The zoom it is looked for at, a step inside where the chart draws
     *  VORs (MapStyle.VOR_ZOOM, in the web's Leaflet levels). */
    private val LOOK_ZOOM = MapStyle.glZoom(MapStyle.VOR_ZOOM + 1)
    private const val MOVE_MS = 800
    private const val SETTLE_MS = 500L
    private const val GIVE_UP_MS = 15_000L

    fun find(at: MapPick.NavaidAt) {
        _found.value = at to Found.Looking
        asked.value = at
    }

    fun follow(view: MapView) {
        var scope: CoroutineScope? = null
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                s.launch {
                    asked.filterNotNull().collect { at ->
                        asked.value = null
                        view.getMapAsync { map -> look(view, map, at) }
                    }
                }
            }

            override fun onViewDetachedFromWindow(v: View) {
                scope?.cancel()
            }
        })
    }

    private fun look(view: MapView, map: MapLibreMap, at: MapPick.NavaidAt) {
        val handler = Handler(Looper.getMainLooper())
        var done = false
        lateinit var idle: MapView.OnDidBecomeIdleListener
        fun finish(found: Found) {
            if (done) return
            done = true
            view.removeOnDidBecomeIdleListener(idle)
            handler.removeCallbacksAndMessages(null)
            if (_found.value?.first == at) _found.value = at to found
        }
        // Once the tiles round it are in (the map idle); a map whose style
        // is not set yet waits for a later idle, till it gives up.
        idle = MapView.OnDidBecomeIdleListener {
            val station = stationOf(map, at)
            when {
                station != null -> finish(Found.Station(station))
                map.style?.getSource(MapStyle.OVERLAY_SOURCE) != null -> finish(Found.Missing)
            }
        }
        view.addOnDidBecomeIdleListener(idle)
        // A map already there and still may not go idle again: looked at
        // once the move is done too.
        handler.postDelayed({ stationOf(map, at)?.let { finish(Found.Station(it)) } }, MOVE_MS + SETTLE_MS)
        handler.postDelayed({ finish(stationOf(map, at)?.let { Found.Station(it) } ?: Found.Missing) }, GIVE_UP_MS)
        val zoom = maxOf(map.cameraPosition.zoom, LOOK_ZOOM)
        map.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(at.lat, at.lon), zoom), MOVE_MS)
    }

    private fun stationOf(map: MapLibreMap, at: MapPick.NavaidAt): MapPick.Vor? {
        val source = map.style?.getSourceAs<VectorSource>(MapStyle.OVERLAY_SOURCE) ?: return null
        val filter = Expression.eq(Expression.get("ident"), Expression.literal(at.ident))
        return source.querySourceFeatures(arrayOf("navaids"), filter).firstNotNullOfOrNull { f ->
            val (lat, lon) = pointOf(f) ?: return@firstNotNullOfOrNull null
            if (abs(lat - at.lat) > SAME_PLACE_DEG || abs(lon - at.lon) > SAME_PLACE_DEG) null else MapPick.vor(properties(f), lat, lon)
        }
    }
}
