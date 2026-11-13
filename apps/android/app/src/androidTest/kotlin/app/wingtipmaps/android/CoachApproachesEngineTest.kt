package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.coach.CoachApproaches
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.distanceNm
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.min
import kotlin.math.tan

/**
 * The coach's approaches found by the engine on the phone (approach_find,
 * through the generated bindings): KBUR's ILS Y RWY 08 flown as charted, among the
 * field's approaches as the planner draws them from the CIFP of 1 Oct
 * 2026 (approachKbur.json, the web's and the engine's fixture), found and
 * trimmed for proficiency_plan as the web's coachDebriefs does.
 */
@RunWith(AndroidJUnit4::class)
class CoachApproachesEngineTest {
    private val kbur by lazy {
        val text = InstrumentationRegistry.getInstrumentation().context.assets.open("approachKbur.json").bufferedReader().use { it.readText() }
        Json.parseToJsonElement(text).jsonObject
    }

    private fun drawing(id: String) = CoachApproaches.drawing(kbur.getValue(id).toString())

    /** The engine's distance, nm, on WGS-84 (distance_nm through the
     *  generated bindings): where along the line a point is, by the one measure every
     *  app asks. */
    private fun nm(a: Pair<Double, Double>, b: Pair<Double, Double>): Double =
        Engine.distanceNm(a.first, a.second, b.first, b.second).getOrThrow()

    /** The ILS's final, 2 nm out before its first point, flown at 120 kt a
     *  point a second as charted (the web test's onIls): 3,700 ft to SILEX,
     *  3,000 to the glide slope, then down it from 787 ft at the threshold
     *  at 3° (the drawing's runway_path); a missed approach begun 12 s past
     *  the runway at 1,000 ft a minute. */
    private fun ilsFlown(): List<EngineContract.TrackPoint> {
        val gp = drawing("I08-Y").runwayPath!!
        val final = kbur.getValue("I08-Y").jsonObject.getValue("lines").jsonArray.map { it.jsonObject }
            .first { it.getValue("role").jsonPrimitive.content == "final" }.getValue("points").jsonArray
            .map { p -> p.jsonArray.let { it[0].jsonPrimitive.double to it[1].jsonPrimitive.double } }
        val k = 2 / nm(final[0], final[1])
        val line = listOf(final[0].first - (final[1].first - final[0].first) * k to final[0].second - (final[1].second - final[0].second) * k) + final
        val legs = line.zipWithNext()
        val total = legs.sumOf { nm(it.first, it.second) }
        val earthFt = 6_371_000 * 3.28084
        fun alt(toGo: Double): Double {
            val d = toGo * 6076.12
            return min(gp.ft + d * tan(Math.toRadians(gp.deg)) + d * d / (2 * earthFt), if (toGo > 11) 3700.0 else 3000.0)
        }
        val t0 = 1_793_372_400_000.0
        val points = mutableListOf<EngineContract.TrackPoint>()
        var s = 0
        while (s * 120.0 / 3600 <= total) {
            var rest = s * 120.0 / 3600
            var i = 0
            while (i < legs.size - 1 && rest > nm(legs[i].first, legs[i].second)) {
                rest -= nm(legs[i].first, legs[i].second)
                i++
            }
            val (a, b) = legs[i]
            val f = min(rest / nm(a, b), 1.0)
            points += EngineContract.TrackPoint(t0 + s * 1000, a.first + (b.first - a.first) * f, a.second + (b.second - a.second) * f, alt(total - s * 120.0 / 3600))
            s++
        }
        val (a, b) = legs.last()
        val per = 120.0 / 3600 / nm(a, b)
        for (j in 1..120) {
            val f = 1 + per * j
            points += EngineContract.TrackPoint(t0 + (s + j - 1) * 1000, a.first + (b.first - a.first) * f, a.second + (b.second - a.second) * f,
                if (j <= 12) gp.ft else gp.ft + (j - 12) * 1000.0 / 60)
        }
        return points
    }

    @Test fun theApproachFlownIsFoundAndTrimmedForTheCoach() {
        val found = CoachApproaches.found(listOf(drawing("R08-Z"), drawing("I08-Y")), ilsFlown(), 778.0, "2026-10-30")
        assertEquals(1, found.size)
        val a = found.single()
        assertEquals("approach", a.kind)
        assertEquals("KBUR", a.place)
        assertTrue(a.profile!!.isNotEmpty())
        val words = a.findings!!.map { it.text }
        assertTrue(words.toString(), words.any { it.startsWith("Missed approach started") })
        assertTrue(words.toString(), words.any { it.startsWith("Within full scale all the way") })
        assertTrue(a.findings.none { it.tone == "stop" || it.tone == "caution" })
    }

    @Test fun noApproachesDrawnIsNoneFound() {
        assertTrue(CoachApproaches.found(emptyList(), ilsFlown(), null, "2026-10-30").isEmpty())
    }
}
