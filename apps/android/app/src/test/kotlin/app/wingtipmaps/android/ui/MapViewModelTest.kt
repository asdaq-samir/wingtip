package app.wingtipmaps.android.ui

import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The map screen's back stack (MapViewModel), the stack Navigation 3 draws:
 * a card shown takes the place of the cards there, one pushed goes on top
 * and Back comes back to it, a page already on the stack is gone back to
 * rather than opened twice, Home is never popped, and the stack comes
 * back from its saved state as it was.
 */
class MapViewModelTest {
    private val handle = SavedStateHandle()
    private val model = MapViewModel(handle)

    @Test
    fun startsAtHome() {
        assertEquals(listOf<SheetPage>(SheetPage.Home), model.stack.toList())
    }

    @Test
    fun aCardShownTakesThePlaceOfTheCardsThere() {
        model.show(SheetPage.Settings)
        model.push(SheetPage.MapSettings)
        model.show(SheetPage.Airport("KOSH"))
        assertEquals(listOf(SheetPage.Home, SheetPage.Airport("KOSH")), model.stack.toList())
    }

    @Test
    fun aCardPushedComesBackToTheOneUnderIt() {
        model.show(SheetPage.Settings)
        model.push(SheetPage.MapSettings)
        assertEquals(SheetPage.MapSettings, model.top)
        model.back()
        assertEquals(SheetPage.Settings, model.top)
        model.back()
        model.back()
        assertEquals(listOf<SheetPage>(SheetPage.Home), model.stack.toList())
    }

    @Test
    fun aPageAlreadyOnTheStackIsGoneBackTo() {
        model.show(SheetPage.Settings)
        model.push(SheetPage.Logbook)
        model.push(SheetPage.Coach)
        model.push(SheetPage.Settings)
        assertEquals(listOf(SheetPage.Home, SheetPage.Settings), model.stack.toList())
    }

    @Test
    fun homeAndThePlanCloseEveryCard() {
        model.show(SheetPage.Brief)
        model.push(SheetPage.Plan)
        assertEquals(listOf<SheetPage>(SheetPage.Home), model.stack.toList())
        model.show(SheetPage.Nearest)
        model.closeAll()
        assertEquals(listOf<SheetPage>(SheetPage.Home), model.stack.toList())
    }

    @Test
    fun theStackComesBackFromItsSavedState() {
        model.show(SheetPage.Airport("KPAO"))
        model.push(SheetPage.Leg(2))
        assertEquals(model.stack.toList(), MapViewModel(handle).stack.toList())
    }

    @Test
    fun aSavedStackStartsAtHomeWhateverWasKept() {
        val kept = MapViewModel.restored(listOf(SheetPage.Plan.key, SheetPage.Brief.key, SheetPage.Brief.key, "not a page"))
        assertEquals(listOf(SheetPage.Home, SheetPage.Brief), kept)
    }
}
