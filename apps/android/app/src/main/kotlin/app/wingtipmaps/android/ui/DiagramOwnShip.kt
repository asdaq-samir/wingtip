package app.wingtipmaps.android.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import androidx.annotation.RequiresExtension
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.graphics.createBitmap
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.diagramFixUsable
import app.wingtipmaps.android.engine.generated.diagramGraticule
import app.wingtipmaps.android.engine.generated.diagramLabels
import app.wingtipmaps.android.engine.generated.diagramPoint
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.offline.KeptForAir
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.rememberZoomableState
import me.saket.telephoto.zoomable.zoomable
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.io.File

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
fun DiagramOwnShipDialog(ident: String, url: String, onClose: () -> Unit) {
    val context = LocalContext.current
    var page by remember { mutableStateOf<DiagramPage?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    val flight by InFlight.shared.state.collectAsStateWithLifecycle()
    // The clock, each second, so a fix that stops coming takes the
    // airplane off rather than freezing it.
    val nowMs by AppClock.ticking()
    // A failed check is said under the page (DiagramPage.note), and the
    // airplane is not drawn on a fix the engine could not judge.
    val fixAsked = DiagramPage.usable(flight.fix, nowMs)
    val fix = fixAsked.getOrNull()
    LaunchedEffect(url) {
        try {
            page = DiagramPage.read(url, context.cacheDir)
            if (page == null) problem = "The FAA's diagram for $ident could not be read."
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            problem = Problems.say("The FAA's diagram for $ident could not be fetched", e)
        }
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // Back closes it, the Dialog's own.
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                    Text("$ident airport diagram", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Close") }
                }
                Box(Modifier.weight(1f).fillMaxWidth().background(Color.White), contentAlignment = Alignment.Center) {
                    val shown = page
                    when {
                        shown != null -> DiagramWithOwnShip(shown, fix)
                        problem != null -> ProblemLine(problem)
                        else -> Loading()
                    }
                }
                page?.let {
                    Text(
                        DiagramPage.note(it, fixAsked),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(WingtipSpace.Md),
                    )
                }
            }
        }
    }
}

/** The page and the airplane on it, zoomed and panned together by
 *  telephoto's Modifier.zoomable (pinch, double tap, fling, up to eight
 *  times, as the hand-made zoom allowed). */
@Composable
private fun DiagramWithOwnShip(page: DiagramPage, fix: OwnShip.Fix?) {
    val zoom = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 8f))
    val at = fix?.let { page.place(it).getOrNull() }?.takeIf { it.onPage }
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val k = minOf(constraints.maxWidth / page.width, constraints.maxHeight / page.height)
        val density = LocalDensity.current
        val w = with(density) { (page.width * k).toDp() }
        val h = with(density) { (page.height * k).toDp() }
        Box(Modifier.size(w, h).zoomable(zoom)) {
            Image(page.image.asImageBitmap(), contentDescription = "Airport diagram", modifier = Modifier.fillMaxSize())
            if (at != null) {
                val track = fix.trackDeg
                val turn = ((page.graticule?.northDeg ?: 0.0) + (track ?: 0.0)).toFloat()
                Canvas(Modifier.fillMaxSize().semantics { contentDescription = "You are here" }) {
                    val centre = Offset((at.x * k).toFloat(), (at.y * k).toFloat())
                    val r = 11.dp.toPx()
                    drawCircle(Color.White, radius = r + 3.dp.toPx(), center = centre)
                    // No track: a circle, not an arrow (AC 120-76D 11.17.2.2).
                    if (track == null) {
                        drawCircle(WingtipColors.Chart.MapBlue, radius = r * 0.7f, center = centre)
                        return@Canvas
                    }
                    rotate(turn, pivot = centre) {
                        val arrow = Path().apply {
                            moveTo(centre.x, centre.y - r)
                            lineTo(centre.x + r * 0.7f, centre.y + r * 0.8f)
                            lineTo(centre.x, centre.y + r * 0.35f)
                            lineTo(centre.x - r * 0.7f, centre.y + r * 0.8f)
                            close()
                        }
                        drawPath(arrow, WingtipColors.Chart.MapBlue)
                    }
                }
            }
        }
    }
}

/** A diagram's first page as a picture, with its graticule from its
 *  labels (null where it has none the engine can fit), and the engine's
 *  words where reading the labels failed. */
