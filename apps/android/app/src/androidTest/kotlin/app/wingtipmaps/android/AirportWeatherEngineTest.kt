package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.windArrow
import app.wingtipmaps.android.engine.generated.windBarb
import app.wingtipmaps.android.map.StationMarks
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The airport weather marks' rules through this app's own bridge (the
 * generated UniFFI Kotlin over the engine's call), held to the shared fixtures the engine's Rust tests
 * and the web's hold them to (apps/web/src/lib/fixtures/
 * airportWeatherMarks.json, this test APK's assets): the arrow shown and
 * red (`wind_arrow`), the barb (`wind_barb`), and the ↓ at a plan's field
 * (`weather_worse`, asked as StationMarks asks it).
 */
@RunWith(AndroidJUnit4::class)
class AirportWeatherEngineTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val fixtures: JsonObject = InstrumentationRegistry.getInstrumentation().context.assets
        .open("airportWeatherMarks.json").bufferedReader().use { Json.parseToJsonElement(it.readText()).jsonObject }

    private fun cases(name: String) = fixtures.getValue(name).jsonArray.map { it.jsonObject }

    private fun JsonObject.num(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull

    @Test
    fun theArrowIsShownAndRedAsTheFixturesSay() {
        for (case in cases("windArrow")) {
            val i = case.getValue("input").jsonObject
            val want = json.decodeFromJsonElement<EngineContract.WindArrowAnswer>(case.getValue("answer"))
            val got = Engine.windArrow(i.num("speed_kt"), i.num("gust_kt"), i.num("crosswind_kt"), i.num("demonstrated_kt")).getOrThrow()
            assertEquals(case.getValue("why").jsonPrimitive.content, want, got)
        }
    }

    @Test
    fun theBarbIsTheFixturesFlagsBarbsAndHalfBarbs() {
        for (case in cases("windBarb")) {
            val want = json.decodeFromJsonElement<EngineContract.WindBarbAnswer>(case.getValue("answer"))
            assertEquals(case.getValue("why").jsonPrimitive.content, want, Engine.windBarb(case.num("speed_kt")!!).getOrThrow())
        }
    }

    @Test
    fun theBadgeIsAtTheFieldsTheFixturesBadge() {
        for (case in cases("worseByArrival")) {
            val now = case.getValue("now").jsonArray.map { json.decodeFromJsonElement<EngineContract.WorseField>(it) }
            val atEta = case.getValue("atEta").jsonArray.map { json.decodeFromJsonElement<EngineContract.WorseField>(it) }
            val badged = case.getValue("badged").jsonArray.map { it.jsonPrimitive.content }.toSet()
            assertEquals(case.getValue("why").jsonPrimitive.content, badged, StationMarks.EngineRules.worse(now, atEta))
        }
    }
}
