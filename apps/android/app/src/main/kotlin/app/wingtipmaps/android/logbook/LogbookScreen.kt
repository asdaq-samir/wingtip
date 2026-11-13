package app.wingtipmaps.android.logbook

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.LoadingRow
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.documents.AddFromPhotoRow
import app.wingtipmaps.android.documents.LogbookPhotoSheet
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * The pilot's logbook (LogbookModel), Material's way: a page over the
 * search (CardPage), ← and a large flexible bar with the totals under the
 * title that collapses as the list scrolls, what the currency says in a card at the top (the gateway's
 * words; nothing is worked out here), the Coach, then each entry, newest
 * first, under a sticky month header (LogbookEntryRow), each edited in its
 * row and deleted with Material's Snackbar offering its Undo. Add Flight, the extended
 * button at the foot, opens a line's fields to log one by hand, and
 * shrinks to its icon while the list scrolls; a flight is also added from
 * a recorded track ("Flight Logged") or a photo of a paper page.
 *
 * @param onCoach the Coach opened on the page's own stack, so Back comes
 *   back to the Logbook, as Settings' pages come back to Settings.
 */
@Composable
fun LogbookScreen(exit: CardExit, onCoach: () -> Unit, model: LogbookModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var photo by remember { mutableStateOf(false) }
    // The Coach asked for by its name (OpenScreen), once the Logbook is open.
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted) { if (ScreenRequests.take(setOf(Screen.COACH)) != null) onCoach() }
    // A save felt once it reached the server, not on coming back to a
    // logbook whose last save is already counted.
    val haptics = rememberHaptics()
    var felt by remember { mutableIntStateOf(state.saved) }
    LaunchedEffect(state.saved) {
        if (state.saved > felt) haptics.tap(SAVED)
        felt = state.saved
    }
    val list = rememberLazyListState()
    val atTop by remember { derivedStateOf { list.firstVisibleItemIndex == 0 } }
    val snackbars = remember { SnackbarHostState() }
    DeletedSnackbar(state.removed, snackbars, model)
    CardPage(
        title = stringResource(R.string.logbook),
        exit = exit,
        subtitle = state.entries.takeIf { it.isNotEmpty() }?.let { LogbookModel.totals(it) },
        snackbarHost = { SnackbarHost(snackbars) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                text = { Text(stringResource(R.string.logbook_add_flight)) },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                onClick = model::openAdd,
                expanded = atTop,
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), state = list, contentPadding = PaddingValues(bottom = WingtipSpace.Xl * 3)) {
            item(key = "head") { LogbookHead(state, onCoach = onCoach, onPhoto = { photo = true }) }
            entries(state, model)
        }
    }
    if (photo) LogbookPhotoSheet(onClose = { photo = false })
    if (state.adding) LogbookAddSheet(state, model)
}

/** The list's head: what the currency says in a card, the Coach, then
 *  Entries with Add from a Photo, or why there are none. */
@Composable
private fun LogbookHead(state: LogbookModel.State, onCoach: () -> Unit, onPhoto: () -> Unit) {
    Column(Modifier.padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        if (state.loading) LoadingRow()
        ProblemLine(state.problem)
        if (state.currency.isNotEmpty()) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
                    Text(stringResource(R.string.currency), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
                    state.currency.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
        // The pilot's proficiency plan, a row of the logbook it is made
        // from, as the web's Logbook has it.
        ListItem(
            onClick = onCoach,
            supportingContent = { Text(stringResource(R.string.coach_line)) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(stringResource(R.string.coach), color = MaterialTheme.colorScheme.primary) },
        )
        SectionTitle(stringResource(R.string.logbook_entries))
        AddFromPhotoRow(stringResource(R.string.photo_line_logbook), onOpen = onPhoto)
        if (!state.loading && state.entries.isEmpty() && state.problem == null) {
            Text(stringResource(R.string.logbook_empty), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** The entries under a sticky header per month, each edited in its row. */
private fun LazyListScope.entries(state: LogbookModel.State, model: LogbookModel) {
    var month: String? = null
    state.entries.forEachIndexed { i, e ->
        val m = LogbookModel.monthOf(e)
        if (m != month) {
            month = m
            stickyHeader(key = "month-$m") { MonthHeader(m) }
        }
        item(key = e.id) { Column(Modifier.padding(horizontal = WingtipSpace.Lg)) { LogbookEntryRow(e, state, model) } }
    }
}

/** A month's header, solid so the rows scroll under it: "November 2026". */
@Composable
private fun MonthHeader(month: String) {
    // The app's locale as Compose observes it, so a change of language redraws it.
    val locale = LocalLocale.current.platformLocale
    val words = try {
        YearMonth.parse(month).format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))
    } catch (e: DateTimeParseException) {
        month
    }
    Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceContainerLow) {
        Text(
            words, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm).semantics { heading() },
        )
    }
}

/** "Deleted 2026-11-09 KMSN KJVL · Undo": Material's Snackbar for an entry
 *  deleted, its timing and dismissal the Snackbar's own. Undo puts the
 *  entry back where it was; let go, the delete is sent (deleteKept). */
@Composable
private fun DeletedSnackbar(removed: LogbookModel.Removed?, host: SnackbarHostState, model: LogbookModel) {
    val words = removed?.let { r -> stringResource(R.string.logbook_deleted, listOfNotNull(r.entry.flownOn, r.entry.route?.ifEmpty { null }).joinToString(" ")) }
    val undo = stringResource(R.string.undo)
    LaunchedEffect(removed?.entry?.id) {
        val id = removed?.entry?.id ?: return@LaunchedEffect
        val said = words ?: return@LaunchedEffect
        when (host.showSnackbar(said, actionLabel = undo, withDismissAction = true, duration = SnackbarDuration.Long)) {
            SnackbarResult.ActionPerformed -> model.undoDelete()
            SnackbarResult.Dismissed -> model.deleteKept(id)
        }
    }
}

/** An entry saved: Android's Confirm (API 30), a plain key tap before it. */
private val SAVED: Int get() = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
