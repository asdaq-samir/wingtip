package app.wingtipmaps.android.library

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.api.generated.CfrText
import app.wingtipmaps.android.design.generated.WingtipSpace

/** A CFR part's rows as the list draws them: a subpart's head, a section's
 *  heading, or one of its paragraphs. */
internal sealed interface PartRow {
    val section: String?

    data class Group(val head: String) : PartRow {
        override val section: String? get() = null
    }

    data class Heading(override val section: String, val head: String) : PartRow

    data class Paragraph(override val section: String, val text: String) : PartRow

    companion object {
        fun of(text: CfrText): List<PartRow> = text.groups.flatMap { g ->
            listOf(Group(g.head)) + g.sections.flatMap { s -> listOf(Heading(s.id, s.head)) + s.paragraphs.map { Paragraph(s.id, it) } }
        }
    }
}

/** Where each section's heading is in the part's rows, for a cite, a
 *  bookmark and a match to scroll to. */
internal fun anchors(rows: List<PartRow>): Map<String, Int> =
    rows.withIndex().filter { it.value is PartRow.Heading }.associate { (i, r) -> r.section!! to i }

/**
 * A CFR part read as text in the app's own type, as the web's TextBody
 * reads it: each subpart a head, each section's heading an anchor that a
 * cite ("14 CFR 91.155") opens at, its paragraphs under it. The section
 * left at is kept as the pilot scrolls (ReaderMemory); a match picked
 * scrolls to its section.
 */
@Composable
internal fun TextBody(text: CfrText, model: ReaderModel, list: LazyListState) {
    val state by model.state.collectAsStateWithLifecycle()
    val rows = remember(text) { PartRow.of(text) }
    val anchor = remember(rows) { anchors(rows) }
    LaunchedEffect(rows) {
        state.startSection?.let { anchor[it] }?.let { list.scrollToItem(it) }
        snapshotFlow { rows.getOrNull(list.firstVisibleItemIndex)?.section }.collect { s -> s?.let { model.memory.leftAtSection(model.place.doc, it) } }
    }
    val wanted = state.hits.getOrNull(state.hit)?.section
    LaunchedEffect(wanted) { wanted?.let { anchor[it] }?.let { list.animateScrollToItem(it) } }
    LazyColumn(
        Modifier.fillMaxSize().testTag("reader-text"),
        state = list,
        contentPadding = PaddingValues(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Md),
    ) {
        items(rows.size) { i ->
            when (val r = rows[i]) {
                is PartRow.Group -> Text(r.head, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = WingtipSpace.Lg).semantics { heading() })
                is PartRow.Heading -> Text(r.head.ifEmpty { r.section }, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = WingtipSpace.Md).semantics { heading() })
                is PartRow.Paragraph -> Text(r.text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = WingtipSpace.Xs))
            }
        }
    }
}

/** A section's place in the list, for the reader's contents and bookmarks. */
internal suspend fun LazyListState.goTo(text: CfrText, section: String) {
    anchors(PartRow.of(text))[section]?.let { animateScrollToItem(it) }
}
