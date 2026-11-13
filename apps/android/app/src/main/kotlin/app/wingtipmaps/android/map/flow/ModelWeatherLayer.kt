package app.wingtipmaps.android.map.flow

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.WeatherArea
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.aviationGridBands
import app.wingtipmaps.android.engine.generated.gairmetHazards
import app.wingtipmaps.android.engine.generated.modelWeatherBands
import app.wingtipmaps.android.map.MapStyle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.coroutines.executeAsync
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngQuad
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.ImageSource
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet
import java.time.Instant

/**
 * The model weather on the map (ModelWeather, the web's FlowGl): the
 * field's picture for the hour shown, decoded (FlowGrid) and coloured on
 * the phone by the field's ramp (FlowLooks) into a picture of the Web
 * Mercator plane (Painted), laid on the map by MapLibre's image source
 * under the route and the marks, at the field's cover; on the
 * precipitation's 1h span the radar's mosaic for an hour past in its
 * place; and the G-AIRMETs for the hour, dashed, each with its hazard's
 * short label along it. A tap on the map that picks nothing else reads
 * the value there. No streaks: the colour field alone. It follows its own
 * state, so the map's holder only hands it the view, as NexradLayer.
 */
object ModelWeatherLayer {
    private const val FIELD = "flow-field"
    private const val RADAR = "flow-radar"
    private const val AIRMETS = "flow-gairmets"
    private const val AIRMET_LINE = "flow-gairmet-line"
    private const val AIRMET_LABEL = "flow-gairmet-label"

    /** Each G-AIRMET's colour by its hazard, as aviationweather.gov's map
     *  tells them apart (the web's weatherColours AREA_COLOURS). */
    private val AREA_INKS = mapOf(
        "Icing" to WingtipColors.Weather.ICING_HEX, "ICE" to WingtipColors.Weather.ICING_HEX,
        "Turbulence" to WingtipColors.Weather.TURBULENCE_HEX, "TURB" to WingtipColors.Weather.TURBULENCE_HEX,
        "IFR conditions" to WingtipColors.Weather.IFR_HEX, "IFR" to WingtipColors.Weather.IFR_HEX,
        "Mountains obscured" to WingtipColors.Weather.MOUNTAINS_HEX, "MTN OBSCN" to WingtipColors.Weather.MOUNTAINS_HEX,
        "Low-level wind shear" to WingtipColors.Weather.SHEAR_HEX, "Strong surface winds" to WingtipColors.Weather.WIND_HEX,
        "ASH" to WingtipColors.Weather.ASH_HEX,
    )

    /** The looks, made once from the engine's bands; null where the engine
     *  could not answer, and nothing is drawn. */
    val looks: Map<FlowKind, FlowLook>? by lazy {
        val bands = Engine.modelWeatherBands().getOrNull() ?: return@lazy null
        val aviation = Engine.aviationGridBands().getOrNull() ?: return@lazy null
        runCatching { FlowLooks.looks(bands, aviation) }.getOrNull()
    }

    /** What was last drawn, so a state change that does not change it draws nothing. */
    private data class Key(val file: String?, val frame: String?, val version: String?, val radar: String?, val field: FlowKind?)

    private var drawn: Key? = null
    private var painted: Pair<Painted, Float>? = null
    private var radar: String? = null
    private var radarShown: String? = null
    private var airmets: String? = null
    private var airmetsAt: Long? = null

