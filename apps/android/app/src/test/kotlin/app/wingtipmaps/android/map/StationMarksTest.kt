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
 * fixture's input and draws its answer -- the arrow shown or not
 * (`wind_arrow`), red or not, the barb (`wind_barb`), and the ↓ at a plan's
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

    private fun field(speed: Double?, gust: Double?, crosswind: Double?, from: Double? = 220.0) =
        FieldWx("KJVL", 42.62, -89.04, "IFR", from, speed, gust, crosswind, "2 sm BR", "CIG 008")

    @Test
    fun theArrowIsShownAndRedAsTheEngineSays() {
        for (case in cases("windArrow")) {
            val input = case.getValue("input").jsonObject
            val answer = json.decodeFromJsonElement<EngineContract.WindArrowAnswer>(case.getValue("answer"))
            val rules = FixtureRules(arrowIn = input, arrowOut = answer, barbOut = EngineContract.WindBarbAnswer(calm = false, flags = 0, barbs = 1, halfBarbs = 0))
            val mark = StationMarks.mark(field(input.num("speed_kt"), input.num("gust_kt"), input.num("crosswind_kt")), input.num("demonstrated_kt"), emptySet(), rules)
            val why = case.getValue("why").jsonPrimitive.content
            assertEquals(why, answer.shown, mark.arrow != null)
            assertEquals(why, answer.over, mark.arrow?.red == true)
        }
    }

    @Test
    fun theArrowPointsTheWayTheWindBlowsWithItsFigures() {
        val rules = FixtureRules(
            arrowIn = JsonObject(mapOf("speed_kt" to JsonPrimitive(18), "gust_kt" to JsonPrimitive(26), "crosswind_kt" to JsonPrimitive(17))),
            arrowOut = EngineContract.WindArrowAnswer(shown = true, over = false),
        )
        val arrow = StationMarks.mark(field(18.0, 26.0, 17.0), null, emptySet(), rules).arrow!!
        assertEquals(40.0, arrow.toDeg, 0.0)
        assertEquals("18G26", arrow.figures)
        assertFalse(arrow.red)
        assertEquals("18", StationMarks.figures(18.0, null))
        assertEquals("6", StationMarks.figures(6.0, 6.0))
    }

    @Test
    fun aVariableWindHasNoArrowToPoint() {
        val rules = FixtureRules(
            arrowIn = JsonObject(mapOf("speed_kt" to JsonPrimitive(6), "gust_kt" to JsonPrimitive(16), "crosswind_kt" to JsonPrimitive(16))),
            arrowOut = EngineContract.WindArrowAnswer(shown = true, over = false),
            barbOut = EngineContract.WindBarbAnswer(calm = false, flags = 0, barbs = 1, halfBarbs = 0),
        )
        val mark = StationMarks.mark(field(6.0, 16.0, 16.0, from = null), null, emptySet(), rules)
        assertNull(mark.arrow)
        assertNull(mark.barb)
    }

    @Test
    fun theBarbIsTheEnginesFlagsBarbsAndHalfBarbs() {
        val ids = cases("windBarb").associate {
            it.getValue("why").jsonPrimitive.content to StationPictures.barbId(json.decodeFromJsonElement(it.getValue("answer")))
        }
        assertEquals(listOf(StationPictures.CALM, "wx|barb|0|0|1", "wx|barb|0|1|0", "wx|barb|0|2|0", "wx|barb|1|1|1"), ids.values.toList())
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
    fun theBadgeAndArrowFollowTheirSwitches() {
        val mark = FieldMark("KJVL", 42.0, -89.0, "wx|barb|0|2|0", 220.0, "2 sm BR", FieldMark.Arrow(40.0, true, "18G26"), worse = true)
        val all = StationLayer.geoJson(listOf(mark), AirportWeather())
        assertTrue(all, all.contains("\"arrow\":\"wx|arrow|red\"") && all.contains("\"worse\":true") && all.contains("\"barb\""))
        val none = StationLayer.geoJson(listOf(mark), AirportWeather(windArrows = false, worse = false))
        assertFalse(none, none.contains("\"arrow\"") || none.contains("\"worse\""))
        assertFalse(StationLayer.geoJson(listOf(mark), AirportWeather(AirportWeatherMode.OFF)).contains("KJVL"))
    }

    @Test
    fun talkBackReadsTheCategoryAndWind() {
        assertEquals("IFR, wind 220 at 18 gusting 26", StationMarks.said(field(18.0, 26.0, 17.0)))
        assertEquals("IFR, wind calm", StationMarks.said(field(0.0, null, null)))
        assertEquals("IFR, wind variable at 6", StationMarks.said(field(6.0, null, null, from = null)))
    }

    @Test
    fun theLinesAreTheMetarsVisibilityAndCeiling() {
        assertEquals("2 sm BR", StationLines.visibility(2.0, "BR"))
        assertEquals("10 sm", StationLines.visibility(10.0, null))
        assertEquals("CIG 008", StationLines.ceiling(800.0, false))
        assertEquals("CIG ///", StationLines.ceiling(null, true))
        assertNull(StationLines.ceiling(null, false))
    }

    @Test
    fun theDemonstratedCrosswindIsTheProfilesOrNone() {
        val profile = mapOf("crosswind" to JsonObject(mapOf("demonstrated_kt" to JsonPrimitive(15))))
        assertEquals(15.0, StationMarks.demonstratedKt(profile)!!, 0.0)
        assertNull(StationMarks.demonstratedKt(null))
        assertNull(StationMarks.demonstratedKt(mapOf("crosswind" to JsonObject(emptyMap()))))
    }
}
