package app.wingtipmaps.android.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.R
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.map.NavaidFind

// The navaid card's own parts, the web's NavaidCards and PointCardActions
// (the owner's iPhone, 2026-11-14, OBK's card): its name in the bar with
// its kind ("OBK VOR/DME") and its place and frequency under it
// ("Northbrook · 113.0"), Share sending its own link, and the full row of
// actions on every point's card.

/** A VOR's frequency as a radio's dial shows it, "113.0" where NASR files
 *  "113" (NAV_BASE FREQ, MHz); as filed where it is not a number. */
internal fun dialFrequency(freq: String?): String? = freq?.toDoubleOrNull()?.let(Format::frequency) ?: freq

/** The bar's line under a VOR's name: its place and its frequency. */
internal fun vorLine(vor: MapPick.Vor): String? =
    listOfNotNull(vor.name?.let(app.wingtipmaps.android.engine.MapRules::placeName), dialFrequency(vor.freq)).joinToString(" · ").ifEmpty { null }

/** Shares a card's own link through the system's sheet. */
internal fun shareLink(context: Context, title: String, link: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, link)
    }
    context.startActivity(Intent.createChooser(send, title))
}

/** The link a thing's card shares, which opens the same card: a VOR's
 *  ident and place, a TFR's NOTAM number; none for the rest. */
internal fun linkOf(pick: MapPick): String? = when (pick) {
    is MapPick.Vor -> Links.navaidLink(pick.ident, pick.lat, pick.lon)
    is MapPick.NavaidAt -> Links.navaidLink(pick.ident, pick.lat, pick.lon)
    is MapPick.Tfr -> Links.tfrLink(pick.notamId)
    else -> null
}

/**
 * A VOR's, a fix's or a VFR waypoint's actions, the same full row on each
 * (the owner's iPhone, 2026-11-14: one half-width tile on OBK's): Direct
 * To, filled, and Add to Route, there but greyed while they cannot be done
 * (no position, no route), and a VOR's frequency to copy, its word
 * "Copied" in place once it is. No Favorite: the Favorites hold airports
 * and airplanes only.
 */
@Composable
internal fun NavaidActions(point: MapPick, freq: String?, actions: RouteActions, act: (CardAction, () -> Unit) -> Unit) {
    val chart = RouteActions.pointOf(point) ?: return
    val context = LocalContext.current
    var copied by rememberSaveable(point) { mutableStateOf(false) }
    val items = buildList {
        for (action in listOf(CardAction.DIRECT_TO, CardAction.ADD_TO_ROUTE)) {
            add(
                GroupAction(stringResource(action.label), action.icon, filled = action == CardAction.DIRECT_TO, enabled = actions.canPoint(action, false)) {
                    act(action) { actions.point(action, chart, null) }
                },
            )
        }
        if (freq != null) {
            add(
                GroupAction(if (copied) stringResource(R.string.frequency_copied) else freq, if (copied) Icons.Filled.Check else CardAction.COPY.icon) {
                    CardIntents.copy(context, context.getString(R.string.navaid_card_copy, freq), freq)
                    copied = true
                },
            )
        }
    }
    CardButtonGroup(items, Modifier.fillMaxWidth())
}

/** A VOR a link asked for, while the map finds it in the tiles, then its
 *  card; or, not there, said in place (the web's link to a VOR not in the
 *  cycle's data). */
@Composable
internal fun NavaidAtBody(at: MapPick.NavaidAt, actions: RouteActions, act: (CardAction, () -> Unit) -> Unit) {
    val found by NavaidFind.found.collectAsStateWithLifecycle()
    when (val f = found?.takeIf { it.first == at }?.second) {
        is NavaidFind.Found.Station -> {
            NavaidActions(f.vor, dialFrequency(f.vor.freq), actions, act)
            VorCard(f.vor)
        }
        NavaidFind.Found.Missing -> Text(stringResource(R.string.navaid_card_missing, at.ident))
        // Asked again (the card opened anew after the app was put away).
        null -> {
            LaunchedEffect(at) { NavaidFind.find(at) }
            Text(stringResource(R.string.navaid_card_looking, at.ident))
        }
        NavaidFind.Found.Looking -> Text(stringResource(R.string.navaid_card_looking, at.ident))
    }
}

/** The VOR a link's card has found, for its bar's title and line. */
@Composable
internal fun foundVor(at: MapPick.NavaidAt): MapPick.Vor? {
    val found by NavaidFind.found.collectAsStateWithLifecycle()
    return (found?.takeIf { it.first == at }?.second as? NavaidFind.Found.Station)?.vor
}
