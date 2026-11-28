package app.wingtipmaps.android.airplane

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.CardAction
import app.wingtipmaps.android.design.generated.CardKind
import app.wingtipmaps.android.ui.CardButtonGroup
import app.wingtipmaps.android.ui.GroupAction

/**
 * An airplane card's four actions (the owner's design of 2026-11-26, on
 * the phones since 2026-11-27: "Yes, match the web"; the web's
 * AirplaneCard Actions), its row its state's kind of design/card-actions.json:
 * in the air Track (the map keeps it in sight), on the ground Fly This;
 * then Alerts (as it takes off and lands), Favorite and Figures, its
 * planning figures on a page of their own. Always the four, in their
 * places, one greyed where it does nothing for this airplane, never
 * hidden (the owner, 2026-11-27: "Keep four buttons on top, just disable
 * the one when needed"). Pure but for the row itself, for a unit test.
 */
object AirplaneRow {
    /** What the card knows of it for its buttons. */
    data class Can(
        /** Heard in the air now: Track in Fly This's place. */
        val airborne: Boolean,
        /** Heard now, so the map has a place to keep in sight. */
        val trackable: Boolean,
        /** An airplane the planner can fly (flyable). */
        val flyable: Boolean,
        /** The one the plan flies already. */
        val flying: Boolean,
        /** Its ICAO address, which its alerts go by. */
        val hex: String?,
        /** Something to keep it by in the Favorites. */
        val keepable: Boolean,
    )

    fun kind(airborne: Boolean): CardKind = if (airborne) CardKind.AIRPLANE_AIRBORNE else CardKind.AIRPLANE

    /** Whether a button does something for this airplane now. */
    fun enabled(action: CardAction, can: Can): Boolean = when (action) {
        CardAction.TRACK -> can.trackable
        CardAction.FLY_THIS -> can.flyable && !can.flying
        CardAction.ALERTS -> can.hex != null
        CardAction.FAVORITE -> can.keepable
        CardAction.FIGURES -> can.flyable
        else -> false
    }

    /**
     * An airplane the planner can fly, as the web's `flyable`: one with an
     * N-number whose registered type the planner has a book for (the
     * engine's registered_profile), or the pilot's own, or the one flown.
     * No type is assumed for the rest (the owner, 2026-11-09).
     */
    fun flyable(tail: String?, stockProfile: String?, owned: Boolean, flying: Boolean): Boolean =
        !tail.isNullOrBlank() && (stockProfile != null || owned || flying)
}

/** The row's state as each button shows it. */
data class AirplaneRowState(val following: Boolean, val alerting: Boolean, val starred: Boolean)

/** The four buttons, from the generated table, each wired here. */
@Composable
fun AirplaneActionRow(
    can: AirplaneRow.Can,
    shown: AirplaneRowState,
    onTrack: (Boolean) -> Unit,
    onFly: () -> Unit,
    onAlerts: () -> Unit,
    onFavorite: () -> Unit,
    onFigures: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val kind = AirplaneRow.kind(can.airborne)
    val items = kind.actions.map { action ->
        val first = action == kind.actions.first()
        val on = AirplaneRow.enabled(action, can)
        when (action) {
            CardAction.TRACK -> GroupAction(stringResource(action.label), action.icon, filled = first, enabled = on, checked = shown.following) {
                onTrack(!shown.following)
            }
            CardAction.FLY_THIS -> GroupAction(
                stringResource(if (can.flying) R.string.flying_this else action.label), action.icon, filled = first, enabled = on, onClick = onFly,
            )
            CardAction.ALERTS -> GroupAction(
                stringResource(action.label), if (shown.alerting) Icons.Filled.Notifications else action.icon, enabled = on, checked = shown.alerting, onClick = onAlerts,
            )
            CardAction.FAVORITE -> GroupAction(
                stringResource(action.label), if (shown.starred) Icons.Filled.Star else action.icon, enabled = on, checked = shown.starred, onClick = onFavorite,
            )
            else -> GroupAction(stringResource(action.label), action.icon, enabled = on, onClick = onFigures)
        }
    }
    CardButtonGroup(items, modifier)
}
