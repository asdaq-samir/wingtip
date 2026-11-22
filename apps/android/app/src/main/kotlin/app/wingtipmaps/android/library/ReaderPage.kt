package app.wingtipmaps.android.library

import android.app.Application
import android.content.Intent
import androidx.compose.foundation.focusable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons
import kotlinx.coroutines.launch

/**
 * The reader (the web's Reader): one document at its place, a PDF's pages
 * or a CFR part's text, its title and ✕ in Material's top app bar with
 * Contents and Bookmark This Page, and Invert Colors, Share This Page and
 * Markup in its •••; the search under it. On a phone it fills the screen
 * (SheetCards' dialog); on a wide window it is the detail pane beside the
 * library and the map. A keyboard turns, finds, bookmarks and zooms
 * (ReaderKeys).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderPage(placeText: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val place = remember(placeText) { DocPlace.parse(placeText) ?: DocPlace(placeText) }
    val app = context.applicationContext as Application
    val model: ReaderModel = viewModel(key = "reader:${place.text}") { ReaderModel(app, place) }
    val state by model.state.collectAsStateWithLifecycle()
    val places by model.memory.places.collectAsStateWithLifecycle()
    val marks by model.markup.marks.collectAsStateWithLifecycle()
    val noting by model.noting.collectAsStateWithLifecycle()
    val inverted = places.inverted ?: isSystemInDarkTheme()
    val pages = state.pages
    val text = state.text
    val control = pages?.let { rememberPdfControl(state.startPage, it.count) }
    val list = rememberLazyListState()
    val rows = remember(text) { text?.let(PartRow::of).orEmpty() }
    // The first row in sight, read as it changes rather than at each frame of a scroll.
    val first by remember(list) { derivedStateOf { list.firstVisibleItemIndex } }
    val section = rows.getOrNull(first)?.section
    val here = if (control != null) Bookmark(page = control.page, label = "") else Bookmark(at = section, label = "")
    val marked = places.bookmarks[place.doc].orEmpty().any { it.page == here.page && it.at == here.at }
    var menu by remember { mutableStateOf(false) }
    var contents by remember { mutableStateOf(false) }
    var listing by remember { mutableStateOf(false) }
    var pen by remember { mutableStateOf<Pen?>(null) }
    val find = remember { FocusRequester() }
    val keys = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val marking = Marking.of(pen, density)
    val bookmark = {
        val label = if (control != null) Finding.titleAt(state.outline, control.page) ?: resources.getString(R.string.reader_page, control.page) else rows.firstOrNull { it is PartRow.Heading && it.section == section }?.let { (it as PartRow.Heading).head } ?: section.orEmpty()
        if (here.page != null || here.at != null) model.memory.toggle(place.doc, here.copy(label = label))
    }
    LaunchedEffect(Unit) { keys.requestFocus() }

    Scaffold(
        modifier = Modifier.fillMaxSize().testTag("reader").focusRequester(keys).focusable().onPreviewKeyEvent { e ->
            if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
            val action = ReaderKeys.of(e.key, e.isCtrlPressed || e.isMetaPressed, e.isShiftPressed, typing = listing) ?: return@onPreviewKeyEvent false
            when (action) {
                ReaderKey.NEXT_PAGE -> scope.launch { control?.turn(1) }
                ReaderKey.PREVIOUS_PAGE -> scope.launch { control?.turn(-1) }
                ReaderKey.FIRST_PAGE -> scope.launch { control?.go(1) }
                ReaderKey.LAST_PAGE -> scope.launch { control?.go(pages.count) }
                ReaderKey.FIND -> find.requestFocus()
                ReaderKey.NEXT_MATCH -> model.step(1)
                ReaderKey.PREVIOUS_MATCH -> model.step(-1)
                ReaderKey.BOOKMARK -> bookmark()
                ReaderKey.ZOOM_IN -> scope.launch { control?.zoom(ZOOM_STEP) }
                ReaderKey.ZOOM_OUT -> scope.launch { control?.zoom(1 / ZOOM_STEP) }
                ReaderKey.FIT -> scope.launch { control?.fit() }
                ReaderKey.CLOSE -> if (listing) keys.requestFocus() else onClose()
            }
            true
        },
        topBar = {
            TopAppBar(
                title = { Text(state.title, maxLines = 1) },
                navigationIcon = { IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) } },
                actions = {
                    IconButton(onClick = { contents = true }) { Icon(Icons.AutoMirrored.Filled.List, contentDescription = stringResource(R.string.reader_contents)) }
                    IconButton(onClick = bookmark, modifier = Modifier.testTag("reader-bookmark")) {
                        Icon(if (marked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder, contentDescription = stringResource(if (marked) R.string.reader_bookmark_remove else R.string.reader_bookmark))
                    }
                    Box {
                        IconButton(onClick = { menu = true }) { Icon(WingtipIcons.more, contentDescription = stringResource(R.string.more)) }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            if (pages != null) {
                                DropdownMenuItem(text = { Text(stringResource(R.string.reader_invert)) }, trailingIcon = { Checkbox(inverted, null) }, onClick = { menu = false; model.memory.setInverted(!inverted) })
                                DropdownMenuItem(text = { Text(stringResource(R.string.reader_markup)) }, onClick = { menu = false; pen = Pen.INK })
                            }
                            val link = (if (control != null) DocPlace(place.doc, page = control.page) else DocPlace(place.doc, at = section)).link()
                            if (link != null) {
                                DropdownMenuItem(text = { Text(stringResource(R.string.reader_share)) }, leadingIcon = { Icon(WingtipIcons.share, null) }, onClick = {
                                    menu = false
                                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, state.title).putExtra(Intent.EXTRA_TEXT, link)
                                    context.startActivity(Intent.createChooser(send, null))
                                })
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            val p = pen
            if (p != null) {
                MarkupBar(p, onPen = { pen = it }, onUndo = { control?.let { model.markup.undo(it.page) } }, onClear = { control?.let { model.markup.clear(it.page) } }, onDone = { pen = null })
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (pen == null) ReaderSearch(state, find, onQuery = model::search, onStep = model::step, onFocus = { listing = it })
            Box(Modifier.weight(1f)) {
                when {
                    state.problem != null -> ProblemLine(state.problem, Modifier.padding(WingtipSpace.Lg))
                    pages != null && control != null -> PdfBody(pages, model, control, inverted, marking, onNote = model::ask)
                    text != null -> TextBody(text, model, list)
                    else -> Loading(description = stringResource(R.string.reader_fetching))
                }
                if (listing && state.hits.isNotEmpty()) {
                    Surface(Modifier.fillMaxSize()) { ReaderHits(state.hits, onPick = { model.pick(it); keys.requestFocus() }) }
                }
            }
        }
    }
    if (contents) {
        val shown = remember(state.outline, text) { text?.let(ContentsRow::of) ?: ContentsRow.of(state.outline) }
        ReaderContents(
            rows = shown,
            bookmarks = places.bookmarks[place.doc].orEmpty(),
            notes = marks.filter { it.note != null },
            onGo = { to -> scope.launch { to.page?.let { control?.go(it) }; if (text != null) to.section?.let { list.goTo(text, it) } } },
            onRename = { b, name -> model.memory.rename(place.doc, b, name) },
            onDismiss = { contents = false },
        )
    }
    noting?.let { m ->
        NoteDialog(m, onSave = { model.markup.note(m.id, it); model.ask(null) }, onDelete = { model.markup.remove(m.id); model.ask(null) }, onDismiss = { model.ask(null) })
    }
}

/** A zoom key's step: a quarter more, or less. */
private const val ZOOM_STEP = 1.25f
