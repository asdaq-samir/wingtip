package app.wingtipmaps.android.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import android.os.ext.SdkExtensions
import androidx.annotation.RequiresExtension
import androidx.core.graphics.createBitmap
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.diagramFixUsable
import app.wingtipmaps.android.engine.generated.diagramGraticule
import app.wingtipmaps.android.engine.generated.diagramLabels
import app.wingtipmaps.android.engine.generated.diagramPoint
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.offline.KeptForAir
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.io.File

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
