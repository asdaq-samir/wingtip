package app.wingtipmaps.android.map

import app.wingtipmaps.android.emergency.EmergencyModel
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The emergency assistant's line on the map: drawn from own ship to the
 *  field picked, longitude first, and nothing without both ends. */
class EmergencyLineTest {
    private val fix = OwnShip.Fix(42.5, -88.3, 4500.0, 270.0, 100.0, 5.0, atMs = 0)
    private val field = EngineContract.BestField(
        ident = "KJVL", name = "Southern Wisconsin Regional", lat = 42.62, lon = -89.04, distanceNm = 6.0, courseDeg = 280.0,
        reach = "within", towered = true, private = false, military = null, reasons = emptyList(),
    )

    @Test
    fun theLineRunsFromTheAirplaneToTheFieldPicked() {
        val line = EmergencyLine.of(EmergencyModel.State(fix = fix, picked = field))!!
        assertEquals(EmergencyLine(42.5, -88.3, 42.62, -89.04), line)
        val features = Json.parseToJsonElement(EmergencyLayer.geoJson(line)).jsonObject["features"]!!.jsonArray
        assertEquals(listOf("to", "field"), features.map { it.jsonObject["properties"]!!.jsonObject["kind"]!!.jsonPrimitive.content })
        val start = features[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray[0].jsonArray
        assertEquals(-88.3, start[0].jsonPrimitive.content.toDouble(), 0.0)
    }

    @Test
    fun noLineWithoutBothEnds() {
        assertNull(EmergencyLine.of(EmergencyModel.State(fix = null, picked = field)))
        assertNull(EmergencyLine.of(EmergencyModel.State(fix = fix, picked = null)))
        assertEquals(0, Json.parseToJsonElement(EmergencyLayer.geoJson(null)).jsonObject["features"]!!.jsonArray.size)
    }
}
