package app.wingtipmaps.android.design

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace

/** The gap between a group's buttons: half the spacing unit. */
private val ChoiceGap = WingtipSpace.Unit / 2

/**
 * A setting of a few choices (decision 0017: discrete settings are
 * segmented, never sliders), as Material 3 Expressive's connected button
 * group: the buttons side by side with a hairline gap, the outer corners
 * round and the inner ones tight; the choice made fills in the tint and
 * rounds into a pill, and a press draws a button's corners in again,
 * each on the motion scheme's springs. TalkBack reads a radio group, each
 * button a radio button that is selected or not, as Material's segmented
 * buttons are read. The Wingtip theme's colours: the tint for the choice
 * made, the muted container for the rest.
 */
@Composable
fun <T> ChoiceGroup(
    choices: List<Pair<T, String>>,
    selected: T?,
    modifier: Modifier = Modifier,
    onPick: (T) -> Unit,
) {
    Row(modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ChoiceGap)) {
        choices.forEachIndexed { i, (value, label) ->
            ChoiceButton(
                label = label,
                selected = selected == value,
                first = i == 0,
                last = i == choices.lastIndex,
                onClick = { onPick(value) },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ChoiceButton(label: String, selected: Boolean, first: Boolean, last: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val interaction = remember { MutableInteractionSource() }
    val down by interaction.collectIsPressedAsState()
    val scheme = MaterialTheme.colorScheme
    val motion = ExpressiveMotion.current
    // The inner corners: tight at rest, round once chosen, and tight again
    // under the finger.
    val inner = MaterialTheme.shapes.extraSmall
    val round by animateFloatAsState(if (selected && !down) 1f else 0f, motion.fastSpatialSpec(), label = "choiceCorners")
    val shape = MorphShape(connected(inner, first, last), CircleShape, round)
    val fill by animateColorAsState(if (selected) scheme.primary else scheme.surfaceContainerHigh, motion.defaultEffectsSpec(), label = "choiceFill")
    val ink by animateColorAsState(if (selected) scheme.onPrimary else scheme.onSurface, motion.defaultEffectsSpec(), label = "choiceInk")
    Surface(
        selected = selected,
        onClick = onClick,
        modifier = modifier.heightIn(min = WingtipSize.TapTarget).semantics { role = Role.RadioButton },
        shape = shape,
        color = fill,
        contentColor = ink,
        interactionSource = interaction,
    ) {
        Box(Modifier.padding(horizontal = WingtipSpace.Md), contentAlignment = Alignment.Center) {
            val type = MaterialTheme.typography
            Text(label, style = if (selected) type.labelLargeEmphasized else type.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A button's resting shape in the group: round at the group's ends,
 *  `inner` where it meets its neighbours. */
private fun connected(inner: CornerBasedShape, first: Boolean, last: Boolean): CornerBasedShape {
    val full = CornerSize(PILL_PERCENT)
    return inner.copy(
        topStart = if (first) full else inner.topStart,
        bottomStart = if (first) full else inner.bottomStart,
        topEnd = if (last) full else inner.topEnd,
        bottomEnd = if (last) full else inner.bottomEnd,
    )
}

/** A corner that is half the side: a pill's end. */
private const val PILL_PERCENT = 50
