package app.wingtipmaps.android.offline

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.dataCycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * A region's charts kept on the phone (Setup → Downloads), as the iOS
 * app's OfflineKept: which region of which cycle, the archives wanted
 * with their sizes and those on disk whole, and its cycle packs.
 */
@Serializable
data class OfflineKept(
    val region: String,
    val name: String,
    val cycle: String,
    /** The ISO day the cycle is replaced (the planner's, from the engine's
     *  data_cycle on the FAA's 56-day chart schedule). */
    val expires: String? = null,
    val boxes: List<List<Double>>,
    val wanted: Map<String, Long>,
    val done: List<String> = emptyList(),
    val packs: List<String> = emptyList(),
    val failed: String? = null,
) {
    val id: String get() = "$cycle/$region"
    val complete: Boolean get() = done.toSet() == wanted.keys
    val bytes: Long get() = wanted.values.sum()

    /** Past its date: the engine's `data_cycle` on the FAA's 56-day chart
     *  schedule, asked at the minute, as an edition is replaced at 0901Z on
     *  the next one's date ("Effective 0901 UTC"). The rule was worked out
     *  here as `expires` plus nine hours and a minute. Said on the list,
     *  never removed for it alone (warn, never limit; decision 0008). */
    fun expired(now: Instant = AppClock.javaNow()): Boolean {
        val effective = isoDay(cycle) ?: return false
        val answer = Engine.dataCycle(kind = "chart", effective = effective, on = now.truncatedTo(ChronoUnit.SECONDS).toString()).getOrNull()
        return answer?.state == "expired"
    }

    /** Whether the cycle has taken over by `now`: in force, or since
     *  replaced (the engine's `data_cycle`, 0901Z on its date). A region of
     *  the next cycle kept ahead is drawn from then on (OfflineStore.keptInForce). */
    fun begun(now: Instant = AppClock.javaNow()): Boolean {
        val effective = isoDay(cycle) ?: return false
        val state = Engine.dataCycle(kind = "chart", effective = effective, on = now.truncatedTo(ChronoUnit.SECONDS).toString()).getOrNull()?.state
        return state == "in_force" || state == "expired"
    }

    companion object {
        /** A chart cycle's name, "10-29-2026" as the FAA's links write it, as
         *  "2026-10-29"; null where it is no such name. */
        fun isoDay(cycle: String): String? {
            val parts = cycle.split("-")
            if (parts.size != 3 || parts.any { it.toIntOrNull() == null }) return null
            return "${parts[2]}-${parts[0]}-${parts[1]}"
        }
    }
}

/**
 * The downloaded regions on disk: one PMTiles archive per chart kind and
 * density of each (<root>/<cycle>/<region>/<archive>.pmtiles) and the
 * list of them (manifest.json), in the app's files, which the system
 * never clears for space. MapLibre reads them itself (`pmtiles://file://`,
 * OfflineLayers), over the network's tiles; the overlays' archive is the
 * map's own OverlayStore, fetched whole with a region.
 */
class OfflineStore(val root: File) {
    private val manifest = File(root, "manifest.json")
    private val serializer = ListSerializer(OfflineKept.serializer())
    private val json = Json { ignoreUnknownKeys = true }
    private val _kept = MutableStateFlow(read())
    /** Kept cycles known to have begun: once begun, always. */
    private val begun = ConcurrentHashMap.newKeySet<String>()
    val kept: StateFlow<List<OfflineKept>> = _kept.asStateFlow()

    private fun read(): List<OfflineKept> =
        runCatching { json.decodeFromString(serializer, manifest.readText()) }.getOrDefault(emptyList())

    fun path(cycle: String, region: String, archive: String): File = File(root, "$cycle/$region/$archive.pmtiles")

    /** Every region kept, newest cycle first, by name. */
    fun all(): List<OfflineKept> = _kept.value.sortedWith(compareByDescending<OfflineKept> { sortable(it.cycle) }.thenBy { it.name })

