package app.wingtipmaps.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.net.toUri
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberPressShape

/**
 * A card's actions, one name and one glyph each on every card and every
 * app (the web's lib/cardActions.ts ACTION, docs/design/icons.md):
 *
 * - Fly Here: a new route from the airplane to this field.
 * - Direct To: from the airplane to the point, then on along the route.
 * - Add Stop: the field a landing on the way, as Maps' Add Stop.
 * - Add to Route: the point a turn on the way, where it bends the route
 *   least; not a landing.
 * - Hold Here: a hold at the point (AIM 5-3-8).
 */
enum class CardAction(@StringRes val label: Int, val icon: ImageVector) {
    FLY_HERE(R.string.action_fly_here, WingtipIcons.flyHere),
    DIRECT_TO(R.string.action_direct_to, WingtipIcons.directTo),
    ADD_STOP(R.string.action_add_stop, WingtipIcons.addToRoute),
    ADD_TO_ROUTE(R.string.action_add_to_route, WingtipIcons.addToRoute),
    HOLD_HERE(R.string.action_hold_here, WingtipIcons.holdHere),
    CALL(R.string.action_call, WingtipIcons.call),
    ADDRESS(R.string.action_address, WingtipIcons.address),
    COPY(R.string.action_copy, WingtipIcons.copy),
}

/** Each kind of card's actions, in order (the web's CARD_ACTIONS); the
 *  first is the filled one. */
enum class CardKind(val actions: List<CardAction>) {
    AIRPORT(listOf(CardAction.FLY_HERE, CardAction.ADD_STOP, CardAction.CALL, CardAction.ADDRESS)),

    /** A point on the map: the airspace card's. */
    POINT(listOf(CardAction.DIRECT_TO, CardAction.ADD_TO_ROUTE, CardAction.HOLD_HERE)),

    /** A VOR, a fix or a VFR waypoint. */
    NAVAID(listOf(CardAction.DIRECT_TO, CardAction.ADD_TO_ROUTE, CardAction.COPY)),
}

/**
 * A card's row of actions, as Maps lays a place's out: a tile each, its
 * glyph over its word, the first filled in the tint and the rest tonal.
 * An action this card cannot do now -- Direct To with no position, Add to
 * Route with no route, Call with no telephone -- is left out, as the web
 * leaves its tile out, rather than shown dead.
 */
@Composable
fun CardActionRow(kind: CardKind, can: (CardAction) -> Boolean, onAction: (CardAction) -> Unit, modifier: Modifier = Modifier) {
    val shown = kind.actions.filter(can)
    if (shown.isEmpty()) return
    Row(modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        shown.forEach { action ->
            val content: @Composable () -> Unit = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(action.icon, contentDescription = null)
                    Text(stringResource(action.label), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            val pad = PaddingValues(horizontal = WingtipSpace.Xs, vertical = WingtipSpace.Sm)
            // A tile's corners draw in under the finger (Material 3
            // Expressive's shape morph) and spring back as it lifts.
            val touch = remember { MutableInteractionSource() }
            val shape = rememberPressShape(touch, rest = MaterialTheme.shapes.medium, pressed = MaterialTheme.shapes.extraSmall)
            if (action == kind.actions.first()) {
                Button(onClick = { onAction(action) }, modifier = Modifier.weight(1f), shape = shape, contentPadding = pad, interactionSource = touch) { content() }
            } else {
                FilledTonalButton(onClick = { onAction(action) }, modifier = Modifier.weight(1f), shape = shape, contentPadding = pad, interactionSource = touch) { content() }
            }
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
