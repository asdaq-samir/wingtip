package app.wingtipmaps.android.library

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.NoteAdd
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle
import app.wingtipmaps.android.ui.SheetPage
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * You's Documents (decision 0056), ForeFlight's Documents the Android
 * way and the web's DocumentsPage in its order: Your Documents, the
 * pilot's own PDFs, newest first, with Add a PDF, which opens the
 * system's own picker (the Storage Access Framework's OpenDocument, PDFs
 * only); then the FAA's shelf by its groups, each row its edition and date
 * and Keep for the Air at its end. A row opens the reader on the sheet's
 * stack, beside the list on a wide window (SheetPage.listsBeside).
 */
@Composable
fun DocumentsPage(exit: CardExit, open: (SheetPage) -> Unit, model: DocumentsModel = hiltViewModel()) {
    val shelf by model.shelf.collectAsStateWithLifecycle()
    val kept by model.kept.collectAsStateWithLifecycle()
    val keeping by model.keeping.collectAsStateWithLifecycle()
    val owned by model.owned.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    val addProblem by model.addProblem.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        uris.forEach { model.add(it) }
    }
    DeletedSnackbar(model, snackbar)
    CardPage(title = stringResource(R.string.documents), exit = exit, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).testTag("documents-page"),
            contentPadding = PaddingValues(start = WingtipSpace.Lg, end = WingtipSpace.Lg, bottom = WingtipSpace.Xl),
        ) {
            item(key = "yours") { SectionTitle(stringResource(R.string.documents_yours)) }
            items(owned, key = { "own-" + it.id }) { doc ->
                OwnRow(doc, onOpen = { open(SheetPage.Reader(DocPlace.own(doc.id).text)) }, onRename = { model.rename(doc.id, it) }, onDelete = { model.remove(doc.id) })
            }
            item(key = "add") {
                ListItem(
                    onClick = { pick.launch(arrayOf(PDF)) },
                    leadingContent = { Icon(Icons.AutoMirrored.Filled.NoteAdd, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    modifier = Modifier.testTag("documents-add"),
                    content = { Text(stringResource(R.string.documents_add), color = MaterialTheme.colorScheme.primary) },
                )
                addProblem?.let { ProblemLine(it) }
            }
            if (shelf.isEmpty()) {
                item(key = "shelf-state") { ShelfState(problem, onRetry = model::refresh) }
            }
            for ((group, documents) in Bookshelf.grouped(shelf)) {
                item(key = "group-$group") { SectionTitle(group) }
                items(documents, key = { "doc-" + it.id }) { doc ->
                    ShelfRow(
                        doc,
                        keptEdition = kept[doc.id],
                        keeping = keeping[doc.id],
                        onOpen = { open(SheetPage.Reader(DocPlace(doc.id).text)) },
                        onKeep = { model.keep(doc) },
                        onTakeOff = { model.takeOff(doc) },
                    )
                }
            }
        }
    }
}

/** No shelf yet: fetching it, or not reached, with what is kept still listed. */
@Composable
private fun ShelfState(problem: String?, onRetry: () -> Unit) {
    if (problem == null) {
        Text(stringResource(R.string.documents_fetching), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = WingtipSpace.Md))
        return
    }
    Column(Modifier.padding(vertical = WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        Text(stringResource(R.string.documents_not_reached), style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.documents_not_reached_body), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        ProblemLine(problem, onRetry = onRetry)
    }
}

/** "POH Deleted · Undo": Material's Snackbar, as the Logbook's delete
 *  has it; let go, the file and its places are forgotten. */
@Composable
private fun DeletedSnackbar(model: DocumentsModel, host: SnackbarHostState) {
    val removed by model.removed.collectAsStateWithLifecycle()
    val gone = removed ?: return
    val words = stringResource(R.string.documents_deleted, gone.name)
    val undo = stringResource(R.string.undo)
    LaunchedEffect(gone.id) {
        when (host.showSnackbar(words, actionLabel = undo, withDismissAction = true, duration = SnackbarDuration.Long)) {
            SnackbarResult.ActionPerformed -> model.undo()
            SnackbarResult.Dismissed -> model.undoPassed()
        }
    }
}

/** What the picker offers: PDFs alone. */
private const val PDF = "application/pdf"
