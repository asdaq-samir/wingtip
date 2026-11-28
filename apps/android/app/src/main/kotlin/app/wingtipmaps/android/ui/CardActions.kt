package app.wingtipmaps.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ButtonGroup
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.net.toUri
import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.CardKind
import app.wingtipmaps.android.design.generated.WingtipSpace

// Each kind of card's actions, in order, with each one's label and glyph,
// are design/card-actions.json's, generated into design/generated
// (CardAction, CardKind) as into the web's CARD_ACTIONS; this file keeps
// how a row is drawn and what leaves the app.

/**
 * A card's actions in Material 3 Expressive's button group, the first
 * filled in the tint and the rest tonal (CardButtonGroup).
 * An action this card cannot do now -- Direct To with no position, Add to
 * Route with no route, Call with no telephone -- is left out, as the web
 * leaves its tile out, rather than shown dead.
 */
@Composable
fun CardActionRow(kind: CardKind, can: (CardAction) -> Boolean, onAction: (CardAction) -> Unit, modifier: Modifier = Modifier) {
    val shown = kind.actions.filter(can)
    if (shown.isEmpty()) return
    val words = shown.associateWith { stringResource(it.label) }
    val items = shown.map { action -> GroupAction(words.getValue(action), action.icon, filled = action == kind.actions.first()) { onAction(action) } }
    CardButtonGroup(items, modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm))
}

/** One button of a card's group: its word, its glyph where it has one,
 *  whether it is the card's one filled action, whether it can be done
 *  now, whether it is a toggle and on (`checked`; the Favorite tile), and
 *  what it does. */
class GroupAction(
    val label: String,
    val icon: ImageVector?,
    val filled: Boolean = false,
    val enabled: Boolean = true,
    val checked: Boolean? = null,
    val onClick: () -> Unit,
)

/**
 * A card's row of actions as Material's button group: each a labelled
 * button (the labels stay: Google's research found that taking the words
 * off actions made them harder to use), the filled one first so it is
 * always in the same place and reached without looking, and whatever does
 * not fit the width in the group's own overflow menu rather than squeezed
 * smaller. A pressed button widens and its neighbours make room, and its
 * corners morph, the group's and the buttons' stock motion.
 */
@Composable
fun CardButtonGroup(items: List<GroupAction>, modifier: Modifier = Modifier) {
    if (items.isEmpty()) return
    val sources = remember(items.size) { List(items.size) { MutableInteractionSource() } }
    ButtonGroup(
        overflowIndicator = { menu -> ButtonGroupDefaults.OverflowIndicator(menuState = menu) },
        // The group itself is measured at its content's width, never
        // stretched: Material 1.5's ButtonGroup measures its overflow menu
        // with the group's own minimum width, so a group made to fill a row
        // too narrow for its buttons (a 320-dp phone) throws as it lays out.
        // The caller's modifier still gives the row; the group sits at its start.
        modifier = modifier.wrapContentWidth(Alignment.Start),
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        items.forEachIndexed { i, item ->
            customItem(
                buttonGroupContent = {
                    val source = sources[i]
                    val content: @Composable RowScope.() -> Unit = {
                        item.icon?.let {
                            Icon(it, contentDescription = null, modifier = Modifier.size(ButtonDefaults.IconSize))
                            Spacer(Modifier.size(ButtonDefaults.IconSpacing))
                        }
                        Text(item.label, maxLines = 1, softWrap = false, overflow = TextOverflow.Visible)
                    }
                    val pad = ButtonDefaults.ButtonWithIconContentPadding
                    val press = Modifier.animateWidth(source, compressionLimit = pad.calculateEndPadding(LocalLayoutDirection.current))
                    if (item.checked != null) {
                        // A toggle, Material 3 Expressive's ToggleButton:
                        // its own checked colours and shape morph.
                        ToggleButton(checked = item.checked, onCheckedChange = { item.onClick() }, enabled = item.enabled, contentPadding = pad, interactionSource = source, modifier = press, content = content)
                    } else if (item.filled) {
                        Button(onClick = item.onClick, enabled = item.enabled, shapes = ButtonDefaults.shapes(), contentPadding = pad, interactionSource = source, modifier = press, content = content)
                    } else {
                        FilledTonalButton(onClick = item.onClick, enabled = item.enabled, shapes = ButtonDefaults.shapes(), contentPadding = pad, interactionSource = source, modifier = press, content = content)
                    }
                },
                menuContent = { menu ->
                    DropdownMenuItem(
                        text = { Text(item.label) },
                        leadingIcon = item.icon?.let { { Icon(it, contentDescription = null) } },
                        enabled = item.enabled,
                        onClick = {
                            menu.dismiss()
                            item.onClick()
                        },
                    )
                },
            )
        }
    }
}

/** The actions that leave the app: the telephone, the maps app, the
 *  clipboard. */
object CardIntents {
    fun call(context: Context, phone: String) {
        context.startActivity(Intent(Intent.ACTION_DIAL, ("tel:" + phone.filter { it.isDigit() || it == '+' }).toUri()))
    }

    /** The place in the phone's maps app, by its address where it has
     *  one, at its position either way. */
    fun address(context: Context, lat: Double, lon: Double, label: String) {
        val uri = ("geo:$lat,$lon?q=" + Uri.encode("$lat,$lon($label)")).toUri()
        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
    }

    fun copy(context: Context, label: String, text: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText(label, text))
    }
}
