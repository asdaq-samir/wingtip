package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.api.generated.WeatherArea
import app.wingtipmaps.android.design.generated.WingtipColors
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** The G-AIRMETs' outlines as one source: each its hazard's colour, its
 *  words' night ink (map.label.night-ink) and AWC's short label. */
class AirmetLayerTest {
    @Test
    fun eachOutlineCarriesItsDayAndNightInks() {
        val area = WeatherArea(coords = listOf(listOf(42.0, -88.0), listOf(43.0, -88.0), listOf(43.0, -87.0)), hazard = "ICE", id = "g1", kind = "gairmet")
        val feature = Json.parseToJsonElement(AirmetLayer.geoJson(listOf(area), mapOf("ICE" to "ICE"))).jsonObject["features"]!!.jsonArray.single().jsonObject
        val props = feature["properties"]!!.jsonObject
        assertEquals(WingtipColors.Weather.ICING_HEX, props["colour"]!!.jsonPrimitive.content)
        assertEquals("#8fb4ff", props["night"]!!.jsonPrimitive.content)
        assertEquals("ICE", props["label"]!!.jsonPrimitive.content)
        // Closed back at its first point, longitude first.
        assertEquals(4, feature["geometry"]!!.jsonObject["coordinates"]!!.jsonArray.size)
    }

    @Test
    fun turbulenceTakesItsTextInksNightOneAndAnUnknownColourKeepsItsOwn() {
        assertEquals("#fbbf24", AirmetLayer.nightInk(WingtipColors.Weather.TURBULENCE_HEX))
        assertEquals("#123456", AirmetLayer.nightInk("#123456"))
    }
}
