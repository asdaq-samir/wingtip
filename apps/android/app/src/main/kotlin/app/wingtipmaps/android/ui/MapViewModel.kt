package app.wingtipmaps.android.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.api.AssistantSource
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/**
 * The map screen's state (RootScreen), an androidx ViewModel so it
 * outlives a rotation or a fold and comes back after the system has
 * stopped the app: the sheet's back stack, which Navigation 3's NavDisplay
 * draws (SheetPagesHost), the source an answer cites shown over the map,
 * and the strip layout's ask to raise its panel.
 *
 * The stack is Home at its foot and the cards and pages over it (the card
 * rule, the owner, 2026-11-10): one shown from the map, the search or a
 * link takes the place of those there ([show]); one opened from inside a
 * card goes on top of it ([push]), and Back steps down to it ([back]).
 * Home and the plan are the carousel's pages under the cards, so neither
 * is ever on the stack above Home.
 */
@HiltViewModel
class MapViewModel @Inject constructor(private val saved: SavedStateHandle) : ViewModel() {
    /** The sheet's back stack, Home first and the page shown last. */
    val stack: SnapshotStateList<SheetPage> = mutableStateListOf<SheetPage>().apply { addAll(restored(saved.get<ArrayList<String>>(STACK))) }

    /** The page on the stack's top: a card, or Home under none. */
    val top: SheetPage get() = stack.last()

    /** The source an answer cites, shown over the map, or none. */
    var source by mutableStateOf<AssistantSource?>(null)

    /** Counted up each time the strip layout's panel is asked to rise. */
    var raised by mutableIntStateOf(0)
        private set

    fun raise() {
        raised++
    }

    /** `page` shown from the map, the search or a link: the cards there
     *  closed first, so it is the one card; Home or the plan, every card
     *  closed. */
    fun show(page: SheetPage) {
        closeAll()
        if (page.covers) stack.add(page)
        save()
    }

    /** `page` opened from inside a card, on top of it, so Back comes back
     *  to it. A page already on the stack is gone back to rather than
     *  opened twice, as each entry of a NavDisplay is kept by its one key. */
    fun push(page: SheetPage) {
        if (!page.covers) return show(page)
        val at = stack.indexOf(page)
        if (at >= 0) stack.removeRange(at + 1, stack.size) else stack.add(page)
        save()
    }

    /** Back one level: the card on top closed. */
    fun back() {
        if (stack.size > 1) stack.removeAt(stack.lastIndex)
        save()
    }

    /** Every card and page closed, back to Home. */
    fun closeAll() {
        if (stack.size > 1) stack.removeRange(1, stack.size)
        save()
    }

    // The stack by its pages' keys (SheetPage.key), the saveable strings
    // a SavedStateHandle keeps through the process's end.
    private fun save() {
        saved[STACK] = ArrayList(stack.map { it.key })
    }

    internal companion object {
        private const val STACK = "sheet.stack"

        /** The stack kept, Home first whatever was saved. */
        fun restored(keys: List<String>?): List<SheetPage> =
            listOf(SheetPage.Home) + keys.orEmpty().map(SheetPage::of).filter { it.covers }.distinct()
    }
}
