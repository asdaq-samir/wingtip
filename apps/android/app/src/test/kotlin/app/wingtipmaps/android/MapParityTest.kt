package app.wingtipmaps.android

import app.wingtipmaps.android.api.ChartInfo
import app.wingtipmaps.android.api.ChartLayer
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.api.generated.OverlayTilesLayer
import app.wingtipmaps.android.engine.TrafficMarksAnswerElement
import app.wingtipmaps.android.flight.Geo
import app.wingtipmaps.android.map.MapLayers
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.MapRest
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.map.MapWeather
import app.wingtipmaps.android.map.TrafficDrawing
import app.wingtipmaps.android.tiles.TileTemplate
import app.wingtipmaps.android.ui.airspaceHours
import app.wingtipmaps.android.ui.declinationOf
import app.wingtipmaps.android.ui.degreesMinutes
import app.wingtipmaps.android.ui.threeFigures
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The map's parity with the web's (#546's follow-on): the weather pips,
 *  Setup's switches on the layers, the cards' fields from a tapped
 *  feature, the terminal area chart, the traffic drawn, and the wording
 *  the cards write. */
class MapParityTest {
    private val template = TileTemplate("2025-10-30", 3, null, "sec", scale = 2)
    private val tiles = OverlayTiles(
        builtAt = 0.0, bytes = 1, cycle = "2025-10-30",
        layers = listOf("airspace", "airspace_labels", "special_use", "airports", "navaids", "fixes", "runways").map { OverlayTilesLayer(1, it) },
        maxZoom = 12, minZoom = 4, name = "2025-10-30-v3-0", toleranceM = 15.0, version = 3,
    )

    private fun style(layers: MapLayers = MapLayers(), weather: Map<String, String> = emptyMap()): JsonObject =
        Json.parseToJsonElement(MapStyle.styleJson(template, 5, 12, tiles, false, layers, weather)).jsonObject

    private fun layer(style: JsonObject, id: String) =
        style["layers"]!!.jsonArray.first { it.jsonObject["id"]!!.jsonPrimitive.content == id }.jsonObject

    private fun visibility(style: JsonObject, id: String) =
        layer(style, id)["layout"]?.jsonObject?.get("visibility")?.jsonPrimitive?.content

    @Test
    fun aFieldWearsItsCategorysPipJoinedByIdent() {
        val icon = layer(style(weather = mapOf("KORD" to "#1a7f37", "KMDW" to "#1a7f37", "KDPA" to "#b3261e")), "airports")
            .getValue("layout").jsonObject.getValue("icon-image").toString()
        // The fields of each colour in one branch of a match on the ident.
        assertTrue(icon, icon.contains("""["match",["get","ident"],["KMDW","KORD"],"#1a7f37",["KDPA"],"#b3261e",""]"""))
        // Before any METAR, no pip.
        val bare = layer(style(), "airports").getValue("layout").jsonObject.getValue("icon-image").toString()
        assertTrue(bare, bare.contains(""""|","","|""""))
    }

    @Test
    fun aCategoryIsItsWebColourAndNoneIsNoPip() {
        assertEquals("#1a7f37", MapStyle.pipOf("VFR"))
        assertEquals("#1f6feb", MapStyle.pipOf("MVFR"))
        assertEquals("#b3261e", MapStyle.pipOf("IFR"))
        assertEquals("#a371f7", MapStyle.pipOf("LIFR"))
        assertEquals("", MapStyle.pipOf(null))
        assertEquals(5, MapStyle.PIPS.size)
    }

    @Test
    fun theSwitchesHideTheirLayersAndFilterTheFields() {
        val off = style(MapLayers(airspace = false, navaids = false, privateFields = true, military = true))
        for (id in MapStyle.AIRSPACE_LAYERS + MapStyle.NAVAID_LAYERS) assertEquals(id, "none", visibility(off, id))
        assertNull(visibility(off, "vfr-waypoints"))
        assertEquals("""["all"]""", layer(off, "airports")["filter"].toString())
        val on = style()
        for (id in MapStyle.AIRSPACE_LAYERS + MapStyle.NAVAID_LAYERS) assertNull(id, visibility(on, id))
        assertEquals(
            """["all",["!=",["get","military"],"military"],["!=",["get","use"],"private"]]""",
            MapStyle.airportsFilter(MapLayers()).toString(),
        )
        assertEquals("""["all",["!=",["get","use"],"private"]]""", MapStyle.airportsFilter(MapLayers(military = true)).toString())
    }

    @Test
    fun theTerminalAreaChartIsTheSheetOverTheBase() {
        val info = ChartInfo(
            chartCycle = "2025-10-30", chartRevision = 3, chartTilesBase = null, maxZoom = 13, minZoom = 5,
            chartLayers = listOf(
                ChartLayer(base = true, kind = "sec", label = "Sectional", maxZoom = 12, minZoom = 5, scales = listOf(1, 2)),
                ChartLayer(base = false, kind = "tac", label = "Terminal", maxZoom = 13, minZoom = 9, over = listOf("sec"), scales = listOf(1, 2)),
                ChartLayer(base = false, kind = "ifr_area", label = "IFR area", maxZoom = 12, minZoom = 8, over = listOf("ifr_low")),
            ),
        )
        val terminal = Charts.terminal(info, density = 3f)!!
        assertEquals("tac", terminal.template.kind)
        assertEquals(2, terminal.template.scale)
        assertEquals(9, terminal.minZoom)
        assertEquals(13, terminal.maxZoom)
        assertNull(Charts.terminal(info.copy(chartLayers = info.chartLayers.take(1))))
    }

    @Test
    fun aTappedRingIsItsVolume() {
        val v = MapPick.airspace(
            mapOf(
                "class" to "B", "name" to "CHICAGO CLASS B", "ident" to "ORD", "number" to 42L,
                "floor_ft" to 3000.0, "ceiling_ft" to 10000.0, "ceiling_excluded" to false, "hours_code" to "H24",
            ),
        )
        assertEquals("tile-42", v.id)
        assertEquals("B", v.airspaceClass)
        assertEquals("ORD", v.ident)
        assertFalse(v.floorSfc)
        assertEquals(10000.0, v.ceilingFt!!, 0.0)
        val d = MapPick.airspace(mapOf("class" to "D", "ceiling_ft" to 2500L, "ceiling_excluded" to "true"))
        assertTrue(d.floorSfc)
        assertTrue(d.ceilingExcluded)
        assertEquals("tile-D---0", d.id)
    }

    @Test
    fun aTappedVorIsItsCard() {
        val vor = MapPick.vor(
            mapOf(
                "ident" to "OBK", "name" to "NORTHBROOK", "kind" to "VOR/DME", "freq" to "113", "mag_var" to -2L,
                "service_volume" to "H", "restricted" to true, "remarks" to "UNUSABLE 010-030\nDME UNUSABLE BLO 3000",
            ),
            42.2, -87.9,
        )
        assertEquals("OBK", vor.ident)
        assertEquals(-2.0, vor.magVar!!, 0.0)
        assertEquals(listOf("UNUSABLE 010-030", "DME UNUSABLE BLO 3000"), vor.remarks)
        assertTrue(vor.restricted)
        assertNull(vor.elevationFt)
    }

    @Test
    fun aCardsFiguresAreWrittenAsAChartWritesThem() {
        assertEquals("360", threeFigures(0.2))
        assertEquals("045", threeFigures(45.0))
        assertEquals("2° W", declinationOf(-2.0))
        assertEquals("3.5° E", declinationOf(3.5))
        assertEquals("41°52.3′ N 87°37.8′ W", degreesMinutes(41.8717, -87.63))
        assertEquals("Continuous", airspaceHours("H24", null))
        assertEquals("By NOTAM", airspaceHours("NOTAM", "Legal description references NOTAM."))
        assertNull(airspaceHours(null, null))
    }

    private fun plane(hex: String, track: Double?, speed: Double?, callsign: String? = null) =
        TrafficAircraft(hex = hex, lat = 41.0, lon = -88.0, trackDeg = track, speedKt = speed, callsign = callsign)

    @Test
    fun anAirplaneIsCarriedOnAlongItsTrack() {
        // 120 kt for 30 s due east: a mile on.
        val (lat, lon) = TrafficDrawing.carriedOn(plane("a", 90.0, 120.0), 30.0)
        assertEquals(41.0, lat, 1e-3)
        assertEquals(1.0, Geo.nm(41.0, -88.0, lat, lon), 1e-6)
        assertEquals(41.0 to -88.0, TrafficDrawing.carriedOn(plane("b", null, 120.0), 30.0))
    }

    @Test
    fun theTrafficIsDrawnByItsMarkAndAStaleOneIsLeftOff() {
        val now = 1_000_000L
        val targets = listOf(
            TrafficDrawing.Target(plane("a1", 92.0, 100.0, "N123AB"), TrafficMarksAnswerElement("+05", true), now - 2_000),
            TrafficDrawing.Target(plane("b2", null, null), TrafficMarksAnswerElement("", false), now - 1_000),
            TrafficDrawing.Target(plane("c3", 0.0, 100.0), null, now - 31_000),
        )
        val (points, trends) = TrafficDrawing.features(targets, tracked = "A1", nowMs = now)
        val features = points["features"]!!.jsonArray
        assertEquals(2, features.size)
        val a = features[0].jsonObject["properties"]!!.jsonObject
        assertEquals("traffic|near", a["icon"]!!.jsonPrimitive.content)
        assertEquals("90", a["rotate"]!!.jsonPrimitive.content)
        assertEquals("+05\nN123AB", a["both"]!!.jsonPrimitive.content)
        assertEquals("true", a["tracked"]!!.jsonPrimitive.content)
        val b = features[1].jsonObject["properties"]!!.jsonObject
        assertEquals("traffic|far|dot", b["icon"]!!.jsonPrimitive.content)
        assertEquals("", b["both"]!!.jsonPrimitive.content)
        // Only the one with a track and a speed has a trend line.
        assertEquals(1, trends["features"]!!.jsonArray.size)
    }

    @Test
    fun theTrafficsTextIsAZoomStepAtTheTop() {
        // MapLibre takes a zoom expression only as a top-level step's input.
        assertEquals("step", MapStyle.TRAFFIC_TEXT[0].jsonPrimitive.content)
        assertEquals("step", MapStyle.TRAFFIC_TAG_IMAGE[0].jsonPrimitive.content)
        assertEquals(MapStyle.glZoom(9.0).toString(), MapStyle.TRAFFIC_TEXT[3].jsonPrimitive.content)
    }

    @Test
    fun theWeathersBoxIsAskedOnlyAsTheViewLeavesIt() {
        val view = MapRest(41.6, -88.2, 42.1, -87.5, 8.0)
        val box = MapWeather.Box.about(view)
        assertEquals(41.0, box.south, 0.0)
        assertEquals(-89.0, box.west, 0.0)
        assertEquals(43.0, box.north, 0.0)
        assertEquals(-86.5, box.east, 0.0)
        assertTrue(box.holds(view.copy(south = 41.5, north = 42.0)))
        assertFalse(box.holds(view.copy(east = -86.0)))
    }

    @Test
    fun theWeatherHeardIsKeptAndANewReportWins() {
        val was = mapOf("KORD" to "#1a7f37", "KMDW" to "#1f6feb")
        val now = mapOf("KMDW" to "#b3261e", "KORD" to "")
        assertEquals(mapOf("KMDW" to "#b3261e"), MapWeather.merged(was, now))
    }
}
