package app.wingtipmaps.android.offline

import android.text.format.Formatter
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Charts
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.OfflineRegion
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer

/**
 * Downloads → Pick on the Map: the sectional sheets' coverage drawn over
 * the chart at a country's zooms, a sheet picked by a tap (the smallest
 * under the finger, as sheets overlap at their edges), or the map's view
 * kept as a box of its own; the pick and its size under the map.
 */
@Composable
fun DownloadsMap(model: DownloadsModel, sheets: List<OfflineRegion>, archives: List<String>) {
    val context = LocalContext.current
    val charts: Charts = hiltViewModel()
    val info by charts.info.collectAsStateWithLifecycle()
    val problem by model.problem.collectAsStateWithLifecycle()
    var picked by remember { mutableStateOf<OfflineRegion?>(null) }
    var asking by remember { mutableStateOf(false) }
    val listed by rememberUpdatedState(sheets)
    val view = remember {
        MapView(context).apply {
            onCreate(null)
            getMapAsync { map ->
                map.cameraPosition = CameraPosition.Builder().target(LatLng(39.5, -98.35)).zoom(3.0).build()
                map.addOnMapClickListener { at -> picked = sheetAt(at.latitude, at.longitude, listed); true }
            }
        }
    }
    DisposableEffect(view) {
        view.onStart()
        view.onResume()
        onDispose { view.onPause(); view.onStop(); view.onDestroy() }
    }
    val tiles = Charts.template(info, LocalDensity.current.density)?.pattern()
    LaunchedEffect(tiles, sheets) { view.getMapAsync { it.setStyle(Style.Builder().fromJson(pickerStyle(tiles, sheets))) } }
    LaunchedEffect(picked) {
        view.getMapAsync { map ->
            map.style?.getLayerAs<FillLayer>(PICKED)?.setFilter(Expression.eq(Expression.get("id"), Expression.literal(picked?.id ?: "")))
        }
    }
    Column {
        AndroidView(factory = { view }, modifier = Modifier.fillMaxWidth().height(420.dp))
        Column(Modifier.padding(WingtipSpace.Lg)) {
            val pick = picked
            if (pick != null) {
                val size = DownloadsModel.size(pick, archives)?.let { Formatter.formatShortFileSize(context, it) } ?: stringResource(R.string.offline_sizing)
                Text("${pick.name} · $size", style = MaterialTheme.typography.bodyLarge)
                Button(onClick = { asking = true }, enabled = archives.isNotEmpty()) { Text(stringResource(R.string.offline_download_size, pick.name)) }
                if (asking) ConfirmDownload(pick, size, { asking = false }) { model.download(pick.id) }
            } else {
                Text(stringResource(R.string.offline_tap_sheet), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedButton(onClick = {
                view.getMapAsync { map ->
                    val b = map.projection.visibleRegion.latLngBounds
                    model.downloadBox(b.longitudeWest, b.latitudeSouth, b.longitudeEast, b.latitudeNorth)
                }
            }, enabled = archives.isNotEmpty()) { Text(stringResource(R.string.offline_download_view)) }
            ProblemLine(problem)
        }
    }
}

private const val PICKED = "picked"

/** The smallest sheet whose box holds the point, as the iOS app's. */
fun sheetAt(lat: Double, lon: Double, sheets: List<OfflineRegion>): OfflineRegion? =
    sheets.mapNotNull { s ->
        s.boxes.firstOrNull { it.size == 4 && lon >= it[0] && lon <= it[2] && lat >= it[1] && lat <= it[3] }
            ?.let { s to (it[2] - it[0]) * (it[3] - it[1]) }
    }.minByOrNull { it.second }?.first

/** The picker's style: the chart at a country's zooms, and the sheets'
 *  boxes as GeoJSON in Maps' blue, the picked one filled. */
internal fun pickerStyle(tiles: String?, sheets: List<OfflineRegion>): String = buildJsonObject {
    put("version", 8)
    putJsonObject("sources") {
        if (tiles != null) putJsonObject("chart") {
            put("type", "raster")
            putJsonArray("tiles") { add(JsonPrimitive(tiles)) }
            put("tileSize", 256)
            put("minzoom", 3)
            put("maxzoom", 8)
        }
        putJsonObject("sheets") {
            put("type", "geojson")
            putJsonObject("data") {
                put("type", "FeatureCollection")
                putJsonArray("features") {
                    for (s in sheets) for (b in s.boxes.filter { it.size == 4 }) addJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") { put("id", s.id) }
                        putJsonObject("geometry") {
                            put("type", "Polygon")
                            putJsonArray("coordinates") {
                                addJsonArray {
                                    for ((x, y) in listOf(b[0] to b[1], b[2] to b[1], b[2] to b[3], b[0] to b[3], b[0] to b[1])) {
                                        addJsonArray { add(JsonPrimitive(x)); add(JsonPrimitive(y)) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    putJsonArray("layers") {
        if (tiles != null) addJsonObject { put("id", "chart"); put("type", "raster"); put("source", "chart") }
        addJsonObject {
            put("id", PICKED); put("type", "fill"); put("source", "sheets")
            putJsonArray("filter") { add(JsonPrimitive("==")); addJsonArray { add(JsonPrimitive("get")); add(JsonPrimitive("id")) }; add(JsonPrimitive("")) }
            putJsonObject("paint") { put("fill-color", WingtipColors.Chart.MAP_BLUE_HEX); put("fill-opacity", 0.25) }
        }
        addJsonObject {
            put("id", "sheets"); put("type", "line"); put("source", "sheets")
            putJsonObject("paint") { put("line-color", WingtipColors.Chart.MAP_BLUE_HEX); put("line-width", 1) }
        }
    }
}.toString()
