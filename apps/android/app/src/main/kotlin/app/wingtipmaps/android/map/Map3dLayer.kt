package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.design.generated.WingtipMap
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.approachScene
import app.wingtipmaps.android.ui.A11y
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillExtrusionLayer
import org.maplibre.android.style.layers.HillshadeLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.RasterDemSource
import org.maplibre.android.style.sources.TileSet

/**
 * The ground and the 3D view (Map Settings' Terrain; the web's TerrainGl),
 * as far as MapLibre Native Android draws them (docs/NATIVE-ANDROID.md,
 * "3D"):
 *
 * - Relief: the planner's terrain tiles (/api/terrain-tile, the ground the
 *   altitudes were planned over, the web's dem.ts) shaded over the chart,
 *   lit from the north-west as a sectional's own relief is.
 * - 3D: the relief, and the map free to tilt (to MapLibre Native's 60
 *   degrees) and turn, opening at 50; the Class B, C, D and surface E and
 *   the special use areas in view stood up as see-through volumes
 *   (fill-extrusion, AirspaceVolumes3d) from the planner's whole polygons
 *   (/api/airspace/volumes); and the way in to the open card's field or
 *   the route's destination (the engine's approach_scene, ApproachScene3d)
 *   draped on the chart. Flat and north up again after.
 *
 * MapLibre Native has no 3D ground and no sky (no `terrain` or `sky` in
 * its style, 13.7.1 and its newest), so the ground is not raised and the
 * volumes stand on a sea-level map. The traffic keeps its 2D marks and
 * their "+12" tags (TrafficDrawing): a symbol cannot be lifted to its
 * height here. It follows its own state, so the map's holder only hands it
 * the view, as NexradLayer.
 */
object Map3dLayer {
    private const val DEM = "terrain-dem"
    private const val HILLSHADE = "terrain-hillshade"
    private const val VOLUMES = "airspace-3d"
    private const val SHELF_LABELS = "airspace-3d-labels"
    private const val APPROACH = "approach-3d"
    private const val APPROACH_LINE = "approach-3d-line"
    private const val APPROACH_DASH = "approach-3d-centreline"

    /** The finest terrain tile asked for, the planner's (wingtip.terrain_view.MAX_ZOOM). */
    private const val DEM_MAX_ZOOM = 13f

    /** The tilt 3D opens at, for the ground to read as ground at once (the
     *  tokens' map.pitch-open); MapLibre Native's most is 60
     *  (MapLibreConstants.MAXIMUM_PITCH, the tokens' map.pitch-flat-max),
     *  the web's 75 (pitch-max) being GL JS's. */
    private const val OPEN_PITCH = WingtipMap.PITCH_OPEN.toDouble()
    private const val MAX_PITCH = WingtipMap.PITCH_FLAT_MAX.toDouble()

    /** How long the map takes to tilt into 3D and back (the web's TILT_MS). */
    private const val TILT_MS = 600

    private var mode = TerrainMode.OFF
    private var field: String? = null
    private var volumes: String? = null
    private var labels: String? = null
    /** The planner's last answer and the zoom it was read at, read again
     *  for the plan's altitudes as they change. */
    private var answered: Pair<kotlinx.serialization.json.JsonArray, Double>? = null
    private var asked: Pair<AirspaceVolumes3d.Box, List<String>>? = null
    private var scene: String? = null
    private var sceneOf: String? = null

