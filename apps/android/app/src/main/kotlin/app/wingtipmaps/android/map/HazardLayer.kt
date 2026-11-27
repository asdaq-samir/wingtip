package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.Obstacle
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.flight.FlightSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.ColorReliefLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * Terrain Hazards on the chart (the web's HazardGl): the planner's terrain
 * tiles (TerrainDem, the relief's own source) coloured on the phone by
 * MapLibre's color-relief layer with the engine's red and amber lines as
 * its stops (Hazard.reliefStops), and the Digital Obstacle File's
 * obstacles round the view (/api/terrain/obstacles) ringed where the
 * engine levels them red or amber, from the app's zoom 9. The altitude is
 * own ship's GPS height and speed with the plan's cruise (its highest
 * leg), the engine choosing between them (Hazard). It follows the Map
 * card's picks (HazardPrefs), the fix and the plan itself, so the map's
 * holder only hands it the view, as NexradLayer; a style set anew has it
 * drawn again.
 */
object HazardLayer {
    private const val TINT = "terrain-hazard"
    private const val OBSTACLES = "obstacles-hazard"
    /** The obstacle ring's width, dp (the themes audit's option A). */
    private const val OBSTACLE_RING = 1.5f

    /** Each level ringed and its ink. */
    private val LEVELS = mapOf(Hazard.WARNING to WingtipColors.Chart.WARNING_HEX, Hazard.CAUTION to WingtipColors.Chart.CAUTION_HEX)

    private var view: Hazard.View? = null
    private var obstacles: List<Obstacle> = emptyList()
    private var rings: String? = null
    private var asked: Hazard.Box? = null
    private val camera = MutableStateFlow<Hazard.Box?>(null)

    fun follow(mapView: MapView) {
        val prefs = HazardPrefs.of(mapView.context)
        val flight = FlightSession.from(mapView.context).inFlight
        var scope: CoroutineScope? = null
        mapView.addOnDidFinishLoadingStyleListener { redraw(mapView) }
        mapView.getMapAsync { map -> map.addOnCameraIdleListener { camera.value = boxOf(map) } }
        mapView.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                s.launch {
                    combine(prefs.picks, flight.state, AirspaceVolumes3d.planAltitudes) { picks, now, legs ->
                        if (picks.setting == Hazard.Setting.OFF) null
                        else Hazard.input(picks.setting, now.fix, legs?.maxOrNull(), picks.clearanceFt)
                    }.distinctUntilChanged { a, b -> a?.let(Hazard::repaintKey) == b?.let(Hazard::repaintKey) }.collect { input ->
                        view = input?.let { Hazard.view(it) }
                        reRing()
                        redraw(mapView)
                        ask(mapView, s, camera.value)
                    }
                }
                s.launch { camera.collect { ask(mapView, s, it) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                scope?.cancel()
            }
        })
    }

    private fun shown(): Hazard.View? = view?.takeIf { it.shown && it.warningFromFt != null && it.cautionFromFt != null }

    /** The view's box, or none further out than the obstacles' zoom (the
     *  app's zoom is MapLibre's plus one, Map3dLayer's appZoom). */
    private fun boxOf(map: MapLibreMap): Hazard.Box? {
        val at = map.cameraPosition
        val target = at.target ?: return null
        return if (at.zoom + 1 < Hazard.OBSTACLE_APP_ZOOM) null else Hazard.boxOf(target.latitude, target.longitude)
    }

    /** The obstacles in the box asked for, once a box, while it is shown. */
    private fun ask(mapView: MapView, scope: CoroutineScope, box: Hazard.Box?) {
        if (box == null || shown() == null || box == asked) return
        asked = box
        scope.launch {
            try {
                obstacles = Planner.api.obstacles(box.south, box.west, box.north, box.east).planned().obstacles
                reRing()
                redraw(mapView)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // No signal or no pack: the ground's colours stand without the rings.
                asked = null
            }
        }
    }

    /** The rings read again against the altitude the ground is coloured
     *  from, off the main thread: each top levelled by the engine. */
    private suspend fun reRing() {
        val v = shown()
        val altitude = v?.altitudeFt
        rings = if (v == null || altitude == null || obstacles.isEmpty()) null
        else withContext(Dispatchers.Default) {
            Hazard.obstaclesGeoJson(obstacles, Hazard.levels(altitude, v.clearanceFt, obstacles.map { it.amslFt.toDouble() }))
        }
    }

    private fun redraw(mapView: MapView) {
        mapView.getMapAsync { map -> map.getStyle(::draw) }
    }

    private fun draw(style: Style) {
        tint(style, shown())
        ring(style, rings)
    }

    private fun tint(style: Style, v: Hazard.View?) {
        val warning = v?.warningFromFt
        val caution = v?.cautionFromFt
        if (warning == null || caution == null) {
            style.getLayer(TINT)?.let(style::removeLayer)
            TerrainDem.release(style)
            return
        }
        val stops = Hazard.reliefStops(warning, caution).map { Expression.stop(it.metres, Expression.color(it.argb)) }
        val colours = Expression.interpolate(Expression.linear(), Expression.raw("[\"elevation\"]"), *stops.toTypedArray())
        val layer = style.getLayerAs<ColorReliefLayer>(TINT)
        if (layer != null) {
            layer.setProperties(PropertyFactory.colorReliefColor(colours))
            return
        }
        TerrainDem.add(style)
        TerrainDem.overChart(
            style,
            ColorReliefLayer(TINT, TerrainDem.ID).withProperties(PropertyFactory.colorReliefOpacity(1f), PropertyFactory.colorReliefColor(colours)),
        )
    }

    private fun ring(style: Style, json: String?) {
        val source = style.getSourceAs<GeoJsonSource>(OBSTACLES)
        if (json == null) {
            LEVELS.keys.forEach { style.getLayer("$OBSTACLES-$it")?.let(style::removeLayer) }
            source?.let(style::removeSource)
            return
        }
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(OBSTACLES, json))
        // MapLibre's zoom is the app's less one (Map3dLayer's appZoom).
        val from = (Hazard.OBSTACLE_APP_ZOOM - 1).toFloat()
        // A layer a level, so each ring's ink is one colour, dimmed with the chart by it at night (MapDim.colour,
        // the owner's "Dim by colour", 2026-11-27): darker with the chart, its contrast with it kept, never faded.
        // Ringed in the course's dark edge (route-edge), by colour too, day and night: a white ring is the paper's
        // own white by day and dims to the paper at night (1.00:1), where the dark ring holds 5.07:1 to the paper
        // and the amber 3.17:1 within it at the default Dimmer, 10.55:1 by day (the round-6 themes audit's option A).
        for ((level, ink) in LEVELS) {
            val layer = CircleLayer("$OBSTACLES-$level", OBSTACLES).withProperties(
                PropertyFactory.circleColor(MapDim.colour(ink.toColorInt())),
                PropertyFactory.circleRadius(Expression.interpolate(Expression.linear(), Expression.zoom(), Expression.stop(from, 3f), Expression.stop(from + 4, 6f))),
                PropertyFactory.circleStrokeColor(MapDim.colour(WingtipColors.Chart.ROUTE_EDGE_HEX.toColorInt())),
                PropertyFactory.circleStrokeWidth(OBSTACLE_RING),
            ).withFilter(Expression.eq(Expression.get("level"), level)).apply { minZoom = from }
            if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
        }
    }
}
