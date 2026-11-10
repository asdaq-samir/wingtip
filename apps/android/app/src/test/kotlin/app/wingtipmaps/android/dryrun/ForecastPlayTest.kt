package app.wingtipmaps.android.dryrun

import app.wingtipmaps.android.api.generated.ForecastRun
import app.wingtipmaps.android.api.generated.RunAlert
import app.wingtipmaps.android.api.generated.RunArea
import app.wingtipmaps.android.api.generated.RunLeg
import app.wingtipmaps.android.api.generated.RunSample
import app.wingtipmaps.android.dryrun.DryRunFixtures.START
import app.wingtipmaps.android.dryrun.DryRunFixtures.path
import app.wingtipmaps.android.map.ForecastAreasLayer
import app.wingtipmaps.android.pilot.Minimums
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The forecast run's pure parts, the web's forecastRun.ts: the run as
 *  the planner takes it, and the answer read at the run's time. */
class ForecastPlayTest {
    @Test
    fun aLongRunIsThinnedEvenlyKeepingItsLast() {
        val kept = ForecastPlay.thinned(1000)
        assertTrue(kept.size <= ForecastPlay.MOST_POINTS + 1)
        assertEquals(0, kept.first())
        assertEquals(999, kept.last())
        assertEquals(kept[1] - kept[0], kept[2] - kept[1])
        assertEquals((0 until 10).toList(), ForecastPlay.thinned(10))
        assertEquals(emptyList<Int>(), ForecastPlay.thinned(0))
    }

    @Test
    fun theAskCarriesRowsFieldsRulesAndMinimums() {
        val ask = ForecastPlay.ask(path, "ifr", Minimums(ceilingFt = 2000.0))
        assertEquals(10, ask.track.size)
        assertEquals(listOf(0, 1, 1, 1, 2, 2, 2, 2, 2, 2), ask.track.map { it.row })
        assertEquals(listOf("departure" to START, "stop" to START + 1800, "destination" to START + 5400), ask.fields!!.map { it.role to it.t })
        assertEquals(43.14, ask.fields[1].lat, 0.0)
        assertEquals("IFR", ask.rules)
        assertEquals(2000.0, ask.minimums!!.ceilingFt!!, 0.0)
        assertNull(ask.minimums.visibilitySm)
        assertEquals("VFR", ForecastPlay.ask(path, "vfr", Minimums()).rules)
    }

    private fun sample(t: Double, category: String) = RunSample(areas = emptyList(), category = category, ceilingUnknown = false, lat = 45.0, lon = -93.0, t = t)

    private fun area(from: Double?, to: Double?) =
        RunArea(coords = listOf(listOf(42.0, -88.0), listOf(43.0, -88.0), listOf(43.0, -89.0)), kind = "gairmet", source = "G-AIRMET", validFrom = from, validTo = to, words = "IFR conditions")

    private val answer = ForecastRun(
        alerts = listOf(
            RunAlert(kind = "gairmet", lat = 42.5, lon = -88.5, source = "G-AIRMET Sierra", t = START + 1200, words = "In a G-AIRMET"),
            RunAlert(kind = "vfr_minimums", lat = 43.0, lon = -89.0, source = "14 CFR 91.155", t = START + 2400, words = "Below VFR minimums"),
        ),
        areas = listOf(area(START, START + 3600), area(START + 3600, null), area(null, START + 600)),
        fields = emptyList(),
        legs = listOf(RunLeg(category = "VFR", fromT = START, row = 1, toT = START + 1800), RunLeg(category = "IFR", fromT = START + 1800, row = 2, toT = START + 5400)),
        samples = listOf(sample(START, "VFR"), sample(START + 1800, "MVFR"), sample(START + 3600, "IFR")),
        unavailable = listOf("tafs", "winds"),
    )

    @Test
    fun theSampleIsTheLastPassed() {
        assertEquals("VFR", ForecastPlay.sampleAt(answer, START - 10)!!.category)
        assertEquals("VFR", ForecastPlay.sampleAt(answer, START + 1799)!!.category)
        assertEquals("MVFR", ForecastPlay.sampleAt(answer, START + 1800)!!.category)
        assertEquals("IFR", ForecastPlay.sampleAt(answer, START + 9999)!!.category)
    }

    @Test
    fun theAlertIsTheLatestReached() {
        assertNull(ForecastPlay.alertAt(answer, START + 1199))
        assertEquals("gairmet", ForecastPlay.alertAt(answer, START + 1200)!!.kind)
        assertEquals("vfr_minimums", ForecastPlay.alertAt(answer, START + 5000)!!.kind)
    }

    @Test
    fun areasInForceFromTheirStartToBeforeTheirEnd() {
        assertEquals(2, ForecastPlay.areasAt(answer, START).size)
        assertEquals(1, ForecastPlay.areasAt(answer, START + 600).size)
        assertEquals(listOf(START + 3600), ForecastPlay.areasAt(answer, START + 3600).map { it.validFrom })
    }

    @Test
    fun theStripsMarkHourAndWords() {
        assertEquals(0.5f, ForecastPlay.fraction(answer, START + 2700), 1e-6f)
        assertEquals(1f, ForecastPlay.fraction(answer, START + 99_999), 0f)
        assertEquals("14Z", ForecastPlay.hourZ(START))
        assertEquals("Played without TAFs, the winds aloft.", ForecastPlay.unavailableWords(answer.unavailable))
        assertNull(ForecastPlay.unavailableWords(emptyList()))
    }

    @Test
    fun anAreaIsAClosedPolygonLongitudeFirst() {
        val features = Json.parseToJsonElement(ForecastAreasLayer.geoJson(answer.areas)).jsonObject["features"]!!.jsonArray
        assertEquals(3, features.size)
        val ring = features[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray[0].jsonArray
        assertEquals(4, ring.size)
        assertEquals(ring.first(), ring.last())
        assertEquals(-88.0, ring[0].jsonArray[0].jsonPrimitive.double, 0.0)
    }
}
