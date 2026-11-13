package app.wingtipmaps.android.map

import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

// The map's own drawings as GeoJSON for its sources (ChartMap): a line,
// longitude first as GeoJSON has it.

/** A line (the route, the path flown) as GeoJSON, whose
 *  coordinates are longitude first; no feature under two points. */
internal fun lineJson(points: List<Pair<Double, Double>>): String = buildJsonObject {
    put("type", "FeatureCollection")
    putJsonArray("features") {
        if (points.size >= 2) {
            addJsonObject {
                put("type", "Feature")
                putJsonObject("properties") {}
                putJsonObject("geometry") {
                    put("type", "LineString")
                    putJsonArray("coordinates") {
                        for ((lat, lon) in points) addJsonArray {
                            add(lon)
                            add(lat)
                        }
                    }
                }
            }
        }
    }
}.toString()
