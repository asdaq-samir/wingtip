package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.EngineException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith

// The shared fixtures' shapes (apps/web/src/lib/fixtures, in this test's assets
// by build.gradle.kts), as SharedFixturesTests.swift reads them.

@Serializable
private data class Flat(
    val fix: String,
    val inbound: Int,
    val right: Boolean,
    val legMin: Double? = null,
    val legNm: Double? = null,
    val turns: Int? = null,
    val minutes: Int? = null,
)

@Serializable
private data class Parse(val text: String, val hold: Flat? = null, val written: String? = null, val words: String? = null)

@Serializable
private data class LegCase(val altitudeFt: Double, val minutes: Double)

@Serializable
private data class HoldsFixture(val parse: List<Parse>, val legMinutes: List<LegCase>)

@Serializable
private data class ReadCase(val heard: String, val clearance: JsonObject)

@Serializable
private data class ClearancesFixture(val read: List<ReadCase>)

/** A hold as the engine reads and writes it (call.rs: `{"fix", "inbound",
 *  "right", "leg_min"|"leg_nm", "turns"|"minutes"}`); its numbers are
 *  written as doubles, so they are read as doubles. */
@Serializable
private data class EngineHold(
    val fix: String,
    val inbound: Double,
    val right: Boolean,
    @SerialName("leg_min") val legMin: Double? = null,
    @SerialName("leg_nm") val legNm: Double? = null,
    val turns: Double? = null,
    val minutes: Double? = null,
)

@Serializable
private data class TextAsk(val text: String)

@Serializable
private data class HoldAsk(val hold: EngineHold)

@Serializable
private data class AltitudeAsk(@SerialName("altitude_ft") val altitudeFt: Double)

/**
 * The engine on an Android phone held to the web's shared fixtures
 * (docs/NATIVE-ANDROID.md), through this app's own bridge
 * (the generated UniFFI Kotlin, Engine.kt): the same files the web's vitest tests and
 * the iOS tests read, so a bridge that mangles a string or a number
 * fails here. One table, the holds, as the iOS test checks it, and a
 * clearance read.
 */
@RunWith(AndroidJUnit4::class)
class EngineTest {
    /** A fixture from the test APK's own assets. */
    private fun fixture(name: String): String =
        InstrumentationRegistry.getInstrumentation().context.assets.open(name).bufferedReader().use { it.readText() }

    @Test
    fun aHoldIsReadAndWrittenAsTheWebAndThePlannerDo() {
        val f = Engine.json.decodeFromString<HoldsFixture>(fixture("holds.json"))
        assertTrue(f.parse.size >= 5)
        for (c in f.parse) {
            val hold = Engine.call<TextAsk, EngineHold?>("hold_read", TextAsk(c.text))
            val flat = hold?.let { Flat(it.fix, it.inbound.toInt(), it.right, it.legMin, it.legNm, it.turns?.toInt(), it.minutes?.toInt()) }
            assertEquals(c.text, c.hold, flat)
            // The words ("Right turns · 270° inbound · …") are the app's own
            // formatting, which the Kotlin does not write yet.
            if (hold != null) {
                val written = Engine.call<HoldAsk, String>("hold_write", HoldAsk(hold))
                assertEquals(c.text, c.written, written)
            }
        }
        for (c in f.legMinutes) {
            val minutes = Engine.call<AltitudeAsk, Double>("holding_leg_minutes", AltitudeAsk(c.altitudeFt))
            assertEquals("${c.altitudeFt} ft", c.minutes, minutes, 1e-9)
        }
    }

    @Test
    fun aClearanceIsReadAsTheWebReadsIt() {
        val f = Engine.json.decodeFromString<ClearancesFixture>(fixture("clearances.json"))
        val c = f.read.first()
        val read = Engine.call<TextAsk, JsonObject>("read_clearance", TextAsk(c.heard))
        assertEquals(c.heard, c.clearance["limit"]?.jsonPrimitive?.contentOrNull, read["limit"]?.jsonPrimitive?.contentOrNull)
        assertEquals(c.heard, c.clearance["asFiled"]?.jsonPrimitive?.booleanOrNull, read["asFiled"]?.jsonPrimitive?.booleanOrNull)
        assertEquals(c.heard, c.clearance["vfr"]?.jsonPrimitive?.booleanOrNull, read["vfr"]?.jsonPrimitive?.booleanOrNull)
        assertEquals(c.heard, c.clearance["maintainFt"]?.jsonPrimitive?.doubleOrNull, read["maintainFt"]?.jsonPrimitive?.doubleOrNull)
    }

    @Test
    fun thePhasesAreHeadingsAloneInTheHandbooksOrder() {
        assertEquals(13, app.wingtipmaps.android.checklist.ChecklistPhases.NORMAL.getOrThrow().size)
        assertEquals("Preflight inspection", app.wingtipmaps.android.checklist.ChecklistPhases.NORMAL.getOrThrow().first())
        assertEquals("Securing the airplane", app.wingtipmaps.android.checklist.ChecklistPhases.NORMAL.getOrThrow().last())
        assertEquals(12, app.wingtipmaps.android.checklist.ChecklistPhases.EMERGENCY.getOrThrow().size)
        assertEquals("Engine failure on the takeoff roll", app.wingtipmaps.android.checklist.ChecklistPhases.EMERGENCY.getOrThrow().first())
        assertEquals("Inadvertent icing", app.wingtipmaps.android.checklist.ChecklistPhases.EMERGENCY.getOrThrow().last())
        val text = app.wingtipmaps.android.checklist.ChecklistPhases.template(app.wingtipmaps.android.checklist.ChecklistKind.EMERGENCY).getOrThrow()
        val lines = text.lines().filter { it.isNotBlank() }
        // Every line a heading: no item, so nothing of a manufacturer's.
        assertTrue(lines.all { it.startsWith("# ") })
        assertEquals(app.wingtipmaps.android.checklist.ChecklistPhases.EMERGENCY.getOrThrow(), lines.map { it.removePrefix("# ") })
        assertFalse(app.wingtipmaps.android.checklist.ChecklistPhases.template(app.wingtipmaps.android.checklist.ChecklistKind.NORMAL).getOrThrow().contains("--"))
    }

    /** The passengers' briefing, the engine's (passenger_briefing):
     *  14 CFR 91.107(a)'s two first, each with its source. */
    @Test
    fun thePassengerBriefingIsTheEnginesEachWithItsSource() {
        val items = app.wingtipmaps.android.briefing.PassengerBriefing.ITEMS.getOrThrow()
        assertEquals(listOf("pax-belts", "pax-fastened", "pax-air", "pax-fire", "pax-exits", "pax-traffic", "pax-questions"), items.map { it.key })
        assertEquals("14 CFR 91.107(a)(1)", items[0].rule)
        assertEquals("14 CFR 91.107(a)(2), (3)", items[1].rule)
        assertTrue(items.first { it.key == "pax-exits" }.rule.contains("PA.II.B.S2"))
    }

    @Test
    fun aNameTheEngineHasNoRuleForIsRefusedInItsOwnWords() {
        try {
            Engine.call<TextAsk, JsonObject>("no_such_rule", TextAsk(""))
            fail("the engine should have refused")
        } catch (e: EngineException) {
            assertFalse(e.message.isNullOrEmpty())
        }
    }
}
