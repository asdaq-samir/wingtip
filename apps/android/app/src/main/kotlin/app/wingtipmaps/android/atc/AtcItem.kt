package app.wingtipmaps.android.atc

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * One thing a call to us asks, as the engine's atc_call reads it
 * (engine/crates/radio's atc, held to the shared fixture atcCalls.json):
 * the contract's own generated type, so a new kind or member reaches the
 * app with the engine rather than through a hand-kept copy.
 */
typealias AtcItem = EngineContract.AtcItem

private val reader = Json { ignoreUnknownKeys = true; explicitNulls = false }

/** Items read from raw JSON, for tests and fixtures; one of a shape this
 *  build cannot read is left out rather than shown wrong. */
fun atcItems(values: List<JsonElement>): List<AtcItem> =
    values.mapNotNull { runCatching { reader.decodeFromJsonElement(EngineContract.AtcItem.serializer(), it) }.getOrNull() }
