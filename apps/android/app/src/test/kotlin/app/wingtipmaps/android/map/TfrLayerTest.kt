package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.generated.Tfr
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The TFRs' one source as the web's TfrGl writes it: each its NOTAM number and areas, and whether it is in force. */
class TfrLayerTest {
    private val area = Json.parseToJsonElement("""{"type":"MultiPolygon","coordinates":[[[[-88,42],[-87,42],[-87,43],[-88,42]]]]}""").jsonObject

    @Test
    fun eachTfrIsAFeatureWithItsNumberAndItsAreas() {
        val out = Json.parseToJsonElement(TfrLayer.features(listOf(Tfr(geometry = area, notamId = "6/1234")), 0L)).jsonObject
        val feature = out["features"]!!.jsonArray.single().jsonObject
        assertEquals("6/1234", feature["properties"]!!.jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(area, feature["geometry"])
    }

    /** The engine does not load on the JVM: where it cannot say, a TFR is drawn in force, the safe side (14 CFR 91.103). */
    @Test
    fun aTfrTheEngineCannotTimeIsDrawnInForce() {
        val tfr = Tfr(effective = "2099-01-01T00:00:00Z", geometry = area, notamId = "6/1")
        val feature = Json.parseToJsonElement(TfrLayer.features(listOf(tfr), 0L)).jsonObject["features"]!!.jsonArray.single().jsonObject
        assertTrue(feature["properties"]!!.jsonObject["active"]!!.jsonPrimitive.boolean)
    }
}
