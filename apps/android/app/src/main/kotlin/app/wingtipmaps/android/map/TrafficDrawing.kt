package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.destination
import app.wingtipmaps.android.engine.generated.trafficFresh
import app.wingtipmaps.android.flight.Mark
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.math.roundToInt

/**
 * The traffic as the map draws it (MapStyle's traffic layers, the web's
 * TrafficGl): each airplane where it is now, carried on along its track
 * at its ground speed from its report, as ForeFlight carries internet
 * traffic between reports; its chevron turned to its track; its height
 * against own ship's under it, the engine's `traffic_marks` label, and
 * its callsign; amber where the engine says it is near; and a line out
 * ahead of it to where it will be in a minute (ForeFlight's TrafficTrend
 * vector). Past half a minute from its report it may have turned
 * anywhere, and is not drawn (the engine's `traffic_fresh`). Which are
 * drawn and where each is carried to (`destination`) are asked once a
 * step for every airplane. Plain GeoJSON, so the tests read it.
 */
object TrafficDrawing {
    /** One airplane heard, its mark, and when it was where it is given. */
    data class Target(val plane: TrafficAircraft, val mark: Mark?, val atMs: Long)

    /** The engine's rules the drawing asks, each a list at once; a test's
     *  own in their place. */
    interface Rules {
        /** Whether each report, so many seconds old, is still drawn
         *  (`traffic_fresh`). */
        fun fresh(seenS: List<Double>): Result<List<Boolean>>

        /** Where each course flown from its point reaches (`destination`). */
        fun along(steps: List<EngineContract.DestinationInputPointsItem>): Result<List<EngineContract.DestinationAnswerItem>>
    }

    object EngineRules : Rules {
        override fun fresh(seenS: List<Double>) = Engine.trafficFresh(0.0, seenS.map { EngineContract.TrafficFreshInputPlanesItem(it) })

        override fun along(steps: List<EngineContract.DestinationInputPointsItem>) = Engine.destination(steps)
    }

    /** How far ahead its line reaches, seconds (the web's TREND_S). */
    const val TREND_S = 60.0

    /** Where one airplane is now, and its trend line's end where it has a
     *  track and is moving. */
    private class Placed(val lat: Double, val lon: Double, val ahead: EngineContract.DestinationAnswerItem?)

    /** Each airplane carried on from its report (the web's carriedOn) and
     *  the end of its trend line, TREND_S further on the same course,
     *  both from one `destination` call for them all. The line's end is
     *  carried from the report rather than from where the airplane is
     *  now: over the two or three miles of a minute the two differ by
     *  under a few yards, and it keeps the step to one call. */
    private fun placed(live: List<Target>, nowMs: Long, rules: Rules): Result<List<Placed>> {
        val steps = ArrayList<EngineContract.DestinationInputPointsItem>()
        val firstStep = live.map { t ->
            val track = t.plane.trackDeg
            val speed = t.plane.speedKt
            if (track == null || speed == null || speed <= 0) return@map null
            val seconds = ((nowMs - t.atMs) / 1000.0).coerceAtLeast(0.0)
            steps += EngineContract.DestinationInputPointsItem(t.plane.lat, t.plane.lon, track, speed * seconds / 3600)
            steps += EngineContract.DestinationInputPointsItem(t.plane.lat, t.plane.lon, track, speed * (seconds + TREND_S) / 3600)
            steps.size - 2
        }
        val reached = if (steps.isEmpty()) Result.success(emptyList()) else rules.along(steps)
        return reached.mapCatching { got ->
            check(got.size == steps.size) { "destination answered ${got.size} points for ${steps.size}" }
            live.mapIndexed { i, t ->
                firstStep[i]?.let { k -> Placed(got[k].lat, got[k].lon, got[k + 1]) } ?: Placed(t.plane.lat, t.plane.lon, null)
            }
        }
    }

    /** The airplanes and their trend lines at `nowMs`, the tracked one
     *  (`tracked`, a hex) ringed and its height and callsign always shown.
     *  Where the engine cannot say which are fresh or carry them
     *  (Engine.rule has logged why), none is drawn: an airplane drawn
     *  where it was half a minute ago is drawn where it is not. */
    fun features(targets: List<Target>, tracked: String?, nowMs: Long, rules: Rules = EngineRules): Pair<JsonObject, JsonObject> {
        val drawn = rules.fresh(targets.map { (nowMs - it.atMs) / 1000.0 })
            .map { fresh -> targets.filterIndexed { i, _ -> fresh.getOrElse(i) { false } } }
            .mapCatching { live -> live.zip(placed(live, nowMs, rules).getOrThrow()) }
            .getOrDefault(emptyList())
        val points = collection {
            for ((t, at) in drawn) addJsonObject {
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
                point(at.lat, at.lon)
            }
        }
        val trends = collection {
            for ((t, at) in drawn) {
                val ahead = at.ahead ?: continue
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put("near", t.mark?.near == true) }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") {
                            addJsonArray { add(at.lon); add(at.lat) }
                            addJsonArray { add(ahead.lon); add(ahead.lat) }
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
