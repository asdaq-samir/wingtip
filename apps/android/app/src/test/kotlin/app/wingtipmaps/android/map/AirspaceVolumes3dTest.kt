package app.wingtipmaps.android.map

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The volumes stood up from the planner's whole polygons, at heights
 *  from sea level, as the web's airspaceHeights with no ground in. */
class AirspaceVolumes3dTest {
    @Test
    fun anMslVolumeStandsBetweenItsFigures() {
        val (floor, top) = AirspaceVolumes3d.span(3000.0, "MSL", 10000.0, "MSL")!!
        assertEquals(914.4, floor, 1e-6)
        assertEquals(3048.0, top, 1e-6)
    }

    @Test
    fun noTopIsDrawnToClassAsFloor() {
        // 14 CFR 71.33: Class A from 18,000 ft MSL.
        assertEquals(18_000 * 0.3048, AirspaceVolumes3d.span(null, "SFC", null, "MSL")!!.second, 1e-6)
        assertEquals(18_000 * 0.3048, AirspaceVolumes3d.span(0.0, "SFC", 45_000.0, "STD")!!.second, 1e-6)
    }

    @Test
    fun aHeightAboveTheGroundWaitsForGround() {
        // Brady Low MOA's 500 ft AGL floor, coded SFC with 500.
        assertNull(AirspaceVolumes3d.span(500.0, "SFC", 18_000.0, "MSL"))
        assertNull(AirspaceVolumes3d.span(0.0, "SFC", 1500.0, "AGL"))
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
        fun kinds(zoom: Double) = Json.parseToJsonElement(AirspaceVolumes3d.geoJson(features, zoom)).jsonObject["features"]!!.jsonArray
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
