package app.wingtipmaps.android.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.window.core.layout.WindowSizeClass
import app.wingtipmaps.android.design.generated.WingtipSize

/**
 * How a wide window shares itself between the panel, the map and a card
 * (WidePanes), the iPad's SplitLayout and SplitRoom on Android's terms.
 *
 * - Medium width (600 to 840 dp, an upright small tablet, a foldable
 *   open in portrait, split screen at half): one panel at the start, a
 *   card taking the panel's place, as Material's list-detail scene lays
 *   out one pane.
 * - Expanded and wider (840 dp and up, Material's window size classes):
 *   the panel at the start, the map across the middle, and a thing's card
 *   in a supporting pane at the end, as Material's supporting-pane layout
 *   and the iPad's inspector hold it, so the card opens beside the map
 *   rather than over the panel.
 * - Where the window is too narrow for the panel, a card and the least
 *   map worth the name side by side (three panels' widths: an 8-inch
 *   tablet's 1,024 dp on its side, a book-posture foldable), the panel
 *   gives way while a card is up and comes back with its close; the one
 *   search asked for (Ctrl+F, the microphone) brings it back at once.
 */
internal object PaneRoom {
    /** Whether the window takes a card in a pane of its own at its end. */
    fun supportingPane(width: Dp): Boolean = width >= WindowSizeClass.WIDTH_DP_EXPANDED_LOWER_BOUND.dp

    /** Whether the panel, a card and the map fit side by side: the map
     *  keeps a panel's width between them (the iPad's least map, an
     *  iPhone's width; an Android phone's is 360 to 412 dp). */
    fun cardBesidePanel(width: Dp): Boolean = width >= WingtipSize.Panel * 3

    /** The pages the panel draws: Home and every page opened by name. */
    fun panelStack(stack: List<SheetPage>): List<SheetPage> = stack.filterNot { it.inspects }

    /** The things' cards the supporting pane draws, the first at its foot. */
    fun cardStack(stack: List<SheetPage>): List<SheetPage> = stack.filter { it.inspects }

    /** Whether the panel shows: always unless a card is up in a window
     *  without the room for both, and then once the search is asked for
     *  over that card (`askedOver`). */
    fun panelShown(top: SheetPage, width: Dp, askedOver: SheetPage?): Boolean = !top.inspects || cardBesidePanel(width) || askedOver == top
}

/**
 * Whether the page is a thing's card, which a wide window opens in the
 * supporting pane beside the map, as the iPad's inspector holds a field's
 * card and the airspace over a point (RootLayout.inspects) and Maps a
 * place: a field, an airplane, a fix, a VOR, an airspace, traffic or
 * What's Here, a leg of the route, a plate. The pages opened by name --
 * the Brief, the Nav Log, Nearest, You, Settings, Emergency -- stay in the
 * panel, where the iPad's sidebar keeps them.
 */
internal val SheetPage.inspects: Boolean
    get() = this is SheetPage.Airport || this is SheetPage.Airplane || this is SheetPage.Thing || this is SheetPage.Leg || this is SheetPage.Plate
