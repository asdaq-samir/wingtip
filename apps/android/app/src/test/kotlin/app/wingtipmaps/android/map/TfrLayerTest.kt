package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.generated.Tfr
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** The TFRs as the map draws them (TfrLayer): in force or later, each its
 *  NOTAM number and its areas as the planner gave them. */
class TfrLayerTest {
    private val area = Json.parseToJsonElement("""{"type":"MultiPolygon","coordinates":[[[[-97,47],[-96,47],[-96,48],[-97,47]]]]}""") as JsonObject
    private fun tfr(effective: String?, expires: String?) = Tfr(geometry = area, notamId = "6/4116", effective = effective, expires = expires)
    private val now = Instant.parse("2026-11-14T12:00:00Z").toEpochMilli()

    @Test
    fun oneInItsWindowOrWithNoTimesIsInForce() {
        assertTrue(TfrLayer.inForce(tfr("2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z"), now))
        assertTrue(TfrLayer.inForce(tfr(null, null), now))
        assertFalse(TfrLayer.inForce(tfr("2026-11-15T00:00:00Z", null), now))
        assertFalse(TfrLayer.inForce(tfr(null, "2026-11-13T00:00:00Z"), now))
    }

    @Test
    fun eachIsAFeatureWithItsNumberWhetherInForceAndItsAreas() {
        val json = Json.parseToJsonElement(TfrLayer.geoJson(listOf(tfr("2026-11-15T00:00:00Z", null)), now)).jsonObject
        val feature = json["features"]!!.jsonArray.single().jsonObject
        val properties = feature["properties"]!!.jsonObject
        assertEquals("6/4116", properties["id"]!!.jsonPrimitive.content)
        assertFalse(properties["active"]!!.jsonPrimitive.boolean)
        assertEquals(area, feature["geometry"])
    }
}
