package app.wingtipmaps.android.documents

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.graphics.scale
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The scanned page made the JPEG the reader takes: at most 2,000 px on
 * its long edge (enough for a handbook table's small print, and well
 * under the server's 3.5 MB), at quality 85, lowered a step at a time
 * where a busy page is still too large.
 */
object PagePhoto {
    const val LONG_EDGE = 2_000
    const val MAX_BYTES = 3_500_000
    private val QUALITIES = listOf(85, 75, 65, 55)

    /** A photo the phone could not open or make a JPEG of. */
    class Unreadable(message: String) : Exception(message)

    /** The size a photo of w by h is sent at: as it is where its long
     *  edge is within `longEdge`, else scaled down to it. */
    fun scaledSize(w: Int, h: Int, longEdge: Int = LONG_EDGE): Pair<Int, Int> {
        val long = max(w, h)
        if (long <= longEdge) return w to h
        val k = longEdge.toDouble() / long
        return max(1, (w * k).roundToInt()) to max(1, (h * k).roundToInt())
    }

    /** The largest power of two to decode at that leaves the long edge
     *  at least `longEdge`, so the scaling after it is a small one. */
    fun sampleSize(w: Int, h: Int, longEdge: Int = LONG_EDGE): Int {
        var n = 1
        while (max(w, h) / (n * 2) >= longEdge) n *= 2
        return n
    }

    fun jpeg(context: Context, page: Uri): ByteArray {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(page)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw Unreadable("The photo could not be opened.")
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight) }
        val decoded = resolver.openInputStream(page)?.use { BitmapFactory.decodeStream(it, null, options) }
            ?: throw Unreadable("The photo could not be opened.")
        val (w, h) = scaledSize(decoded.width, decoded.height)
        val bitmap = if (w == decoded.width && h == decoded.height) decoded else decoded.scale(w, h)
        try {
            for (quality in QUALITIES) {
                val out = ByteArrayOutputStream()
                bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
                if (out.size() <= MAX_BYTES) return out.toByteArray()
            }
            throw Unreadable("The photo is too large to send.")
        } finally {
            if (bitmap !== decoded) bitmap.recycle()
            decoded.recycle()
        }
    }
}