    fun follow(view: MapView) {
        val terrain = MapTerrain.of(view.context)
        var scope: CoroutineScope? = null
        var job: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, camera = true) }
        view.getMapAsync { map -> map.addOnCameraIdleListener { if (mode == TerrainMode.THREE_D) scope?.let { askVolumes(view, map, it) } } }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                s.launch {
                    // The plan's altitudes changed: the volumes held against them again.
                    AirspaceVolumes3d.planAltitudes.collect { reread(view) }
                }
                job = s.launch {
                    terrain.mode.combine(MapTerrain.field) { m, f -> m to f }.collect { (m, f) ->
                        val turned = m != mode
                        mode = m
                        field = f
                        redraw(view, camera = turned)
                        if (m == TerrainMode.THREE_D) {
                            view.getMapAsync { map -> askVolumes(view, map, s) }
                            askScene(view, s, f)
                        }
                    }
                }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    /** The volumes in view asked for, where the box or the classes changed. */
    private fun askVolumes(view: MapView, map: MapLibreMap, scope: CoroutineScope) {
        val box = map.projection.visibleRegion.latLngBounds
        val rest = MapRest(box.latitudeSouth, box.longitudeWest, box.latitudeNorth, box.longitudeEast, map.cameraPosition.zoom)
        val appZoom = map.cameraPosition.zoom + 1
        val want = AirspaceVolumes3d.boxOf(rest) to AirspaceVolumes3d.classesAt(appZoom)
        if (want == asked && volumes != null) return
        asked = want
        scope.launch {
            try {
                val (b, classes) = want
                val answer = Planner.api.airspaceVolumesIn(b.south, b.west, b.north, b.east, classes.joinToString(",")).planned()
                answered = answer.features to appZoom
                reread(view)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // No signal or no pack: the chart's own airspace lines stand.
                asked = null
            }
        }
    }

    /** The volumes and their shelves' labels read from the last answer,
     *  off the main thread: each polygon's floor and ceiling, and whether
     *  it holds the plan's altitudes, is asked of the engine. */
    private suspend fun reread(view: MapView) {
        val (features, appZoom) = answered ?: return
        val altitudes = AirspaceVolumes3d.planAltitudes.value
        withContext(Dispatchers.Default) {
            volumes = AirspaceVolumes3d.geoJson(features, appZoom, altitudes)
            labels = AirspaceVolumes3d.shelfLabels(features, altitudes)
        }
        redraw(view, camera = false)
    }

    /** The field's way in, its card's answer and the engine's scene. */
    private fun askScene(view: MapView, scope: CoroutineScope, ident: String?) {
        if (ident == sceneOf) return
        sceneOf = ident
        scene = null
        if (ident == null) {
            redraw(view, camera = false)
            return
        }
        scope.launch {
            try {
                val input = ApproachScene3d.input(Planner.place(ident))
                val answer = Engine.approachScene(input.lat, input.lon, input.elevationFt, input.patternFt, input.runways, input.drawing).getOrNull()
                if (sceneOf == ident) scene = answer?.let(ApproachScene3d::geoJson)
                redraw(view, camera = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                sceneOf = null
            }
        }
    }

    private fun redraw(view: MapView, camera: Boolean) {
        view.getMapAsync { map ->
            map.getStyle { style ->
                draw(style)
                if (camera) camera(view, map)
            }
        }
    }

    /** In 3D the map free to tilt and turn, opening tilted; otherwise flat
     *  and north up again, as ChartMap holds it. */
    private fun camera(view: MapView, map: MapLibreMap) {
        val three = mode == TerrainMode.THREE_D
        map.uiSettings.isTiltGesturesEnabled = three
        map.uiSettings.isRotateGesturesEnabled = three
        map.setMaxPitchPreference(if (three) MAX_PITCH else 0.0)
        val position = map.cameraPosition
        val update = when {
            three && position.tilt < 1 -> CameraUpdateFactory.tiltTo(OPEN_PITCH)
            !three && (position.tilt > 0 || position.bearing != 0.0) -> CameraUpdateFactory.newCameraPosition(
                org.maplibre.android.camera.CameraPosition.Builder(position).tilt(0.0).bearing(0.0).build(),
            )
            else -> null
        } ?: return
        if (A11y.reducedMotion(view.context)) map.moveCamera(update) else map.easeCamera(update, TILT_MS)
    }

    private fun draw(style: Style) {
        relief(style, mode != TerrainMode.OFF)
        val three = mode == TerrainMode.THREE_D
        volumes(style, if (three) volumes else null)
        shelfLabels(style, if (three) labels else null)
        approach(style, if (three) scene else null)
    }

    /** The planner's terrain tiles and their relief over the chart, under
     *  the overlays: its shadows half clear, so the chart's own colours and
     *  words stay as printed in the light (the web's HILLSHADE_LAYER). */
    private fun relief(style: Style, on: Boolean) {
        if (!on) {
            style.getLayer(HILLSHADE)?.let(style::removeLayer)
            style.getSource(DEM)?.let(style::removeSource)
            return
        }
        if (style.getLayer(HILLSHADE) != null) return
        if (style.getSource(DEM) == null) {
            val tiles = TileSet("2.2.0", Config.gateway + Config.plannerPath("/api/terrain-tile/{z}/{x}/{y}.png")).apply {
                encoding = "terrarium"
                minZoom = 3f
                maxZoom = DEM_MAX_ZOOM
            }
            style.addSource(RasterDemSource(DEM, tiles, 256))
        }
        val layer = HillshadeLayer(HILLSHADE, DEM).withProperties(
            PropertyFactory.hillshadeExaggeration(0.35f),
            PropertyFactory.hillshadeShadowColor(arrayOf("rgba(40, 32, 20, 0.55)")),
            PropertyFactory.hillshadeHighlightColor(arrayOf("rgba(255, 255, 255, 0.18)")),
            PropertyFactory.hillshadeAccentColor("rgba(0, 0, 0, 0)"),
            PropertyFactory.hillshadeIlluminationDirection(arrayOf(315f)),
        )
        val top = MapStyle.CHART_LAYERS.lastOrNull { style.getLayer(it) != null } ?: CloseMap.IMAGERY.takeIf { style.getLayer(it) != null }
        if (top != null) style.addLayerAbove(layer, top) else below(style, layer)
    }

    /** The volumes, one extrusion layer a kind and strength: MapLibre's
     *  fill-extrusion-opacity is the layer's alone, not a feature's, so
     *  each kind's see-through, stronger where the plan is at it and
     *  fainter where not (the tokens' airspace-held and -faded), is its own
     *  layer's; each volume's colour its floor's shade (shadeOf). */
    private fun volumes(style: Style, json: String?) {
        val ids = AirspaceVolumes3d.KINDS.keys.flatMap { k -> AirspaceVolumes3d.Strength.entries.map { "$VOLUMES-$k-${it.name}" } }
        if (json == null) {
            ids.forEach { id -> style.getLayer(id)?.let(style::removeLayer) }
            style.getSource(VOLUMES)?.let(style::removeSource)
            return
        }
        val source = style.getSourceAs<GeoJsonSource>(VOLUMES)
        if (source != null) source.setGeoJson(json) else style.addSource(GeoJsonSource(VOLUMES, json))
        for ((kind, ink) in AirspaceVolumes3d.KINDS) {
            for (strength in AirspaceVolumes3d.Strength.entries) {
                val id = "$VOLUMES-$kind-${strength.name}"
                if (style.getLayer(id) != null) continue
                val layer = FillExtrusionLayer(id, VOLUMES).withProperties(
                    PropertyFactory.fillExtrusionColor(Expression.toColor(Expression.get("shade"))),
                    PropertyFactory.fillExtrusionOpacity(minOf(1f, (ink.opacity * strength.times).toFloat())),
                    PropertyFactory.fillExtrusionBase(Expression.get("base_m")),
                    PropertyFactory.fillExtrusionHeight(Expression.get("height_m")),
                    PropertyFactory.fillExtrusionVerticalGradient(false),
                )
                layer.setFilter(Expression.all(Expression.eq(Expression.get("kind"), Expression.literal(kind)), Expression.eq(Expression.get("strength"), Expression.literal(strength.name))))
                below(style, layer)
            }
        }
    }

    /** Each shelf's altitudes in the 2D chart's airspace tab (a dark tab
     *  bordered in its class's ink, OverlayPictures), facing the screen,
     *  kept off each other by MapLibre's collision: Class B first, then C
     *  and D, the lower floor first; a shelf the plan is not at fainter
     *  (the tokens' airspace-label-faded), still legible. */
    private fun shelfLabels(style: Style, json: String?) {
        if (json == null) {
            style.getLayer(SHELF_LABELS)?.let(style::removeLayer)
            style.getSource(SHELF_LABELS)?.let(style::removeSource)
            return
        }
        val source = style.getSourceAs<GeoJsonSource>(SHELF_LABELS)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SHELF_LABELS, json))
        val faded = Expression.switchCase(Expression.get("held"), Expression.literal(1f), Expression.literal(WingtipMap.AIRSPACE_LABEL_FADED.toFloat()))
        val layer = org.maplibre.android.style.layers.SymbolLayer(SHELF_LABELS, SHELF_LABELS).withProperties(
            PropertyFactory.textField(Expression.get("text")),
            PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
            PropertyFactory.textSize(12f),
            PropertyFactory.textLineHeight(1.1f),
            PropertyFactory.textColor(app.wingtipmaps.android.design.generated.WingtipColors.Chart.CASING_HEX.toColorInt()),
            PropertyFactory.textPitchAlignment(Property.TEXT_PITCH_ALIGNMENT_VIEWPORT),
            PropertyFactory.textRotationAlignment(Property.TEXT_ROTATION_ALIGNMENT_VIEWPORT),
            PropertyFactory.iconImage(Expression.concat(Expression.literal(MapStyle.airspaceTab("")), Expression.get("class"))),
            PropertyFactory.iconTextFit(Property.ICON_TEXT_FIT_BOTH),
            PropertyFactory.iconTextFitPadding(arrayOf(2f, 6f, 2f, 6f)),
            PropertyFactory.iconPitchAlignment(Property.ICON_PITCH_ALIGNMENT_VIEWPORT),
            PropertyFactory.textPadding(4f),
            PropertyFactory.symbolSortKey(Expression.sum(Expression.product(Expression.match(Expression.get("class"), Expression.literal(2), Expression.stop("B", 0), Expression.stop("C", 1)), Expression.literal(100_000)), Expression.get("floor_ft"))),
            PropertyFactory.textOpacity(faded),
            PropertyFactory.iconOpacity(faded),
        )
        style.addLayer(layer)
    }

    /** The way in, draped: each line in its role's ink, the centrelines
     *  dashed (the web's approach-centreline). */
    private fun approach(style: Style, json: String?) {
        if (json == null) {
            for (id in listOf(APPROACH_LINE, APPROACH_DASH)) style.getLayer(id)?.let(style::removeLayer)
            style.getSource(APPROACH)?.let(style::removeSource)
            return
        }
        val source = style.getSourceAs<GeoJsonSource>(APPROACH)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(APPROACH, json))
        val ink = Expression.match(
            Expression.get("role"), Expression.color(ApproachScene3d.INKS.getValue(ApproachScene3d.PROCEDURE).toColorInt()),
            *ApproachScene3d.INKS.map { (role, hex) -> Expression.stop(role, Expression.color(hex.toColorInt())) }.toTypedArray(),
        )
        val layer = LineLayer(APPROACH_LINE, APPROACH).withProperties(
            PropertyFactory.lineColor(ink),
            PropertyFactory.lineWidth(3f),
            PropertyFactory.lineOpacity(0.9f),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        below(style, layer)
        // The centreline dashed as the web's: a layer of its own, since a
        // dash array is the layer's, not a feature's.
        val dashed = LineLayer(APPROACH_DASH, APPROACH).withProperties(
            PropertyFactory.lineColor(ApproachScene3d.INKS.getValue(ApproachScene3d.CENTRELINE).toColorInt()),
            PropertyFactory.lineWidth(2f),
            PropertyFactory.lineOpacity(0.9f),
            PropertyFactory.lineCap(Property.LINE_CAP_BUTT),
            PropertyFactory.lineDasharray(arrayOf(4f, 3f)),
        )
        layer.setFilter(Expression.neq(Expression.get("role"), Expression.literal(ApproachScene3d.CENTRELINE)))
        dashed.setFilter(Expression.eq(Expression.get("role"), Expression.literal(ApproachScene3d.CENTRELINE)))
        below(style, dashed)
    }

    /** Under the route and the marks (the style's route slot), as the web
     *  lays its volumes and lines. */
    private fun below(style: Style, layer: Layer) {
        if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }
}
