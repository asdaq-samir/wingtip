package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip

/**
 * The FAA's airport diagram with the airplane on it (#218), as the iOS
 * app's DiagramOwnShipView: the d-TPP's PDF drawn on the phone
 * (PdfRenderer), and own ship placed by the diagram's own latitude and
 * longitude labels (the engine's diagram_labels, diagram_graticule and
 * diagram_point; the free d-TPP's diagrams carry no GeoPDF
 * georeference). Android reads a page's text and where it is drawn from
 * Android 15's PDF extension (SDK extension 13); before it, or on a
 * diagram with no labels (KORD's), the diagram is shown without the
 * airplane, and says so.
 *
 * For a pilot's awareness on the ground, not for navigation: the signs,
 * the markings and ATC's taxi instructions are what count (AC 120-74B;
 * AC 120-76D 11.17.1, "use of external visual references is sufficient
 * for maneuvering" on the ground). Own ship follows AC 120-76D 11.17.2: a
 * circle, not an arrow, with no track (11.17.2.2), and gone once the fix
 * is older than three seconds or worse than 30 m (11.17.2.3, 11.17.2.4's
 * 30 m), never frozen.
 */
@Composable
fun DiagramOwnShipDialog(ident: String, url: String, onClose: () -> Unit, model: DiagramModel = hiltViewModel()) {
    val read by model.state.collectAsStateWithLifecycle()
    val flight by model.flight.collectAsStateWithLifecycle()
    // The clock, each second, so a fix that stops coming takes the
    // airplane off rather than freezing it.
    val nowMs by AppClock.ticking()
    // A failed check is said under the page (DiagramPage.note), and the
    // airplane is not drawn on a fix the engine could not judge.
    val fixAsked = model.usable(flight.fix, nowMs)
    val fix = fixAsked.getOrNull()
    // Read as the dialog opens; its page let go of as it closes.
    DisposableEffect(ident, url) {
        model.open(ident, url)
        onDispose { model.close() }
    }
    FullScreenPage(
        title = "$ident airport diagram",
        onClose = onClose,
        footer = {
            read.page?.let {
                Text(
                    model.note(it, fixAsked),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(WingtipSpace.Md),
                )
            }
        },
    ) {
        val shown = read.page
        when {
            shown != null -> ZoomablePage(shown.image, "Airport diagram", ownShipOn(shown, fix, fix?.let { model.place(shown, it) }))
            read.problem != null -> ProblemLine(read.problem)
            else -> Loading()
        }
    }
}

/** Where the airplane goes on the diagram, null where the engine put it
 *  off the page: turned by the page's north and the fix's track, and
 *  with no track a circle, not an arrow (AC 120-76D 11.17.2.2). */
private fun ownShipOn(page: DiagramPage, fix: OwnShip.Fix?, placed: EngineContract.DiagramPointAnswer?): PageMark? {
    val at = placed?.takeIf { it.onPage } ?: return null
    val turn = fix?.trackDeg?.let { (page.graticule?.northDeg ?: 0.0) + it }
    return PageMark(at.x / page.width, at.y / page.height, turn)
}
