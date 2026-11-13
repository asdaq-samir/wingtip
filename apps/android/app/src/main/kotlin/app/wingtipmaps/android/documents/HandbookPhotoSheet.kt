package app.wingtipmaps.android.documents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.aircraft.AircraftFormFields
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The airplane's "Add from a Photo" sheet: which page (Performance or
 * Weight & Balance, a choice of two as segmented buttons), Scan the Page,
 * then each item the engine made of it to confirm, then the airplane's
 * figures from the confirmed ones to change and Save, in the same
 * "Your Airplane" form as Your Airplanes. The registration the pilot gave
 * and `type` (the planner's airplane picked) start the form, which no
 * page gives.
 */
@Composable
fun HandbookPhotoSheet(type: String, onClose: () -> Unit, model: HandbookPhotoModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val scan = rememberPageScanner(onPage = { model.read(context, it) }, onProblem = model::problem)
    WingtipSheet(title = stringResource(R.string.add_from_photo), onClose = { model.clear(); onClose() }, full = true) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
            verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
        ) {
            val answer = state.answer
            val kept = state.kept
            when {
                kept != null -> AirplaneFiguresForm(state, model)
                answer != null -> {
                    ReadNotes(answer)
                    val items = answer.handbookCheck?.items.orEmpty()
                    if (items.isNotEmpty()) Text(stringResource(R.string.photo_review_line), style = MaterialTheme.typography.bodyMedium)
                    items.forEach { item ->
                        ConfirmRow(title = item.title, checked = item.key in state.confirmed, enabled = true, onToggle = { model.toggle(item.key) }) {
                            item.figures.forEach { f ->
                                Text("${f.label}: ${HandbookReview.figure(f)}", style = MaterialTheme.typography.bodyMedium)
                            }
                            FlagLines(item.flags)
                        }
                    }
                    ProblemLine(state.problem)
                    Button(onClick = { model.useConfirmed(tail, type) }, enabled = state.confirmed.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.use_confirmed))
                    }
                    TextButton(onClick = scan) { Text(stringResource(R.string.scan_again)) }
                }
                else -> {
                    PageKindRow(state.page, model::pick)
                    Text(stringResource(R.string.photo_airplane_line), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (state.reading) ReadingLine()
                    ProblemLine(state.problem)
                    Button(onClick = scan, enabled = !state.reading, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.scan_page)) }
                }
            }
        }
    }
}

/** Performance or Weight & Balance: what the page is, for the reader. */
@Composable
private fun PageKindRow(page: Documents.Kind, onPick: (Documents.Kind) -> Unit) {
    val kinds = listOf(Documents.Kind.PERFORMANCE to R.string.photo_performance, Documents.Kind.WEIGHT_BALANCE to R.string.photo_weight_balance)
    ChoiceGroup(kinds.map { (kind, words) -> kind to stringResource(words) }, selected = page, onPick = onPick)
}

/** The airplane's figures from the confirmed items, for the pilot to
 *  change before Save; saved with the handbook figures kept. */
@Composable
private fun AirplaneFiguresForm(state: HandbookPhotoModel.State, model: HandbookPhotoModel) {
    val f = state.form
    SectionTitle(stringResource(R.string.your_airplane))
    state.kept?.profile?.cruiseFrom?.let { from ->
        state.answer?.handbookCheck?.items?.firstOrNull { it.key == from }?.let {
            Text(stringResource(R.string.cruise_from_row, it.title), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    AircraftFormFields(f, state.problems, onChange = model::edit)
    ProblemLine(state.problem)
    if (state.saved) Text(stringResource(R.string.airplane_saved), style = MaterialTheme.typography.bodyMedium)
    Button(
        onClick = model::save,
        enabled = !state.saving && !state.saved,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.save_airplane)) }
    TextButton(onClick = model::review) { Text(stringResource(R.string.back_to_items)) }
}
