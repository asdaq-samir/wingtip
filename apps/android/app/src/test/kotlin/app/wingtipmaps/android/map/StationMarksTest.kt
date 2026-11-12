package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.generated.Briefing
import app.wingtipmaps.android.api.generated.Forecast
import app.wingtipmaps.android.api.generated.ForecastStation
import app.wingtipmaps.android.api.generated.Metar
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The airport weather marks the map asks the engine for, held to the
 * shared fixtures (apps/web/src/lib/fixtures/airportWeatherMarks.json, on
 * the test's classpath by build.gradle.kts): the app hands each rule the
 * fixture's input and draws its answer -- the barb drawn zoomed out or
 * not (`wind_arrow`), red or not, the barb and calm (`wind_barb`), and the ↓ at a plan's
 * field (`weather_worse`). The engine itself does not load on the JVM, so
 * the rules here answer from the fixture, and each checks it was asked
 * what the fixture asks; AirportWeatherEngineTest runs the engine itself
 * through the JNI shim on the same file.
 */
class StationMarksTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val fixtures: JsonObject = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("airportWeatherMarks.json")) { "airportWeatherMarks.json is not on the test's classpath" }.readText(),
    ).jsonObject

    private fun cases(name: String) = fixtures.getValue(name).jsonArray.map { it.jsonObject }

    private fun JsonObject.num(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull

    /** Rules that answer one fixture case, failing on any other input. */
    private class FixtureRules(
        val arrowIn: JsonObject? = null,
        val arrowOut: EngineContract.WindArrowAnswer? = null,
        val barbOut: EngineContract.WindBarbAnswer? = null,
    ) : StationMarks.Rules {
        override fun barb(speedKt: Double) = barbOut

        override fun arrow(speedKt: Double?, gustKt: Double?, crosswindKt: Double?, demonstratedKt: Double?): EngineContract.WindArrowAnswer? {
            val want = checkNotNull(arrowIn)
            assertEquals((want["speed_kt"] as? JsonPrimitive)?.doubleOrNull, speedKt)
            assertEquals((want["gust_kt"] as? JsonPrimitive)?.doubleOrNull, gustKt)
            assertEquals((want["crosswind_kt"] as? JsonPrimitive)?.doubleOrNull, crosswindKt)
            assertEquals((want["demonstrated_kt"] as? JsonPrimitive)?.doubleOrNull, demonstratedKt)
            return arrowOut
        }

        override fun worse(now: List<EngineContract.WorseField>, atEta: List<EngineContract.WorseField>) = emptySet<String>()
    }

    private val oneBarb = EngineContract.WindBarbAnswer(calm = false, flags = 0, barbs = 1, halfBarbs = 0)
    private val calm = EngineContract.WindBarbAnswer(calm = true, flags = 0, barbs = 0, halfBarbs = 0)

    private fun field(speed: Double?, gust: Double?, crosswind: Double?, from: Double? = 220.0) =
        FieldWx("KJVL", 42.62, -89.04, "IFR", from, speed, gust, crosswind, "2 sm BR", "CIG 008")

    @Test
    fun theBarbIsDrawnFarOutAndRedAsTheEngineSays() {
        for (case in cases("windArrow")) {
            val input = case.getValue("input").jsonObject
            val answer = json.decodeFromJsonElement<EngineContract.WindArrowAnswer>(case.getValue("answer"))
            val rules = FixtureRules(arrowIn = input, arrowOut = answer, barbOut = oneBarb)
            val mark = StationMarks.mark(field(input.num("speed_kt"), input.num("gust_kt"), input.num("crosswind_kt")), input.num("demonstrated_kt"), emptySet(), rules)
            val why = case.getValue("why").jsonPrimitive.content
            // A field with no steady wind (a gust alone) has no barb to draw.
            assertEquals(why, answer.shown && input.num("speed_kt") != null, mark.far)
            assertEquals(why, answer.over, mark.over)
            if (input.num("speed_kt") != null) assertEquals(why, answer.over, mark.barb!!.endsWith("|over"))
        }
    }

    @Test
    fun theBarbIsTurnedToWhereTheWindIsFrom() {
        val rules = FixtureRules(
            arrowIn = JsonObject(mapOf("speed_kt" to JsonPrimitive(18), "gust_kt" to JsonPrimitive(26), "crosswind_kt" to JsonPrimitive(17))),
            arrowOut = EngineContract.WindArrowAnswer(shown = true, over = false),
            barbOut = oneBarb,
        )
        val mark = StationMarks.mark(field(18.0, 26.0, 17.0), null, emptySet(), rules)
        assertEquals("wx|barb|0|1|0", mark.barb)
        assertEquals(220.0, mark.fromDeg!!, 0.0)
        assertTrue(mark.far)
        assertNull(mark.variable)
    }

    @Test
    fun aVariableWindIsWrittenVrbForNoBarbCanPointIt() {
        val rules = FixtureRules(
            arrowIn = JsonObject(mapOf("speed_kt" to JsonPrimitive(6), "gust_kt" to JsonPrimitive(16), "crosswind_kt" to JsonPrimitive(16))),
            arrowOut = EngineContract.WindArrowAnswer(shown = true, over = true),
            barbOut = oneBarb,
        )
        val mark = StationMarks.mark(field(6.0, 16.0, 16.0, from = null), null, emptySet(), rules)
        assertNull(mark.barb)
        assertEquals("VRB06", mark.variable)
        assertTrue(mark.far && mark.over)
        // Calm needs no direction: its ring, not "VRB00".
        val still = StationMarks.mark(field(2.0, null, null, from = null), null, emptySet(), FixtureRules(
            arrowIn = JsonObject(mapOf("speed_kt" to JsonPrimitive(2))),
            arrowOut = EngineContract.WindArrowAnswer(shown = false, over = false),
            barbOut = calm,
        ))
        assertEquals(StationPictures.CALM, still.barb)
        assertNull(still.variable)
    }

    @Test
    fun theBarbIsTheEnginesFlagsBarbsAndHalfBarbs() {
        val ids = cases("windBarb").associate {
            it.getValue("why").jsonPrimitive.content to StationPictures.barbId(json.decodeFromJsonElement(it.getValue("answer")))
        }
        // 0 and 2 kt both calm, as the NWS's table rounds 0-2 kt to 0.
        assertEquals(listOf(StationPictures.CALM, StationPictures.CALM, "wx|barb|0|0|1", "wx|barb|0|1|0", "wx|barb|0|2|0", "wx|barb|1|1|1"), ids.values.toList())
        assertEquals("wx|barb|0|1|0|over", StationPictures.barbId(oneBarb, over = true))
        assertEquals(StationPictures.CALM, StationPictures.barbId(calm, over = true))
    }

    @Test
    fun theBadgeAsksWeatherWorseOfEachPlanFieldsMetarAgainstItsTafAtTheEta() {
        for (case in cases("worseByArrival")) {
            val now = case.getValue("now").jsonArray.map { json.decodeFromJsonElement<EngineContract.WorseField>(it) }
            val atEta = case.getValue("atEta").jsonArray.map { json.decodeFromJsonElement<EngineContract.WorseField>(it) }
            val briefing = Briefing(
                airports = emptyMap(), hazards = emptyList(), weatherUnavailable = emptyList(),
                metars = now.associate { it.ident to Metar(ceilingFt = it.ceilingFt, visibilitySm = it.visibilitySm) },
                forecast = Forecast(
                    stations = atEta.map {
                        ForecastStation(icaoId = it.ident, eta = "2026-11-10T18:00:00Z", etaCeilingFt = it.ceilingFt, etaVisibilitySm = it.visibilitySm)
                    } + ForecastStation(icaoId = "KXYZ", eta = "2026-11-10T18:00:00Z", etaCeilingFt = 200.0),
                ),
            )
            val (then, eta) = RouteWorse.readings(now.map { it.ident } + "KOFF", briefing)
            // Off the route, nothing asked; on it, the fixture's readings.
            assertEquals(now, then)
            assertEquals(atEta, eta)
            // Every plan field is compared as weather_worse compares a TAF where
            // the flight lands.
            assertTrue(StationMarks.reading(then).tafs!!.all { it.arrival == true })
            val badged = case.getValue("badged").jsonArray.map { it.jsonPrimitive.content }.toSet()
            val answer = EngineContract.WeatherWorseAnswer(
                badged.map { EngineContract.WeatherWorseItem(key = "taf:$it:IFR", kind = "taf", ident = it, line = "", source = "") } +
                    EngineContract.WeatherWorseItem(key = "metar:KOFF:IFR", kind = "metar", ident = "KOFF", line = "", source = ""),
            )
            assertEquals(badged, StationMarks.worseIdents(answer))
        }
    }

    @Test
    fun theBadgeAndFarBarbFollowTheirSwitches() {
        val mark = FieldMark("KJVL", 42.0, -89.0, "wx|barb|0|2|0|over", 220.0, "2 sm BR", worse = true, far = true, over = true)
        val all = StationLayer.geoJson(listOf(mark), AirportWeather())
        assertTrue(all, all.contains("\"far\":true") && all.contains("\"over\":true") && all.contains("\"worse\":true") && all.contains("\"barb\""))
        val none = StationLayer.geoJson(listOf(mark), AirportWeather(windArrows = false, worse = false))
        assertFalse(none, none.contains("\"far\"") || none.contains("\"worse\""))
        // The station model's barb stays with the far one off.
        assertTrue(none, none.contains("\"barb\""))
        assertFalse(StationLayer.geoJson(listOf(mark), AirportWeather(AirportWeatherMode.OFF)).contains("KJVL"))
    }

    @Test
    fun talkBackReadsTheCategoryAndWind() {
        // Whether it is calm is the engine's `wind_barb`, answered here, so
        // what is said is what the barb draws (2 kt is calm).
        val windy = FixtureRules(barbOut = oneBarb)
        assertEquals("IFR, wind 220 at 18 gusting 26", StationMarks.said(field(18.0, 26.0, 17.0), windy))
        assertEquals("IFR, wind calm", StationMarks.said(field(2.0, null, null), FixtureRules(barbOut = calm)))
        assertEquals("IFR, wind variable at 6", StationMarks.said(field(6.0, null, null, from = null), windy))
        // Where the engine cannot say, the figures are said.
        assertEquals("IFR, wind 220 at 0", StationMarks.said(field(0.0, null, null), FixtureRules()))
    }

    @Test
    fun theLinesAreTheMetarsVisibilityAndCeiling() {
        assertEquals("2 sm BR", StationLines.visibility(2.0, "BR"))
        assertEquals("10 sm", StationLines.visibility(10.0, null))
        assertEquals("CIG 008", StationLines.ceiling(800.0, false))
        assertEquals("CIG ///", StationLines.ceiling(null, true))
        assertNull(StationLines.ceiling(null, false))
        // The layer's own cover where the planner sends it (ceiling_cover).
        assertEquals("OVC 008", StationLines.ceiling(800.0, false, "OVC"))
        assertEquals("BKN 025", StationLines.ceiling(2500.0, false, "BKN"))
        assertEquals("VV 002", StationLines.ceiling(200.0, false, "VV"))
        assertEquals("VV ///", StationLines.ceiling(null, true, "VV"))
        assertEquals("CIG 008", StationLines.ceiling(800.0, false, null))
        assertEquals("CIG 008", StationLines.ceiling(800.0, false, "SCT"))
    }

    @Test
    fun theDemonstratedCrosswindIsTheProfilesOrNone() {
        val profile = mapOf("crosswind" to JsonObject(mapOf("demonstrated_kt" to JsonPrimitive(15))))
        assertEquals(15.0, StationMarks.demonstratedKt(profile)!!, 0.0)
        assertNull(StationMarks.demonstratedKt(null))
        assertNull(StationMarks.demonstratedKt(mapOf("crosswind" to JsonObject(emptyMap()))))
    }
}
