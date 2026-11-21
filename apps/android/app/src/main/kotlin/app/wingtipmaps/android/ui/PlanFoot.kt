package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.plan.PlanFiling
import app.wingtipmaps.android.route.PlanMore
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.StripCard

/**
 * What stays at the plan's foot while the route scrolls under it, as the
 * web's FPL foot holds it (the owner, 2026-11-21: "they would go to
 * bottom and stay there while the rest slides under it"): the actions'
 * bar over the figure strip. The bar is Material 3 Expressive's floating
 * toolbar -- Brief, Nav Log and More (Route Options, Share Link), each
 * labelled, since Google's research found actions harder to use with
 * their words taken off -- and File beside it, Material's filled tonal
 * button, there whether or not the plan can be filed and greyed until it
 * can (PlanFiling.fileable), as the iPhone's File is greyed until the nav
 * log is in: the toolbar's floating action button it was has no disabled
 * state, so it hid File and the bar moved over as it came. What the Brief found to act on is counted on
 * its glyph's corner, Material's badge, red where one is a stop and amber
 * where all are cautions, as the web's FplTabBar counts it (BriefModel's
 * findings, the Go / No-Go asked here as the strip asks it). In the air
 * the bar goes and the figures stay, counting down (FiguresStrip).
 */
@Composable
fun PlanFoot(
    plan: Plan,
    onBrief: () -> Unit,
    onNavLog: () -> Unit,
    onRouteOptions: () -> Unit,
    onFile: () -> Unit,
    flight: FlightModel = hiltViewModel(),
    brief: BriefModel = hiltViewModel(),
) {
    val state by plan.state.collectAsStateWithLifecycle()
    val underway by flight.underway.collectAsStateWithLifecycle()
    val briefed by brief.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.totals, state.planning) { brief.brief(state) }
    val found = briefed.found
    Column(
        Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
    ) {
        if (!underway) {
            val actions: @Composable RowScope.() -> Unit = {
                val said = if (found.isEmpty()) null else pluralStringResource(R.plurals.brief_findings, found.size, found.size)
                TextButton(onClick = onBrief, enabled = state.routed, modifier = if (said == null) Modifier else Modifier.semantics { contentDescription = said }) {
                    BadgedBox(badge = { if (found.isNotEmpty()) BriefCount(found) }) { Icon(WingtipIcons.brief, contentDescription = null) }
                    Text(stringResource(R.string.brief), Modifier.padding(start = WingtipSpace.Sm))
                }
                TextButton(onClick = onNavLog, enabled = state.course != null) {
                    Icon(WingtipIcons.navLog, contentDescription = null)
                    Text(stringResource(R.string.nav_log), Modifier.padding(start = WingtipSpace.Sm))
                }
                PlanMore(state, onRouteOptions)
            }
            // File beside the bar, a separate button (the web's File, "a
            // separate button next to tabs", the owner, 2026-11-21), greyed
            // where the plan cannot be filed yet.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                HorizontalFloatingToolbar(expanded = true, content = actions)
                val file = stringResource(R.string.file_flight_plan)
                FilledTonalButton(onClick = onFile, enabled = PlanFiling.fileable(state), modifier = Modifier.semantics { contentDescription = file }) {
                    Icon(WingtipIcons.file, contentDescription = null)
                    Text(stringResource(R.string.file_short), Modifier.padding(start = WingtipSpace.Sm))
                }
            }
        }
        if (state.routed) {
            StripCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(vertical = WingtipSpace.Sm)) { FiguresStrip(state, flight) } }
        }
    }
}

/** The Brief's count on its glyph: red with a stop among the findings,
 *  amber where all are cautions (the web's TabCount, one colour a meaning). */
@Composable
private fun BriefCount(found: List<Finding>) {
    val stop = Finding.STOP in found
    val ink = LocalInk.current
    Badge(
        containerColor = if (stop) MaterialTheme.colorScheme.error else ink.cautionInk,
        contentColor = if (stop) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.surface,
    ) { Text(found.size.toString()) }
}
