package app.wingtipmaps.android.altitude

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SheetPage

/**
 * The plan's altitude, where the menu was: the Profile row, which opens
 * the route's side view and its slider (ProfileCard), then the Altitude
 * Advisor's rows for the cruise. A row picked is flown -- a legal one at
 * each leg's nearest where the leg may not fly it, as its figures were
 * worked out (the planner's `altitude_nearest`), any other as the pilot's
 * own, warned of -- and the route planned again, felt as a wheel's step.
 */
@Composable
fun PlanAltitudeSection(plan: Plan, state: Plan.State, modifier: Modifier = Modifier) {
    val altitudes by PlanAltitudes.state.collectAsStateWithLifecycle()
    val haptics = rememberHaptics()
    val flown = ProfileModel.flown(state, altitudes)
    val rows = remember(altitudes.line, flown) { AltitudeEngine.advisor(altitudes.line, flown) }
    Column(modifier) {
        if (state.routed) {
            ListItem(
                onClick = { CardRequests.open(SheetPage.Profile) },
                supportingContent = { Text(stringResource(R.string.profile_row, Format.cruiseAltitude(flown))) },
                modifier = Modifier.testTag("plan-profile"),
            ) { Text(stringResource(R.string.profile_card)) }
        }
        rows.fold(
            { found ->
                if (state.routed && found.isNotEmpty() && altitudes.line != null) {
                    AltitudeAdvisor(found, onPick = { row ->
                        if (row.flown) return@AltitudeAdvisor
                        haptics.tap(WingtipHaptic.ALTITUDE)
                        PlanAltitudes.nearest(row.legal)
                        plan.setAltitude(row.altitudeFt)
                    })
                }
            },
            { why -> ProblemLine(why.message) },
        )
    }
}
