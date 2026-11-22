package app.wingtipmaps.android.ui

import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.mimeTypes
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.platform.LocalContext
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.search.SearchControl

/**
 * What a drop on the app's window is (WindowDrop): one of the app's own
 * links -- a shared route, a field, a screen -- opened as a tap on it
 * opens it, or words for the one search. Android's adaptive guidelines
 * (Tier 1, Drag_Drop_Support) ask an app to take a drop from another app
 * in split screen or a desktop window; the iPad takes a flight file, a
 * link or words the same way (WindowHost).
 */
sealed interface Dropped {
    data class Link(val link: Links.Link) : Dropped

    data class Words(val words: String) : Dropped

    companion object {
        /** The longest words the search takes from a drop: a route typed
         *  out, not a page of text. */
        const val MOST_WORDS = 200

        /** `text` dropped, read: never a sign-in link, which only the
         *  emailed link itself may carry (Links.parse, Session.open), and
         *  no other address, which is not words the search can read. */
        fun of(text: CharSequence?): Dropped? {
            val words = text?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return when (val link = Links.parse(words)) {
                is Links.SignIn -> null
                null -> if ("://" in words) null else Words(words.lineSequence().first().take(MOST_WORDS))
                else -> Link(link)
            }
        }
    }
}

/**
 * The window as a drop target for text and links, from the app's own
 * rows or another app's (a browser's address, a note's words), with the
 * system's own drag shadow and drop; put on the window with
 * [windowDrop].
 *
 * @param onDrop what was dropped, read (Dropped.of).
 * @return the target a drop is handed to.
 */
@Composable
fun rememberWindowDrop(onDrop: (Dropped) -> Unit): DragAndDropTarget {
    val context = LocalContext.current
    val latest by rememberUpdatedState(onDrop)
    return remember(context) {
        object : DragAndDropTarget {
            override fun onDrop(event: DragAndDropEvent): Boolean {
                val clip = event.toAndroidDragEvent().clipData ?: return false
                val text = (0 until clip.itemCount).firstNotNullOfOrNull { clip.getItemAt(it).coerceToText(context)?.takeIf(CharSequence::isNotBlank) }
                val dropped = Dropped.of(text) ?: return false
                latest(dropped)
                return true
            }
        }
    }
}

/** What this is put on takes a drop of text for [target]: plain text, a
 *  link, a list of addresses, every text/ type. */
fun Modifier.windowDrop(target: DragAndDropTarget): Modifier =
    dragAndDropTarget(shouldStartDragAndDrop = { event -> event.mimeTypes().any { it.startsWith("text/") } }, target = target)

/** The root's drop: a link opened as one sent to the app is (`onLink`),
 *  words typed into the one search over every card closed. */
@Composable
internal fun rememberSheetDrop(pages: SheetNav, search: SearchControl, onLink: (Links.Link) -> Unit): DragAndDropTarget = rememberWindowDrop { dropped ->
    when (dropped) {
        is Dropped.Link -> onLink(dropped.link)
        is Dropped.Words -> {
            pages.closeAll()
            search.type(dropped.words)
        }
    }
}