class DiagramPage(
    val image: Bitmap,
    val width: Float,
    val height: Float,
    val graticule: EngineContract.DiagramGraticuleAnswer?,
    val problem: String? = null,
) {
    /** Where the fix is on the page, in points from its top left; null
     *  where the page has no graticule, a failure where the engine's
     *  `diagram_point` failed. */
    fun place(fix: OwnShip.Fix): Result<EngineContract.DiagramPointAnswer?> {
        val g = graticule ?: return Result.success(null)
        val asked = EngineContract.DiagramPointInputGraticule(g.latOnX, g.a, g.b, g.c, g.d, g.northDeg)
        return Engine.diagramPoint(asked, fix.lat, fix.lon, width.toDouble(), height.toDouble())
    }

    companion object {
        /** The fix to draw now, null where it is stale or too coarse: the
         *  engine's `diagram_fix_usable` (AC 120-76D 11.17.2.3, three
         *  seconds; 11.17.2.4, 30 m). */
        fun usable(fix: OwnShip.Fix?, nowMs: Long): Result<OwnShip.Fix?> {
            if (fix == null) return Result.success(null)
            return Engine.diagramFixUsable((nowMs - fix.atMs) / 1000.0, fix.accuracyM).map { if (it) fix else null }
        }

        /** The line under the page: where the airplane is not drawn, why;
         *  and the planning aid's words with the FAA's credit. */
        fun note(page: DiagramPage, fix: Result<OwnShip.Fix?>): String {
            val aid = "FAA · Planning aid, not for navigation"
            val placed = fix.getOrNull()?.let { page.place(it) }
            val failed = page.problem ?: fix.exceptionOrNull()?.message ?: placed?.exceptionOrNull()?.message
            return when {
                failed != null -> "The airplane cannot be placed on this diagram: $failed $aid"
                page.graticule == null -> "The airplane cannot be placed on this diagram: it has no latitude and longitude marks, or this phone cannot read them. $aid"
                fix.getOrNull() == null -> "Finding your position… $aid"
                placed?.getOrNull()?.onPage != true -> "You are off this diagram. $aid"
                else -> aid
            }
        }

        /** The diagram fetched from the FAA (the card's airport_diagram_url),
         *  its first page drawn three times its size, and its labels placed:
         *  their words by the engine, where each is drawn by Android's
         *  PDF text, the fit by the engine. */
        suspend fun read(url: String, cache: File): DiagramPage? = withContext(Dispatchers.IO) { render(url, cache) }

        private suspend fun render(url: String, cache: File): DiagramPage? {
            // The one Keep for the Air kept (KeptForAir) first, so it opens
            // with no signal; else the cache's, fetched where it is not.
            val file = KeptForAir.current?.pdf(KeptForAir.AIRPORTS, url)?.takeIf { it.isFile } ?: File(cache, "diagram-${url.hashCode()}.pdf")
            if (!file.exists()) download(url, file)
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { renderer ->
                    if (renderer.pageCount < 1) return null
                    renderer.openPage(0).use { page ->
                        val (w, h) = page.width.toFloat() to page.height.toFloat()
                        val bitmap = createBitmap(page.width * 3, page.height * 3)
                        bitmap.eraseColor(android.graphics.Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        val graticule = if (readsText()) graticuleOf(page) else Result.success(null)
                        return DiagramPage(bitmap, w, h, graticule.getOrNull(), graticule.exceptionOrNull()?.message)
                    }
                }
            }
        }

        /** The diagram's PDF from the FAA into `file`, whole or not at all,
         *  through the app's one OkHttp client (its cache and limits). */
        suspend fun download(url: String, file: File) {
            Gateway.client.newCall(Request.Builder().url(url).build()).executeAsync().use { response ->
                if (!response.isSuccessful) throw IllegalStateException("The FAA answered ${response.code}.")
                file.parentFile?.mkdirs()
                val part = File(file.path + ".part")
                part.writeBytes(response.body.bytes())
                if (!part.renameTo(file)) part.delete()
            }
        }

        /** Whether this Android reads a PDF page's text and where it is
         *  drawn: Android 15's PDF extension, SDK extension 13 of S. */
        private fun readsText(): Boolean =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.S) >= 13

        @SuppressLint("NewApi")
        @RequiresExtension(extension = Build.VERSION_CODES.S, version = 13)
        private fun graticuleOf(page: PdfRenderer.Page): Result<EngineContract.DiagramGraticuleAnswer?> = runCatching {
            val text = page.textContents.joinToString("\n") { it.text }
            val words = Engine.diagramLabels(text).getOrThrow()
            // Each label where it is drawn, by the page's own search: its
            // bounds in the page's points from its top left.
            val placed = words.flatMap { word ->
                page.searchText(word).mapNotNull { match ->
                    val boxes = match.bounds
                    if (boxes.isEmpty()) return@mapNotNull null
                    val left = boxes.minOf { it.left }
                    val right = boxes.maxOf { it.right }
                    val top = boxes.minOf { it.top }
                    val bottom = boxes.maxOf { it.bottom }
                    EngineContract.DiagramGraticuleInputLabelsItem(word, ((left + right) / 2).toDouble(), ((top + bottom) / 2).toDouble())
                }
            }
            Engine.diagramGraticule(placed).getOrThrow()
        }
    }
}
