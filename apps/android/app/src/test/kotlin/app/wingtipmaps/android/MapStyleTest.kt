package app.wingtipmaps.android

import app.wingtipmaps.android.api.ChartInfo
import app.wingtipmaps.android.api.ChartLayer
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.generated.OverlayTilesLayer
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.map.SpecialUseLayers
import app.wingtipmaps.android.map.generated.OverlayStyle
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The map's first style: the chart, then the cycle's overlay tiles in
 *  design/map-style.json's layers (OverlayStyle), the web's the same. */
class MapStyleTest {
    private val template = TileTemplate("2025-10-30", 3, null, "sec", scale = 2)

    private fun tiles(vararg layers: String) = OverlayTiles(
        builtAt = 0.0, bytes = 1, cycle = "2025-10-30", layers = layers.map { OverlayTilesLayer(1, it) },
        maxZoom = 12, minZoom = 4, name = "overlays-2025-10-30-3", toleranceM = 15.0, version = 3,
    )

    private fun style(overlays: OverlayTiles?, night: Boolean = false): JsonObject =
        MapStyle.styleJson(template, 5, 12, overlays, night)

    private val TRAFFIC = listOf(MapStyle.TRAFFIC_TREND, MapStyle.TRAFFIC_TRACKED, MapStyle.TRAFFIC, MapStyle.TRAFFIC_LABELS)

    private fun ids(style: JsonObject) = style["layers"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }

    private fun layer(style: JsonObject, id: String) = style["layers"]!!.jsonArray.first { it.jsonObject["id"]!!.jsonPrimitive.content == id }.jsonObject

    @Test
    fun theChartIsTheSharpTilesWithARegionsLevelUnderIt() {
        val s = style(null)
        val chart = s["sources"]!!.jsonObject["chart"]!!.jsonObject
        assertEquals("256", chart["tileSize"]!!.jsonPrimitive.content)
        assertTrue(chart["tiles"]!!.jsonArray[0].jsonPrimitive.content.contains("{y}@2x.png"))
        val under = s["sources"]!!.jsonObject["chart-under"]!!.jsonObject
        assertEquals("5", under["minzoom"]!!.jsonPrimitive.content)
        assertEquals("5", under["maxzoom"]!!.jsonPrimitive.content)
        assertEquals(listOf("chart-under", "chart", MapStyle.ROUTE_SLOT) + TRAFFIC, ids(s))
        assertEquals(13.0, MapStyle.maxZoom(12), 0.0)
    }

    @Test
    fun theChartIsLiftedByDayAndDimmedAtNight() {
        val day = layer(style(null), "chart")["paint"]!!.jsonObject
        assertEquals("0.1", day["raster-contrast"]!!.jsonPrimitive.content)
        assertEquals("0.1", day["raster-saturation"]!!.jsonPrimitive.content)
        assertEquals("0", day["raster-fade-duration"]!!.jsonPrimitive.content)
        val night = layer(style(null, night = true), "chart")["paint"]!!.jsonObject
        assertEquals("0.5", night["raster-brightness-max"]!!.jsonPrimitive.content)
        assertEquals("0.0", night["raster-saturation"]!!.jsonPrimitive.content)
    }

    @Test
    fun theOverlaysAreThePlannersArchiveInTheFirstStyle() {
        val s = style(tiles("airspace", "airspace_labels", "special_use", "airports", "navaids", "fixes", "runways"))
        val source = s["sources"]!!.jsonObject[MapStyle.OVERLAY_SOURCE]!!.jsonObject
        assertEquals("vector", source["type"]!!.jsonPrimitive.content)
        assertEquals(
            "pmtiles://${Config.gateway}/api/planner/overlay-tiles/overlays-2025-10-30-3.pmtiles",
            source["url"]!!.jsonPrimitive.content,
        )
        assertEquals(MapStyle.GLYPHS, s["glyphs"]!!.jsonPrimitive.content)
        // One vector source on the archive, every overlay layer's: two on one address fetched each tile twice (R5-6).
        assertEquals(listOf("chart-under", "chart", MapStyle.OVERLAY_SOURCE, MapStyle.TRAFFIC, MapStyle.TRAFFIC_TREND), s["sources"]!!.jsonObject.keys.toList())
        val overlay = ids(s).filter { it != MapStyle.ROUTE_SLOT && it !in TRAFFIC && !it.startsWith("chart") }
        for (id in overlay) assertEquals(id, MapStyle.OVERLAY_SOURCE, layer(s, id)["source"]!!.jsonPrimitive.content)
        // design/map-style.json's layers, the web's: lines under the route's slot, marks over it, as the web's slots.
        assertEquals(
            listOf(
                "chart-under", "chart",
                "runway-surface", "runway-centreline", "runway-ends",
                "sua-band", "sua-line",
                "airspace-D-band", "airspace-D", "airspace-C-band", "airspace-C", "airspace-B-band", "airspace-B", "airspace-labels",
                "sua-labels",
                MapStyle.ROUTE_SLOT,
                "fixes", "fixes-idents", "vfr-waypoints", "vfr-waypoints-idents", "navaids", "navaids-idents",
                "airports", "airports-towered", "airports-c", "airports-c-towered", "airports-kept", "airports-kept-towered",
            ) + TRAFFIC,
            ids(s),
        )
    }

