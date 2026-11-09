package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The stock types' book figures, each profile whole as the planner sends
 * it (/api/aircraft-profiles, data/aircraft's handbook figures: cruise,
 * climb, ceiling, start and taxi fuel, glide), by name: the `book` the
 * engine's airplane_figures puts the pilot's own figures over. Asked once
 * a launch; out of reach, asked again next time, and meanwhile every
 * airplane has only the figures its pilot gave.
 */
object AirplaneBook {
    private val _profiles = MutableStateFlow<Map<String, JsonObject>>(emptyMap())
    val profiles: StateFlow<Map<String, JsonObject>> = _profiles.asStateFlow()

    suspend fun load() {
        if (_profiles.value.isNotEmpty()) return
        try {
            _profiles.value = read(Planner.fetch("/api/aircraft-profiles"))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Out of reach: no book meanwhile, never another airplane's.
        }
    }

    /** Each profile of the answer by its name. */
    fun read(body: String): Map<String, JsonObject> = Gateway.json.parseToJsonElement(body).jsonObject["profiles"]?.jsonArray.orEmpty()
        .mapNotNull { p -> (p as? JsonObject)?.let { o -> o["name"]?.jsonPrimitive?.content?.let { it to o } } }
        .toMap()

    /** The book of `type`, the planner's profile name or a designator
     *  that is one ("C172"); null for a type with none. */
    fun of(profiles: Map<String, JsonObject>, type: String): JsonObject? = profiles[type.lowercase()]
}
