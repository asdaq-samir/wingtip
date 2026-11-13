package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.emergency.EngineEmergency
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.navlogLeg
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.abs

/**
 * What must never break in the air, on Android: every worked example of
 * the shared golden set (apps/web/src/lib/fixtures/flightCritical.json,
 * this test APK's assets by build.gradle.kts; each from its FAA source:
 * the nav log's wind triangle, groundspeed, heading and fuel from
 * FAA-H-8083-25C ch. 16, 14 CFR 91.159 and 91.179 altitudes, 91.151 and
 * 91.167 reserves, 91.155 minimums, AIM 5-3-8 hold entries, glide at a
 * ratio) asked through the generated bindings over the engine's call, as the engine's Rust test
 * (flight_critical.rs) asks it in process; the nav log's case through the
 * typed call the screens decode; and the emergency's general guidance with
 * no airplane, from the real engine. The iPhone's FlightCriticalTests is
 * the twin.
 */
@RunWith(AndroidJUnit4::class)
class FlightCriticalEngineTest {
    private val cases: List<JsonObject> by lazy {
        Json.parseToJsonElement(
            InstrumentationRegistry.getInstrumentation().context.assets.open("flightCritical.json").bufferedReader().use { it.readText() },
        ).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }
    }

    /** Where [got] is not [want], as the Rust test judges it: a number
     *  within its case's tolerance (by member name, "" for a bare answer;
     *  exact where not given), an object by the members [want] names, the
     *  rest as JSON. */
    private fun difference(got: JsonElement?, want: JsonElement?, within: JsonObject, key: String = ""): String? {
        val g = got ?: JsonNull
        val w = want ?: JsonNull
        return when {
            g is JsonNull || w is JsonNull -> if (g is JsonNull && w is JsonNull) null else "$key: $g is not $w"
            g is JsonObject && w is JsonObject -> w.keys.sorted().firstNotNullOfOrNull { k ->
                if (k !in g) "$k: missing" else difference(g[k], w[k], within, k)?.let { if (key.isEmpty()) it else "$key.$it" }
            }
            g is JsonArray && w is JsonArray ->
                if (g.size != w.size) "$key: ${g.size} items, not ${w.size}"
                else g.indices.firstNotNullOfOrNull { difference(g[it], w[it], within, key) }
            g is JsonPrimitive && w is JsonPrimitive && !g.isString && !w.isString && g.booleanOrNull == null && w.booleanOrNull == null -> {
                val tolerance = within[key]?.jsonPrimitive?.doubleOrNull ?: 0.0
                val a = g.doubleOrNull
                val b = w.doubleOrNull
                if (a != null && b != null && abs(a - b) <= tolerance + 1e-9) null else "$key: $g is not $w (within $tolerance)"
            }
            else -> if (g == w) null else "$key: $g is not $w"
        }
    }

    @Test
    fun everyWorkedExampleHoldsThroughTheBridge() {
        assertTrue("the golden set lost cases: ${cases.size}", cases.size >= 30)
        val misses = cases.mapNotNull { c ->
            val name = c.getValue("name").jsonPrimitive.content
            val rule = c.getValue("rule").jsonPrimitive.content
            assertTrue("$name: no source", c["source"]?.jsonPrimitive?.content.orEmpty().isNotEmpty())
            val got = Json.parseToJsonElement(Engine.callNative(rule, c.getValue("input").toString()))
            difference(got, c["want"], c["within"]?.jsonObject ?: JsonObject(emptyMap()))?.let { "$name ($rule): $it" }
        }
        assertTrue(misses.joinToString("\n"), misses.isEmpty())
    }

    /** The handbook's leg through the typed call the screens read:
     *  FAA-H-8083-25C ch. 16, TC 090, wind 045 at 40 kt, TAS 120 kt: TH
     *  076, GS 88 kt; 220 NM in 2:30 and about 20 gallons at 8 gal/hr;
     *  5 degrees east variation, east is least: MH 071. */
    @Test
    fun theNavLogsFiguresAreTheEnginesForTheHandbooksLeg() {
        val c = cases.first { it.getValue("rule").jsonPrimitive.content == "navlog_leg" }
        val input = Engine.json.decodeFromJsonElement(EngineContract.NavlogLegInput.serializer(), c.getValue("input"))
        val leg = Engine.navlogLeg(input.start, input.end, input.altitudeFt, input.profile, input.wind, input.oatC, input.variationDeg).getOrThrow()
        assertEquals(90.0, leg.trueCourseDeg!!, 0.01)
        assertEquals(76.0, leg.trueHeadingDeg!!, 1.0)
        assertEquals(71.0, leg.magneticHeadingDeg!!, 1.0)
        assertEquals(88.0, leg.groundspeedKt!!, 1.0)
        assertEquals(150.0, leg.eteMin!!, 2.0)
        assertEquals(20.0, leg.fuelGal!!, 0.5)
    }

    @Test
    fun withNoAirplaneTheEmergencyHasGeneralGuidanceAndNoAirplanesFigures() {
        val guidance = EngineEmergency.guidance()
        assertTrue(guidance.isNotEmpty() && guidance.all { it.source.isNotEmpty() })
        // AIM 6-2-2: squawk 7700; AIM 6-3-1, 6-3-2: MAYDAY, 121.5.
        assertTrue(guidance.any { "7700" in it.title && "6-2-2" in it.source })
        assertTrue(guidance.any { "121.5" in it.title })
        // No speed, glide or distance of any airplane's.
        assertFalse(guidance.any { "KIAS" in "${it.title} ${it.detail}" || " nm" in "${it.title} ${it.detail}" })
    }
}
