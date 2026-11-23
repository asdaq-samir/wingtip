package app.wingtipmaps.android.ui.sheet

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt

/**
 * A card's content with something floating at the foot of the part of it
 * in sight (an airport card's tabs, C1): the map's sheet is as tall as the
 * window at every detent and slides down to rest at half, so the card's
 * own foot is below the window there, and a bar put at it would be out of
 * sight. The foot is lifted by as much of the card as is below the window
 * (the navigation bar's inset counted as below), read from where the card
 * is laid out, so it rides the sheet's drag and comes to rest over the
 * window's foot at half and at the card's foot at full height; in a
 * tablet's pane, all in sight, it sits at the card's foot.
 *
 * @param foot what floats, given the modifier that places it.
 */
@Composable
fun InSightFoot(modifier: Modifier, foot: @Composable (Modifier) -> Unit, content: @Composable BoxScope.() -> Unit) {
    val windowFoot = LocalWindowInfo.current.containerSize.height - WindowInsets.navigationBars.getBottom(LocalDensity.current)
    var below by remember { mutableIntStateOf(0) }
    Box(
        modifier.onGloballyPositioned { card ->
            below = ((card.positionInWindow().y + card.size.height).roundToInt() - windowFoot).coerceAtLeast(0)
        },
    ) {
        content()
        // Read as it is placed, so a drag moves it without composing again.
        foot(Modifier.align(Alignment.BottomCenter).offset { IntOffset(0, -below) })
    }
}
