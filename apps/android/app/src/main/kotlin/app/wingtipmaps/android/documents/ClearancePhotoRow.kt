package app.wingtipmaps.android.documents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/** The clearance card's "From a Photo" row (ClearancePhotoModel): the
 *  scanner, "Reading the page…", then the note as written and as said
 *  in a sheet, with Use It and Cancel. */
@Composable
fun ClearancePhotoRow(onUse: (String) -> Unit, model: ClearancePhotoModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scan = rememberPageScanner(onPage = { model.read(context, it) }, onProblem = model::problem)
    if (!state.reading) AddFromPhotoRow(stringResource(R.string.clearance_photo_line), title = stringResource(R.string.from_a_photo), onOpen = scan)
    if (state.reading) ReadingLine()
    ProblemLine(state.problem)
    state.shown?.let { read ->
        WingtipSheet(title = stringResource(R.string.clearance), onClose = model::close) {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl),
                verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm),
            ) {
                ReadNotes(read)
                val note = read.clearance
                if (note != null) {
                    SectionTitle(stringResource(R.string.as_written))
                    SelectionContainer { Text(note.written, fontFamily = FontFamily.Monospace) }
                    SectionTitle(stringResource(R.string.as_said))
                    SelectionContainer { Text(note.said) }
                } else if (read.unreadable == null) {
                    Text(stringResource(R.string.no_clearance_read), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    OutlinedButton(onClick = model::close) { Text(stringResource(R.string.cancel)) }
                    Button(onClick = { state.said?.let(onUse); model.close() }, enabled = state.said != null) { Text(stringResource(R.string.use_it)) }
                }
            }
        }
    }
}
