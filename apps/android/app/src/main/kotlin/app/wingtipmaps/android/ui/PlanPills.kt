package app.wingtipmaps.android.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Icon
import androidx.compose.material3.SplitButtonDefaults
import androidx.compose.material3.SplitButtonLayout
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.altitude.PlanAltitudes
import app.wingtipmaps.android.altitude.ProfileModel
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.DepartTime
import app.wingtipmaps.android.plan.FlightChoices

/**
 * The plan's pills under its "Flight Plan" title, as the web's FPL head
 * has them under its title (FplBar, the owner, 2026-11-19 to 21): the
 * airplane, its ⓘ the airplane's card; the cruise altitude, its end the
 * Profile; and when the flight leaves, one button showing the time that
 * opens the hours and the minutes. Each is Material's split button --
 * the pill's word the leading button, its glyph the trailing one, two
 * targets of their own -- in a row that scrolls sideways on a narrow
 * phone rather than squeezing a pill (the owner's larger text). With no
 * airplane the pill says so and is the way to pick one (decision 0011).
 *
 * @param onAltitude the plan scrolled to the Altitude Advisor, where the
 *   cruise is picked.
 */
@Composable
fun PlanPills(plan: Plan, state: Plan.State, onAltitude: () -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val altitudes by PlanAltitudes.state.collectAsStateWithLifecycle()
    val airplane = tail ?: state.own?.type?.ifEmpty { null }?.uppercase() ?: state.aircraft.uppercase().ifEmpty { null }
    Row(
        modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        val info = stringResource(R.string.airplane_info)
        Pill(
            word = airplane ?: stringResource(R.string.no_airplane),
            onWord = { ScreenRequests.ask(Screen.AIRPLANE) },
            glyph = { Icon(WingtipIcons.info, contentDescription = null, Modifier.size(SplitButtonDefaults.TrailingIconSize)) },
            glyphSaid = info,
            onGlyph = { if (tail != null) ProfileOpen.open(tail) else ScreenRequests.ask(Screen.AIRPLANE) },
        )
        val profile = stringResource(R.string.profile_card)
        Pill(
            word = Format.cruiseAltitude(ProfileModel.flown(state, altitudes)),
            onWord = onAltitude,
            enabled = state.routed,
            glyph = { Icon(WingtipIcons.profile, contentDescription = null, Modifier.size(SplitButtonDefaults.TrailingIconSize)) },
            glyphSaid = profile,
            onGlyph = { CardRequests.open(SheetPage.Profile) },
        )
        DepartPill(plan, state)
    }
}

/** One pill: Material's split button, outlined, its word the leading
 *  button and its glyph the trailing one, named for TalkBack. */
@Composable
private fun Pill(word: String, onWord: () -> Unit, glyph: @Composable () -> Unit, glyphSaid: String, onGlyph: () -> Unit, enabled: Boolean = true) {
    SplitButtonLayout(
        leadingButton = {
            SplitButtonDefaults.OutlinedLeadingButton(onClick = onWord, enabled = enabled) { Text(word, maxLines = 1) }
        },
        trailingButton = {
            // The trailing half is a toggle in the stock part, made for a
            // menu; here it is a plain tap, never left checked.
            SplitButtonDefaults.OutlinedTrailingButton(
                checked = false,
                onCheckedChange = { onGlyph() },
                enabled = enabled,
                modifier = Modifier.semantics { contentDescription = glyphSaid },
            ) { glyph() }
        },
    )
}

/**
 * When the flight leaves, one button showing the time ("Now" till one is
 * picked, then the clock, "15:00") that opens Material's time picker in
 * its dialog, the hours and the minutes (the web's time-button, the
 * owner, 2026-11-21; on Android the clock dial, the platform's own):
 * Set plans the route for the next time the clock reads it (DepartTime),
 * Now goes back to the planner's now. The winds, the night and every
 * time down the route are then the planner's for it.
 */
@Composable
private fun DepartPill(plan: Plan, state: Plan.State) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val departMs = Plan.departMs(state.depart)
    val now = stringResource(R.string.depart_now)
    TextButtonPill(
        word = departMs?.let { Format.clock(it) } ?: now,
        said = stringResource(R.string.depart_said, departMs?.let { Format.clock(it) } ?: now),
        onClick = { picking = true },
    )
    if (!picking) return
    val (hour, minute) = DepartTime.hourMinute(departMs, AppClock.nowMs())
    TimeDialog(
        title = stringResource(R.string.depart_title),
        hour = hour,
        minute = minute,
        onSet = { h, m ->
            picking = false
            plan.setDepart(DepartTime.next(h, m, AppClock.nowMs()))
        },
        onDismiss = { picking = false },
        onNow = {
            picking = false
            plan.setDepart(null)
        },
    )
}

/** The time's pill: Material's outlined split button's leading half alone
 *  would leave a half-rounded shape, so it is the stock outlined button. */
@Composable
private fun TextButtonPill(word: String, said: String, onClick: () -> Unit) {
    androidx.compose.material3.OutlinedButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = said }) {
        Icon(WingtipIcons.time, contentDescription = null, Modifier.size(SplitButtonDefaults.TrailingIconSize))
        Text(word, Modifier.padding(start = WingtipSpace.Xs), maxLines = 1)
    }
}
