package app.wingtipmaps.android.ai

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.AssistantSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AiWordsModelTest {
    @get:Rule
    val main = MainRule()

    private val metar = listOf(AssistantSource("metar", "KPAO METAR", "KPAO 091753Z 31012KT 10SM CLR 18/06 A3002"))

    @Test
    fun wordsComeOnlyOnTheTapAndGoWithTheirSources() {
        var asked = 0
        val model = AiWordsModel(say = { _, _ -> asked++; AiWords.Answer("Clear skies.", 0, metar) }, offered = { true })
        assertTrue(model.state.value.offered)
        assertEquals(0, asked)
        model.sourcesAre("a")
        model.ask(AiTask.AIRPORT_WEATHER, metar)
        assertEquals("Clear skies.", model.state.value.answer?.text)
        model.sourcesAre("b")
        assertNull(model.state.value.answer)
    }

    @Test
    fun noWordsIsSaidNotGuessed() {
        val model = AiWordsModel(say = { _, _ -> null }, offered = { false })
        assertFalse(model.state.value.offered)
        model.ask(AiTask.BRIEF, metar)
        assertEquals(AiWordsModel.NONE, model.state.value.problem)
    }
}
