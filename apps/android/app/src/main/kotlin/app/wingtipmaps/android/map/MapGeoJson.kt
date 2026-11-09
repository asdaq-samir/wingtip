package app.wingtipmaps.android.map

import app.wingtipmaps.android.flight.OwnShip
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

// The map's own drawings as GeoJSON for its sources (ChartMap): a line
// and the airplane, longitude first as GeoJSON has it.

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

/** The airplane as GeoJSON: one point, or none. */
internal fun pointJson(fix: OwnShip.Fix?): String = buildJsonObject {
    put("type", "FeatureCollection")
    putJsonArray("features") {
        if (fix != null) {
            addJsonObject {
                put("type", "Feature")
                putJsonObject("properties") {
                    // The track turns the airplane; with none it is the dot.
                    fix.trackDeg?.let { put("track", it) }
                }
                putJsonObject("geometry") {
                    put("type", "Point")
                    putJsonArray("coordinates") {
                        add(fix.lon)
                        add(fix.lat)
                    }
                }
            }
        }
    }
}.toString()
