package app.wingtipmaps.android.flight

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The picked airplane's own glide ratio (feet forward for each foot down,
 * its POH's Section 3 "Maximum glide"), from the planner's profile of it
 * (/api/aircraft-profiles, data/aircraft's `glide.ratio`): what the
 * engine's glide_ring and glide_reaches are worked at. None with no
 * airplane or none in its profile, and then there is no ring and no field
 * "within a glide": no stock airplane's glide fills the gap (the owner,
 * 2026-11-09). The summary model leaves the glide out, so it is read off
 * the answer's JSON, once.
 */
object AirplaneGlide {
    @Volatile
    private var ratios: Map<String, Double>? = null

    /** The ratio of the profile `name`; null for "" or one without. */
    suspend fun ratio(name: String): Double? {
        if (name.isEmpty()) return null
        val known = ratios ?: load() ?: return null
        return known[name]
    }

    private suspend fun load(): Map<String, Double>? = try {
        read(Planner.fetch("/api/aircraft-profiles")).also { ratios = it }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        // Out of reach: asked again next time, and no ring meanwhile.
        null
    }

    /** Each profile's glide ratio from the answer's JSON, those with one. */
    fun read(body: String): Map<String, Double> = Gateway.json.parseToJsonElement(body).jsonObject["profiles"]?.jsonArray.orEmpty()
        .mapNotNull { p ->
            val o = p as? JsonObject ?: return@mapNotNull null
            val name = o["name"]?.jsonPrimitive?.content ?: return@mapNotNull null
            val ratio = (o["glide"] as? JsonObject)?.get("ratio")?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            name to ratio
        }.toMap()
}
