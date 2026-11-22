package app.wingtipmaps.android.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
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
 * link or words the same way (WindowHost). A file dropped is the
 * activity's to take (FileTaker), as one opened with the app is.
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
 * system's own drag shadow and drop.
 *
 * @param onDrop what was dropped, read (Dropped.of).
 * @return this modifier, and what it is put on the target.
 */
@Composable
fun Modifier.windowDrop(onDrop: (Dropped) -> Unit): Modifier {
    val context = LocalContext.current
    val latest by rememberUpdatedState(onDrop)
    val target = remember(context) {
        object : DragAndDropTarget {
            override fun onDrop(event: DragAndDropEvent): Boolean {
                val drag = event.toAndroidDragEvent()
                val clip = drag.clipData ?: return false
                // A file from another app (Files, a mail beside it): read
                // under the drop's own permission, as the app's window
                // takes one opened with it (FileTaker, MainActivity).
                val file = (0 until clip.itemCount).firstNotNullOfOrNull { clip.getItemAt(it).uri?.takeIf { u -> u.scheme == "content" } }
                val activity = context.findActivity()
                if (file != null && activity is FileTaker) {
                    activity.requestDragAndDropPermissions(drag)
                    activity.take(file, clip.description.takeIf { it.mimeTypeCount > 0 }?.getMimeType(0))
                    return true
                }
                val text = (0 until clip.itemCount).firstNotNullOfOrNull { clip.getItemAt(it).coerceToText(context)?.takeIf(CharSequence::isNotBlank) }
                val dropped = Dropped.of(text) ?: return false
                latest(dropped)
                return true
            }
        }
    }
    // Plain text, a link, a list of addresses: every text/ type; and the
    // files a window takes (FlightFiles: a flight plan, a GPX, a PDF).
    return then(remember(target) { Modifier.dragAndDropTarget(shouldStartDragAndDrop = { event -> event.mimeTypes().any(::droppable) }, target = target) })
}

/** A drag's type the window takes: text, or a file it can read. */
internal fun droppable(type: String): Boolean = type.startsWith("text/") || type in FILE_TYPES

private val FILE_TYPES = setOf("application/pdf", "application/gpx+xml", "application/xml", "application/octet-stream")

/** The activity that takes a file handed over, opened, shared or dropped
 *  (MainActivity): what it is, by its type or name, decided there. */
interface FileTaker {
    fun take(uri: Uri, type: String?)
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** The root's drop: a link opened as one sent to the app is (`onLink`),
 *  words typed into the one search over every card closed. */
@Composable
internal fun Modifier.sheetDrop(pages: SheetNav, search: SearchControl, onLink: (Links.Link) -> Unit): Modifier = windowDrop { dropped ->
    when (dropped) {
        is Dropped.Link -> onLink(dropped.link)
        is Dropped.Words -> {
            pages.closeAll()
            search.type(dropped.words)
        }
    }
}
