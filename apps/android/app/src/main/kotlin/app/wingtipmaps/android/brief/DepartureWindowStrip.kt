package app.wingtipmaps.android.brief

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import java.time.Instant

/**
 * "When should I go?" in the Brief, under the verdict (the web's
 * DepartureWindowStrip): an hour-by-hour strip across as far as the
 * forecasts reach, each hour go, caution, no-go or not known by the
 * Brief's own Go / No-Go for a flight leaving then, its mark a shape of
 * its own and not colour alone, the best window said over it, and a tap
 * on an hour opening why, with its time and fuel.
 */
@Composable
fun DepartureWindowStrip(plan: Plan.State, signedIn: Boolean, model: DepartureWindowModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(plan.dep, plan.dest, plan.stops, plan.aircraft, signedIn) { model.ask(plan, signedIn) }
    if (!plan.routed) return
    val now = Instant.now()
    val answer = state.answer
    val best = answer?.windows?.firstOrNull()
    SectionTitle(best?.let { HourWords.bestLine(it, now) } ?: stringResource(R.string.when_to_go))
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    when {
        !signedIn -> Text(stringResource(R.string.when_to_go_sign_in), color = muted)
        state.problem != null -> ProblemLine(state.problem)
        state.pending -> LinearProgressIndicator(Modifier.fillMaxWidth())
        answer == null -> {}
        answer.hours.isEmpty() -> Text(stringResource(R.string.when_to_go_none), color = muted)
        else -> {
            if (best == null) Text(stringResource(R.string.when_to_go_no_go, HourWords.clock(answer.hours.last().depart)), color = muted)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                answer.hours.forEach { h ->
                    val on = state.picked == h.depart
                    Column(
                        Modifier.width(WingtipSize.TapTarget)
                            .background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium)
                            .then(if (on) Modifier.border(2.dp, MaterialTheme.colorScheme.primary, MaterialTheme.shapes.medium) else Modifier)
                            .selectable(selected = on, role = Role.Button) { model.pick(h.depart) }
                            .semantics { contentDescription = HourWords.hourLabel(h) }
                            .padding(vertical = WingtipSpace.Sm),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
                    ) {
                        Text(HourWords.clock(h.depart).take(2), style = MaterialTheme.typography.labelMedium)
                        FindingIcon(HourWords.finding(h.verdict))
                        if (h.night) Icon(Icons.Filled.DarkMode, contentDescription = null, tint = muted, modifier = Modifier.size(WingtipSpace.Md))
                        else Spacer(Modifier.size(WingtipSpace.Md))
                    }
                }
            }
            answer.hours.firstOrNull { it.depart == state.picked }?.let { h ->
                val finding = HourWords.finding(h.verdict)
                Column(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium).padding(WingtipSpace.Md),
                    verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                        FindingIcon(finding)
                        Text(
                            stringResource(R.string.when_to_go_leaving, HourWords.word(h.verdict), HourWords.clock(h.depart)),
                            fontWeight = FontWeight.Medium, color = LocalInk.current.words(finding, MaterialTheme.colorScheme.onSurface),
                        )
                    }
                    h.reasons.forEach { r -> Text("${r.label} · ${r.detail}", style = MaterialTheme.typography.bodySmall) }
                    HourWords.nightLine(h)?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    Text(HourWords.hourFigures(h, state.airplane), style = MaterialTheme.typography.bodySmall, color = muted)
                }
            }
        }
    }
}
