package app.wingtipmaps.android.map

import android.content.ComponentCallbacks
import android.content.res.Configuration
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The FAA chart on a map that works like Maps on a phone: MapLibre's
 * native map view with the chart's tiles (TileTemplate) and the cycle's
 * overlays from the planner's vector tiles in its first style
 * (MapStyle), and the route's line over them. MapLibre is the open
 * native map -- no key, no account, no usage terms of a maps vendor's --
 * which is why it draws the chart rather than Google Maps
 * (docs/NATIVE-ANDROID.md). The view is Android's own, so its lifecycle
 * is forwarded from the composition's.
 *
 * @param line the route's great-circle line as pairs of latitude and
 *   longitude (Course.courseLine); empty for none.
 * @param ownShip the airplane's fix (OwnShip), drawn as the blue dot;
 *   null for none, or own ship off.
 * @param trail the path flown (OwnTrail), drawn under the route.
 * @param follow whether the map keeps the airplane in the middle; a
 *   drag of the map ends it (`onDragged`), as Apple Maps lets go.
 * @param overlays the cycle's overlay tiles, in the first style with
 *   the chart; null for the chart alone.
 * @param night the phone's dark theme: the chart dimmed (MapStyle.chartPaint).
 * @param bottomInset what the sheet covers of the map, in pixels: the
 *   map's padding, so its middle is the middle of what the sheet leaves.
 * @param opensAt where the map opens, the airplane's last position
 *   (OwnShip.lastPosition); the country where there is none.
 * @param onRevealed told once, when the map is first at rest with the
 *   chart and the overlays drawn, or REVEAL_LATEST_MS after its style
 *   was set: the loading mark over it (MapLoading) then fades.
 */
@Composable
fun ChartMap(
    template: TileTemplate?,
    minZoom: Int,
    maxZoom: Int,
    line: List<List<Double>>,
    modifier: Modifier = Modifier,
    overlays: OverlayTiles? = null,
    night: Boolean = false,
    bottomInset: Int = 0,
    opensAt: Pair<Double, Double>? = null,
    ownShip: OwnShip.Fix? = null,
    trail: List<PathPoint> = emptyList(),
    follow: Boolean = false,
    onDragged: () -> Unit = {},
    onRevealed: () -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val holder = remember { MapHolder(MapView(context), context.resources.displayMetrics.density) }
    holder.onDragged = onDragged
    holder.onRevealed = onRevealed
    holder.opensAt = opensAt
    holder.night = night

    DisposableEffect(lifecycle, holder) {
        val observer = LifecycleEventObserver { _, event -> holder.on(event) }
        lifecycle.addObserver(observer)
        // The system's low-memory call, which the map view answers by
        // dropping what it can; a lifecycle has no event for it.
        val memory = object : ComponentCallbacks {
            override fun onConfigurationChanged(newConfig: Configuration) {}
            override fun onLowMemory() = holder.view.onLowMemory()
        }
        val app = context.applicationContext
        app.registerComponentCallbacks(memory)
        onDispose {
            lifecycle.removeObserver(observer)
            app.unregisterComponentCallbacks(memory)
            holder.destroy()
        }
    }

    LaunchedEffect(holder, template, minZoom, maxZoom, overlays) { holder.style(template, minZoom, maxZoom, overlays, line) }
    LaunchedEffect(holder, night) { holder.paint(night) }
    LaunchedEffect(holder, bottomInset) { holder.inset(bottomInset) }
    LaunchedEffect(holder, line) { holder.route(line) }
    LaunchedEffect(holder, ownShip, follow) { holder.ownShip(ownShip, follow) }
    LaunchedEffect(holder, trail) { holder.trail(trail) }

    AndroidView(factory = { holder.view }, modifier = modifier)
}

/** The map view with its lifecycle forwarded, each call made at most
 *  once however the composition and the activity end. */
