package app.wingtipmaps.android

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.route.LegWords
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.GlanceAction
import app.wingtipmaps.android.strip.StripHead
import app.wingtipmaps.android.strip.StripRow
import app.wingtipmaps.android.strip.Verdict
import app.wingtipmaps.android.strip.Way
import app.wingtipmaps.android.strip.stripList
import app.wingtipmaps.android.ui.Figure
import app.wingtipmaps.android.ui.WingtipTheme
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The strip's screens under Google's Accessibility Test Framework, as
 * TalkBack meets them: every control labelled, with its role and a
 * touch target of 48 dp, the checkpoints read a row at a time in words,
 * and the figures read whole at twice the default type. Instrumented, so
 * CI runs it on its emulator (docs/NATIVE-ANDROID.md).
 */
@RunWith(AndroidJUnit4::class)
class AccessibilityChecksTest {
    @get:Rule
    val compose = createComposeRule()

    @Before
    fun checks() {
        compose.enableAccessibilityChecks()
    }

    private fun leg(from: String, to: String, mh: Double?, ete: Double?) = Leg(
        altitudeFt = 4500.0, distanceNm = 24.0, from = from, magneticCourseDeg = 312.0, magneticVariationDeg = -3.0,
        to = to, trueCourseDeg = 309.0, magneticHeadingDeg = mh, eteMin = ete,
    )

    @Test
    fun theVerdictCardIsReadAndOpensTheBrief() {
        compose.setContent {
            WingtipTheme {
                StripHead(
                    verdict = Verdict(Finding.CAUTION, "Caution"),
                    line = "C81 → KJVL → KDLH",
                    actions = listOf(GlanceAction("wind", Finding.CAUTION, "Crosswind 14 kt at KDLH")),
                    ways = listOf(Way("a", "Direct"), Way("b", "Airways")),
                    wayKey = "a", onWay = {}, onAction = {}, onBrief = {},
                )
            }
        }
        compose.onRoot().tryPerformAccessibilityChecks()
        compose.onNodeWithContentDescription("Caution: Crosswind 14 kt at KDLH").assertIsDisplayed()
        // The card's action is named Brief, its words the verdict's.
        val card = compose.onNode(SemanticsMatcher("its click is named Brief") { it.config.getOrNull(SemanticsActions.OnClick)?.label == "Brief" })
        card.assertIsDisplayed()
    }

    @Test
    fun eachCheckpointIsOneRowInWords() {
        val checkpoint = StripRow.Checkpoint(1, "Lake Bemidji", leg("C81", "Lake Bemidji", 318.0, 18.0), 18.0)
        val rows = listOf(StripRow.Departure("C81"), checkpoint, StripRow.Destination("KDLH", leg("Lake Bemidji", "KDLH", 320.0, 30.0), 48.0))
        compose.setContent {
            WingtipTheme {
                LazyColumn {
                    stripList(
                        rows = rows, cards = emptyMap(), leaveMs = 0L, departDetail = emptyList(), arriveDetail = emptyList(),
                        unfolded = true, onUnfold = {}, onField = {}, onCheckpoint = {},
                    )
                }
            }
        }
        compose.onRoot().tryPerformAccessibilityChecks()
        compose.onNodeWithContentDescription(LegWords.checkpoint(1, "Lake Bemidji", checkpoint.leg)).assertIsDisplayed()
    }

    @Test
    fun aFigureIsReadWholeAtTwiceTheType() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                WingtipTheme {
                    Row {
                        Figure("DIST", "102.4 nm", said = "Distance, one hundred two point four nautical miles")
                        Figure("ETE", "1h 5m", said = "Time En Route, one hour five minutes")
                    }
                }
            }
        }
        compose.onRoot().tryPerformAccessibilityChecks()
        compose.onNodeWithContentDescription("Distance, one hundred two point four nautical miles").assertIsDisplayed()
        // One node for the figure, its written name and figure cleared under it.
        val time = SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Time En Route, one hour five minutes"))
        assertEquals(1, compose.onAllNodes(time).fetchSemanticsNodes().size)
    }
}
