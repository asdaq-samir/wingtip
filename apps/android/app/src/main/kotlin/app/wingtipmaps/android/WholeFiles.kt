package app.wingtipmaps.android

import androidx.core.util.AtomicFile
import java.io.File
import java.io.IOException

/**
 * A file of the app's own written whole or not at all, through AndroidX's
 * AtomicFile (core): written beside it, flushed to the disk (fsync) and
 * renamed over it, so a kill or a power cut mid-write leaves the last good
 * file, never half of one. It replaced a hand-built ".part then rename" in
 * each store, which did not flush before the rename, so a power cut could
 * leave an empty file where the unsent track, the kept chart or the
 * airspace packs' index had been. AndroidX's copy rather than the
 * platform's (android.util.AtomicFile), so the JVM tests run it as is.
 */
fun File.writeWhole(bytes: ByteArray) {
    parentFile?.mkdirs()
    val atomic = AtomicFile(this)
    val out = atomic.startWrite()
    try {
        out.write(bytes)
        atomic.finishWrite(out)
    } catch (e: IOException) {
        atomic.failWrite(out)
        throw e
    }
}

fun File.writeWhole(text: String) = writeWhole(text.toByteArray())

/** What the file holds, read as AtomicFile reads it (a write cut short
 *  set aside); null where there is none or it cannot be read. */
fun File.readWhole(): String? = runCatching { AtomicFile(this).readFully().decodeToString() }.getOrNull()
