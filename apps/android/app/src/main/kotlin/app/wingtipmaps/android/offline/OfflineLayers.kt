package app.wingtipmaps.android.offline

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.map.MapStyle
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.RasterSource
import java.io.File

/**
 * The downloaded regions' chart in the map's first style: a raster source
 * of each archive, read by MapLibre Native's own PMTiles source from the
 * file (`pmtiles://file://…`, 11.7 and later; its header gives the
 * zooms and bounds), and a layer of each straight over the network's
 * chart with the chart's own paint. Where a region is kept its tiles are
 * the archive's, signal or none; past it, the network's as before.
 */
object OfflineLayers {
    /** The id of the map's chart layer the regions go over (MapStyle.CHART). */
    const val CHART = "chart"
    const val PREFIX = "offline-"
    /** How often the map asks whether a kept cycle has taken over. */
    private const val CHANGEOVER_LOOK_MS = 60_000L

    fun url(file: File): String = "pmtiles://file://${file.absolutePath}"

    /** The archives drawn over the base chart of `cycle`: the base kind's,
     *  and, with the terminal charts on, the kind drawn over it (the TAC
     *  over the sectional, the IFR area charts over the IFR bases). */
    fun archives(store: OfflineStore, cycle: String, base: String, scale: Int, terminal: Boolean): List<File> {
        val over = if (base == "sec") "tac" else "ifr_area"
        return store.archives(cycle, base, scale) + if (terminal) store.archives(cycle, over, scale) else emptyList()
    }

    /** `style` with a source and a layer for each archive; as it was where
     *  there are none, or the style has no chart layer. */
    fun withDownloads(style: String, archives: List<File>): String {
        if (archives.isEmpty()) return style
        val root = Json.parseToJsonElement(style).jsonObject
        val layers = root["layers"]?.jsonArray ?: return style
        val chart = layers.indexOfFirst { it.jsonObject["id"]?.jsonPrimitive?.content == CHART }
        if (chart < 0) return style
        val paint = layers[chart].jsonObject["paint"] ?: JsonObject(emptyMap())
        val sources = root["sources"]?.jsonObject.orEmpty().toMutableMap()
        val added = archives.mapIndexed { i, file ->
            val id = "$PREFIX$i"
            sources[id] = buildJsonObject {
                put("type", "raster")
                put("url", url(file))
                // 256 as the chart's own source: a 512-pixel tile covers the
                // same 256 dp with two pixels to each (TileTemplate's scale).
                put("tileSize", 256)
            }
            buildJsonObject {
                put("id", id)
                put("type", "raster")
                put("source", id)
                put("paint", paint)
            }
        }
        val list = layers.toMutableList().apply { addAll(chart + 1, added) }
        return JsonObject(root + mapOf("sources" to JsonObject(sources), "layers" to JsonArray(list))).toString()
    }

    /** The regions on a style already drawn, as withDownloads puts them in a first style: the archives of the chart
     *  now (`template`, with its terminal charts or not) over the chart and its terminal chart in the chart's own
     *  paint, the ones there before taken off, and nothing else of the style touched. A region finishing or going,
     *  or a kept cycle taking over, set the whole style anew before, which dropped every source the map draws and
     *  fetched the chart, the overlays and the route again (the map speed audit, 2026-11-27). */
    fun redraw(context: Context, style: Style, template: TileTemplate, terminal: Boolean) {
        val chart = style.getLayerAs<RasterLayer>(CHART) ?: return
        val files = archives(OfflineStore.of(context), template.cycle, template.kind, template.scale, terminal).map(::url)
        val kept = style.sources.filter { it.id.startsWith(PREFIX) }
        if (kept.map { (it as? RasterSource)?.uri }.sortedBy { it } == files.sorted()) return
        style.layers.filter { it.id.startsWith(PREFIX) }.forEach { style.removeLayer(it) }
        kept.forEach { style.removeSource(it) }
        var above = if (style.getLayer(MapStyle.CHART_TERMINAL) != null) MapStyle.CHART_TERMINAL else CHART
        files.forEachIndexed { i, file ->
            val id = "$PREFIX$i"
            style.addSource(RasterSource(id, file, 256))
            val paint = arrayOf(chart.rasterFadeDuration, chart.rasterResampling, chart.rasterBrightnessMax, chart.rasterContrast, chart.rasterSaturation)
            style.addLayerAbove(RasterLayer(id, id).withProperties(*paint), above)
            above = id
        }
    }

    /** The map's regions are drawn again (redraw) when a region finishes or goes (Setup → Downloads),
     *  and when a kept cycle takes over at 0901Z with the app open (asked
     *  each minute; the data-cycles audit's 14): the tiles done in each
     *  kept region and the kept cycles begun, read as the effect's key. */
    @Composable
    fun rememberDownloadsKey(context: Context): List<List<String>> {
        val store = remember(context) { OfflineStore.of(context) }
        val kept by store.kept.collectAsStateWithLifecycle()
        val begun by produceState(begunCycles(store), store) {
            while (true) {
                delay(CHANGEOVER_LOOK_MS)
                value = begunCycles(store)
            }
        }
        return kept.map { it.done } + listOf(begun)
    }

    private fun begunCycles(store: OfflineStore): List<String> = store.kept.value.filter { it.begun() }.map { it.cycle }.distinct().sorted()

    /** `json`, the map's style for `template`, with the regions downloaded
     *  for the air drawn over the network's chart. */
    fun styled(context: Context, template: TileTemplate, json: String, terminal: Boolean): String =
        withDownloads(json, archives(OfflineStore.of(context), template.cycle, template.kind, template.scale, terminal))
}
