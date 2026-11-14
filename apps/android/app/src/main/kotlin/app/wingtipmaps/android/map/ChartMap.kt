package app.wingtipmaps.android.map

import android.graphics.Color
import android.graphics.RectF
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.route.RouteLegs
import app.wingtipmaps.android.route.RoutePoint
import app.wingtipmaps.android.tiles.TileTemplate
import app.wingtipmaps.android.ui.A11y
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet
import org.maplibre.android.style.sources.VectorSource
import org.maplibre.geojson.Feature

/** The map's view where it came to rest: its box and its zoom, MapLibre's. */
data class MapRest(val south: Double, val west: Double, val north: Double, val east: Double, val zoom: Double)

/**
 * The FAA chart on a map that works like Maps on a phone: MapLibre's
 * native map view with the chart's tiles (TileTemplate) and the cycle's
 * overlays from the planner's vector tiles in its first style
 * (MapStyle), the route's line over them and the traffic over all. The
 * view is Android's own, so its lifecycle is forwarded from the
 * composition's.
 *
 * @param line the route's great-circle line as pairs of latitude and
 *   longitude (Course.courseLine); empty for none.
 * @param routePoints the route's points, where the line is cut into its
 *   legs (RouteLegs), so a tap on it picks a leg; `selectedLeg` the one
 *   cased in green while its Route Leg sheet is open.
 * @param ownShip the airplane's fix and whose it is (OwnShipMark), drawn
 *   by MapLibre's LocationComponent (OwnShipPuck); grey while off. Read
 *   here, as `glide` is, so a fix redraws the map's own and not its caller.
 * @param trail the path flown (OwnTrail), drawn under the route.
 * @param glide the still-air glide ring about own ship (InFlight, the
 *   engine's glide_ring), its outline as latitude and longitude pairs,
 *   drawn dashed; empty for none.
 * @param selectedField the field whose card is open, ringed (SelectedAirportLayer).
 * @param plates the approach plates laid on the chart and their tags (PlateLayer).
 * @param emergency the emergency assistant's line to the field picked
 *   (EmergencyLayer); null while it is shut.
 * @param follow whether the map keeps the airplane in the middle (the
 *   component's tracking); a drag of the map ends it (`onDragged`), as
 *   Apple Maps lets go.
 * @param overlays the cycle's overlay tiles, in the first style with
 *   the chart; null for the chart alone.
 * @param layers Setup's switches: which overlays are drawn, and the
 *   terminal area chart pinned (`terminal`, where the chart has one).
 * @param weather each reporting field's weather pip by ident (AirportWeatherMarks).
 * @param traffic the airplanes heard (Traffic), `tracked` the one ringed.
 * @param night the chart dimmed (MapStyle.chartPaint): a dark Appearance but Dark + Bright.
 * @param bottomInset what the sheet covers of the map, in pixels: the
 *   map's padding, so its middle is the middle of what the sheet leaves.
 * @param opensAt where the map opens, the airplane's last position
 *   (OwnShip.lastPosition); the country where there is none.
 * @param onRevealed told once, when the map is first at rest with the
 *   chart and the overlays drawn, or REVEAL_LATEST_MS after its style
 *   was set: the loading mark over it (MapLoading) then fades.
 * @param onPick a tap on an airport, a VOR, a fix, a VFR waypoint, an
 *   airspace ring or an airplane: what it picked (MapPick).
 * @param onView the view each time the map comes to rest.
 */
