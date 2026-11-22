package app.wingtipmaps.android.plates

import android.content.Context
import app.wingtipmaps.android.library.MarkupStore
import java.io.File
import java.security.MessageDigest

/**
 * The pilot's ink on a chart -- a plate, the airport diagram, a page of
 * the Chart Supplement shown full screen -- with a stylus or a finger: a
 * frequency ringed, the missed approach traced, as a pilot marks a paper
 * plate on the kneeboard. Kept on this device alone, as the documents'
 * marks are (MarkupStore, Jetpack Ink's strokes), one file a chart and its
 * cycle, so the next cycle's plate starts clean and the last cycle's ink
 * is dropped when the new one is first opened: a mark on a page the FAA
 * has since changed would point at what is no longer there. The iPad's
 * PlateMarkup keys by the chart's address the same way. The pilot's
 * notes on the chart, never the chart: nothing here changes a figure the
 * FAA prints.
 */
object PlateInk {
    /** A chart's key: the chart, its address with the cycle taken out,
     *  hashed (an address is no file name), and its cycle. */
    data class Key(val chart: String, val cycle: String) {
        /** The MarkupStore's name for it: "<chart>_<cycle>". */
        val file: String get() = "${chart}_$cycle"
    }

    /** d-TPP's address carries the cycle as a folder of four figures,
     *  "https://aeronav.faa.gov/d-tpp/2511/00123IL36.PDF" (the FAA's
     *  Digital Terminal Procedures Publication); a chart elsewhere by its
     *  address alone, its cycle "", and new ink once the address changes. */
    private val CYCLE = Regex("/(\\d{4})/")

    fun key(url: String): Key {
        val cycle = CYCLE.find(url)?.groupValues?.get(1).orEmpty()
        return Key(hash(url.replaceFirst(CYCLE, "/")), cycle)
    }

    /** The chart's marks, the other cycles' ink of it dropped first. */
    fun of(context: Context, url: String): MarkupStore {
        val dir = dir(context)
        val key = key(url)
        dropOtherCycles(dir, key)
        return MarkupStore(dir, key.file)
    }

    /** Every other cycle's file of the same chart deleted. */
    internal fun dropOtherCycles(dir: File, key: Key) {
        dir.listFiles { f -> f.name.startsWith("${key.chart}_") && f.name != "${key.file}.json" }?.forEach(File::delete)
    }

    /** The charts' ink folder, beside the documents' (the phone's wipe). */
    fun dir(context: Context) = File(context.applicationContext.filesDir, "plates/markup")

    private fun hash(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).take(HASH_BYTES).joinToString("") { "%02x".format(it) }

    private const val HASH_BYTES = 12
}
