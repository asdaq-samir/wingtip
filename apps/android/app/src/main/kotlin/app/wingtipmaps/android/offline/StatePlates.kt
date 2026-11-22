package app.wingtipmaps.android.offline

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.generated.FlightPlates
import app.wingtipmaps.android.api.generated.PlateStateCharts
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

/**
 * A state's plates kept on the phone (Setup → Downloads → Plates), as the
 * web's KeptState: its d-TPP cycle and when the next takes over (0901Z on
 * its AIRAC date, as the planner gave it from the engine's data_cycle),
 * how many of its charts are done and how many failed, and the bytes it
 * takes. `unlisted` where the planner could not list its charts.
 */
@Serializable
data class KeptState(
    val id: String,
    val name: String,
    val cycle: String,
    val nextAt: String,
    val charts: Int,
    val fields: Int = 0,
    val done: Int = 0,
    val failed: Int = 0,
    val bytes: Long = 0,
    val unlisted: Boolean = false,
) {
    /** The fetch stopped short of its every chart. */
    val unfinished: Boolean get() = done < charts

    val progress: Float get() = if (charts <= 0) 0f else (done.toFloat() / charts).coerceIn(0f, 1f)

    /** Its cycle replaced at `now`: the next one's 0901Z has come. No
     *  AIRAC arithmetic here; the instant is the planner's. */
    fun replaced(now: Instant = AppClock.javaNow()): Boolean =
        runCatching { !Instant.parse(nextAt).isAfter(now) }.getOrDefault(false)
}

/**
 * The kept states' record (states.json) and each state's chart list of
 * each cycle as the planner gave it (lists/<state>/<cycle>.json), in the
 * app's files beside OfflineStore's, which the system never clears for
 * space. The lists are kept so a state is deleted with no signal.
 */
class StatePlatesStore(val root: File) {
    private val manifest = File(root, "states.json")
    private val serializer = ListSerializer(KeptState.serializer())
    private val _kept = MutableStateFlow(read())
    val kept: StateFlow<List<KeptState>> = _kept.asStateFlow()

    private fun read(): List<KeptState> =
        runCatching { KeptForAir.JSON.decodeFromString(serializer, manifest.readText()) }.getOrDefault(emptyList())

    fun get(id: String): KeptState? = _kept.value.firstOrNull { it.id == id }

    /** One state changed, added, or (null) removed from the record. */
    @Synchronized
    fun update(id: String, change: (KeptState?) -> KeptState?) {
        val list = _kept.value.filter { it.id != id } + listOfNotNull(change(get(id)))
        val sorted = list.sortedBy { it.name }
        root.mkdirs()
        // Written beside and moved over, so a kill mid-write leaves the last.
        val temp = File(root, "states.json.tmp")
        temp.writeText(KeptForAir.JSON.encodeToString(serializer, sorted))
        temp.renameTo(manifest)
        _kept.value = sorted
    }

    private fun listsOf(id: String) = File(File(root, "lists"), KeptForAir.safe(id))
    private fun listFile(cycle: String, id: String) = File(listsOf(id), "${KeptForAir.safe(cycle)}.json")

    fun list(cycle: String, id: String): PlateStateCharts? =
        runCatching { KeptForAir.JSON.decodeFromString(PlateStateCharts.serializer(), listFile(cycle, id).readText()) }.getOrNull()

    /** Every list kept of a state, of whatever cycle (an update's too). */
    fun lists(id: String): List<PlateStateCharts> =
        listsOf(id).listFiles().orEmpty().mapNotNull { f -> runCatching { KeptForAir.JSON.decodeFromString(PlateStateCharts.serializer(), f.readText()) }.getOrNull() }

    fun saveList(list: PlateStateCharts) {
        val to = listFile(list.cycle, list.id).apply { parentFile?.mkdirs() }
        to.writeText(KeptForAir.JSON.encodeToString(PlateStateCharts.serializer(), list))
    }

    fun dropList(cycle: String, id: String) {
        listFile(cycle, id).delete()
    }

    companion object {
        @Volatile
        private var shared: StatePlatesStore? = null

        fun dir(context: Context): File = File(context.applicationContext.filesDir, "plate-states")

        fun of(context: Context): StatePlatesStore =
            shared ?: synchronized(this) { shared ?: StatePlatesStore(dir(context)).also { shared = it } }
    }
}

/**
 * The FAA's plates kept a state at a time, as ForeFlight and Garmin Pilot
 * download them (the market-gap audit's 3; the web's statePlates): the
 * planner lists a state's open fields and their charts of the cycle in
 * force (wingtip.plate_sets), and each chart is kept as this phone opens
 * it (ChartKeeper). From its cycle's replacement a kept state is fetched
 * again for the cycle the planner then serves, the old cycle's charts
 * deleted once the new one is done (StatePlatesWorker runs it).
 */
