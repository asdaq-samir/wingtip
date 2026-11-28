package app.wingtipmaps.android.map

import androidx.compose.ui.graphics.toArgb
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.overlayArchive
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapZoom
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.map.generated.OverlayStyle
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The map's style for MapLibre Native: the FAA chart, and over it the
 * cycle's overlays (design/map-style.json's layers, generated as
 * OverlayStyle, the web's the same) from the planner's vector tiles (wingtip.vector_tiles, a PMTiles archive read
 * in byte ranges through the gateway), every layer in the first style so
 * the airspace, the airports and the navaids are drawn per tile with the
 * chart and follow a pinch frame by frame. Plain JSON here, no map: what
 * ChartMap hands MapLibre, and what the tests read. The pictures the
 * symbols wear are OverlayPictures'.
 */
object MapStyle {
    /** The chart's raster layers, bottom first (chartPaint is set on each):
     *  the region's level, the base chart, and the terminal area chart
     *  pinned over it (Setup's Terminal Area Charts, the web's `tac`). */
    const val CHART_UNDER = "chart-under"
    const val CHART = "chart"
    const val CHART_TERMINAL = "chart-terminal"
    val CHART_LAYERS = listOf(CHART_UNDER, CHART, CHART_TERMINAL)

    /** The overlay tiles' source (design/map-style.json's), every overlay layer's. */
    const val OVERLAY_SOURCE = OverlayStyle.Sources.OVERLAYS

    /** Where the route and the path flown go: over the airspace and the
     *  runways, under the navaids and the airports (the web's "route"
     *  slot, glLayer SLOTS). A hidden layer the others are put below. */
    const val ROUTE_SLOT = "slot-route"

    /** The labels' font: Inter at weight 700, the web's GL_FONT_BOLD,
     *  as glyphs kept in the app's assets (assets/glyphs), so no glyph
     *  server is asked. */
    const val FONT = "Inter-Bold"
    const val GLYPHS = "asset://glyphs/{fontstack}/{range}.pbf"

    /** Leaflet's zoom less one, as the web's glZoom: the web names every
     *  zoom in Leaflet's levels, whose world is 256 px across at zoom 0
     *  where MapLibre's is 512. A raster source's own minzoom and maxzoom
     *  are the tiles' {z}, which need none. */
    fun glZoom(leafletZoom: Double): Double = leafletZoom - 1

    /** As the web's ChartTiles: the chart enlarged two levels past its
     *  own last zoom, and a region's level of the chart under it where
     *  its own tiles are not in yet. */
    const val OVERZOOM = 2
    const val UNDERLAY_ZOOM = 5

    /** The map's furthest zoom, MapLibre's: the chart's own last plus
     *  OVERZOOM (glStyle chartStyle's maxZoom). */
    fun maxZoom(chartMaxZoom: Int): Double = glZoom((chartMaxZoom + OVERZOOM).toDouble())

    /** The day chart's lift, the web's DAY_CONTRAST and DAY_SATURATION:
     *  a touch more contrast and colour than the scan, as ForeFlight's
     *  chart reads beside ours (the owner's screenshots, 2026-11-07). */
    const val DAY_CONTRAST = 0.1f
    const val DAY_SATURATION = 0.1f

    /** The chart's paint (the web's chartPaint): by day the lift above;
     *  at night, with the phone's dark theme (the web's default "dimmed"
     *  chart at night), half as bright with a little more contrast and
     *  no added colour. Each tile drawn in the frame it comes, with no
     *  fade, and sampled smoothly between levels. */
    data class ChartPaint(val brightnessMax: Float, val contrast: Float, val saturation: Float)

    fun chartPaint(night: Boolean): ChartPaint =
        if (night) ChartPaint(0.5f, 0.13f, 0f) else ChartPaint(1f, DAY_CONTRAST, DAY_SATURATION)

    /** The archive's address through the gateway (PlannerProxyController
     *  passes the Range on), as MapLibre Native's PMTiles source reads it:
     *  `pmtiles://` before the https address, the header and directories
     *  read from it in byte ranges (MapLibre Native 11.7 and later). */
    fun overlayUrl(tiles: OverlayTiles): String = "pmtiles://${Planner.overlayArchive(tiles.name)}"