    fun follow(view: MapView) {
        val model = ModelWeather.of(view.context)
        var scope: CoroutineScope? = null
        var job: Job? = null
        var tapped = false
        view.addOnDidFinishLoadingStyleListener {
            redraw(view)
            // After the map's own tap (ChartMap's MapHold), which stops a
            // tap that picked something: only a tap that found nothing reads
            // the value, as the web's useGlMiss.
            if (!tapped) {
                tapped = true
                view.getMapAsync { map ->
                    map.addOnMapClickListener { at ->
                        if (model.state.value.field != null) model.tap(at.latitude, at.longitude)
                        false
                    }
                }
            }
        }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch { model.state.collect { state -> update(view, model, s, state) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private var loading: Job? = null
    private var airmetJob: Job? = null

    private fun update(view: MapView, model: ModelWeather, scope: CoroutineScope, state: FlowState) {
        val frame = state.frame
        val file = state.file
        val key = Key(file, frame?.id, file?.let { frame?.versions?.get(it) }, state.radar, state.field)
        if (key != drawn) {
            drawn = key
            loading?.cancel()
            if (state.field == null || frame == null || file == null) {
                painted = null
                radar = null
                airmets = null
                airmetsAt = null
                model.drawn(null)
                redraw(view)
            } else if (state.radar != null) {
                painted = null
                radar = state.radar
                model.drawn(null)
                redraw(view)
            } else {
                radar = null
                loading = scope.launch { load(view, model, state, file) }
            }
        }
        val at = frame?.valid?.let { runCatching { Instant.parse(it).epochSecond }.getOrNull() }
        if (state.field != null && at != null && at != airmetsAt) {
            airmetsAt = at
            airmetJob?.cancel()
            airmetJob = scope.launch { gairmets(view, at) }
        }
    }

    /** The picture fetched, decoded, coloured and drawn. */
    private suspend fun load(view: MapView, model: ModelWeather, state: FlowState, file: String) {
        val field = state.field ?: return
        val layer = state.layer ?: return
        val frame = state.frame ?: return
        val spec = layer.fields[field.key] ?: return
        val look = looks?.get(field) ?: return
        try {
            val (path, version) = FlowTimeline.picture(frame, file)
            val request = Planner.get(path, mapOf("v" to version))
            val bytes = Gateway.client.newCall(request).executeAsync().use { r -> if (r.code == 200) r.body.bytes() else null } ?: return
            val (grid, picture) = withContext(Dispatchers.Default) {
                val options = BitmapFactory.Options().apply {
                    inPremultiplied = false
                    inScaled = false
                }
                val png = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return@withContext null
                val pixels = IntArray(png.width * png.height)
                png.getPixels(pixels, 0, png.width, 0, 0, png.width, png.height)
                val grid = FlowGrid.decode(pixels, png.width, png.height, layer.bounds, spec.unscale, spec.vector, field = field.key)
                png.recycle()
                grid to Painted.of(grid, Ramp(look.ramp))
            } ?: return
            painted = picture to look.opacity
            model.drawn(grid)
            redraw(view)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // No signal: the hour shown last stands.
        }
    }

    /** The G-AIRMETs for the hour (the planner's weather map at `at`, the
     *  snapshot nearest it), each outline with AWC's short hazard label
     *  (the engine's gairmet_hazards). */
    private suspend fun gairmets(view: MapView, at: Long) {
        try {
            // The G-AIRMETs' box: the lower 48 and round it, where they are issued
            // (aviationweather.gov: "Contiguous 48 United States"), the web's CONUS.
            val map = Planner.api.weatherOnTheMap(south = 18.0, west = -130.0, north = 56.0, east = -61.0, at = at.toDouble()).planned()
            val labels = Engine.gairmetHazards().getOrNull()?.labels.orEmpty()
            airmets = geoJson(map.advisories.orEmpty().filter { it.kind == "gairmet" }, labels)
            redraw(view)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            airmetsAt = null
        }
    }

    /** Each G-AIRMET an outline closed back at its first point, longitude
     *  first, with its colour and its label. */
    fun geoJson(areas: List<WeatherArea>, labels: Map<String, String>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (a in areas) {
                val ring = a.coords.filter { it.size >= 2 }
                if (ring.size < 2) continue
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") {
                        put("colour", AREA_INKS[a.hazard.orEmpty()] ?: WingtipColors.Weather.OTHER_HEX)
                        put("label", labels[a.hazard.orEmpty()] ?: a.hazard.orEmpty())
                    }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") { for (p in ring + listOf(ring.first())) addJsonArray { add(p[1]); add(p[0]) } }
                    }
                }
            }
        }
    }.toString()

    private fun redraw(view: MapView) {
        view.getMapAsync { map -> map.getStyle(::draw) }
    }

    private fun draw(style: Style) {
        field(style, painted)
        radar(style, radar)
        airmets(style, airmets)
    }

    private fun field(style: Style, picture: Pair<Painted, Float>?) {
        if (picture == null) {
            style.getLayer(FIELD)?.let(style::removeLayer)
            style.getSource(FIELD)?.let(style::removeSource)
            return
        }
        val (p, opacity) = picture
        val bitmap = Bitmap.createBitmap(p.pixels, p.width, p.height, Bitmap.Config.ARGB_8888)
        val quad = LatLngQuad(LatLng(p.north, p.west), LatLng(p.north, p.east), LatLng(p.south, p.east), LatLng(p.south, p.west))
        val source = style.getSourceAs<ImageSource>(FIELD)
        if (source != null) {
            source.setCoordinates(quad)
            source.setImage(bitmap)
        } else {
            style.addSource(ImageSource(FIELD, quad, bitmap))
        }
        val layer = style.getLayerAs<RasterLayer>(FIELD)
        if (layer != null) {
            layer.setProperties(PropertyFactory.rasterOpacity(opacity))
            return
        }
        below(
            style,
            RasterLayer(FIELD, FIELD).withProperties(
                PropertyFactory.rasterOpacity(opacity),
                PropertyFactory.rasterFadeDuration(0f),
                PropertyFactory.rasterResampling(Property.RASTER_RESAMPLING_LINEAR),
            ),
        )
    }

    /** The hour past's radar mosaic, the planner's XYZ tiles (the weather loop's). */
    private fun radar(style: Style, tiles: String?) {
        if (style.getSource(RADAR) != null && radarShown == tiles) return
        radarShown = tiles
        style.getLayer(RADAR)?.let(style::removeLayer)
        style.getSource(RADAR)?.let(style::removeSource)
        if (tiles == null) return
        val url = if (tiles.startsWith("/")) Config.gateway + Config.plannerPath(tiles) else tiles
        style.addSource(RasterSource(RADAR, TileSet("2.2.0", url).apply { maxZoom = 10f }, 256))
        below(style, RasterLayer(RADAR, RADAR).withProperties(PropertyFactory.rasterOpacity(0.9f), PropertyFactory.rasterFadeDuration(0f)))
    }

    private fun airmets(style: Style, json: String?) {
        if (json == null) {
            for (id in listOf(AIRMET_LABEL, AIRMET_LINE)) style.getLayer(id)?.let(style::removeLayer)
            style.getSource(AIRMETS)?.let(style::removeSource)
            return
        }
        val source = style.getSourceAs<GeoJsonSource>(AIRMETS)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(AIRMETS, json))
        val colour = Expression.toColor(Expression.get("colour"))
        val line = LineLayer(AIRMET_LINE, AIRMETS).withProperties(
            PropertyFactory.lineColor(colour),
            PropertyFactory.lineWidth(1.5f),
            PropertyFactory.lineDasharray(arrayOf(3f, 2.5f)),
        )
        val label = SymbolLayer(AIRMET_LABEL, AIRMETS).withProperties(
            PropertyFactory.symbolPlacement(Property.SYMBOL_PLACEMENT_LINE),
            PropertyFactory.textField(Expression.get("label")),
            PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
            PropertyFactory.textSize(11f),
            PropertyFactory.symbolSpacing(320f),
            PropertyFactory.textColor(colour),
            PropertyFactory.textHaloColor(WingtipColors.Chart.CASING_HEX.toColorInt()),
            PropertyFactory.textHaloWidth(2f),
        )
        below(style, line)
        below(style, label)
    }

    /** Over the chart and its relief, under the route and the marks (the
     *  style's route slot), as the web's flow layer keeps the airports,
     *  the route and the airspace over it. */
    private fun below(style: Style, layer: Layer) {
        if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }
}
