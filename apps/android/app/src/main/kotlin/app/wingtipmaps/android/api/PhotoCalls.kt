package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.AirportPhotos
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import okhttp3.Request

// A field's pictures for its card's carousel: the planner's list of them
// (its USGS aerial, every US field's, and its Wikipedia photo where there
// is a free one), and each picture's bytes as the gateway serves them.

/** A field's pictures (/api/airport/{ident}/photos). */
suspend fun Planner.airportPhotos(ident: String): AirportPhotos =
    Gateway.json.decodeFromString(fetch("/api/airport/$ident/photos"))

/** A picture's bytes by its address, or by the gateway path the planner
 *  gave ("/api/planner/airport-aerial/KOSH.jpg"); null where it has none. */
suspend fun Gateway.picture(address: String): ByteArray? = withContext(Dispatchers.IO) {
    val url = if (address.startsWith("/")) Config.gateway + address else address
    val request = Request.Builder().url(url).build()
    client.newCall(request).await().use { response -> if (response.isSuccessful) response.body.bytes() else null }
}
