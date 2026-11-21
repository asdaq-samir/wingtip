package app.wingtipmaps.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The words every app says the same (design/wording.json, generated into
 * res/values/wording_strings.xml by scripts/build/wording.sh), held to
 * docs/design/rules.md, section 18: a label in Title Case, a sentence
 * begun with a capital and ended with a full stop or a question mark,
 * progress ended with one ellipsis character, a value with no stop.
 */
class WordingTest {
    // The JVM tests run in the module's folder (apps/android/app).
    private val xml = File("src/main/res/values/wording_strings.xml")
    private val json = File("../../../design/wording.json")

    /** Each wording_ string's text, as the app shows it. */
    private val texts: Map<String, String> by lazy {
        assertTrue("wording_strings.xml is missing", xml.exists())
        Regex("""<string name="wording_([a-z0-9_]+)">(.*)</string>""").findAll(xml.readText())
            .associate { it.groupValues[1] to it.groupValues[2].replace("\\'", "'").replace("&amp;", "&") }
    }

    /** Each word's kind, as design/wording.json gives it. */
    private val kinds: Map<String, String> by lazy {
        assertTrue("design/wording.json is missing", json.exists())
        Json.parseToJsonElement(json.readText()).jsonObject.getValue("words").jsonObject
            .mapValues { (_, word) -> word.jsonObject.getValue("kind").jsonPrimitive.content }
    }

    @Test
    fun everyWordIsGeneratedAsDesignWordingHasIt() {
        assertEquals(kinds.keys, texts.keys)
    }

    @Test
    fun theLabelsAreInTitleCase() {
        for ((key, text) in texts.filterKeys { kinds[it] == "label" }) {
            assertTrue("wording_$key is not in Title Case: $text", titleCase(text))
        }
    }

    @Test
    fun theSentencesEndWithAStop() {
        for ((key, text) in texts.filterKeys { kinds[it] == "sentence" }) {
            assertTrue("wording_$key does not begin with a capital: $text", text.first().isUpperCase())
            assertTrue("wording_$key does not end with a stop: $text", text.endsWith(".") || text.endsWith("?"))
        }
    }

    @Test
    fun progressEndsWithOneEllipsisAndAValueWithNoStop() {
        for ((key, text) in texts.filterKeys { kinds[it] == "progress" }) {
            assertTrue("wording_$key does not end with …: $text", text.endsWith("…") && !text.contains("..."))
        }
        for ((key, text) in texts.filterKeys { kinds[it] == "value" }) {
            assertTrue("wording_$key ends with a stop: $text", !text.endsWith("."))
        }
    }

    @Test
    fun titleCaseIsApplesTitleStyle() {
        assertTrue(titleCase("Climb Rate at Sea Level"))
        assertTrue(titleCase("A Planning Aid, Not for Navigation"))
        assertTrue(titleCase("Direct To"))
        assertTrue(titleCase("Weight & Balance"))
        assertTrue(!titleCase("Add a stop"))
        assertTrue(!titleCase("Show on map"))
    }

    private companion object {
        /** Apple's title style: the words lower case only within a title. */
        val MINOR = setOf(
            "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "into",
            "of", "off", "on", "onto", "out", "per", "to", "up", "via", "with", "from",
        )

        /** Every word capitalised but a minor one that is neither first nor last. */
        fun titleCase(text: String): Boolean {
            val words = text.split(' ').map { it.trim(',', '?', '(', ')', ':') }.filter { word -> word.any(Char::isLetter) }
            return words.withIndex().all { (i, word) ->
                word.first().isUpperCase() || (word in MINOR && i != 0 && i != words.lastIndex)
            }
        }
    }
}
