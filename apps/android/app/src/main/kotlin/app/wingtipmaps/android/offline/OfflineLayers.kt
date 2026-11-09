package app.wingtipmaps.android.offline

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.tiles.TileTemplate
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

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
    private const val PREFIX = "offline-"

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

    /** The map restyles when a region finishes or goes (Setup → Downloads):
     *  the tiles done in each kept region, read as the effect's key. */
    @Composable
    fun rememberDownloadsKey(context: Context): List<List<String>> {
        val kept by remember(context) { OfflineStore.of(context) }.kept.collectAsStateWithLifecycle()
        return kept.map { it.done }
    }

    /** `json`, the map's style for `template`, with the regions downloaded
     *  for the air drawn over the network's chart. */
    fun styled(context: Context, template: TileTemplate, json: String, terminal: Boolean): String =
        withDownloads(json, archives(OfflineStore.of(context), template.cycle, template.kind, template.scale, terminal))
}
