package app.wingtipmaps.android.map

import androidx.compose.ui.graphics.toArgb
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The map's style as the web's MapLibre GL map has it
 * (apps/web/src/lib/map/gl/glStyle.ts and glOverlays.ts), for MapLibre
 * Native: the FAA chart, and over it the cycle's overlays from the
 * planner's vector tiles (wingtip.vector_tiles, a PMTiles archive read
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

    /** The overlay tiles' source, as the web's OVERLAY_SOURCE. */
    const val OVERLAY_SOURCE = "faa-overlays"

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
    fun overlayUrl(tiles: OverlayTiles): String =
        "pmtiles://${Config.gateway}${Config.plannerPath("/api/overlay-tiles/${tiles.name}.pmtiles")}"

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

    /** An airspace class's line (the web's AIRSPACE_INK): the sectional's
     *  symbology (Chart User's Guide, VFR Terms and Symbols, Airspace) --
     *  Class B solid blue, Class C solid magenta, Class D dashed blue --
     *  in ForeFlight's brighter blue and magenta, and bolder (B and C 4
     *  dp, D 3.5), so they stand off the chart's own printed ring. */
    data class Ink(val colour: String, val width: Float, val dash: List<Double>? = null, val band: Double = 0.3)

    val AIRSPACE_INK: Map<String, Ink> = mapOf(
        "B" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX, 4f),
        "C" to Ink(WingtipColors.Chart.AIRSPACE_MAGENTA_HEX, 4f),
        // A dash of 10 and a gap of 5, in MapLibre's units, the line's width.
        "D" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX, 3.5f, listOf(10 / 3.5, 5 / 3.5), band = 0.22),
    )

    /** From which Leaflet zoom each class is drawn, the web's
     *  AIRSPACE_FROM: B from 6, C from 7, D and every label from 8. */
    val AIRSPACE_FROM: Map<String, Double> = mapOf("B" to 6.0, "C" to 7.0, "D" to 8.0)
    const val AIRSPACE_LABELS_FROM = 8.0

    /** The airports' farthest zoom, Leaflet's (the web's
     *  AIRPORTS_FARTHEST_ZOOM); within it each field is in the tiles from
     *  its own zoom by its rank (AIRPORT_MIN_ZOOM in
     *  services/jobs/charts/overlays.py). */
    const val AIRPORTS_FARTHEST_ZOOM = 4.0
    /** The VORs from a region's zoom, the fixes and the VFR waypoints from
     *  10, Leaflet's (the web's VOR_ZOOM, FIX_ZOOM). */
    const val VOR_ZOOM = 8.0
    const val FIX_ZOOM = 10.0
    /** The VORs a pilot tunes (wingtip.fixes.VOR_KINDS, NASR NAV_TYPE). */
    val VOR_KINDS = listOf("VORTAC", "VOR/DME", "VOR")
    /** From MapLibre's 12, where the chart is only enlarged: before it a
     *  runway is under a pixel or two wide (the web's RUNWAYS_FROM). */
    const val RUNWAYS_FROM = 12.0

    /** The pictures the layers ask for, by id (OverlayPictures draws them). */
    fun airspaceTab(cls: String) = "airspace|tab|$cls"
    const val NAV_TAG = "nav|tag"
    /** The tiles' `airspace`, the class at the field's surface
     *  (services/jobs/charts/airports.py), and "" where an older archive
     *  has none: the unknown grey ring. */
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
     * by the web's layers -- runways, airspace and its labels, the
     * route's slot, the VORs, the fixes and VFR waypoints, the airports.
     * A layer of an archive that has not got it (an older build's) is
     * left out.
     */
    fun styleJson(
        template: TileTemplate,
        minZoom: Int,
        maxZoom: Int,
        overlays: OverlayTiles?,
        night: Boolean,
        layers: MapLayers = MapLayers(),
        weather: Map<String, String> = emptyMap(),
    ): String =
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
                for (layer in overlayLayers(overlays, lines = true, layers, weather)) add(layer)
                addJsonObject {
                    put("id", ROUTE_SLOT)
                    put("type", "background")
                    putJsonObject("layout") { put("visibility", "none") }
                }
                for (layer in overlayLayers(overlays, lines = false, layers, weather)) add(layer)
                for (layer in trafficLayers()) add(layer)
            }
        }.toString()

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

    /** The ids of the layers each switch turns off (the web's
     *  AIRSPACE_TILE_LAYERS, NAVAID_TILE_LAYERS), and the ones a tap is
     *  looked for in (the web's useGlTap layers). */
    val AIRSPACE_LINES = listOf("airspace-D", "airspace-C", "airspace-B")
    val AIRSPACE_LAYERS = listOf("D", "C", "B").flatMap { listOf("airspace-$it-band", "airspace-$it") } + "airspace-labels" + SpecialUseLayers.IDS
    val NAVAID_LAYERS = listOf("navaids", "navaids-idents", "fixes", "fixes-idents")
    const val AIRPORTS = "airports"
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

    /** The overlay layers of one part: the lines (runways, airspace) or
     *  the marks (navaids, fixes, airports); none without an archive. The
     *  switches as each layer's visibility and the airports' filter, the
     *  fields' weather as their pips. */
    fun overlayLayers(
        tiles: OverlayTiles?,
        lines: Boolean,
        layers: MapLayers = MapLayers(),
        weather: Map<String, String> = emptyMap(),
    ): List<JsonObject> {
        if (tiles == null) return emptyList()
        val has = tiles.layers.map { it.name }.toSet()
        val specs = if (lines) {
            (if ("runways" in has) runwayLayers() else emptyList()) +
                (if ("special_use" in has) SpecialUseLayers.lines() else emptyList()) +
                (if ("airspace" in has) airspaceLayers("airspace_labels" in has) else emptyList()) +
                (if ("special_use" in has) listOf(SpecialUseLayers.labels("special_use_labels" in has)) else emptyList())
        } else {
            marks(has, layers, weather)
        }
        return specs.map { spec ->
            val id = spec["id"]!!.jsonPrimitive.content
            if (visible(id, layers)) {
                spec
            } else {
                val layout = (spec["layout"] as? JsonObject).orEmpty() + ("visibility" to JsonPrimitive("none"))
                JsonObject(spec + ("layout" to JsonObject(layout)))
            }
        }
    }

    private fun marks(has: Set<String>, layers: MapLayers, weather: Map<String, String>): List<JsonObject> {
        val vor = e("match", e("get", "kind"), VOR_KINDS, true, false)
        val fix = e("all", e("==", e("get", "enroute_low"), true), e("!=", e("get", "vfr"), true))
        val waypoint = e("==", e("get", "vfr"), true)
        return (if ("navaids" in has) navaidMarks(VORS, "navaids", "vor", vor, VOR_ZOOM) else emptyList()) +
            (if ("fixes" in has) {
                navaidMarks(FIXES, "fixes", "fix", fix, FIX_ZOOM) +
                    navaidMarks(WAYPOINTS, "fixes", "vfr", waypoint, FIX_ZOOM)
            } else {
                emptyList()
            }) +
            (if ("airports" in has) listOf(airportsLayer(layers, weather)) else emptyList())
    }

    /** A figure of a tile's feature in whole feet MSL, as the web's
     *  airspaceText writes it. */
    private fun feetOf(field: String) = e("to-string", e("round", e("get", field)))

    /** The ring's tab, the web's AIRSPACE_TILE_LABEL, as ForeFlight writes
     *  it (the owner's screenshot over Madison, 2026-11-08): the class,
     *  then the floor and the ceiling in feet MSL with an en dash, "C:
     *  2300–4900", "B: SFC–10000"; the surface "SFC" (0 ft); a ceiling the
     *  volume stops under ("up to but not including", UPPER_DESC TNI,
     *  which the sectional prints as a minus: Chart User's Guide,
     *  Airspace) "<3000". */
    val AIRSPACE_LABEL: JsonArray = run {
        val top = e("concat", e("case", e("==", e("get", "ceiling_excluded"), true), "<", ""), feetOf("ceiling_ft"))
        val floor = e("case", e("==", e("coalesce", e("get", "floor_ft"), 0), 0), "SFC", feetOf("floor_ft"))
        e("concat", e("get", "class"), ": ", floor, "–", top)
    }

    /** A width by Leaflet zoom, MapLibre's levels. */
    private fun byZoom(vararg stops: Pair<Double, Double>): JsonArray =
        e("interpolate", e("linear"), e("zoom"), *stops.flatMap { (z, v) -> listOf(glZoom(z), v) }.toTypedArray())

    /** The band along the inside of a boundary (the web's BAND_WIDTH and
     *  BAND_OFFSET), as ForeFlight draws the sectional's vignette: wider
     *  as the map comes in, its middle half the band and a little over
     *  half the line inwards. A positive offset is to the right of a
     *  line's way, and a vector tile's outer ring runs clockwise on the
     *  screen and its holes anticlockwise (the Mapbox Vector Tile spec
     *  2.1, 4.3.4.4), so the right is always the inside. */
    private val BAND_STOPS = listOf(7.0 to 3.0, 9.0 to 6.0, 11.0 to 10.0, 13.0 to 16.0)
    val BAND_WIDTH: JsonArray = byZoom(*BAND_STOPS.toTypedArray())
    val BAND_OFFSET: JsonArray = byZoom(*BAND_STOPS.map { (z, w) -> z to w / 2 + 1.5 }.toTypedArray())

    /** Each class's band and line from that class's zoom, and the
     *  altitudes in a dark tab bordered in the class's ink, one a shelf on
     *  its ring and turned along it from the tiles' `airspace_labels`
     *  (the charts job's airspace_label_features), or along every ring
     *  where an older archive has not got that layer (the web's
     *  airspaceLayers). The map never turns (ChartMap), so the tiles'
     *  turn is the screen's. */
    private fun airspaceLayers(labelPoints: Boolean): List<JsonObject> {
        val lines = listOf("D", "C", "B").flatMap { cls ->
            val ink = AIRSPACE_INK.getValue(cls)
            listOf(
                buildJsonObject {
                    put("id", "airspace-$cls-band")
                    put("type", "line")
                    from("airspace")
                    put("minzoom", glZoom(AIRSPACE_FROM.getValue(cls)))
                    put("filter", e("==", e("get", "class"), cls))
                    putJsonObject("layout") { put("line-join", "round") }
                    putJsonObject("paint") {
                        put("line-color", ink.colour)
                        put("line-opacity", ink.band)
                        put("line-width", BAND_WIDTH)
                        put("line-offset", BAND_OFFSET)
                    }
                },
                buildJsonObject {
                    put("id", "airspace-$cls")
                    put("type", "line")
                    from("airspace")
                    put("minzoom", glZoom(AIRSPACE_FROM.getValue(cls)))
                    put("filter", e("==", e("get", "class"), cls))
                    putJsonObject("layout") {
                        put("line-join", "round")
                        put("line-cap", if (ink.dash != null) "butt" else "round")
                    }
                    putJsonObject("paint") {
                        put("line-color", ink.colour)
                        put("line-width", ink.width)
                        if (ink.dash != null) put("line-dasharray", e(*ink.dash.toTypedArray()))
                    }
                },
            )
        }
        val labels = buildJsonObject {
            put("id", "airspace-labels")
            put("type", "symbol")
            from(if (labelPoints) "airspace_labels" else "airspace")
            put("minzoom", glZoom(AIRSPACE_LABELS_FROM))
            val classes = e("match", e("get", "class"), listOf("B", "C", "D"), true, false)
            put("filter", if (labelPoints) classes else e("all", classes, e("has", "ceiling_ft")))
            putJsonObject("layout") {
                put("text-field", AIRSPACE_LABEL)
                put("text-font", e(FONT))
                put("text-size", byZoom(8.0 to 11.0, 12.0 to 13.0))
                put("icon-image", e("concat", "airspace|tab|", e("get", "class")))
                put("icon-text-fit", "both")
                put("icon-text-fit-padding", e(2, 6, 2, 6))
                put("text-padding", 4)
                // Never on another tab or an airport's mark; the nearer
                // class wins.
                put("text-allow-overlap", false)
                put("icon-allow-overlap", false)
                put("symbol-sort-key", e("match", e("get", "class"), "B", 0, "C", 1, 2))
                if (labelPoints) {
                    put("text-rotate", e("get", "angle"))
                    put("icon-rotate", e("get", "angle"))
                    put("text-rotation-alignment", "map")
                    put("icon-rotation-alignment", "map")
                } else {
                    put("symbol-placement", "line")
                    put("symbol-spacing", 320)
                    put("text-rotation-alignment", "viewport")
                    put("icon-rotation-alignment", "viewport")
                    put("text-keep-upright", true)
                    put("text-max-angle", 30)
                }
            }
            putJsonObject("paint") { put("text-color", "#ffffff") }
        }
        return lines + labels
    }

    /** The runways as ForeFlight draws them close in: a dark grey surface
     *  (a soft one lighter), a dashed white centreline, and each end's
     *  number bold white on a dark halo, turned to read from the approach
     *  end. From NASR APT_RWY and APT_RWY_END (the web's runwayLayers). */
    private fun runwayLayers(): List<JsonObject> = listOf(
        buildJsonObject {
            put("id", "runway-surface")
            put("type", "fill")
            from("runways")
            put("minzoom", RUNWAYS_FROM)
            put("filter", e("==", e("get", "part"), "surface"))
            putJsonObject("paint") {
                put("fill-color", e("case", e("==", e("get", "hard"), true), WingtipColors.Chart.RUNWAY_HARD_HEX, WingtipColors.Chart.RUNWAY_SOFT_HEX))
                put("fill-outline-color", "#ffffff")
                put("fill-opacity", 0.95)
            }
        },
        buildJsonObject {
            put("id", "runway-centreline")
            put("type", "line")
            from("runways")
            put("minzoom", RUNWAYS_FROM + 1)
            put("filter", e("==", e("get", "part"), "centreline"))
            putJsonObject("paint") {
                put("line-color", "#ffffff")
                put("line-width", e("interpolate", e("linear"), e("zoom"), 13, 0.75, 16, 2))
                put("line-dasharray", e(4, 3))
            }
        },
        buildJsonObject {
            put("id", "runway-ends")
            put("type", "symbol")
            from("runways")
            put("minzoom", RUNWAYS_FROM + 0.5)
            put("filter", e("==", e("get", "part"), "end"))
            putJsonObject("layout") {
                put("text-field", e("get", "end_id"))
                put("text-font", e(FONT))
                put("text-size", e("interpolate", e("linear"), e("zoom"), 12.5, 10, 16, 16))
                put("text-rotation-alignment", "map")
                // The end's true heading (APT_RWY_END), so the number's top
                // points down the runway, as it is painted.
                put("text-rotate", e("get", "heading"))
                put("text-offset", e(0, -1.1))
                put("text-allow-overlap", true)
            }
            putJsonObject("paint") {
                put("text-color", "#ffffff")
                put("text-halo-color", FIX_INK)
                put("text-halo-width", 1.75)
            }
        },
    )

    /** The mark, its ident beside it on whichever side is clear (the web's
     *  navaidMarks): a VOR's ident and frequency on its blue tag, "GCO
     *  (108.25)" as ForeFlight writes it; a fix's and a waypoint's bold,
     *  dark or green on a white halo. */
    private fun navaidMarks(id: String, layer: String, kind: String, filter: JsonArray, fromLeafletZoom: Double): List<JsonObject> {
        val mark = buildJsonObject {
            put("id", id)
            put("type", "symbol")
            from(layer)
            put("filter", filter)
            put("minzoom", glZoom(fromLeafletZoom))
            putJsonObject("layout") {
                put("icon-image", "nav|$kind")
                put("icon-allow-overlap", true)
                put("icon-ignore-placement", true)
            }
        }
        val idents = buildJsonObject {
            put("id", "$id-idents")
            put("type", "symbol")
            from(layer)
            put("filter", filter)
            put("minzoom", glZoom(fromLeafletZoom))
            putJsonObject("layout") {
                put(
                    "text-field",
                    e("case", e("has", "freq"), e("concat", e("get", "ident"), " (", e("get", "freq"), ")"), e("get", "ident")),
                )
                put("text-font", e(FONT))
                put("text-size", e("interpolate", e("linear"), e("zoom"), 6, 10, 10, 12))
                put("text-variable-anchor", e("left", "right"))
                put("text-radial-offset", 1.1)
                put("text-justify", "auto")
                if (kind == "vor") {
                    put("icon-image", NAV_TAG)
                    put("icon-text-fit", "both")
                    put("icon-text-fit-padding", e(1, 4, 1, 4))
                }
            }
            putJsonObject("paint") {
                put("text-color", when (kind) { "vor" -> "#ffffff"; "vfr" -> VFR_GREEN; else -> FIX_INK })
                if (kind != "vor") {
                    put("text-halo-color", "#ffffff")
                    put("text-halo-width", 2)
                }
            }
        }
        return listOf(mark, idents)
    }

    /** How much larger each of the engine's size steps is drawn
     *  (field_mark_rank's `size`, the tiles' `size`), as on the owner's
     *  canvas (option I, 2026-11-14) and the web's MARK_SIZE: a Class B's
     *  field 1.5 times an ordinary towered field, a Class C's 1.2, a small
     *  field 0.82; an older archive's, with none, 1. */
    private val MARK_SIZE = e("match", e("get", "size"), "largest", 1.5, "larger", 1.2, "small", 0.82, 1)
    private val AIRPORT_USE = e(
        "case",
        e("==", e("get", "military"), "military"), "military",
        e("==", e("get", "use"), "private"), "private",
        e("==", e("get", "type"), "heliport"), "heliport",
        "",
    )
    private val TOWERED = e("==", e("get", "towered"), true)

    /** Which fields are drawn (the web's applyOverlayFilters): the armed
     *  services' own fields and the private ones only where their switch
     *  is on; a joint-use field (NASR's military "joint") always. */
    fun airportsFilter(layers: MapLayers): JsonArray = e(
        "all",
        *listOfNotNull(
            if (layers.military) null else e("!=", e("get", "military"), "military"),
            if (layers.privateFields) null else e("!=", e("get", "use"), "private"),
        ).toTypedArray(),
    )

    /** A field's weather pip by its ident (the web's weatherExpression):
     *  the fields of each colour in one branch of a match; "" before the
     *  METARs are in or where a field has none. */
    fun weatherExpression(colours: Map<String, String>): JsonElement {
        if (colours.isEmpty()) return JsonPrimitive("")
        val byColour = colours.entries.groupBy({ it.value }, { it.key })
        val branches = byColour.entries.sortedBy { it.key }.flatMap { (colour, idents) -> listOf(idents.sorted(), colour) }
        return e("match", e("get", "ident"), *branches.toTypedArray(), "")
    }

    /** The airports' mark's picture by its ring, weather and use
     *  (airportMarkId), an expression on the tile's fields. */
    fun airportIcon(colours: Map<String, String>): JsonArray =
        e("concat", "apt|", e("coalesce", e("get", "airspace"), ""), "|", weatherExpression(colours), "|", AIRPORT_USE)

    /** The airports' one symbol layer (the web's airportMarksLayer): the
     *  mark by its ring, weather and use, sized by the field, its ident beside it in bold
     *  in the field's ink (the sectional sets an airport's name in the
     *  symbol's colour, Chart User's Guide, Airports), kept apart by
     *  MapLibre's collision in `rank` order, the fields the switches hide
     *  left off (airportsFilter). */
    private fun airportsLayer(layers: MapLayers, weather: Map<String, String>): JsonObject = buildJsonObject {
        val farthest = glZoom(AIRPORTS_FARTHEST_ZOOM)
        put("id", AIRPORTS)
        put("type", "symbol")
        from("airports")
        put("minzoom", farthest)
        put("filter", airportsFilter(layers))
        putJsonObject("layout") {
            put("icon-image", airportIcon(weather))
            // Smaller out at a state's width, a field's own size closer in,
            // following a pinch frame by frame; at each zoom the field's own
            // size step (MARK_SIZE), the biggest largest.
            put("icon-size", e("interpolate", e("linear"), e("zoom"), farthest, e("*", 0.7, MARK_SIZE), glZoom(10.0), MARK_SIZE, glZoom(13.0), e("*", 1.25, MARK_SIZE)))
            put("icon-allow-overlap", false)
            // Out at a few states a mark's room is 27 px; closer in, its own.
            put("icon-padding", e("step", e("zoom"), 27, glZoom(7.0), 2))
            put("symbol-sort-key", e("get", "rank"))
            put("text-field", e("get", "ident"))
            put("text-font", e(FONT))
            put("text-size", e("interpolate", e("linear"), e("zoom"), farthest, 10, glZoom(10.0), 12, glZoom(13.0), 13))
            put("text-anchor", "left")
            put("text-offset", e(1.3, 0))
            // The ident gives way, the mark stays: a busy area keeps its fields.
            put("text-optional", true)
            put("text-padding", 1)
        }
        putJsonObject("paint") {
            put("text-color", e("case", TOWERED, BLUE, MAGENTA))
            put("text-halo-color", "#ffffff")
            put("text-halo-width", 2)
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
                    put("text-color", e("case", near, TRAFFIC_NEAR_TEXT, "#ffffff"))
                }
            },
        )
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.from(layer: String) {
        put("source", OVERLAY_SOURCE)
        put("source-layer", layer)
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
