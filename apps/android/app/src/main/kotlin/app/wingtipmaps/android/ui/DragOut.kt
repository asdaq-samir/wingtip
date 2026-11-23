package app.wingtipmaps.android.ui

import android.content.ClipData
import android.content.ClipDescription
import android.net.Uri
import android.view.View
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropTransferData
import androidx.core.net.toUri
import app.wingtipmaps.android.ai.functions.AgentLinks

/**
 * A row dragged out of the app -- a field, a point of the route, a leg of
 * the nav log -- into another app beside it in split screen or a desktop
 * window (Android's adaptive guidelines, Tier 1 Drag_Drop_Support), as
 * the iPad's field rows drag out as their identifier: its words as plain
 * text for a note or a mail, and the app's own link to it for an app that
 * takes one (a browser, Wingtip's other window). Started by a long press,
 * Compose's stock start, with the system's own drag shadow.
 */
object DragOut {
    /** What the row carries: its words, and its link where it has one. */
    fun clip(words: String, link: String?): ClipData {
        val types = if (link == null) arrayOf(ClipDescription.MIMETYPE_TEXT_PLAIN) else arrayOf(ClipDescription.MIMETYPE_TEXT_PLAIN, ClipDescription.MIMETYPE_TEXT_URILIST)
        val item = if (link == null) ClipData.Item(words) else ClipData.Item(words, null, link.toUri())
        return ClipData(ClipDescription(words, types), item)
    }

    /** A field's or a fix's row: its identifier, and its card's link. */
    fun place(ident: String): ClipData = clip(ident, AgentLinks.place(ident))

    /** A row about a point -- a leg to it -- as its words, and the
     *  point's card's link. */
    fun about(words: String, ident: String): ClipData = clip(words, AgentLinks.place(ident))
}

/** The row drags out as `clip`, to this app or another (DRAG_FLAG_GLOBAL);
 *  its link is the app's own address, no file, so no grant goes with it. */
fun Modifier.dragOut(clip: () -> ClipData): Modifier = dragAndDropSource { _ ->
    DragAndDropTransferData(clip(), flags = View.DRAG_FLAG_GLOBAL)
}
