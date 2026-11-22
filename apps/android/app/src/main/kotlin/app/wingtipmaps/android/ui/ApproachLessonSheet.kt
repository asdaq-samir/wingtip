package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.plan.ApproachLesson
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * An approach briefed and flown dry, the iPhone's ApproachLessonSheet on
 * Android: the app's one modal sheet (WingtipSheet), Material's segmented
 * buttons at its head picking Brief or Dry Run (the web's lesson's Brief
 * and Fly). The brief is the engine's items, each its title over its
 * lines; the dry run one step at a time, its fix and altitude, what to do
 * and why, Back and Next under it, at the ground speed picked in a second
 * segmented row. "Training aid, fly the FAA plate" says it is not the plate.
 */
@Composable
fun ApproachLessonSheet(pick: PlanProcedures.Pick, dryRun: Boolean, onClose: () -> Unit) {
    val lesson = remember(pick.key) { ApproachLesson() }
    LaunchedEffect(pick.key) { lesson.load(pick) }
    val state by lesson.state.collectAsStateWithLifecycle()
    var flying by rememberSaveable(pick.key) { mutableStateOf(dryRun) }
    WingtipSheet(title = state.name ?: pick.name, onClose = onClose) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.lesson_training_aid), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf(false to R.string.lesson_brief, true to R.string.wording_dry_run).forEachIndexed { i, (page, words) ->
                    SegmentedButton(selected = flying == page, onClick = { flying = page }, shape = SegmentedButtonDefaults.itemShape(index = i, count = 2)) {
                        Text(stringResource(words))
                    }
                }
            }
            when {
                state.loading -> CircularProgressIndicator()
                state.problem != null -> ProblemLine(state.problem.orEmpty())
                flying -> DryRunPage(state, lesson)
                else -> state.brief.forEach { item ->
                    Column {
                        Text(item.title, style = MaterialTheme.typography.titleSmall)
                        item.lines.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
        }
    }
}

@Composable
private fun DryRunPage(state: ApproachLesson.State, lesson: ApproachLesson) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        ApproachLesson.SPEEDS.forEachIndexed { i, kt ->
            SegmentedButton(
                selected = state.gsKt == kt,
                onClick = { lesson.pickSpeed(kt) },
                shape = SegmentedButtonDefaults.itemShape(index = i, count = ApproachLesson.SPEEDS.size),
            ) { Text(stringResource(R.string.speed_kt, kt.toInt())) }
        }
    }
    val step = state.steps.getOrNull(state.step) ?: return
    Text(stringResource(R.string.lesson_step, state.step + 1, state.steps.size), style = MaterialTheme.typography.labelMedium)
    Text(step.title, style = MaterialTheme.typography.titleMedium)
    step.altitudeFt?.let { Text(Format.altitude(it), style = MaterialTheme.typography.bodyMedium) }
    Text(step.say, style = MaterialTheme.typography.bodyLarge)
    step.why?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = lesson::back, enabled = state.step > 0) { Text(stringResource(R.string.back)) }
        OutlinedButton(onClick = lesson::next, enabled = state.step < state.steps.size - 1) { Text(stringResource(R.string.lesson_next)) }
    }
}