    @Test
    fun theGeneratedLayersAreWhollyResolvedForAndroid() {
        // No word of design/map-style.json's vocabulary left, and the words in the one font the app's assets hold.
        val all = (OverlayStyle.LINES + OverlayStyle.MARKS).joinToString()
        assertFalse(all, all.contains("\$"))
        assertFalse(all, all.contains("{color."))
        val s = style(tiles("runways"))
        val fonts = ids(s).mapNotNull { layer(s, it)["layout"]?.jsonObject?.get("text-font")?.toString() }.toSet()
        assertEquals(setOf("""["${MapStyle.FONT}"]"""), fonts)
    }

    @Test
    fun theAirspaceIsTheWebsInksAndZooms() {
        val s = style(tiles("airspace", "airspace_labels"))
        val b = layer(s, "airspace-B")
        assertEquals("#2f8cff", b["paint"]!!.jsonObject["line-color"]!!.jsonPrimitive.content)
        // design/tokens.json's map.zoom, MapLibre's: B and C from the app's 5, half their width there, full by 7 with
        // their band; D from 7; every tab from 9.
        assertEquals("""["interpolate",["linear"],["zoom"],4,2,6,4]""", b["paint"]!!.jsonObject["line-width"].toString())
        assertEquals("4", b["minzoom"]!!.jsonPrimitive.content)
        assertEquals("4", layer(s, "airspace-C")["minzoom"]!!.jsonPrimitive.content)
        assertEquals("6", layer(s, "airspace-C-band")["minzoom"]!!.jsonPrimitive.content)
        val d = layer(s, "airspace-D")
        assertTrue(d["paint"]!!.jsonObject.containsKey("line-dasharray"))
        assertEquals("6", d["minzoom"]!!.jsonPrimitive.content)
        assertEquals("8", layer(s, "airspace-labels")["minzoom"]!!.jsonPrimitive.content)
        // The band inside each line: its own ink, faint, offset inwards; dimmed at night by its colour on the web.
        val band = layer(s, "airspace-C-band")
        assertEquals("#e02ad8", band["paint"]!!.jsonObject["line-color"]!!.jsonPrimitive.content)
        assertEquals("""["interpolate",["linear"],["zoom"],6,3,8,4.5,10,6.5,12,9.5]""", band["paint"]!!.jsonObject["line-offset"].toString())
        assertEquals("""{"wingtip:dim":"colour"}""", band["metadata"].toString())
        // One tab a shelf in the engine's words the tiles carry, turned along its ring.
        val labels = layer(s, "airspace-labels")
        assertEquals("airspace_labels", labels["source-layer"]!!.jsonPrimitive.content)
        val layout = labels["layout"]!!.jsonObject
        assertEquals("""["concat","airspace|tab|",["get","class"]]""", layout["icon-image"].toString())
        assertEquals("""["get","angle"]""", layout["text-rotate"].toString())
        assertEquals("""["get","tab"]""", layout["text-field"].toString())
    }

    @Test
    fun theSpecialUseAreasAreALineAndAHatchedBand() {
        val s = style(tiles("special_use"))
        val band = layer(s, "sua-band")["paint"]!!.jsonObject
        assertTrue(band["line-pattern"].toString().contains(SpecialUseLayers.HATCH_RESTRICTED))
        val line = layer(s, "sua-line")["paint"]!!.jsonObject
        assertTrue(line["line-color"].toString().contains(SpecialUseLayers.RESTRICTED_INK))
    }

