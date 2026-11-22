package app.wingtipmaps.android.share

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.routeFileRead
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.ByteArrayOutputStream
import java.io.InputStream

/**
 * A file another app hands Wingtip -- opened with it from Files or a mail
 * (View), shared to it (Send), or dropped on its window from another app
 * beside it -- read for what it is: a route, from Garmin's flight-plan
 * file (.fpl) or a GPX route, read by the engine's route_file_read; or a
 * PDF for the pilot's own documents (library/OwnShelf). A route opens as a
 * shared flight does, in its preview, never planned over the pilot's own
 * plan until Use This Plan (the security review of 2026-11-21, N3), as
 * the iPad's WindowHost opens a flight or a track dropped on it.
 */
object FlightFiles {
    /** What a file is, by its name or its type. */
    enum class Kind { ROUTE, PDF }

    /** The most of a route file read: a flight plan of a hundred points is
     *  some 30 KB; anything near this is not one. */
    const val MOST_BYTES = 2 * 1024 * 1024

    private val ROUTE_TYPES = setOf("application/gpx+xml", "application/xml", "text/xml")

    /** A file's kind by its name's extension first, then its type; none for
     *  a file Wingtip takes nothing from. */
    fun kind(name: String?, type: String?): Kind? {
        val ext = name?.substringAfterLast('.', "")?.lowercase()
        return when {
            ext == "fpl" || ext == "gpx" -> Kind.ROUTE
            ext == "pdf" || type == "application/pdf" -> Kind.PDF
            type in ROUTE_TYPES -> Kind.ROUTE
            else -> null
        }
    }

    /** A route read: the shared flight's link to preview, and how many of
     *  its points the file named without an identifier, left out. */
    data class Route(val link: Links.Shared, val dropped: Int)

    /** The engine's answer as a route, or its words for the pilot. Its
     *  ends always have an ident (the rule refuses a route that starts or
     *  ends at one with none); a point between with none -- a user
     *  waypoint, a GPX point named in words -- is left out and counted,
     *  where the web names it off the nearest fix. */
    fun route(answer: JsonElement): Result<Route> = runCatching {
        val o = answer as JsonObject
        o["error"]?.let { throw IllegalArgumentException(it.jsonPrimitive.content) }
        fun ident(point: JsonElement): String? = point.jsonObject["ident"]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
        val between = o.getValue("between").jsonArray.map(::ident)
        val plan = SharedPlan(
            dep = requireNotNull(ident(o.getValue("departure"))),
            dest = requireNotNull(ident(o.getValue("destination"))),
            stops = between.filterNotNull(),
        )
        Route(Links.Shared(plan, null), between.count { it == null })
    }

    /** The file's text read and asked of the engine, off the main thread. */
    suspend fun readRoute(resolver: ContentResolver, uri: Uri, ask: (String) -> Result<JsonElement> = { Engine.routeFileRead(it) }): Result<Route> =
        withContext(Dispatchers.IO) {
            runCatching {
                val bytes = resolver.openInputStream(uri)?.use { bounded(it) } ?: error("The file could not be opened.")
                require(bytes.size <= MOST_BYTES) { "This file is too large to be a flight plan." }
                bytes.decodeToString()
            }.mapCatching { text -> ask(text).getOrThrow() }.mapCatching { route(it).getOrThrow() }
        }

    /** At most one byte past MOST_BYTES of `input`, enough to tell it is
     *  too large without reading a film into memory. */
    internal fun bounded(input: InputStream): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(BUFFER)
        while (out.size() <= MOST_BYTES) {
            val n = input.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
        }
        return out.toByteArray()
    }

    private const val BUFFER = 8192

    /** A content address's own file name, where its provider says one. */
    fun name(resolver: ContentResolver, uri: Uri): String? = runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment
}
