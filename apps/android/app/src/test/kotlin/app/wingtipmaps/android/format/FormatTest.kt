package app.wingtipmaps.android.format

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The formatter against the shared table every app's is held to
 * (apps/web/src/lib/fixtures/formats.json, written from
 * design/tokens.json): each format's every example, input to the words.
 * The fixtures folder is this test's resources (build.gradle.kts), not a
 * copy, so a changed token fails here.
 */
class FormatTest {
    private val table: JsonObject = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("formats.json")) { "formats.json is not on the test's classpath" }.readText(),
    ).jsonObject

    private fun num(e: JsonElement): Double? = if (e is JsonNull) null else e.jsonPrimitive.double

    /** Each format the table names, written by this app's own function. */
    private val writers: Map<String, (JsonElement) -> String> = mapOf(
        "cruiseAltitude" to { e -> Format.cruiseAltitude(num(e)) },
        "mapLevel" to { e -> Format.mapLevel(num(e)!!) },
        "altitude" to { e -> Format.altitude(num(e)) },
        "altitudeRange" to { e -> e.jsonArray.let { Format.altitudeRange(num(it[0])!!, num(it[1])!!) } },
        "duration" to { e -> Format.duration(num(e)!!) },
        "navLogTime" to { e -> Format.navLogTime(num(e)!!) },
        "zulu" to { e -> Format.zulu(e.jsonPrimitive.content) },
        "heading" to { e -> Format.heading(num(e)!!) },
        "distance" to { e -> Format.distance(num(e)) },
        "speed" to { e -> Format.speed(num(e)) },
        "fuel" to { e -> Format.fuel(num(e)) },
        "weight" to { e -> Format.weight(num(e)!!) },
        "windCorrection" to { e -> Format.windCorrection(num(e)!!) },
        "variation" to { e -> Format.variation(num(e)!!) },
        // The spoken forms: what TalkBack says for each figure (Spoken).
        "spokenAltitude" to { e -> Spoken.altitude(num(e)) },
        "spokenHeading" to { e -> Spoken.heading(num(e)!!) },
        "spokenHeadingMagnetic" to { e -> Spoken.headingMagnetic(num(e)!!) },
        "spokenHeadingTrue" to { e -> Spoken.headingTrue(num(e)!!) },
        "spokenDistance" to { e -> Spoken.distance(num(e)) },
        "spokenSpeed" to { e -> Spoken.speed(num(e)) },
        "spokenFuel" to { e -> Spoken.fuel(num(e)) },
        "spokenDuration" to { e -> Spoken.duration(num(e)) },
        "spokenZulu" to { e -> Spoken.zulu(e.jsonPrimitive.content) },
    )

    @Test
    fun everyFormatInTheTableIsWritten() {
        val named = table.keys.filter { !it.startsWith("$") }.toSet()
        assertEquals("formats in formats.json with no writer here, or the other way", named, writers.keys)
    }

    @Test
    fun everyExampleIsWrittenAsTheTableSays() {
        var count = 0
        for ((name, write) in writers) {
            val examples = table.getValue(name).jsonObject.getValue("examples") as JsonArray
            for (example in examples) {
                val o = example.jsonObject
                val written = o.getValue("written").jsonPrimitive.content
                assertEquals("$name(${o["input"]})", written, write(o.getValue("input")))
                count++
            }
        }
        assertTrue(count > 30)
    }

    @Test
    fun northIs360AndAFrequencyKeepsItsTenths() {
        assertEquals("360", Format.headingFigures(0.2))
        assertEquals("122.0", Format.frequency(122.0))
        assertEquals("118.3", Format.frequency(118.3))
        assertEquals("121.75", Format.frequency(121.75))
    }

    /** The words under the spoken forms: hyphened tens, no "and". */
    @Test
    fun numbersInWords() {
        assertEquals("zero", Spoken.number(0))
        assertEquals("nineteen", Spoken.number(19))
        assertEquals("forty", Spoken.number(40))
        assertEquals("one hundred two", Spoken.number(102))
        assertEquals("two thousand one", Spoken.number(2001))
        assertEquals("minus thirty-five", Spoken.number(-35))
        assertEquals("one nine", Spoken.digits("19"))
    }

    /** The live reports' figures (D-ATIS, the emergency checklist), as the
     *  web's lib/atis writes them. */
    @Test
    fun anAltimeterAVisibilityAndATemperature() {
        assertEquals("29.92 inHg", Format.altimeter(29.92))
        assertEquals("30.10 inHg", Format.altimeter(30.1))
        assertEquals("10 sm", Format.visibility(10.0))
        assertEquals("2½ sm", Format.visibility(2.5))
        assertEquals("¾ sm", Format.visibility(0.75))
        assertEquals("0 sm", Format.visibility(0.0))
        assertEquals("15 °C", Format.temperature(15.0))
        assertEquals("−3 °C", Format.temperature(-3.0))
    }

    /** A forecast's ceiling and visibility, as the web's ceilingAndVisibility. */
    @Test
    fun ceilingAndVisibility() {
        assertEquals("1,200 ft · 3 sm", Format.ceilingAndVisibility(1200.0, 3.0))
        assertEquals("no ceiling · 6 sm", Format.ceilingAndVisibility(null, 6.0))
        assertEquals("800 ft · —", Format.ceilingAndVisibility(800.0, null))
    }
}