object StatePlates {
    /** The record written every this many charts, not each one. */
    private const val WRITE_EVERY = 20

    fun urls(list: PlateStateCharts): List<String> = list.fields.flatMap { f -> f.charts.map { it.url } }.distinct()

    /** The charts every other kept set holds: the other states' and the
     *  flights' Keep for the Air kept (KeepForAir's records). */
    fun held(store: StatePlatesStore, kept: KeptForAir, except: String): Set<String> =
        store.kept.value.filter { it.id != except }.flatMap { k -> store.list(k.cycle, k.id)?.let(::urls).orEmpty() }.toSet() +
            kept.entries(KeptForAir.PLATES).flatMap { e ->
                runCatching { KeptForAir.JSON.decodeFromString(FlightPlates.serializer(), e.body) }.getOrNull()?.fields.orEmpty().flatMap { f -> f.charts.map { it.url } }
            }

    /**
     * A state's plates of `cycle` kept, going on from a stop (a chart on
     * the phone already is not fetched again). A new state's record shows
     * its progress as it goes; an update leaves the old cycle's record as
     * it was until every chart of the new one has been asked, then the old
     * cycle's charts not `held` elsewhere are deleted. False where the
     * charts could not be listed.
     */
    suspend fun keep(
        store: StatePlatesStore, keeper: ChartKeeper, planner: PlatesPlanner, id: String, cycle: String,
        held: () -> Set<String>, progress: suspend (done: Int, charts: Int) -> Unit = { _, _ -> },
    ): Boolean {
        val before = store.get(id)
        val fresh = before == null || before.cycle == cycle
        val list = try {
            store.list(cycle, id) ?: planner.state(cycle, id).also(store::saveList)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            store.update(id) { it?.copy(unlisted = true) }
            return false
        }
        val urls = urls(list)
        var record = KeptState(id, list.name, list.cycle, list.nextAt, urls.size, list.fields.size, bytes = before?.takeIf { fresh }?.bytes ?: 0)
        if (fresh) store.update(id) { record }
        val done = AtomicInteger()
        val failed = AtomicInteger()
        keeper.keepAll(urls) { ok ->
            if (!ok) failed.incrementAndGet()
            val n = done.incrementAndGet()
            if (n % WRITE_EVERY == 0) {
                if (fresh) store.update(id) { record.copy(done = n, failed = failed.get()) }
                progress(n, urls.size)
            }
        }
        record = record.copy(done = urls.size, failed = failed.get(), bytes = urls.sumOf { keeper.file(it).length() })
        store.update(id) { record }
        progress(urls.size, urls.size)
        if (before != null && !fresh) {
            store.list(before.cycle, id)?.let { old -> keeper.delete(urls(old), held() + urls) }
            store.dropList(before.cycle, id)
        }
        return true
    }

    /** A kept state deleted: its record, and every list of it with their
     *  charts but those `held` by another kept set. */
    fun delete(store: StatePlatesStore, keeper: ChartKeeper, id: String, held: Set<String>) {
        store.update(id) { null }
        for (list in store.lists(id)) {
            keeper.delete(urls(list), held)
            store.dropList(list.cycle, id)
        }
    }

    /**
     * The fetches due at `now`, each a state and the cycle to keep: one
     * whose cycle has been replaced, of the cycle the planner now serves
     * (once it serves a new one), and one stopped short or never listed,
     * of its own. None for those `running` already.
     */
    suspend fun due(store: StatePlatesStore, planner: PlatesPlanner, now: Instant, running: Set<String> = emptySet()): List<Pair<String, String>> {
        val due = store.kept.value.filter { it.id !in running && (it.replaced(now) || it.unfinished || it.unlisted) }
        if (due.isEmpty()) return emptyList()
        val latest = if (due.any { it.replaced(now) }) {
            try {
                planner.states().cycle
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }
        return due.mapNotNull { k ->
            val cycle = latest?.takeIf { k.replaced(now) } ?: k.cycle
            if (cycle != k.cycle || k.unfinished || k.unlisted) k.id to cycle else null
        }
    }

    /** "24 Dec 0901Z", when a cycle is replaced, from the planner's
     *  instant; as sent where it is none. */
    fun until(nextAt: String): String =
        runCatching { UNTIL.format(Instant.parse(nextAt)) }.getOrDefault(nextAt)

    private val UNTIL = DateTimeFormatter.ofPattern("d MMM HHmm'Z'", Locale.US).withZone(ZoneOffset.UTC)
}
