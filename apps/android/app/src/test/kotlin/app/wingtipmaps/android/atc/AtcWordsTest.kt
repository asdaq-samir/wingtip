package app.wingtipmaps.android.atc

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Test

/** The ATC copilot's words for the engine's items (atc_call's shape, as
 *  the shared fixture atcCalls.json and the iPhone's AtcCopilotTests have
 *  them), and a readback's lines. */
class AtcWordsTest {
    /** The engine's altitude_said for these, "3,000 ft" (AIM 4-2-9). */
    private val said = { ft: Double -> String.format(java.util.Locale.US, "%,d ft", ft.toLong()) }

    private fun items(json: String) = AtcItem.items(Json.parseToJsonElement(json).jsonArray)

    @Test
    fun itemsAreWrittenAsAtcSaysThem() {
        // atcCalls.json's first call, the descent and the vector.
        val first = items("""[{"kind":"heading","deg":270,"turn":"left","by_deg":null},{"kind":"altitude","ft":3000,"verb":"descend","limit":null},{"kind":"altimeter","inhg":"29.92"}]""")
        assertEquals(listOf("Left heading 270", "Descend 3,000 ft", "Altimeter 29.92"), first.map { AtcWords.itemWords(it, said) })
        val more = items(
            """[{"kind":"squawk","code":"4512"},{"kind":"frequency","mhz":"125.35","facility":"approach"},{"kind":"direct","said":"gopher"},""" +
                """{"kind":"hold","fix":"gopher","direction":"northeast","on":"radial","on_deg":45,"turns":"left","published":false,"efc":"1430"},""" +
                """{"kind":"runway","runway":"27","what":"land"},{"kind":"class_b"},{"kind":"heading","deg":90,"turn":null,"by_deg":null}]""",
        )
        assertEquals(
            listOf(
                "Squawk 4512", "Approach 125.35", "Direct GOPHER", "Hold NE of GOPHER, 045 radial, left turns, EFC 1430Z",
                "Runway 27, cleared to land", "Cleared into Class B", "Heading 090",
            ),
            more.map { AtcWords.itemWords(it, said) },
        )
        assertEquals(listOf(ItemAction.SQUAWK, ItemAction.FREQUENCY, ItemAction.DIRECT, null), more.take(4).map(AtcWords::actionOf))
    }

    @Test
    fun aReadbackSaysWhatWasMissedRequiredFirst() {
        assertEquals(listOf("Readback complete"), AtcWords.readbackLines(EngineContract.ReadbackCheckAnswer(emptyList(), "")))
        val check = EngineContract.ReadbackCheckAnswer(
            listOf(
                EngineContract.ReadbackCheckAnswerItemsItem("altimeter", "29.92", null, required = false),
                EngineContract.ReadbackCheckAnswerItemsItem("altitude", "3,000", "4,000", required = true),
            ),
            "",
        )
        assertEquals(listOf("Altitude: 4,000 said, 3,000 given", "Altimeter 29.92 not read back"), AtcWords.readbackLines(check))
    }
}
