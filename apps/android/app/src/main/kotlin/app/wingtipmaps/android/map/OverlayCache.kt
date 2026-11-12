package app.wingtipmaps.android.map

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.CacheControl
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.io.File
import java.io.RandomAccessFile

/**
 * The overlay tiles' archive kept on the phone, so the airspace, the
 * airports and the navaids draw in the air with no signal. MapLibre reads
 * the archive (`pmtiles://`, MapStyle.overlayUrl) in byte ranges, and
 * OkHttp's cache keeps no 206 answer, so the ranges are kept here:
 *
 * - the whole archive, where it has been fetched (`download`, on an
 *   unmetered network, as Charts asks): every range is answered from it;
 * - else each range the map has read, as it read it, up to LIMIT_BYTES,
 *   the oldest dropped first: the places looked at, at least.
 *
 * An archive's name changes with every build (wingtip.vector_tiles
 * archive_name: its cycle, version and the pack's CRC), so what is kept
 * under a name never goes stale and is answered without asking; another
 * name's ranges are dropped when the planner names a new one (`keepOnly`).
 * Plain files, no map: the interceptor and the tests share it.
 */
class OverlayStore(private val dir: File, private val limitBytes: Long = LIMIT_BYTES) {
    private val ranges = File(dir, "ranges")
    private var stored = 0

    /** The whole archive, once all of it is in. */
    fun whole(name: String): File = File(dir, "$name.pmtiles")

    private fun part(name: String): File = File(dir, "$name.pmtiles.part")

    private fun rangeFile(name: String, start: Long, end: Long) = File(File(ranges, name), "$start-$end")

    /** The bytes of a range, inclusive, and the archive's length where it
     *  is known; null where neither the archive nor that range is kept. */
    fun read(name: String, start: Long, end: Long): Pair<ByteArray, Long?>? {
        val file = whole(name)
        if (file.isFile) {
            RandomAccessFile(file, "r").use { raf ->
                val length = raf.length()
                if (start >= length) return null
                val last = minOf(end, length - 1)
                val bytes = ByteArray((last - start + 1).toInt())
                raf.seek(start)
                raf.readFully(bytes)
                return bytes to length
            }
        }
        val kept = rangeFile(name, start, end)
        if (!kept.isFile) return null
        // Touched, so the ranges in use are the last dropped.
        kept.setLastModified(System.currentTimeMillis())
        return kept.readBytes() to null
    }

    /** A range as the planner sent it, kept; the oldest dropped past the
     *  limit (looked at every so often, not at every range). */
    fun store(name: String, start: Long, end: Long, bytes: ByteArray) {
        if (whole(name).isFile) return
        val file = rangeFile(name, start, end)
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeBytes(bytes)
        temp.renameTo(file)
        if (++stored % TRIM_EVERY == 0) trim()
    }

    /** The oldest ranges dropped until the rest fit in the limit. */
    fun trim() {
        val files = ranges.walkTopDown().filter { it.isFile }.toList()
        var total = files.sumOf { it.length() }
        if (total <= limitBytes) return
        for (file in files.sortedBy { it.lastModified() }) {
            if (total <= limitBytes) break
            total -= file.length()
            file.delete()
        }
    }

    /** Everything kept of other archives dropped: the planner has named
     *  `name` the cycle's now. */
    fun keepOnly(name: String) {
        dir.listFiles()?.forEach { f ->
            if (f.isFile && !f.name.startsWith("$name.pmtiles")) f.delete()
        }
        ranges.listFiles()?.forEach { f -> if (f.name != name) f.deleteRecursively() }
    }

    /** Whether the whole archive of `bytes` is on the phone. */
    fun hasWhole(name: String, bytes: Long): Boolean = whole(name).length() == bytes

    /**
     * The whole archive fetched into the phone, carrying on from where an
     * earlier fetch stopped (a Range from the part's end), then put in
     * place, so every range is answered from it; the ranges kept one by one
     * go then. Not kept in OkHttp's cache (no-store): a hundred megabytes
     * would push out every tile. True once it is in.
     */
    suspend fun download(client: OkHttpClient, url: HttpUrl, name: String, bytes: Long): Boolean = withContext(Dispatchers.IO) {
        if (hasWhole(name, bytes)) return@withContext true
        dir.mkdirs()
        val part = part(name)
        val from = if (part.isFile) part.length() else 0L
        val request = Request.Builder().url(url)
            .cacheControl(CacheControl.Builder().noStore().build())
            .apply { if (from > 0) header("Range", "bytes=$from-") }
            .build()
        client.newCall(request).execute().use { response ->
            val append = response.code == 206 && from > 0
            if (response.code != 200 && !append) return@withContext false
            java.io.FileOutputStream(part, append).use { out -> response.body.byteStream().copyTo(out) }
        }
        if (part.length() != bytes) return@withContext false
        if (!part.renameTo(whole(name))) return@withContext false
        File(ranges, name).deleteRecursively()
        true
    }

    companion object {
        /** The ranges kept one by one: a few regions' worth of the
         *  archive's tiles (the whole country's archive is about 120 MB). */
        const val LIMIT_BYTES = 64L shl 20
        private const val TRIM_EVERY = 64

        /** A closed range as MapLibre asks it, "bytes=a-b"; null for an
         *  open one or any other. */
        fun range(header: String?): Pair<Long, Long>? {
            val m = Regex("""^bytes=(\d+)-(\d+)$""").find(header?.trim() ?: return null) ?: return null
            val start = m.groupValues[1].toLongOrNull() ?: return null
            val end = m.groupValues[2].toLongOrNull() ?: return null
            return if (end >= start) start to end else null
        }

        /** The archive's name in its address (the planner's
         *  /api/overlay-tiles/{name}.pmtiles, through the gateway's proxy). */
        fun archiveName(url: HttpUrl): String? {
            val segments = url.pathSegments
            val i = segments.indexOf("overlay-tiles")
            if (i < 0 || i != segments.size - 2) return null
            val file = segments[i + 1]
            return if (file.endsWith(".pmtiles")) file.removeSuffix(".pmtiles").ifEmpty { null } else null
        }
    }
}

/** The app's OkHttp client answering the archive's ranges from the phone
 *  where they are kept, and keeping each one it fetches (OverlayStore).
 *  Every other request passes as it came. */
class OverlayCache(private val store: OverlayStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val name = OverlayStore.archiveName(request.url) ?: return chain.proceed(request)
        val (start, end) = OverlayStore.range(request.header("Range")) ?: return chain.proceed(request)
        // A range dropped by a trim as it is read is fetched again.
        runCatching { store.read(name, start, end) }.getOrNull()?.let { (bytes, length) ->
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(206)
                .message("Partial Content")
                .header("Content-Range", "bytes $start-${start + bytes.size - 1}/${length ?: "*"}")
                .header("Accept-Ranges", "bytes")
                .body(bytes.toResponseBody(OCTETS))
                .build()
        }
        val response = chain.proceed(request)
        if (response.code != 206) return response
        val body = response.body
        val type = body.contentType() ?: OCTETS
        val bytes = body.bytes()
        val _ = runCatching { store.store(name, start, end, bytes) }
        return response.newBuilder().body(bytes.toResponseBody(type)).build()
    }

    private companion object {
        val OCTETS = "application/octet-stream".toMediaType()
    }
}
