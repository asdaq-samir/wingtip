package app.wingtipmaps.android.logbook

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.ProfileOpen
import app.wingtipmaps.android.coach.CoachScreen
import app.wingtipmaps.android.design.Skeleton
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.documents.AddFromPhotoRow
import app.wingtipmaps.android.documents.LogbookPhotoSheet
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * The pilot's logbook, at its least (LogbookModel): what the currency
 * says, then each entry, newest first, its date over its route, hours
 * and landings. Entries are added from a recorded flight ("Flight
 * Logged"), from a photo of a paper page (Add from a Photo), or on the
 * web. Its Coach row opens the pilot's proficiency plan (CoachScreen).
 */
@Composable
fun LogbookScreen(model: LogbookModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var photo by remember { mutableStateOf(false) }
    var coach by rememberSaveable { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg)) {
        item {
            if (state.loading) Skeleton(rows = 4)
            ProblemLine(state.problem)
            // The pilot's proficiency plan, a row of the logbook it is
            // made from, as the web's Logbook has it.
            ListItem(
                headlineContent = { Text(stringResource(R.string.coach), color = MaterialTheme.colorScheme.primary) },
                supportingContent = { Text(stringResource(R.string.coach_line), color = MaterialTheme.colorScheme.onSurfaceVariant) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { coach = true },
            )
            if (state.currency.isNotEmpty()) SectionTitle(stringResource(R.string.currency))
        }
        items(state.currency) { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = WingtipSpace.Xs)) }
        item {
            SectionTitle(stringResource(R.string.logbook_entries))
            AddFromPhotoRow(stringResource(R.string.photo_line_logbook)) { photo = true }
            if (!state.loading && state.entries.isEmpty() && state.problem == null) {
                Text(stringResource(R.string.logbook_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        items(state.entries, key = { it.id }) { e ->
            ListItem(
                overlineContent = { Text(e.flownOn) },
                headlineContent = { Text(LogbookModel.line(e)) },
                // The airplane's N-number, a tap to its profile.
                supportingContent = e.aircraft?.let { { Text(it, color = MaterialTheme.colorScheme.primary) } },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = e.aircraft?.let { tail -> Modifier.clickable(role = Role.Button) { ProfileOpen.open(tail) } } ?: Modifier,
            )
        }
    }
    if (photo) LogbookPhotoSheet(onClose = { photo = false })
    if (coach) {
        WingtipSheet(title = stringResource(R.string.coach), onClose = { coach = false }, full = true) { CoachScreen() }
    }
}