    @Test
    fun aSpecialUseAreasTabIsItsNameOverItsAltitudesTurnedAlongItsSide() {
        // From the archive's tab points: the engine's words, turned.
        val tab = layer(style(tiles("special_use", "special_use_labels")), "sua-labels")
        assertEquals("special_use_labels", tab["source-layer"]!!.jsonPrimitive.content)
        assertEquals("8", tab["minzoom"]!!.jsonPrimitive.content)
        val layout = tab["layout"]!!.jsonObject
        assertEquals("""["get","tab"]""", layout["text-field"].toString())
        assertEquals("""["get","angle"]""", layout["text-rotate"].toString())
        assertTrue(layout["icon-image"].toString().contains(SpecialUseLayers.TAB_RESTRICTED))
        assertEquals("both", layout["icon-text-fit"]!!.jsonPrimitive.content)
    }

    @Test
    fun theAirportsWearThePlannersMarkSizedByTheFieldAndLeaveOffMilitaryAndPrivateFields() {
        val s = style(tiles("airports"))
        val airports = layer(s, "airports")
        // The switches and the route's fields by the map's state (OverlayState), never a new filter.
        val filter = airports["filter"].toString()
        assertTrue(filter, filter.contains("""["global-state","showMilitary"]"""))
        assertTrue(filter, filter.contains("""["global-state","showPrivate"]"""))
        assertEquals("apt|B||", MapStyle.airportMarkId("B", "", ""))
        assertEquals("apt||h#1a7f37|private", MapStyle.airportMarkId("", "h#1a7f37", "private"))
        // The ring is the tiles' surface airspace, its weather the map's state by ident (N4: no match over every field).
        val icon = layer(s, "airports-kept")["layout"]!!.jsonObject["icon-image"].toString()
        assertTrue(icon, icon.contains("""["coalesce",["get","airspace"],""]"""))
        assertTrue(icon, icon.contains("""["global-state","airportWeather"]"""))
        val layout = airports["layout"]!!.jsonObject
        // Each zoom's size times the engine's size step (field_mark_rank), at the Android pictures' own scale.
        val size = layout["icon-size"]!!.toString()
        assertTrue(size, size.contains("""["*",0.7,["match",["get","size"],"largest",1.5,"larger",1.2,"small",0.82,1]]"""))
        assertEquals("2", layout["icon-padding"]!!.jsonPrimitive.content)
        // A towered or Class B field named wherever drawn, every other field from the app's 8.
        assertTrue(layout["text-field"].toString(), layout["text-field"].toString().startsWith("""["step",["zoom"],["case",["any","""))
        // One ink a layer, the untowered fields' magenta and the towered fields' blue, the open card's field's ident
        // hidden by its opacity (W1).
        assertEquals(MapStyle.MAGENTA, airports["paint"]!!.jsonObject["text-color"]!!.jsonPrimitive.content)
        assertEquals(MapStyle.BLUE, layer(s, "airports-towered")["paint"]!!.jsonObject["text-color"]!!.jsonPrimitive.content)
        assertEquals("""["case",["boolean",["feature-state","selected"],false],0,1]""", airports["paint"]!!.jsonObject["text-opacity"].toString())
    }

    @Test
    fun aVorsIdentIsOnItsBlueTag() {
        val s = style(tiles("navaids", "fixes"))
        val idents = layer(s, "navaids-idents")["layout"]!!.jsonObject
        assertEquals("""["case",["==","vor","vor"],"${MapStyle.NAV_TAG}",""]""", idents["icon-image"].toString())
        val fixes = layer(s, "fixes-idents")["layout"]!!.jsonObject
        assertEquals("""["case",["==","fix","vor"],"${MapStyle.NAV_TAG}",""]""", fixes["icon-image"].toString())
    }

    @Test
    fun theSharpTilesAreAskedForOnADenseScreenWhereTheKindWasDrawnAtThem() {
        val info = ChartInfo(
            chartCycle = "2025-10-30", chartRevision = 3, chartTilesBase = null, maxZoom = 12, minZoom = 5,
            chartLayers = listOf(ChartLayer(base = true, kind = "sec", label = "Sectional", maxZoom = 12, minZoom = 5, scales = listOf(1, 2))),
        )
        assertEquals(2, Charts.template(info, density = 2.75f)!!.scale)
        assertEquals(1, Charts.template(info, density = 1f)!!.scale)
    }
}
