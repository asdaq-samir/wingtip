package app.wingtipmaps.android.engine

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Ahead
import app.wingtipmaps.android.api.AirspaceAt
import app.wingtipmaps.android.api.CyclePackIndex
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.ffi.packVerify
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.engine.generated.regionOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import okhttp3.coroutines.executeAsync
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import app.wingtipmaps.android.engine.ffi.ahead as packsAhead
import app.wingtipmaps.android.engine.ffi.airspaceAt as packAirspaceAt

/**
 * The cycle packs kept on the phone, a region each (wingtip.cycle_pack's
 * write_phone), so the airspace over a point, what is ahead and the
 * map's fields are answered with no connection: kept along a route with
 * its chart, and fetched again for the regions kept when the FAA's cycle
 * turns or a pack is rebuilt within it. The twin of the iOS app's
 * CyclePacks.swift. Under filesDir, not cacheDir: Android may clear the
 * cache when space is short, as it may the chart's tiles, and the packs
 * are small. The engine's readers (engine.ffi) take each pack by its
 * file's path and map it for the call, so a pan reads only the pages it
 * needs and nothing is copied.
 */
class CyclePacks(private val root: File) {
    private val indexFile = File(root, "index.json")
    private val lock = Any()

    /** The list the packs on the phone were fetched by; null before the
     *  first keep. */
    val index: CyclePackIndex?
        get() = runCatching { Gateway.json.decodeFromString<CyclePackIndex>(indexFile.readText()) }.getOrNull()

    fun path(cycle: String, region: String): File = File(root, "$cycle/$region.pack")

    /** One pack's path, or null where the phone has not got it. */
    fun pack(cycle: String, region: String): String? = path(cycle, region).takeIf { it.isFile }?.path

    /** The paths of these regions' packs of the kept cycle, those the phone has. */
    fun packs(regions: Collection<String>): List<String> {
        val index = index ?: return emptyList()
        return regions.sorted().mapNotNull { pack(index.cycle, it) }
    }

    /** The packs of these regions fetched where the phone has not got them
     *  for the planner's cycle, and the regions already kept fetched again
     *  where the cycle has turned or where a pack's contents have changed
     *  within it (its crc32 in the list is not the one in the header of the
     *  pack on disk: a pack rebuilt with more of the FAA's fields, as the
     *  special-use areas' limits were on 2026-11-12, keeps its cycle's
     *  name). The phone moves to the new cycle, and the older one is
     *  removed, only once every region it wants of the new one is on
     *  disk: a pack that failed to come leaves the old cycle's packs in
     *  use, so a pilot is never left with no airspace for the air because
     *  one fetch failed. Quiet where the planner
     *  cannot be reached: the next keep tries again, and finds the packs
     *  already fetched in the new cycle's folder. */
    suspend fun keep(wanted: Set<String>) = keeping.withLock { keepOne(wanted) }

    /** One keep at a time: the launch's refresh and the plan's keep write
     *  the same .part files and the same index. */
    private val keeping = Mutex()

    private suspend fun keepOne(wanted: Set<String>) {
        val fresh = try {
            Planner.api.cyclePacks().planned()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return
        }
        val listing = Gateway.json.encodeToString(fresh)
        val kept = index
        val names = wanted.toMutableSet()
        if (kept != null) names += keptRegions(kept.cycle)
        val listed = fresh.regions.associateBy { it.name }
        withContext(Dispatchers.IO) {
            File(root, fresh.cycle).mkdirs()
            var whole = true
            for (name in names.sorted()) {
                val region = listed[name] ?: continue
                val file = path(fresh.cycle, name)
                if (crc32(file) == region.crc32) continue
                val bytes = fetchPack(fresh.cycle, name, region.crc32)
                if (bytes == null) {
                    whole = false
                    continue
                }
                // Verified before it is kept: a pack cut short by the
                // connection is no pack, and the engine would say so on
                // every read.
                val direct = ByteBuffer.allocateDirect(bytes.size).put(bytes)
                // As a Buffer: ByteBuffer's own flip() only exists from
                // API 34, and the engine wants a direct buffer, not the array.
                (direct as java.nio.Buffer).flip()
                if (!packVerify(direct)) {
                    whole = false
                    continue
                }
                // A pack rebuilt within the cycle is renamed over the old
                // one: a read that has the old file mapped keeps it whole,
                // and the next read maps the new file.
                synchronized(lock) {
                    if (!writeWhole(file, bytes)) whole = false
                }
            }
            // The same cycle, or none kept before: what came is used as it
            // is, with nothing older to fall back on. A new cycle only when
            // whole.
            if (kept != null && kept.cycle != fresh.cycle && !whole) return@withContext
            synchronized(lock) {
                // The index written whole or not at all: a write cut short
                // would leave no index, and so no packs, for the air.
                if (!writeWhole(indexFile, listing.toByteArray())) return@withContext
                root.listFiles()?.filter { it.isDirectory && it.name != fresh.cycle }?.forEach { it.deleteRecursively() }
            }
        }
    }

    /** A file written beside itself (.part) and renamed over, so a reader
     *  sees the old file or the new one whole, never half of one. */
    private fun writeWhole(file: File, bytes: ByteArray): Boolean {
        val part = File(file.path + ".part")
        val written = runCatching { part.writeBytes(bytes) }.isSuccess && part.renameTo(file)
        if (!written) part.delete()
        return written
    }

    /** The packs kept again for a new cycle, or changed within it, where
     *  the phone has any. */
    suspend fun refresh() {
        val kept = index ?: return
        if (keptRegions(kept.cycle).isEmpty()) return
        keep(emptySet())
    }

