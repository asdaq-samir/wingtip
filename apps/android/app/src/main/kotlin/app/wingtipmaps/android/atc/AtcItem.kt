package app.wingtipmaps.android.atc

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * One thing a call to us asks, as the engine's atc_call reads it
 * (engine/crates/radio's atc, held to the shared fixture atcCalls.json).
 * The contract leaves an item untyped (a union by `kind`), so its members
 * are read here by the engine's own keys, each optional, as the iOS
 * app's AtcItem does.
 */
@Serializable
data class AtcItem(
    val kind: String,
    val verb: String? = null,
    val limit: String? = null,
    val ft: Double? = null,
    val min: Double? = null,
    val turn: String? = null,
    @SerialName("by_deg") val byDeg: Double? = null,
    val deg: Double? = null,
    val said: String? = null,
    val places: List<String>? = null,
    @SerialName("as_filed") val asFiled: Boolean? = null,
    val direction: String? = null,
    val fix: String? = null,
    val on: String? = null,
    @SerialName("on_deg") val onDeg: Double? = null,
    val turns: String? = null,
    val efc: String? = null,
    val published: Boolean? = null,
    val facility: String? = null,
    /** As said, "125.35". */
    val mhz: String? = null,
    val code: String? = null,
    /** As said, "29.92". */
    val inhg: String? = null,
    val name: String? = null,
    val cleared: Boolean? = null,
    val runway: String? = null,
    val what: String? = null,
) {
    companion object {
        private val reader = Json { ignoreUnknownKeys = true; explicitNulls = false }

        /** The items of an atc_call answer; one of a shape this build
         *  cannot read is left out rather than shown wrong. */
        fun items(values: List<JsonElement>): List<AtcItem> =
            values.mapNotNull { runCatching { reader.decodeFromJsonElement(serializer(), it) }.getOrNull() }
    }
}
