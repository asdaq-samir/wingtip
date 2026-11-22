package app.wingtipmaps.android.offline

import app.wingtipmaps.android.ui.DiagramPage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.File

/**
 * One of the FAA's charts kept on the phone as this app opens it: its PDF
 * whole from the FAA, as the airport diagram is kept (DiagramPage), under
 * the plates' kind of the store (KeptForAir.PLATES), where the chart's
 * viewer reads it first (PlateViewer) so a plate opens in the air with no
 * signal. The web keeps the planner's page pictures in its worker instead;
 * this phone draws the PDF itself, so the PDF is what it keeps. Keep for
 * the Air keeps a flight's this way (KeepForAir) and Downloads a state's
 * (StatePlates). A chart's address names its cycle and PDF, so one chart
 * shared by two sets (a region's takeoff-minimums booklet in each of its
 * states) is one file.
 *
 * `download` is the FAA's fetch, given another in a test.
 */
class ChartKeeper(
    private val store: KeptForAir,
    private val download: suspend (url: String, to: File) -> Unit = { url, to -> DiagramPage.download(url, to) },
) {
    fun file(url: String): File = store.pdf(KeptForAir.PLATES, url)

    fun kept(url: String): Boolean = file(url).isFile

    /** The chart kept, fetched only where it is not on the phone yet (a
     *  stopped download goes on from where it was): its bytes. Throws
     *  where the FAA could not give it. */
    suspend fun keep(url: String): Long {
        val to = file(url)
        if (!to.isFile) download(url, to)
        return to.length()
    }

    /** Every chart named kept, a few at a time (four, as the web's), each
     *  told as it ends with whether it was had; how many could not be. */
    suspend fun keepAll(urls: Collection<String>, onEach: suspend (kept: Boolean) -> Unit = {}): Int = coroutineScope {
        val gate = Semaphore(AT_ONCE)
        urls.distinct().map { url ->
            async {
                gate.withPermit {
                    val ok = try {
                        keep(url)
                        true
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        false
                    }
                    onEach(ok)
                    ok
                }
            }
        }.awaitAll().count { !it }
    }

    /** The charts of `gone` deleted, those `held` names (another kept set's)
     *  left on the phone. */
    fun delete(gone: Collection<String>, held: Set<String>) {
        for (url in gone) if (url !in held) file(url).delete()
    }

    private companion object {
        const val AT_ONCE = 4
    }
}
