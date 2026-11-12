package app.wingtipmaps.android

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.ChartInfo
import app.wingtipmaps.android.api.ChartLayer
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.tiles.TileTemplate
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.io.File
import javax.inject.Inject

/**
 * Which chart the map draws (/api/chart): its cycle, its layers and where
 * its tiles are, as the iOS app's Charts.swift keeps it; and the cycle's
 * overlay tiles (/api/overlay-tiles), the airspace, airports and navaids
 * the map draws over it per tile, as the web's map does. Each kept from
 * the last answer in the app's files, so the map draws from its tile
 * cache with no connection at all, and its first style has the overlays
 * in it from the start.
 */
@HiltViewModel
class Charts @Inject constructor(app: Application) : AndroidViewModel(app) {
    private val kept = File(app.filesDir, "chart.json")

    private val _info = MutableStateFlow<ChartInfo?>(null)
    val info: StateFlow<ChartInfo?> = _info.asStateFlow()

    private val keptOverlays = File(app.filesDir, "overlay-tiles.json")

    /** The cycle's overlay tiles; null where the planner has built none. */
    private val _overlays = MutableStateFlow<OverlayTiles?>(null)
    val overlays: StateFlow<OverlayTiles?> = _overlays.asStateFlow()

    /** Whether the map need wait no longer for the overlays to put them in
     *  its first style: they were kept, the planner answered (with an
     *  archive or none) or could not be reached, or FIRST_STYLE_WAIT_MS
     *  went by, after which the map is made without them and they come
     *  in as they arrive (the web's GlMapShell does the same). */
    private val _overlaysSettled = MutableStateFlow(false)
    val overlaysSettled: StateFlow<Boolean> = _overlaysSettled.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    init {
        load()
    }

    fun load() {
        loadOverlays()
        viewModelScope.launch {
            if (_info.value == null) {
                val last = withContext(Dispatchers.IO) {
                    runCatching { Gateway.json.decodeFromString<ChartInfo>(kept.readText()) }.getOrNull()
                }
                if (last != null) _info.value = last
            }
            try {
                val fresh = Planner.chart()
                _info.value = fresh
                _problem.value = null
                withContext(Dispatchers.IO) {
                    runCatching { kept.writeText(Gateway.json.encodeToString(fresh)) }
                }
                // The airspace kept for the air, fetched again where the
                // FAA's cycle has turned since it was, as the iOS app's
                // Charts.load does; a job of its own beside this one.
                launch { CyclePacks.of(getApplication<Application>()).refresh() }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Offline, or the planner down: the kept chart stands.
                _problem.value = if (_info.value == null) Problems.say("The chart could not be fetched", e) else null
            }
        }
    }

    private fun loadOverlays() {
        viewModelScope.launch {
            if (_overlays.value == null) {
                val last = withContext(Dispatchers.IO) {
                    runCatching { Gateway.json.decodeFromString<OverlayTiles>(keptOverlays.readText()) }.getOrNull()
                }
                if (last != null) {
                    _overlays.value = last
                    _overlaysSettled.value = true
                }
            }
            val wait = launch {
                delay(FIRST_STYLE_WAIT_MS)
                _overlaysSettled.value = true
            }
            try {
                val fresh = Planner.overlayTiles()
                _overlays.value = fresh
                withContext(Dispatchers.IO) {
                    runCatching { if (fresh == null) keptOverlays.delete() else keptOverlays.writeText(Gateway.json.encodeToString(fresh)) }
                }
                if (fresh != null) launch { keepForTheAir(fresh) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Offline, or the planner down: the kept archive stands, and
                // the map is drawn without overlays where none was kept.
            } finally {
                wait.cancel()
                _overlaysSettled.value = true
            }
        }
    }

    /**
     * The cycle's archive kept for the air (OverlayStore): another
     * archive's ranges dropped, and the whole of this one fetched while the
     * phone is on an unmetered network (Wi-Fi at home or at the FBO), so
     * the overlays draw over the whole country with no signal; on a
     * metered one only the ranges the map reads are kept, as it reads
     * them. A fetch cut off carries on the next time.
     */
    private suspend fun keepForTheAir(tiles: OverlayTiles) {
        val store = Gateway.overlayStore
        withContext(Dispatchers.IO) { runCatching { store.keepOnly(tiles.name) } }
        if (store.hasWhole(tiles.name, tiles.bytes) || !unmetered()) return
        val url = (Config.gateway + Config.plannerPath("/api/overlay-tiles/${tiles.name}.pmtiles")).toHttpUrl()
        val _ = runCatching { store.download(Gateway.streaming, url, tiles.name, tiles.bytes) }
    }

    private fun unmetered(): Boolean {
        val connectivity = getApplication<Application>().getSystemService(ConnectivityManager::class.java) ?: return false
        val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    }

    companion object {
        /** The longest the map waits for the overlays' name before its
         *  first style, the web's FIRST_STYLE_WAIT_MS. */
        const val FIRST_STYLE_WAIT_MS = 1_500L

        /** The terminal sheet that belongs over the base chart -- the
         *  terminal area chart over the sectional -- with its zooms
         *  (apps/web/src/lib/map/tiles.ts chartPair's overlay): drawn at every
         *  zoom it exists at while Setup's switch pins it. */
        data class Terminal(val template: TileTemplate, val minZoom: Int, val maxZoom: Int)

        fun terminal(info: ChartInfo?, density: Float = 1f): Terminal? {
            val base = base(info) ?: return null
            val layer = info!!.chartLayers.firstOrNull { !it.base && it.over.orEmpty().contains(base.kind) } ?: return null
            val scale = if (density > 1f && layer.scales?.contains(2) == true) 2 else 1
            return Terminal(TileTemplate(info.chartCycle, info.chartRevision ?: 0, info.chartTilesBase, layer.kind, scale), layer.minZoom, layer.maxZoom)
        }

        /** The sectional, the base layer the map opens on
         *  (apps/web/src/lib/map/tiles.ts chartPair: "sec", else the first base
         *  layer). */
        fun base(info: ChartInfo?): ChartLayer? {
            val layers = info?.chartLayers ?: return null
            return layers.firstOrNull { it.kind == "sec" } ?: layers.firstOrNull { it.base }
        }

        /** The base layer's tile address; the 512-pixel tiles on a screen
         *  denser than 1x ([density], the screen's pixels to a dp) wherever
         *  the kind was drawn at them. */
        fun template(info: ChartInfo?, density: Float = 1f): TileTemplate? {
            val base = base(info) ?: return null
            val scale = if (density > 1f && base.scales?.contains(2) == true) 2 else 1
            return TileTemplate(info!!.chartCycle, info.chartRevision ?: 0, info.chartTilesBase, base.kind, scale)
        }
    }
}