    /** The crc32 in the address: the pack is kept as long as its cycle by
     *  the phone's cache and the edge's, which a pack rebuilt within the
     *  cycle would otherwise be answered from. */
    private suspend fun fetchPack(cycle: String, region: String, crc32: Long): ByteArray? {
        val request = Planner.get("/api/cycle-pack/$cycle/$region.pack", mapOf("crc32" to crc32.toString()))
        return runCatching {
            Gateway.streaming.newCall(request).executeAsync().use { response ->
                if (response.code != 200) null else response.body.bytes()
            }
        }.getOrNull()
    }

    private fun keptRegions(cycle: String): Set<String> =
        File(root, cycle).listFiles()?.filter { it.extension == "pack" }?.map { it.nameWithoutExtension }?.toSet() ?: emptySet()

    /** Every pack the phone keeps of the cycle, by path: the regions its
     *  routes cross, for a clearance's places to be found in the air. */
    fun keptPacks(): List<String> {
        val index = index ?: return emptyList()
        return packs(keptRegions(index.cycle))
    }

    /** The airspace over a point from the packs on the phone; null where
     *  its region's pack was never kept. A region the list has no pack of
     *  has nothing drawn in it, and is answered by the rules alone. */
    fun airspaceAt(lat: Double, lon: Double, groundFt: Double? = null): AirspaceAt? {
        val index = index ?: return null
        val region = Engine.regionOf(lat, lon).getOrThrow()
        val pack = if (index.regions.none { it.name == region }) null else pack(index.cycle, region) ?: return null
        val json = packAirspaceAt(pack, lat, lon, groundFt) ?: return null
        return runCatching { Gateway.json.decodeFromString<AirspaceAt>(json) }.getOrNull()
    }

    /** The alerts ahead with no network (the engine's ahead): what the planner's
     *  /api/airspace/ahead answers, worked out on the phone from the packs
     *  round the airplane. Null where no pack round the point was ever
     *  kept. The obstacles are the planner's alone and the TFRs are not
     *  kept on the phone yet: both are said to be missing, never clear. */
    fun ahead(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?, nowMs: Long = AppClock.nowMs()): Ahead? {
        // The regions within a third of a degree: five minutes' track at
        // 200 kt is 17 nm, a quarter of a degree.
        val names = HashSet<String>()
        for (dlat in listOf(-0.3, 0.0, 0.3)) {
            for (dlon in listOf(-0.3, 0.0, 0.3)) names += Engine.regionOf(lat + dlat, lon + dlon).getOrThrow()
        }
        val packs = packs(names)
        if (packs.isEmpty()) return null
        val json = packsAhead(packs, lat, lon, trackDeg, groundspeedKt, altitudeFt, 0.0, nowMs / 1000, null, null)
        return runCatching { Gateway.json.decodeFromString<Ahead>(json) }.getOrNull()
    }

    companion object {
        /** The crc32 a pack on disk was written with: its header's, at byte
         *  36, little-endian (wingtip.cycle_pack's write_phone, which lists
         *  the same figure in /api/cycle-packs). Null where there is no
         *  whole header. */
        fun crc32(file: File): Long? =
            runCatching {
                RandomAccessFile(file, "r").use { f ->
                    if (f.length() < 40) return@use null
                    f.seek(36)
                    val b = ByteArray(4).also { f.readFully(it) }
                    ByteBuffer.wrap(b).order(java.nio.ByteOrder.LITTLE_ENDIAN).int.toLong() and 0xFFFF_FFFFL
                }
            }.getOrNull()

        @Volatile
        private var shared: CyclePacks? = null

        /** The app's store, made at launch (WingtipApplication); none in a
         *  JVM test, where nothing is kept. */
        val current: CyclePacks? get() = shared

        /** The app's one store of packs, under filesDir/cycle-packs. */
        fun of(context: Context): CyclePacks =
            shared ?: synchronized(this) {
                shared ?: CyclePacks(File(context.applicationContext.filesDir, "cycle-packs")).also { shared = it }
            }

        /** The regions a route's corridor crosses: the region of each point
         *  along it, two nm apart, and of points a tenth of a degree (6 nm)
         *  either side, as its chart is kept five nm either side. The line
         *  is pairs of latitude and longitude, as /api/course gives it. */
        fun regions(line: List<List<Double>>): Set<String> {
            val names = HashSet<String>()
            for ((lat, lon) in samples(line, everyNm = 2.0).getOrThrow()) {
                for (dlat in listOf(-0.1, 0.0, 0.1)) {
                    for (dlon in listOf(-0.1, 0.0, 0.1)) names += Engine.regionOf(lat + dlat, lon + dlon).getOrThrow()
                }
            }
            return names
        }

        /** Points along a line every so many nm, with both its ends: the
         *  course line's legs are short enough that a straight cut between
         *  two of its points is within a tenth of a mile of the circle.
         *  Each leg's length is the engine's `distance_nm`; where it cannot
         *  say (Engine.rule has logged why), the whole fails, as a line
         *  sampled short would leave out a region it crosses. */
        fun samples(line: List<List<Double>>, everyNm: Double): Result<List<Pair<Double, Double>>> = runCatching {
            val out = ArrayList<Pair<Double, Double>>()
            for (i in line.indices) {
                val (lat, lon) = line[i][0] to line[i][1]
                if (i > 0) {
                    val (lat0, lon0) = line[i - 1][0] to line[i - 1][1]
                    val nm = Engine.distanceNm(lat0, lon0, lat, lon).getOrThrow()
                    val steps = (nm / everyNm).toInt()
                    for (s in 1 until steps) {
                        val f = s / steps.toDouble()
                        out += (lat0 + (lat - lat0) * f) to (lon0 + (lon - lon0) * f)
                    }
                }
                out += lat to lon
            }
            out
        }
    }
}
