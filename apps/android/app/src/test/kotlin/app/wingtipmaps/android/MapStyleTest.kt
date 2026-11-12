package app.wingtipmaps.android

import app.wingtipmaps.android.api.ChartInfo
import app.wingtipmaps.android.api.ChartLayer
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.generated.OverlayTilesLayer
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.map.SpecialUseLayers
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The map's first style as the web's MapLibre map has it (glStyle.ts,
 *  glOverlays.ts): the chart, then the cycle's overlay tiles. */
class MapStyleTest {
    private val template = TileTemplate("2025-10-30", 3, null, "sec", scale = 2)

    private fun tiles(vararg layers: String) = OverlayTiles(
        builtAt = 0.0, bytes = 1, cycle = "2025-10-30", layers = layers.map { OverlayTilesLayer(1, it) },
        maxZoom = 12, minZoom = 4, name = "overlays-2025-10-30-3", toleranceM = 15.0, version = 3,
    )

    private fun style(overlays: OverlayTiles?, night: Boolean = false): JsonObject =
        Json.parseToJsonElement(MapStyle.styleJson(template, 5, 12, overlays, night)).jsonObject

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
        // Lines under the route's slot, marks over it, as the web's slots.
        assertEquals(
            listOf(
                "chart-under", "chart",
                "runway-surface", "runway-centreline", "runway-ends",
                "sua-band", "sua-line",
                "airspace-D-band", "airspace-D", "airspace-C-band", "airspace-C", "airspace-B-band", "airspace-B", "airspace-labels",
                "sua-labels",
                MapStyle.ROUTE_SLOT,
                "navaids", "navaids-idents", "fixes", "fixes-idents", "vfr-waypoints", "vfr-waypoints-idents",
                "airports",
            ) + TRAFFIC,
            ids(s),
        )
    }

    @Test
    fun aLayerTheArchiveHasNotGotIsLeftOut() {
        val s = style(tiles("airspace", "airports"))
        assertFalse(ids(s).contains("runway-surface"))
        assertFalse(ids(s).contains("navaids"))
        assertTrue(ids(s).contains("airports"))
    }

    @Test
    fun theAirspaceIsTheWebsInksAndZooms() {
        val s = style(tiles("airspace", "airspace_labels"))
        val b = layer(s, "airspace-B")
        assertEquals("#2f8cff", b["paint"]!!.jsonObject["line-color"]!!.jsonPrimitive.content)
        assertEquals("4.0", b["paint"]!!.jsonObject["line-width"]!!.jsonPrimitive.content)
        assertEquals("5.0", b["minzoom"]!!.jsonPrimitive.content)
        val d = layer(s, "airspace-D")
        assertTrue(d["paint"]!!.jsonObject.containsKey("line-dasharray"))
        assertEquals("7.0", d["minzoom"]!!.jsonPrimitive.content)
        // The band inside each line: its own ink, faint, offset inwards.
        val band = layer(s, "airspace-C-band")["paint"]!!.jsonObject
        assertEquals("#e02ad8", band["line-color"]!!.jsonPrimitive.content)
        assertEquals(MapStyle.BAND_OFFSET, band["line-offset"])
        // One tab a shelf, from the label points, turned along its ring.
        val labels = layer(s, "airspace-labels")
        assertEquals("airspace_labels", labels["source-layer"]!!.jsonPrimitive.content)
        val layout = labels["layout"]!!.jsonObject
        assertEquals("""["concat","airspace|tab|",["get","class"]]""", layout["icon-image"].toString())
        assertEquals("""["get","angle"]""", layout["text-rotate"].toString())
        assertFalse(layout.containsKey("symbol-placement"))
        assertEquals(MapStyle.AIRSPACE_LABEL, layout["text-field"])
        // An older archive without them: along every ring, as before.
        val older = layer(style(tiles("airspace")), "airspace-labels")
        assertEquals("line", older["layout"]!!.jsonObject["symbol-placement"]!!.jsonPrimitive.content)
    }

    @Test
    fun theAirspaceLabelIsForeFlightsFloorToCeilingInFeet() {
        // ["concat", ["get","class"], ": ", floor, "–", top]: "C: 2300–4900".
        val label = MapStyle.AIRSPACE_LABEL
        assertEquals("concat", label[0].jsonPrimitive.content)
        val floor = label[3] as JsonArray
        assertEquals("SFC", floor[2].jsonPrimitive.content)
        assertEquals("–", label[4].jsonPrimitive.content)
        val top = label[5] as JsonArray
        assertEquals("""["case",["==",["get","ceiling_excluded"],true],"<",""]""", top[1].toString())
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
        // From the archive's tab points: the name, then the limits, turned.
        val tab = layer(style(tiles("special_use", "special_use_labels")), SpecialUseLayers.LABELS)
        assertEquals("special_use_labels", tab["source-layer"]!!.jsonPrimitive.content)
        assertEquals("7.0", tab["minzoom"]!!.jsonPrimitive.content)
        val layout = tab["layout"]!!.jsonObject
        assertEquals(SpecialUseLayers.TAB_TEXT, layout["text-field"])
        assertEquals("""["get","angle"]""", layout["text-rotate"].toString())
        assertTrue(layout["icon-image"].toString().contains(SpecialUseLayers.TAB_RESTRICTED))
        assertEquals("both", layout["icon-text-fit"]!!.jsonPrimitive.content)
        // "M-BRADY NOR*:" over "3600-17999": the engine's words, which the
        // charts job writes into the tiles as `tab`; the name alone in an
        // archive from before them.
        assertEquals("""["coalesce",["get","tab"],["get","label"]]""", SpecialUseLayers.TAB_TEXT.toString())
        // An older archive: the name alone along the boundary.
        val older = layer(style(tiles("special_use")), SpecialUseLayers.LABELS)
        assertEquals("special_use", older["source-layer"]!!.jsonPrimitive.content)
        assertEquals("line", older["layout"]!!.jsonObject["symbol-placement"]!!.jsonPrimitive.content)
    }

    @Test
    fun theAirportsWearTheSectionalsSymbolsAndLeaveOffMilitaryAndPrivateFields() {
        val airports = layer(style(tiles("airports")), "airports")
        assertEquals(
            """["all",["!=",["get","military"],"military"],["!=",["get","use"],"private"]]""",
            airports["filter"].toString(),
        )
        assertEquals("apt|t|large||", MapStyle.airportMarkId(true, "large", "", ""))
        assertEquals("apt|u|other|#1a7f37|private", MapStyle.airportMarkId(false, "other", "#1a7f37", "private"))
        val colour = airports["paint"]!!.jsonObject["text-color"]!!.jsonArray
        assertEquals(MapStyle.BLUE, colour[2].jsonPrimitive.content)
        assertEquals(MapStyle.MAGENTA, colour[3].jsonPrimitive.content)
    }

    @Test
    fun aVorsIdentIsOnItsBlueTag() {
        val idents = layer(style(tiles("navaids", "fixes")), "navaids-idents")["layout"]!!.jsonObject
        assertEquals(MapStyle.NAV_TAG, idents["icon-image"]!!.jsonPrimitive.content)
        val fixes = layer(style(tiles("navaids", "fixes")), "fixes-idents")["layout"]!!.jsonObject
        assertNull(fixes["icon-image"])
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
