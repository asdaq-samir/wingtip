package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.flight.Geo
import app.wingtipmaps.android.flight.Mark
import kotlin.math.roundToInt
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * The traffic as the map draws it (MapStyle's traffic layers, the web's
 * TrafficGl): each airplane where it is now, carried on along its track
 * at its ground speed from its report, as ForeFlight carries internet
 * traffic between reports; its chevron turned to its track; its height
 * against own ship's under it, the engine's `traffic_marks` label, and
 * its callsign; amber where the engine says it is near; and a line out
 * ahead of it to where it will be in a minute (ForeFlight's TrafficTrend
 * vector). Past CARRY_S from its report it may have turned anywhere, and
 * is not drawn. Plain GeoJSON, so the tests read it.
 */
object TrafficDrawing {
    /** One airplane heard, its mark, and when it was where it is given. */
    data class Target(val plane: TrafficAircraft, val mark: Mark?, val atMs: Long)

    /** How long after its report an airplane is carried on (the web's
     *  CARRY_S, the planner's wingtip.traffic STALE_S). */
    const val CARRY_S = 30.0
    /** How far ahead its line reaches, seconds (the web's TREND_S). */
    const val TREND_S = 60.0

    /** Where an airplane is `seconds` after its report (the web's carriedOn). */
    fun carriedOn(plane: TrafficAircraft, seconds: Double): Pair<Double, Double> {
        val track = plane.trackDeg
        val speed = plane.speedKt
        if (track == null || speed == null || seconds <= 0) return plane.lat to plane.lon
        return Geo.destination(plane.lat, plane.lon, track, speed * seconds / 3600)
    }

    /** The airplanes and their trend lines at `nowMs`, the tracked one
     *  (`tracked`, a hex) ringed and its height and callsign always shown. */
    fun features(targets: List<Target>, tracked: String?, nowMs: Long): Pair<JsonObject, JsonObject> {
        val live = targets.filter { (nowMs - it.atMs) / 1000.0 <= CARRY_S }
        val points = collection {
            for (t in live) addJsonObject {
                val (lat, lon) = carriedOn(t.plane, (nowMs - t.atMs) / 1000.0)
                val near = t.mark?.near == true
                val label = t.mark?.label.orEmpty()
                val callsign = (t.plane.callsign ?: t.plane.registration).orEmpty().trim()
                put("type", "Feature")
                putJsonObject("properties") {
                    put("hex", t.plane.hex)
                    put("icon", MapStyle.trafficIconId(near, t.plane.trackDeg != null))
                    // To five degrees, as the web's icons are made.
                    put("rotate", ((t.plane.trackDeg ?: 0.0) / 5).roundToInt() * 5)
                    put("near", near)
                    put("tracked", t.plane.hex.equals(tracked, ignoreCase = true))
                    put("label", label)
                    put("both", listOf(label, callsign).filter { it.isNotEmpty() }.joinToString("\n"))
                    put("name", t.plane.name)
                }
                point(lat, lon)
            }
        }
        val trends = collection {
            for (t in live) {
                val track = t.plane.trackDeg ?: continue
                if ((t.plane.speedKt ?: 0.0) <= 0) continue
                val seconds = (nowMs - t.atMs) / 1000.0
                val (lat, lon) = carriedOn(t.plane, seconds)
                val (aheadLat, aheadLon) = Geo.destination(lat, lon, track, t.plane.speedKt!! * TREND_S / 3600)
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put("near", t.mark?.near == true) }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") {
                            addJsonArray { add(lon); add(lat) }
                            addJsonArray { add(aheadLon); add(aheadLat) }
                        }
                    }
                }
            }
        }
        return points to trends
    }

    private fun collection(features: kotlinx.serialization.json.JsonArrayBuilder.() -> Unit) = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features", features)
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.point(lat: Double, lon: Double) {
        putJsonObject("geometry") {
            put("type", "Point")
            putJsonArray("coordinates") {
                add(lon)
                add(lat)
            }
        }
    }
}
