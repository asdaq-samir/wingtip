package app.wingtipmaps.android.design

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.design.generated.WingtipSize

/**
 * A setting of a few choices (decision 0017: discrete settings are
 * segmented, never sliders), as Material 3 Expressive's connected button
 * group, Google's own parts laid out as its single-choice sample does:
 * ToggleButtons side by side at the group's gap, each with the group's
 * leading, middle or trailing shapes, so the outer corners are round, the
 * inner ones tight, the choice made rounds into a pill and a press draws
 * the corners in, on the theme's expressive springs. TalkBack reads a
 * radio group, each button a radio button that is selected or not. The
 * Wingtip theme's colours: the tint for the choice made (Material's
 * default), the muted container for the rest; the choice made in the
 * emphasized label role. In the Native look (LocalNative) the buttons are
 * as Material ships them: its own colours, label and 40-point height, the
 * 48-point touch target Material's own (minimumInteractiveComponentSize).
 */
@Composable
fun <T> ChoiceGroup(
    choices: List<Pair<T, String>>,
    selected: T?,
    modifier: Modifier = Modifier,
    onPick: (T) -> Unit,
) {
    val native = LocalNative.current
    val scheme = MaterialTheme.colorScheme
    val colors =
        if (native) ToggleButtonDefaults.colors() else ToggleButtonDefaults.colors(containerColor = scheme.surfaceContainerHigh, contentColor = scheme.onSurface)
    Row(
        modifier.fillMaxWidth().selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween),
    ) {
        choices.forEachIndexed { i, (value, label) ->
            val checked = selected == value
            ToggleButton(
                checked = checked,
                onCheckedChange = { onPick(value) },
                modifier = Modifier.weight(1f).then(if (native) Modifier else Modifier.heightIn(min = WingtipSize.TapTarget)).semantics { role = Role.RadioButton },
                shapes = when (i) {
                    0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
                    choices.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
                    else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
                },
                colors = colors,
            ) {
                if (native) {
                    Text(label)
                    return@ToggleButton
                }
                val type = MaterialTheme.typography
                // Two lines where a choice's name is long for its share of
                // the row (Setup's four looks), never cut short.
                Text(
                    label,
                    style = if (checked) type.labelLargeEmphasized else type.labelLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
