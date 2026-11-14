package app.wingtipmaps.android.ui.card

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.design.generated.WingtipSpace
import kotlin.math.roundToInt

/** One page of a card under its floating bar: its name, the words a hint
 *  adds for TalkBack ("Weather, MVFR", "Charts, 9"), what leads it (the
 *  field's category dot) and a count after it. */
data class CardTab(
    val title: String,
    val hint: String? = null,
    val count: Int? = null,
    val lead: (@Composable () -> Unit)? = null,
)

/**
 * How much of a card's frame lies below the window: the map's sheet lays
 * a card out at its full height whatever size it rests at, so at half the
 * frame's foot is under the screen's edge. Read from the frame's place in
 * the window each time it moves (a drag, the sheet's spring), so the bar
 * rides the foot of the part in sight, as the web's bar is held there by
 * the Drawer's own offset. Only the bar's placement reads it.
 */
@Stable
class CardFoot internal constructor(private val visibleBottomPx: Float) {
    var hiddenPx by mutableFloatStateOf(0f)
        private set

    /** On the card's frame: where its foot is against the window's. */
    fun frame(modifier: Modifier = Modifier): Modifier = modifier.onGloballyPositioned { c ->
        hiddenPx = (c.positionInWindow().y + c.size.height - visibleBottomPx).coerceAtLeast(0f)
    }
}

@Composable
fun rememberCardFoot(): CardFoot {
    val window = LocalWindowInfo.current.containerSize.height
    val nav = WindowInsets.navigationBars.getBottom(LocalDensity.current)
    return remember(window, nav) { CardFoot((window - nav).toFloat()) }
}

/** The room a card's list leaves at its end, so its last row clears the bar. */
val CardTabBarRoom = 88.dp

/**
 * A card's pages as tabs in a bar floating at the card's foot, the page
 * scrolling under it (the airport card's C1, the owner, 2026-11-14: "Can
 * tabs be similar to that floating buttons group at the bottom?", and the
 * airplane cards since). Android's own: Material 3 Expressive's floating
 * toolbar holding a toggle button a page, the page shown checked in the
 * theme's tint, as a Pixel app's floating toolbar; not the web's glass.
 * Held at the foot of the part of the card in sight at every size
 * ([CardFoot]); TalkBack reads each a tab, selected or not, with its hint.
 * Put it in a Box over the card's list, at its BottomCenter.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun CardTabBar(tabs: List<CardTab>, picked: Int, onPick: (Int) -> Unit, foot: CardFoot, modifier: Modifier = Modifier, enabled: Boolean = true, tag: String = "card-tab-bar") {
    HorizontalFloatingToolbar(
        expanded = true,
        modifier = modifier
            .offset { IntOffset(0, -foot.hiddenPx.roundToInt()) }
            .padding(bottom = WingtipSpace.Md)
            .testTag(tag),
    ) {
        Row(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xxs), verticalAlignment = Alignment.CenterVertically) {
            tabs.forEachIndexed { i, tab ->
                val said = tab.hint?.let { "${tab.title}, $it" } ?: tab.title
                ToggleButton(
                    checked = i == picked,
                    onCheckedChange = { onPick(i) },
                    enabled = enabled,
                    contentPadding = TabPadding,
                    modifier = Modifier.testTag("$tag-$i").semantics {
                        role = Role.Tab
                        contentDescription = said
                    },
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                        tab.lead?.invoke()
                        Text(tab.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        tab.count?.let { Text(it.toString(), style = MaterialTheme.typography.labelMedium) }
                    }
                }
            }
        }
    }
}

private val TabPadding = PaddingValues(horizontal = WingtipSpace.Md)