    // ---- The FAA's inks -----------------------------------------------

    /** The sectional's blue and magenta (the web's useAirspace BLUE and
     *  MAGENTA): "Airports having control towers are shown in blue, all
     *  others in magenta" (FAA Aeronautical Chart User's Guide, VFR Terms
     *  and Symbols, Airports). */
    const val BLUE = WingtipColors.Chart.TOWERED_HEX
    const val MAGENTA = WingtipColors.Chart.UNTOWERED_HEX
    /** The chart's own ink for a fix's ident (the web's FIX_INK). */
    const val FIX_INK = WingtipColors.Chart.FIX_INK_HEX
    /** A fix's four-point star, ForeFlight's blue (the web's FIX_BLUE). */
    const val FIX_BLUE = WingtipColors.Chart.AIRSPACE_BLUE_HEX
    /** A VFR waypoint's ink: ForeFlight's green triangle at the owner's
     *  ask (2026-11-07), where the sectional prints a magenta flag (Chart
     *  User's Guide, VFR waypoints). */
    const val VFR_GREEN = WingtipColors.Chart.VFR_GREEN_HEX

    /** An airspace class's ink, the sectional's symbology (Chart User's Guide, VFR Terms and Symbols, Airspace) in
     *  ForeFlight's brighter blue and magenta: Class B and D blue, C magenta. The rings' widths, dashes and bands are
     *  design/map-style.json's (OverlayStyle); these are the colours the tabs' pictures and the cards wear. */
    data class Ink(val colour: String)