@Composable
fun ChartMap(
    template: TileTemplate?,
    minZoom: Int,
    maxZoom: Int,
    line: List<List<Double>>,
    modifier: Modifier = Modifier,
    routePoints: List<RoutePoint> = emptyList(),
    selectedLeg: Int? = null,
    overlays: OverlayTiles? = null,
    layers: MapLayers = MapLayers(),
    terminal: Charts.Companion.Terminal? = null,
    weather: Map<String, String> = emptyMap(),
    traffic: List<TrafficDrawing.Target> = emptyList(),
    tracked: String? = null,
    night: Boolean = false,
    bottomInset: Int = 0,
    opensAt: Pair<Double, Double>? = null,
    ownShip: () -> OwnShipMark = { OwnShipMark() },
    trail: List<PathPoint> = emptyList(),
    glide: () -> List<List<Double>> = { emptyList() },
    emergency: EmergencyLine? = null,
    selectedField: String? = null,
    selectedAt: Pair<Double, Double>? = null,
    plates: PlatesShown = PlatesShown(),
    follow: Boolean = false,
    onDragged: () -> Unit = {},
    onRevealed: () -> Unit = {},
    onPick: (MapPick) -> Unit = {},
    onView: (MapRest) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val holder = LocalDensity.current.density.let { density -> remember { MapHolder(MapView(context).also(NexradLayer::follow).also(WeatherLoopLayer::follow).also(ForecastAreasLayer::follow).also(StationLayer::follow).also(Map3dLayer::follow).also(app.wingtipmaps.android.map.flow.ModelWeatherLayer::follow), density) } }
    holder.onDragged = onDragged
    holder.onRevealed = onRevealed
    holder.onPick = onPick
    holder.onView = onView
    holder.opensAt = opensAt
    holder.night = night

    DisposableEffect(lifecycle, holder) {
        val observer = LifecycleEventObserver { _, event -> holder.on(event) }
        lifecycle.addObserver(observer)
        val memory = MapHold.memory(holder.view)
        val app = context.applicationContext
        app.registerComponentCallbacks(memory)
        onDispose {
            lifecycle.removeObserver(observer)
            app.unregisterComponentCallbacks(memory)
            holder.destroy()
        }
    }

    LaunchedEffect(holder, template, minZoom, maxZoom, overlays, app.wingtipmaps.android.offline.OfflineLayers.rememberDownloadsKey(context)) { holder.style(template, minZoom, maxZoom, overlays, line) }
    LaunchedEffect(holder, night) { holder.paint(night) }
    // Edge to edge: the credits clear a cutout or a navigation bar at the
    // left in landscape as well as the sheet below.
    val leftInset = WindowInsets.safeDrawing.getLeft(LocalDensity.current, LayoutDirection.Ltr)
    LaunchedEffect(holder, bottomInset, leftInset) { holder.inset(bottomInset, leftInset) }
    LaunchedEffect(holder, line, routePoints) { holder.route(line, routePoints).also { MapTerrain.destination(routePoints.lastOrNull()?.ident) } }
    LaunchedEffect(holder, selectedLeg) { holder.selectLeg(selectedLeg) }
    val mark by rememberUpdatedState(ownShip)
    val ring by rememberUpdatedState(glide)
    LaunchedEffect(holder, follow) { snapshotFlow { mark() }.collect { holder.ownShip(it, follow) } }
    LaunchedEffect(holder, trail) { holder.trail(trail) }
    LaunchedEffect(holder, layers) { holder.layers(layers) }
    LaunchedEffect(holder, terminal, layers.tac) { holder.terminal(if (layers.tac) terminal else null) }
    LaunchedEffect(holder, weather) { holder.weather(weather) }
    LaunchedEffect(holder, traffic, tracked) { holder.traffic(traffic, tracked) }
    LaunchedEffect(holder) { snapshotFlow { ring() }.collect(holder::glide) }
    LaunchedEffect(holder, emergency) { holder.emergency(emergency) }
    LaunchedEffect(holder, selectedField) { holder.selectField(selectedField).also { MapTerrain.selected(selectedField) } }
    LaunchedEffect(holder, selectedAt) { selectedAt?.let { (lat, lon) -> holder.showField(lat, lon) } }
    LaunchedEffect(holder, plates) { holder.plates(plates) }

    AndroidView(factory = { holder.view }, modifier = modifier)
}

