package app.wingtipmaps.android.ai

import org.junit.Assert.assertEquals
import org.junit.Test

class FigureGuardTest {
    private val metar = "KPAO 091753Z 31012G18KT 10SM FEW040 18/06 A3002"

    // A report's packed groups (31012G18KT) are not read for figures: the
    // planner's decoded METAR is given beside it, as the screens give it.
    private val decoded = "Wind 310° at 12 kt, gusts 18 kt. Few at 4,000 ft."

    @Test
    fun keepsSentencesWhoseFiguresAreTheSources() {
        val kept = FigureGuard.keep("The wind is from 310 at 12 knots, gusting 18. Few clouds at 4000 feet.", listOf(metar, decoded))
        assertEquals("The wind is from 310 at 12 knots, gusting 18. Few clouds at 4000 feet.", kept.text)
        assertEquals(0, kept.dropped)
    }

    @Test
    fun dropsASentenceWithAFigureOfTheModelsOwn() {
        // A crosswind the model worked out is not the engine's.
        val kept = FigureGuard.keep("The wind is from 310 at 12 knots. That is a 7 knot crosswind on runway 31.", listOf(metar, decoded))
        assertEquals("The wind is from 310 at 12 knots.", kept.text)
        assertEquals(1, kept.dropped)
    }

    @Test
    fun readsNumbersOneWay() {
        assertEquals(setOf("1200", "118.6"), FigureGuard.numbers("1,200 ft on 118.600"))
    }

    @Test
    fun wordsWithNoFiguresStay() {
        assertEquals(0, FigureGuard.keep("Check the NOTAMs before you go.", emptyList()).dropped)
    }

    @Test
    fun aPackedGroupGivesNoFigure() {
        // 310 is inside 31012G18KT, but only the decoded wind says so.
        assertEquals(1, FigureGuard.keep("The wind is from 310.", listOf(metar)).dropped)
    }
}
