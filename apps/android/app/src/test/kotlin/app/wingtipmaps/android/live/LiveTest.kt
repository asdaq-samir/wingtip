package app.wingtipmaps.android.live

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.AirportAtis
import app.wingtipmaps.android.api.generated.AirportRvr
import app.wingtipmaps.android.api.generated.AirspaceAt
import app.wingtipmaps.android.api.generated.DepartureEvent
import app.wingtipmaps.android.api.generated.DepartureEvents
import app.wingtipmaps.android.api.generated.DigitalAtis
import app.wingtipmaps.android.api.generated.FlowAtAirports
import app.wingtipmaps.android.api.generated.FlowProgram
import app.wingtipmaps.android.api.generated.RunwayRvr
import app.wingtipmaps.android.api.generated.SaaStatus
import app.wingtipmaps.android.api.generated.SaaStatuses
import app.wingtipmaps.android.api.generated.SpecialUse
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

private val READING = Json.parseToJsonElement(
    """{"information":"K","time_z":"1452Z","wind":{"from_deg":210,"kt":12,"gust_kt":18,"variable":false},
       "visibility_sm":10,"sky":[{"cover":"few","base_ft":4500},{"cover":"broken","base_ft":9000}],
       "temp_c":21,"dewpoint_c":-3,"altimeter_inhg":29.92,"approach":null,
       "runways":{"landing":["27L","28R"],"departing":["27L","28R"]},"remarks":["Bird activity"],"raw":"x"}""",
).jsonObject

/** The live reports' words, held to the web's own cases (lib/atis,
 *  lib/rvrRows, lib/liveReports, lib/departureWords), and the models
 *  that ask for them, over fakes of the planner and the engine. */
class LiveTest {
    @get:Rule val main = MainRule()


    private class Fake : LiveSource {
        var saaAsked: List<String>? = null
        override suspend fun atis(airport: String) = AirportAtis(airport, listOf(DigitalAtis(airport, 0.0, null, "K", READING, "ORD ATIS INFO K", "arrival")))
        override suspend fun rvr(airport: String) = AirportRvr(airport, listOf(RunwayRvr(airport, heard = 0.0, runway = "27L", touchdownFt = 6000, touchdownMore = true, rolloutFt = 1800)))
        override suspend fun flow(airports: List<String>) = FlowAtAirports(listOf(FlowProgram(airport = "ORD", heard = 0.0, program = "ground stop", ends = 1_700_000_000.0, averageDelayMin = 45)))
        override suspend fun saa(designators: List<String>): SaaStatuses {
            saaAsked = designators
            return SaaStatuses(mapOf("R-4401A" to SaaStatus(active = true, designator = "R-4401A", heard = 0.0, until = 1_700_000_000.0)))
        }
        override suspend fun departures(ident: String) =
            DepartureEvents(listOf(DepartureEvent(departure = "KIND", destination = "KRSW", gate = "B20", heard = 0.0, ident = ident, times = mapOf("clearance_delivery" to 1_700_000_000.0))))
        override suspend fun airspaceAt(lat: Double, lon: Double) =
            AirspaceAt(bands = emptyList(), lat = lat, lon = lon, specialUse = listOf(SpecialUse(kind = "Restricted", name = "R-4401A", type = "R", timesOfUse = "0700-2200")))
    }

    private object Rules : LiveRules {
        override fun calm(kt: Int?) = kt == 0
        override fun ceilingFt(layers: List<EngineContract.CeilingVisibilityInputLayersItem>) =
            layers.firstOrNull { it.cover == "BKN" || it.cover == "OVC" }?.baseFt
        override fun rvrUnder(runways: List<EngineContract.RvrCheckInputRunwaysItem>, minimumSm: Double?) =
            runways.map { (it.rolloutFt ?: 9999.0) < 2400 }
    }

    @Test
    fun theDigitalAtisIsReadIntoItsFigures() {
        val model = LiveAirportModel(Fake(), Rules)
        model.watch("kord")
        // Setup's minimum picked after the readings are in: judged again.
        assertEquals(null, model.state.value.rvr.single().under)
        model.judgeAgainst(0.5)
        val s = model.state.value
        model.stop()
        assertEquals("KORD", s.ident)
        val b = s.atis.single()
        assertEquals("Arrival D-ATIS, information K", b.title)
        assertEquals("Runway 27L, 28R · 29.92 inHg", b.glance)
        val rows = b.rows.associate { it.label to it.value }
        assertEquals("K · 1452Z", rows["Information"])
        assertEquals("210° at 12 kt, gusts 18", rows["Wind"])
        assertEquals("10 sm", rows["Visibility"])
        assertEquals("Few 4,500 ft · Broken 9,000 ft (ceiling)", rows["Sky"])
        assertEquals("21 °C, dew point −3 °C", rows["Temperature"])
        assertEquals("ORD ATIS INFO K", b.text)
        // RVR against the minimum, and the program in a line.
        assertEquals("6000+ · — · 1800", s.rvr.single().readings)
        assertEquals("Under your 1/2 SM minimum (14 CFR 91.175(h))", s.rvr.single().under)
        assertEquals("Ground stop at ORD until 2213Z, delays average 45 min", s.programs.single())
    }

    @Test
    fun specialUseCarriesSfdpsWordNow() {
        val fake = Fake()
        val words = object : AreaWords {
            override fun name(text: String) = text
            override fun altitudes(area: SpecialUse) = "Surface to 10,000 ft MSL"
        }
        val model = SpecialUseModel(fake, words)
        model.at(41.0, -87.0)
        val area = model.state.value.areas!!.single()
        assertEquals(listOf("R-4401A"), fake.saaAsked)
        assertEquals("Surface to 10,000 ft MSL · 0700-2200", area.line)
        assertEquals("Active now until 2213Z (FAA SFDPS)", area.status)
        assertTrue(area.active)
    }

    @Test
    fun theTowerDepartureIsOneLineAndNeverATakeoff() {
        val model = DepartureModel(Fake())
        model.of("n123ab")
        assertEquals("Cleared 2213Z at KIND, gate B20, to KRSW (FAA TDES)", model.line.value)
        model.of(null)
        assertNull(model.line.value)
    }

    @Test
    fun wordsAsTheWebSaysThem() {
        assertEquals("Calm", LiveWords.windWords(EngineContract.ReadDatisAnswerWind(kt = 0, variable = false), calm = true))
        assertEquals("Light and variable", LiveWords.windWords(EngineContract.ReadDatisAnswerWind(variable = true), calm = false))
        assertEquals("1 1/4", LiveWords.smWords(1.25))
        assertEquals("1/2", LiveWords.smWords(0.5))
        assertEquals("3", LiveWords.smWords(3.0))
        assertNull(LiveWords.programLine(FlowProgram(airport = "EWR", heard = 0.0, restriction = true, program = "x")))
        assertEquals("Cold now; next active 2213Z (FAA SFDPS)", LiveWords.saaWords(SaaStatus(active = false, designator = "R", heard = 0.0, next = 1_700_000_000.0)))
        assertNull(LiveWords.saaWords(SaaStatus(designator = "R", heard = 0.0)))
    }
}
