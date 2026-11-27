package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipMapLabel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** The map's words as the web letters them: Larger Map Labels scales each
 *  size's outputs, never the zoom; after dark a light-haloed word takes its
 *  night ink on the dark halo, and a colour not in the table keeps its own. */
class MapLabelsTest {
    private fun layer(size: String, color: String, halo: String) = Json.parseToJsonElement(
        """{"id":"x","type":"symbol","layout":{"text-size":$size},"paint":{"text-color":$color,"text-halo-color":"$halo"}}""",
    ).jsonObject

    @Test
    fun theSizesOutputsAreScaledNotTheirZooms() {
        val out = MapLabels.layer(layer("""["interpolate",["linear"],["zoom"],6,10,10,12]""", "\"#2465b8\"", "#ffffff"), 1.2f, night = false)
        assertEquals(
            """["interpolate",["linear"],["zoom"],6,["*",10,1.2],10,["*",12,1.2]]""",
            out["layout"]!!.jsonObject["text-size"].toString(),
        )
        assertEquals(13.2, MapLabels.layer(layer("11", "\"#2465b8\"", "#ffffff"), 1.2f, false)["layout"]!!.jsonObject["text-size"]!!.jsonPrimitive.content.toDouble(), 1e-4)
    }

    @Test
    fun afterDarkALightHaloedWordTakesItsNightInk() {
        val paint = MapLabels.layer(layer("11", "\"#2465b8\"", "#ffffff"), 1f, night = true)["paint"]!!.jsonObject
        assertEquals("#82b4ff", paint["text-color"]!!.jsonPrimitive.content)
        // The tag's dark (#14181f) at map.label.halo-night's strength, whole since round 6.
        assertEquals(String.format(java.util.Locale.US, "rgba(20, 24, 31, %.2f)", WingtipMapLabel.HALO_NIGHT), paint["text-halo-color"]!!.jsonPrimitive.content)
        // A dark-haloed word is left as it is.
        val dark = MapLabels.layer(layer("11", "\"#ffffff\"", "#14181f"), 1f, night = true)["paint"]!!.jsonObject
        assertEquals("#ffffff", dark["text-color"]!!.jsonPrimitive.content)
        // An expression is matched on what it gives.
        val matched = MapLabels.nightInk(Json.parseToJsonElement("""["case",true,"#2465b8","#c0309f"]"""))
        assertEquals("match", matched.jsonArray[0].jsonPrimitive.content)
    }

    /** The switch's scale is the font scale capped at 1.2, and the layers
     *  added after the style (the station model, AIRMET names, 3D tabs,
     *  plate tags) take the style's own. */
    @Test
    fun theLateLayersTakeTheStylesScale() {
        assertEquals(1f, MapLabels.capped(on = false, fontScale = 1.5f), 0f)
        assertEquals(1.2f, MapLabels.capped(on = true, fontScale = 1.5f), 1e-6f)
        assertEquals(1f, MapLabels.capped(on = true, fontScale = 0.85f), 0f)
        val was = MapLabels.late
        try {
            MapLabels.late = 1.2f
            assertEquals(13.2f, MapLabels.lateSize(11f), 1e-4f)
        } finally {
            MapLabels.late = was
        }
    }
}
