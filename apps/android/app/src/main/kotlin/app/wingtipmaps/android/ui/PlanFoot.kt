package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.route.PlanMore
import app.wingtipmaps.android.strip.StripCard

/**
 * What stays at the plan's foot while the route scrolls under it, as the
 * web's FPL foot holds it (the owner, 2026-11-21: "they would go to
 * bottom and stay there while the rest slides under it"): the actions'
 * bar over the figure strip. The bar is Material 3 Expressive's floating
 * toolbar -- Brief, Nav Log and More (Route Options, Share Link), each
 * labelled, since Google's research found actions harder to use with
 * their words taken off. In the air the bar goes and the figures stay,
 * counting down (FiguresStrip).
 */
@Composable
fun PlanFoot(
    plan: Plan,
    onBrief: () -> Unit,
    onNavLog: () -> Unit,
    onRouteOptions: () -> Unit,
    flight: FlightModel = hiltViewModel(),
) {
    val state by plan.state.collectAsStateWithLifecycle()
    val underway by flight.underway.collectAsStateWithLifecycle()
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        if (!underway) {
            val actions: @Composable RowScope.() -> Unit = {
                TextButton(onClick = onBrief, enabled = state.routed) {
                    Icon(WingtipIcons.brief, contentDescription = null)
                    Text(stringResource(R.string.brief), Modifier.padding(start = WingtipSpace.Sm))
                }
                TextButton(onClick = onNavLog, enabled = state.course != null) {
                    Icon(WingtipIcons.navLog, contentDescription = null)
                    Text(stringResource(R.string.nav_log), Modifier.padding(start = WingtipSpace.Sm))
                }
                PlanMore(state, onRouteOptions)
            }
            HorizontalFloatingToolbar(expanded = true, content = actions)
        }
        if (state.routed) {
            StripCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(vertical = WingtipSpace.Sm)) { FiguresStrip(state, flight) } }
        }
    }
}
