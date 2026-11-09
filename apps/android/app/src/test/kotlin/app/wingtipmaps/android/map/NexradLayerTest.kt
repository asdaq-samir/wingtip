package app.wingtipmaps.android.map

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** FIS-B's NEXRAD on the map: each of the engine's rectangles a closed
 *  polygon with its level, longitude first, and nothing with none. */
class NexradLayerTest {
    @Test
    fun eachRectangleIsAPolygonOfItsLevel() {
        val answer = EngineContract.ReceiverNexradAnswer(
            levels = listOf(
                EngineContract.ReceiverNexradLevel(level = 3.0, rects = listOf(listOf(41.8667, -87.92, 41.8833, -87.87))),
                EngineContract.ReceiverNexradLevel(level = 5.0, rects = listOf(listOf(41.8667, -87.87, 41.8833, -87.82))),
                EngineContract.ReceiverNexradLevel(level = 7.0, rects = emptyList()),
            ),
            time = "1452Z",
            at = 1762700001.0,
        )
        val features = Json.parseToJsonElement(NexradLayer.geoJson(answer)).jsonObject["features"]!!.jsonArray
        assertEquals(listOf(3, 5), features.map { it.jsonObject["properties"]!!.jsonObject["level"]!!.jsonPrimitive.int })
        val ring = features[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray[0].jsonArray
        assertEquals(5, ring.size)
        assertEquals(ring.first(), ring.last())
        // South-west corner first, longitude first.
        assertEquals(-87.92, ring[0].jsonArray[0].jsonPrimitive.content.toDouble(), 0.0)
        assertEquals(41.8667, ring[0].jsonArray[1].jsonPrimitive.content.toDouble(), 0.0)
        assertEquals(0, Json.parseToJsonElement(NexradLayer.geoJson(null)).jsonObject["features"]!!.jsonArray.size)
    }
}
