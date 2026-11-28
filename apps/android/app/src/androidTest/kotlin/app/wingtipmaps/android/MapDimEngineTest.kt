package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.map.MapDim
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The words' light at night through this app's own bridge, the engine's
 * map_dim_words, which a JVM unit test cannot load (MapDimTest keeps the
 * rest): every case of the shared mapDim.json's "words", the engine's own
 * (engine/facade/tests/map_dim.rs), 0.77 at a half-bright chart among them.
 */
@RunWith(AndroidJUnit4::class)
class MapDimEngineTest {
    private val words by lazy {
        val text = InstrumentationRegistry.getInstrumentation().context.assets.open("mapDim.json").bufferedReader().use { it.readText() }
        Json.parseToJsonElement(text).jsonObject.getValue("words").jsonObject.getValue("cases").jsonArray.map { it.jsonObject }
    }

    @Test
    fun theWordsLightIsTheEngines() {
        for (c in words) {
            fun num(key: String) = c.getValue(key).jsonPrimitive.double
            assertEquals(c.toString(), num("share"), MapDim.wordLight(c.getValue("night").jsonPrimitive.boolean, num("brightness"), num("contrast")), 1e-9)
        }
    }
}