/** The map view with its lifecycle forwarded, each call made at most once however the composition and the activity end. */
private class MapHolder(val view: MapView, private val density: Float) {
    private var created = false
    private var destroyed = false
    private var opened = false
    /** Told when the pilot drags the map, so following ends. */
    var onDragged: () -> Unit = {}
    /** Told once, as the map is first shown (ChartMap's onRevealed). */
    var onRevealed: () -> Unit = {}
    /** Told what a tap picked. */
    var onPick: (MapPick) -> Unit = {}
    /** Told the view at each rest. */
    var onView: (MapRest) -> Unit = {}
    /** Where the map opens, read as it opens. */
    var opensAt: Pair<Double, Double>? = null
    /** The dark theme, for the chart's paint in a style set anew. */
    var night = false
    /** What the sheet covers, read as the map opens and set as it settles,
     *  so the map never opens with a padding the sheet has since left
     *  (the web's #543). */
    private var bottomInset = 0
    private var leftInset = 0
    private var styled = false
    private var revealed = false
    private val handler = Handler(Looper.getMainLooper())
    private val latest = Runnable { reveal() }
    /** What the map last drew over the chart, drawn again when the style is set anew (a cycle
     *  change), which drops every source and layer added since. */
    private var lastMark = OwnShipMark()
    private var lastFollow = false
    /** Own ship, MapLibre's LocationComponent, once the map is open. */
    private var puck: OwnShipPuck? = null
    private var lastLayers = MapLayers()
    private var lastTerminal: Charts.Companion.Terminal? = null
    private var lastWeather: Map<String, String> = emptyMap()
    private var lastEmergency: EmergencyLine? = null
    private var lastSelected: String? = null
    /** The chart's tiles' last {z}, where the imagery takes over (CloseMap). */
    private var chartTileMax = 12
    /** The traffic's and the trail's GeoJSON last made, set again as
     *  they are when the style is set anew. */
    private var trafficJson: Pair<String, String>? = null
    private var trailJson = lineJson(emptyList())
    private var lastGlide: List<List<Double>> = emptyList()
    private var lastPoints: List<RoutePoint> = emptyList()
    private val camera = MapCamera()
    private var lastLeg: Int? = null
    val plates = PlateLayer(density)

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
     *  overlays' pictures and the switches and weather as they are, then
     *  what is drawn over them once the style is in. */
    fun style(template: TileTemplate?, minZoom: Int, maxZoom: Int, overlays: OverlayTiles?, line: List<List<Double>>) {
        if (destroyed) return
        view.getMapAsync { map ->
            open(map)
            if (template == null) return@getMapAsync
            // Past the chart's own detail the imagery (CloseMap), to its zoom.
            chartTileMax = maxZoom
            map.setMaxZoomPreference(maxOf(MapStyle.maxZoom(maxZoom), CloseMap.MAX_ZOOM))
            val json = app.wingtipmaps.android.offline.OfflineLayers.styled(view.context, template, MapStyle.styleJson(template, minZoom, maxZoom, overlays, night, lastLayers, lastWeather), lastLayers.tac)
            val builder = Style.Builder().fromJson(json)
            OverlayPictures.addTo(builder, density)
            // At the latest this long after the style is set the map is
            // shown, so a slow tile never leaves it hidden.
            if (!revealed) {
                handler.removeCallbacks(latest)
                handler.postDelayed(latest, REVEAL_LATEST_MS)
            }
            map.setStyle(builder) { style ->
                styled = true
                terminal(style, lastTerminal)
                CloseMap.draw(style, chartTileMax)
                route(style, line, lastPoints)
                trail(style, trailJson)
                GlideLayer.draw(style, lastGlide, GLIDE, ROUTE)
                SelectedAirportLayer.draw(style, lastSelected)
                plates.draw(style)
                EmergencyLayer.draw(style, lastEmergency, below = OwnShipPuck.under(style))
                // After what goes under it, so its layers are over them.
                puck?.activate(style)
                puck?.show(lastMark, lastFollow, app.wingtipmaps.android.ui.A11y.reducedMotion(view.context))
                drawTraffic(style)
            }
        }
    }

