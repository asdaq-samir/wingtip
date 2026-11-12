package app.wingtipmaps.android.copilot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.AlertFixes
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests

/**
 * A copilot message's one fix and what it is about, under its why once it
 * is opened: Fly to the field the engine picked (a new route from where
 * the airplane is, the cards' Fly Here), and More Info on the field it is
 * about. Nothing where the message names no field (an area ahead, the
 * night, the ground speed): its words are the fix.
 */
@Composable
internal fun CopilotFixButtons(message: CopilotMessage, fix: OwnShip.Fix?) {
    val about = AlertFixes.copilot(message)
    if (about.about == null && about.flyTo == null) return
    // The activity's one Plan, as Setup's passenger briefing reads it.
    val plan: Plan = hiltViewModel()
    Row(
        Modifier.fillMaxWidth().padding(start = WingtipSpace.Md, end = WingtipSpace.Xs, bottom = WingtipSpace.Sm),
        horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        val to = about.flyTo
        if (to != null && fix != null) {
            FilledTonalButton(onClick = { plan.flyHere(to, Plan.positionIdent(fix)) }) { Text(stringResource(R.string.copilot_fly_to, to)) }
        }
        about.about?.let { ident ->
            TextButton(onClick = { CardRequests.open(MapPick.Airport(ident)) }) { Text(stringResource(R.string.point_more_info)) }
        }
    }
}