private class MapHolder(val view: MapView, private val density: Float) {
    private var created = false
    private var destroyed = false
    private var opened = false
    /** Told when the pilot drags the map, so following ends. */
    var onDragged: () -> Unit = {}
    /** Told once, as the map is first shown (ChartMap's onRevealed). */
    var onRevealed: () -> Unit = {}
    /** Where the map opens, read as it opens. */
    var opensAt: Pair<Double, Double>? = null
    /** The dark theme, for the chart's paint in a style set anew. */
    var night = false
    /** What the sheet covers, read as the map opens and set as it settles,
     *  so the map never opens with a padding the sheet has since left
     *  (the web's #543). */
    private var bottomInset = 0
    private var styled = false
    private var revealed = false
    private val handler = Handler(Looper.getMainLooper())
    private val latest = Runnable { reveal() }
    /** What the map last drew of the airplane and its path, drawn again
     *  when the chart's style is set anew (a cycle change), which drops
     *  every source but the chart's. */
    private var lastFix: OwnShip.Fix? = null
    private var lastFollow = false
    private var lastTrail: List<PathPoint> = emptyList()

    fun on(event: Lifecycle.Event) {
        if (destroyed) return
        when (event) {
            Lifecycle.Event.ON_CREATE -> if (!created) {
                created = true
                view.onCreate(null)
            }
            Lifecycle.Event.ON_START -> view.onStart()
            Lifecycle.Event.ON_RESUME -> view.onResume()
            Lifecycle.Event.ON_PAUSE -> view.onPause()
            Lifecycle.Event.ON_STOP -> view.onStop()
            Lifecycle.Event.ON_DESTROY -> destroy()
            else -> {}
        }
    }

    fun destroy() {
        if (destroyed) return
        destroyed = true
        handler.removeCallbacks(latest)
        if (created) view.onDestroy()
    }

    /** The chart and the overlays as the map's style (MapStyle), with the
     *  overlays' pictures, then the route and the airplane on it once the
     *  style is in. */
    fun style(template: TileTemplate?, minZoom: Int, maxZoom: Int, overlays: OverlayTiles?, line: List<List<Double>>) {
        if (destroyed) return
        view.getMapAsync { map ->
            open(map)
            if (template == null) return@getMapAsync
            map.setMaxZoomPreference(MapStyle.maxZoom(maxZoom))
            val builder = Style.Builder().fromJson(MapStyle.styleJson(template, minZoom, maxZoom, overlays, night))
            OverlayPictures.addTo(builder, density)
            // At the latest this long after the style is set the map is
            // shown, so a slow tile never leaves it hidden.
            if (!revealed) {
                handler.removeCallbacks(latest)
                handler.postDelayed(latest, REVEAL_LATEST_MS)
            }
            map.setStyle(builder) { style ->
                styled = true
                route(style, line)
                trail(style, lastTrail)
                ownShip(map, style, lastFix, lastFollow)
            }
        }
    }

    /** The chart's paint by day or night (MapStyle.chartPaint). */
    fun paint(night: Boolean) {
        if (destroyed) return
        view.getMapAsync { map ->
            map.getStyle { style ->
                val paint = MapStyle.chartPaint(night)
                style.getLayerAs<LineLayer>(ROUTE_CASING)?.setProperties(
                    PropertyFactory.lineColor(casingColour(night)),
                    PropertyFactory.lineOpacity(if (night) 0.7f else 0.6f),
                )
                for (id in MapStyle.CHART_LAYERS) {
                    style.getLayerAs<RasterLayer>(id)?.setProperties(
                        PropertyFactory.rasterBrightnessMax(paint.brightnessMax),
                        PropertyFactory.rasterContrast(paint.contrast),
                        PropertyFactory.rasterSaturation(paint.saturation),
                    )
                }
            }
        }
    }

    /** The sheet's room as the map's padding: the airplane, a fit and the
     *  map's middle in what it leaves. Eased as the sheet settles, as the
     *  web's map follows its sheet. */
    fun inset(px: Int) {
        if (px == bottomInset) return
        bottomInset = px
        if (destroyed || !opened) return
        view.getMapAsync { map -> map.easeCamera(CameraUpdateFactory.paddingTo(0.0, 0.0, 0.0, px.toDouble()), INSET_MS) }
    }

    /** The map shown as one thing: the first time it is at rest with its
     *  style's tiles drawn -- the chart's and the overlays' -- or at the
     *  latest REVEAL_LATEST_MS after its style was set. */
    private fun reveal() {
        if (revealed || destroyed) return
        revealed = true
        handler.removeCallbacks(latest)
        onRevealed()
    }

