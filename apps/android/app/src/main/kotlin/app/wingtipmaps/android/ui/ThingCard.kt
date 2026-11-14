package app.wingtipmaps.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.TrackedFlightCard
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.here.HereCard
import app.wingtipmaps.android.live.SpecialUseRows
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The card of a thing on the map, as the web's map opens one in its
 * sheet (MapCard: AirspaceCardBody, VorCard, FixCard, WaypointCard, a
 * traffic airplane's; a field's is AirportCard, a leg's RouteLegCard):
 * one card over the search with its name and ← where the search was
 * (CardPage), the same from a tap on the map, an alert or a route
 * point's More Info (CardRequests): what it is, the figures a pilot reads
 * off it, each from the tapped feature's own fields or the engine
 * (MapRules), and the card kind's actions (CardActionRow), the same set
 * as the web's.
 *
 * @param onRouted every card closed and the FPL page shown: after an
 *   action that changes the route (Direct To, Add to Route, Hold Here), as
 *   a field's Fly Here shows it (the web's 4ff53c010).
 */
@Composable
fun ThingCard(pick: MapPick, plan: Plan, exit: CardExit, onRouted: () -> Unit) {
    // A tracked flight's card is its own, laid out as the airport card's C1.
    if (pick is MapPick.Plane) {
        TrackedFlightCard(pick.hex, exit)
        return
    }
    val title = when (pick) {
        is MapPick.Airspace -> stringResource(R.string.airspace_class, pick.airspaceClass)
        // A VOR's name with its kind, "OBK VOR/DME" (the web's 8439547dc).
        is MapPick.Vor -> stringResource(R.string.navaid_card_title, pick.ident, pick.kind)
        is MapPick.NavaidAt -> foundVor(pick)?.let { stringResource(R.string.navaid_card_title, it.ident, it.kind) } ?: pick.ident
        is MapPick.Tfr -> stringResource(R.string.tfr_card_title, pick.notamId)
        is MapPick.Point -> pick.ident
        is MapPick.Plane -> pick.hex.uppercase()
        is MapPick.Here -> stringResource(R.string.whats_here)
        // A field's and a leg's cards are their own (SheetPage.of).
        is MapPick.Airport -> pick.ident
        is MapPick.RouteLeg -> stringResource(R.string.route_leg)
        is MapPick.Plate -> pick.ident
    }
    // A VOR's place and frequency under its name, "Northbrook · 113.0".
    val subtitle = when (pick) {
        is MapPick.Vor -> vorLine(pick)
        is MapPick.NavaidAt -> foundVor(pick)?.let(::vorLine)
        else -> null
    }
    // Share sends the card's own link, which opens this card (tfr=, navaid=),
    // a bar action before ✕, Material's place for a card's own actions.
    val context = LocalContext.current
    val link = linkOf(pick)
    val share: @Composable RowScope.() -> Unit = {
        if (link != null) {
            IconButton(onClick = { shareLink(context, title, link) }) { Icon(WingtipIcons.share, contentDescription = stringResource(R.string.share)) }
        }
    }
    val actions = rememberRouteActions(plan)
    // An action that changes the route closes the card onto the FPL page,
    // so the route is seen being planned; Call, Address and Copy leave it open.
    val act: (CardAction, () -> Unit) -> Unit = { action, run ->
        run()
        if (action != CardAction.CALL && action != CardAction.ADDRESS && action != CardAction.COPY) onRouted()
    }
    CardPage(title = title, exit = exit, subtitle = subtitle, actions = share) { padding ->
        // No pull to refresh in a sheet, whose drag down is the sheet's.
        Box(Modifier.padding(padding)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Lg),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
            ) {
                when (pick) {
                    is MapPick.Airspace -> {
                        AirspaceCard(pick)
                        PointActions(CardKind.POINT, pick, actions, act)
                        SpecialUseRows(pick.lat, pick.lon)
                    }
                    // The actions under the name, then the content (the card rule's 13).
                    is MapPick.Vor -> {
                        NavaidActions(pick, dialFrequency(pick.freq), actions, act)
                        VorCard(pick)
                    }
                    is MapPick.NavaidAt -> NavaidAtBody(pick, actions, act)
                    is MapPick.Tfr -> TfrCardBody(pick.notamId)
                    is MapPick.Point -> {
                        PointCard(pick)
                        NavaidActions(pick, null, actions, act)
                    }
                    is MapPick.Plane -> {}
                    is MapPick.Here -> {
                        PointActions(CardKind.POINT, pick, actions, act)
                        HereCard(pick.lat, pick.lon)
                        SpecialUseRows(pick.lat, pick.lon)
                    }
                    is MapPick.Airport, is MapPick.RouteLeg, is MapPick.Plate -> {}
                }
            }
        }
    }
}

@Composable
private fun PointActions(kind: CardKind, pick: MapPick, actions: RouteActions, act: (CardAction, () -> Unit) -> Unit) {
    val point = RouteActions.pointOf(pick) ?: return
    val copy = RouteActions.copyOf(pick)
    CardActionRow(kind, can = { actions.canPoint(it, copy != null) }, onAction = { a -> act(a) { actions.point(a, point, copy) } })
}

/** The card's head under its title: its mark's colour, what it is, and a
 *  line under that. */
@Composable
internal fun Head(colour: Color, kind: String, subtitle: String?) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        Box(Modifier.size(width = WingtipSpace.Sm, height = WingtipSize.Chip).background(colour, MaterialTheme.shapes.extraSmall))
        Column {
            Text(kind, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!subtitle.isNullOrEmpty()) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A row of a card: a name and its value, Material's list item. */
@Composable
internal fun Fact(name: String, value: String, description: Boolean = false) {
    ListItem(
        supportingContent = if (description) ({ Text(value) }) else null,
        trailingContent = if (description) null else ({ Text(value, style = MaterialTheme.typography.bodyLarge) }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(name) },
    )
}

internal fun ink(hex: String) = Color(hex.toColorInt())
