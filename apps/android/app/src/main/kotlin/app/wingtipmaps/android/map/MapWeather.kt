package app.wingtipmaps.android.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.reportingInView
import kotlin.math.ceil
import kotlin.math.floor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The airports' weather pips (the web's AirportsGl TileAirports): the
 * fields that report in a box about the view, each with its METAR's
 * flight category -- the planner's, worked out by the engine
 * (`flight_category`, AIM 7-1-7) -- as each pip's colour by ident, which
 * the map joins onto the tile airports. Asked as the map comes to rest
 * on a new box, and again every ten minutes, as a METAR's category can
 * change by the hour; what was heard is kept, so a pan back, or a pan
 * with no signal, keeps its pips.
 */
class MapWeather : ViewModel() {
    private val _colours = MutableStateFlow<Map<String, String>>(emptyMap())
    val colours: StateFlow<Map<String, String>> = _colours.asStateFlow()

    private var asked: Box? = null
    private var askedAtMs = 0L
    private var asking: Job? = null

    /** A box of whole half degrees round the view and as much again each
     *  way (the web's "some nine views"), so a small pan asks nothing. */
    data class Box(val south: Double, val west: Double, val north: Double, val east: Double) {
        fun holds(view: MapRest) = view.south >= south && view.north <= north && view.west >= west && view.east <= east

        companion object {
            fun about(view: MapRest): Box {
                val dLat = view.north - view.south
                val dLon = view.east - view.west
                fun down(x: Double) = floor(x * 2) / 2
                fun up(x: Double) = ceil(x * 2) / 2
                return Box(
                    down((view.south - dLat).coerceAtLeast(-90.0)), down((view.west - dLon).coerceAtLeast(-180.0)),
                    up((view.north + dLat).coerceAtMost(90.0)), up((view.east + dLon).coerceAtMost(180.0)),
                )
            }
        }
    }

    /** The map at rest: asked where the view has left the box asked, or
     *  the answer is older than EVERY_MS; nothing further out than the
     *  airports are drawn. */
    fun view(view: MapRest) {
        if (view.zoom < MapStyle.glZoom(MapStyle.AIRPORTS_FARTHEST_ZOOM)) return
        val now = System.currentTimeMillis()
        val box = asked
        if (box != null && box.holds(view) && now - askedAtMs < EVERY_MS) return
        if (asking?.isActive == true && box != null && box.holds(view)) return
        val next = Box.about(view)
        asked = next
        askedAtMs = now
        asking?.cancel()
        asking = viewModelScope.launch {
            try {
                val fields = Planner.reportingInView(next.south, next.west, next.north, next.east)
                _colours.value = merged(_colours.value, fields.associate { it.ident to MapStyle.pipOf(it.flightCategory) })
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No signal or the planner down: the pips heard stand, and
                // the next rest asks again.
                askedAtMs = 0L
            }
        }
    }

    companion object {
        /** Ten minutes, as the web's WEATHER_EVERY_MS. */
        const val EVERY_MS = 10 * 60_000L

        /** What was heard before with the newest over it, a field with no
         *  category now dropped; at most MAX_FIELDS kept, the newest. */
        fun merged(was: Map<String, String>, now: Map<String, String>): Map<String, String> {
            val out = LinkedHashMap<String, String>()
            for ((k, v) in was) if (k !in now) out[k] = v
            for ((k, v) in now) if (v.isNotEmpty()) out[k] = v
            return if (out.size <= MAX_FIELDS) out else out.entries.toList().takeLast(MAX_FIELDS).associate { it.key to it.value }
        }

        /** About the country's reporting fields, twice over. */
        const val MAX_FIELDS = 6_000
    }
}
