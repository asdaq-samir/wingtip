package app.wingtipmaps.android.offline

import app.wingtipmaps.android.api.generated.LoopFrame
import app.wingtipmaps.android.tiles.TileGrid
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okhttp3.coroutines.executeAsync
import java.io.File
import java.io.IOException

/**
 * The weather loop's newest frame kept over the route for the air (the
 * offline audit's gap 6: the frame list was kept, its tiles were not, so
 * a kept loop was blank). Keep for the Air fetches the newest frame's
 * radar and satellite tiles over the route's box, whole zoom levels from
 * the widest in while they fit MAX_TILES, and stops at MAX_BYTES; the
 * app's HTTP client answers those tiles from here when the network fails
 * (LoopTileFallback), so the map draws them as it always does. One frame
 * is kept at a time: the next keep replaces it.
 */
class KeptLoopTiles(private val dir: File) {
    data class Tile(val z: Int, val x: Int, val y: Int)

    /** Where a tile's bytes are kept, by its address. */
    fun file(url: String): File = File(dir, KeptForAir.safe(url) + ".tile")

    /** The frames kept, by their `valid` time. */
    fun frames(): Set<String> = runCatching { File(dir, FRAMES).readLines().filter { it.isNotBlank() }.toSet() }.getOrDefault(emptySet())

    /** What the kept tiles take on the phone, bytes. */
    fun bytes(): Long = dir.listFiles()?.sumOf { it.length() } ?: 0L

    /** The frame's tiles over the box fetched and kept, the last frame's
     *  let go first; how many were kept. Stops at MAX_BYTES. */
    suspend fun keep(client: OkHttpClient, frame: LoopFrame, south: Double, west: Double, north: Double, east: Double): Int = withContext(Dispatchers.IO) {
        dir.deleteRecursively()
        dir.mkdirs()
        var bytes = 0L
        var kept = 0
        for (template in listOfNotNull(frame.radarTiles, frame.satelliteTiles)) {
            for (tile in tiles(south, west, north, east)) {
                if (bytes >= MAX_BYTES) break
                val url = url(template, tile)
                val got = try {
                    client.newCall(Request.Builder().url(url).build()).executeAsync().use { r -> if (r.isSuccessful) r.body.bytes() else null }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: IOException) {
                    null
                } ?: continue
                file(url).writeBytes(got)
                bytes += got.size
                kept++
            }
        }
        if (kept > 0) File(dir, FRAMES).writeText(frame.valid)
        kept
    }

    companion object {
        /** The most tiles a layer keeps, and the most bytes in all: a radar
         *  tile is some 5 to 30 kB, so a route's loop stays near the size of
         *  one airport diagram or two. */
        const val MAX_TILES = 300
        const val MAX_BYTES = 12_000_000L

        /** The zooms kept: the map's widest view of the loop (MapStyle's
         *  zoom 3 on the chart) to the radar's own deepest (WeatherLoopLayer). */
        const val MIN_Z = 4
        const val MAX_Z = 10

        private const val FRAMES = "frames.txt"

        /** A frame's tile address, from its XYZ template. */
        fun url(template: String, t: Tile): String =
            template.replace("{z}", t.z.toString()).replace("{x}", t.x.toString()).replace("{y}", t.y.toString())

        /** The XYZ tiles over the box, whole zoom levels from MIN_Z in while
         *  the total stays within MAX_TILES (Web Mercator's tiling, as every
         *  XYZ server cuts them). */
        fun tiles(south: Double, west: Double, north: Double, east: Double): List<Tile> {
            val out = ArrayList<Tile>()
            for (z in MIN_Z..MAX_Z) {
                val (x0, x1) = TileGrid.column(west, z) to TileGrid.column(east, z)
                val (y0, y1) = TileGrid.row(north, z) to TileGrid.row(south, z)
                val level = (x0..x1).flatMap { x -> (y0..y1).map { y -> Tile(z, x, y) } }
                if (out.size + level.size > MAX_TILES) break
                out += level
            }
            return out
        }
    }
}

/** The app's OkHttp client answering a kept loop tile from the phone when
 *  the network fails; every other request passes as it came. */
class LoopTileFallback(private val store: KeptLoopTiles) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val kept = if (request.method == "GET") store.file(request.url.toString()).takeIf { it.isFile } else null
        if (kept == null) return chain.proceed(request)
        return try {
            chain.proceed(request)
        } catch (e: IOException) {
            val bytes = runCatching { kept.readBytes() }.getOrNull() ?: throw e
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("Kept for the air")
                .body(bytes.toResponseBody(IMAGE)).build()
        }
    }

    private companion object {
        val IMAGE = "image/png".toMediaType()
    }
}