    fun route(line: List<List<Double>>) {
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> route(style, line) } }
    }

    fun ownShip(fix: OwnShip.Fix?, follow: Boolean) {
        lastFix = fix
        lastFollow = follow
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> ownShip(map, style, fix, follow) } }
    }

    fun trail(points: List<PathPoint>) {
        lastTrail = points
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> trail(style, points) } }
    }

    /** The map opened on the airplane's last position at a region's
     *  scale, or the whole country before the phone ever had one, as the
     *  web's map opens (GlMapShell makeMap), with the sheet's room as
     *  its padding as it is now, so the place is in the middle of what
     *  the sheet leaves, under the loading mark. A drag by the pilot ends
     *  following, as Apple Maps lets go of the position when the map is
     *  moved by hand. A chart is read north up: no turn, no tilt. */
    private fun open(map: MapLibreMap) {
        if (opened) return
        opened = true
        val at = opensAt
        map.setMinZoomPreference(MapStyle.glZoom(LEAFLET_MIN_ZOOM))
        map.uiSettings.isRotateGesturesEnabled = false
        map.uiSettings.isTiltGesturesEnabled = false
        map.cameraPosition = CameraPosition.Builder()
            .target(if (at != null) LatLng(at.first, at.second) else COUNTRY)
            .zoom(MapStyle.glZoom(if (at != null) LEAFLET_OPEN_ZOOM else LEAFLET_COUNTRY_ZOOM))
            .padding(0.0, 0.0, 0.0, bottomInset.toDouble())
            .build()
        map.addOnCameraMoveStartedListener { reason ->
            if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) onDragged()
        }
        view.addOnDidBecomeIdleListener { if (styled) reveal() }
    }

    /** The airplane as the blue dot of a map app (the web app's own-ship
     *  mark), white-edged so it reads on the chart's every colour; the
     *  map brought to it while following, at the sectional's scale the
     *  first time and then only moved, so a pinch the pilot made is kept. */
    private fun ownShip(map: MapLibreMap, style: Style, fix: OwnShip.Fix?, follow: Boolean) {
        val geoJson = pointJson(fix)
        val source = style.getSourceAs<GeoJsonSource>(OWN_SHIP)
        if (source != null) {
            source.setGeoJson(geoJson)
        } else {
            style.addSource(GeoJsonSource(OWN_SHIP, geoJson))
            style.addLayer(
                CircleLayer(OWN_SHIP, OWN_SHIP).withProperties(
                    PropertyFactory.circleRadius(7f),
                    PropertyFactory.circleColor(Color.rgb(0, 122, 255)),
                    PropertyFactory.circleStrokeColor(Color.WHITE),
                    PropertyFactory.circleStrokeWidth(2.5f),
                ),
            )
        }
        if (follow && fix != null) {
            val at = LatLng(fix.lat, fix.lon)
            val update = if (map.cameraPosition.zoom < FOLLOW_ZOOM) CameraUpdateFactory.newLatLngZoom(at, FOLLOW_ZOOM)
            else CameraUpdateFactory.newLatLng(at)
            map.animateCamera(update, FOLLOW_MS)
        }
    }

    /** The path flown, under the route: a thinner line in the route's
     *  colour, so where the airplane went reads against where it meant
     *  to go. */
    private fun trail(style: Style, points: List<PathPoint>) {
        val geoJson = lineJson(points.map { it.lat to it.lon })
        val source = style.getSourceAs<GeoJsonSource>(TRAIL)
        if (source != null) {
            source.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(TRAIL, geoJson))
        val layer = LineLayer(TRAIL, TRAIL).withProperties(
            PropertyFactory.lineColor(Color.rgb(0, 122, 255)),
            PropertyFactory.lineWidth(2.5f),
            PropertyFactory.lineOpacity(0.6f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        when {
            style.getLayer(ROUTE_CASING) != null -> style.addLayerBelow(layer, ROUTE_CASING)
            style.getLayer(MapStyle.ROUTE_SLOT) != null -> style.addLayerBelow(layer, MapStyle.ROUTE_SLOT)
            else -> style.addLayer(layer)
        }
    }

    private fun route(style: Style, line: List<List<Double>>) {
        val geoJson = lineJson(line.filter { it.size == 2 }.map { it[0] to it[1] })
        val source = style.getSourceAs<GeoJsonSource>(ROUTE)
        if (source != null) {
            source.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(ROUTE, geoJson))
        // The route line as the web app draws it: the blue tint, a little
        // see-through so the chart reads under it.
        // Over the airspace, under the navaids and the airports (the
        // style's route slot), as the web's map lays them.
        val layer = LineLayer(ROUTE, ROUTE).withProperties(
            PropertyFactory.lineColor(Color.rgb(0, 122, 255)),
            PropertyFactory.lineWidth(4f),
            PropertyFactory.lineOpacity(0.8f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        // A casing under it keeps it legible: a dark rim by day, a light
        // one on the dimmed night chart (the web's routeCasingPaint).
        val casing = LineLayer(ROUTE_CASING, ROUTE).withProperties(
            PropertyFactory.lineColor(casingColour(night)),
            PropertyFactory.lineWidth(7f),
            PropertyFactory.lineOpacity(if (night) 0.7f else 0.6f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        if (style.getLayer(MapStyle.ROUTE_SLOT) != null) {
            style.addLayerBelow(casing, MapStyle.ROUTE_SLOT)
            style.addLayerBelow(layer, MapStyle.ROUTE_SLOT)
        } else {
            style.addLayer(casing)
            style.addLayer(layer)
        }
    }

    private fun casingColour(night: Boolean): Int = if (night) Color.WHITE else Color.rgb(0x1c, 0x1a, 0x17)

    private companion object {
        const val ROUTE = "route"
        const val ROUTE_CASING = "route-casing"
        const val OWN_SHIP = "own-ship"
        const val TRAIL = "trail"
        /** The sectional's own scale, where the airplane's surroundings
         *  read: the web app's zoom on a position (lib/map). */
        const val FOLLOW_ZOOM = 9.0
        /** Shorter than a fix's second, so the dot never lags the map. */
        const val FOLLOW_MS = 300
        /** The sheet's own settle, so the map's middle moves with it. */
        const val INSET_MS = 300
        /** The latest the map is shown after its style is set, the web's
         *  REVEAL_LATEST_MS. */
        const val REVEAL_LATEST_MS = 2_500L
        /** The web's opening zooms, in Leaflet's levels (lib/map/ownShip
         *  OPEN_ZOOM and COUNTRY_ZOOM, GlMapShell's minZoom): a region
         *  round the last position, the whole country before one, and no
         *  farther out than a few states. */
        const val LEAFLET_OPEN_ZOOM = 8.0
        const val LEAFLET_COUNTRY_ZOOM = 4.0
        const val LEAFLET_MIN_ZOOM = 3.0
        /** The middle of the lower 48 (the web's COUNTRY). */
        val COUNTRY = LatLng(39.5, -98.35)

        /** A line (the route, the path flown) as GeoJSON, whose
         *  coordinates are longitude first; no feature under two points. */
        fun lineJson(points: List<Pair<Double, Double>>): String = buildJsonObject {
            put("type", "FeatureCollection")
            putJsonArray("features") {
                if (points.size >= 2) {
                    addJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") {}
                        putJsonObject("geometry") {
                            put("type", "LineString")
                            putJsonArray("coordinates") {
                                for ((lat, lon) in points) addJsonArray {
                                    add(lon)
                                    add(lat)
                                }
                            }
                        }
                    }
                }
            }
        }.toString()

        /** The airplane as GeoJSON: one point, or none. */
        fun pointJson(fix: OwnShip.Fix?): String = buildJsonObject {
            put("type", "FeatureCollection")
            putJsonArray("features") {
                if (fix != null) {
                    addJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") {}
                        putJsonObject("geometry") {
                            put("type", "Point")
                            putJsonArray("coordinates") {
                                add(fix.lon)
                                add(fix.lat)
                            }
                        }
                    }
                }
            }
        }.toString()
    }
}
