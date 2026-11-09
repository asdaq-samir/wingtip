package app.wingtipmaps.android.copilot

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.pilot.MinimumsStore
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.LocalInk

/**
 * The in-flight copilot's one message (CopilotModel), in the map's top
 * column under what is ahead: its line in the warning's red, the
 * caution's amber or the text's own ink, a tap opening the why and where
 * each figure comes from (the METAR, 14 CFR, ITWS ...), and OK putting it
 * away. Nothing while the first thing that matters is one the alerts
 * banner already shows.
 */
@Composable
fun CopilotBanner(plan: Plan.State, flying: Boolean, fix: OwnShip.Fix?, ahead: List<AheadAlert>, model: CopilotModel = viewModel()) {
    val context = LocalContext.current
    val setting = remember(context) { CopilotSetting.of(context) }
    val mode by setting.mode.collectAsStateWithLifecycle()
    val passengers by remember(context) { FlightChoices.of(context) }.passengers.collectAsStateWithLifecycle()
    val minimums by remember(context) { MinimumsStore.of(context) }.minimums.collectAsStateWithLifecycle()
    val flight = remember(plan.course, plan.totals, plan.legs, plan.dest, plan.rules, passengers) { CopilotFlight.of(plan, passengers) }
    LaunchedEffect(mode, flying, fix, flight, ahead, minimums) { model.look(mode, flying, fix, flight, ahead, setting, minimums.forCopilot) }
    val message by model.message.collectAsStateWithLifecycle()
    val shown = message?.takeIf { !it.elsewhere && mode != CopilotMode.OFF && flying } ?: return
    var open by rememberSaveable(shown.id) { mutableStateOf(false) }
    val ink = when (shown.level) {
        "warning" -> MaterialTheme.colorScheme.error
        "caution" -> LocalInk.current.cautionInk
        else -> MaterialTheme.colorScheme.onSurface
    }
    Surface(shape = MaterialTheme.shapes.large, tonalElevation = 3.dp, shadowElevation = 2.dp) {
        Row(
            Modifier.fillMaxWidth().animateContentSize().padding(start = WingtipSpace.Md, end = WingtipSpace.Xs, top = WingtipSpace.Xs, bottom = WingtipSpace.Xs)
                .semantics { liveRegion = if (shown.level == "warning") LiveRegionMode.Assertive else LiveRegionMode.Polite },
            verticalAlignment = if (open) Alignment.Top else Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            Icon(
                when (shown.level) { "warning" -> Icons.Filled.Warning; "caution" -> Icons.Filled.Error; else -> Icons.Filled.Info },
                // The level said, not only drawn in its colour.
                contentDescription = stringResource(when (shown.level) { "warning" -> R.string.said_warning; "caution" -> R.string.said_caution; else -> R.string.said_note }),
                tint = ink, modifier = if (open) Modifier.padding(top = WingtipSpace.Md) else Modifier,
            )
            // The line opens to its why: a button that says so, and whether
            // it is open, to TalkBack.
            val state = stringResource(if (open) R.string.said_expanded else R.string.said_collapsed)
            Column(
                Modifier.weight(1f).clickable(role = Role.Button, onClickLabel = stringResource(R.string.said_show_why)) { open = !open }
                    .semantics { stateDescription = state }.padding(vertical = WingtipSpace.Sm),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
            ) {
                Text(shown.title, color = ink, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium, maxLines = if (open) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis)
                if (open) {
                    shown.detail.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
                    shown.sources.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            TextButton(onClick = { model.dismiss(); open = false }) { Text(stringResource(R.string.ok)) }
        }
    }
}
