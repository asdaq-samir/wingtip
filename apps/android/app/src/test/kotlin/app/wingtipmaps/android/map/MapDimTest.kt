package app.wingtipmaps.android.map

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** What is drawn on the chart at the chart's own light at night (the
 *  web's mapDim.test.ts; AIM 8-1-6): the dim's figure and how each kind
 *  of opacity takes it. */
class MapDimTest {
    private val dim = """["coalesce",["global-state","mapDim"],1]"""

    @Test
    fun theDimIsTheChartsBrightnessAtNightAndOneByDay() {
        assertEquals(0.5f, MapDim.of(night = true, chartBrightness = 0.5f))
        assertEquals(1f, MapDim.of(night = false, chartBrightness = 0.3f))
        assertEquals(0f, MapDim.of(night = true, chartBrightness = -0.2f))
    }

    @Test
    fun aPlainOrMissingOpacityIsMultipliedWhole() {
        assertEquals("""["*",$dim,0.6]""", MapDim.dimmedOpacity(JsonPrimitive(0.6)).toString())
        assertEquals("""["*",$dim,1]""", MapDim.dimmedOpacity(null).toString())
    }

    @Test
    fun aZoomCurveTakesTheDimInEachStopsOutput() {
        val curve = Json.parseToJsonElement("""["interpolate",["linear"],["zoom"],5,0.2,9,1]""")
        assertEquals("""["interpolate",["linear"],["zoom"],5,["*",$dim,0.2],9,["*",$dim,1]]""", MapDim.dimmedOpacity(curve).toString())
        val step = Json.parseToJsonElement("""["step",["zoom"],0,8,1]""")
        assertEquals("""["step",["zoom"],["*",$dim,0],8,["*",$dim,1]]""", MapDim.dimmedOpacity(step).toString())
    }

    @Test
    fun linesCirclesAndSymbolsAreDimmedAndRastersAndFillsAreNot() {
        val style = """{"layers":[{"id":"a","type":"symbol"},{"id":"b","type":"raster"},{"id":"c","type":"fill","paint":{"fill-opacity":0.9}},{"id":"d","type":"circle","paint":{"circle-opacity":0.5}}]}"""
        val layers = MapDim.style(Json.parseToJsonElement(style).jsonObject)["layers"]!!.jsonArray.map { it.jsonObject }
        assertEquals(setOf("icon-opacity", "text-opacity"), layers[0]["paint"]!!.jsonObject.keys)
        assertEquals(null, layers[1]["paint"])
        assertEquals("0.9", layers[2]["paint"]!!.jsonObject["fill-opacity"].toString())
        assertEquals("""["*",$dim,0.5]""", layers[3]["paint"]!!.jsonObject["circle-opacity"].toString())
        assertEquals("""["*",$dim,1]""", layers[3]["paint"]!!.jsonObject["circle-stroke-opacity"].toString())
    }

    @Test
    fun aColourDimmedByItsColourGoesToBlackWithTheDimItsAlphaKept() {
        // The web's DIM_BY_COLOUR: black at no light, itself at the day's.
        val parts = MapDim.colour(0x80E600E6.toInt()).toArray()
        assertEquals("interpolate", parts[0])
        assertTrue(java.util.Arrays.deepToString(parts[2] as Array<*>).contains("global-state, mapDim"))
        fun rgba(at: Int) = (parts[at] as Array<*>).drop(1).map { (it as Number).toDouble() }
        assertEquals(0.0, (parts[3] as Number).toDouble(), 0.0)
        assertEquals(listOf(0.0, 0.0, 0.0), rgba(4).take(3))
        assertEquals(1.0, (parts[5] as Number).toDouble(), 0.0)
        assertEquals(listOf(230.0, 0.0, 230.0), rgba(6).take(3))
        assertEquals(rgba(6)[3], rgba(4)[3], 1e-6)
    }
}
