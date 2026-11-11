package app.wingtipmaps.android.map

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import org.maplibre.geojson.Feature
import org.maplibre.geojson.Point

/** A point feature's place, latitude first. */
internal fun pointOf(f: Feature): Pair<Double, Double>? = (f.geometry() as? Point)?.let { it.latitude() to it.longitude() }

/** A feature's fields as plain values (MapPick reads them): a whole
 *  number as a Long, so an id reads as the tiles wrote it. */
internal fun properties(f: Feature): Map<String, Any?> {
    val props: JsonObject = f.properties() ?: return emptyMap()
    return props.entrySet().associate { (k, v) -> k to value(v) }
}

private fun value(v: JsonElement?): Any? {
    if (v == null || v.isJsonNull || !v.isJsonPrimitive) return null
    val p = v.asJsonPrimitive
    return when {
        p.isBoolean -> p.asBoolean
        p.isNumber -> p.asDouble.let { d -> if (d == Math.floor(d) && !d.isInfinite() && kotlin.math.abs(d) < 1e15) d.toLong() else d }
        else -> p.asString
    }
}
