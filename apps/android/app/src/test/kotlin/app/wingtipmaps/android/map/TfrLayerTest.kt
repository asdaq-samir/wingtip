package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.generated.Tfr
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    private fun active(tfr: Tfr, nowMs: Long, ask: (Double, Double?, Double?) -> Result<String>) =
        Json.parseToJsonElement(TfrLayer.features(listOf(tfr), nowMs, ask)).jsonObject["features"]!!.jsonArray.single()
            .jsonObject["properties"]!!.jsonObject["active"]!!.jsonPrimitive.boolean

    /** Where the engine cannot say, a TFR is drawn in force, the safe side (14 CFR 91.103). */
    @Test
    fun aTfrTheEngineCannotTimeIsDrawnInForce() {
        val tfr = Tfr(effective = "2099-01-01T00:00:00Z", geometry = area, notamId = "6/1")
        assertTrue(active(tfr, 0L) { _, _, _ -> Result.failure(IllegalStateException("no engine")) })
    }

    /** The engine's gonogo_tfr_when is asked in microseconds, the TFR's own times read from ISO 8601, and its
     *  word is what is drawn: "in-force" solid, anything else (later, ended) dashed. The engine does not load
     *  on the JVM, so its answer is given here; its own tests pin the answer. */
    @Test
    fun theEnginesWordOnTheTimesIsWhatIsDrawn() {
        val tfr = Tfr(effective = "2026-11-27T12:00:00Z", expires = "2026-11-27T14:00:00Z", geometry = area, notamId = "6/2")
        val now = 1_795_694_400_000L // 2026-11-26T12:00:00Z, a day before it starts
        var asked: Triple<Double, Double?, Double?>? = null
        assertFalse(active(tfr, now) { at, from, to -> Result.success("later").also { asked = Triple(at, from, to) } })
        assertEquals(Triple(now * 1000.0, (now + 86_400_000L) * 1000.0, (now + 93_600_000L) * 1000.0), asked)
        assertTrue(active(tfr, now) { _, _, _ -> Result.success("in-force") })
    }
}
