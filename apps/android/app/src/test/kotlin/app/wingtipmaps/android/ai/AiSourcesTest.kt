package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.generated.VerdictItem
import org.junit.Assert.assertEquals
import org.junit.Test

class AiSourcesTest {
    @Test
    fun theBriefIsItsVerdictAndFindings() {
        val items = listOf(VerdictItem(detail = "Ceiling 2,500 ft at KSQL.", finding = "caution", key = "weather", label = "Weather", tab = "brief"))
        val sources = AiSources.brief("Go, with care", null, items)
        assertEquals(listOf("verdict", "weather"), sources.map { it.id })
        assertEquals("Ceiling 2,500 ft at KSQL.", sources[1].text)
    }

    @Test
    fun notamsKeepTheirWords() {
        assertEquals("!PAO 11/012 PAO RWY 13/31 CLSD", AiSources.notams(listOf("!PAO 11/012 PAO RWY 13/31 CLSD")).single().text)
    }
}
