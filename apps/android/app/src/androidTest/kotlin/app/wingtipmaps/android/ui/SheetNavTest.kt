package app.wingtipmaps.android.ui

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The sheet's stack (SheetNav) on a real NavHost: a card shown from the
 * map or the search takes the place of the cards there, one opened from
 * inside a card goes on top of it, Back steps down one level and ✕
 * closes them all, back to the carousel at the page it was on (the plan
 * is its second page, SheetCarousel, and its ✕ the Search page).
 */
@RunWith(AndroidJUnit4::class)
class SheetNavTest {
    @get:Rule
    val compose = createComposeRule()

    private lateinit var sheet: SheetNav

    private fun host() {
        compose.setContent {
            WingtipTheme {
                sheet = rememberSheetNav(wide = false, airports = viewModel(), onShown = {})
                SheetPagesHost(sheet, backEnabled = true, modifier = Modifier, home = { Text("home") }, plan = { Text("plan") }, card = { Text(it.key) })
            }
        }
        compose.waitForIdle()
    }

    private fun shows(page: SheetPage) = compose.waitUntil(TIMEOUT_MS) { sheet.top == page }

    @Test
    fun aCardShownTakesThePlaceOfTheCardThere() {
        host()
        compose.runOnIdle { sheet.show(SheetPage.Airport("KOSH")) }
        shows(SheetPage.Airport("KOSH"))
        assertTrue(sheet.covered)
        compose.runOnIdle { sheet.show(SheetPage.Airport("KMSN")) }
        shows(SheetPage.Airport("KMSN"))
        compose.runOnIdle { sheet.back() }
        shows(SheetPage.Home)
        assertFalse(sheet.covered)
    }

    @Test
    fun aCardOpenedInsideACardComesBackToIt() {
        host()
        compose.runOnIdle { sheet.show(SheetPage.Settings) }
        shows(SheetPage.Settings)
        compose.runOnIdle { sheet.open(SheetPage.MapSettings) }
        shows(SheetPage.MapSettings)
        compose.runOnIdle { sheet.back() }
        shows(SheetPage.Settings)
        compose.runOnIdle { sheet.back() }
        shows(SheetPage.Home)
    }

    @Test
    fun closeAllGoesBackToThePlanUnderTheCards() {
        host()
        compose.runOnIdle { sheet.show(SheetPage.Plan) }
        shows(SheetPage.Plan)
        compose.runOnIdle { sheet.push(SheetPage.Leg(0)) }
        shows(SheetPage.Leg(0))
        compose.runOnIdle { sheet.push(SheetPage.Airport("KJVL")) }
        shows(SheetPage.Airport("KJVL"))
        assertTrue(sheet.planShown)
        compose.runOnIdle { sheet.closeAll() }
        shows(SheetPage.Plan)
        compose.runOnIdle { sheet.closePlan() }
        shows(SheetPage.Home)
        assertFalse(sheet.planShown)
    }

    @Test
    fun aCardShownOverThePlanKeepsThePlanUnderIt() {
        host()
        compose.runOnIdle { sheet.show(SheetPage.Plan) }
        shows(SheetPage.Plan)
        compose.runOnIdle { sheet.show(SheetPage.Brief) }
        shows(SheetPage.Brief)
        compose.runOnIdle { sheet.show(SheetPage.Nearest) }
        shows(SheetPage.Nearest)
        compose.runOnIdle { sheet.back() }
        shows(SheetPage.Plan)
        assertEquals(SheetPage.Plan, sheet.shown)
    }

    private companion object {
        const val TIMEOUT_MS = 5_000L
    }
}