    /** The chart's paint by day or night (MapStyle.chartPaint). */
    fun paint(night: Boolean) {
        if (destroyed) return
        view.getMapAsync { map ->
            map.getStyle { style ->
                val paint = MapStyle.chartPaint(night)
                RouteLegLayer.paint(style, night)
                style.getLayerAs<LineLayer>(ROUTE_EDGE)?.setProperties(
                    PropertyFactory.lineColor(edgeColour(night)),
                    PropertyFactory.lineOpacity(if (night) 0.35f else 0.6f),
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

    /** Setup's switches on the overlay layers (the web's
     *  applyOverlayFilters): the airspace and the navaids shown or hidden,
     *  the military and private fields filtered. */
    fun layers(layers: MapLayers) {
        lastLayers = layers
        if (destroyed) return
        view.getMapAsync { map ->
            map.getStyle { style ->
                for (id in MapStyle.AIRSPACE_LAYERS + MapStyle.NAVAID_LAYERS) {
                    style.getLayer(id)?.setProperties(
                        PropertyFactory.visibility(if (MapStyle.visible(id, layers)) Property.VISIBLE else Property.NONE),
                    )
                }
                style.getLayerAs<org.maplibre.android.style.layers.SymbolLayer>(MapStyle.AIRPORTS)
                    ?.setFilter(Expression.raw(MapStyle.airportsFilter(layers).toString()))
            }
        }
    }

    /** Each reporting field's weather pip on the tile airports (the web's
     *  setAirportWeather). */
    fun weather(colours: Map<String, String>) {
        if (colours == lastWeather) return
        lastWeather = colours
        if (destroyed) return
        view.getMapAsync { map ->
            map.getStyle { style ->
                style.getLayer(MapStyle.AIRPORTS)?.setProperties(
                    PropertyFactory.iconImage(Expression.raw(MapStyle.airportIcon(colours).toString())),
                )
            }
        }
    }

    /** The terminal area chart over the base while pinned, at every zoom
     *  it exists at (the web's chart-terminal); taken off when not. */
    fun terminal(spec: Charts.Companion.Terminal?) {
        lastTerminal = spec
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> terminal(style, spec) } }
    }

    private fun terminal(style: Style, spec: Charts.Companion.Terminal?) {
        style.getLayer(MapStyle.CHART_TERMINAL)?.let { style.removeLayer(it) }
        style.getSource(MapStyle.CHART_TERMINAL)?.let { style.removeSource(it) }
        if (spec == null || style.getLayer(MapStyle.CHART) == null) return
        val tiles = TileSet("2.2.0", spec.template.pattern()).apply {
            minZoom = spec.minZoom.toFloat()
            maxZoom = spec.maxZoom.toFloat()
        }
        style.addSource(RasterSource(MapStyle.CHART_TERMINAL, tiles, 256))
        val paint = MapStyle.chartPaint(night)
        val layer = RasterLayer(MapStyle.CHART_TERMINAL, MapStyle.CHART_TERMINAL).withProperties(
            PropertyFactory.rasterFadeDuration(0f),
            PropertyFactory.rasterResampling(Property.RASTER_RESAMPLING_LINEAR),
            PropertyFactory.rasterBrightnessMax(paint.brightnessMax),
            PropertyFactory.rasterContrast(paint.contrast),
            PropertyFactory.rasterSaturation(paint.saturation),
        )
        layer.minZoom = MapStyle.glZoom(spec.minZoom.toDouble()).toFloat()
        style.addLayerAbove(layer, MapStyle.CHART)
        CloseMap.draw(style, chartTileMax)
    }

    /** The airplanes heard, drawn now and carried on a step a second
     *  until the next answer cancels this (ChartMap's effect). Where each
     *  is carried to is worked out off the main thread (TrafficDrawing
     *  asks the engine for every airplane), and only set on the map here. */
    suspend fun traffic(targets: List<TrafficDrawing.Target>, tracked: String?) {
        while (!destroyed) {
            trafficJson = withContext(Dispatchers.Default) {
                TrafficDrawing.features(targets, tracked, app.wingtipmaps.android.AppClock.nowMs()).let { (p, t) -> p.toString() to t.toString() }
            }
            if (!destroyed) view.getMapAsync { map -> map.getStyle(::drawTraffic) }
            if (targets.isEmpty()) return
            delay(CARRY_MS)
        }
    }

    private fun drawTraffic(style: Style) {
        val (points, trends) = trafficJson ?: return
        style.getSourceAs<GeoJsonSource>(MapStyle.TRAFFIC)?.setGeoJson(points)
        style.getSourceAs<GeoJsonSource>(MapStyle.TRAFFIC_TREND)?.setGeoJson(trends)
    }

    /** The sheet's room as the map's padding: the airplane, a fit and the
     *  map's middle in what it leaves. Eased as the sheet settles, as the
     *  web's map follows its sheet. */
    fun inset(px: Int, left: Int = leftInset) {
        if (px == bottomInset && left == leftInset) return
        bottomInset = px
        leftInset = left
        if (destroyed || !opened) return
        view.getMapAsync { map ->
            val reduced = app.wingtipmaps.android.ui.A11y.reducedMotion(view.context)
            // While following, the component's tracking takes the padding.
            if (puck?.inset(doubleArrayOf(0.0, 0.0, 0.0, px.toDouble()), if (reduced) 0L else INSET_MS.toLong()) != true) {
                CameraUpdateFactory.paddingTo(0.0, 0.0, 0.0, px.toDouble()).let { if (reduced) map.moveCamera(it) else map.easeCamera(it, INSET_MS) }
            }
            MapCamera.noCredits(map)
        }
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

    fun route(line: List<List<Double>>, points: List<RoutePoint>) {
        lastPoints = points
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> route(style, line, points) } }
        view.getMapAsync { camera.fit(it, line, bottomInset, density, puck?.tracking == true, A11y.reducedMotion(view.context)) }
    }

    /** The open card's field brought into sight (MapCamera.showField). */
    fun showField(lat: Double, lon: Double) {
        if (!destroyed && puck?.tracking != true) view.getMapAsync { MapCamera.showField(it, lat, lon, A11y.reducedMotion(view.context)) }
    }

    fun selectLeg(leg: Int?) {
        lastLeg = leg
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> RouteLegLayer.select(style, leg) } }
    }

    fun ownShip(mark: OwnShipMark, follow: Boolean) {
        lastMark = mark
        lastFollow = follow
        if (destroyed) return
        view.getMapAsync { puck?.show(mark, follow, app.wingtipmaps.android.ui.A11y.reducedMotion(view.context)) }
    }

    /** The path flown, its GeoJSON made off the main thread: a long day's
     *  flying is thousands of points. */
    suspend fun trail(points: List<PathPoint>) {
        val json = withContext(Dispatchers.Default) { lineJson(points.map { it.lat to it.lon }) }
        trailJson = json
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> trail(style, json) } }
    }

    fun emergency(line: EmergencyLine?) {
        lastEmergency = line
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> EmergencyLayer.draw(style, line, below = OwnShipPuck.under(style)) } }
    }

    fun glide(ring: List<List<Double>>) {
        lastGlide = ring
        if (destroyed) return
        view.getMapAsync { map -> map.getStyle { style -> GlideLayer.draw(style, ring, GLIDE, ROUTE) } }
    }

    /** The ring round the field whose card is open (SelectedAirportLayer). */
    fun selectField(ident: String?) {
        lastSelected = ident
        redraw { style -> SelectedAirportLayer.draw(style, ident) }
    }

    /** The plates drawn, and the map brought to one newly put on it. */
    fun plates(shown: PlatesShown) {
        val new = plates.set(shown)
        if (!destroyed && new != null) view.getMapAsync { it.animateCamera(PlateLayer.fit(new, density), OwnShipPuck.FOLLOW_MS) }
        redraw(plates::draw)
    }

    private fun redraw(draw: (Style) -> Unit) {
        if (!destroyed) view.getMapAsync { map -> map.getStyle(draw) }
    }

    /** The map opened on the airplane's last position at a region's
     *  scale, or the whole country before the phone ever had one, as the
     *  web's map opens (GlMapShell makeMap), with the sheet's room as
     *  its padding as it is now, so the place is in the middle of what
     *  the sheet leaves, under the loading mark. A drag by the pilot ends
     *  following, as Apple Maps lets go of the position when the map is
     *  moved by hand: the component's tracking says so once it follows, the
     *  gesture itself while it waits for a first fix. North up, no turn, no tilt, but in 3D (Map3dLayer). A tap
     *  opens the card of what is under it; each rest tells the view. */
    private fun open(map: MapLibreMap) {
        if (opened) return
        opened = true
        val at = opensAt
        map.setMinZoomPreference(MapStyle.glZoom(LEAFLET_MIN_ZOOM))
        map.uiSettings.isRotateGesturesEnabled = false
        map.uiSettings.isTiltGesturesEnabled = false
        MapCamera.noCredits(map)
        map.cameraPosition = CameraPosition.Builder()
            .target(if (at != null) LatLng(at.first, at.second) else COUNTRY)
            .zoom(MapStyle.glZoom(if (at != null) LEAFLET_OPEN_ZOOM else LEAFLET_COUNTRY_ZOOM))
            .padding(0.0, 0.0, 0.0, bottomInset.toDouble())
            .build()
        puck = OwnShipPuck(map, view.context) { onDragged() }
        map.addOnCameraMoveStartedListener { reason ->
            if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE && puck?.tracking != true) onDragged()
        }
        map.addOnCameraIdleListener {
            val box = map.projection.visibleRegion.latLngBounds
            onView(MapRest(box.latitudeSouth, box.longitudeWest, box.latitudeNorth, box.longitudeEast, map.cameraPosition.zoom))
        }
        MapHold.attach(view, map, tap = { at -> pick(map, at) }, here = { onPick(it) })
        view.addOnDidBecomeIdleListener { if (styled) reveal() }
    }

    /**
     * What a tap at `at` picked, in the web's order of who wins a tap
     * (layers/common TAP's ranks): an airplane, then a field, then a VOR,
     * a fix or a waypoint, each within a finger's reach (22 dp, the web's
     * TAP.mark); then an airspace ring within 10 dp (TAP.line). A layer a
     * switch hides is not drawn, so it is not picked. False where nothing
     * was, so the tap goes on to the map.
     */
    private fun pick(map: MapLibreMap, at: LatLng): Boolean {
        val style = map.style ?: return false
        val p = map.projection.toScreenLocation(at)
        fun near(dp: Float, vararg ids: String): Feature? {
            val r = dp * density
            val present = ids.filter { style.getLayer(it) != null }
            if (present.isEmpty()) return null
            return map.queryRenderedFeatures(RectF(p.x - r, p.y - r, p.x + r, p.y + r), *present.toTypedArray()).firstOrNull()
        }
        val picked: MapPick? = near(TAP_MARK, MapStyle.TRAFFIC)?.let { f ->
            f.getStringProperty("hex")?.let { MapPick.Plane(it) }
        } ?: near(TAP_MARK, MapStyle.AIRPORTS)?.let { f ->
            f.getStringProperty("ident")?.let { MapPick.Airport(it) }
        } ?: near(TAP_MARK, MapStyle.VORS)?.let { f ->
            val (lat, lon) = pointOf(f) ?: return@let null
            MapPick.vor(properties(f), lat, lon)
        } ?: near(TAP_MARK, MapStyle.FIXES, MapStyle.WAYPOINTS)?.let { f ->
            val (lat, lon) = pointOf(f) ?: return@let null
            MapPick.Point(f.getStringProperty("ident") ?: return@let null, f.getBooleanProperty("vfr") == true, lat, lon, tileVors(style))
        } ?: near(TAP_LINE, ROUTE)?.let { f ->
            // A leg of the route, before the airspace under it.
            f.getNumberProperty(RouteLegs.LEG)?.toInt()?.let { MapPick.RouteLeg(it) }
        } ?: plates.at(at.latitude, at.longitude) ?: near(TAP_LINE, *MapStyle.AIRSPACE_LINES.toTypedArray())?.let { f ->
            MapPick.airspace(properties(f), at.latitude, at.longitude)
        }
        if (picked != null) onPick(picked)
        return picked != null
    }

    /** The VORs of the overlay tiles loaded round the view, for a point's
     *  place off the nearest (the web's tileVors). */
    private fun tileVors(style: Style): List<MapPick.Vor> {
        val source = style.getSourceAs<VectorSource>(MapStyle.OVERLAY_SOURCE) ?: return emptyList()
        val filter = Expression.raw(MapStyle.e("match", MapStyle.e("get", "kind"), MapStyle.VOR_KINDS, true, false).toString())
        val seen = LinkedHashMap<String, MapPick.Vor>()
        for (f in source.querySourceFeatures(arrayOf("navaids"), filter)) {
            val (lat, lon) = pointOf(f) ?: continue
            val vor = MapPick.vor(properties(f), lat, lon)
            seen["${vor.ident}-${vor.lat}"] = vor
        }
        return seen.values.toList()
    }

    private fun below(style: Style, layer: Layer, id: String) {
        if (style.getLayer(id) != null) style.addLayerBelow(layer, id) else style.addLayer(layer)
    }

    /** The path flown, under the route: a thinner line in the route's
     *  colour, so where the airplane went reads against where it meant
     *  to go. */
    private fun trail(style: Style, geoJson: String) {
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
            style.getLayer(ROUTE_EDGE) != null -> style.addLayerBelow(layer, ROUTE_EDGE)
            style.getLayer(ROUTE) != null -> style.addLayerBelow(layer, ROUTE)
            else -> below(style, layer, MapStyle.ROUTE_SLOT)
        }
    }

    private fun route(style: Style, line: List<List<Double>>, points: List<RoutePoint>) {
        // A line a leg, so a tap says which and the selected one is cased.
        val geoJson = RouteLegs.json(RouteLegs.cut(line, points))
        val source = style.getSourceAs<GeoJsonSource>(ROUTE)
        if (source != null) {
            source.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(ROUTE, geoJson))
        // The course line as the web app draws it, and ForeFlight (the
        // owner's screenshot, 2026-11-08): the chart's magenta core with a
        // thin edge round it. ForeFlight shows the green outline only when
        // the course is selected (the owner, 2026-11-09): the leg whose
        // Route Leg sheet is open (RouteLegLayer). Over the
        // airspace, under the navaids and the airports (the style's route
        // slot), as the web's map lays them. Widths as the web's at zoom
        // 10 (glStyle's routeLayers).
        val layer = LineLayer(ROUTE, ROUTE).withProperties(
            PropertyFactory.lineColor(COURSE_MAGENTA),
            PropertyFactory.lineWidth(4.5f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        // The edge keeps the magenta legible: a dark rim by day, a faint
        // light one on the dimmed night chart (the web's routeEdgePaint).
        val edge = LineLayer(ROUTE_EDGE, ROUTE).withProperties(
            PropertyFactory.lineColor(edgeColour(night)),
            PropertyFactory.lineWidth(6.5f),
            PropertyFactory.lineOpacity(if (night) 0.35f else 0.6f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        below(style, edge, MapStyle.ROUTE_SLOT)
        below(style, layer, MapStyle.ROUTE_SLOT)
        RouteLegLayer.add(style, ROUTE, ROUTE_EDGE, night, lastLeg)
    }

    private fun edgeColour(night: Boolean): Int = if (night) Color.WHITE else Color.rgb(0x0b, 0x0f, 0x0a)

    private companion object {

        const val ROUTE = "route"
        const val ROUTE_EDGE = "route-edge"
        /** The chart's magenta, the web's COURSE_MAGENTA. */
        val COURSE_MAGENTA = Color.rgb(0xe6, 0x00, 0xe6)
        const val TRAIL = "trail"
        /** A finger's reach round a mark, and round a line, dp (the web's
         *  TAP.mark and TAP.line). */
        const val TAP_MARK = 22f
        const val TAP_LINE = 10f
        /** How often each airplane is carried on between answers. */
        const val CARRY_MS = 1_000L
        const val GLIDE = "glide-ring"
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
    }
}
