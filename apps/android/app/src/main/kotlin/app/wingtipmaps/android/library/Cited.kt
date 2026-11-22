package app.wingtipmaps.android.library

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withLink
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.ui.SheetPage

/**
 * Words as the app shows them, each cited rule among them a link that
 * opens the documents library at its paragraph ("14 CFR 91.155" at
 * § 91.155 of Part 91, "AIM 7-1-5" at its paragraph), as the web's Cited
 * draws them: the Brief's why, an airspace card's entry rules. A tap opens
 * the reader on the sheet's stack (CardRequests), over wherever the pilot
 * is, and Back comes back. TalkBack reads each link as a link; in a row
 * read as one, each is the row's action (rememberCiteActions).
 */
@Composable
fun Cited(text: String, modifier: Modifier = Modifier, style: TextStyle = MaterialTheme.typography.bodyMedium) {
    val pieces = rememberCitedPieces(text)
    val tint = MaterialTheme.colorScheme.primary
    val words = remember(pieces, tint) {
        buildAnnotatedString {
            for (p in pieces) {
                val place = p.place
                if (place == null) {
                    append(p.text)
                } else {
                    val link = LinkAnnotation.Clickable(place.text, TextLinkStyles(SpanStyle(color = tint))) { CardRequests.open(SheetPage.Reader(place.text)) }
                    withLink(link) { append(p.text) }
                }
            }
        }
    }
    Text(words, modifier = modifier, style = style)
}

/** `text` in pieces, each cite where the shelf holds its document. */
@Composable
private fun rememberCitedPieces(text: String): List<CitedPiece> {
    val context = LocalContext.current
    val shelf by remember(context) { Bookshelf.of(context) }.shelf.collectAsStateWithLifecycle()
    return remember(text, shelf) { if (shelf.isEmpty()) listOf(CitedPiece(text, null)) else Citations.pieces(text, shelf) }
}

/**
 * Each cite in `text` as one of a row's accessibility actions, for a row
 * TalkBack reads as one description (clearAndSetSemantics), which hides
 * the links Cited draws inside it (the documents audit, item 104): the
 * row keeps its one reading, and the actions menu opens each rule at its
 * paragraph, as a tap on the link does.
 */
@Composable
fun rememberCiteActions(text: String): List<CustomAccessibilityAction> {
    val pieces = rememberCitedPieces(text)
    return remember(pieces) {
        Citations.actions(pieces).map { (label, place) ->
            CustomAccessibilityAction(label) {
                CardRequests.open(SheetPage.Reader(place.text))
                true
            }
        }
    }
}
