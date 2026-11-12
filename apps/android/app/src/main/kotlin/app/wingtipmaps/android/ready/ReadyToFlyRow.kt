package app.wingtipmaps.android.ready

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.offline.OfflineStore
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.strip.FindingIcon
import app.wingtipmaps.android.strip.words
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.largeType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Ready to fly, the Brief's first row: the engine's line in its colour,
 * at most three of its actions, each a tap that fixes it in place where
 * the phone can (ReadyFixer), every item it checked folded under a tap
 * with its detail and where its limit comes from, and the next FAA data
 * cycle. The words are the engine's, shown as sent.
 */
@Composable
fun ReadyToFlyRow(plan: Plan, onSetRoute: (() -> Unit)?, model: ReadyToFlyModel = hiltViewModel()) {
    val fixer = rememberReadyFixer(plan, onSetRoute, model)
    ReadyCheck(plan, fixer, model)
    val state by model.state.collectAsStateWithLifecycle()
    var unfolded by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        ProblemLine(state.problem)
        val answer = state.answer ?: return@Column
        ReadyLine(answer)
        answer.actions.forEach { ReadyActionRow(it, fixer, busy = it.fix in state.busy) }
        // The whole list under a tap: what is fine too, and each limit's source.
        val fold = stringResource(if (unfolded) R.string.ready_fewer else R.string.ready_all)
        TextButton(onClick = { unfolded = !unfolded }) {
            Text(fold)
            Icon(if (unfolded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null, modifier = Modifier.padding(start = WingtipSpace.Xs))
        }
        if (unfolded) {
            answer.items.forEach { item ->
                ReadyItemRow(item, if (item.key == "notams") state.notams else emptyList())
                // The NOTAMs kept for the air, shown with no signal: how old.
                if (item.key == "notams") KeptAgeLine(KeptForAir.NOTAMS, state.notamsKeptAtMs)
                // The NOTAMs that matter, in plain words, beside them as sent.
                if (item.key == "notams" && state.notams.isNotEmpty()) {
                    AiWordsRow(AiTask.NOTAMS, key = state.notams.joinToString().hashCode().toString(), sources = { AiSources.notams(state.notams) })
                }
            }
            Text(
                stringResource(R.string.ready_next_cycle, answer.nextCycleIdent, dayWords(answer.nextCycle)),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** The engine's one line, with its finding's glyph and colour. */
@Composable
internal fun ReadyLine(answer: EngineContract.ReadyToFlyAnswer) {
    val finding = BriefModel.finding(answer.finding)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        FindingIcon(finding)
        Text(answer.line, style = MaterialTheme.typography.titleMedium, color = LocalInk.current.words(finding, MaterialTheme.colorScheme.onSurface))
    }
}

/** One action as a Material list row: the finding's glyph at the start,
 *  the engine's line, and at the end a Fix button where the phone can fix
 *  it (ReadyFixer), Material's text button; plain where it cannot. The stock row and button keep 48 dp targets. */
@Composable
internal fun ReadyActionRow(item: EngineContract.ReadyItem, fixer: ReadyFixer, busy: Boolean, before: () -> Unit = {}) {
    val fix = item.fix?.takeIf(fixer::can)
    val run: (() -> Unit)? = fix?.let { f ->
        {
            before()
            fixer.run(f)
        }
    }
    ListItem(
        leadingContent = { FindingIcon(BriefModel.finding(item.finding), Modifier.size(WingtipSpace.Xl)) },
        trailingContent = if (busy || run != null) {
            {
                if (busy) Loading(Modifier.size(WingtipSpace.Lg))
                else if (run != null) TextButton(onClick = run) { Text(stringResource(R.string.fix)) }
            }
        } else {
            null
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth(),
        content = { Text(item.line, maxLines = if (largeType()) 3 else 2, overflow = TextOverflow.Ellipsis) },
    )
}

/** One item checked: its line, the line under it and its source; the
 *  NOTAMs' top ones as sent under theirs. */
@Composable
private fun ReadyItemRow(item: EngineContract.ReadyItem, raw: List<String>) {
    ListItem(
        supportingContent = {
            Column {
                Text(item.detail)
                Text(item.source, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                raw.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
        },
        leadingContent = { FindingIcon(BriefModel.finding(item.finding)) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        content = { Text(item.line) },
    )
}

/** "26 Nov" from the engine's "2026-11-26"; as sent where it is not a day. */
private fun dayWords(day: String): String =
    runCatching { LocalDate.parse(day).format(DateTimeFormatter.ofPattern("d MMM", Locale.US)) }.getOrDefault(day)

/**
 * The facts gathered again whenever one of them may have changed: the
 * plan, the Brief's answer, the charts kept, the receiver heard or not, a
 * fix done, and the app back in front (the battery, a permission given
 * in Settings).
 */
@Composable
internal fun ReadyCheck(plan: Plan, fixer: ReadyFixer, model: ReadyToFlyModel) {
    val context = LocalContext.current
    val state by plan.state.collectAsStateWithLifecycle()
    val brief: BriefModel = hiltViewModel()
    val briefed by brief.state.collectAsStateWithLifecycle()
    val kept by remember { OfflineStore.of(context) }.kept.collectAsStateWithLifecycle()
    val picture by remember { Receiver.of(context) }.picture.collectAsStateWithLifecycle()
    val heard = picture?.receiver?.heartbeatAt != null
    val live = picture?.receiver?.live == true
    var resumed by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { resumed++ }
    LaunchedEffect(state.dep, state.dest, state.stops, state.aircraft, state.course, state.totals, briefed.fetchedAtMs, kept, heard, live, fixer.done, resumed) {
        val local = withContext(Dispatchers.Default) { ReadyDevice.local(context, plan, briefed.fetchedAtMs) }
        model.check(state, ReadyFacts.cruise(state.legs.map { it.altitudeFt }), local)
    }
}
