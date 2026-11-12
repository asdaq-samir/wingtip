package app.wingtipmaps.android.brief

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.LoadingRow
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
 * Brief's own Go / No-Go for a flight leaving then, each hour Material's
 * filter chip with its mark a shape of its own and not colour alone, the
 * best window said over it, and the hour picked opening why, with its
 * time and fuel.
 */
@Composable
fun DepartureWindowStrip(plan: Plan.State, signedIn: Boolean, model: DepartureWindowModel = hiltViewModel()) {
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
        state.pending -> LoadingRow()
        answer == null -> {}
        answer.hours.isEmpty() -> Text(stringResource(R.string.when_to_go_none), color = muted)
        else -> {
            if (best == null) Text(stringResource(R.string.when_to_go_no_go, HourWords.clock(answer.hours.last().depart)), color = muted)
            // Material's filter chips, one an hour, single-select: the
            // hour, its verdict's own shape (FindingIcon), and a moon at
            // night; TalkBack reads each a radio button with its why.
            LazyRow(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                items(answer.hours, key = { it.depart }) { h ->
                    val label = HourWords.hourLabel(h)
                    FilterChip(
                        selected = state.picked == h.depart,
                        onClick = { model.pick(h.depart) },
                        label = { Text(HourWords.clock(h.depart).take(2)) },
                        leadingIcon = { FindingIcon(HourWords.finding(h.verdict), Modifier.size(FilterChipDefaults.IconSize)) },
                        trailingIcon = if (h.night) {
                            { Icon(Icons.Filled.DarkMode, contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) }
                        } else {
                            null
                        },
                        modifier = Modifier.semantics {
                            role = Role.RadioButton
                            contentDescription = label
                        },
                    )
                }
            }
            answer.hours.firstOrNull { it.depart == state.picked }?.let { h ->
                val finding = HourWords.finding(h.verdict)
                // The hour's why, in Material's card, as the Brief's other
                // glance blocks sit.
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
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
}