    val AIRSPACE_INK: Map<String, Ink> = mapOf(
        "B" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX),
        "C" to Ink(WingtipColors.Chart.AIRSPACE_MAGENTA_HEX),
        "D" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX),
    )

    /** The airports' farthest zoom, Leaflet's: design/tokens.json's map.zoom, the overlay layers' too. */
    const val AIRPORTS_FARTHEST_ZOOM = WingtipMapZoom.AIRPORTS_FARTHEST
    /** The VORs a pilot tunes (wingtip.fixes.VOR_KINDS, NASR NAV_TYPE), as the navaids layers' filter. */
    val VOR_KINDS = listOf("VORTAC", "VOR/DME", "VOR")

    /** The pictures the layers ask for, by id (OverlayPictures draws them). */
    fun airspaceTab(cls: String) = "airspace|tab|$cls"
    const val NAV_TAG = "nav|tag"
    /** The tiles' `airspace`, the surface class (charts/airports.py); "" for an older archive's, the grey ring. */
    val SPACES = listOf("B", "C", "D", "E", "G", "")
    val USES = listOf("", "private", "military", "heliport")

    /** A field's mark's picture by what it is drawn as: its ring (the
     *  surface airspace's class), its weather pip (AirportWeatherMarks, ""
     *  for none) and its use (the web's airportIcons). */
    fun airportMarkId(space: String, pip: String, use: String): String = "apt|$space|$pip|$use"

    // ---- The style ----------------------------------------------------

    /**
     * The whole first style: the chart (the base layer, the same chart at
     * a region's level under it, glStyle's chartStyle) with its paint,
     * then, where the planner has built the cycle's archive, its overlays
     * (design/map-style.json's layers, the web's the same) -- runways,
     * airspace and its labels, the route's slot, the fixes and VFR
     * waypoints, the VORs, the airports.
     */
    fun styleJson(
        template: TileTemplate,
        minZoom: Int,
        maxZoom: Int,
        overlays: OverlayTiles?,
        night: Boolean,
        layers: MapLayers = MapLayers(),
    ): JsonObject =
        buildJsonObject {
            put("version", 8)
            put("glyphs", GLYPHS)
            putJsonObject("sources") {
                val tiles = buildJsonArray { add(template.pattern()) }
                val underlay = maxOf(minZoom, UNDERLAY_ZOOM)
                if (underlay < maxZoom) {
                    put(CHART_UNDER, rasterSource(tiles, underlay, underlay))
                }
                put(CHART, rasterSource(tiles, minZoom, maxZoom))
                if (overlays != null) {
                    putJsonObject(OVERLAY_SOURCE) {
                        put("type", "vector")
                        put("url", overlayUrl(overlays))
                    }
                }
                // The traffic's airplanes and their trend lines, empty until
                // an answer comes (ChartMap sets them).
                for (id in listOf(TRAFFIC, TRAFFIC_TREND)) {
                    putJsonObject(id) {
                        put("type", "geojson")
                        putJsonObject("data") {
                            put("type", "FeatureCollection")
                            putJsonArray("features") {}
                        }
                    }
                }
            }
            putJsonArray("layers") {
                val paint = chartPaint(night)
                if (maxOf(minZoom, UNDERLAY_ZOOM) < maxZoom) {
                    add(rasterLayer(CHART_UNDER, paint, minzoom = glZoom(maxOf(minZoom, UNDERLAY_ZOOM).toDouble())))
                }
                add(rasterLayer(CHART, paint))
                for (layer in overlayLayers(overlays, lines = true, layers)) add(layer)
                addJsonObject {
                    put("id", ROUTE_SLOT)
                    put("type", "background")
                    putJsonObject("layout") { put("visibility", "none") }
                }
                for (layer in overlayLayers(overlays, lines = false, layers)) add(layer)
                for (layer in trafficLayers()) add(layer)
            }
        }

    private fun rasterSource(tiles: JsonArray, minZoom: Int, maxZoom: Int) = buildJsonObject {
        put("type", "raster")
        put("tiles", tiles)
        // 256 with the @2x address on a dense screen, as the web's chart
        // source: each tile still covers 256 dp, now with two pixels to
        // each (TileTemplate's scale).
        put("tileSize", 256)
        put("minzoom", minZoom)
        put("maxzoom", maxZoom)
    }

    private fun rasterLayer(id: String, paint: ChartPaint, minzoom: Double? = null) = buildJsonObject {
        put("id", id)
        put("type", "raster")
        put("source", id)
        if (minzoom != null) put("minzoom", minzoom)
        putJsonObject("paint") {
            put("raster-fade-duration", 0)
            // Smooth, not nearest: past the chart's last zoom the owner chose
            // the smooth enlargement ForeFlight shows over hard blocks.
            put("raster-resampling", "linear")
            put("raster-brightness-max", paint.brightnessMax)
            put("raster-contrast", paint.contrast)
            put("raster-saturation", paint.saturation)
        }
    }

    /** The ids of the layers each switch turns off and the ones a tap is looked for in: design/map-style.json's groups
     *  (OverlayStyle.GROUPS), the web's AIRSPACE_TILE_LAYERS and the rest. */
    val AIRSPACE_LAYERS: List<String> = OverlayStyle.GROUPS.getValue("airspace")
    val NAVAID_LAYERS: List<String> = OverlayStyle.GROUPS.getValue("navaids")
    val AIRSPACE_LINES = listOf("airspace-D", "airspace-C", "airspace-B")
    /** The tile airports' layers, bottom to top: every field, a Class C's, then a Class B's (kept), each tier's towered over its others. */
    val AIRPORT_LAYERS: List<String> = OverlayStyle.GROUPS.getValue("airports")
    val AIRPORTS: String = AIRPORT_LAYERS.first()
    const val VORS = "navaids"
    const val FIXES = "fixes"
    const val WAYPOINTS = "vfr-waypoints"

    /** Whether a layer is drawn with the switches as they are (the web's
     *  applyOverlayFilters): the airspace's and the navaids' layers each
     *  follow their switch; every other is always drawn. */
    fun visible(id: String, layers: MapLayers): Boolean = when (id) {
        in AIRSPACE_LAYERS -> layers.airspace
        in NAVAID_LAYERS -> layers.navaids
        else -> true
    }

    /** design/map-style.json's layers as MapLibre Native takes them, parsed once: all on the archive's one source, where
     *  the web gives the airports and the VFR waypoints each their own over it. Two vector sources on one pmtiles address
     *  fetched and parsed each tile twice (the round-5 map audit's R5-6); what lays out the airports' tiles again here
     *  is a field's weather changing colour, at a rest, and a switch. */
    private val LINES: List<JsonObject> by lazy { OverlayStyle.LINES.map(::onOneSource) }
    private val MARKS: List<JsonObject> by lazy { OverlayStyle.MARKS.map(::onOneSource) }

    private fun onOneSource(json: String): JsonObject =
        JsonObject(Json.parseToJsonElement(json).jsonObject + ("source" to JsonPrimitive(OVERLAY_SOURCE)))

    /** The overlay layers of one part, the lines under the route's slot or the marks over it, none without an archive,
     *  each hidden whose switch is off. What changes over them -- the fields the switches hide, each field's weather --
     *  is the map's state (OverlayState), never a new layer. */
    fun overlayLayers(tiles: OverlayTiles?, lines: Boolean, layers: MapLayers = MapLayers()): List<JsonObject> {
        if (tiles == null) return emptyList()
        return (if (lines) LINES else MARKS).map { spec ->
            val id = spec["id"]!!.jsonPrimitive.content
            if (visible(id, layers)) {
                spec
            } else {
                val layout = (spec["layout"] as? JsonObject).orEmpty() + ("visibility" to JsonPrimitive("none"))
                JsonObject(spec + ("layout" to JsonObject(layout)))
            }
        }
    }

    // ---- Traffic ------------------------------------------------------

    /** The traffic's sources and layers (the web's TrafficGl, drawn there
     *  as markers): the airplanes, their trend lines, the ring round the
     *  one tracked and the height and callsign under each. Over every
     *  other layer, as the thing on the map that moves most. */
    const val TRAFFIC = "traffic"
    const val TRAFFIC_TREND = "traffic-trend"
    const val TRAFFIC_TRACKED = "traffic-tracked"
    const val TRAFFIC_LABELS = "traffic-labels"

    /** Traffic's colours (the web's TRAFFIC_COLOURS): within 1,000 ft of
     *  own ship's height amber (the engine's `traffic_marks` `near`), the
     *  rest the ADS-B displays' cyan; a near airplane's height in a paler
     *  amber on its dark tag. The tracked one's ring is the blue tint. */
    const val TRAFFIC_NEAR = WingtipColors.Chart.TRAFFIC_NEAR_HEX
    const val TRAFFIC_FAR = WingtipColors.Chart.TRAFFIC_FAR_HEX
    const val TRAFFIC_NEAR_TEXT = WingtipColors.Chart.TRAFFIC_NEAR_TEXT_HEX
    /** The tracked airplane's ring and own ship: the brand's tint, the
     *  app's tappable blue, not iOS's systemBlue. */
    val TINT = hex(WingtipPalettes.Light.tint)

    /** A colour as the "#rrggbb" a style takes. */
    fun hex(colour: androidx.compose.ui.graphics.Color): String =
        String.format(java.util.Locale.US, "#%06x", colour.toArgb() and 0xFFFFFF)

    /** An airplane's picture: a chevron turned to its track, or a dot
     *  where it sends none, amber or cyan. */
    fun trafficIconId(near: Boolean, hasTrack: Boolean): String =
        "traffic|${if (near) "near" else "far"}${if (hasTrack) "" else "|dot"}"

    const val TRAFFIC_TAG = "traffic|tag"

    /** Heights from Leaflet's 9 and callsigns from 10 (the web's
     *  HEIGHT_ZOOM, CALLSIGN_ZOOM); the tracked airplane's always. */
    const val TRAFFIC_HEIGHT_ZOOM = 9.0
    const val TRAFFIC_CALLSIGN_ZOOM = 10.0

    /** What is written under an airplane: nothing further out than the
     *  heights' zoom, its height from there, its height and callsign from
     *  the callsigns' zoom; the tracked one's both at every zoom. */
    private val TRAFFIC_TEXTS: List<JsonArray> = run {
        val tracked = e("==", e("get", "tracked"), true)
        listOf(
            e("case", tracked, e("get", "both"), ""),
            e("case", tracked, e("get", "both"), e("get", "label")),
            e("get", "both"),
        )
    }

    /** By zoom, MapLibre's zoom expressions being a top-level step's input
     *  alone: at each step, the text, or `of` each step's text. */
    private fun byTrafficZoom(of: (JsonArray) -> JsonElement): JsonArray = e(
        "step", e("zoom"),
        of(TRAFFIC_TEXTS[0]), glZoom(TRAFFIC_HEIGHT_ZOOM), of(TRAFFIC_TEXTS[1]), glZoom(TRAFFIC_CALLSIGN_ZOOM), of(TRAFFIC_TEXTS[2]),
    )

    val TRAFFIC_TEXT: JsonArray = byTrafficZoom { it }

    /** No tag where there is no text, so an empty one is not drawn. */
    val TRAFFIC_TAG_IMAGE: JsonArray = byTrafficZoom { e("case", e("==", it, ""), "", TRAFFIC_TAG) }

    fun trafficLayers(): List<JsonObject> {
        val near = e("==", e("get", "near"), true)
        val tracked = e("==", e("get", "tracked"), true)
        return listOf(
            buildJsonObject {
                put("id", TRAFFIC_TREND)
                put("type", "line")
                put("source", TRAFFIC_TREND)
                putJsonObject("layout") { put("line-cap", "round") }
                putJsonObject("paint") {
                    put("line-color", e("case", near, TRAFFIC_NEAR, TRAFFIC_FAR))
                    put("line-width", 2)
                }
            },
            buildJsonObject {
                put("id", TRAFFIC_TRACKED)
                put("type", "circle")
                put("source", TRAFFIC)
                put("filter", tracked)
                putJsonObject("paint") {
                    put("circle-radius", 15)
                    put("circle-color", "rgba(255,255,255,0.7)")
                    put("circle-stroke-color", TINT)
                    put("circle-stroke-width", 2.5)
                }
            },
            buildJsonObject {
                put("id", TRAFFIC)
                put("type", "symbol")
                put("source", TRAFFIC)
                putJsonObject("layout") {
                    put("icon-image", e("get", "icon"))
                    put("icon-rotate", e("get", "rotate"))
                    put("icon-rotation-alignment", "map")
                    put("icon-allow-overlap", true)
                    put("icon-ignore-placement", true)
                    put("symbol-sort-key", e("case", tracked, 1, 0))
                }
            },
            buildJsonObject {
                put("id", TRAFFIC_LABELS)
                put("type", "symbol")
                put("source", TRAFFIC)
                putJsonObject("layout") {
                    put("text-field", TRAFFIC_TEXT)
                    put("text-font", e(FONT))
                    put("text-size", 11)
                    put("text-anchor", "top")
                    put("text-offset", e(0, 1.1))
                    put("text-allow-overlap", true)
                    put("text-ignore-placement", true)
                    put("icon-image", TRAFFIC_TAG_IMAGE)
                    put("icon-text-fit", "both")
                    put("icon-text-fit-padding", e(1, 4, 1, 4))
                    put("icon-allow-overlap", true)
                    put("icon-ignore-placement", true)
                }
                putJsonObject("paint") {
                    put("text-color", e("case", near, TRAFFIC_NEAR_TEXT, WingtipColors.Chart.CASING_HEX))
                }
            },
        )
    }

    /** An expression, or any JSON array, from Kotlin values: strings,
     *  numbers, booleans, JSON, and a list as a JSON array. */
    fun e(vararg parts: Any?): JsonArray = JsonArray(parts.map(::element))

    private fun element(part: Any?): JsonElement = when (part) {
        null -> JsonNull
        is JsonElement -> part
        is String -> JsonPrimitive(part)
        is Number -> JsonPrimitive(part)
        is Boolean -> JsonPrimitive(part)
        is List<*> -> JsonArray(part.map(::element))
        else -> error("not JSON: $part")
    }
}
