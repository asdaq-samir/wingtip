package app.wingtipmaps.android.offline

import android.app.Application
import android.os.StatFs
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import app.wingtipmaps.android.Config
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.OfflineBox
import app.wingtipmaps.android.api.generated.OfflineCatalog
import app.wingtipmaps.android.api.generated.OfflineRegion
import app.wingtipmaps.android.api.generated.OfflineRegionFiles
import app.wingtipmaps.android.engine.CyclePacks
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrl
import javax.inject.Inject

/**
 * The Downloads screen's state (Setup → Downloads), as the iOS app's
 * DownloadsModel: what the planner can cut (/api/offline-charts), the
 * chart kinds and density picked, the regions kept and how far each has
 * come, and the calls that keep, update and delete them.
 */
@HiltViewModel
class DownloadsModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    private val store = OfflineStore.of(app)
    private val prefs = Kept.of(app, "offline")

    private val _catalog = MutableStateFlow<OfflineCatalog?>(null)
    val catalog: StateFlow<OfflineCatalog?> = _catalog.asStateFlow()
    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()
    private val _busy = MutableStateFlow<Set<String>>(emptySet())
    val busy: StateFlow<Set<String>> = _busy.asStateFlow()
    val kept: StateFlow<List<OfflineKept>> = store.kept

    private val _picked = MutableStateFlow(prefs[KINDS] ?: setOf("sec", "tac"))
    val picked: StateFlow<Set<String>> = _picked.asStateFlow()
    private val _scale = MutableStateFlow(prefs[SCALE] ?: if (app.resources.displayMetrics.density >= 2f) 2 else 1)
    val scale: StateFlow<Int> = _scale.asStateFlow()

    /** Bytes written so far of each region under way, by its id. */
    val written: StateFlow<Map<String, Long>> = WorkManager.getInstance(app).getWorkInfosByTagFlow(OfflineWorker.TAG)
        .map { infos ->
            infos.filter { it.state == WorkInfo.State.RUNNING }.groupBy { info ->
                info.tags.firstOrNull { it.startsWith("${OfflineWorker.TAG}:") }?.removePrefix("${OfflineWorker.TAG}:") ?: ""
            }.mapValues { (_, list) -> list.sumOf { it.progress.getLong(OfflineWorker.WRITTEN, 0) } }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    fun setPicked(kind: String, on: Boolean) {
        _picked.value = if (on) _picked.value + kind else _picked.value - kind
        prefs.edit { it[KINDS] = _picked.value }
    }

    fun setScale(value: Int) {
        _scale.value = value
        prefs.edit { it[SCALE] = value }
    }

    /** The archive names the picks give ("sec@2x", "tac@2x"). */
    fun archives(picked: Set<String> = _picked.value, scale: Int = _scale.value): List<String> =
        KINDS_IN_ORDER.filter { it in picked }.map { OfflineStore.archive(it, scale) }

    fun load() = viewModelScope.launch {
        store.sweep()
        runCatching { Gateway.json.decodeFromString(OfflineCatalog.serializer(), Planner.fetch("/api/offline-charts")) }
            .onSuccess { _catalog.value = it; _problem.value = null }
            .onFailure { _problem.value = Problems.say("The regions could not be listed", it) }
    }

    /** A region of the cycle kept: its files listed, the picked archives it
     *  has tiles of queued, its cycle packs and the overlays' archive fetched. */
    fun download(regionId: String, cycle: String? = _catalog.value?.cycle, picked: Set<String> = _picked.value, scale: Int = _scale.value) =
        viewModelScope.launch {
            val at = cycle ?: return@launch
            _busy.value += regionId
            try {
                val files = Gateway.json.decodeFromString(OfflineRegionFiles.serializer(), Planner.fetch("/api/offline-charts/$at/$regionId"))
                val wanted = archives(picked, scale)
                val chosen = files.archives.filter { it.archive in wanted }
                if (chosen.isEmpty()) {
                    _problem.value = "${files.region.name} has none of the charts picked in $at."
                    return@launch
                }
                val entry = OfflineKept(files.region.id, files.region.name, files.cycle, files.expires, files.region.boxes,
                    chosen.associate { it.archive to it.bytes }, packs = files.packs.map { it.name })
                store.update(entry.id) { old -> entry.copy(done = old?.done.orEmpty().filter { it in entry.wanted }) }
                for (a in chosen) {
                    OfflineWorker.enqueue(getApplication(), files.cycle, files.region.id, a.archive, Config.gateway + Config.plannerPath(a.url), a.bytes)
                }
                CyclePacks.of(getApplication()).keep(entry.packs.toSet())
                _catalog.value?.overlay?.let { overlay ->
                    val url = (Config.gateway + Config.plannerPath("/api/overlay-tiles/${overlay.name}.pmtiles")).toHttpUrl()
                    val _ = runCatching { Gateway.overlayStore.download(Gateway.streaming, url, overlay.name, overlay.bytes) }
                }
                _problem.value = null
            } catch (e: Exception) {
                _problem.value = Problems.say("The region could not be fetched", e)
            } finally {
                _busy.value -= regionId
            }
        }

    /** The newest cycle to keep: the next one where the planner has it. */
    val newestCycle: String? get() = _catalog.value?.let { it.nextCycle ?: it.cycle }

    fun updatable(kept: OfflineKept, all: List<OfflineKept>): Boolean {
        val newest = newestCycle ?: return false
        return OfflineStore.sortable(newest) > OfflineStore.sortable(kept.cycle) && all.none { it.region == kept.region && it.cycle == newest }
    }

    /** The same kinds and density fetched for `cycle`: an update, or the
     *  region's own cycle again after a download stopped. */
    fun keep(kept: OfflineKept, cycle: String) {
        if (cycle == kept.cycle) store.update(kept.id) { it?.copy(failed = null) }
        val kinds = kept.wanted.keys.map { it.substringBefore("@") }.toSet()
        download(kept.region, cycle, kinds, if (kept.wanted.keys.any { it.endsWith("@2x") }) 2 else 1)
    }

    fun delete(kept: OfflineKept) {
        OfflineWorker.cancel(getApplication(), kept.cycle, kept.region)
        store.update(kept.id) { null }
    }

    /** A box on the map as a region of its own (/api/offline-box). */
    fun downloadBox(west: Double, south: Double, east: Double, north: Double) = viewModelScope.launch {
        runCatching {
            val q = mapOf("west" to "$west", "south" to "$south", "east" to "$east", "north" to "$north")
            Gateway.json.decodeFromString(OfflineBox.serializer(), Planner.fetch("/api/offline-box", q)).id
        }.onSuccess { download(it) }.onFailure { _problem.value = "The view could not be kept: ${it.message}" }
    }

    fun storageUsed(): Long = store.bytes()
    fun storageFree(): Long = runCatching { StatFs(store.root.parentFile!!.path).availableBytes }.getOrDefault(0)

    companion object {
        private val KINDS = stringSetPreferencesKey("kinds")
        private val SCALE = intPreferencesKey("scale")
        /** The chart kinds a download holds, in the map's order. */
        val KINDS_IN_ORDER = listOf("sec", "tac", "ifr_low", "ifr_high", "ifr_area")

        /** A region's size with the picks, where the planner has sized it. */
        fun size(region: OfflineRegion, archives: List<String>): Long? =
            if (region.sizes.isEmpty()) null else archives.sumOf { region.sizes[it] ?: 0L }
    }
}
