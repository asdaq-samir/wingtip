package app.wingtipmaps.android.map

import android.content.Context
import app.wingtipmaps.android.api.OverlayTiles
import app.wingtipmaps.android.offline.OfflineLayers
import app.wingtipmaps.android.tiles.TileTemplate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/**
 * The map's whole style as MapLibre takes it: MapStyle's tree, its words
 * scaled and inked (MapLabels), the downloaded regions over the chart
 * (OfflineLayers) and the Dimmer on its marks (MapDim), each a pass over
 * the one tree, written out once, off the main thread. Three parses and
 * writes of the whole style on the main thread held the map's first frame
 * and each template, zoom or overlay change.
 */
internal object StyleTree {
    /** The style's layers as MapStyle wrote them (a relabel reads them) and the JSON set. */
    class Built(val written: List<JsonObject>, val json: String)

    suspend fun build(
        context: Context,
        template: TileTemplate,
        minZoom: Int,
        maxZoom: Int,
        overlays: OverlayTiles?,
        night: Boolean,
        layers: MapLayers,
        scale: Float,
    ): Built = withContext(Dispatchers.Default) {
        val root = MapStyle.styleJson(template, minZoom, maxZoom, overlays, night, layers)
        val styled = MapDim.style(OfflineLayers.styled(context, template, MapLabels.adjust(root, scale, night), layers.tac))
        Built(root["layers"]?.jsonArray?.map { it.jsonObject }.orEmpty(), styled.toString())
    }
}