    /** One region changed, added, or (null) removed with its files. */
    @Synchronized
    fun update(id: String, change: (OfflineKept?) -> OfflineKept?) {
        val list = _kept.value.toMutableList()
        val before = list.firstOrNull { it.id == id }
        val after = change(before)
        list.removeAll { it.id == id }
        if (after != null) list += after
        if (after == null && before != null) File(root, "${before.cycle}/${before.region}").deleteRecursively()
        root.mkdirs()
        val temp = File(root, "manifest.json.tmp")
        temp.writeText(json.encodeToString(serializer, list))
        temp.renameTo(manifest)
        _kept.value = list
    }

    /** A downloaded file moved into its place, and its archive marked done. */
    fun finish(cycle: String, region: String, archive: String, file: File) {
        val target = path(cycle, region, archive)
        target.parentFile?.mkdirs()
        target.delete()
        check(file.renameTo(target)) { "could not keep $archive of $region" }
        update("$cycle/$region") { it?.copy(done = (it.done + archive).distinct(), failed = null) }
    }

    /**
     * The newest kept cycle later than `cycle` that has taken over by
     * `now`, null where none has: the phone offline across a changeover,
     * its chart answer still the old cycle's, draws the next cycle where a
     * region of it is kept, from 0901Z on its date (the data-cycles
     * audit's 14, the owner's word 2026-11-21). Past the region the old
     * chart stays, and Ready to Fly says it is out of date. The iPhone's
     * OfflineStore.keptInForce.
     */
    fun keptInForce(cycle: String, now: Instant = AppClock.javaNow()): String? =
        _kept.value.filter { sortable(it.cycle) > sortable(cycle) }.distinctBy { it.cycle }
            .sortedByDescending { sortable(it.cycle) }
            .firstOrNull { it.cycle in begun || it.begun(now).also { b -> if (b) begun += it.cycle } }?.cycle

    /**
     * The archives the map draws for a chart kind of the cycle: each
     * region's at the density asked for, else at the other (a 256-pixel
     * tile covers the same 256 dp, OfflineLayers), whole ones only; and
     * after them, drawn over them, those of the kept cycle in force where
     * it is later (`keptInForce`).
     */
    fun archives(cycle: String, kind: String, scale: Int, now: Instant = AppClock.javaNow()): List<File> =
        listOfNotNull(cycle, keptInForce(cycle, now)).flatMap { drawn ->
            _kept.value.filter { it.cycle == drawn }.mapNotNull { kept ->
                listOf(archive(kind, scale), archive(kind, if (scale == 1) 2 else 1))
                    .firstOrNull { it in kept.done }?.let { path(drawn, kept.region, it) }?.takeIf { it.isFile }
            }
        }

    /** The bytes on disk, for the list's Storage Used. */
    fun bytes(): Long = root.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    /** A cycle gone by removed where the same region of a newer cycle is
     *  whole on the phone: the update replaces it. One not yet updated is
     *  kept and said to be expired, so a pilot with no signal on the
     *  changeover day still has a chart. */
    fun sweep(now: Instant = AppClock.javaNow()) {
        val list = all()
        for (old in list.filter { it.expired(now) }) {
            if (list.any { it.region == old.region && it.complete && sortable(it.cycle) > sortable(old.cycle) }) update(old.id) { null }
        }
    }

    companion object {
        fun archive(kind: String, scale: Int): String = if (scale == 1) kind else "$kind@${scale}x"

        /** A chart cycle's name ("10-29-2026") as a sortable "2026-10-29". */
        fun sortable(cycle: String): String {
            val p = cycle.split("-")
            return if (p.size == 3) "${p[2]}-${p[0]}-${p[1]}" else cycle
        }

        @Volatile
        private var shared: OfflineStore? = null

        fun of(context: Context): OfflineStore =
            shared ?: synchronized(this) {
                shared ?: OfflineStore(File(context.applicationContext.filesDir, "offline-charts")).also { shared = it }
            }
    }
}
