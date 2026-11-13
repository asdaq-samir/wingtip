package app.wingtipmaps.android.map

import app.wingtipmaps.android.engine.EngineException
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Units
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** The volumes stood up from the planner's whole polygons, at the
 *  heights the engine gives (`airspace_volume_span`), asked with no
 *  ground. The engine does not load on the JVM: the span here answers
 *  from the shared fixture (apps/web/src/lib/fixtures/airspaceVolumeSpan.json)
 *  and EngineFixturesTest runs the engine itself on it. */
class AirspaceVolumes3dTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun feature(properties: String) =
        """{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]},"properties":$properties}"""

    @Test
    fun aVolumeIsAskedByItsLimitsAndStoodAtTheEnginesHeights() {
        // Brady North MOA as the planner sends it: 3,600 MSL to FL180 TNI.
        val features = Json.parseToJsonElement(
            "[" + feature("""{"layer":"special_use","type":"MOA","floor_ft":3600,"floor_ref":"MSL","ceiling_ft":18000,"ceiling_ref":"STD","ceiling_desc":"TNI"}""") + "]",
        ).jsonArray
        val fixture = Json.parseToJsonElement(
            checkNotNull(javaClass.classLoader!!.getResource("airspaceVolumeSpan.json")).readText(),
        ).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }.first { "Brady North" in it.getValue("about").jsonPrimitive.content }
        val want = json.decodeFromJsonElement<EngineContract.AirspaceVolumeSpanInput>(fixture.getValue("input"))
        val answer = json.decodeFromJsonElement<EngineContract.AirspaceVolumeSpanAnswer?>(fixture.getValue("answer"))!!
        var asked: EngineContract.AirspaceVolumeSpanInput? = null
        val out = AirspaceVolumes3d.geoJson(features, 10.0) { asked = it; Result.success(answer) }
        assertEquals(want, asked)
        val p = Json.parseToJsonElement(out).jsonObject["features"]!!.jsonArray[0].jsonObject["properties"]!!.jsonObject
        assertEquals(3600 * Units.M_PER_FT, p["base_m"]!!.jsonPrimitive.double, 1e-6)
        assertEquals(17_999 * Units.M_PER_FT, p["height_m"]!!.jsonPrimitive.double, 1e-6)
    }

    @Test
    fun theNasrCeilingIsMslAndNoGroundIsGiven() {
        val p = Json.parseToJsonElement("""{"layer":"airspace","class":"D","floor_ft":0,"floor_ref":"SFC","ceiling_ft":2500}""").jsonObject
        assertEquals(
            EngineContract.AirspaceVolumeSpanInput(
                floor = EngineContract.SpecialUseTabLimit(0.0, "SFC", null),
                ceiling = EngineContract.SpecialUseTabLimit(2500.0, "MSL", null),
                ground = null,
            ),
            AirspaceVolumes3d.spanInput(p),
        )
    }

    @Test
    fun nothingToDrawOrAFailedRuleLeavesTheVolumeOut() {
        val features = Json.parseToJsonElement("[" + feature("""{"layer":"airspace","class":"B","floor_ft":500,"floor_ref":"AGL","ceiling_ft":10000}""") + "]").jsonArray
        fun count(span: Result<EngineContract.AirspaceVolumeSpanAnswer?>) =
            Json.parseToJsonElement(AirspaceVolumes3d.geoJson(features, 10.0) { span }).jsonObject["features"]!!.jsonArray.size
        assertEquals(0, count(Result.success(null)))
        assertEquals(0, count(Result.failure(EngineException("airspace_volume_span: no answer"))))
    }

    @Test
    fun eachKindFromItsZoom() {
        val features = Json.parseToJsonElement(
            """[
              {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]},"properties":{"layer":"airspace","class":"B","floor_ft":0,"floor_ref":"SFC","ceiling_ft":10000}},
              {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]},"properties":{"layer":"airspace","class":"D","floor_ft":0,"floor_ref":"SFC","ceiling_ft":2500}},
              {"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]},"properties":{"layer":"special_use","type":"R","name":"R-4207","floor_ft":0,"floor_ref":"SFC","ceiling_ft":18000,"ceiling_ref":"MSL"}}
            ]""",
        ).jsonArray
        fun kinds(zoom: Double) = Json.parseToJsonElement(AirspaceVolumes3d.geoJson(features, zoom) { Result.success(EngineContract.AirspaceVolumeSpanAnswer(0.0, 1000.0, true)) }).jsonObject["features"]!!.jsonArray
            .map { it.jsonObject["properties"]!!.jsonObject["kind"]!!.jsonPrimitive.content }
        assertEquals(listOf("B", "restricted"), kinds(8.0))
        assertEquals(listOf("B", "D", "restricted"), kinds(10.0))
        assertEquals(emptyList<String>(), kinds(6.0))
    }

    @Test
    fun theBoxIsTheViewOutToHalfDegrees() {
        val box = AirspaceVolumes3d.boxOf(MapRest(south = 40.2, west = -105.3, north = 40.9, east = -104.6, zoom = 8.0))
        assertEquals(AirspaceVolumes3d.Box(40.0, -105.5, 41.0, -104.5), box)
        assertEquals(listOf("B"), AirspaceVolumes3d.classesAt(8.0))
        assertEquals(listOf("B", "C", "D", "E"), AirspaceVolumes3d.classesAt(10.0))
    }
}
